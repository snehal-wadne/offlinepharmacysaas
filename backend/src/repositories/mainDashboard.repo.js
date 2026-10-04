// repositories/mainDashboard.repo.js

const { pool } = require("../db/connection");

// ============================================================
// MAIN DASHBOARD REPOSITORY
// ============================================================
// Dashboard data is combined into ONE PostgreSQL query.
//
// Sections returned:
//
// 1. overview
//    - totalProducts
//    - lowStockAlerts
//    - nearExpiry
//    - expiredStock
//
// 2. stockSummary
//    - category
//    - totalItems
//    - inStock
//    - lowStock
//    - outOfStock
//
// 3. pendingPurchaseOrders
//
// 4. recentStockMovements
//
// Branch filtering:
//
//   branchId = null / undefined
//       -> all branches of organisation
//
//   branchId = UUID
//       -> selected branch only
//
// Low stock threshold:
//   quantity > 0 AND quantity <= 5
//
// Near expiry:
//   expiry_date > CURRENT_DATE
//   AND expiry_date <= CURRENT_DATE + 60 days
// ============================================================

const LOW_STOCK_THRESHOLD = 5;
const NEAR_EXPIRY_DAYS = 60;
const RECENT_MOVEMENTS_LIMIT = 10;
const PENDING_PO_LIMIT = 5;


