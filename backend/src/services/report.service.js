/**
 * Reports & Analytics Service
 *
 * Provides analytical summaries, GSTR compliance data, and operational reporting.
 */

const { pool } = require('../db/connection');

class ReportService {
  /**
   * Sales & Financial Summary
   */
  async getSalesSummary({ organisationId, branchId, startDate, endDate }) {
    if (!organisationId) {
      throw new Error('organisationId is required');
    }

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    let branchClause = '';
    const params = [organisationId, start, end];
    if (branchId) {
      params.push(branchId);
      branchClause = 'AND branch_id = $4';
    }

    // High level metrics
    const statsRes = await pool.query(`
      SELECT 
        COALESCE(SUM(total_amount), 0.00) AS "totalSales",
        COUNT(*)::int AS "totalInvoices",
        COALESCE(AVG(total_amount), 0.00) AS "averageTicketSize"
      FROM invoices
      WHERE organisation_id = $1
        AND invoice_date >= $2 AND invoice_date <= $3
        AND status = 'PAID'
        ${branchClause};
    `, params);

    // Payment methods breakdown
    let pmtBranchClause = '';
    const pmtParams = [organisationId, start, end];
    if (branchId) {
      pmtParams.push(branchId);
      pmtBranchClause = 'AND p.branch_id = $4';
    }

    const pmtRes = await pool.query(`
      SELECT 
        pt.payment_method AS "method",
        COALESCE(SUM(pt.amount), 0.00) AS "totalAmount",
        COUNT(pt.id)::int AS "transactionCount"
      FROM payment_transactions pt
      JOIN payments p ON p.id = pt.payment_id
      WHERE p.organisation_id = $1
        AND p.payment_date >= $2 AND p.payment_date <= $3
        AND p.status = 'COMPLETED'
        ${pmtBranchClause}
      GROUP BY pt.payment_method;
    `, pmtParams);

    // Daily trend
    const trendRes = await pool.query(`
      SELECT 
        TO_CHAR(invoice_date, 'YYYY-MM-DD') AS "date",
        COALESCE(SUM(total_amount), 0.00) AS "sales",
        COUNT(*)::int AS "count"
      FROM invoices
      WHERE organisation_id = $1
        AND invoice_date >= $2 AND invoice_date <= $3
        AND status = 'PAID'
        ${branchClause}
      GROUP BY TO_CHAR(invoice_date, 'YYYY-MM-DD')
      ORDER BY "date" ASC;
    `, params);

    return {
      overview: {
        totalSales: parseFloat(statsRes.rows[0]?.totalSales || 0),
        totalInvoices: parseInt(statsRes.rows[0]?.totalInvoices || 0, 10),
        averageTicketSize: parseFloat(statsRes.rows[0]?.averageTicketSize || 0).toFixed(2),
      },
      paymentMethods: pmtRes.rows.map(r => ({
        method: r.method,
        amount: parseFloat(r.totalAmount),
        transactions: r.transactionCount,
      })),
      dailyTrend: trendRes.rows,
    };
  }

  /**
   * GSTR-1 Tax Compliance Report
   */
  async getGstReport({ organisationId, branchId, month, year }) {
    if (!organisationId) {
      throw new Error('organisationId is required');
    }

    const currentYear = year || new Date().getFullYear();
    const currentMonth = month || new Date().getMonth() + 1;

    let branchClause = '';
    const params = [organisationId, currentYear, currentMonth];
    if (branchId) {
      params.push(branchId);
      branchClause = 'AND i.branch_id = $4';
    }

    const gstSummaryRes = await pool.query(`
      SELECT 
        12.0 AS "gstRate",
        ROUND(COALESCE(SUM(i.total_amount) / 1.12, 0.00), 2) AS "taxableValue",
        ROUND(COALESCE((SUM(i.total_amount) / 1.12) * 0.06, 0.00), 2) AS "cgstAmount",
        ROUND(COALESCE((SUM(i.total_amount) / 1.12) * 0.06, 0.00), 2) AS "sgstAmount",
        0.00 AS "igstAmount",
        COALESCE(SUM(i.total_amount), 0.00) AS "totalGrossAmount",
        COUNT(i.id)::int AS "invoiceCount"
      FROM invoices i
      WHERE i.organisation_id = $1
        AND EXTRACT(YEAR FROM i.invoice_date) = $2
        AND EXTRACT(MONTH FROM i.invoice_date) = $3
        AND i.status = 'PAID'
        ${branchClause}
    `, params);

    return {
      period: `${currentYear}-${String(currentMonth).padStart(2, '0')}`,
      slabs: gstSummaryRes.rows.map(r => ({
        gstRate: `${r.gstRate}%`,
        taxableValue: parseFloat(r.taxableValue || 0),
        cgstAmount: parseFloat(r.cgstAmount || 0),
        sgstAmount: parseFloat(r.sgstAmount || 0),
        igstAmount: parseFloat(r.igstAmount || 0),
        totalTax: parseFloat(r.cgstAmount || 0) + parseFloat(r.sgstAmount || 0),
        totalGross: parseFloat(r.totalGrossAmount || 0),
        invoices: r.invoiceCount,
      })),
    };
  }

