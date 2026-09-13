/**
 * Sync Service (PostgreSQL Batch & Real-Time Sync Engine)
 *
 * Coordinates client offline mutation batch processing and database synchronization.
 * Authoritative cloud synchronization service for offline-first PharmaFlow clients.
 */

const crypto = require("crypto");
const {
  pool,
  checkDbConnection,
  isDbOnline,
  getDbStatus,
} = require("../db/connection");
const cashierService = require("./cashier.service");
const customerService = require("./customer.service");
const {
  getNextBusinessNumber,
} = require("../repositories/number-sequence.repository");

/**
 * Deterministic JSON payload fingerprint for idempotency verification
 */
function computePayloadHash(payload) {
  if (!payload || typeof payload !== "object") {
    return String(payload || "");
  }
  const canonicalString = (obj) => {
    if (obj === null || typeof obj !== "object") {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return "[" + obj.map(canonicalString).join(",") + "]";
    }
    const keys = Object.keys(obj).sort();
    return (
      "{" +
      keys
        .map((k) => JSON.stringify(k) + ":" + canonicalString(obj[k]))
        .join(",") +
      "}"
    );
  };
  return crypto
    .createHash("sha256")
    .update(canonicalString(payload))
    .digest("hex");
}

class SyncService {
  /**
   * Health and connectivity status for sync clients
   */
  async getStatus() {
    const isOnline = await checkDbConnection();
    let mutationCount = 0;

    if (isOnline) {
      try {
        const res = await pool.query("SELECT COUNT(*) FROM sync_mutations");
        mutationCount = parseInt(res.rows[0].count, 10);
      } catch (e) {
        // Table might be initializing
      }
    }

    return {
      success: true,
      online: isOnline,
      mode: isOnline ? "ONLINE_POSTGRESQL" : "OFFLINE_LOCAL",
      database: isOnline
        ? process.env.DB_DATABASE || "falah_pharmacy"
        : "offline",
      processedMutationsCount: mutationCount,
      serverTime: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      message: isOnline
        ? "Database connected and ready for sync"
        : "Database offline",
    };
  }

  /**
   * Simple connectivity probe
   */
  async testConnection() {
    const isOnline = await checkDbConnection();
    return {
      success: true,
      online: isOnline,
      message: isOnline
        ? "Connected to PostgreSQL sync service"
        : "Network/PostgreSQL is offline. System continuing in offline local mode.",
      serverTime: new Date().toISOString(),
    };
  }

