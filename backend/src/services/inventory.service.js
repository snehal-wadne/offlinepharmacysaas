/**
 * Inventory Service
 *
 * Business logic for inventory stock adjustments and batch management.
 */

const { pool } = require("../db/connection");
const auditService = require("./audit.service");

const getInventory = async ({
  organisationId,
  search,
  branchId,
  limit = 100,
  offset = 0,
}) => {
  try {
    const isAllBranches =
      !branchId || branchId === "all" || branchId === "All Branches";
    let branchClause = "";
    const values = [organisationId];

    if (!isAllBranches) {
      values.push(branchId);
      branchClause = `AND (ib.branch_id IS NULL OR ib.branch_id::text = $${values.length} OR b.name ILIKE $${values.length})`;
    }

    let searchClause = "";
    if (search) {
      values.push(`%${search}%`);
      searchClause = `AND (p.medicine_name ILIKE $${values.length} OR p.brand_name ILIKE $${values.length} OR p.sku ILIKE $${values.length} OR ib.batch_number ILIKE $${values.length} OR s.name ILIKE $${values.length})`;
    }

    values.push(limit);
    const limitIdx = values.length;
    values.push(offset);
    const offsetIdx = values.length;

    const query = `
      SELECT
        COALESCE(ib.id, p.id) AS id,
        COALESCE(ib.batch_number, 'No Batch') AS "batchNo",
        ib.expiry_date AS "expiryDate",
        COALESCE(ib.quantity, 0) AS quantity,
        COALESCE(ib.mrp, 0) AS mrp,
        COALESCE(ib.shelf_location, '') AS "shelfLocation",
        COALESCE(ib.created_at, p.created_at) AS created_at,
        COALESCE(ib.updated_at, p.updated_at) AS updated_at,
        p.id AS "productId",
        p.medicine_name AS "medicineName",
        p.brand_name AS "brandName",
        p.strength,
        p.pack_size AS "packSize",
        p.manufacturer,
        p.sku,
        p.is_active AS "isActive",
        p.is_rx_required AS "isRxRequired",
        COALESCE(s.name, '') AS "supplierName",
        p.organisation_id AS "organisationId",
        ib.branch_id AS "branchId",
        COALESCE(b.name, 'Main Store') AS "branchName",
        u.name AS "updatedBy"
      FROM products p
      LEFT JOIN inventory_batches ib ON ib.product_id = p.id
      LEFT JOIN branches b ON b.id = ib.branch_id AND b.organisation_id = $1
      LEFT JOIN suppliers s ON s.id = ib.supplier_id AND s.organisation_id = $1
      LEFT JOIN users u ON u.id = ib.updated_by
      WHERE p.organisation_id = $1
        AND (p.is_active IS NULL OR p.is_active = TRUE)
        ${branchClause}
        ${searchClause}
      ORDER BY COALESCE(ib.updated_at, p.updated_at) DESC, COALESCE(ib.created_at, p.created_at) DESC, ib.id, p.id
      LIMIT $${limitIdx} OFFSET $${offsetIdx};
    `;

    const result = await pool.query(query, values);
    return result.rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      organisationId: row.organisationId || organisationId,
      medicineName: row.medicineName,
      brandName: row.brandName,
      genericName: row.medicineName,
      strength: row.strength || "",
      packSize: row.packSize || "",
      manufacturer: row.manufacturer || "",
      supplierName: row.supplierName || "",
      sku: row.sku,
      batchNo: row.batchNo,
      expiryDate: row.expiryDate
        ? new Date(row.expiryDate).toISOString().split("T")[0]
        : null,
      quantity: Number(row.quantity),
      amount: `₹${parseFloat(row.mrp || 0).toFixed(2)}`,
      branchId: row.branchId,
      branchName: row.branchName || "Main Store",
      shelfLocation: row.shelfLocation || "",
      updatedBy: row.updatedBy || "Manager",
      lastUpdated: row.updated_at
        ? new Date(row.updated_at).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      status: Number(row.quantity) < 50 ? "Low Stock" : "In Stock",
      isActive: row.isActive !== false,
      rxRequired: Boolean(row.isRxRequired),
    }));
  } catch (err) {
    console.error("Inventory query failed on PostgreSQL:", err.message);
    throw err;
  }
};

