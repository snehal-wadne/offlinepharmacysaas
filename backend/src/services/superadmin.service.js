/**
 * Superadmin Platform Service
 *
 * Orchestrates business rules, PostgreSQL transactions, and Razorpay interactions for:
 * 1. Pharmacy Onboarding (Flow A: Superadmin-Assisted & Flow B: Self-Service)
 * 2. Payment Order Creation & Gateway Coordination
 * 3. Payment Verification & Atomic Activation Transaction
 * 4. Crash-Safe Idempotent Webhook Processing
 * 5. Two-Phase Refund Reservation & Gateway Settlement
 * 6. Subscription Renewals & Plan Upgrades
 * 7. Tenant Lifecycle Management (ACTIVE, SUSPENDED, DEACTIVATED)
 * 8. Cache-aside management with safe post-commit invalidation
 */

const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { pool } = require("../db/connection");
const {
  getCache,
  setCache,
  deleteCache,
  deleteMatchingKeys,
} = require("../cache/cache");
const razorpayService = require("./razorpay.service");
const {
  getNextBusinessNumber,
} = require("../repositories/number-sequence.repository");
const {
  seedOrganisationSystemRoles,
} = require("../repositories/role.repository");
const platformTaxRepo = require("../repositories/platform-tax.repository");
const platformBusinessRepo = require("../repositories/platform-business.repository");
const subscriptionPlanRepo = require("../repositories/subscription-plan.repository");
const subscriptionRepo = require("../repositories/subscription.repository");
const platformPaymentRepo = require("../repositories/platform-payment.repository");
const platformRefundRepo = require("../repositories/platform-refund.repository");
const subscriptionInvoiceRepo = require("../repositories/subscription-invoice.repository");
const razorpayWebhookRepo = require("../repositories/razorpay-webhook.repository");
const platformPharmacyRepo = require("../repositories/platform-pharmacy.repository");
const platformDashboardRepo = require("../repositories/platform-dashboard.repository");

class SuperadminService {
  /**
   * Safely invalidate all Superadmin platform caches after commit.
   */
  async invalidatePlatformCache(organisationId = null) {
    try {
      await Promise.all([
        deleteCache("platform:dashboard:metrics"),
        deleteCache("platform:dashboard:charts"),
        deleteCache("platform:dashboard:recent"),
        deleteMatchingKeys("platform:pharmacies:list:*"),
        deleteMatchingKeys("platform:payments:*"),
      ]);
      if (organisationId) {
        await deleteCache(`subscription:org:${organisationId}`);
      }
    } catch (err) {
      console.warn("Non-fatal platform cache invalidation error:", err.message);
    }
  }

  /**
   * Calculate authoritative tax and pricing for a plan.
   */
  async calculatePlanTaxAndPricing({ plan, buyerState = "Maharashtra" }) {
    const taxConfig = await platformTaxRepo.getActiveTaxConfig();
    const businessConfig = await platformBusinessRepo.getActiveBusinessConfig();

    const sellerState =
      (businessConfig && businessConfig.state) || "Maharashtra";
    const baseAmount = Number(plan.price);
    const gstRate = Number(taxConfig.rate_percent || 18.0);

    const isInterstate =
      buyerState && sellerState
        ? buyerState.trim().toLowerCase() !== sellerState.trim().toLowerCase()
        : false;

    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    if (isInterstate) {
      igstAmount = Math.round(baseAmount * (gstRate / 100) * 100) / 100;
    } else {
      const halfRate = gstRate / 200;
      cgstAmount = Math.round(baseAmount * halfRate * 100) / 100;
      sgstAmount = Math.round(baseAmount * halfRate * 100) / 100;
    }

    const gstAmount = isInterstate ? igstAmount : cgstAmount + sgstAmount;
    const totalAmount = baseAmount + gstAmount;

    return {
      baseAmount,
      gstRate,
      cgstAmount,
      sgstAmount,
      igstAmount,
      gstAmount,
      totalAmount,
      isInterstate,
      sellerConfig: businessConfig,
      sacCode: taxConfig.sac_code || "998313",
    };
  }