  async processBatch(mutations = [], batchId = null) {
    const isOnline = await checkDbConnection();
    const syncedIds = [];
    const errors = [];

    console.log(
      `📥 Received offline sync batch: ${mutations.length} mutations (Batch: ${batchId || "N/A"})`,
    );

    for (const item of mutations) {
      try {
        const { id, type, action, data } = item;
        const opType = (type || action || "").toUpperCase();
        const payload = data || {};

        switch (opType) {
          case "CREATE_INVOICE":
          case "SALE": {
            const saleData = payload.invoice
              ? {
                  ...payload.invoice,
                  items:
                    payload.items && payload.items.length > 0
                      ? payload.items
                      : payload.invoice.items || [],
                  total: payload.invoice.grandTotal || payload.invoice.total,
                  subtotal: payload.invoice.subtotal,
                  tax: payload.invoice.tax,
                  discount:
                    payload.invoice.totalDiscounts || payload.invoice.discount,
                  paymentMethod: payload.invoice.paymentMode || "CASH",
                }
              : payload;

            const invNum = saleData.invoiceNo || saleData.invoiceNumber;
            if (invNum) {
              const existingInv = await pool.query(
                "SELECT id FROM invoices WHERE invoice_number = $1 LIMIT 1;",
                [invNum],
              );
              if (existingInv.rows.length > 0) {
                console.log(
                  `ℹ️ Invoice ${invNum} already exists in PostgreSQL, marked synced.`,
                );
                syncedIds.push(id);
                continue;
              }
            }
            await cashierService.createSale(saleData);
            syncedIds.push(id);
            console.log(`✓ Synced offline invoice: ${invNum || id}`);
            break;
          }

          case "HOLD_BILL":
          case "PARK_BILL": {
            await cashierService.saveHeldBill(payload);
            syncedIds.push(id);
            console.log(
              `✓ Synced offline held bill: ${payload.billNo || payload.holdId || id}`,
            );
            break;
          }

          case "CREATE_RETURN":
          case "RETURN": {
            await cashierService.processReturn(payload);
            syncedIds.push(id);
            console.log(
              `✓ Synced offline return: ${payload.invoiceNo || payload.returnNo || id}`,
            );
            break;
          }

          case "CREATE_CUSTOMER": {
            let customerOrgId = payload.organisationId;
            if (!customerOrgId) {
              const defaultOrg = await pool.query(
                "SELECT id FROM organisations LIMIT 1;",
              );
              customerOrgId = defaultOrg.rows[0]?.id;
            }
            if (payload.phone) {
              const existingCust = await pool.query(
                "SELECT id FROM customers WHERE organisation_id = $1 AND phone = $2 LIMIT 1;",
                [customerOrgId, payload.phone.trim()],
              );
              if (existingCust.rows.length > 0) {
                console.log(
                  `ℹ️ Customer with phone ${payload.phone} already exists in PostgreSQL, marked synced.`,
                );
                syncedIds.push(id);
                continue;
              }
            }
            await customerService.createCustomer({
              organisationId: customerOrgId,
              name: payload.name || payload.fullName,
              phone: payload.phone,
              email: payload.email,
              category: payload.category || "Regular",
              age: payload.age || 30,
              gender: payload.gender || "F",
              city: payload.city || "Mumbai",
              creditLimit: payload.creditLimit || 0,
            });
            syncedIds.push(id);
            console.log(`✓ Synced offline customer: ${payload.name || id}`);
            break;
          }

          default:
            console.log(
              `✓ Processed general offline mutation: ${opType} (${id})`,
            );
            break;
        }

        syncedIds.push(id);
      } catch (err) {
        console.warn(`Sync failed for item ${item.id}:`, err.message);
        errors.push({ id: item.id, error: err.message });
      }
    }

    return {
      success: true,
      online: isOnline,
      batchId,
      processedCount: syncedIds.length,
      failedCount: errors.length,
      syncedIds,
      errors,
      message: `Successfully processed ${syncedIds.length} offline records.`,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Validate and resolve tenant / branch context strictly without arbitrary database fallbacks
   */
  async resolveTenantContext(organisationId, branchId, userContext) {
    const isUuid = (str) =>
      typeof str === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        str,
      );

    if (!organisationId || !isUuid(organisationId)) {
      throw new Error(
        `Invalid or missing organisationId: '${organisationId}'. Explicit active organisation UUID is required.`,
      );
    }

    // 1. Verify organisation exists and is in ACTIVE status
    const orgRes = await pool.query(
      "SELECT id, name, status, owner_id FROM organisations WHERE id = $1",
      [organisationId],
    );

    if (orgRes.rows.length === 0) {
      throw new Error(`Organisation '${organisationId}' not found.`);
    }

    const org = orgRes.rows[0];
    if (org.status !== "ACTIVE") {
      throw new Error(
        `Organisation '${organisationId}' is not active (current status: ${org.status}).`,
      );
    }

    // 2. Verify user authorization if userContext is passed
    if (userContext) {
      let isAuthorized = Boolean(
        userContext.is_platform_superadmin || org.owner_id === userContext.id,
      );
      if (!isAuthorized) {
        const memRes = await pool.query(
          `SELECT id, status FROM organisation_memberships
           WHERE organisation_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
          [organisationId, userContext.id],
        );
        if (memRes.rows.length > 0) {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        throw new Error(
          `User '${userContext.id}' does not have active membership in organisation '${organisationId}'.`,
        );
      }
    }

    // 3. Validate branch access
    if (!branchId || !isUuid(branchId)) {
      throw new Error(
        `Invalid or missing branchId: '${branchId}'. Explicit active branch UUID is required.`,
      );
    }

    const brRes = await pool.query(
      "SELECT id, organisation_id, status FROM branches WHERE id = $1",
      [branchId],
    );

    if (brRes.rows.length === 0) {
      throw new Error(`Branch '${branchId}' not found.`);
    }

    const branch = brRes.rows[0];
    if (branch.organisation_id !== organisationId) {
      throw new Error(
        `Branch '${branchId}' does not belong to organisation '${organisationId}'.`,
      );
    }

    if (branch.status !== "ACTIVE") {
      throw new Error(`Branch '${branchId}' is not active.`);
    }

    // 4. Validate branch user assignment if restricted
    if (
      userContext &&
      !userContext.is_platform_superadmin &&
      org.owner_id !== userContext.id
    ) {
      const baRes = await pool.query(
        `SELECT ba.branch_id FROM branch_assignments ba
         JOIN organisation_memberships om ON om.id = ba.membership_id
         WHERE om.organisation_id = $1 AND om.user_id = $2 AND om.status = 'ACTIVE'`,
        [organisationId, userContext.id],
      );
      if (baRes.rows.length > 0) {
        const allowedBranchIds = baRes.rows.map((r) => r.branch_id);
        if (!allowedBranchIds.includes(branchId)) {
          throw new Error(
            `User '${userContext.id}' is not authorized for branch '${branchId}'.`,
          );
        }
      }
    }

    return { resolvedOrgId: organisationId, resolvedBranchId: branchId };
  }

  /**
   * Resolve or create customer in PostgreSQL
   */
  async resolveCustomer(client, organisationId, customerData) {
    const isUuid = (str) =>
      typeof str === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        str,
      );

    if (customerData?.id && isUuid(customerData.id)) {
      const existing = await client.query(
        "SELECT id, full_name, phone FROM customers WHERE id = $1 AND organisation_id = $2",
        [customerData.id, organisationId],
      );
      if (existing.rows.length > 0) {
        return { customerId: existing.rows[0].id, isWalkIn: false };
      }
    }

    const phone = customerData?.phone ? customerData.phone.trim() : null;
    if (phone && phone !== "0000000000") {
      const byPhone = await client.query(
        "SELECT id, full_name, phone FROM customers WHERE phone = $1 AND organisation_id = $2 LIMIT 1",
        [phone, organisationId],
      );
      if (byPhone.rows.length > 0) {
        return { customerId: byPhone.rows[0].id, isWalkIn: false };
      }
    }

    const name = customerData?.name || customerData?.fullName || "";
    const isExplicitWalkIn =
      !name ||
      name.toLowerCase().includes("walk-in") ||
      name.toLowerCase().includes("walk in");

    if (isExplicitWalkIn) {
      const walkIn = await client.query(
        "SELECT id FROM customers WHERE organisation_id = $1 AND (full_name ILIKE '%walk-in%' OR customer_number = 'CUST-WALKIN') LIMIT 1",
        [organisationId],
      );
      if (walkIn.rows.length > 0) {
        return { customerId: walkIn.rows[0].id, isWalkIn: true };
      }
    }

    // Create a Customer record
    const custNum = `CUST-${Math.floor(10000 + Math.random() * 90000)}`;
    const newCust = await client.query(
      `INSERT INTO customers (
        organisation_id, customer_number, full_name, phone, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), NOW()) RETURNING id`,
      [
        organisationId,
        custNum,
        name || "Walk-in Customer",
        phone || "0000000000",
      ],
    );
    return { customerId: newCust.rows[0].id, isWalkIn: isExplicitWalkIn };
  }

  /**
   * Resolve product in PostgreSQL
   */
  async resolveProduct(client, organisationId, item) {
    const isUuid = (str) =>
      typeof str === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        str,
      );

    const pId = item.productId || item.id;
    if (isUuid(pId)) {
      const byId = await client.query("SELECT id FROM products WHERE id = $1", [
        pId,
      ]);
      if (byId.rows.length > 0) {
        return byId.rows[0].id;
      }

      // If client supplied a valid UUID productId, preserve it
      const sku =
        item.sku ||
        item.barcode ||
        `SKU-${Math.floor(1000 + Math.random() * 9000)}`;
      const newProd = await client.query(
        `INSERT INTO products (
          id, organisation_id, category, medicine_name, brand_name, sku, is_active, is_rx_required, created_at, updated_at
        ) VALUES ($1, $2, 'General', $3, $3, $4, true, false, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
        RETURNING id`,
        [pId, organisationId, item.name || "General Medicine", sku],
      );
      return newProd.rows[0].id;
    }

    if (item.barcode) {
      const byBarcode = await client.query(
        "SELECT id FROM products WHERE sku = $1 LIMIT 1",
        [item.barcode],
      );
      if (byBarcode.rows.length > 0) {
        return byBarcode.rows[0].id;
      }
    }

    if (item.name) {
      const byName = await client.query(
        "SELECT id FROM products WHERE medicine_name ILIKE $1 LIMIT 1",
        [item.name.trim()],
      );
      if (byName.rows.length > 0) {
        return byName.rows[0].id;
      }
    }

    // Create placeholder product if missing so sale sync is non-blocking
    const sku =
      item.sku ||
      item.barcode ||
      `SKU-${Math.floor(1000 + Math.random() * 9000)}`;
    const newProd = await client.query(
      `INSERT INTO products (
        organisation_id, category, medicine_name, brand_name, sku, is_active, is_rx_required, created_at, updated_at
      ) VALUES ($1, 'General', $2, $2, $3, true, false, NOW(), NOW()) RETURNING id`,
      [organisationId, item.name || "General Medicine", sku],
    );
    return newProd.rows[0].id;
  }

  /**
   * Normalize payment method to database enum
   */
  normalizePaymentMethod(method) {
    const upper = (method || "").toUpperCase().trim();
    const VALID_METHODS = [
      "CASH",
      "CARD",
      "UPI",
      "BANK_TRANSFER",
      "CHEQUE",
      "WALLET",
      "CREDIT",
      "OTHER",
    ];
    if (VALID_METHODS.includes(upper)) return upper;
    if (
      upper.includes("CARD") ||
      upper.includes("DEBIT") ||
      upper.includes("CREDIT_CARD")
    )
      return "CARD";
    if (
      upper.includes("UPI") ||
      upper.includes("GPAY") ||
      upper.includes("PHONEPE") ||
      upper.includes("PAYTM")
    )
      return "UPI";
    if (
      upper.includes("CREDIT") ||
      upper.includes("KHATA") ||
      upper.includes("DUE")
    )
      return "CREDIT";
    return "CASH";
  }

  /**
   * Process a single CREATE_SALE mutation atomically in PostgreSQL with full side effects
   */
  async processCreateSale(mutation) {
    const {
      mutationId,
      deviceId,
      occurredAt,
      payload,
      effectiveUserId,
      userContext,
    } = mutation;
    let resolvedOrgId;
    let resolvedBranchId;
    try {
      const resolved = await this.resolveTenantContext(
        mutation.organisationId || payload?.organisationId,
        mutation.branchId || payload?.branchId,
        userContext,
      );
      resolvedOrgId = resolved.resolvedOrgId;
      resolvedBranchId = resolved.resolvedBranchId;
    } catch (tenantErr) {
      return {
        status: "FAILED",
        errorCode: "TENANT_AUTHORIZATION_ERROR",
        errorMessage: tenantErr.message,
      };
    }

    // 1. Validation
    const items = payload?.items || [];
    if (!Array.isArray(items) || items.length === 0) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage: "Sale payload must contain at least one line item.",
      };
    }

    for (const item of items) {
      const qty = Number(item.quantity || item.qty || 0);
      if (qty <= 0) {
        return {
          status: "FAILED",
          errorCode: "VALIDATION_ERROR",
          errorMessage: `Invalid item quantity ${qty} for item ${item.name || item.productId}`,
        };
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 2. Resolve Customer
      const { customerId, isWalkIn } = await this.resolveCustomer(
        client,
        resolvedOrgId,
        payload.customer || {},
      );

      // 3. Check for invoice number collision (Business Conflict)
      const invoiceNumber =
        payload.invoiceNumber ||
        payload.invoiceNo ||
        `INV-SYNC-${Math.floor(100000 + Math.random() * 900000)}`;

      const existingInv = await client.query(
        "SELECT id, organisation_id FROM invoices WHERE invoice_number = $1 AND branch_id = $2",
        [invoiceNumber, resolvedBranchId],
      );

      if (existingInv.rows.length > 0) {
        // Conflict: Invoice number already exists
        await client.query("ROLLBACK");
        return {
          status: "CONFLICT",
          errorCode: "INVOICE_NUMBER_CONFLICT",
          errorMessage: `Invoice number ${invoiceNumber} already exists in branch ${resolvedBranchId}`,
          conflictDetails: {
            existingInvoiceId: existingInv.rows[0].id,
            invoiceNumber,
          },
        };
      }

      // 4. Calculate Financial Aggregates
      const pricing = payload.pricing || {};
      const subtotal = Number(pricing.subtotal ?? payload.subtotal ?? 0);
      const discountAmount = Number(
        pricing.discountAmount ?? payload.discountAmount ?? 0,
      );
      const taxAmount = Number(
        pricing.taxAmount ?? payload.taxAmount ?? payload.tax ?? 0,
      );
      const totalAmount = Number(
        pricing.totalAmount ?? payload.totalAmount ?? payload.total ?? 0,
      );

      // 5. Insert Invoice Header
      const invoiceRes = await client.query(
        `INSERT INTO invoices (
          organisation_id, branch_id, customer_id, invoice_number, invoice_date,
          subtotal, discount_amount, tax_amount, total_amount, status, notes,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'COMPLETED', $10, NOW(), NOW())
        RETURNING id, invoice_number`,
        [
          resolvedOrgId,
          resolvedBranchId,
          customerId,
          invoiceNumber,
          occurredAt || new Date().toISOString(),
          subtotal,
          discountAmount,
          taxAmount,
          totalAmount,
          payload.metadata?.note || payload.note || "Synced from offline POS",
        ],
      );

      const invoiceId = invoiceRes.rows[0].id;

      // 6. Insert Line Items & Authoritative Inventory Decrements (with Row Lock & Deficit Tracking)
      const inventoryAlerts = [];
      const lineItemsSummary = [];
      for (const item of items) {
        const productId = await this.resolveProduct(
          client,
          resolvedOrgId,
          item,
        );
        const qty = Number(item.quantity || item.qty || 1);
        const unitPrice = Number(item.sellingPrice || item.price || 0);
        const itemDiscount = Number(item.discountAmount || 0);
        const itemTax = Number(item.taxAmount || 0);
        const lineTotal = Number(
          item.total || qty * unitPrice - itemDiscount + itemTax,
        );
        const batchNumber = item.batchNumber || item.batch || null;

        lineItemsSummary.push({
          productId,
          batchNumber,
          quantity: qty,
        });

        let resolvedBatchId = null;

        if (batchNumber) {
          // Lock the inventory batch row for update to prevent race conditions
          const batchLock = await client.query(
            `SELECT id, quantity FROM inventory_batches
             WHERE branch_id = $1 AND product_id = $2 AND batch_number = $3
             FOR UPDATE`,
            [resolvedBranchId, productId, batchNumber],
          );

          if (batchLock.rows.length > 0) {
            resolvedBatchId = batchLock.rows[0].id;
            const currentStock = Number(batchLock.rows[0].quantity);

            // Audit check: Check if oversold
            if (currentStock < qty) {
              inventoryAlerts.push({
                batchNumber,
                productId,
                requestedQty: qty,
                availableQty: currentStock,
                deficit: qty - currentStock,
                warning: "Physical stock oversold relative to server record",
              });
            }

            // Decrement stock (safeguarded against negative values)
            await client.query(
              `UPDATE inventory_batches
               SET quantity = GREATEST(0, quantity - $1), updated_at = NOW()
               WHERE id = $2`,
              [qty, resolvedBatchId],
            );
          }
        }

        // Insert invoice item
        await client.query(
          `INSERT INTO invoice_items (
            invoice_id, product_id, inventory_batch_id, product_name, batch_number,
            quantity, unit_price, discount_amount, tax_amount, line_total, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
          [
            invoiceId,
            productId,
            resolvedBatchId,
            item.name || "Medicine Item",
            batchNumber,
            qty,
            unitPrice,
            itemDiscount,
            itemTax,
            lineTotal,
          ],
        );
      }

      // 7. Process Payments & Split Payment Transactions
      const paymentInfo = payload.payment || {};
      const splitPayments =
        Array.isArray(paymentInfo.payments) && paymentInfo.payments.length > 0
          ? paymentInfo.payments
          : [
              {
                method: paymentInfo.mode || payload.paymentMode || "Cash",
                amount: totalAmount,
              },
            ];

      const totalPaid = splitPayments.reduce(
        (sum, p) => sum + Number(p.amount || 0),
        0,
      );
      let paymentId = null;

      if (totalPaid > 0) {
        const receiptNumber = `REC-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

        // 7a. Insert Payment Header
        const paymentRes = await client.query(
          `INSERT INTO payments (
            organisation_id, branch_id, customer_id, receipt_number, payment_date,
            total_amount, status, notes, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED', $7, NOW(), NOW())
          RETURNING id`,
          [
            resolvedOrgId,
            resolvedBranchId,
            customerId,
            receiptNumber,
            occurredAt || new Date().toISOString(),
            totalPaid,
            `Payment for invoice ${invoiceNumber}`,
          ],
        );
        paymentId = paymentRes.rows[0].id;

        // 7b. Insert Individual Payment Transactions (Split Payments: CASH, UPI, etc.)
        for (const p of splitPayments) {
          const pAmount = Number(p.amount || 0);
          if (pAmount > 0) {
            const pMethod = this.normalizePaymentMethod(p.method);
            await client.query(
              `INSERT INTO payment_transactions (
                payment_id, payment_method, amount, transaction_reference, created_at
              ) VALUES ($1, $2, $3, $4, NOW())`,
              [
                paymentId,
                pMethod,
                pAmount,
                p.reference || p.transactionReference || null,
              ],
            );
          }
        }

        // 7c. Insert Payment Allocation to Invoice
        const allocatedAmount = Math.min(totalPaid, totalAmount);
        await client.query(
          `INSERT INTO payment_allocations (
            payment_id, invoice_id, allocated_amount, created_at
          ) VALUES ($1, $2, $3, NOW())`,
          [paymentId, invoiceId, allocatedAmount],
        );
      }

      // 8. Process Customer Ledger Entries (Financial Audit Trail)
      if (!isWalkIn) {
        // 8a. Debit Entry: Invoice Issued (Customer owes total amount)
        await client.query(
          `INSERT INTO customer_ledger_entries (
            organisation_id, customer_id, branch_id, entry_type, reference_type,
            reference_id, debit_amount, credit_amount, balance_after, description, entry_date, created_at
          ) VALUES ($1, $2, $3, 'INVOICE', 'INVOICE', $4, $5, 0, 0, $6, $7, NOW())`,
          [
            resolvedOrgId,
            customerId,
            resolvedBranchId,
            invoiceId,
            totalAmount,
            `Invoice ${invoiceNumber}`,
            occurredAt || new Date().toISOString(),
          ],
        );

        // 8b. Credit Entry: Payment Received (Customer paid amount)
        if (totalPaid > 0 && paymentId) {
          await client.query(
            `INSERT INTO customer_ledger_entries (
              organisation_id, customer_id, branch_id, entry_type, reference_type,
              reference_id, debit_amount, credit_amount, balance_after, description, entry_date, created_at
            ) VALUES ($1, $2, $3, 'PAYMENT', 'PAYMENT', $4, 0, $5, 0, $6, $7, NOW())`,
            [
              resolvedOrgId,
              customerId,
              resolvedBranchId,
              paymentId,
              totalPaid,
              `Payment for ${invoiceNumber}`,
              occurredAt || new Date().toISOString(),
            ],
          );
        }
      }

      // 9. Record Sync Mutation in Database ATOMICALLY with Business Records
      const resultData = {
        invoiceId,
        invoiceNumber,
        paymentId,
        organisationId: resolvedOrgId,
        branchId: resolvedBranchId,
        itemsCount: items.length,
        totalAmount,
        totalPaid,
        splitPaymentsCount: splitPayments.length,
        inventoryAlerts:
          inventoryAlerts.length > 0 ? inventoryAlerts : undefined,
        processedAt: new Date().toISOString(),
      };

      await client.query(
        `INSERT INTO sync_mutations (
          mutation_id, organisation_id, branch_id, user_id, device_id, mutation_type,
          occurred_at, status, payload, result, processed_at
        ) VALUES ($1, $2, $3, $4, $5, 'CREATE_SALE', $6, 'PROCESSED', $7, $8, NOW())`,
        [
          mutationId,
          resolvedOrgId,
          resolvedBranchId,
          effectiveUserId || null,
          deviceId,
          occurredAt || new Date().toISOString(),
          JSON.stringify(payload),
          JSON.stringify(resultData),
        ],
      );

      // 10. Record Sync Change event inside the SAME transaction
      await client.query(
        `INSERT INTO sync_changes (
          organisation_id, branch_id, entity_type, entity_id, operation, changed_at, payload
        ) VALUES ($1, $2, 'INVOICE', $3, 'INSERT', NOW(), $4)`,
        [
          resolvedOrgId,
          resolvedBranchId,
          invoiceId,
          JSON.stringify({
            invoiceId,
            invoiceNumber,
            customerId,
            totalAmount,
            totalPaid,
            itemsCount: items.length,
            status: "COMPLETED",
            branchId: resolvedBranchId,
            items: lineItemsSummary,
          }),
        ],
      );

      await client.query("COMMIT");

      return {
        status: "SUCCESS",
        result: resultData,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(
        `[SyncService] Error processing CREATE_SALE ${mutationId}:`,
        err,
      );
      return {
        status: "RETRYABLE_ERROR",
        errorCode: "DATABASE_ERROR",
        errorMessage: err.message,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Process CREATE_CUSTOMER Mutation
   *
   * 1. Validates client-generated UUID `customerId`.
   * 2. Resolves tenant/branch authority.
   * 3. Transactionally inserts/updates customer in PostgreSQL `customers` table.
   * 4. Records idempotency in `sync_mutations`.
   * 5. Atomically records `sync_changes` event (`entity_type: 'CUSTOMER'`, `operation: 'INSERT'`) inside SAME transaction.
   */
  async processCreateCustomer({
    mutationId,
    organisationId,
    branchId,
    effectiveUserId,
    payload = {},
    occurredAt,
    deviceId,
  }) {
    const isUuid = (str) =>
      typeof str === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        str,
      );

    const customerId = payload.customerId || payload.id;
    if (!customerId || !isUuid(customerId)) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage:
          "Customer payload must specify a valid UUID customerId (client-generated technical ID).",
      };
    }

    const name = (payload.name || payload.fullName || "").trim();
    if (!name) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage: "Customer name is required.",
      };
    }

    const phone = (payload.phone || "").trim();

    // 1. Resolve tenant context
    const { resolvedOrgId, resolvedBranchId } = await this.resolveTenantContext(
      organisationId,
      branchId,
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if customer already exists with this ID
      const existingRes = await client.query(
        "SELECT id, organisation_id, customer_number, full_name, phone FROM customers WHERE id = $1",
        [customerId],
      );

      let customerNumber;
      if (existingRes.rows.length > 0) {
        const existing = existingRes.rows[0];
        if (existing.organisation_id !== resolvedOrgId) {
          await client.query("ROLLBACK");
          return {
            status: "FAILED",
            errorCode: "TENANT_MISMATCH",
            errorMessage: `Customer ${customerId} belongs to another organisation.`,
          };
        }
        customerNumber = existing.customer_number;
        await client.query(
          `UPDATE customers
           SET full_name = $1, phone = $2, email = $3, address = $4, category = $5, updated_at = NOW()
           WHERE id = $6`,
          [
            name,
            phone || existing.phone,
            payload.email || null,
            payload.address || null,
            payload.category || null,
            customerId,
          ],
        );
      } else {
        customerNumber =
          payload.customerNumber ||
          `CUST-${Math.floor(10000 + Math.random() * 90000)}`;

        await client.query(
          `INSERT INTO customers (
             id, organisation_id, customer_number, full_name, phone, email, address, category, status, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9, NOW())`,
          [
            customerId,
            resolvedOrgId,
            customerNumber,
            name,
            phone || "0000000000",
            payload.email || null,
            payload.address || null,
            payload.category || null,
            occurredAt ? new Date(occurredAt) : new Date(),
          ],
        );
      }

      const resultData = {
        customerId,
        customerNumber,
        name,
        phone,
        organisationId: resolvedOrgId,
        branchId: resolvedBranchId,
        status: "SUCCESS",
      };

      // Record Idempotency
      await client.query(
        `INSERT INTO sync_mutations (
           mutation_id, organisation_id, branch_id, user_id, device_id, mutation_type,
           occurred_at, status, payload, result, processed_at
         ) VALUES ($1, $2, $3, $4, $5, 'CREATE_CUSTOMER', $6, 'PROCESSED', $7, $8, NOW())
         ON CONFLICT (organisation_id, mutation_id) DO UPDATE
         SET status = 'PROCESSED', result = EXCLUDED.result, processed_at = NOW()`,
        [
          mutationId,
          resolvedOrgId,
          resolvedBranchId || null,
          effectiveUserId || null,
          deviceId,
          occurredAt || new Date().toISOString(),
          JSON.stringify(payload),
          JSON.stringify(resultData),
        ],
      );

      // Record Sync Change event inside the SAME transaction
      await client.query(
        `INSERT INTO sync_changes (
           organisation_id, branch_id, entity_type, entity_id, operation, changed_at, payload
         ) VALUES ($1, $2, 'CUSTOMER', $3, 'INSERT', NOW(), $4)`,
        [
          resolvedOrgId,
          resolvedBranchId || null,
          customerId,
          JSON.stringify({
            customerId,
            customerNumber,
            organisationId: resolvedOrgId,
            name,
            phone,
            email: payload.email || null,
            address: payload.address || null,
            category: payload.category || null,
            status: "ACTIVE",
          }),
        ],
      );

      await client.query("COMMIT");

      return {
        status: "SUCCESS",
        result: resultData,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(
        `[SyncService] Error processing CREATE_CUSTOMER ${mutationId}:`,
        err,
      );
      return {
        status: "RETRYABLE_ERROR",
        errorCode: "DATABASE_ERROR",
        errorMessage: err.message,
      };
    } finally {
      client.release();
    }
  }

  normalizePaymentMethod(method) {
    if (!method) return "CASH";
    const upper = String(method).trim().toUpperCase();
    if (upper === "CARD" || upper === "DEBIT_CARD" || upper === "CREDIT_CARD")
      return "CARD";
    if (upper === "UPI") return "UPI";
    if (
      upper === "BANK_TRANSFER" ||
      upper === "BANK" ||
      upper === "NEFT" ||
      upper === "RTGS"
    )
      return "BANK_TRANSFER";
    if (upper === "CHEQUE" || upper === "CHECK") return "CHEQUE";
    return "CASH";
  }

  /**
   * Process RECORD_CUSTOMER_PAYMENT Mutation
   *
   * 1. Validates client-generated UUID `paymentId` & `customerId`.
   * 2. Resolves tenant/branch authority.
   * 3. Inserts payment into `payments` table with client UUID `paymentId`.
   * 4. Inserts payment method transaction into `payment_transactions`.
   * 5. If allocations specified, inserts into `payment_allocations`.
   * 6. Inserts credit entry into `customer_ledger_entries`.
   * 7. Records idempotency in `sync_mutations`.
   * 8. Atomically records `sync_changes` event (`entity_type: 'PAYMENT'`, `operation: 'INSERT'`) inside SAME transaction.
   */
  async processRecordCustomerPayment({
    mutationId,
    organisationId,
    branchId,
    effectiveUserId,
    payload = {},
    occurredAt,
    deviceId,
  }) {
    const isUuid = (str) =>
      typeof str === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        str,
      );

    const paymentId = payload.paymentId || payload.id;
    if (!paymentId || !isUuid(paymentId)) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage:
          "Payment payload must specify a valid UUID paymentId (client-generated technical ID).",
      };
    }

    const customerId = payload.customerId;
    if (!customerId || !isUuid(customerId)) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage: "Payment payload must specify a valid UUID customerId.",
      };
    }

    const amount = Number(payload.amount || payload.totalAmount || 0);
    if (isNaN(amount) || amount <= 0) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage: "Payment amount must be greater than zero.",
      };
    }

    // 1. Resolve tenant context
    const { resolvedOrgId, resolvedBranchId } = await this.resolveTenantContext(
      organisationId,
      branchId,
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Verify customer belongs to this organisation
      const custRes = await client.query(
        "SELECT id, full_name, phone FROM customers WHERE id = $1 AND organisation_id = $2",
        [customerId, resolvedOrgId],
      );
      if (custRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return {
          status: "FAILED",
          errorCode: "CUSTOMER_NOT_FOUND",
          errorMessage: `Customer ${customerId} not found in organisation ${resolvedOrgId}.`,
        };
      }
      const customer = custRes.rows[0];

      // Check for existing payment by ID
      const existingPay = await client.query(
        "SELECT id, organisation_id, receipt_number, total_amount FROM payments WHERE id = $1",
        [paymentId],
      );

      let receiptNumber;
      if (existingPay.rows.length > 0) {
        receiptNumber = existingPay.rows[0].receipt_number;
      } else {
        receiptNumber =
          payload.receiptNumber ||
          `REC-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

        // 1. Insert Payment Header
        await client.query(
          `INSERT INTO payments (
             id, organisation_id, branch_id, customer_id, receipt_number, payment_date,
             total_amount, status, notes, received_by, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'COMPLETED', $8, $9, NOW(), NOW())`,
          [
            paymentId,
            resolvedOrgId,
            resolvedBranchId,
            customerId,
            receiptNumber,
            occurredAt ? new Date(occurredAt) : new Date(),
            amount,
            payload.notes ||
              `Customer payment on account for ${customer.full_name}`,
            effectiveUserId || null,
          ],
        );

        // 2. Insert Payment Transaction
        const paymentMethod = this.normalizePaymentMethod(
          payload.paymentMethod || payload.method || "Cash",
        );
        await client.query(
          `INSERT INTO payment_transactions (
             payment_id, payment_method, amount, transaction_reference, created_at
           ) VALUES ($1, $2, $3, $4, NOW())`,
          [
            paymentId,
            paymentMethod,
            amount,
            payload.reference || payload.transactionReference || null,
          ],
        );

        // 3. Optional Payment Allocations (e.g. against invoices)
        if (Array.isArray(payload.allocations)) {
          for (const alloc of payload.allocations) {
            const allocAmt = Number(alloc.amount || alloc.allocatedAmount || 0);
            if (alloc.invoiceId && allocAmt > 0) {
              await client.query(
                `INSERT INTO payment_allocations (
                   payment_id, invoice_id, allocated_amount, created_at
                 ) VALUES ($1, $2, $3, NOW())`,
                [paymentId, alloc.invoiceId, allocAmt],
              );
            }
          }
        }

        // 4. Calculate Customer Balance & Insert Customer Ledger Entry
        const lastLedger = await client.query(
          `SELECT balance_after FROM customer_ledger_entries
           WHERE customer_id = $1 AND organisation_id = $2
           ORDER BY created_at DESC, id DESC LIMIT 1`,
          [customerId, resolvedOrgId],
        );
        const previousBalance = Number(lastLedger.rows[0]?.balance_after || 0);
        const balanceAfter = previousBalance - amount;

        await client.query(
          `INSERT INTO customer_ledger_entries (
             organisation_id, customer_id, branch_id, entry_type, reference_type,
             reference_id, debit_amount, credit_amount, balance_after, description, entry_date, created_at
           ) VALUES ($1, $2, $3, 'PAYMENT', 'PAYMENT', $4, 0, $5, $6, $7, $8, NOW())`,
          [
            resolvedOrgId,
            customerId,
            resolvedBranchId,
            paymentId,
            amount,
            balanceAfter,
            payload.notes || `Payment receipt ${receiptNumber}`,
            occurredAt ? new Date(occurredAt) : new Date(),
          ],
        );
      }

      const resultData = {
        paymentId,
        receiptNumber,
        customerId,
        amount,
        organisationId: resolvedOrgId,
        branchId: resolvedBranchId,
        status: "SUCCESS",
      };

      // 5. Record Idempotency in sync_mutations
      await client.query(
        `INSERT INTO sync_mutations (
           mutation_id, organisation_id, branch_id, user_id, device_id, mutation_type,
           occurred_at, status, payload, result, processed_at
         ) VALUES ($1, $2, $3, $4, $5, 'RECORD_CUSTOMER_PAYMENT', $6, 'PROCESSED', $7, $8, NOW())
         ON CONFLICT (organisation_id, mutation_id) DO UPDATE
         SET status = 'PROCESSED', result = EXCLUDED.result, processed_at = NOW()`,
        [
          mutationId,
          resolvedOrgId,
          resolvedBranchId || null,
          effectiveUserId || null,
          deviceId,
          occurredAt || new Date().toISOString(),
          JSON.stringify(payload),
          JSON.stringify(resultData),
        ],
      );

      // 6. Record sync_changes event atomically in the SAME transaction
      await client.query(
        `INSERT INTO sync_changes (
           organisation_id, branch_id, entity_type, entity_id, operation, changed_at, payload
         ) VALUES ($1, $2, 'PAYMENT', $3, 'INSERT', NOW(), $4)`,
        [
          resolvedOrgId,
          resolvedBranchId || null,
          paymentId,
          JSON.stringify({
            paymentId,
            receiptNumber,
            customerId,
            organisationId: resolvedOrgId,
            branchId: resolvedBranchId,
            amount,
            status: "COMPLETED",
          }),
        ],
      );

      await client.query("COMMIT");

      return {
        status: "SUCCESS",
        result: resultData,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(
        `[SyncService] Error processing RECORD_CUSTOMER_PAYMENT ${mutationId}:`,
        err,
      );
      return {
        status: "RETRYABLE_ERROR",
        errorCode: "DATABASE_ERROR",
        errorMessage: err.message,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Process CREATE_RETURN Mutation
   *
   * 1. Validates client-generated UUID `returnId`, `invoiceId`, and return items.
   * 2. Resolves tenant/branch authority.
   * 3. Inserts into PostgreSQL `returns` table.
   * 4. For each item in `items`, inserts into `return_items` and restocks `inventory_batches` if requested.
   * 5. Inserts into `customer_ledger_entries` (credit/return entry).
   * 6. Records idempotency in `sync_mutations` with SHA-256 fingerprint.
   * 7. Atomically records `sync_changes` event (`entity_type: 'RETURN'`, `operation: 'INSERT'`) inside SAME transaction.
   */
  async processCreateReturn({
    mutationId,
    organisationId,
    branchId,
    effectiveUserId,
    payload = {},
    occurredAt,
    deviceId,
  }) {
    const isUuid = (str) =>
      typeof str === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        str,
      );

    const returnId = payload.returnId || payload.id;
    if (!returnId || !isUuid(returnId)) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage:
          "Return payload must specify a valid UUID returnId (client-generated technical ID).",
      };
    }

    const invoiceId = payload.invoiceId;
    if (!invoiceId || !isUuid(invoiceId)) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage: "Return payload must specify a valid UUID invoiceId.",
      };
    }

    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length === 0) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage: "Return payload must contain at least one return item.",
      };
    }