const saveOrUpdateInventory = async (organisationId, itemData) => {
  const {
    id,
    medicineName,
    brandName,
    genericName,
    strength = "500mg",
    packSize = "15 Tablets",
    manufacturer = "GSK",
    supplierName,
    amount = "15.00",
    sku,
    batchNo,
    quantity = 100,
    branchId,
    shelfLocation,
  } = itemData;

  if (!organisationId) {
    throw new Error("organisationId is required");
  }

  const medName = medicineName || genericName || brandName || "Medicine";
  const brdName = brandName || medicineName || medName;
  const numMrp = parseFloat(String(amount).replace(/[^0-9.]/g, "")) || 15.0;
  const numQty = parseInt(quantity, 10) || 0;

  // 1. Look up existing batch if ID, batch number, or SKU is provided
  let existingBatch = null;
  let productId = null;
  let previousQty = null;
  const targetLookupBatch = batchNo || itemData.batchNumber || null;

  if (id) {
    // An explicit batch id (e.g. from the Stock Adjustments table) must match
    // that exact row only — OR-ing in a batch-number/product-id fallback here
    // let an unrelated batch sharing the same (often default "B-1001") batch
    // number win the "ORDER BY updated_at DESC LIMIT 1" tie-break, silently
    // updating the wrong row instead of the one the user selected.
    const batchRes = await pool.query(
      `SELECT ib.id, ib.product_id, ib.supplier_id, ib.branch_id, ib.batch_number,
              ib.quantity, ib.mrp, ib.shelf_location,
              p.medicine_name, p.brand_name
       FROM inventory_batches ib
       JOIN products p ON p.id = ib.product_id
       WHERE ib.id::text = $1
         AND p.organisation_id = $2
       LIMIT 1;`,
      [id, organisationId],
    );
    if (batchRes.rows.length > 0) {
      existingBatch = batchRes.rows[0];
      productId = existingBatch.product_id;
      previousQty = Number(existingBatch.quantity);
    }
  } else if (targetLookupBatch) {
    const batchRes = await pool.query(
      `SELECT ib.id, ib.product_id, ib.supplier_id, ib.branch_id, ib.batch_number,
              ib.quantity, ib.mrp, ib.shelf_location,
              p.medicine_name, p.brand_name
       FROM inventory_batches ib
       JOIN products p ON p.id = ib.product_id
       WHERE ib.batch_number = $1
         AND p.organisation_id = $2
       ORDER BY ib.updated_at DESC
       LIMIT 1;`,
      [targetLookupBatch, organisationId],
    );
    if (batchRes.rows.length > 0) {
      existingBatch = batchRes.rows[0];
      productId = existingBatch.product_id;
      previousQty = Number(existingBatch.quantity);
    }
  }


  // 2. Resolve Supplier (preserve existing supplier if none supplied)
  let sId = existingBatch?.supplier_id || null;
  const cleanSupplierName = supplierName ? String(supplierName).trim() : "";
  if (cleanSupplierName) {
    const sRes = await pool.query(
      `SELECT id FROM suppliers WHERE organisation_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1;`,
      [organisationId, cleanSupplierName],
    );
    if (sRes.rows.length > 0) {
      sId = sRes.rows[0].id;
    } else {
      const newS = await pool.query(
        `INSERT INTO suppliers (organisation_id, name) VALUES ($1, $2) RETURNING id;`,
        [organisationId, cleanSupplierName],
      );
      sId = newS.rows[0].id;
    }
  } else if (!sId) {
    // Find or create default supplier for the organisation
    const anyS = await pool.query(
      `SELECT id FROM suppliers WHERE organisation_id = $1 LIMIT 1;`,
      [organisationId],
    );
    if (anyS.rows.length > 0) {
      sId = anyS.rows[0].id;
    } else {
      const newS = await pool.query(
        `INSERT INTO suppliers (organisation_id, name) VALUES ($1, 'General Distributor') RETURNING id;`,
        [organisationId],
      );
      sId = newS.rows[0].id;
    }
  }

  // 3. Resolve Branch
  let bId = existingBatch?.branch_id || null;
  const isSentinelBranch =
    !branchId ||
    branchId === "all" ||
    branchId === "All Branches" ||
    branchId === "No Active Branch";

  if (!isSentinelBranch) {
    const bRes = await pool.query(
      `SELECT id FROM branches WHERE organisation_id = $1 AND (id::text = $2 OR name ILIKE $2) LIMIT 1;`,
      [organisationId, branchId],
    );
    if (bRes.rows.length > 0) {
      bId = bRes.rows[0].id;
    }
  }

  if (!bId) {
    const anyB = await pool.query(
      `SELECT id FROM branches WHERE organisation_id = $1 AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1;`,
      [organisationId],
    );
    if (anyB.rows.length > 0) {
      bId = anyB.rows[0].id;
    } else {
      const newB = await pool.query(
        `INSERT INTO branches (organisation_id, name) VALUES ($1, 'Main Branch') RETURNING id;`,
        [organisationId],
      );
      bId = newB.rows[0].id;
    }
  }

  // 4. Resolve or Update Product
  const itemSku = sku ? String(sku).trim() : `SKU-${Math.floor(1000 + Math.random() * 9000)}`;

  if (productId) {
    await pool.query(
      `UPDATE products
       SET medicine_name = COALESCE($1, medicine_name),
           brand_name = COALESCE($2, brand_name),
           strength = COALESCE($3, strength),
           pack_size = COALESCE($4, pack_size),
           manufacturer = COALESCE($5, manufacturer),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6;`,
      [medName, brdName, strength, packSize, manufacturer, productId],
    );
  } else {
    // Search existing product by SKU or brand name
    const pRes = await pool.query(
      `SELECT id FROM products WHERE organisation_id = $1 AND (LOWER(sku) = LOWER($2) OR LOWER(brand_name) = LOWER($3)) LIMIT 1;`,
      [organisationId, itemSku, brdName],
    );

    if (pRes.rows.length > 0) {
      productId = pRes.rows[0].id;
      await pool.query(
        `UPDATE products
         SET medicine_name = $1, brand_name = $2, strength = $3, pack_size = $4, manufacturer = $5, updated_at = CURRENT_TIMESTAMP
         WHERE id = $6;`,
        [medName, brdName, strength, packSize, manufacturer, productId],
      );
    } else {
      const newP = await pool.query(
        `INSERT INTO products (organisation_id, medicine_name, brand_name, strength, pack_size, manufacturer, sku)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;`,
        [
          organisationId,
          medName,
          brdName,
          strength,
          packSize,
          manufacturer,
          itemSku,
        ],
      );
      productId = newP.rows[0].id;
    }
  }

  // 5. Create or Update Inventory Batch
  let batchRecord;
  const targetBatchNo = batchNo || existingBatch?.batch_number || `BAT-${Math.floor(1000 + Math.random() * 9000)}`;
  const targetShelf = shelfLocation !== undefined ? shelfLocation : (existingBatch?.shelf_location || "A1-S1");

  if (existingBatch) {
    const updated = await pool.query(
      `UPDATE inventory_batches
       SET supplier_id = COALESCE($1, supplier_id),
           batch_number = COALESCE($2, batch_number),
           mrp = $3,
           quantity = $4,
           shelf_location = COALESCE($5, shelf_location),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 RETURNING *;`,
      [
        sId,
        targetBatchNo,
        numMrp,
        numQty,
        targetShelf,
        existingBatch.id,
      ],
    );
    batchRecord = updated.rows[0];
  } else {
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 2);

    const inserted = await pool.query(
      `INSERT INTO inventory_batches (product_id, branch_id, supplier_id, batch_number, expiry_date, mrp, quantity, shelf_location)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;`,
      [
        productId,
        bId,
        sId,
        targetBatchNo,
        expiryDate.toISOString().split("T")[0],
        numMrp,
        numQty,
        targetShelf,
      ],
    );
    batchRecord = inserted.rows[0];
  }

  const productFlags = await pool.query(
    `SELECT is_active AS "isActive", is_rx_required AS "isRxRequired" FROM products WHERE id = $1;`,
    [productId],
  );
  const isActive = productFlags.rows[0]?.isActive !== false;
  const rxRequired = Boolean(productFlags.rows[0]?.isRxRequired);

  // 6. Record in stock_movements & audit_logs
  const diffQty = numQty - (previousQty !== null ? previousQty : 0);
  const auditAction = diffQty >= 0 ? "STOCK_INCREASE" : "STOCK_DECREASE";

  // Stock movement history
  recordStockMovement(organisationId, {
    branchName: branchId || "Main Branch",
    type: id ? (diffQty >= 0 ? "Stock Increase" : "Stock Decrease") : "New Stock Entry",
    item: `${brdName} (${strength})`,
    quantity: diffQty >= 0 ? `+${Math.abs(diffQty)}` : `-${Math.abs(diffQty)}`,
    reference: targetBatchNo,
    status: "Completed",
    notes: itemData.reason || "Stock quantity adjustment",
  });

  // Persistent Compliance Audit Log
  try {
    await auditService.log({
      organisationId,
      userId: itemData.updatedBy || null,
      action: "STOCK_ADJUSTMENT",
      entityType: "STOCK_ADJUSTMENT",
      entityId: String(batchRecord.id),
      metadata: {
        actionType: auditAction,
        productName: brdName || medName,
        batchNumber: targetBatchNo,
        previousQuantity: previousQty !== null ? previousQty : 0,
        newQuantity: numQty,
        delta: diffQty,
        branchName: branchId || "Main Branch",
        reason: itemData.reason || (diffQty >= 0 ? "Manual stock increase" : "Manual stock deduction"),
        diff: [
          {
            field: "Stock Quantity",
            oldValue: previousQty !== null ? `${previousQty} units` : "0 units",
            newValue: `${numQty} units`,
          },
        ],
      },
    });
  } catch (auditErr) {
    console.warn("Failed to write stock adjustment audit log:", auditErr.message);
  }

  return {
    id: batchRecord.id,
    productId: productId,
    medicineName: medName,
    brandName: brdName,
    genericName: medName,
    strength,
    packSize,
    manufacturer,
    supplierName: cleanSupplierName || "Distributor",
    amount: `₹${numMrp.toFixed(2)}`,
    sku: itemSku,
    batchNo: targetBatchNo,
    quantity: numQty,
    branchId: bId,
    shelfLocation: targetShelf,
    updatedBy: "Manager",
    lastUpdated: new Date().toISOString().split("T")[0],
    status: numQty < 50 ? "Low Stock" : "In Stock",
    isActive,
    rxRequired,
  };
};