  /**
   * Cashier Reconciliation & Shift Auditing
   */
  async getCashierReconciliationReport({ organisationId, branchId, limit = 20 }) {
    if (!organisationId) {
      throw new Error('organisationId is required');
    }

    let branchClause = '';
    const params = [organisationId, limit];
    if (branchId) {
      params.push(branchId);
      branchClause = 'AND crs.branch_id = $3';
    }

    const res = await pool.query(`
      SELECT 
        crs.id,
        crs.session_number AS "sessionNumber",
        crs.status,
        crs.opened_at AS "openedAt",
        crs.closed_at AS "closedAt",
        crs.opening_balance AS "openingBalance",
        crs.counted_cash AS "countedCash",
        crs.expected_cash AS "expectedCash",
        crs.variance,
        crs.variance_status AS "varianceStatus",
        crs.opening_notes AS "openingNotes",
        crs.closing_notes AS "closingNotes",
        u.name AS "cashierName",
        b.name AS "branchName"
      FROM cash_register_sessions crs
      JOIN users u ON u.id = crs.cashier_id
      JOIN branches b ON b.id = crs.branch_id
      WHERE crs.organisation_id = $1
        ${branchClause}
      ORDER BY crs.opened_at DESC
      LIMIT $2;
    `, params);

    return res.rows;
  }

  /**
   * Batch Expiry & Critical Stock Analysis
   */
  async getExpiryReport({ organisationId, branchId }) {
    if (!organisationId) {
      throw new Error('organisationId is required');
    }

    let branchClause = '';
    const params = [organisationId];
    if (branchId) {
      params.push(branchId);
      branchClause = 'AND ib.branch_id = $2';
    }

    const res = await pool.query(`
      SELECT 
        COALESCE(p.brand_name || ' (' || p.medicine_name || ')', p.medicine_name) AS "productName",
        ib.batch_number AS "batchNumber",
        ib.expiry_date AS "expiryDate",
        ib.quantity AS "stockQuantity",
        ib.mrp,
        ROUND(ib.mrp * 0.75, 2) AS "costPrice",
        ROUND(ib.quantity * (ib.mrp * 0.75), 2) AS "totalCostValuation",
        CASE 
          WHEN ib.expiry_date < CURRENT_DATE THEN 'EXPIRED'
          WHEN ib.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'EXPIRING_30_DAYS'
          WHEN ib.expiry_date <= CURRENT_DATE + INTERVAL '60 days' THEN 'EXPIRING_60_DAYS'
          ELSE 'EXPIRING_90_DAYS'
        END AS "urgency"
      FROM inventory_batches ib
      JOIN products p ON p.id = ib.product_id
      JOIN branches b ON b.id = ib.branch_id
      WHERE b.organisation_id = $1
        AND ib.quantity > 0
        AND ib.expiry_date <= CURRENT_DATE + INTERVAL '90 days'
        ${branchClause}
      ORDER BY ib.expiry_date ASC;
    `, params);

    const expired = res.rows.filter(r => r.urgency === 'EXPIRED');
    const within30 = res.rows.filter(r => r.urgency === 'EXPIRING_30_DAYS');
    const within60 = res.rows.filter(r => r.urgency === 'EXPIRING_60_DAYS');
    const within90 = res.rows.filter(r => r.urgency === 'EXPIRING_90_DAYS');

    return {
      summary: {
        totalExpiringBatches: res.rows.length,
        expiredCount: expired.length,
        within30DaysCount: within30.length,
        within60DaysCount: within60.length,
        within90DaysCount: within90.length,
        totalLossAtRisk: res.rows.reduce((sum, r) => sum + parseFloat(r.totalCostValuation || 0), 0),
      },
      batches: res.rows,
    };
  }

  /**
   * Fast & Slow Moving Medicines Analysis
   */
  async getFastMovingReport({ organisationId, branchId, limit = 10 }) {
    if (!organisationId) {
      throw new Error('organisationId is required');
    }

    let branchClause = '';
    const params = [organisationId, limit];
    if (branchId) {
      params.push(branchId);
      branchClause = 'AND i.branch_id = $3';
    }

    const res = await pool.query(`
      SELECT 
        p.id AS "productId",
        COALESCE(p.brand_name || ' (' || p.medicine_name || ')', p.medicine_name) AS "productName",
        p.sku,
        SUM(ii.quantity)::int AS "totalUnitsSold",
        ROUND(SUM(ii.total_amount), 2) AS "totalRevenue"
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      JOIN inventory_batches ib ON ib.id = ii.inventory_batch_id
      JOIN products p ON p.id = ib.product_id
      WHERE i.organisation_id = $1
        AND i.status = 'PAID'
        ${branchClause}
      GROUP BY p.id, p.medicine_name, p.brand_name, p.sku
      ORDER BY "totalUnitsSold" DESC
      LIMIT $2;
    `, params);

    return res.rows;
  }

