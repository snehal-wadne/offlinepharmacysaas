/**
 * Supplier Service
 *
 * Business logic for Supplier operations.
 */

const supplierRepo = require('../repositories/supplier.repository');
const { pool } = require('../db/connection');

const normalizeSupplierStatus = (s) => {
  if (!s) return 'ACTIVE';
  const upper = String(s).toUpperCase().trim();
  if (upper === 'PENDING') return 'PENDING';
  if (upper === 'INACTIVE') return 'INACTIVE';
  return 'ACTIVE';
};

const DEFAULT_CATEGORIES = [
  'Medicines & Injections',
  'Generic Medicines',
  'Nutrition & Diagnostics',
  'Supplements & Vitamins',
  'Medical Consumables',
];

const getCategoryForSupplier = (name, index) => {
  const lower = String(name || '').toLowerCase();
  if (lower.includes('generic') || lower.includes('torrent') || lower.includes('micro') || lower.includes('alembic')) {
    return 'Generic Medicines';
  }
  if (lower.includes('abbott') || lower.includes('diagnostics') || lower.includes('medico')) {
    return 'Nutrition & Diagnostics';
  }
  if (lower.includes('nutri') || lower.includes('vitamin') || lower.includes('care')) {
    return 'Supplements & Vitamins';
  }
  if (lower.includes('supply') || lower.includes('dist') || lower.includes('consumable')) {
    return 'Medical Consumables';
  }
  return DEFAULT_CATEGORIES[index % DEFAULT_CATEGORIES.length];
};

const getSuppliers = async ({ organisationId, search, limit = 100, offset = 0 }) => {
  if (!organisationId) {
    throw new Error('organisationId is required');
  }

  const rows = search
    ? await supplierRepo.searchSuppliers(organisationId, search, limit, offset)
    : await supplierRepo.getSuppliersByOrganisation(organisationId, limit, offset);

  return rows.map((s, index) => ({
    id: s.id,
    code: `SUP-${String(index + 1).padStart(3, '0')}`,
    name: s.name,
    contactPerson: s.contact_person || '',
    phone: s.phone || '',
    email: s.email || '',
    city: s.city || '',
    gstin: s.gstin || '',
    paymentTerms: 'Net 30',
    balance: '₹0.00',
    status: s.status === 'ACTIVE' ? 'Active' : s.status === 'PENDING' ? 'Pending' : 'Inactive',
    category: s.category || getCategoryForSupplier(s.name, index),
  }));
};

const getSupplierById = async (organisationId, supplierId) => {
  if (!organisationId || !supplierId) {
    throw new Error('organisationId and supplierId are required');
  }

  return await supplierRepo.getSupplierById(organisationId, supplierId);
};

const createSupplier = async (supplierData) => {
  const {
    organisationId,
    name,
    contactPerson = null,
    phone = null,
    email = null,
    city = null,
    gstin = null,
    status = 'ACTIVE',
    category = 'Medicines & Injections',
  } = supplierData;

  if (!organisationId || !name) {
    throw new Error('organisationId and name are required');
  }

  const supplier = await supplierRepo.createSupplier({
    organisationId,
    name,
    contactPerson,
    phone,
    email,
    city,
    gstin,
    status: normalizeSupplierStatus(status),
    category: category || 'Medicines & Injections',
  });

  // Automatically provision Supplier Portal Login Credentials in public.users
  const rawPassword = supplierData.password || 'password123';
  const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const loginEmail = email && email.trim()
    ? email.trim().toLowerCase()
    : `supplier.${cleanName || 'vendor'}@pharmaflow.in`;

  try {
    const bcrypt = require('bcrypt');
    const passHash = await bcrypt.hash(rawPassword, 10);
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE supplier_id = $1 OR LOWER(email) = LOWER($2);',
      [supplier.id, loginEmail]
    );

    let portalUserId;
    if (existingUser.rows.length === 0) {
      const insRes = await pool.query(
        `INSERT INTO users (name, email, phone, password_hash, role, status, supplier_id)
         VALUES ($1, $2, $3, $4, 'SUPPLIER', 'ACTIVE', $5)
         RETURNING id;`,
        [name, loginEmail, phone || null, passHash, supplier.id]
      );
      portalUserId = insRes.rows[0].id;
    } else {
      portalUserId = existingUser.rows[0].id;
      await pool.query(
        `UPDATE users 
         SET name = $1, email = $2, phone = COALESCE($3, phone), password_hash = $4, role = 'SUPPLIER', status = 'ACTIVE', supplier_id = $5
         WHERE id = $6;`,
        [name, loginEmail, phone || null, passHash, supplier.id, portalUserId]
      );
    }

    supplier.loginCredentials = {
      email: loginEmail,
      phone: phone || null,
      name: name,
      password: rawPassword,
      role: 'SUPPLIER',
      userId: portalUserId,
    };
  } catch (authErr) {
    console.warn('Supplier portal credentials auto-provision warning:', authErr.message);
  }

  return supplier;
};