const deleteInventoryEntry = async (organisationId, batchId) => {
  if (!organisationId || !batchId) {
    throw new Error("organisationId and batchId are required");
  }

  const res = await pool.query(
    `DELETE FROM inventory_batches
     WHERE (id::text = $1 OR batch_number = $1)
       AND product_id IN (SELECT id FROM products WHERE organisation_id = $2)
     RETURNING id;`,
    [batchId, organisationId],
  );

  return res.rowCount > 0;
};

const getInventorySummary = async (organisationId, branchId = null) => {
  if (!organisationId) {
    throw new Error("organisationId is required");
  }

  const isAllBranches =
    !branchId || branchId === "all" || branchId === "All Branches";
  let branchJoin = "";
  let branchClause = "";
  const params = [organisationId];

  if (!isAllBranches) {
    params.push(branchId);
    branchJoin = "LEFT JOIN branches b ON b.id = ib.branch_id";
    branchClause = `AND (ib.branch_id IS NULL OR ib.branch_id::text = $2 OR b.name ILIKE $2)`;
  }

  const kpiQuery = `
    SELECT
      COUNT(COALESCE(ib.id, p.id)) AS "totalProducts",
      COUNT(ib.id) AS "totalBatches",
      COUNT(DISTINCT CASE WHEN ib.quantity < 50 AND ib.quantity > 0 THEN p.id END) AS "lowStockCount",
      COUNT(DISTINCT CASE WHEN ib.quantity = 0 OR ib.id IS NULL THEN p.id END) AS "outOfStockCount",
      COUNT(DISTINCT CASE WHEN ib.expiry_date >= CURRENT_DATE AND ib.expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN p.id END) AS "nearExpiryCount",
      COUNT(DISTINCT CASE WHEN ib.expiry_date < CURRENT_DATE THEN p.id END) AS "expiredCount"
    FROM products p
    LEFT JOIN inventory_batches ib ON ib.product_id = p.id
    ${branchJoin}
    WHERE p.organisation_id = $1
      AND (p.is_active IS NULL OR p.is_active = TRUE)
      ${branchClause};
  `;

  const kpiRes = await pool.query(kpiQuery, params);
  const row = kpiRes.rows[0] || {};

  return {
    totalProducts: Number(row.totalProducts || 0),
    totalBatches: Number(row.totalBatches || 0),
    lowStockCount: Number(row.lowStockCount || 0),
    outOfStockCount: Number(row.outOfStockCount || 0),
    nearExpiryCount: Number(row.nearExpiryCount || 0),
    expiredCount: Number(row.expiredCount || 0),
  };
};

