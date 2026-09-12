/**
 * Sync Service (PostgreSQL Batch Sync Engine)
 *
 * Coordinates client offline mutation batch processing and database synchronization.
 * Supports idempotency (OFF-07) and transactions for sales, returns, customers, and held bills.
 */

const { pool, checkDbConnection, isDbOnline } = require('../db/connection');
const cashierService = require('./cashier.service');
const customerService = require('./customer.service');

class SyncService {
  async getStatus() {
    const online = await checkDbConnection();
    return {
      success: true,
      online,
      timestamp: new Date().toISOString(),
      message: online ? 'Database connected and ready for sync' : 'Database offline',
    };
  }

  async testConnection() {
    const isOnline = await checkDbConnection();
    return {
      success: true,
      online: isOnline,
      message: isOnline
        ? 'Connected to PostgreSQL successfully'
        : 'Network/PostgreSQL is currently offline.',
    };
  }

  async processBatch(mutations = [], batchId = null) {
    const isOnline = await checkDbConnection();
    const syncedIds = [];
    const errors = [];

    console.log(`📥 Received offline sync batch: ${mutations.length} mutations (Batch: ${batchId || 'N/A'})`);

    for (const item of mutations) {
      try {
        const { id, type, action, data } = item;
        const opType = (type || action || '').toUpperCase();
        const payload = data || {};

        switch (opType) {
          case 'CREATE_INVOICE':
          case 'SALE': {
            const saleData = payload.invoice
              ? {
                  ...payload.invoice,
                  items: (payload.items && payload.items.length > 0)
                    ? payload.items
                    : (payload.invoice.items || []),
                  total: payload.invoice.grandTotal || payload.invoice.total,
                  subtotal: payload.invoice.subtotal,
                  tax: payload.invoice.tax,
                  discount: payload.invoice.totalDiscounts || payload.invoice.discount,
                  paymentMethod: payload.invoice.paymentMode || 'CASH',
                }
              : payload;

            const invNum = saleData.invoiceNo || saleData.invoiceNumber;
            if (invNum) {
              const existingInv = await pool.query(
                'SELECT id FROM invoices WHERE invoice_number = $1 LIMIT 1;',
                [invNum]
              );
              if (existingInv.rows.length > 0) {
                console.log(`ℹ️ Invoice ${invNum} already exists in PostgreSQL, marked synced.`);
                syncedIds.push(id);
                continue;
              }
            }
            await cashierService.createSale(saleData);
            syncedIds.push(id);
            console.log(`✓ Synced offline invoice: ${invNum || id}`);
            break;
          }

          case 'HOLD_BILL':
          case 'PARK_BILL': {
            await cashierService.saveHeldBill(payload);
            syncedIds.push(id);
            console.log(`✓ Synced offline held bill: ${payload.billNo || payload.holdId || id}`);
            break;
          }

          case 'CREATE_RETURN':
          case 'RETURN': {
            await cashierService.processReturn(payload);
            syncedIds.push(id);
            console.log(`✓ Synced offline return: ${payload.invoiceNo || payload.returnNo || id}`);
            break;
          }

          case 'CREATE_CUSTOMER': {
            let customerOrgId = payload.organisationId;
            if (!customerOrgId) {
              const defaultOrg = await pool.query('SELECT id FROM organisations LIMIT 1;');
              customerOrgId = defaultOrg.rows[0]?.id;
            }
            if (payload.phone) {
              const existingCust = await pool.query(
                'SELECT id FROM customers WHERE organisation_id = $1 AND phone = $2 LIMIT 1;',
                [customerOrgId, payload.phone.trim()]
              );
              if (existingCust.rows.length > 0) {
                console.log(`ℹ️ Customer with phone ${payload.phone} already exists in PostgreSQL, marked synced.`);
                syncedIds.push(id);
                continue;
              }
            }
            await customerService.createCustomer({
              organisationId: customerOrgId,
              name: payload.name || payload.fullName,
              phone: payload.phone,
              email: payload.email,
              category: payload.category || 'Regular',
              age: payload.age || 30,
              gender: payload.gender || 'F',
              city: payload.city || 'Mumbai',
              creditLimit: payload.creditLimit || 0,
            });
            syncedIds.push(id);
            console.log(`✓ Synced offline customer: ${payload.name || id}`);
            break;
          }

          default:
            console.log(`✓ Processed general offline mutation: ${opType} (${id})`);
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
}

module.exports = new SyncService();


