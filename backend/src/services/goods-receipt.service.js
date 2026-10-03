/**
 * Goods Receipt Service
 *
 * Business logic for goods receipt operations.
 */

const goodsReceiptRepo = require("../repositories/goods-receipt.repository");
const purchaseRepo = require("../repositories/purchase.repository");
const { pool } = require("../db/connection");
const auditService = require("./audit.service");

const normalizeStatus = (s) => {
  if (!s) return "PENDING_INSPECTION";
  const upper = String(s).toUpperCase().trim();
  if (upper === "VERIFIED") return "VERIFIED";
  if (upper === "DISCREPANCY") return "DISCREPANCY";
  return "PENDING_INSPECTION";
};

const getGoodsReceipts = async ({
  organisationId,
  purchaseId,
  limit = 50,
  offset = 0,
  branchId = null,
}) => {
  if (!organisationId) {
    throw new Error("organisationId is required");
  }

  if (purchaseId) {
    return await goodsReceiptRepo.getGoodsReceiptsByPurchase(
      organisationId,
      purchaseId,
      limit,
      offset,
    );
  }

  return await goodsReceiptRepo.getGoodsReceiptsByOrganisation(
    organisationId,
    limit,
    offset,
    branchId,
  );
};

const getGoodsReceiptById = async (organisationId, receiptId) => {
  if (!organisationId || !receiptId) {
    throw new Error("organisationId and receiptId are required");
  }

  const receipt = await goodsReceiptRepo.getGoodsReceiptById(
    organisationId,
    receiptId,
  );
  if (!receipt) return null;

  const items = await goodsReceiptRepo.getGoodsReceiptItems(
    organisationId,
    receiptId,
  );
  return {
    ...receipt,
    items,
  };
};