// ============================================================
// GET MAIN DASHBOARD
// ============================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getMainDashboard = async ({
  organisationId,
  branchId = null,
}) => {
  if (!organisationId) {
    throw new Error("organisationId is required");
  }

  const safeBranchId =
    branchId && UUID_REGEX.test(branchId) ? branchId : null;

  const query = `
    WITH

    /* ========================================================
       SELECTED BRANCHES
       ======================================================== */

    selected_branches AS (
      SELECT
        b.id,
        b.name,
        b.branch_code
      FROM branches b
      WHERE b.organisation_id = $1
        AND (
          $2::uuid IS NULL
          OR b.id = $2::uuid
        )
    ),


    /* ========================================================
       INVENTORY AGGREGATION
       
       We aggregate stock per product using LEFT JOIN so all
       organisation products are counted.
       ======================================================== */

    product_inventory AS (
      SELECT
        p.id AS product_id,
        COALESCE(NULLIF(TRIM(p.category), ''), 'General') AS category,
        p.medicine_name,
        p.brand_name,

        COALESCE(SUM(ib.quantity), 0) AS total_quantity,

        MIN(ib.expiry_date) FILTER (
          WHERE ib.quantity > 0
        ) AS nearest_expiry_date

      FROM products p

      LEFT JOIN (
        inventory_batches ib
        INNER JOIN selected_branches sb
          ON sb.id = ib.branch_id
      ) ON ib.product_id = p.id

      WHERE p.organisation_id = $1
        AND (p.is_active IS NULL OR p.is_active = TRUE)

      GROUP BY
        p.id,
        p.category,
        p.medicine_name,
        p.brand_name
    ),


    /* ========================================================
       OVERVIEW CARDS
       ======================================================== */

    overview AS (
      SELECT

        /* Total active products */
        COUNT(*)::INTEGER AS total_products,

        /* Products currently low in stock */
        COUNT(*) FILTER (
          WHERE total_quantity > 0
            AND total_quantity <= ${LOW_STOCK_THRESHOLD}
        )::INTEGER AS low_stock_alerts,

        /* Products having stock expiring within 60 days */
        COUNT(*) FILTER (
          WHERE nearest_expiry_date > CURRENT_DATE
            AND nearest_expiry_date <=
              CURRENT_DATE + INTERVAL '${NEAR_EXPIRY_DAYS} days'
        )::INTEGER AS near_expiry,

        /* Products with no stock */
        COUNT(*) FILTER (
          WHERE total_quantity = 0
        )::INTEGER AS expired_stock

      FROM product_inventory
    ),


    /* ========================================================
       STOCK SUMMARY BY CATEGORY
       ======================================================== */

    stock_summary AS (
      SELECT
        category,

        COUNT(*)::INTEGER AS total_items,

        COUNT(*) FILTER (
          WHERE total_quantity > ${LOW_STOCK_THRESHOLD}
        )::INTEGER AS in_stock,

        COUNT(*) FILTER (
          WHERE total_quantity > 0
            AND total_quantity <= ${LOW_STOCK_THRESHOLD}
        )::INTEGER AS low_stock,

        COUNT(*) FILTER (
          WHERE total_quantity = 0
        )::INTEGER AS out_of_stock

      FROM product_inventory

      GROUP BY category
    ),


    /* ========================================================
       PENDING PURCHASE ORDERS
       ======================================================== */

    pending_purchase_orders AS (
      SELECT
        p.id,
        p.purchase_number,
        p.status,
        p.order_date,
        p.expected_date,

        b.id AS branch_id,
        b.name AS branch_name,

        s.id AS supplier_id,
        s.name AS supplier_name,

        COUNT(pi.id)::INTEGER AS items_count,

        COALESCE(
          SUM(
            (
              pi.ordered_quantity * pi.unit_cost
            )
            + pi.tax_amount
            - pi.discount_amount
          ),
          0
        )::NUMERIC(12, 2) AS total_amount

      FROM purchases p

      LEFT JOIN branches b
        ON b.id = p.branch_id

      LEFT JOIN suppliers s
        ON s.id = p.supplier_id

      LEFT JOIN purchase_items pi
        ON pi.purchase_id = p.id

      WHERE p.organisation_id = $1

        AND p.status IN (
          'PENDING',
          'APPROVED',
          'PARTIALLY_RECEIVED'
        )

        AND (
          $2::uuid IS NULL
          OR p.branch_id = $2::uuid
        )

      GROUP BY
        p.id,
        p.purchase_number,
        p.status,
        p.order_date,
        p.expected_date,
        b.id,
        b.name,
        s.id,
        s.name

      ORDER BY
        p.order_date DESC,
        p.created_at DESC

      LIMIT ${PENDING_PO_LIMIT}
    ),


    /* ========================================================
       RECENT SALES / STOCK MOVEMENTS
       
       The dashboard screenshot shows movements such as:
       
       Sale
       PARACETAMOL
       -1
       INV-5138
       Completed
       
       invoice_items gives us the individual product movement.
       ======================================================== */

    recent_sales AS (
      SELECT
        i.invoice_date AS movement_date,

        'Sale' AS movement_type,

        ii.product_name AS item_name,

        (-1 * ii.quantity)::INTEGER AS quantity,

        i.invoice_number AS reference,

        CASE
          WHEN i.status IN ('COMPLETED', 'PAID', 'PARTIALLY_PAID')
            THEN 'Completed'
          ELSE INITCAP(
            LOWER(
              REPLACE(i.status, '_', ' ')
            )
          )
        END AS movement_status,

        i.branch_id,

        b.name AS branch_name

      FROM invoice_items ii

      INNER JOIN invoices i
        ON i.id = ii.invoice_id

      LEFT JOIN branches b
        ON b.id = i.branch_id

      WHERE i.organisation_id = $1

        AND i.status IN (
          'COMPLETED',
          'PAID',
          'PARTIALLY_PAID'
        )

        AND (
          $2::uuid IS NULL
          OR i.branch_id = $2::uuid
        )
    ),


    /* ========================================================
       RECENT STOCK TRANSFERS
       
       Included as another possible inventory movement.
       ======================================================== */

    recent_transfers AS (
      SELECT
        st.created_at AS movement_date,

        CASE
          WHEN st.status = 'COMPLETED'
            THEN 'Transfer'
          ELSE 'Transfer'
        END AS movement_type,

        COALESCE(
          p.medicine_name,
          'Stock Transfer'
        ) AS item_name,

        (-1 * sti.quantity)::INTEGER AS quantity,

        st.transfer_number AS reference,

        INITCAP(
          LOWER(
            REPLACE(st.status, '_', ' ')
          )
        ) AS movement_status,

        st.from_branch_id AS branch_id,

        from_branch.name AS branch_name

      FROM stock_transfer_items sti

      INNER JOIN stock_transfers st
        ON st.id = sti.transfer_id

      INNER JOIN inventory_batches ib
        ON ib.id = sti.inventory_batch_id

      INNER JOIN products p
        ON p.id = ib.product_id

      LEFT JOIN branches from_branch
        ON from_branch.id = st.from_branch_id

      WHERE st.organisation_id = $1

        AND st.status IN (
          'IN_TRANSIT',
          'COMPLETED'
        )

        AND (
          $2::uuid IS NULL
          OR st.from_branch_id = $2::uuid
          OR st.to_branch_id = $2::uuid
        )
    ),


    /* ========================================================
       COMBINED RECENT MOVEMENTS
       ======================================================== */

    recent_movements AS (
      SELECT *
      FROM recent_sales

      UNION ALL

      SELECT *
      FROM recent_transfers
    )


    /* ========================================================
       FINAL RESULT
       
       json_build_object allows the repository to return ONE
       database response containing every dashboard section.
       ======================================================== */

    SELECT
      (
        SELECT row_to_json(o)
        FROM overview o
      ) AS overview,

      (
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'category', ss.category,
              'totalItems', ss.total_items,
              'inStock', ss.in_stock,
              'lowStock', ss.low_stock,
              'outOfStock', ss.out_of_stock
            )
            ORDER BY ss.total_items DESC
          ),
          '[]'::json
        )
        FROM stock_summary ss
      ) AS stock_summary,

      (
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'id', ppo.id,
              'purchaseNumber', ppo.purchase_number,
              'status', ppo.status,
              'orderDate', ppo.order_date,
              'expectedDate', ppo.expected_date,
              'branchId', ppo.branch_id,
              'branchName', ppo.branch_name,
              'supplierId', ppo.supplier_id,
              'supplierName', ppo.supplier_name,
              'itemsCount', ppo.items_count,
              'totalAmount', ppo.total_amount
            )
            ORDER BY
              ppo.order_date DESC
          ),
          '[]'::json
        )
        FROM pending_purchase_orders ppo
      ) AS pending_purchase_orders,

      (
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'date', rm.movement_date,
              'type', rm.movement_type,
              'item', rm.item_name,
              'quantity', rm.quantity,
              'reference', rm.reference,
              'status', rm.movement_status,
              'branchId', rm.branch_id,
              'branchName', rm.branch_name
            )
            ORDER BY rm.movement_date DESC
          ),
          '[]'::json
        )
        FROM (
          SELECT *
          FROM recent_movements
          ORDER BY movement_date DESC
          LIMIT ${RECENT_MOVEMENTS_LIMIT}
        ) rm
      ) AS recent_stock_movements;
  `;

  const result = await pool.query(query, [
    organisationId,
    safeBranchId,
  ]);

  if (!result.rows.length) {
    return {
      overview: {
        total_products: 0,
        low_stock_alerts: 0,
        near_expiry: 0,
        expired_stock: 0,
      },
      stockSummary: [],
      pendingPurchaseOrders: [],
      recentStockMovements: [],
    };
  }

  const row = result.rows[0];

  return {
    overview: {
      totalProducts: Number(row.overview?.total_products || 0),
      lowStockAlerts: Number(row.overview?.low_stock_alerts || 0),
      nearExpiry: Number(row.overview?.near_expiry || 0),
      expiredStock: Number(row.overview?.expired_stock || 0),
    },

    stockSummary: row.stock_summary || [],

    pendingPurchaseOrders:
      row.pending_purchase_orders || [],

    recentStockMovements:
      row.recent_stock_movements || [],
  };
};


// ============================================================
// EXPORT
// ============================================================

module.exports = {
  getMainDashboard,
};