const resolveSupplierId = async (organisationId, supplierId) => {
  if (!supplierId) return null;
  const directCheck = await pool.query(
    `SELECT id FROM suppliers WHERE (id::text = $1 OR LOWER(name) = LOWER($1)) AND organisation_id = $2 LIMIT 1;`,
    [supplierId, organisationId]
  );
  if (directCheck.rows.length > 0) {
    return directCheck.rows[0].id;
  }
  if (String(supplierId).startsWith('SUP-')) {
    const allSuppliers = await supplierRepo.getSuppliersByOrganisation(organisationId, 100, 0);
    const index = parseInt(String(supplierId).replace('SUP-', ''), 10) - 1;
    if (index >= 0 && allSuppliers[index]) {
      return allSuppliers[index].id;
    }
  }
  return null;
};

const updateSupplierStatus = async ({ organisationId, supplierId, status }) => {
  if (!organisationId || !supplierId) {
    throw new Error('organisationId and supplierId are required');
  }

  const dbStatus = normalizeSupplierStatus(status);
  const targetId = await resolveSupplierId(organisationId, supplierId);

  const res = await pool.query(
    `UPDATE suppliers
     SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE (id = $2 OR id::text = $3 OR LOWER(name) = LOWER($3))
       AND organisation_id = $4
     RETURNING *;`,
    [dbStatus, targetId || '00000000-0000-0000-0000-000000000000', supplierId, organisationId]
  );

  if (res.rows.length === 0) {
    return { id: supplierId, status: dbStatus };
  }

  return res.rows[0];
};

const updateSupplier = async (organisationId, supplierId, updateData) => {
  if (!organisationId || !supplierId) {
    throw new Error('organisationId and supplierId are required');
  }

  const { name, contactPerson, phone, email, city, gstin, status, category } = updateData;

  const res = await pool.query(
    `UPDATE suppliers
     SET name = COALESCE($1, name),
         contact_person = COALESCE($2, contact_person),
         phone = COALESCE($3, phone),
         email = COALESCE($4, email),
         city = COALESCE($5, city),
         gstin = COALESCE($6, gstin),
         status = COALESCE($7, status),
         category = COALESCE($8, category),
         updated_at = CURRENT_TIMESTAMP
     WHERE (id::text = $9 OR LOWER(name) = LOWER($9))
       AND organisation_id = $10
     RETURNING *;`,
    [name, contactPerson, phone, email, city, gstin, status ? normalizeSupplierStatus(status) : null, category, supplierId, organisationId]
  );

  if (res.rows.length === 0) {
    const error = new Error(`Supplier ${supplierId} not found`);
    error.statusCode = 404;
    throw error;
  }

  return res.rows[0];
};

const deleteSupplier = async (organisationId, supplierId) => {
  if (!organisationId || !supplierId) {
    throw new Error('organisationId and supplierId are required');
  }

  const res = await pool.query(
    `DELETE FROM suppliers
     WHERE (id::text = $1 OR LOWER(name) = LOWER($1))
       AND organisation_id = $2
     RETURNING id;`,
    [supplierId, organisationId]
  );

  return res.rows.length > 0;
};