const createGoodsReceipt = async (receiptData) => {
  let {
    organisationId,
    purchaseId,
    poReference,
    supplier,
    supplierName,
    receiptNumber,
    receivedDate = new Date().toISOString().split("T")[0],
    receivedBy = null,
    supplierInvoiceNumber = null,
    packageCount = 1,
    status = "VERIFIED",
    notes = null,
    items = [],
  } = receiptData;

  if (!organisationId) {
    throw new Error("organisationId is required");
  }

  // 1. Resolve Branch
  let branchId = receiptData.branchId;
  if (branchId) {
    const bCheck = await pool.query(
      `SELECT id FROM branches WHERE (id::text = $1 OR name ILIKE $1) AND organisation_id = $2 AND status = 'ACTIVE' LIMIT 1;`,
      [branchId, organisationId],
    );
    branchId = bCheck.rows[0]?.id || null;
  }
  if (!branchId) {
    const bRes = await pool.query(
      `SELECT id FROM branches WHERE organisation_id = $1 AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1;`,
      [organisationId],
    );
    if (bRes.rows.length > 0) {
      branchId = bRes.rows[0].id;
    } else {
      const newB = await pool.query(
        `INSERT INTO branches (organisation_id, name) VALUES ($1, 'Main Branch') RETURNING id;`,
        [organisationId],
      );
      branchId = newB.rows[0].id;
    }
  }

  // 2. Resolve Supplier
  const sName = supplierName || supplier || "Sun Pharma Care";
  let supplierId = null;
  const sRes = await pool.query(
    `SELECT id FROM suppliers WHERE organisation_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1;`,
    [organisationId, sName],
  );
  if (sRes.rows.length > 0) {
    supplierId = sRes.rows[0].id;
  } else {
    const newS = await pool.query(
      `INSERT INTO suppliers (organisation_id, name) VALUES ($1, $2) RETURNING id;`,
      [organisationId, sName],
    );
    supplierId = newS.rows[0].id;
  }

  // 3. Resolve Purchase
  if (purchaseId) {
    const pCheck = await pool.query(
      `SELECT id, branch_id, supplier_id FROM purchases WHERE id = $1 AND organisation_id = $2 LIMIT 1;`,
      [purchaseId, organisationId],
    );
    if (pCheck.rows.length === 0) {
      const err = new Error(
        `Purchase order ${purchaseId} not found in this organisation.`,
      );
      err.statusCode = 404;
      throw err;
    }
    if (!branchId && pCheck.rows[0].branch_id) branchId = pCheck.rows[0].branch_id;
    if (!supplierId && pCheck.rows[0].supplier_id) supplierId = pCheck.rows[0].supplier_id;
  } else {
    const poNum = poReference || `PO-${Math.floor(1000 + Math.random() * 9000)}`;
    const poRes = await pool.query(
      `SELECT id, branch_id, supplier_id FROM purchases WHERE organisation_id = $1 AND purchase_number = $2 LIMIT 1;`,
      [organisationId, poNum],
    );

    if (poRes.rows.length > 0) {
      purchaseId = poRes.rows[0].id;
      if (!branchId && poRes.rows[0].branch_id) branchId = poRes.rows[0].branch_id;
      if (!supplierId && poRes.rows[0].supplier_id) supplierId = poRes.rows[0].supplier_id;
    } else {
      const newPO = await pool.query(
        `INSERT INTO purchases (organisation_id, purchase_number, supplier_id, branch_id, status)
         VALUES ($1, $2, $3, $4, 'RECEIVED') RETURNING id;`,
        [organisationId, poNum, supplierId, branchId],
      );
      purchaseId = newPO.rows[0].id;
    }
  }

  // 4. Resolve products and purchase_items for each received line item
  const resolvedItems = [];
  for (const it of items) {
    const qty = Number(it.quantity || it.receivedQuantity || 1);
    const cost = Number(it.costPrice || it.unitCost || 100);
    const mrp = Number(it.mrp || it.sellingPrice || 130);
    const batchNo = it.batchNumber || `BAT-${Math.floor(1000 + Math.random() * 9000)}`;
    const expiryDate = it.expiryDate || "2028-12-31";
    const medName = it.productName || it.name || "Medicine";

    let productId = it.productId;
    if (productId) {
      const prodCheck = await pool.query(
        `SELECT id FROM products WHERE id::text = $1 AND organisation_id = $2 LIMIT 1;`,
        [productId, organisationId],
      );
      if (prodCheck.rows.length > 0) {
        productId = prodCheck.rows[0].id;
      } else {
        productId = null;
      }
    }

    if (!productId) {
      const prodSearch = await pool.query(
        `SELECT id FROM products WHERE organisation_id = $1 AND (LOWER(medicine_name) = LOWER($2) OR LOWER(brand_name) = LOWER($2)) LIMIT 1;`,
        [organisationId, medName],
      );
      if (prodSearch.rows.length > 0) {
        productId = prodSearch.rows[0].id;
      } else {
        const newProd = await pool.query(
          `INSERT INTO products (organisation_id, medicine_name, brand_name, sku)
           VALUES ($1, $2, $2, $3) RETURNING id;`,
          [organisationId, medName, `SKU-${Math.floor(1000 + Math.random() * 9000)}`],
        );
        productId = newProd.rows[0].id;
      }
    }

    let purchaseItemId = it.purchaseItemId;
    if (purchaseItemId) {
      const piCheck = await pool.query(
        `SELECT id FROM purchase_items WHERE id = $1 LIMIT 1;`,
        [purchaseItemId],
      );
      if (piCheck.rows.length === 0) purchaseItemId = null;
    }
    if (!purchaseItemId) {
      const piSearch = await pool.query(
        `SELECT id FROM purchase_items WHERE purchase_id = $1 AND product_id = $2 LIMIT 1;`,
        [purchaseId, productId],
      );
      if (piSearch.rows.length > 0) {
        purchaseItemId = piSearch.rows[0].id;
      } else {
        const newPI = await pool.query(
          `INSERT INTO purchase_items (purchase_id, product_id, ordered_quantity, unit_cost)
           VALUES ($1, $2, $3, $4) RETURNING id;`,
          [purchaseId, productId, qty, cost],
        );
        purchaseItemId = newPI.rows[0].id;
      }
    }

    resolvedItems.push({
      purchaseItemId,
      receivedQuantity: qty,
      rejectedQuantity: Number(it.rejectedQuantity || 0),
      productId,
      productName: medName,
      batchNumber: batchNo,
      expiryDate,
      costPrice: cost,
      mrp,
    });
  }

  // Let the repository assign the receipt number from the shared
  // organisation-scoped sequence (number_sequences / GOODS_RECEIPT) when the
  // caller doesn't supply one. A randomly generated "GRN-2026-0###" number
  // only has 900 possible values, so it regularly collided with the
  // UNIQUE (organisation_id, receipt_number) constraint and made
  // "Receive Shipment" fail intermittently with a duplicate-key error.
  const receipt = await goodsReceiptRepo.createGoodsReceipt({
    organisationId,
    purchaseId,
    receiptNumber,
    receivedDate,
    receivedBy,
    supplierInvoiceNumber,
    packageCount: Number(packageCount) || 1,
    status: normalizeStatus(status),
    notes,
    items: resolvedItems,
  });

  // 5. Persist received stock directly into inventory_batches
  for (const item of resolvedItems) {
    const existingBatch = await pool.query(
      `SELECT id, quantity FROM inventory_batches
       WHERE product_id = $1 AND branch_id = $2 AND batch_number = $3
       LIMIT 1;`,
      [item.productId, branchId, item.batchNumber],
    );

    if (existingBatch.rows.length > 0) {
      await pool.query(
        `UPDATE inventory_batches
         SET quantity = quantity + $1,
             mrp = COALESCE($2, mrp),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3;`,
        [item.receivedQuantity, item.mrp, existingBatch.rows[0].id],
      );
    } else {
      await pool.query(
        `INSERT INTO inventory_batches (
           product_id, branch_id, supplier_id, batch_number, expiry_date, mrp, quantity, shelf_location
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
        [
          item.productId,
          branchId,
          supplierId,
          item.batchNumber,
          item.expiryDate,
          item.mrp,
          item.receivedQuantity,
          "A1-S1",
        ],
      );
    }
  }

  // 6. Record Audit Log for the purchase receipt
  try {
    await auditService.log({
      organisationId,
      userId: receivedBy,
      action: "PURCHASE_RECEIPT",
      entityType: "GOODS_RECEIPT",
      entityId: receipt.id,
      metadata: {
        receiptNumber: receipt.receipt_number,
        purchaseId,
        itemsReceived: resolvedItems.map((i) => ({
          product: i.productName,
          batch: i.batchNumber,
          qty: i.receivedQuantity,
        })),
      },
    });
  } catch (auditErr) {
    console.warn("Goods receipt audit logging warning:", auditErr.message);
  }

  return receipt;
};

const updateGoodsReceiptStatus = async ({
  organisationId,
  receiptId,
  status,
}) => {
  if (!organisationId || !receiptId) {
    throw new Error("organisationId and receiptId are required");
  }

  const dbStatus = normalizeStatus(status);

  // Try updating by UUID or receipt_number
  const res = await pool.query(
    `UPDATE goods_receipts
     SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE (id::text = $2 OR receipt_number = $2)
       AND organisation_id = $3
     RETURNING *;`,
    [dbStatus, receiptId, organisationId],
  );

  if (res.rows.length === 0) {
    const error = new Error(`Goods receipt ${receiptId} not found`);
    error.statusCode = 404;
    throw error;
  }

  return res.rows[0];
};

module.exports = {
  getGoodsReceipts,
  getGoodsReceiptById,
  createGoodsReceipt,
  updateGoodsReceiptStatus,
};