  /**
   * Provision Pharmacy & Owner in PENDING_PAYMENT state (Flow A & Flow B).
   *
   * Creates:
   * 1. Owner user
   * 2. Organisation (status = 'PENDING_PAYMENT')
   * 3. Default branch ('Main Branch')
   * 4. System roles (Administrator)
   * 5. Organisation membership & Administrator branch assignment
   * 6. Subscription (status = 'PENDING_PAYMENT')
   * 7. Razorpay Order & platform payment record (status = 'PENDING')
   */
  async provisionPharmacy({
    name,
    adminName,
    email,
    phone,
    password,
    address,
    city,
    state,
    pincode,
    gstNumber = "",
    businessType = "Private Limited",
    planId,
    planName,
    planTier,
    billingCycle = "ANNUAL",
  }) {
    if (!name || !email || !adminName) {
      throw new Error("Pharmacy name, admin name, and email are required.");
    }

    let normalizedBillingCycle = "ANNUAL";
    if (billingCycle) {
      const upper = String(billingCycle).trim().toUpperCase();
      if (upper === "MONTHLY") {
        normalizedBillingCycle = "MONTHLY";
      } else if (upper === "CUSTOM") {
        normalizedBillingCycle = "CUSTOM";
      } else {
        normalizedBillingCycle = "ANNUAL";
      }
    }

    const client = await pool.connect();
    let organisation;
    let subscription;
    let plan;
    let initialPassword = null;

    try {
      await client.query("BEGIN");

      // 1. Validate plan
      if (planId) {
        plan = await subscriptionPlanRepo.getPlanById(planId, client);
      }
      if (!plan && planName) {
        plan = await subscriptionPlanRepo.getPlanByTierCode(planName, client);
      }
      if (!plan && planTier) {
        plan = await subscriptionPlanRepo.getPlanByTierCode(planTier, client);
      }
      if (!plan) {
        plan = await subscriptionPlanRepo.getPlanByTierCode(
          "PROFESSIONAL",
          client,
        );
      }
      if (!plan) {
        throw new Error("Specified subscription plan was not found.");
      }

      // 2. Create or verify owner user
      const existingUser = await client.query(
        "SELECT id, email, status FROM users WHERE email = $1 LIMIT 1",
        [email.trim().toLowerCase()],
      );

      let ownerId;

      if (existingUser.rows.length > 0) {
        ownerId = existingUser.rows[0].id;
        initialPassword = password || "(Existing account password)";
      } else {
        const generateTempPassword = () => {
          const chars =
            "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
          let rand = "";
          const bytes = crypto.randomBytes(6);
          for (let i = 0; i < 6; i++) {
            rand += chars[bytes[i] % chars.length];
          }
          return `PF@${rand}#${new Date().getFullYear()}`;
        };

        initialPassword = password || generateTempPassword();
        const passwordHash = await bcrypt.hash(initialPassword, 10);

        const insertUserRes = await client.query(
          `INSERT INTO users (name, email, phone, password_hash, status)
           VALUES ($1, $2, $3, $4, 'ACTIVE')
           RETURNING id;`,
          [adminName, email.trim().toLowerCase(), phone || null, passwordHash],
        );
        ownerId = insertUserRes.rows[0].id;
      }

      // 3. Generate sequential Pharmacy Code (e.g. PHARM-1001)
      const pharmacyCode = await getNextBusinessNumber({
        sequenceType: "PHARMACY_CODE",
        client,
      });

      // 4. Create Organisation in PENDING_PAYMENT state
      const insertOrgRes = await client.query(
        `INSERT INTO organisations (
           owner_id, name, pharmacy_code, admin_name, email, phone,
           address, city, state, pincode, gst_number, business_type, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDING_PAYMENT')
         RETURNING *;`,
        [
          ownerId,
          name,
          pharmacyCode,
          adminName,
          email.trim().toLowerCase(),
          phone || null,
          address || "Registered Address",
          city || "City",
          state || "Maharashtra",
          pincode || "400001",
          gstNumber || null,
          businessType || "Private Limited",
        ],
      );
      organisation = insertOrgRes.rows[0];

      // 5. Create Default Branch ('Main Branch')
      const branchCode = await getNextBusinessNumber({
        organisationId: organisation.id,
        sequenceType: "BRANCH",
        client,
      });

      const insertBranchRes = await client.query(
        `INSERT INTO branches (
           organisation_id, branch_code, name, facility_type,
           address, city, state, postal_code, phone, status
         )
         VALUES ($1, $2, 'Main Branch', 'RETAIL_DISPENSARY', $3, $4, $5, $6, $7, 'ACTIVE')
         RETURNING id;`,
        [
          organisation.id,
          branchCode,
          address || "Registered Address",
          city || "City",
          state || "Maharashtra",
          pincode || "400001",
          phone || null,
        ],
      );
      const defaultBranchId = insertBranchRes.rows[0].id;

      // 6. Seed default system roles (including Administrator)
      await seedOrganisationSystemRoles(organisation.id, client);

      const adminRoleRes = await client.query(
        `SELECT id FROM roles 
         WHERE organisation_id = $1 AND (role_identifier = 'ADMIN' OR name = 'Administrator')
         LIMIT 1;`,
        [organisation.id],
      );
      const adminRoleId = adminRoleRes.rows[0].id;

      // 7. Create organisation membership
      const insertMemRes = await client.query(
        `INSERT INTO organisation_memberships (organisation_id, user_id, status)
         VALUES ($1, $2, 'ACTIVE')
         RETURNING id;`,
        [organisation.id, ownerId],
      );
      const membershipId = insertMemRes.rows[0].id;

      // 8. Create Administrator branch assignment on default branch
      await client.query(
        `INSERT INTO branch_assignments (membership_id, branch_id, role_id, is_primary)
         VALUES ($1, $2, $3, TRUE);`,
        [membershipId, defaultBranchId, adminRoleId],
      );

      // 9. Create Subscription in PENDING_PAYMENT state
      const insertSubRes = await client.query(
        `INSERT INTO subscriptions (
           organisation_id, plan_id, status, billing_cycle, started_at
         )
         VALUES ($1, $2, 'PENDING_PAYMENT', $3, CURRENT_TIMESTAMP)
         RETURNING *;`,
        [organisation.id, plan.id, normalizedBillingCycle],
      );
      subscription = insertSubRes.rows[0];

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    // 10. Generate Razorpay Order and PENDING platform payment record outside the first TX
    const paymentOrder = await this.createPaymentOrder({
      organisationId: organisation.id,
      subscriptionId: subscription.id,
      plan,
      billingCycle: normalizedBillingCycle,
      transactionType: "NEW_ONBOARDING",
    });

    return {
      organisation,
      subscription,
      paymentOrder,
      credentials: {
        email: email.trim().toLowerCase(),
        temporaryPassword: initialPassword,
      },
    };
  }

  /**
   * Create Razorpay Order and record PENDING platform_subscription_payments row.
   */
  async createPaymentOrder({
    organisationId,
    subscriptionId,
    plan,
    billingCycle = "ANNUAL",
    transactionType = "NEW_ONBOARDING",
  }) {
    const org =
      await platformPharmacyRepo.getPharmacyDetailById(organisationId);
    if (!org) {
      throw new Error(`Organisation not found: ${organisationId}`);
    }

    if (!plan) {
      const sub = await subscriptionRepo.getSubscriptionById(subscriptionId);
      plan = await subscriptionPlanRepo.getPlanById(sub.plan_id);
    }

    // Authoritative tax & price calculation
    const pricing = await this.calculatePlanTaxAndPricing({
      plan,
      buyerState: org.state || "Maharashtra",
    });

    const client = await pool.connect();
    let paymentReference;
    try {
      await client.query("BEGIN");
      paymentReference = await getNextBusinessNumber({
        sequenceType: "PLATFORM_PAYMENT",
        client,
      });
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    // Create Razorpay Order
    const amountPaise = Math.round(pricing.totalAmount * 100);
    const order = await razorpayService.createOrder({
      amountPaise,
      currency: "INR",
      receipt: paymentReference,
      notes: {
        organisationId,
        subscriptionId,
        transactionType,
      },
    });

    // Save platform_subscription_payments row in PENDING state
    const payment = await platformPaymentRepo.createPayment({
      paymentReference,
      organisationId,
      subscriptionId,
      transactionType,
      razorpayOrderId: order.id,
      currency: "INR",
      baseAmount: pricing.baseAmount,
      gstRate: pricing.gstRate,
      cgstAmount: pricing.cgstAmount,
      sgstAmount: pricing.sgstAmount,
      igstAmount: pricing.igstAmount,
      totalAmount: pricing.totalAmount,
      paymentMethod: "RAZORPAY",
      status: "PENDING",
    });

    return {
      paymentId: payment.id,
      paymentReference,
      razorpayOrderId: order.id,
      amount: order.amount,
      currency: "INR",
      keyId: razorpayService.keyId,
      baseAmount: pricing.baseAmount,
      gstAmount: pricing.gstAmount,
      totalAmount: pricing.totalAmount,
    };
  }

  /**
   * Verify Razorpay payment and execute Atomic Activation Transaction.
   */
  async verifyAndActivatePayment({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  }) {
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      throw new Error(
        "razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.",
      );
    }

    // 1. Cryptographic HMAC Signature Verification
    const isSignatureValid = razorpayService.verifyPaymentSignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!isSignatureValid) {
      throw new Error(
        "Payment signature verification failed. Possible forgery attempt.",
      );
    }

    // 2. Authoritative Gateway Payment Fetch
    const gatewayPayment = await razorpayService.fetchPayment(
      razorpayPaymentId,
      razorpayOrderId,
    );

    // 3. Find stored internal payment record
    const storedPayment =
      await platformPaymentRepo.getPaymentByRazorpayOrderId(razorpayOrderId);
    if (!storedPayment) {
      throw new Error(
        `Platform payment not found for Razorpay order: ${razorpayOrderId}`,
      );
    }

    // 4. Strict Validation of Gateway Attributes
    const expectedPaise = Math.round(Number(storedPayment.total_amount) * 100);
    if (gatewayPayment.order_id !== storedPayment.razorpay_order_id) {
      throw new Error("Razorpay payment order mismatch.");
    }
    if (Number(gatewayPayment.amount) !== expectedPaise) {
      throw new Error(
        `Payment amount mismatch. Expected ₹${storedPayment.total_amount} (${expectedPaise} paise), but gateway received ${gatewayPayment.amount} paise.`,
      );
    }
    if (gatewayPayment.currency !== storedPayment.currency) {
      throw new Error(
        `Currency mismatch. Expected ${storedPayment.currency} but got ${gatewayPayment.currency}`,
      );
    }
    if (
      gatewayPayment.status !== "captured" &&
      gatewayPayment.status !== "authorized"
    ) {
      throw new Error(
        `Payment is not in captured status (current status: ${gatewayPayment.status}).`,
      );
    }

    // 5. Atomic Activation Transaction
    const client = await pool.connect();
    let invoiceNumber = null;
    try {
      await client.query("BEGIN");

      // Lock payment row FOR UPDATE
      const lockedPayment = await platformPaymentRepo.getPaymentForUpdate(
        storedPayment.id,
        client,
      );

      // Idempotency: If already marked SUCCESS, return existing record
      if (lockedPayment.status === "SUCCESS") {
        await client.query("COMMIT");
        return {
          success: true,
          alreadyProcessed: true,
          organisationId: storedPayment.organisation_id,
          subscriptionId: storedPayment.subscription_id,
          paymentReference: storedPayment.payment_reference,
        };
      }

      // Lock subscription row FOR UPDATE
      const subRes = await client.query(
        "SELECT * FROM subscriptions WHERE id = $1 FOR UPDATE",
        [storedPayment.subscription_id],
      );
      const sub = subRes.rows[0];

      // Calculate period dates
      const now = new Date();
      let currentPeriodStart = now;
      let currentPeriodEnd;

      const cycleIntervalMonths = sub.billing_cycle === "MONTHLY" ? 1 : 12;

      if (
        storedPayment.transaction_type === "RENEWAL" &&
        sub.status === "ACTIVE" &&
        sub.current_period_end &&
        new Date(sub.current_period_end) > now
      ) {
        // Additive renewal for already active subscription
        currentPeriodStart = new Date(sub.current_period_start);
        currentPeriodEnd = new Date(sub.current_period_end);
        currentPeriodEnd.setMonth(
          currentPeriodEnd.getMonth() + cycleIntervalMonths,
        );
      } else {
        // Standard start or restarted expired subscription
        currentPeriodEnd = new Date(now);
        currentPeriodEnd.setMonth(
          currentPeriodEnd.getMonth() + cycleIntervalMonths,
        );
      }

      // Update subscription to ACTIVE
      await client.query(
        `UPDATE subscriptions
         SET status = 'ACTIVE',
             current_period_start = $1,
             current_period_end = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3;`,
        [currentPeriodStart, currentPeriodEnd, sub.id],
      );

      // Update organisation to ACTIVE
      await client.query(
        `UPDATE organisations
         SET status = 'ACTIVE',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1;`,
        [storedPayment.organisation_id],
      );

      // Generate B2B SaaS Tax Invoice
      invoiceNumber = await getNextBusinessNumber({
        sequenceType: "SAAS_INVOICE",
        client,
      });

      const orgDetails = await platformPharmacyRepo.getPharmacyDetailById(
        storedPayment.organisation_id,
        client,
      );
      const businessConfig =
        await platformBusinessRepo.getActiveBusinessConfig(client);

      await subscriptionInvoiceRepo.createInvoice(
        {
          invoiceNumber,
          organisationId: storedPayment.organisation_id,
          subscriptionId: storedPayment.subscription_id,
          paymentId: storedPayment.id,
          sellerLegalName:
            (businessConfig && businessConfig.legal_name) ||
            "PharmaFlow Technologies",
          sellerGstin:
            (businessConfig && businessConfig.gstin) || "27AABCU9603R1ZM",
          sellerAddress:
            (businessConfig && businessConfig.address_line1) ||
            "Mumbai, Maharashtra",
          sellerState:
            (businessConfig && businessConfig.state) || "Maharashtra",
          buyerLegalName: orgDetails.name,
          buyerGstin: orgDetails.gst_number || null,
          buyerAddress: orgDetails.address || "Registered Address",
          buyerState: orgDetails.state || "Maharashtra",
          sacCode: "998313",
          billingPeriodStart: currentPeriodStart,
          billingPeriodEnd: currentPeriodEnd,
          taxableAmount: storedPayment.base_amount,
          gstRate: storedPayment.gst_rate,
          isInterstate: Number(storedPayment.igst_amount) > 0,
          cgstAmount: storedPayment.cgst_amount,
          sgstAmount: storedPayment.sgst_amount,
          igstAmount: storedPayment.igst_amount,
          totalAmount: storedPayment.total_amount,
          status: "PAID",
        },
        client,
      );

      // Update payment to SUCCESS
      await client.query(
        `UPDATE platform_subscription_payments
         SET status = 'SUCCESS',
             razorpay_payment_id = $1,
             razorpay_signature = $2,
             paid_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3;`,
        [razorpayPaymentId, razorpaySignature, storedPayment.id],
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    // Post-commit cache invalidation
    await this.invalidatePlatformCache(storedPayment.organisation_id);

    return {
      success: true,
      organisationId: storedPayment.organisation_id,
      subscriptionId: storedPayment.subscription_id,
      paymentReference: storedPayment.payment_reference,
      invoiceNumber,
    };
  }

  /**
   * Process Razorpay Webhook Event with Crash-Safe Idempotency Ledger.
   */
  async processWebhookEvent({
    eventId,
    eventType,
    payload,
    signature,
    rawBody,
  }) {
    // 1. Signature Verification
    const isSignatureValid = razorpayService.verifyWebhookSignature({
      rawBody,
      signature,
    });
    if (!isSignatureValid) {
      throw new Error("Invalid Razorpay webhook signature.");
    }

    // 2. Record Event in Ledger
    const entity =
      payload.payload?.payment?.entity || payload.payload?.order?.entity || {};
    const razorpayOrderId =
      entity.order_id || (payload.event === "order.paid" ? entity.id : null);
    const razorpayPaymentId =
      entity.id && entity.id.startsWith("pay_") ? entity.id : null;

    const eventRecord = await razorpayWebhookRepo.recordWebhookEvent({
      eventId,
      eventType,
      razorpayOrderId,
      razorpayPaymentId,
      payload,
    });

    // 3. Check State
    if (eventRecord.status === "PROCESSED") {
      return {
        status: "PROCESSED",
        message: "Event already processed previously.",
      };
    }

    // Mark as PROCESSING
    await razorpayWebhookRepo.updateWebhookStatus(eventId, {
      status: "PROCESSING",
      incrementAttempts: true,
    });

    try {
      if (eventType === "payment.captured" || eventType === "order.paid") {
        if (razorpayOrderId) {
          const storedPayment =
            await platformPaymentRepo.getPaymentByRazorpayOrderId(
              razorpayOrderId,
            );
          if (storedPayment && storedPayment.status === "PENDING") {
            // Trigger activation transaction
            await this.verifyAndActivatePayment({
              razorpayOrderId,
              razorpayPaymentId:
                razorpayPaymentId || storedPayment.razorpay_payment_id,
              razorpaySignature: "webhook_verified",
            });
          }
        }
      } else if (eventType === "payment.failed") {
        if (razorpayOrderId) {
          const storedPayment =
            await platformPaymentRepo.getPaymentByRazorpayOrderId(
              razorpayOrderId,
            );
          if (storedPayment && storedPayment.status === "PENDING") {
            await platformPaymentRepo.updatePayment(storedPayment.id, {
              status: "FAILED",
              errorCode: entity.error_code,
              errorDescription: entity.error_description,
            });
          }
        }
      }

      // Mark event PROCESSED
      await razorpayWebhookRepo.updateWebhookStatus(eventId, {
        status: "PROCESSED",
        processedAt: new Date(),
      });

      return {
        status: "PROCESSED",
        message: "Webhook successfully processed.",
      };
    } catch (err) {
      await razorpayWebhookRepo.updateWebhookStatus(eventId, {
        status: "FAILED",
        errorMessage: err.message,
      });
      throw err;
    }
  }

  /**
   * Process Two-Phase Refund with Gateway Idempotency Key.
   */
  async processRefund({ paymentId, amount, reason, processedBy = null }) {
    if (!paymentId || !amount || amount <= 0) {
      throw new Error(
        "Valid paymentId and positive refund amount are required.",
      );
    }

    const client = await pool.connect();
    let reservation;
    let payment;

    // Phase 1: DB Reservation inside Short Transaction
    try {
      await client.query("BEGIN");

      payment = await platformPaymentRepo.getPaymentForUpdate(
        paymentId,
        client,
      );
      if (!payment) {
        throw new Error(`Payment not found: ${paymentId}`);
      }

      if (
        payment.status !== "SUCCESS" &&
        payment.status !== "PARTIALLY_REFUNDED"
      ) {
        throw new Error(`Cannot refund payment with status: ${payment.status}`);
      }

      const refundSums = await platformRefundRepo.sumRefundsForPayment(
        paymentId,
        client,
      );
      const totalCommitted = Number(refundSums.total_committed || 0);
      const totalPaid = Number(payment.total_amount);

      if (totalCommitted + Number(amount) > totalPaid) {
        throw new Error(
          `Refund amount exceeds allowable limit. Paid: ₹${totalPaid}, Already Refunded/Pending: ₹${totalCommitted}, Requested: ₹${amount}`,
        );
      }

      const refundReference = await getNextBusinessNumber({
        sequenceType: "PLATFORM_REFUND",
        client,
      });

      reservation = await platformRefundRepo.createRefundReservation(
        {
          paymentId,
          refundReference,
          amount,
          currency: payment.currency || "INR",
          reason: reason || "Administrative Refund",
          processedBy,
        },
        client,
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    // Phase 2: Call Gateway OUTSIDE DB Transaction
    let gatewayRefund;
    let gatewayError = null;

    try {
      const amountPaise = Math.round(Number(amount) * 100);
      gatewayRefund = await razorpayService.createRefund({
        paymentId: payment.razorpay_payment_id,
        amountPaise,
        refundReference: reservation.refund_reference,
        reason,
      });
    } catch (err) {
      gatewayError = err;
    }

    // Phase 3: Finalize Reservation in DB
    const finalClient = await pool.connect();
    try {
      await finalClient.query("BEGIN");

      if (gatewayError) {
        await platformRefundRepo.finalizeRefund(
          reservation.id,
          {
            status: "FAILED",
            errorMessage: gatewayError.message,
          },
          finalClient,
        );
        await finalClient.query("COMMIT");
        throw new Error(
          `Razorpay refund dispatch failed: ${gatewayError.message}`,
        );
      }

      await platformRefundRepo.finalizeRefund(
        reservation.id,
        {
          razorpayRefundId: gatewayRefund.id,
          status: "PROCESSED",
        },
        finalClient,
      );

      // Recalculate processed total
      const postRefundSums = await platformRefundRepo.sumRefundsForPayment(
        paymentId,
        finalClient,
      );
      const totalProcessed = Number(postRefundSums.total_processed || 0);
      const totalPaid = Number(payment.total_amount);

      const newPaymentStatus =
        totalProcessed >= totalPaid ? "REFUNDED" : "PARTIALLY_REFUNDED";

      await finalClient.query(
        `UPDATE platform_subscription_payments
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2;`,
        [newPaymentStatus, paymentId],
      );

      await finalClient.query("COMMIT");
    } catch (err) {
      await finalClient.query("ROLLBACK");
      throw err;
    } finally {
      finalClient.release();
    }

    // Post-commit cache invalidation
    await this.invalidatePlatformCache(payment.organisation_id);

    return {
      success: true,
      refundReference: reservation.refund_reference,
      razorpayRefundId: gatewayRefund.id,
      amount,
      status: "PROCESSED",
    };
  }

  /**
   * Initiate subscription renewal payment order.
   */
  async renewSubscription({
    organisationId,
    planId = null,
    billingCycle = "ANNUAL",
  }) {
    let normalizedCycle = "ANNUAL";
    if (billingCycle) {
      const upper = String(billingCycle).trim().toUpperCase();
      if (upper === "MONTHLY") normalizedCycle = "MONTHLY";
      else if (upper === "CUSTOM") normalizedCycle = "CUSTOM";
      else normalizedCycle = "ANNUAL";
    }

    const org =
      await platformPharmacyRepo.getPharmacyDetailById(organisationId);
    if (!org) throw new Error("Organisation not found.");

    let targetPlan;
    if (planId) {
      targetPlan = await subscriptionPlanRepo.getPlanById(planId);
    } else {
      const currentSub =
        await subscriptionRepo.getCurrentSubscriptionByOrgId(organisationId);
      targetPlan = await subscriptionPlanRepo.getPlanById(currentSub.plan_id);
    }

    const currentSub =
      await subscriptionRepo.getCurrentSubscriptionByOrgId(organisationId);
    if (!currentSub) {
      throw new Error("No active or pending subscription found to renew.");
    }

    return await this.createPaymentOrder({
      organisationId,
      subscriptionId: currentSub.id,
      plan: targetPlan,
      billingCycle: normalizedCycle,
      transactionType: "RENEWAL",
    });
  }

  /**
   * Initiate subscription plan upgrade payment order.
   */
  async upgradePlan({ organisationId, newPlanId, billingCycle = "ANNUAL" }) {
    let normalizedCycle = "ANNUAL";
    if (billingCycle) {
      const upper = String(billingCycle).trim().toUpperCase();
      if (upper === "MONTHLY") normalizedCycle = "MONTHLY";
      else if (upper === "CUSTOM") normalizedCycle = "CUSTOM";
      else normalizedCycle = "ANNUAL";
    }

    const targetPlan = await subscriptionPlanRepo.getPlanById(newPlanId);
    if (!targetPlan) throw new Error("Target plan not found.");

    const currentSub =
      await subscriptionRepo.getCurrentSubscriptionByOrgId(organisationId);
    if (!currentSub)
      throw new Error("No active subscription found for this organisation.");

    return await this.createPaymentOrder({
      organisationId,
      subscriptionId: currentSub.id,
      plan: targetPlan,
      billingCycle: normalizedCycle,
      transactionType: "PLAN_UPGRADE",
    });
  }

  /**
   * Toggle pharmacy status (ACTIVE, SUSPENDED, DEACTIVATED).
   */
  async updatePharmacyStatus(pharmacyId, status) {
    const validStatuses = ["ACTIVE", "SUSPENDED", "DEACTIVATED"];
    if (!validStatuses.includes(status)) {
      throw new Error(
        `Invalid status: ${status}. Must be one of: ${validStatuses.join(", ")}`,
      );
    }

    const updated = await platformPharmacyRepo.updatePharmacyStatus(
      pharmacyId,
      status,
    );
    await this.invalidatePlatformCache(pharmacyId);
    return updated;
  }
}

module.exports = new SuperadminService();