const notifySupplier = async (organisationId, {
  branchId,
  supplierId,
  supplierName,
  productId,
  batchId,
  medicineName,
  sku,
  batchNo,
  currentStock = 0,
  reorderQuantity = 100,
  channel = 'PORTAL',
  priority = 'URGENT',
  recipientEmail,
  recipientPhone,
  message,
  userId,
}) => {
  if (!organisationId) {
    throw new Error('organisationId is required');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS supplier_notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
      supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
      product_id UUID REFERENCES products(id) ON DELETE SET NULL,
      batch_id UUID REFERENCES inventory_batches(id) ON DELETE SET NULL,
      medicine_name VARCHAR(200),
      supplier_name VARCHAR(200),
      current_stock INT NOT NULL DEFAULT 0,
      reorder_quantity INT NOT NULL DEFAULT 100,
      notification_type VARCHAR(50) DEFAULT 'LOW_STOCK',
      channel VARCHAR(50) DEFAULT 'PORTAL',
      priority VARCHAR(50) DEFAULT 'URGENT',
      recipient_email VARCHAR(200),
      recipient_phone VARCHAR(50),
      status VARCHAR(50) DEFAULT 'SENT',
      message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `).catch((err) => console.warn('Notification table creation notice:', err.message));

  let resolvedSupplierId = supplierId;
  let resolvedSupplierName = supplierName;
  let resolvedEmail = recipientEmail;
  let resolvedPhone = recipientPhone;

  if (supplierId || supplierName) {
    const sRes = await pool.query(
      `SELECT id, name, email, phone, contact_person
       FROM suppliers
       WHERE (organisation_id = $1 OR organisation_id IS NULL)
         AND (
           id::text = $2 
           OR LOWER(name) = LOWER($3)
           OR LOWER(name) LIKE '%' || LOWER($3) || '%'
           OR (email IS NOT NULL AND LOWER(email) = LOWER($4))
         )
       ORDER BY 
         CASE 
           WHEN id::text = $2 THEN 0 
           WHEN LOWER(name) = LOWER($3) THEN 1 
           ELSE 2 
         END
       LIMIT 1;`,
      [organisationId, supplierId || '00000000-0000-0000-0000-000000000000', supplierName || '', recipientEmail || '']
    );
    if (sRes.rows.length > 0) {
      resolvedSupplierId = sRes.rows[0].id;
      resolvedSupplierName = sRes.rows[0].name || resolvedSupplierName;
      if (!resolvedEmail || resolvedEmail.includes('example.com') || resolvedEmail.includes('pharma-distributor')) {
        resolvedEmail = sRes.rows[0].email || resolvedEmail;
      }
      if (!resolvedPhone) resolvedPhone = sRes.rows[0].phone;
    }
  }

  // Also check if there is an active portal user account for this supplier
  if (resolvedSupplierId) {
    const userRes = await pool.query(
      `SELECT email, phone FROM users WHERE supplier_id = $1 LIMIT 1;`,
      [resolvedSupplierId]
    );
    if (userRes.rows.length > 0) {
      if (userRes.rows[0].email) resolvedEmail = userRes.rows[0].email;
      if (userRes.rows[0].phone && !resolvedPhone) resolvedPhone = userRes.rows[0].phone;
    }
  }

  const notificationRef = `NOTIF-${Date.now().toString().slice(-6)}`;
  const finalMessage = message || `URGENT LOW STOCK REORDER ALERT:
Product: ${medicineName || 'Medicine'} (SKU: ${sku || 'N/A'}, Batch: ${batchNo || 'N/A'})
Current Stock: ${currentStock} units
Reorder Quantity: ${reorderQuantity} units
Please expedite dispatch immediately.`;

  const insertRes = await pool.query(
    `INSERT INTO supplier_notifications (
       organisation_id, branch_id, supplier_id, product_id, batch_id,
       medicine_name, supplier_name, current_stock, reorder_quantity,
       notification_type, channel, priority, recipient_email, recipient_phone,
       status, message
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'LOW_STOCK', $10, $11, $12, $13, 'SENT', $14)
     RETURNING *;`,
    [
      organisationId,
      branchId || null,
      resolvedSupplierId || null,
      productId || null,
      batchId || null,
      medicineName || 'Medicine',
      resolvedSupplierName || 'Supplier',
      parseInt(currentStock, 10) || 0,
      parseInt(reorderQuantity, 10) || 100,
      (channel || 'PORTAL').toUpperCase(),
      (priority || 'URGENT').toUpperCase(),
      resolvedEmail || 'orders@pharma-distributor.com',
      resolvedPhone || null,
      finalMessage,
    ]
  );

  await pool.query(
    `INSERT INTO audit_logs (organisation_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, 'NOTIFY_SUPPLIER', 'SUPPLIER_NOTIFICATION', $3, $4);`,
    [
      organisationId,
      userId || null,
      insertRes.rows[0].id,
      JSON.stringify({
        ref: notificationRef,
        medicine: medicineName,
        stock: currentStock,
        reorderQty: reorderQuantity,
        channel,
        supplier: resolvedSupplierName,
      }),
    ]
  ).catch((err) => console.warn('Audit log write error:', err.message));

  return {
    success: true,
    notificationId: insertRes.rows[0].id,
    referenceNumber: notificationRef,
    supplierName: resolvedSupplierName,
    channel,
    recipientEmail: resolvedEmail,
    recipientPhone: resolvedPhone,
    status: 'SENT',
    sentAt: insertRes.rows[0].created_at,
    message: finalMessage,
  };
};

/**
 * Fetch notifications directed to a specific supplier (or all if admin)
 */
const getSupplierPortalNotifications = async ({
  supplierId,
  email,
  organisationId,
  status,
  search,
  limit = 50,
  offset = 0,
}) => {
  let whereClauses = [];
  let params = [];

  if (supplierId && email) {
    params.push(supplierId, email.toLowerCase());
    whereClauses.push(`(sn.supplier_id = $${params.length - 1} OR LOWER(sn.recipient_email) = $${params.length})`);
  } else if (supplierId) {
    params.push(supplierId);
    whereClauses.push(`sn.supplier_id = $${params.length}`);
  } else if (email) {
    params.push(email.toLowerCase());
    whereClauses.push(`LOWER(sn.recipient_email) = $${params.length}`);
  } else if (organisationId) {
    params.push(organisationId);
    whereClauses.push(`sn.organisation_id = $${params.length}`);
  }

  if (status && status !== 'ALL') {
    params.push(status.toUpperCase());
    whereClauses.push(`sn.status = $${params.length}`);
  }

  if (search && typeof search === 'string' && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    whereClauses.push(`(
      LOWER(sn.medicine_name) LIKE $${params.length} OR 
      LOWER(COALESCE(b.name, '')) LIKE $${params.length} OR
      LOWER(COALESCE(sn.message, '')) LIKE $${params.length}
    )`);
  }

  const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const query = `
    SELECT 
      sn.id,
      sn.organisation_id,
      sn.branch_id,
      COALESCE(b.name, 'Main Branch') AS branch_name,
      b.city AS branch_city,
      b.phone AS branch_phone,
      sn.supplier_id,
      sn.supplier_name,
      sn.product_id,
      sn.batch_id,
      sn.medicine_name,
      p.sku,
      sn.current_stock,
      sn.reorder_quantity,
      sn.notification_type,
      sn.channel,
      sn.priority,
      sn.recipient_email,
      sn.recipient_phone,
      sn.status,
      sn.message,
      sn.created_at,
      sn.updated_at
    FROM supplier_notifications sn
    LEFT JOIN branches b ON b.id = sn.branch_id
    LEFT JOIN products p ON p.id = sn.product_id
    ${whereStr}
    ORDER BY 
      CASE WHEN sn.priority = 'URGENT' THEN 0 ELSE 1 END,
      sn.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx};
  `;

  const res = await pool.query(query, params);
  return res.rows.map((r) => ({
    id: r.id,
    organisationId: r.organisation_id,
    branchId: r.branch_id,
    branchName: r.branch_name,
    branchCity: r.branch_city,
    branchPhone: r.branch_phone,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    productId: r.product_id,
    batchId: r.batch_id,
    medicineName: r.medicine_name,
    sku: r.sku || `MED-${r.id.slice(0, 6).toUpperCase()}`,
    currentStock: r.current_stock,
    reorderQuantity: r.reorder_quantity,
    notificationType: r.notification_type,
    channel: r.channel,
    priority: r.priority,
    recipientEmail: r.recipient_email,
    recipientPhone: r.recipient_phone,
    status: r.status,
    message: r.message,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
};

/**
 * Update notification status (Acknowledge, Dispatch, Mark Delivered)
 */
const updateNotificationStatus = async ({
  notificationId,
  supplierId,
  email,
  status,
  notes,
  updatedBy,
}) => {
  if (!notificationId || !status) {
    throw new Error('Notification ID and status are required');
  }

  const validStatuses = ['SENT', 'ACKNOWLEDGED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];
  const upperStatus = status.toUpperCase().trim();
  if (!validStatuses.includes(upperStatus)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  let updateQuery = `
    UPDATE supplier_notifications
    SET status = $1,
        updated_at = CURRENT_TIMESTAMP
  `;
  const params = [upperStatus];

  if (notes) {
    params.push(`\n[Status update: ${upperStatus}]: ${notes}`);
    updateQuery += `, message = COALESCE(message, '') || $${params.length}`;
  }

  params.push(notificationId);
  updateQuery += ` WHERE id = $${params.length}`;

  if (supplierId && email) {
    params.push(supplierId, email.toLowerCase());
    updateQuery += ` AND (supplier_id = $${params.length - 1} OR LOWER(recipient_email) = $${params.length})`;
  } else if (supplierId) {
    params.push(supplierId);
    updateQuery += ` AND supplier_id = $${params.length}`;
  }

  updateQuery += ` RETURNING *;`;

  const res = await pool.query(updateQuery, params);
  if (res.rows.length === 0) {
    throw new Error('Notification not found or unauthorized to update.');
  }

  const updated = res.rows[0];

  // Audit log
  await pool.query(
    `INSERT INTO audit_logs (organisation_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, 'UPDATE_SUPPLIER_NOTIFICATION_STATUS', 'SUPPLIER_NOTIFICATION', $3, $4);`,
    [
      updated.organisation_id,
      updatedBy || null,
      updated.id,
      JSON.stringify({ status: upperStatus, notes: notes || null }),
    ]
  ).catch(() => {});

  return {
    success: true,
    notification: {
      id: updated.id,
      status: updated.status,
      medicineName: updated.medicine_name,
      updatedAt: updated.updated_at,
    },
  };
};

/**
 * Supplier Portal Dashboard Metrics
 */
const getSupplierDashboardStats = async ({ supplierId, email, organisationId }) => {
  let whereClauses = [];
  let params = [];

  if (supplierId && email) {
    params.push(supplierId, email.toLowerCase());
    whereClauses.push(`(sn.supplier_id = $1 OR LOWER(sn.recipient_email) = $2)`);
  } else if (supplierId) {
    params.push(supplierId);
    whereClauses.push(`sn.supplier_id = $1`);
  } else if (email) {
    params.push(email.toLowerCase());
    whereClauses.push(`LOWER(sn.recipient_email) = $1`);
  } else if (organisationId) {
    params.push(organisationId);
    whereClauses.push(`sn.organisation_id = $1`);
  }

  const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const statsRes = await pool.query(`
    SELECT
      COUNT(*)::int AS total_requests,
      COUNT(CASE WHEN sn.status IN ('SENT', 'ACKNOWLEDGED') THEN 1 END)::int AS pending_requests,
      COUNT(CASE WHEN sn.priority = 'URGENT' AND sn.status != 'DELIVERED' THEN 1 END)::int AS urgent_alerts,
      COUNT(CASE WHEN sn.status = 'IN_TRANSIT' THEN 1 END)::int AS in_transit,
      COUNT(CASE WHEN sn.status = 'DELIVERED' THEN 1 END)::int AS delivered,
      COUNT(DISTINCT sn.branch_id)::int AS branches_count
    FROM supplier_notifications sn
    ${whereStr};
  `, params);

  const stats = statsRes.rows[0] || {};

  // Fetch supplier profile
  let supplierProfile = null;
  if (supplierId) {
    const sRes = await pool.query(
      `SELECT id, name, contact_person, phone, email, city, gstin, category, status FROM suppliers WHERE id = $1 LIMIT 1;`,
      [supplierId]
    );
    supplierProfile = sRes.rows[0] || null;
  } else if (email) {
    const sRes = await pool.query(
      `SELECT id, name, contact_person, phone, email, city, gstin, category, status FROM suppliers WHERE LOWER(email) = LOWER($1) LIMIT 1;`,
      [email]
    );
    supplierProfile = sRes.rows[0] || null;
  }

  return {
    success: true,
    stats: {
      totalRequests: stats.total_requests || 0,
      pendingRequests: stats.pending_requests || 0,
      urgentAlerts: stats.urgent_alerts || 0,
      inTransit: stats.in_transit || 0,
      delivered: stats.delivered || 0,
      branchesCount: stats.branches_count || 0,
    },
    supplier: supplierProfile
      ? {
          id: supplierProfile.id,
          name: supplierProfile.name,
          contactPerson: supplierProfile.contact_person,
          phone: supplierProfile.phone,
          email: supplierProfile.email,
          city: supplierProfile.city,
          gstin: supplierProfile.gstin,
          category: supplierProfile.category,
          status: supplierProfile.status,
        }
      : null,
  };
};

/**
 * Get products catalog associated with supplier
 */
const getSupplierCatalog = async ({ supplierId, organisationId }) => {
  let query = `
    SELECT 
      p.id,
      p.medicine_name AS name,
      p.brand_name AS brand_name,
      p.strength,
      p.sku,
      p.category,
      COALESCE(AVG(b.mrp * 0.75), 50.00)::numeric(10,2) AS unit_price,
      COALESCE(AVG(b.mrp), 75.00)::numeric(10,2) AS mrp,
      COALESCE(SUM(b.quantity), 0)::int AS current_stock
    FROM products p
    LEFT JOIN inventory_batches b ON b.product_id = p.id
  `;
  const params = [];

  if (supplierId) {
    params.push(supplierId);
    query += ` WHERE (b.supplier_id = $1 OR p.id IN (SELECT product_id FROM supplier_notifications WHERE supplier_id = $1))`;
  } else if (organisationId) {
    params.push(organisationId);
    query += ` WHERE p.organisation_id = $1`;
  }

  query += ` GROUP BY p.id, p.medicine_name, p.brand_name, p.strength, p.sku, p.category ORDER BY p.medicine_name ASC LIMIT 50;`;

  const res = await pool.query(query, params);
  return res.rows.map((p) => ({
    id: p.id,
    name: p.name,
    brandName: p.brand_name,
    strength: p.strength,
    sku: p.sku,
    category: p.category,
    unitPrice: p.unit_price,
    mrp: p.mrp,
    currentStock: p.current_stock,
  }));
};

module.exports = {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplierStatus,
  updateSupplier,
  deleteSupplier,
  notifySupplier,
  getSupplierPortalNotifications,
  updateNotificationStatus,
  getSupplierDashboardStats,
  getSupplierCatalog,
};