const recordStockMovement = async (
  organisationId,
  {
    branchName = "Main Branch",
    type,
    item,
    quantity,
    reference = "ADJ-1001",
    status = "Completed",
    notes = null,
  },
) => {
  try {
    await pool.query(
      `INSERT INTO stock_movements (organisation_id, branch_name, movement_type, item_name, quantity, reference, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7);`,
      [
        organisationId,
        branchName,
        type,
        item,
        String(quantity),
        reference,
        status,
      ],
    );

    // Also persist in audit_logs so the audit trail displays the action
    await auditService.log({
      organisationId,
      action: "STOCK_ADJUSTMENT",
      entityType: "STOCK_ADJUSTMENT",
      entityId: reference,
      metadata: {
        item,
        branchName,
        type,
        quantity,
        reference,
        status,
        reason: notes || "Stock movement adjustment",
      },
    }).catch(() => {});
  } catch (err) {
    console.warn("Failed to record stock movement:", err.message);
  }
};

const getStockMovements = async (
  organisationId,
  limit = 10,
  branchId = null,
) => {
  try {
    if (!organisationId) return [];
    const isAllBranches =
      !branchId || branchId === "all" || branchId === "All Branches";
    const params = [organisationId];
    let branchFilter = "";
    if (!isAllBranches) {
      params.push(branchId);
      branchFilter = `WHERE (m.branch_id::text = $2 OR b.name ILIKE $2)`;
    }
    params.push(limit);

    const query = `
      SELECT
        m.id,
        m.branch_id,
        COALESCE(b.name, 'Main Branch') AS "branchName",
        m.created_at,
        m.type,
        m.item,
        m.quantity,
        m.reference,
        m.status
      FROM (
        -- Inward Stock (Goods Receipts / Purchases)
        SELECT
          gri.id,
          po.branch_id,
          gr.received_date AS created_at,
          'Purchase' AS type,
          p.medicine_name AS item,
          ('+' || gri.received_quantity::text) AS quantity,
          gr.receipt_number AS reference,
          'Completed' AS status
        FROM goods_receipt_items gri
        JOIN goods_receipts gr ON gr.id = gri.goods_receipt_id
        JOIN purchases po ON po.id = gr.purchase_id
        JOIN purchase_items pi ON pi.id = gri.purchase_item_id
        JOIN products p ON p.id = pi.product_id
        WHERE gr.organisation_id = $1

        UNION ALL

        -- Outward Stock (Sales Invoices)
        SELECT
          ii.id,
          i.branch_id,
          i.created_at,
          'Sale' AS type,
          ii.product_name AS item,
          ('-' || ii.quantity::text) AS quantity,
          i.invoice_number AS reference,
          'Completed' AS status
        FROM invoice_items ii
        JOIN invoices i ON i.id = ii.invoice_id
        WHERE i.organisation_id = $1

        UNION ALL

        -- Stock Transfers
        SELECT
          sti.id,
          st.from_branch_id AS branch_id,
          st.created_at,
          'Transfer' AS type,
          p.medicine_name AS item,
          ('-' || sti.quantity::text) AS quantity,
          st.transfer_number AS reference,
          CASE WHEN st.status = 'COMPLETED' THEN 'Completed' ELSE 'In Transit' END AS status
        FROM stock_transfer_items sti
        JOIN stock_transfers st ON st.id = sti.transfer_id
        JOIN inventory_batches ib ON ib.id = sti.inventory_batch_id
        JOIN products p ON p.id = ib.product_id
        WHERE st.organisation_id = $1
      ) m
      LEFT JOIN branches b ON b.id = m.branch_id
      ${branchFilter}
      ORDER BY m.created_at DESC
      LIMIT $${params.length};
    `;

    const res = await pool.query(query, params);

    return res.rows.map((r) => {
      const d = new Date(r.created_at);
      const dateStr = isNaN(d.getTime())
        ? "-"
        : d.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
      const timeStr = isNaN(d.getTime())
        ? ""
        : d.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          });
      return {
        id: r.id,
        date: timeStr ? `${dateStr}, ${timeStr}` : dateStr,
        type: r.type,
        item: r.item,
        quantity: r.quantity,
        reference: r.reference,
        status: r.status || "Completed",
        branchName: r.branchName,
      };
    });
  } catch (e) {
    console.warn("Failed to fetch stock movements from DB:", e.message);
    return [];
  }
};