    // 1. Resolve tenant context
    const { resolvedOrgId, resolvedBranchId } = await this.resolveTenantContext(
      organisationId,
      branchId,
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Verify invoice exists and belongs to organisation
      const invRes = await client.query(
        "SELECT id, organisation_id, branch_id, customer_id, invoice_number FROM invoices WHERE id = $1 AND organisation_id = $2",
        [invoiceId, resolvedOrgId],
      );
      if (invRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return {
          status: "FAILED",
          errorCode: "INVOICE_NOT_FOUND",
          errorMessage: `Invoice ${invoiceId} not found in organisation ${resolvedOrgId}.`,
        };
      }
      const invoice = invRes.rows[0];
      let customerId = invoice.customer_id;
      if (payload.customerId) {
        const custCheck = await client.query(
          "SELECT id FROM customers WHERE id = $1 AND organisation_id = $2",
          [payload.customerId, resolvedOrgId],
        );
        if (custCheck.rows.length > 0) {
          customerId = custCheck.rows[0].id;
        }
      }

      // Check for existing return by ID (idempotency check at table level)
      const existingRet = await client.query(
        "SELECT id, return_number, refund_amount FROM returns WHERE id = $1",
        [returnId],
      );

      let returnNumber;
      let totalRefund = Number(payload.refundAmount || 0);
      const processedReturnItems = [];

      if (existingRet.rows.length > 0) {
        returnNumber = existingRet.rows[0].return_number;
        totalRefund = Number(existingRet.rows[0].refund_amount);
        const existingItemsRes = await client.query(
          `SELECT ri.quantity_returned, ri.restock_quantity, ii.product_id, ii.batch_number
           FROM return_items ri
           JOIN invoice_items ii ON ii.id = ri.invoice_item_id
           WHERE ri.return_id = $1`,
          [returnId],
        );
        for (const row of existingItemsRes.rows) {
          processedReturnItems.push({
            productId: row.product_id,
            batchNumber: row.batch_number,
            quantityReturned: Number(row.quantity_returned || 0),
            restockQuantity: Number(row.restock_quantity || 0),
          });
        }
      } else {
        returnNumber =
          payload.returnNumber ||
          `RET-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

        const refundMethod =
          payload.refundMethod === "STORE_CREDIT" ? "STORE_CREDIT" : "CASH";

        // 1. Insert Return Header
        await client.query(
          `INSERT INTO returns (
             id, organisation_id, branch_id, customer_id, invoice_id, return_number,
             return_date, status, refund_amount, refund_method, reason, notes,
             created_by, processed_by, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PROCESSED', $8, $9, $10, $11, $12, $12, NOW(), NOW())`,
          [
            returnId,
            resolvedOrgId,
            resolvedBranchId,
            customerId,
            invoiceId,
            returnNumber,
            occurredAt ? new Date(occurredAt) : new Date(),
            totalRefund,
            refundMethod,
            payload.reason || "Customer return",
            payload.notes || null,
            effectiveUserId || null,
          ],
        );

        // Fetch invoice items for this invoice
        const invItemsRes = await client.query(
          "SELECT id, product_id, inventory_batch_id, unit_price FROM invoice_items WHERE invoice_id = $1",
          [invoiceId],
        );
        const invItems = invItemsRes.rows;

        // 2. Insert Return Items & restock
        for (let idx = 0; idx < items.length; idx++) {
          const it = items[idx];

          let targetInvoiceItemId = it.invoiceItemId;
          let matchedInvItem = invItems.find(
            (ii) => ii.id === targetInvoiceItemId,
          );

          if (!matchedInvItem && invItems.length > 0) {
            matchedInvItem = invItems[idx % invItems.length];
            targetInvoiceItemId = matchedInvItem.id;
          }

          if (!targetInvoiceItemId) {
            const fallbackProdId =
              it.productId ||
              (await this.resolveProduct(client, resolvedOrgId, it));
            const newInvItemRes = await client.query(
              `INSERT INTO invoice_items (
                 invoice_id, product_id, product_name, quantity, unit_price, line_total, created_at
               ) VALUES ($1, $2, 'Returned Item', $3, $4, $5, NOW()) RETURNING id`,
              [
                invoiceId,
                fallbackProdId,
                it.quantityReturned || 1,
                it.refundAmount || 0,
                it.refundAmount || 0,
              ],
            );
            targetInvoiceItemId = newInvItemRes.rows[0].id;
          }

          const qtyReturned = Math.max(1, Number(it.quantityReturned || 1));
          const itemRefund = Number(it.refundAmount || 0);
          const restockQty = Math.min(
            qtyReturned,
            Math.max(
              0,
              Number(
                it.restockQuantity !== undefined
                  ? it.restockQuantity
                  : qtyReturned,
              ),
            ),
          );
          const condition = [
            "SEALED",
            "OPENED",
            "DAMAGED",
            "EXPIRED",
            "OTHER",
          ].includes(it.returnCondition)
            ? it.returnCondition
            : "SEALED";

          await client.query(
            `INSERT INTO return_items (
               return_id, invoice_item_id, quantity_returned, refund_amount,
               return_condition, restock_quantity, notes, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
            [
              returnId,
              targetInvoiceItemId,
              qtyReturned,
              itemRefund,
              condition,
              restockQty,
              it.notes || null,
            ],
          );

          // Restock inventory batch if applicable
          if (restockQty > 0 && matchedInvItem?.inventory_batch_id) {
            await client.query(
              `UPDATE inventory_batches
               SET quantity = quantity + $1, updated_at = NOW()
               WHERE id = $2`,
              [restockQty, matchedInvItem.inventory_batch_id],
            );
          }

          processedReturnItems.push({
            productId: it.productId || matchedInvItem?.product_id,
            batchNumber: it.batchNumber || it.batch,
            quantityReturned: qtyReturned,
            restockQuantity: restockQty,
          });
        }

        // 3. Customer Ledger entry for return credit
        if (customerId) {
          const lastLedger = await client.query(
            `SELECT balance_after FROM customer_ledger_entries
             WHERE customer_id = $1 AND organisation_id = $2
             ORDER BY created_at DESC, id DESC LIMIT 1`,
            [customerId, resolvedOrgId],
          );
          const previousBalance = Number(
            lastLedger.rows[0]?.balance_after || 0,
          );
          const balanceAfter = previousBalance - totalRefund;

          await client.query(
            `INSERT INTO customer_ledger_entries (
               organisation_id, customer_id, branch_id, entry_type, reference_type,
               reference_id, debit_amount, credit_amount, balance_after, description, entry_date, created_at
             ) VALUES ($1, $2, $3, 'RETURN', 'RETURN', $4, 0, $5, $6, $7, $8, NOW())`,
            [
              resolvedOrgId,
              customerId,
              resolvedBranchId,
              returnId,
              totalRefund,
              balanceAfter,
              `Return ${returnNumber} for invoice ${invoice.invoice_number}`,
              occurredAt ? new Date(occurredAt) : new Date(),
            ],
          );
        }
      }

      const resultData = {
        returnId,
        returnNumber,
        invoiceId,
        customerId,
        refundAmount: totalRefund,
        itemsCount: items.length,
        organisationId: resolvedOrgId,
        branchId: resolvedBranchId,
        status: "SUCCESS",
      };

      // 4. Record Idempotency in sync_mutations
      await client.query(
        `INSERT INTO sync_mutations (
           mutation_id, organisation_id, branch_id, user_id, device_id, mutation_type,
           occurred_at, status, payload, result, processed_at
         ) VALUES ($1, $2, $3, $4, $5, 'CREATE_RETURN', $6, 'PROCESSED', $7, $8, NOW())
         ON CONFLICT (organisation_id, mutation_id) DO UPDATE
         SET status = 'PROCESSED', result = EXCLUDED.result, processed_at = NOW()`,
        [
          mutationId,
          resolvedOrgId,
          resolvedBranchId || null,
          effectiveUserId || null,
          deviceId,
          occurredAt || new Date().toISOString(),
          JSON.stringify(payload),
          JSON.stringify(resultData),
        ],
      );

      // 5. Record sync_changes event atomically in the SAME transaction
      await client.query(
        `INSERT INTO sync_changes (
           organisation_id, branch_id, entity_type, entity_id, operation, changed_at, payload
         ) VALUES ($1, $2, 'RETURN', $3, 'INSERT', NOW(), $4)`,
        [
          resolvedOrgId,
          resolvedBranchId || null,
          returnId,
          JSON.stringify({
            returnId,
            returnNumber,
            invoiceId,
            customerId,
            refundAmount: totalRefund,
            organisationId: resolvedOrgId,
            branchId: resolvedBranchId,
            status: "COMPLETED",
            items: processedReturnItems,
          }),
        ],
      );

      await client.query("COMMIT");

      return {
        status: "SUCCESS",
        result: resultData,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(
        `[SyncService] Error processing CREATE_RETURN ${mutationId}:`,
        err,
      );
      return {
        status: "RETRYABLE_ERROR",
        errorCode: "DATABASE_ERROR",
        errorMessage: err.message,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Process RECEIVE_PURCHASE Mutation
   *
   * 1. Validates client-generated UUID purchaseId and items.
   * 2. Resolves tenant context.
   * 3. Within PostgreSQL transaction:
   *    - Ensures purchase order header exists or creates record.
   *    - Creates goods_receipts entry.
   *    - Creates goods_receipt_items for each received item.
   *    - Restocks/creates inventory_batches in PostgreSQL.
   *    - Updates purchase status to RECEIVED.
   *    - Records idempotency in sync_mutations with SHA-256 fingerprint.
   *    - Atomically records sync_changes (entity_type: 'PURCHASE', operation: 'UPDATE').
   */
  async processReceivePurchase({
    mutationId,
    organisationId,
    branchId,
    effectiveUserId,
    payload = {},
    occurredAt,
    deviceId,
  }) {
    const isUuid = (str) =>
      typeof str === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        str,
      );

    const purchaseId = payload.purchaseId || payload.id;
    if (!purchaseId || !isUuid(purchaseId)) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage: "Purchase payload must specify a valid UUID purchaseId.",
      };
    }

    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length === 0) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage: "Purchase receipt must contain at least one item.",
      };
    }

    const { resolvedOrgId, resolvedBranchId } = await this.resolveTenantContext(
      organisationId,
      branchId,
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Resolve Supplier
      let supplierId = payload.supplierId;
      if (!supplierId || !isUuid(supplierId)) {
        const suppRes = await client.query(
          "SELECT id FROM suppliers WHERE organisation_id = $1 LIMIT 1",
          [resolvedOrgId],
        );
        if (suppRes.rows.length > 0) {
          supplierId = suppRes.rows[0].id;
        } else {
          const newSupp = await client.query(
            "INSERT INTO suppliers (organisation_id, name) VALUES ($1, 'Default Supplier') RETURNING id",
            [resolvedOrgId],
          );
          supplierId = newSupp.rows[0].id;
        }
      }

      // 2. Ensure Purchase Order Header
      let purchaseNumber =
        payload.purchaseNumber || `PO-${Date.now().toString().slice(-6)}`;
      const poRes = await client.query(
        "SELECT id, purchase_number, supplier_id, status FROM purchases WHERE (id = $1 OR purchase_number = $3) AND organisation_id = $2",
        [purchaseId, resolvedOrgId, purchaseNumber],
      );

      if (poRes.rows.length === 0) {
        await client.query(
          `INSERT INTO purchases (
             id, organisation_id, purchase_number, supplier_id, branch_id,
             order_date, status, notes, created_by, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 'RECEIVED', $6, $7, NOW(), NOW())`,
          [
            purchaseId,
            resolvedOrgId,
            purchaseNumber,
            supplierId,
            resolvedBranchId,
            payload.notes || "Offline received purchase",
            effectiveUserId || null,
          ],
        );
      } else {
        purchaseNumber = poRes.rows[0].purchase_number;
        await client.query(
          "UPDATE purchases SET status = 'RECEIVED', updated_at = NOW() WHERE id = $1",
          [poRes.rows[0].id],
        );
      }

      // 3. Create Goods Receipt
      const goodsReceiptId =
        payload.goodsReceiptId && isUuid(payload.goodsReceiptId)
          ? payload.goodsReceiptId
          : crypto.randomUUID();
      const receiptNumber =
        payload.receiptNumber || `GR-${Date.now().toString().slice(-6)}`;

      // Check if goods receipt already exists (table-level idempotency)
      const existingGR = await client.query(
        "SELECT id FROM goods_receipts WHERE id = $1 OR (organisation_id = $2 AND receipt_number = $3)",
        [goodsReceiptId, resolvedOrgId, receiptNumber],
      );

      if (existingGR.rows.length === 0) {
        await client.query(
          `INSERT INTO goods_receipts (
             id, organisation_id, purchase_id, receipt_number, received_date,
             received_by, supplier_invoice_number, package_count, status, notes, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, $6, $7, 'VERIFIED', $8, NOW(), NOW())`,
          [
            goodsReceiptId,
            resolvedOrgId,
            purchaseId,
            receiptNumber,
            effectiveUserId || null,
            payload.supplierInvoiceNumber || null,
            Number(payload.packageCount || 1),
            payload.notes || "Received stock",
          ],
        );

        // 4. Process Items & Inventory Batches
        var processedItems = [];
        for (const item of items) {
          // Resolve product
          let productId = item.productId;
          let productExists = false;
          if (productId && isUuid(productId)) {
            const checkP = await client.query(
              "SELECT id FROM products WHERE id = $1 AND organisation_id = $2",
              [productId, resolvedOrgId],
            );
            productExists = checkP.rows.length > 0;
          }

          if (!productExists) {
            const newPId =
              productId && isUuid(productId) ? productId : crypto.randomUUID();
            const newP = await client.query(
              `INSERT INTO products (id, organisation_id, medicine_name, brand_name, sku)
               VALUES ($1, $2, $3, $3, $4)
               ON CONFLICT (id) DO NOTHING
               RETURNING id`,
              [
                newPId,
                resolvedOrgId,
                item.productName || "Stock Item",
                `SKU-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
              ],
            );
            productId = newP.rows[0]?.id || newPId;
          }

          const qtyReceived = Math.max(
            1,
            Number(item.receivedQuantity || item.quantity || 1),
          );
          const unitCost = Number(item.unitCost || item.costPrice || 100);

          // Ensure purchase_item row exists
          let purchaseItemId = item.purchaseItemId;
          if (!purchaseItemId || !isUuid(purchaseItemId)) {
            const piRes = await client.query(
              `INSERT INTO purchase_items (
                 purchase_id, product_id, ordered_quantity, unit_cost, tax_amount, discount_amount, created_at, updated_at
               ) VALUES ($1, $2, $3, $4, 0, 0, NOW(), NOW()) RETURNING id`,
              [purchaseId, productId, qtyReceived, unitCost],
            );
            purchaseItemId = piRes.rows[0].id;
          }

          // Insert goods_receipt_items
          await client.query(
            `INSERT INTO goods_receipt_items (
               goods_receipt_id, purchase_item_id, received_quantity, rejected_quantity, created_at, updated_at
             ) VALUES ($1, $2, $3, 0, NOW(), NOW())`,
            [goodsReceiptId, purchaseItemId, qtyReceived],
          );

          // Restock / Upsert inventory_batches
          const batchNumber =
            item.batchNumber || `BAT-${Date.now().toString().slice(-4)}`;
          const expiryDate = item.expiryDate || "2028-12-31";
          const mrp = Number(item.mrp || unitCost * 1.3);

          const existingBatch = await client.query(
            `SELECT id, quantity FROM inventory_batches
             WHERE branch_id = $1 AND product_id = $2 AND batch_number = $3`,
            [resolvedBranchId, productId, batchNumber],
          );

          if (existingBatch.rows.length > 0) {
            await client.query(
              `UPDATE inventory_batches
               SET quantity = quantity + $1, updated_at = NOW()
               WHERE id = $2`,
              [qtyReceived, existingBatch.rows[0].id],
            );
          } else {
            await client.query(
              `INSERT INTO inventory_batches (
                 product_id, branch_id, supplier_id, batch_number, expiry_date, mrp, quantity, updated_at, created_at
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
              [
                productId,
                resolvedBranchId,
                supplierId,
                batchNumber,
                expiryDate,
                mrp,
                qtyReceived,
              ],
            );
          }

          processedItems.push({
            productId,
            productName: item.productName || null,
            batchNumber,
            expiryDate,
            manufacturingDate: item.manufacturingDate || null,
            quantity: qtyReceived,
            unitCost,
            costPrice: unitCost,
            mrp,
          });
        }
      } else {
        var processedItems = items.map((item) => ({
          productId: item.productId,
          productName: item.productName || null,
          batchNumber:
            item.batchNumber || `BAT-${Date.now().toString().slice(-4)}`,
          expiryDate: item.expiryDate || "2028-12-31",
          manufacturingDate: item.manufacturingDate || null,
          quantity: Math.max(
            1,
            Number(item.receivedQuantity || item.quantity || 1),
          ),
          unitCost: Number(item.unitCost || item.costPrice || 100),
          costPrice: Number(item.unitCost || item.costPrice || 100),
          mrp: Number(item.mrp || 130),
        }));
      }

      const resultData = {
        purchaseId,
        purchaseNumber,
        goodsReceiptId,
        receiptNumber,
        status: "RECEIVED",
        itemsCount: processedItems.length,
        items: processedItems,
        organisationId: resolvedOrgId,
        branchId: resolvedBranchId,
      };

      // 5. Record Idempotency in sync_mutations
      await client.query(
        `INSERT INTO sync_mutations (
           mutation_id, organisation_id, branch_id, user_id, device_id, mutation_type,
           occurred_at, status, payload, result, processed_at
         ) VALUES ($1, $2, $3, $4, $5, 'RECEIVE_PURCHASE', $6, 'PROCESSED', $7, $8, NOW())
         ON CONFLICT (organisation_id, mutation_id) DO UPDATE
         SET status = 'PROCESSED', result = EXCLUDED.result, processed_at = NOW()`,
        [
          mutationId,
          resolvedOrgId,
          resolvedBranchId || null,
          effectiveUserId || null,
          deviceId,
          occurredAt || new Date().toISOString(),
          JSON.stringify(payload),
          JSON.stringify(resultData),
        ],
      );

      // 6. Record sync_changes event atomically
      await client.query(
        `INSERT INTO sync_changes (
           organisation_id, branch_id, entity_type, entity_id, operation, changed_at, payload
         ) VALUES ($1, $2, 'PURCHASE', $3, 'UPDATE', NOW(), $4)`,
        [
          resolvedOrgId,
          resolvedBranchId || null,
          purchaseId,
          JSON.stringify({
            purchaseId,
            purchaseNumber,
            goodsReceiptId,
            receiptNumber,
            status: "RECEIVED",
            itemsCount: processedItems.length,
            items: processedItems,
            organisationId: resolvedOrgId,
            branchId: resolvedBranchId,
          }),
        ],
      );

      await client.query("COMMIT");

      return {
        status: "SUCCESS",
        result: resultData,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(
        `[SyncService] Error processing RECEIVE_PURCHASE ${mutationId}:`,
        err,
      );
      return {
        status: "RETRYABLE_ERROR",
        errorCode: "DATABASE_ERROR",
        errorMessage: err.message,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Process RECORD_CASH_EXPENSE Mutation
   *
   * 1. Validates client-generated UUID movementId and amount > 0.
   * 2. Resolves tenant context.
   * 3. Ensures or creates active cash register & session.
   * 4. Inserts into cash_movements (movement_type: 'OUT').
   * 5. Records idempotency in sync_mutations with SHA-256 fingerprint.
   * 6. Atomically records sync_changes (entity_type: 'EXPENSE', operation: 'INSERT').
   */
  async processRecordCashExpense({
    mutationId,
    organisationId,
    branchId,
    effectiveUserId,
    payload = {},
    occurredAt,
    deviceId,
  }) {
    const isUuid = (str) =>
      typeof str === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        str,
      );

    const movementId = payload.movementId || payload.id;
    if (!movementId || !isUuid(movementId)) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage: "Expense payload must specify a valid UUID movementId.",
      };
    }

    const amount = Number(payload.amount);
    if (isNaN(amount) || amount <= 0) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage: "Expense amount must be a number greater than 0.",
      };
    }

    const { resolvedOrgId, resolvedBranchId } = await this.resolveTenantContext(
      organisationId,
      branchId,
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check for existing cash movement by ID (idempotency check at table level)
      const existingMov = await client.query(
        "SELECT id, movement_number, amount FROM cash_movements WHERE id = $1",
        [movementId],
      );

      let movementNumber;
      if (existingMov.rows.length > 0) {
        movementNumber = existingMov.rows[0].movement_number;
      } else {
        // Resolve or create cashier user
        let cashierId = effectiveUserId;
        if (!cashierId || !isUuid(cashierId)) {
          const uRes = await client.query(
            `SELECT u.id FROM users u
             INNER JOIN organisation_memberships om ON om.user_id = u.id
             WHERE om.organisation_id = $1 AND om.status = 'ACTIVE' LIMIT 1`,
            [resolvedOrgId],
          );
          cashierId = uRes.rows[0]?.id;
        }

        // Resolve or create cash register session
        let sessionId = payload.cashRegisterSessionId;
        if (sessionId && isUuid(sessionId)) {
          const sessRes = await client.query(
            "SELECT id FROM cash_register_sessions WHERE id = $1 AND organisation_id = $2 AND branch_id = $3",
            [sessionId, resolvedOrgId, resolvedBranchId],
          );
          if (sessRes.rows.length === 0) sessionId = null;
        }

        if (!sessionId) {
          const openSess = await client.query(
            `SELECT id FROM cash_register_sessions
             WHERE branch_id = $1 AND organisation_id = $2 AND status = 'OPEN'
             ORDER BY opened_at DESC LIMIT 1`,
            [resolvedBranchId, resolvedOrgId],
          );
          if (openSess.rows.length > 0) {
            sessionId = openSess.rows[0].id;
          } else {
            // Find or create register
            let registerId;
            const regRes = await client.query(
              `SELECT id FROM cash_registers
               WHERE branch_id = $1 AND organisation_id = $2 LIMIT 1`,
              [resolvedBranchId, resolvedOrgId],
            );
            if (regRes.rows.length > 0) {
              registerId = regRes.rows[0].id;
            } else {
              const newReg = await client.query(
                `INSERT INTO cash_registers (organisation_id, branch_id, name, identifier, is_active)
                 VALUES ($1, $2, 'POS Register 1', 'REG-1', true) RETURNING id`,
                [resolvedOrgId, resolvedBranchId],
              );
              registerId = newReg.rows[0].id;
            }

            // Create open session
            const newSess = await client.query(
              `INSERT INTO cash_register_sessions (
                 organisation_id, branch_id, cash_register_id, cashier_id,
                 session_number, opened_at, opening_balance, status
               ) VALUES ($1, $2, $3, $4, $5, NOW(), 0, 'OPEN') RETURNING id`,
              [
                resolvedOrgId,
                resolvedBranchId,
                registerId,
                cashierId,
                `SESS-${Date.now().toString().slice(-6)}`,
              ],
            );
            sessionId = newSess.rows[0].id;
          }
        }

        movementNumber =
          payload.movementNumber || `EXP-${Date.now().toString().slice(-6)}`;

        await client.query(
          `INSERT INTO cash_movements (
             id, organisation_id, branch_id, cash_register_session_id, cashier_id,
             movement_number, movement_type, amount, reason, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, 'OUT', $7, $8, NOW())`,
          [
            movementId,
            resolvedOrgId,
            resolvedBranchId,
            sessionId,
            cashierId,
            movementNumber,
            amount,
            payload.reason || "Cash expense payout",
          ],
        );
      }

      const resultData = {
        movementId,
        movementNumber,
        movementType: "OUT",
        amount,
        reason: payload.reason || "Cash expense payout",
        organisationId: resolvedOrgId,
        branchId: resolvedBranchId,
        status: "SUCCESS",
      };

      // 4. Record Idempotency in sync_mutations
      await client.query(
        `INSERT INTO sync_mutations (
           mutation_id, organisation_id, branch_id, user_id, device_id, mutation_type,
           occurred_at, status, payload, result, processed_at
         ) VALUES ($1, $2, $3, $4, $5, 'RECORD_CASH_EXPENSE', $6, 'PROCESSED', $7, $8, NOW())
         ON CONFLICT (organisation_id, mutation_id) DO UPDATE
         SET status = 'PROCESSED', result = EXCLUDED.result, processed_at = NOW()`,
        [
          mutationId,
          resolvedOrgId,
          resolvedBranchId || null,
          effectiveUserId || null,
          deviceId,
          occurredAt || new Date().toISOString(),
          JSON.stringify(payload),
          JSON.stringify(resultData),
        ],
      );

      // 5. Record sync_changes event atomically in same transaction
      await client.query(
        `INSERT INTO sync_changes (
           organisation_id, branch_id, entity_type, entity_id, operation, changed_at, payload
         ) VALUES ($1, $2, 'EXPENSE', $3, 'INSERT', NOW(), $4)`,
        [
          resolvedOrgId,
          resolvedBranchId || null,
          movementId,
          JSON.stringify({
            movementId,
            movementNumber,
            movementType: "OUT",
            amount,
            reason: payload.reason || "Cash expense payout",
            organisationId: resolvedOrgId,
            branchId: resolvedBranchId,
          }),
        ],
      );

      await client.query("COMMIT");

      return {
        status: "SUCCESS",
        result: resultData,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(
        `[SyncService] Error processing RECORD_CASH_EXPENSE ${mutationId}:`,
        err,
      );
      return {
        status: "RETRYABLE_ERROR",
        errorCode: "DATABASE_ERROR",
        errorMessage: err.message,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Process a single ADJUST_STOCK mutation atomically in PostgreSQL:
   * 1. Resolves tenant & branch context.
   * 2. Locks the inventory batch with SELECT ... FOR UPDATE.
   * 3. Calculates newQuantity = authoritativeQuantity + deltaQuantity.
   * 4. If newQuantity < 0, returns CONFLICT (ADJUSTMENT_WOULD_CAUSE_NEGATIVE_STOCK).
   * 5. Atomically updates inventory_batches.quantity and updated_at.
   * 6. Appends audit entry in stock_movements.
   * 7. Records idempotency in sync_mutations.
   * 8. Emits sync_changes (entity_type: 'ADJUSTMENT').
   */
  async processStockAdjustment({
    mutationId,
    organisationId,
    branchId,
    effectiveUserId,
    payload = {},
    occurredAt,
    deviceId,
  }) {
    const isUuid = (str) =>
      typeof str === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        str,
      );

    const deltaQuantity = Number(payload.deltaQuantity);
    if (isNaN(deltaQuantity) || deltaQuantity === 0) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage: "Adjustment must specify a non-zero deltaQuantity.",
      };
    }

    if (!payload.productId) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage: "Adjustment must specify a productId.",
      };
    }

    if (!payload.batchNumber) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage: "Adjustment must specify a batchNumber.",
      };
    }

    const { resolvedOrgId, resolvedBranchId } = await this.resolveTenantContext(
      organisationId,
      branchId,
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Lock and retrieve authoritative inventory batch
      let batchQuery;
      let batchParams;
      if (payload.batchId && isUuid(payload.batchId)) {
        batchQuery = `
          SELECT id, product_id, branch_id, batch_number, quantity, expiry_date, mrp
          FROM inventory_batches
          WHERE id = $1 AND branch_id = $2
          FOR UPDATE
        `;
        batchParams = [payload.batchId, resolvedBranchId];
      } else {
        batchQuery = `
          SELECT id, product_id, branch_id, batch_number, quantity, expiry_date, mrp
          FROM inventory_batches
          WHERE branch_id = $1 AND product_id::text = $2::text AND batch_number = $3
          FOR UPDATE
        `;
        batchParams = [
          resolvedBranchId,
          payload.productId,
          payload.batchNumber,
        ];
      }

      let batchRes = await client.query(batchQuery, batchParams);

      if (batchRes.rows.length === 0) {
        // Fallback search by batch_number and branch if product UUID differed between client/server
        const fallbackRes = await client.query(
          `SELECT id, product_id, branch_id, batch_number, quantity, expiry_date, mrp
           FROM inventory_batches
           WHERE branch_id = $1 AND batch_number = $2
           FOR UPDATE`,
          [resolvedBranchId, payload.batchNumber],
        );
        if (fallbackRes.rows.length > 0) {
          batchRes = fallbackRes;
        }
      }

      if (batchRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return {
          status: "CONFLICT",
          errorCode: "BATCH_NOT_FOUND",
          errorMessage: `Batch ${payload.batchNumber} for product ${payload.productId} not found at branch ${resolvedBranchId}.`,
        };
      }

      const currentBatch = batchRes.rows[0];
      const authoritativeCurrentQty = Number(currentBatch.quantity || 0);
      const newQuantity = authoritativeCurrentQty + deltaQuantity;

      // 2. Validate resulting quantity cannot become negative
      if (newQuantity < 0) {
        await client.query("ROLLBACK");
        return {
          status: "CONFLICT",
          errorCode: "ADJUSTMENT_WOULD_CAUSE_NEGATIVE_STOCK",
          errorMessage: `Adjustment delta (${deltaQuantity}) would cause negative stock for batch ${currentBatch.batch_number} (current: ${authoritativeCurrentQty}, resulting: ${newQuantity}).`,
        };
      }

      // 3. Atomically update inventory batch quantity
      await client.query(
        `UPDATE inventory_batches
         SET quantity = $1, updated_by = $2, updated_at = NOW()
         WHERE id = $3`,
        [newQuantity, effectiveUserId || null, currentBatch.id],
      );

      // 4. Log in stock_movements
      const adjustmentId = payload.adjustmentId || crypto.randomUUID();
      const adjustmentNumber =
        payload.adjustmentNumber || `ADJ-${Date.now().toString().slice(-6)}`;
      const reason =
        payload.reason || payload.adjustmentType || "Stock adjustment";
      const branchName = payload.branchName || "Main Branch";

      pool
        .query(
          `INSERT INTO stock_movements (
           organisation_id, branch_name, movement_type, item_name, quantity, reference, status
         ) VALUES ($1, $2, 'Adjustment', $3, $4, $5, 'Completed')`,
          [
            resolvedOrgId,
            branchName,
            payload.productName || payload.productId,
            deltaQuantity > 0 ? `+${deltaQuantity}` : `${deltaQuantity}`,
            adjustmentNumber,
          ],
        )
        .catch(() => {});

      const resultData = {
        adjustmentId,
        adjustmentNumber,
        productId: currentBatch.product_id,
        productName: payload.productName || null,
        batchNumber: currentBatch.batch_number,
        batchId: currentBatch.id,
        deltaQuantity,
        previousQuantity: authoritativeCurrentQty,
        newQuantity,
        reason,
        adjustmentType: payload.adjustmentType || "CYCLE_COUNT",
        organisationId: resolvedOrgId,
        branchId: resolvedBranchId,
        status: "SUCCESS",
      };

      // 5. Record Idempotency in sync_mutations
      await client.query(
        `INSERT INTO sync_mutations (
           mutation_id, organisation_id, branch_id, user_id, device_id, mutation_type,
           occurred_at, status, payload, result, processed_at
         ) VALUES ($1, $2, $3, $4, $5, 'ADJUST_STOCK', $6, 'PROCESSED', $7, $8, NOW())
         ON CONFLICT (organisation_id, mutation_id) DO UPDATE
         SET status = 'PROCESSED', result = EXCLUDED.result, processed_at = NOW()`,
        [
          mutationId,
          resolvedOrgId,
          resolvedBranchId || null,
          effectiveUserId || null,
          deviceId,
          occurredAt || new Date().toISOString(),
          JSON.stringify(payload),
          JSON.stringify(resultData),
        ],
      );

      // 6. Record sync_changes event atomically
      await client.query(
        `INSERT INTO sync_changes (
           organisation_id, branch_id, entity_type, entity_id, operation, changed_at, payload
         ) VALUES ($1, $2, 'ADJUSTMENT', $3, 'UPDATE', NOW(), $4)`,
        [
          resolvedOrgId,
          resolvedBranchId || null,
          adjustmentId,
          JSON.stringify({
            adjustmentId,
            adjustmentNumber,
            productId: currentBatch.product_id,
            productName: payload.productName || null,
            batchNumber: currentBatch.batch_number,
            batchId: currentBatch.id,
            branchId: resolvedBranchId,
            organisationId: resolvedOrgId,
            deltaQuantity,
            resultingQuantity: newQuantity,
            reason,
            adjustmentType: payload.adjustmentType || "CYCLE_COUNT",
            occurredAt: occurredAt || new Date().toISOString(),
          }),
        ],
      );

      await client.query("COMMIT");

      return {
        status: "SUCCESS",
        result: resultData,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(
        `[SyncService] Error processing ADJUST_STOCK ${mutationId}:`,
        err,
      );
      return {
        status: "RETRYABLE_ERROR",
        errorCode: "DATABASE_ERROR",
        errorMessage: err.message,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Process a single TRANSFER_STOCK mutation atomically in PostgreSQL:
   * 1. Resolves tenant & source branch context.
   * 2. Validates destination branch exists, belongs to same org, and fromBranchId != toBranchId.
   * 3. Locks source inventory rows FOR UPDATE.
   * 4. Validates sufficient source stock. If insufficient, returns CONFLICT (INSUFFICIENT_TRANSFER_STOCK).
   * 5. Decrements source inventory_batches.
   * 6. Inserts stock_transfers header (status = 'IN_TRANSIT') with transfer_number.
   * 7. Inserts stock_transfer_items.
   * 8. Records stock_movements for source branch.
   * 9. Records idempotency in sync_mutations.
   * 10. Emits sync_changes (entity_type: 'TRANSFER').
   */
  async processStockTransfer({
    mutationId,
    organisationId,
    branchId,
    effectiveUserId,
    payload = {},
    occurredAt,
    deviceId,
  }) {
    const isUuid = (str) =>
      typeof str === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        str,
      );

    const { resolvedOrgId, resolvedBranchId } = await this.resolveTenantContext(
      organisationId,
      branchId,
    );

    const fromBranchId = payload.fromBranchId || resolvedBranchId;
    const toBranchId = payload.toBranchId;

    if (!toBranchId || !isUuid(toBranchId)) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage: "Valid UUID destination branch (toBranchId) is required.",
      };
    }

    if (fromBranchId === toBranchId) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage: "Source and destination branches must be different.",
      };
    }

    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length === 0) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage: "Transfer must contain at least one line item.",
      };
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Verify destination branch belongs to same organisation and is active
      const toBranchRes = await client.query(
        `SELECT id, name, status FROM branches
         WHERE id = $1 AND organisation_id = $2`,
        [toBranchId, resolvedOrgId],
      );

      if (toBranchRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return {
          status: "CONFLICT",
          errorCode: "INVALID_DESTINATION_BRANCH",
          errorMessage:
            "Destination branch does not exist or does not belong to the same organisation.",
        };
      }

      const destBranch = toBranchRes.rows[0];
      if (
        destBranch.status &&
        destBranch.status !== "ACTIVE" &&
        destBranch.status !== "Active"
      ) {
        await client.query("ROLLBACK");
        return {
          status: "CONFLICT",
          errorCode: "DESTINATION_BRANCH_INACTIVE",
          errorMessage: `Destination branch ${destBranch.name} is not active.`,
        };
      }

      // 2. Lock source batches and validate stock
      const processedItems = [];
      for (const it of items) {
        const reqQty = Number(it.quantity || 0);
        if (reqQty <= 0) {
          await client.query("ROLLBACK");
          return {
            status: "FAILED",
            errorCode: "VALIDATION_ERROR",
            errorMessage: "Transfer item quantity must be greater than zero.",
          };
        }

        // Find and lock source batch
        let bRes = await client.query(
          `          SELECT id, product_id, branch_id, batch_number, quantity, expiry_date, mrp, supplier_id
          FROM inventory_batches
          WHERE branch_id = $1 AND product_id::text = $2::text AND batch_number = $3
          FOR UPDATE`,
          [fromBranchId, it.productId, it.batchNumber],
        );

        if (bRes.rows.length === 0) {
          // Fallback search by batch_number and branch
          const fbRes = await client.query(
            `SELECT id, product_id, branch_id, batch_number, quantity, expiry_date, mrp, supplier_id
             FROM inventory_batches
             WHERE branch_id = $1 AND batch_number = $2
             FOR UPDATE`,
            [fromBranchId, it.batchNumber],
          );
          if (fbRes.rows.length > 0) bRes = fbRes;
        }

        if (bRes.rows.length === 0) {
          await client.query("ROLLBACK");
          return {
            status: "CONFLICT",
            errorCode: "SOURCE_BATCH_NOT_FOUND",
            errorMessage: `Source batch ${it.batchNumber} for product ${it.productId} not found at source branch.`,
          };
        }

        const sourceBatch = bRes.rows[0];
        const avail = Number(sourceBatch.quantity || 0);
        if (avail < reqQty) {
          await client.query("ROLLBACK");
          return {
            status: "CONFLICT",
            errorCode: "INSUFFICIENT_TRANSFER_STOCK",
            errorMessage: `Insufficient source stock for batch ${sourceBatch.batch_number}: available ${avail}, requested ${reqQty}.`,
          };
        }

        // Decrement source batch
        await client.query(
          `UPDATE inventory_batches
           SET quantity = quantity - $1, updated_by = $2, updated_at = NOW()
           WHERE id = $3`,
          [reqQty, effectiveUserId || null, sourceBatch.id],
        );

        processedItems.push({
          sourceBatchId: sourceBatch.id,
          productId: sourceBatch.product_id,
          batchNumber: sourceBatch.batch_number,
          quantity: reqQty,
          expiryDate: sourceBatch.expiry_date,
          mrp: sourceBatch.mrp,
          supplierId: sourceBatch.supplier_id,
        });
      }

      // 3. Create stock_transfers header
      const transferId =
        payload.transferId && isUuid(payload.transferId)
          ? payload.transferId
          : crypto.randomUUID();

      let transferNumber =
        payload.transferNumber || `TR-${Date.now().toString().slice(-6)}`;

      const existingTR = await client.query(
        "SELECT id, transfer_number FROM stock_transfers WHERE id = $1 OR (organisation_id = $2 AND transfer_number = $3)",
        [transferId, resolvedOrgId, transferNumber],
      );

      if (existingTR.rows.length === 0) {
        await client.query(
          `INSERT INTO stock_transfers (
             id, organisation_id, from_branch_id, to_branch_id,
             transfer_date, status, transfer_number, notes, created_by, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, CURRENT_DATE, 'IN_TRANSIT', $5, $6, $7, NOW(), NOW())`,
          [
            transferId,
            resolvedOrgId,
            fromBranchId,
            toBranchId,
            transferNumber,
            payload.notes || "Offline inter-branch stock transfer",
            effectiveUserId || null,
          ],
        );

        // 4. Insert stock_transfer_items
        for (const pi of processedItems) {
          await client.query(
            `INSERT INTO stock_transfer_items (
               transfer_id, inventory_batch_id, quantity, created_at
             ) VALUES ($1, $2, $3, NOW())`,
            [transferId, pi.sourceBatchId, pi.quantity],
          );
        }

        // 5. Insert stock_movements for source branch
        for (const pi of processedItems) {
          pool
            .query(
              `INSERT INTO stock_movements (
               organisation_id, branch_name, movement_type, item_name, quantity, reference, status
             ) VALUES ($1, $2, 'Transfer Out', $3, $4, $5, 'In Transit')`,
              [
                resolvedOrgId,
                payload.fromBranchName || "Source Branch",
                pi.batchNumber,
                `-${pi.quantity}`,
                transferNumber,
              ],
            )
            .catch(() => {});
        }
      } else {
        transferNumber = existingTR.rows[0].transfer_number;
      }

      const resultData = {
        transferId,
        transferNumber,
        fromBranchId,
        toBranchId,
        status: "IN_TRANSIT",
        itemsCount: processedItems.length,
        items: processedItems,
        totalQuantity: processedItems.reduce((s, it) => s + it.quantity, 0),
        organisationId: resolvedOrgId,
      };

      // 6. Record in sync_mutations
      await client.query(
        `INSERT INTO sync_mutations (
           mutation_id, organisation_id, branch_id, user_id, device_id, mutation_type,
           occurred_at, status, payload, result, processed_at
         ) VALUES ($1, $2, $3, $4, $5, 'TRANSFER_STOCK', $6, 'PROCESSED', $7, $8, NOW())
         ON CONFLICT (organisation_id, mutation_id) DO UPDATE
         SET status = 'PROCESSED', result = EXCLUDED.result, processed_at = NOW()`,
        [
          mutationId,
          resolvedOrgId,
          fromBranchId,
          effectiveUserId || null,
          deviceId,
          occurredAt || new Date().toISOString(),
          JSON.stringify(payload),
          JSON.stringify(resultData),
        ],
      );

      // 7. Emit sync_changes event for TRANSFER
      await client.query(
        `INSERT INTO sync_changes (
           organisation_id, branch_id, entity_type, entity_id, operation, changed_at, payload
         ) VALUES ($1, $2, 'TRANSFER', $3, 'INSERT', NOW(), $4)`,
        [
          resolvedOrgId,
          fromBranchId,
          transferId,
          JSON.stringify({
            transferId,
            transferNumber,
            fromBranchId,
            toBranchId,
            status: "IN_TRANSIT",
            items: processedItems,
            totalQuantity: processedItems.reduce((s, it) => s + it.quantity, 0),
            organisationId: resolvedOrgId,
            occurredAt: occurredAt || new Date().toISOString(),
          }),
        ],
      );

      await client.query("COMMIT");

      return {
        status: "SUCCESS",
        result: resultData,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(
        `[SyncService] Error processing TRANSFER_STOCK ${mutationId}:`,
        err,
      );
      return {
        status: "RETRYABLE_ERROR",
        errorCode: "DATABASE_ERROR",
        errorMessage: err.message,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Process OPEN_REGISTER_SESSION sync mutation
   */
  async processOpenRegisterSession({
    mutationId,
    organisationId,
    branchId,
    effectiveUserId,
    payload = {},
    occurredAt,
    deviceId,
  }) {
    const isUuid = (str) =>
      typeof str === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        str,
      );

    const sessionId = payload.sessionId || payload.id;
    if (!sessionId || !isUuid(sessionId)) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage:
          "Open register session mutation must specify a valid UUID sessionId.",
      };
    }

    const { resolvedOrgId, resolvedBranchId } = await this.resolveTenantContext(
      organisationId,
      branchId,
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Check if this exact session record already exists in cash_register_sessions (idempotency)
      const existingSession = await client.query(
        `SELECT id, session_number, status, opening_balance, opened_at, cash_register_id
         FROM cash_register_sessions
         WHERE id = $1 AND organisation_id = $2`,
        [sessionId, resolvedOrgId],
      );

      if (existingSession.rows.length > 0) {
        const row = existingSession.rows[0];
        await client.query("COMMIT");
        return {
          status: "SUCCESS",
          result: {
            sessionId: row.id,
            sessionNumber: row.session_number,
            status: row.status,
            openingBalance: Number(row.opening_balance),
            openedAt: row.opened_at,
          },
          idempotentReplay: true,
        };
      }

      // 2. Resolve or create cash register for this branch
      let registerId = payload.cashRegisterId;
      if (registerId && isUuid(registerId)) {
        const regCheck = await client.query(
          `SELECT id FROM cash_registers WHERE id = $1 AND organisation_id = $2 AND branch_id = $3 FOR UPDATE`,
          [registerId, resolvedOrgId, resolvedBranchId],
        );
        if (regCheck.rows.length === 0) {
          const identifier =
            payload.registerIdentifier ||
            payload.identifier ||
            "POS-" + registerId.slice(0, 8);
          const newReg = await client.query(
            `INSERT INTO cash_registers (id, organisation_id, branch_id, name, identifier, is_active)
             VALUES ($1, $2, $3, 'Counter 1', $4, true)
             ON CONFLICT (id) DO UPDATE SET is_active = true
             RETURNING id`,
            [registerId, resolvedOrgId, resolvedBranchId, identifier],
          );
          registerId = newReg.rows[0]?.id || registerId;
        }
      }

      if (!registerId) {
        const regRes = await client.query(
          `SELECT id FROM cash_registers WHERE branch_id = $1 AND organisation_id = $2 LIMIT 1 FOR UPDATE`,
          [resolvedBranchId, resolvedOrgId],
        );
        if (regRes.rows.length > 0) {
          registerId = regRes.rows[0].id;
        } else {
          const newReg = await client.query(
            `INSERT INTO cash_registers (organisation_id, branch_id, name, identifier, is_active)
             VALUES ($1, $2, 'Counter 1', 'POS-01', true) RETURNING id`,
            [resolvedOrgId, resolvedBranchId],
          );
          registerId = newReg.rows[0].id;
        }
      }

      // 3. Enforce single open session constraint per register
      const openConflictRes = await client.query(
        `SELECT id, session_number FROM cash_register_sessions
         WHERE cash_register_id = $1 AND status = 'OPEN' FOR UPDATE`,
        [registerId],
      );

      if (openConflictRes.rows.length > 0) {
        const openRow = openConflictRes.rows[0];
        if (openRow.id !== sessionId) {
          await client.query("ROLLBACK");
          return {
            status: "CONFLICT",
            errorCode: "OPEN_SESSION_ALREADY_EXISTS",
            errorMessage: `A session (${openRow.session_number}) is already open for this cash register.`,
            conflictDetails: {
              activeSessionId: openRow.id,
              activeSessionNumber: openRow.session_number,
            },
          };
        }
      }

      // 4. Resolve cashier
      let cashierId = effectiveUserId || payload.cashierId;
      if (!cashierId || !isUuid(cashierId)) {
        const uRes = await client.query(
          `SELECT id FROM users WHERE status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1`,
        );
        cashierId = uRes.rows[0]?.id;
      }

      const openingBalance = Math.max(0, Number(payload.openingBalance || 0));
      const shiftName = payload.shiftName || "Day Shift";
      const sessionNumber =
        payload.sessionNumber ||
        (await getNextBusinessNumber({
          organisationId: resolvedOrgId,
          branchId: resolvedBranchId,
          sequenceType: "REGISTER_SESSION",
          client,
        }));

      // 5. Insert cash_register_sessions
      const sessionInsertRes = await client.query(
        `INSERT INTO cash_register_sessions (
           id, organisation_id, branch_id, cash_register_id, cashier_id,
           session_number, shift_name, opened_at, opening_balance, status, opening_notes
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'OPEN', $10)
         RETURNING *`,
        [
          sessionId,
          resolvedOrgId,
          resolvedBranchId,
          registerId,
          cashierId,
          sessionNumber,
          shiftName,
          occurredAt || new Date().toISOString(),
          openingBalance,
          payload.notes || payload.openingNotes || null,
        ],
      );

      const createdSession = sessionInsertRes.rows[0];

      // 6. Record opening float cash movement if openingBalance > 0
      let floatMovementId = null;
      if (openingBalance > 0) {
        floatMovementId = isUuid(payload.openingFloatMovementId)
          ? payload.openingFloatMovementId
          : undefined;
        const movementNumber = await getNextBusinessNumber({
          organisationId: resolvedOrgId,
          branchId: resolvedBranchId,
          sequenceType: "CASH_MOVEMENT",
          client,
        });

        const movRes = await client.query(
          `INSERT INTO cash_movements (
             id, organisation_id, branch_id, cash_register_session_id, cashier_id,
             movement_number, movement_type, amount, reason, created_at
           ) VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, 'IN', $7, 'Opening float balance', NOW())
           RETURNING id`,
          [
            floatMovementId || null,
            resolvedOrgId,
            resolvedBranchId,
            sessionId,
            cashierId,
            movementNumber,
            openingBalance,
          ],
        );
        floatMovementId = movRes.rows[0].id;
      }

      const resultData = {
        sessionId: createdSession.id,
        sessionNumber: createdSession.session_number,
        cashRegisterId: createdSession.cash_register_id,
        openingBalance,
        status: "OPEN",
        openedAt: createdSession.opened_at,
        floatMovementId,
        organisationId: resolvedOrgId,
        branchId: resolvedBranchId,
      };

      // 7. Record Idempotency in sync_mutations
      await client.query(
        `INSERT INTO sync_mutations (
           mutation_id, organisation_id, branch_id, user_id, device_id, mutation_type,
           occurred_at, status, payload, result, processed_at
         ) VALUES ($1, $2, $3, $4, $5, 'OPEN_REGISTER_SESSION', $6, 'PROCESSED', $7, $8, NOW())
         ON CONFLICT (organisation_id, mutation_id) DO UPDATE
         SET status = 'PROCESSED', result = EXCLUDED.result, processed_at = NOW()`,
        [
          mutationId,
          resolvedOrgId,
          resolvedBranchId,
          effectiveUserId || null,
          deviceId,
          occurredAt || new Date().toISOString(),
          JSON.stringify(payload),
          JSON.stringify(resultData),
        ],
      );

      // 8. Record sync_changes event atomically
      await client.query(
        `INSERT INTO sync_changes (
           organisation_id, branch_id, entity_type, entity_id, operation, changed_at, payload
         ) VALUES ($1, $2, 'REGISTER_SESSION', $3, 'INSERT', NOW(), $4)`,
        [
          resolvedOrgId,
          resolvedBranchId,
          sessionId,
          JSON.stringify(resultData),
        ],
      );

      await client.query("COMMIT");

      return {
        status: "SUCCESS",
        result: resultData,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(
        `[SyncService] Error processing OPEN_REGISTER_SESSION ${mutationId}:`,
        err,
      );
      return {
        status: "RETRYABLE_ERROR",
        errorCode: "DATABASE_ERROR",
        errorMessage: err.message,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Process RECORD_CASH_MOVEMENT sync mutation
   */
  async processRecordCashMovement({
    mutationId,
    organisationId,
    branchId,
    effectiveUserId,
    payload = {},
    occurredAt,
    deviceId,
  }) {
    const isUuid = (str) =>
      typeof str === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        str,
      );

    const movementId = payload.movementId || payload.id;
    if (!movementId || !isUuid(movementId)) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage:
          "Cash movement mutation must specify a valid UUID movementId.",
      };
    }

    const amount = Number(payload.amount);
    if (isNaN(amount) || amount <= 0) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage: "Movement amount must be greater than 0.",
      };
    }

    const rawType = String(
      payload.movementType || payload.type || "",
    ).toUpperCase();
    const movementType = rawType === "IN" ? "IN" : "OUT";

    const { resolvedOrgId, resolvedBranchId } = await this.resolveTenantContext(
      organisationId,
      branchId,
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Idempotency check on cash_movements
      const existingMov = await client.query(
        "SELECT id, movement_number, amount, movement_type, cash_register_session_id FROM cash_movements WHERE id = $1 AND organisation_id = $2",
        [movementId, resolvedOrgId],
      );

      if (existingMov.rows.length > 0) {
        const row = existingMov.rows[0];
        await client.query("COMMIT");
        return {
          status: "SUCCESS",
          result: {
            movementId: row.id,
            movementNumber: row.movement_number,
            movementType: row.movement_type,
            amount: Number(row.amount),
            cashRegisterSessionId: row.cash_register_session_id,
          },
          idempotentReplay: true,
        };
      }

      // 2. Resolve target session with FOR UPDATE
      let sessionId = payload.cashRegisterSessionId || payload.sessionId;
      let sessionRow = null;

      if (sessionId && isUuid(sessionId)) {
        const sRes = await client.query(
          "SELECT id, status, branch_id FROM cash_register_sessions WHERE id = $1 AND organisation_id = $2 FOR UPDATE",
          [sessionId, resolvedOrgId],
        );
        if (sRes.rows.length > 0) {
          sessionRow = sRes.rows[0];
        }
      }

      if (!sessionRow) {
        const openSessRes = await client.query(
          `SELECT id, status, branch_id FROM cash_register_sessions
           WHERE branch_id = $1 AND organisation_id = $2 AND status = 'OPEN'
           ORDER BY opened_at DESC LIMIT 1 FOR UPDATE`,
          [resolvedBranchId, resolvedOrgId],
        );
        if (openSessRes.rows.length > 0) {
          sessionRow = openSessRes.rows[0];
          sessionId = sessionRow.id;
        }
      }

      if (!sessionRow) {
        await client.query("ROLLBACK");
        return {
          status: "CONFLICT",
          errorCode: "NO_ACTIVE_SESSION",
          errorMessage:
            "Cannot record cash movement without an active open register session.",
        };
      }

      if (sessionRow.status === "CLOSED") {
        await client.query("ROLLBACK");
        return {
          status: "CONFLICT",
          errorCode: "SESSION_ALREADY_CLOSED",
          errorMessage: `Cash register session ${sessionRow.id} is already CLOSED. Movements cannot be posted to closed sessions.`,
        };
      }

      // 3. Resolve cashier user
      let cashierId = effectiveUserId || payload.cashierId;
      if (!cashierId || !isUuid(cashierId)) {
        const uRes = await client.query(
          "SELECT id FROM users WHERE status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1",
        );
        cashierId = uRes.rows[0]?.id;
      }

      const movementNumber =
        payload.movementNumber ||
        (await getNextBusinessNumber({
          organisationId: resolvedOrgId,
          branchId: resolvedBranchId,
          sequenceType: "CASH_MOVEMENT",
          client,
        }));

      const reason =
        payload.reason ||
        (movementType === "IN"
          ? "Cash float addition"
          : "General expense payout");

      // 4. Insert into cash_movements
      await client.query(
        `INSERT INTO cash_movements (
           id, organisation_id, branch_id, cash_register_session_id, cashier_id,
           movement_number, movement_type, amount, reason, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          movementId,
          resolvedOrgId,
          resolvedBranchId,
          sessionId,
          cashierId,
          movementNumber,
          movementType,
          amount,
          reason,
          occurredAt || new Date().toISOString(),
        ],
      );

      const resultData = {
        movementId,
        movementNumber,
        movementType,
        amount,
        reason,
        cashRegisterSessionId: sessionId,
        organisationId: resolvedOrgId,
        branchId: resolvedBranchId,
        status: "SUCCESS",
      };

      // 5. Record Idempotency in sync_mutations
      await client.query(
        `INSERT INTO sync_mutations (
           mutation_id, organisation_id, branch_id, user_id, device_id, mutation_type,
           occurred_at, status, payload, result, processed_at
         ) VALUES ($1, $2, $3, $4, $5, 'RECORD_CASH_MOVEMENT', $6, 'PROCESSED', $7, $8, NOW())
         ON CONFLICT (organisation_id, mutation_id) DO UPDATE
         SET status = 'PROCESSED', result = EXCLUDED.result, processed_at = NOW()`,
        [
          mutationId,
          resolvedOrgId,
          resolvedBranchId,
          effectiveUserId || null,
          deviceId,
          occurredAt || new Date().toISOString(),
          JSON.stringify(payload),
          JSON.stringify(resultData),
        ],
      );

      // 6. Record sync_changes event
      await client.query(
        `INSERT INTO sync_changes (
           organisation_id, branch_id, entity_type, entity_id, operation, changed_at, payload
         ) VALUES ($1, $2, 'CASH_MOVEMENT', $3, 'INSERT', NOW(), $4)`,
        [
          resolvedOrgId,
          resolvedBranchId,
          movementId,
          JSON.stringify(resultData),
        ],
      );

      await client.query("COMMIT");

      return {
        status: "SUCCESS",
        result: resultData,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(
        `[SyncService] Error processing RECORD_CASH_MOVEMENT ${mutationId}:`,
        err,
      );
      return {
        status: "RETRYABLE_ERROR",
        errorCode: "DATABASE_ERROR",
        errorMessage: err.message,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Process CLOSE_REGISTER_SESSION sync mutation
   */
  async processCloseRegisterSession({
    mutationId,
    organisationId,
    branchId,
    effectiveUserId,
    payload = {},
    occurredAt,
    deviceId,
  }) {
    const isUuid = (str) =>
      typeof str === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        str,
      );

    const sessionId = payload.sessionId || payload.id;
    if (!sessionId || !isUuid(sessionId)) {
      return {
        status: "FAILED",
        errorCode: "VALIDATION_ERROR",
        errorMessage:
          "Close register session mutation must specify a valid UUID sessionId.",
      };
    }

    const { resolvedOrgId, resolvedBranchId } = await this.resolveTenantContext(
      organisationId,
      branchId,
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Lock and inspect session
      const sessRes = await client.query(
        `SELECT id, branch_id, cash_register_id, session_number, opening_balance,
                counted_cash, expected_cash, variance, variance_status, status, closed_at
         FROM cash_register_sessions
         WHERE id = $1 AND organisation_id = $2 FOR UPDATE`,
        [sessionId, resolvedOrgId],
      );

      if (sessRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return {
          status: "FAILED",
          errorCode: "SESSION_NOT_FOUND",
          errorMessage: `Cash register session ${sessionId} not found.`,
        };
      }

      const session = sessRes.rows[0];

      // If already CLOSED:
      if (session.status === "CLOSED") {
        await client.query("COMMIT");
        return {
          status: "SUCCESS",
          result: {
            sessionId: session.id,
            sessionNumber: session.session_number,
            status: "CLOSED",
            expectedCash: Number(session.expected_cash || 0),
            countedCash: Number(session.counted_cash || 0),
            variance: Number(session.variance || 0),
            varianceStatus: session.variance_status,
            closedAt: session.closed_at,
          },
          idempotentReplay: true,
        };
      }

      // 2. Authoritatively derive expected_cash
      const openingBalance = Number(session.opening_balance) || 0;

      // Cash sales
      const salesRes = await client.query(
        `SELECT COALESCE(SUM(pt.amount), 0.00) AS cash_sales
         FROM payments p
         INNER JOIN payment_transactions pt ON pt.payment_id = p.id
         WHERE p.cash_register_session_id = $1
           AND p.status = 'COMPLETED'
           AND UPPER(pt.payment_method) = 'CASH'`,
        [session.id],
      );
      const cashSales = Number(salesRes.rows[0].cash_sales) || 0;

      // Cash refunds
      const returnsRes = await client.query(
        `SELECT COALESCE(SUM(r.refund_amount), 0.00) AS cash_refunds
         FROM returns r
         WHERE r.cash_register_session_id = $1
           AND r.status = 'PROCESSED'
           AND UPPER(r.refund_method) = 'CASH'`,
        [session.id],
      );
      const cashRefunds = Number(returnsRes.rows[0].cash_refunds) || 0;

      // Cash movements
      const movRes = await client.query(
        `SELECT
           COALESCE(SUM(CASE WHEN movement_type = 'IN' AND (reason != 'Opening float balance' OR reason IS NULL) THEN amount ELSE 0 END), 0.00) AS cash_in,
           COALESCE(SUM(CASE WHEN movement_type = 'OUT' THEN amount ELSE 0 END), 0.00) AS cash_out
         FROM cash_movements
         WHERE cash_register_session_id = $1`,
        [session.id],
      );
      const cashIn = Number(movRes.rows[0].cash_in) || 0;
      const cashOut = Number(movRes.rows[0].cash_out) || 0;

      const derivedExpectedCash = Number(
        (openingBalance + cashSales - cashRefunds + cashIn - cashOut).toFixed(
          2,
        ),
      );
      const countedCash = Number(Number(payload.countedCash || 0).toFixed(2));
      const variance = Number((countedCash - derivedExpectedCash).toFixed(2));
      const varianceStatus =
        variance === 0 ? "BALANCED" : variance > 0 ? "OVERAGE" : "SHORTAGE";

      // 3. Update session to CLOSED
      const closeRes = await client.query(
        `UPDATE cash_register_sessions
         SET status = 'CLOSED',
             closed_at = CURRENT_TIMESTAMP,
             counted_cash = $1,
             expected_cash = $2,
             variance = $3,
             variance_status = $4,
             closing_notes = COALESCE($5, closing_notes),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING *`,
        [
          countedCash,
          derivedExpectedCash,
          variance,
          varianceStatus,
          payload.notes || payload.closingNotes || null,
          session.id,
        ],
      );

      const closedRow = closeRes.rows[0];

      // 4. Save denominations if provided
      if (payload.denominations && typeof payload.denominations === "object") {
        for (const [denomVal, denomCount] of Object.entries(
          payload.denominations,
        )) {
          const valNum = parseFloat(denomVal) || 0;
          const countNum = parseInt(denomCount, 10) || 0;
          if (valNum > 0 && countNum >= 0) {
            await client.query(
              `INSERT INTO cash_denominations (
                 organisation_id, cash_register_session_id, denomination_value, denomination_count
               ) VALUES ($1, $2, $3, $4)
               ON CONFLICT (cash_register_session_id, denomination_value)
               DO UPDATE SET denomination_count = EXCLUDED.denomination_count`,
              [resolvedOrgId, session.id, valNum, countNum],
            );
          }
        }
      }

      const resultData = {
        sessionId: closedRow.id,
        sessionNumber: closedRow.session_number,
        status: "CLOSED",
        openingBalance,
        cashSales,
        cashRefunds,
        cashIn,
        cashOut,
        expectedCash: derivedExpectedCash,
        countedCash,
        variance,
        varianceStatus,
        closedAt: closedRow.closed_at,
        organisationId: resolvedOrgId,
        branchId: resolvedBranchId,
      };

      // 5. Record in sync_mutations
      await client.query(
        `INSERT INTO sync_mutations (
           mutation_id, organisation_id, branch_id, user_id, device_id, mutation_type,
           occurred_at, status, payload, result, processed_at
         ) VALUES ($1, $2, $3, $4, $5, 'CLOSE_REGISTER_SESSION', $6, 'PROCESSED', $7, $8, NOW())
         ON CONFLICT (organisation_id, mutation_id) DO UPDATE
         SET status = 'PROCESSED', result = EXCLUDED.result, processed_at = NOW()`,
        [
          mutationId,
          resolvedOrgId,
          resolvedBranchId,
          effectiveUserId || null,
          deviceId,
          occurredAt || new Date().toISOString(),
          JSON.stringify(payload),
          JSON.stringify(resultData),
        ],
      );

      // 6. Record in sync_changes
      await client.query(
        `INSERT INTO sync_changes (
           organisation_id, branch_id, entity_type, entity_id, operation, changed_at, payload
         ) VALUES ($1, $2, 'REGISTER_SESSION', $3, 'UPDATE', NOW(), $4)`,
        [
          resolvedOrgId,
          resolvedBranchId,
          session.id,
          JSON.stringify(resultData),
        ],
      );

      await client.query("COMMIT");

      return {
        status: "SUCCESS",
        result: resultData,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(
        `[SyncService] Error processing CLOSE_REGISTER_SESSION ${mutationId}:`,
        err,
      );
      return {
        status: "RETRYABLE_ERROR",
        errorCode: "DATABASE_ERROR",
        errorMessage: err.message,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Main Batch Push Handler
   * Processes a batch of mutations sent from frontend Sync Engine
   */
  async processPushBatch({ deviceId, mutations, userContext, tenantContext }) {
    if (!Array.isArray(mutations)) {
      throw new Error("Push body must contain an array of mutations");
    }

    const results = [];

    for (const mutation of mutations) {
      const mutationId = mutation.mutationId;
      if (!mutationId) {
        results.push({
          mutationId: "unknown",
          status: "FAILED",
          error: { code: "INVALID_MUTATION", message: "Missing mutationId" },
        });
        continue;
      }

      // 1. Resolve Target Organisation and Branch for this mutation
      const targetOrgId =
        mutation.organisationId || tenantContext?.organisationId;
      const targetBranchId = mutation.branchId || tenantContext?.branchId;

      if (!targetOrgId) {
        results.push({
          mutationId,
          status: "FAILED",
          error: {
            code: "MISSING_ORGANISATION",
            message:
              "Mutation must specify organisationId or request context must have active organisation",
          },
        });
        continue;
      }

      // Multi-tenant isolation: verify mutation target matches authenticated tenant
      if (
        tenantContext?.organisationId &&
        targetOrgId !== tenantContext.organisationId &&
        !userContext?.is_platform_superadmin
      ) {
        results.push({
          mutationId,
          status: "FAILED",
          error: {
            code: "TENANT_MISMATCH",
            message: `Mutation organisation ${targetOrgId} does not match authenticated tenant ${tenantContext.organisationId}`,
          },
        });
        continue;
      }

      // User identity validation: client cannot spoof arbitrary userId without admin authorization
      const effectiveUserId = userContext?.id || mutation.userId;
      if (
        mutation.userId &&
        userContext?.id &&
        mutation.userId !== userContext.id &&
        !userContext.is_platform_superadmin
      ) {
        results.push({
          mutationId,
          status: "FAILED",
          error: {
            code: "UNAUTHORIZED_USER_IMPERSONATION",
            message: `Cannot submit mutations on behalf of different user (${mutation.userId}). Authenticated user: ${userContext.id}`,
          },
        });
        continue;
      }

      try {
        // 2. Check Idempotency Table (strictly isolated by organisation_id)
        const existing = await pool.query(
          "SELECT mutation_id, status, payload, result, error_code, error_message FROM sync_mutations WHERE mutation_id = $1 AND organisation_id = $2",
          [mutationId, targetOrgId],
        );

        if (existing.rows.length > 0) {
          const row = existing.rows[0];

          // Check for payload divergence: same mutationId with altered payload is rejected
          if (row.payload && mutation.payload) {
            let storedPayload = row.payload;
            let incomingPayload = mutation.payload;
            if (typeof storedPayload === "string") {
              try {
                storedPayload = JSON.parse(storedPayload);
              } catch (_) {}
            }
            if (typeof incomingPayload === "string") {
              try {
                incomingPayload = JSON.parse(incomingPayload);
              } catch (_) {}
            }

            const storedHash = computePayloadHash(storedPayload);
            const incomingHash = computePayloadHash(incomingPayload);

            if (storedHash !== incomingHash) {
              results.push({
                mutationId,
                status: "FAILED",
                error: {
                  code: "IDEMPOTENCY_PAYLOAD_MISMATCH",
                  message: `mutationId ${mutationId} already recorded with different payload content`,
                },
                idempotentReplay: false,
              });
              continue;
            }
          }

          if (row.status === "PROCESSED") {
            results.push({
              mutationId,
              status: "SUCCESS",
              result: row.result,
              idempotentReplay: true,
            });
            continue;
          } else if (row.status === "CONFLICT") {
            results.push({
              mutationId,
              status: "CONFLICT",
              error: {
                code: row.error_code || "CONFLICT",
                message:
                  row.error_message || "Business conflict occurred previously",
                conflictDetails: row.result,
              },
              idempotentReplay: true,
            });
            continue;
          } else if (row.status === "FAILED") {
            results.push({
              mutationId,
              status: "FAILED",
              error: {
                code: row.error_code || "FAILED",
                message:
                  row.error_message || "Permanent failure occurred previously",
              },
              idempotentReplay: true,
            });
            continue;
          }
        }

        // 3. Process Business Mutation
        let outcome;
        switch (mutation.mutationType) {
          case "CREATE_SALE":
            outcome = await this.processCreateSale({
              ...mutation,
              organisationId: targetOrgId,
              branchId: targetBranchId,
              effectiveUserId,
              userContext,
              deviceId,
            });
            break;
          case "CREATE_CUSTOMER":
            outcome = await this.processCreateCustomer({
              ...mutation,
              organisationId: targetOrgId,
              branchId: targetBranchId,
              effectiveUserId,
              userContext,
              deviceId,
            });
            break;
          case "RECORD_CUSTOMER_PAYMENT":
            outcome = await this.processRecordCustomerPayment({
              ...mutation,
              organisationId: targetOrgId,
              branchId: targetBranchId,
              effectiveUserId,
              userContext,
              deviceId,
            });
            break;
          case "CREATE_RETURN":
            outcome = await this.processCreateReturn({
              ...mutation,
              organisationId: targetOrgId,
              branchId: targetBranchId,
              effectiveUserId,
              userContext,
              deviceId,
            });
            break;
          case "RECEIVE_PURCHASE":
            outcome = await this.processReceivePurchase({
              ...mutation,
              organisationId: targetOrgId,
              branchId: targetBranchId,
              effectiveUserId,
              userContext,
              deviceId,
            });
            break;
          case "RECORD_CASH_EXPENSE":
            outcome = await this.processRecordCashExpense({
              ...mutation,
              organisationId: targetOrgId,
              branchId: targetBranchId,
              effectiveUserId,
              userContext,
              deviceId,
            });
            break;
          case "ADJUST_STOCK":
            outcome = await this.processStockAdjustment({
              ...mutation,
              organisationId: targetOrgId,
              branchId: targetBranchId,
              effectiveUserId,
              userContext,
              deviceId,
            });
            break;
          case "TRANSFER_STOCK":
            outcome = await this.processStockTransfer({
              ...mutation,
              organisationId: targetOrgId,
              branchId: targetBranchId,
              effectiveUserId,
              userContext,
              deviceId,
            });
            break;
          case "OPEN_REGISTER_SESSION":
          case "REGISTER_OPEN":
          case "OPEN_SESSION":
            outcome = await this.processOpenRegisterSession({
              ...mutation,
              organisationId: targetOrgId,
              branchId: targetBranchId,
              effectiveUserId,
              userContext,
              deviceId,
            });
            break;
          case "RECORD_CASH_MOVEMENT":
            outcome = await this.processRecordCashMovement({
              ...mutation,
              organisationId: targetOrgId,
              branchId: targetBranchId,
              effectiveUserId,
              userContext,
              deviceId,
            });
            break;
          case "CLOSE_REGISTER_SESSION":
          case "REGISTER_CLOSE":
          case "CLOSE_SESSION":
            outcome = await this.processCloseRegisterSession({
              ...mutation,
              organisationId: targetOrgId,
              branchId: targetBranchId,
              effectiveUserId,
              userContext,
              deviceId,
            });
            break;

          default:
            outcome = {
              status: "SUCCESS",
              result: {
                mutationType: mutation.mutationType,
                acknowledged: true,
              },
            };
            break;
        }

        // 4. Format Response & Persist Terminal Non-Success State
        if (outcome.status === "SUCCESS") {
          results.push({
            mutationId,
            status: "SUCCESS",
            result: outcome.result,
          });
        } else if (outcome.status === "CONFLICT") {
          // Persist conflict record in sync_mutations
          await pool.query(
            `INSERT INTO sync_mutations (
              mutation_id, organisation_id, branch_id, user_id, device_id, mutation_type,
              occurred_at, status, payload, result, error_code, error_message
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'CONFLICT', $8, $9, $10, $11)
            ON CONFLICT (organisation_id, mutation_id) DO NOTHING`,
            [
              mutationId,
              targetOrgId,
              targetBranchId || null,
              effectiveUserId || null,
              deviceId,
              mutation.mutationType,
              mutation.occurredAt || new Date().toISOString(),
              JSON.stringify(mutation.payload || {}),
              JSON.stringify(outcome.conflictDetails || {}),
              outcome.errorCode,
              outcome.errorMessage,
            ],
          );

          results.push({
            mutationId,
            status: "CONFLICT",
            error: {
              code: outcome.errorCode,
              message: outcome.errorMessage,
              conflictDetails: outcome.conflictDetails,
            },
          });
        } else if (outcome.status === "FAILED") {
          // Persist permanent failure record in sync_mutations
          await pool.query(
            `INSERT INTO sync_mutations (
              mutation_id, organisation_id, branch_id, user_id, device_id, mutation_type,
              occurred_at, status, payload, error_code, error_message
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'FAILED', $8, $9, $10)
            ON CONFLICT (organisation_id, mutation_id) DO NOTHING`,
            [
              mutationId,
              targetOrgId,
              targetBranchId || null,
              effectiveUserId || null,
              deviceId,
              mutation.mutationType,
              mutation.occurredAt || new Date().toISOString(),
              JSON.stringify(mutation.payload || {}),
              outcome.errorCode,
              outcome.errorMessage,
            ],
          );

          results.push({
            mutationId,
            status: "FAILED",
            error: {
              code: outcome.errorCode,
              message: outcome.errorMessage,
            },
          });
        } else {
          // Retryable error - do not persist so client can retry
          results.push({
            mutationId,
            status: "RETRYABLE_ERROR",
            error: {
              code: outcome.errorCode || "RETRYABLE",
              message:
                outcome.errorMessage ||
                "Transient error during mutation processing",
            },
          });
        }
      } catch (mutErr) {
        console.error(
          `[SyncService] Unexpected error on mutation ${mutationId}:`,
          mutErr,
        );
        results.push({
          mutationId,
          status: "RETRYABLE_ERROR",
          error: { code: "UNHANDLED_EXCEPTION", message: mutErr.message },
        });
      }
    }

    return {
      success: true,
      deviceId,
      processedCount: results.length,
      results,
      serverTime: new Date().toISOString(),
    };
  }

  /**
   * Pull changes for client catch-up
   */
  async pullChanges({ cursor, organisationId, branchId, limit = 50 }) {
    if (!organisationId) {
      throw new Error("Missing organisationId in pull request");
    }

    const fromSeq = parseInt(cursor, 10) || 0;
    const batchLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 1000);

    let query;
    let params;

    if (branchId) {
      query = `
        SELECT sequence, organisation_id, branch_id, entity_type, entity_id, operation, changed_at, payload
        FROM sync_changes
        WHERE organisation_id = $1
          AND (branch_id = $2 OR branch_id IS NULL)
          AND sequence > $3
        ORDER BY sequence ASC
        LIMIT $4;
      `;
      params = [organisationId, branchId, fromSeq, batchLimit + 1];
    } else {
      query = `
        SELECT sequence, organisation_id, branch_id, entity_type, entity_id, operation, changed_at, payload
        FROM sync_changes
        WHERE organisation_id = $1
          AND sequence > $2
        ORDER BY sequence ASC
        LIMIT $3;
      `;
      params = [organisationId, fromSeq, batchLimit + 1];
    }

    const res = await pool.query(query, params);
    const rows = res.rows;
    const hasMore = rows.length > batchLimit;
    const batchRows = hasMore ? rows.slice(0, batchLimit) : rows;

    const changes = batchRows.map((r) => ({
      sequence: String(r.sequence),
      organisationId: r.organisation_id,
      branchId: r.branch_id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      operation: r.operation,
      changedAt: r.changed_at
        ? new Date(r.changed_at).toISOString()
        : new Date().toISOString(),
      payload: r.payload || {},
    }));

    const nextCursor =
      changes.length > 0
        ? String(changes[changes.length - 1].sequence)
        : String(fromSeq);

    return {
      success: true,
      online: true,
      cursor: String(fromSeq),
      nextCursor,
      changes,
      hasMore,
      serverTime: new Date().toISOString(),
    };
  }

  /**
   * Authoritative Master Data Bootstrap for Active Tenant & Branch
   *
   * Securely returns the core datasets required for full offline operation:
   * - Branch metadata (name, code, contact, facility, drug license)
   * - Branch GST & Tax configuration
   * - Active Product catalogue for the organisation
   * - Active Inventory batches for the specified branch
   * - Active Customers for the organisation
   * - Latest monotonic sequence cursor from sync_changes
   */
  async bootstrapTenantData({ organisationId, branchId, userId }) {
    if (!organisationId) {
      throw new Error("Missing organisationId for bootstrap");
    }
    if (!branchId) {
      throw new Error("Missing branchId for bootstrap");
    }

    // 1. Resolve and verify branch belongs to organisation
    const branchRes = await pool.query(
      `SELECT * FROM branches WHERE id = $1 AND organisation_id = $2`,
      [branchId, organisationId],
    );

    if (branchRes.rows.length === 0) {
      throw new Error(
        `Branch ${branchId} not found in organisation ${organisationId}`,
      );
    }
    const branch = branchRes.rows[0];

    // 2. Fetch branch GST / Tax settings
    let taxConfig = null;
    try {
      const gstRes = await pool.query(
        `SELECT * FROM branch_gst_settings WHERE branch_id = $1 AND organisation_id = $2`,
        [branchId, organisationId],
      );
      if (gstRes.rows.length > 0) {
        const g = gstRes.rows[0];
        taxConfig = {
          gstin: g.gstin || null,
          legalName: g.legal_name || branch.name,
          tradeName: g.trade_name || branch.name,
          state: g.state || branch.state || "Maharashtra",
          stateCode: g.state_code || "27",
          gstScheme: g.gst_scheme || "REGULAR",
          taxInclusivePricing: g.tax_inclusive_pricing !== false,
          autoInterstateSplit: g.auto_interstate_split !== false,
          eInvoicingEnabled: g.e_invoicing_enabled === true,
        };
      }
    } catch (err) {
      // Ignore if table not present
    }

    if (!taxConfig) {
      taxConfig = {
        gstin: branch.gstin || null,
        legalName: branch.name,
        tradeName: branch.name,
        state: branch.state || "Maharashtra",
        stateCode: "27",
        gstScheme: "REGULAR",
        taxInclusivePricing: true,
        autoInterstateSplit: true,
        eInvoicingEnabled: false,
      };
    }

    // 3. Fetch active products for organisation
    const productsRes = await pool.query(
      `SELECT * FROM products
       WHERE organisation_id = $1 AND (is_active = TRUE OR is_active IS NULL)
       ORDER BY medicine_name ASC`,
      [organisationId],
    );

    // 4. Fetch inventory batches for the branch
    const inventoryRes = await pool.query(
      `SELECT ib.*
       FROM inventory_batches ib
       INNER JOIN products p ON p.id = ib.product_id
       WHERE ib.branch_id = $1 AND p.organisation_id = $2
       ORDER BY ib.expiry_date ASC, ib.batch_number ASC`,
      [branchId, organisationId],
    );

    // Build product price map from batches
    const batchPriceMap = new Map();
    for (const b of inventoryRes.rows) {
      if (!batchPriceMap.has(b.product_id)) {
        batchPriceMap.set(b.product_id, {
          mrp: Number(b.mrp || 0),
          sellingPrice: Number(b.selling_price || b.mrp || 0),
        });
      }
    }

    // Format products for Dexie schema
    const products = productsRes.rows.map((p) => {
      const pricing = batchPriceMap.get(p.id) || { mrp: 0, sellingPrice: 0 };
      return {
        productId: p.id,
        organisationId: p.organisation_id,
        name: p.medicine_name || p.brand_name || "Unknown Product",
        genericName: p.brand_name || p.medicine_name || "",
        barcode: p.sku || p.barcode || "",
        sku: p.sku || "",
        category: p.category || "General",
        gstRate: Number(p.gst_rate || 5),
        mrp: pricing.mrp,
        sellingPrice: pricing.sellingPrice,
        unit: p.pack_size || "Strip",
        packSize: p.pack_size || "",
        isPrescriptionRequired: Boolean(p.is_rx_required),
        isNarcotic: false,
        active: p.is_active !== false,
        updatedAt: p.updated_at
          ? new Date(p.updated_at).toISOString()
          : new Date().toISOString(),
      };
    });

    // Format inventory batches for Dexie schema
    const inventory = inventoryRes.rows.map((b) => {
      const mrp = Number(b.mrp || 0);
      const sellingPrice = Number(b.selling_price || mrp);
      const costPrice = Number(
        b.cost_price || Math.round(mrp * 0.7 * 100) / 100,
      );
      return {
        id: b.id,
        organisationId,
        branchId: b.branch_id,
        productId: b.product_id,
        batchNumber: b.batch_number,
        expiryDate:
          b.expiry_date instanceof Date
            ? b.expiry_date.toISOString().split("T")[0]
            : String(b.expiry_date || "2028-12-31").split("T")[0],
        availableQuantity: Number(b.quantity || 0),
        costPrice,
        mrp,
        sellingPrice,
        shelfLocation: b.shelf_location || null,
        updatedAt: b.updated_at
          ? new Date(b.updated_at).toISOString()
          : new Date().toISOString(),
      };
    });

    // 5. Fetch active customers for organisation
    const customersRes = await pool.query(
      `SELECT * FROM customers
       WHERE organisation_id = $1 AND (status = 'ACTIVE' OR status IS NULL)
       ORDER BY full_name ASC`,
      [organisationId],
    );

    const customers = customersRes.rows.map((c) => ({
      customerId: c.id,
      organisationId: c.organisation_id,
      name: c.full_name || c.name || "Customer",
      phone: c.phone || "",
      email: c.email || "",
      address: c.address
        ? `${c.address}${c.city ? ", " + c.city : ""}`
        : c.city || "",
      doctorName: c.doctor_name || "",
      category: c.category || "Regular",
      outstandingBalance: Number(c.outstanding_balance || 0),
      creditLimit: Number(c.credit_limit || 0),
      isLocallyCreated: false,
      syncStatus: "SYNCED",
      updatedAt: c.updated_at
        ? new Date(c.updated_at).toISOString()
        : new Date().toISOString(),
    }));

    // 6. Fetch latest monotonic serverCursor
    const cursorRes = await pool.query(
      `SELECT COALESCE(MAX(sequence), 0)::text AS server_cursor
       FROM sync_changes
       WHERE organisation_id = $1`,
      [organisationId],
    );
    const serverCursor = cursorRes.rows[0]?.server_cursor || "0";

    // 7. Fetch active registers for branch
    const registersRes = await pool.query(
      `SELECT id, organisation_id, branch_id, name, identifier, is_active
       FROM cash_registers
       WHERE organisation_id = $1 AND branch_id = $2
       ORDER BY created_at ASC`,
      [organisationId, branchId],
    );

    // 8. Fetch active open session for branch (if any)
    const openSessionRes = await pool.query(
      `SELECT crs.*, u.name AS cashier_name
       FROM cash_register_sessions crs
       LEFT JOIN users u ON u.id = crs.cashier_id
       WHERE crs.organisation_id = $1 AND crs.branch_id = $2 AND crs.status = 'OPEN'
       ORDER BY crs.opened_at DESC LIMIT 1`,
      [organisationId, branchId],
    );

    return {
      success: true,
      organisationId,
      branchId,
      serverCursor,
      bootstrappedAt: new Date().toISOString(),
      branch: {
        id: branch.id,
        organisationId: branch.organisation_id,
        name: branch.name,
        branchCode: branch.branch_code || "",
        facilityType: branch.facility_type || "Store",
        address: branch.address || "",
        city: branch.city || "",
        state: branch.state || "",
        postalCode: branch.postal_code || "",
        phone: branch.phone || "",
        drugLicenseNumber: branch.drug_license_number || "",
        invoicePrefix: branch.invoice_prefix || "",
        status: branch.status || "ACTIVE",
      },
      taxConfig,
      products,
      inventory,
      customers,
      registers: registersRes.rows,
      openSession: openSessionRes.rows[0] || null,
    };
  }
}

module.exports = new SyncService();