  /**
   * Complete Inventory Valuation and Stock Health Report
   */
  async getInventoryReport({ organisationId, branchId }) {
    if (!organisationId) {
      throw new Error('organisationId is required');
    }

    let branchClause = '';
    const params = [organisationId];
    if (branchId) {
      params.push(branchId);
      branchClause = 'AND ib.branch_id = $2';
    }

    const summaryRes = await pool.query(`
      SELECT
        COUNT(DISTINCT p.id)::int AS "totalProducts",
        COUNT(ib.id)::int AS "totalBatches",
        COALESCE(SUM(ib.quantity), 0)::int AS "totalUnitsInStock",
        ROUND(COALESCE(SUM(ib.quantity * ib.mrp), 0.00), 2) AS "totalValuationMrp",
        ROUND(COALESCE(SUM(ib.quantity * (ib.mrp * 0.75)), 0.00), 2) AS "totalValuationCost",
        COUNT(CASE WHEN ib.quantity < 50 AND ib.quantity > 0 THEN 1 END)::int AS "lowStockBatches",
        COUNT(CASE WHEN ib.quantity = 0 THEN 1 END)::int AS "outOfStockBatches",
        COUNT(CASE WHEN ib.expiry_date < CURRENT_DATE THEN 1 END)::int AS "expiredBatches",
        COUNT(CASE WHEN ib.expiry_date >= CURRENT_DATE AND ib.expiry_date <= CURRENT_DATE + INTERVAL '60 days' THEN 1 END)::int AS "nearExpiryBatches"
      FROM inventory_batches ib
      JOIN products p ON p.id = ib.product_id
      WHERE p.organisation_id = $1
        ${branchClause};
    `, params);

    const itemsRes = await pool.query(`
      SELECT
        p.id AS "productId",
        COALESCE(p.brand_name || ' (' || p.medicine_name || ')', p.medicine_name) AS "name",
        p.sku,
        ib.batch_number AS "batch",
        ib.expiry_date AS "expiry",
        ib.quantity AS "stock",
        ib.mrp,
        ROUND(ib.mrp * 0.75, 2) AS "costPrice",
        ROUND(ib.quantity * ib.mrp, 2) AS "valuationMrp",
        ROUND(ib.quantity * (ib.mrp * 0.75), 2) AS "valuationCost",
        CASE WHEN ib.quantity < 50 THEN 'Low Stock' ELSE 'In Stock' END AS "status"
      FROM inventory_batches ib
      JOIN products p ON p.id = ib.product_id
      WHERE p.organisation_id = $1
        ${branchClause}
      ORDER BY ib.quantity ASC
      LIMIT 100;
    `, params);

    return {
      summary: summaryRes.rows[0] || {},
      items: itemsRes.rows,
    };
  }

  /**
   * Profit & Loss Summary Report
   */
  async getProfitLossReport({ organisationId, branchId, startDate, endDate }) {
    if (!organisationId) {
      throw new Error('organisationId is required');
    }

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    let branchClause = '';
    const params = [organisationId, start, end];
    if (branchId) {
      params.push(branchId);
      branchClause = 'AND i.branch_id = $4';
    }

    const res = await pool.query(`
      SELECT
        COALESCE(SUM(i.total_amount), 0.00) AS "grossRevenue",
        COALESCE(SUM(i.subtotal), 0.00) AS "subtotal",
        COALESCE(SUM(i.discount_amount), 0.00) AS "totalDiscounts",
        COALESCE(SUM(i.tax_amount), 0.00) AS "taxCollected",
        COUNT(i.id)::int AS "invoicesCount",
        ROUND(COALESCE(SUM(i.subtotal * 0.75), 0.00), 2) AS "estimatedCogs",
        ROUND(COALESCE(SUM(i.total_amount - (i.subtotal * 0.75)), 0.00), 2) AS "grossProfit"
      FROM invoices i
      WHERE i.organisation_id = $1
        AND i.created_at >= $2 AND i.created_at <= $3
        AND i.status IN ('PAID', 'COMPLETED')
        ${branchClause};
    `, params);

    const row = res.rows[0] || {};
    const revenue = parseFloat(row.grossRevenue || 0);
    const cogs = parseFloat(row.estimatedCogs || 0);
    const profit = parseFloat(row.grossProfit || 0);
    const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;

    return {
      grossRevenue: revenue,
      subtotal: parseFloat(row.subtotal || 0),
      totalDiscounts: parseFloat(row.totalDiscounts || 0),
      taxCollected: parseFloat(row.taxCollected || 0),
      invoicesCount: parseInt(row.invoicesCount || 0, 10),
      estimatedCogs: cogs,
      grossProfit: profit,
      profitMarginPercent: Number(margin),
    };
  }
}

module.exports = new ReportService();