const CODE128_PATTERNS = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112",
];

function generateCode128Svg(text, barHeight = 44, moduleWidth = 2) {
  const clean = String(text || "MED-001")
    .toUpperCase()
    .replace(/[^ -~]/g, "");
  const chars = [104];
  let checksum = 104;

  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i) - 32;
    chars.push(code);
    checksum += code * (i + 1);
  }
  chars.push(checksum % 103);
  chars.push(106);

  let totalModules = 0;
  const segments = [];
  for (const c of chars) {
    const pattern = CODE128_PATTERNS[c] || CODE128_PATTERNS[0];
    for (let j = 0; j < pattern.length; j++) {
      const width = parseInt(pattern[j], 10);
      const isBar = j % 2 === 0;
      segments.push({ isBar, width });
      totalModules += width;
    }
  }

  const quietZone = 14;
  const svgWidth = (totalModules + quietZone * 2) * moduleWidth;
  const svgHeight = barHeight + 18;

  let x = quietZone * moduleWidth;
  let rects = "";
  for (const seg of segments) {
    const w = seg.width * moduleWidth;
    if (seg.isBar) {
      rects += `<rect x="${x}" y="3" width="${w}" height="${barHeight}" fill="#000000" />`;
    }
    x += w;
  }

  const textX = svgWidth / 2;
  const textY = barHeight + 14;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="${svgHeight}" style="max-width: 100%; height: auto; background-color: #FFFFFF; shape-rendering: crispEdges; display: block; margin: 0 auto;">
  <rect width="100%" height="100%" fill="#ffffff" />
  ${rects}
  <text x="${textX}" y="${textY}" text-anchor="middle" font-family="'Courier New', monospace, sans-serif" font-size="11" font-weight="700" fill="#111827" letter-spacing="1.5">${clean}</text>
</svg>`;
}

const getItemBarcodeData = async (organisationId, identifier) => {
  if (!identifier) {
    throw new Error("Item identifier (ID, SKU, or Batch) is required");
  }

  const query = `
    SELECT
      ib.id AS "batchId",
      ib.batch_number AS "batchNo",
      ib.expiry_date AS "expiryDate",
      ib.quantity,
      ib.mrp,
      ib.shelf_location AS "shelfLocation",
      p.id AS "productId",
      p.medicine_name AS "medicineName",
      p.brand_name AS "brandName",
      p.strength,
      p.pack_size AS "packSize",
      p.manufacturer,
      p.sku,
      p.sku AS "barcode",
      s.name AS "supplierName",
      b.name AS "branchName",
      o.name AS "organisationName"
    FROM inventory_batches ib
    INNER JOIN products p ON p.id = ib.product_id
    INNER JOIN branches b ON b.id = ib.branch_id
    LEFT JOIN suppliers s ON s.id = ib.supplier_id
    LEFT JOIN organisations o ON o.id = p.organisation_id
    WHERE (ib.id::text = $1 OR ib.batch_number = $1 OR p.sku = $1 OR p.id::text = $1)
    LIMIT 1;
  `;

  let item = null;
  try {
    const res = await pool.query(query, [identifier]);
    if (res.rows.length > 0) {
      item = res.rows[0];
    }
  } catch (err) {
    console.warn("Batch barcode lookup query failed:", err.message);
  }

  if (!item) {
    const prodQuery = `
      SELECT
        p.id AS "productId",
        p.medicine_name AS "medicineName",
        p.brand_name AS "brandName",
        p.strength,
        p.pack_size AS "packSize",
        p.manufacturer,
        p.sku,
        p.sku AS "barcode",
        25.0 AS mrp,
        o.name AS "organisationName"
      FROM products p
      LEFT JOIN organisations o ON o.id = p.organisation_id
      WHERE (p.id::text = $1 OR p.sku = $1)
      LIMIT 1;
    `;
    const prodRes = await pool.query(prodQuery, [identifier]);
    if (prodRes.rows.length > 0) {
      const p = prodRes.rows[0];
      item = {
        batchId: identifier,
        batchNo: "B-1001",
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
        quantity: 50,
        mrp: p.mrp || 25.0,
        shelfLocation: "Rack A1",
        productId: p.productId,
        medicineName: p.medicineName,
        brandName: p.brandName,
        strength: p.strength,
        packSize: p.packSize,
        manufacturer: p.manufacturer,
        sku: p.sku,
        barcode: p.barcode,
        branchName: "Main Store",
        organisationName: p.organisationName,
      };
    }
  }

  if (!item) {
    // Fallback stub for UI preview
    item = {
      batchId: identifier,
      batchNo: "B-1001",
      expiryDate: "2028-12-31",
      quantity: 50,
      mrp: 35.0,
      shelfLocation: "Rack A1-S1",
      productId: "PROD-001",
      medicineName: "Medicine Item",
      brandName: identifier,
      strength: "500mg",
      packSize: "10 Tablets",
      manufacturer: "Pharma Lab",
      sku: identifier,
      barcode: identifier,
      branchName: "Main Store",
      organisationName: "Falah Pharmacy",
    };
  }

  const barcodeValue = String(item.barcode || item.sku || identifier).trim();
  const svgBarcode = generateCode128Svg(barcodeValue);
  const formattedExpiry = item.expiryDate
    ? new Date(item.expiryDate).toISOString().split("T")[0]
    : "N/A";
  const mrpNum = parseFloat(item.mrp || 0).toFixed(2);
  const pharmacyName = item.organisationName || "Falah Pharmacy";

  const thermalHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: 50mm 25mm; margin: 0; }
  body {
    margin: 0;
    padding: 2mm 3mm;
    font-family: Arial, sans-serif;
    width: 50mm;
    height: 25mm;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
    color: #000;
  }
  .header { font-size: 8px; font-weight: 800; text-transform: uppercase; text-align: center; border-bottom: 0.5px solid #000; padding-bottom: 1px; }
  .name { font-size: 9px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta-row { display: flex; justify-content: space-between; font-size: 7px; font-weight: 600; }
  .barcode-box { display: flex; justify-content: center; align-items: center; margin-top: 1px; }
  .barcode-box svg { width: 44mm; height: 11mm; }
  .price { font-size: 9px; font-weight: 800; }
</style>
</head>
<body onload="window.print()">
  <div class="header">${pharmacyName}</div>
  <div class="name">${item.brandName || item.medicineName} ${item.strength || ""}</div>
  <div class="meta-row">
    <span>B: ${item.batchNo}</span>
    <span>EXP: ${formattedExpiry}</span>
    <span class="price">MRP ₹${mrpNum}</span>
  </div>
  <div class="meta-row">
    <span>Rack: ${item.shelfLocation || "A1"}</span>
    <span>Pack: ${item.packSize || "Units"}</span>
  </div>
  <div class="barcode-box">
    ${svgBarcode}
  </div>
</body>
</html>
  `.trim();

  return {
    id: item.batchId,
    productId: item.productId,
    medicineName: item.medicineName,
    brandName: item.brandName || item.medicineName,
    genericName: item.medicineName,
    strength: item.strength || "",
    packSize: item.packSize || "",
    manufacturer: item.manufacturer || "",
    sku: item.sku,
    barcode: barcodeValue,
    batchNo: item.batchNo,
    expiryDate: formattedExpiry,
    quantity: Number(item.quantity || 0),
    mrp: `₹${mrpNum}`,
    mrpNumeric: parseFloat(mrpNum),
    shelfLocation: item.shelfLocation || "A1-S1",
    branchName: item.branchName || "Main Store",
    pharmacyName: pharmacyName,
    svgBarcode: svgBarcode,
    thermalHtml: thermalHtml,
  };
};

const updateItemStatus = async (organisationId, identifier, isActive) => {
  const isBool = Boolean(isActive);
  const res = await pool.query(
    `UPDATE products
     SET is_active = $1, updated_at = CURRENT_TIMESTAMP
     WHERE (id::text = $2 OR sku = $2 OR id IN (SELECT product_id FROM inventory_batches WHERE id::text = $2 OR batch_number = $2))
       AND ($3::uuid IS NULL OR organisation_id = $3::uuid)
     RETURNING id, sku, medicine_name, is_active;`,
    [isBool, identifier, organisationId || null]
  );
  return res.rows[0] || null;
};

const updateItemRx = async (organisationId, identifier, isRxRequired) => {
  const isBool = Boolean(isRxRequired);
  const res = await pool.query(
    `UPDATE products
     SET is_rx_required = $1, updated_at = CURRENT_TIMESTAMP
     WHERE (id::text = $2 OR sku = $2 OR id IN (SELECT product_id FROM inventory_batches WHERE id::text = $2 OR batch_number = $2))
       AND ($3::uuid IS NULL OR organisation_id = $3::uuid)
     RETURNING id, sku, medicine_name, is_rx_required;`,
    [isBool, identifier, organisationId || null]
  );
  return res.rows[0] || null;
};

module.exports = {
  getInventory,
  getInventorySummary,
  saveOrUpdateInventory,
  saveInventoryEntry: saveOrUpdateInventory,
  deleteInventoryEntry,
  recordStockMovement,
  getStockMovements,
  generateCode128Svg,
  getItemBarcodeData,
  updateItemStatus,
  updateItemRx,
};
