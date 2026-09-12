/**
 * Stock Transfer Service
 *
 * Coordinates inter-branch inventory transfers and executes atomic stock movements.
 */

const { pool } = require('../db/connection');
const stockTransferRepo = require('../repositories/stock-transfer.repository');
const auditService = require('./audit.service');

class StockTransferService {
  async createTransfer(data) {
    const {
      organisationId,
      fromBranchId,
      toBranchId,
      transferDate,
      notes,
      createdBy,
      items,
    } = data;

    if (!organisationId || !fromBranchId || !toBranchId) {
      throw new Error('organisationId, fromBranchId, and toBranchId are required');
    }

    if (fromBranchId === toBranchId) {
      throw new Error('Source and destination branches cannot be the same');
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('At least one transfer line item is required');
    }

    // Verify sufficient stock for all items at source branch
    for (const item of items) {
      const batchRes = await pool.query(
        'SELECT id, quantity, branch_id FROM inventory_batches WHERE id = $1 LIMIT 1;',
        [item.inventoryBatchId]
      );

      if (batchRes.rows.length === 0) {
        throw new Error(`Inventory batch ${item.inventoryBatchId} not found`);
      }

      const batch = batchRes.rows[0];
      if (batch.branch_id !== fromBranchId) {
        throw new Error(`Batch ${item.inventoryBatchId} does not belong to source branch`);
      }

      if (Number(batch.quantity) < Number(item.quantity)) {
        throw new Error(`Insufficient stock for batch ${item.inventoryBatchId}. Available: ${batch.quantity}, Requested: ${item.quantity}`);
      }
    }

    const transfer = await stockTransferRepo.createStockTransfer({
      organisationId,
      fromBranchId,
      toBranchId,
      transferDate: transferDate || new Date(),
      status: 'DRAFT',
      notes: notes || null,
      createdBy: createdBy || null,
      items,
    });

    await auditService.log({
      organisationId,
      userId: createdBy,
      action: 'STOCK_TRANSFER_REQUESTED',
      entityType: 'stock_transfers',
      entityId: transfer.id,
      metadata: { transferNumber: transfer.transferNumber, fromBranchId, toBranchId, itemCount: items.length },
    });

    return transfer;
  }

  async getTransfers({ organisationId, branchId, limit = 50, offset = 0 }) {
    if (!organisationId) {
      throw new Error('organisationId is required');
    }

    let query = `
      SELECT 
        st.id,
        st.transfer_number AS "transferNumber",
        st.status,
        st.transfer_date AS "transferDate",
        st.notes,
        st.created_at AS "createdAt",
        fb.name AS "fromBranchName",
        tb.name AS "toBranchName",
        (SELECT COUNT(*) FROM stock_transfer_items sti WHERE sti.transfer_id = st.id) AS "itemCount"
      FROM stock_transfers st
      JOIN branches fb ON fb.id = st.from_branch_id
      JOIN branches tb ON tb.id = st.to_branch_id
      WHERE st.organisation_id = $1
    `;
    const params = [organisationId];

    if (branchId) {
      params.push(branchId);
      query += ` AND (st.from_branch_id = $2 OR st.to_branch_id = $2)`;
    }

    query += ` ORDER BY st.transfer_date DESC, st.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2};`;
    params.push(limit, offset);

    const res = await pool.query(query, params);
    return res.rows;
  }

  async getTransferById(organisationId, id) {
    if (!organisationId || !id) {
      throw new Error('organisationId and id are required');
    }

    const transfer = await stockTransferRepo.getStockTransferById(organisationId, id);
    if (!transfer) return null;

    const items = await stockTransferRepo.getStockTransferItems(organisationId, id);
    return {
      ...transfer,
      items,
    };
  }

  async updateTransferStatus(organisationId, id, newStatus, userId = null) {
    if (!organisationId || !id || !newStatus) {
      throw new Error('organisationId, id, and status are required');
    }

    let upperStatus = newStatus.toUpperCase();
    if (upperStatus === 'REQUESTED' || upperStatus === 'APPROVED') {
      upperStatus = 'DRAFT';
    }
    const validStatuses = ['DRAFT', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(upperStatus)) {
      upperStatus = 'DRAFT';
    }

    const existing = await stockTransferRepo.getStockTransferById(organisationId, id);
    if (!existing) {
      throw new Error('Stock transfer not found');
    }

    if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
      throw new Error(`Cannot transition from finalized status: ${existing.status}`);
    }

    // If moving to COMPLETED, execute atomic stock movements between branches
    if (upperStatus === 'COMPLETED') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const items = await stockTransferRepo.getStockTransferItems(organisationId, id, client);

        for (const item of items) {
          // 1. Fetch source batch
          const sourceRes = await client.query(
            'SELECT * FROM inventory_batches WHERE id = $1 FOR UPDATE;',
            [item.inventory_batch_id]
          );
          if (sourceRes.rows.length === 0) {
            throw new Error(`Source batch ${item.inventory_batch_id} not found`);
          }
          const srcBatch = sourceRes.rows[0];

          if (Number(srcBatch.quantity) < Number(item.quantity)) {
            throw new Error(`Insufficient stock in source batch ${srcBatch.batch_number}. Available: ${srcBatch.quantity}, Needed: ${item.quantity}`);
          }

          // Deduct from source batch
          await client.query(
            'UPDATE inventory_batches SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;',
            [item.quantity, srcBatch.id]
          );

          // 2. Add to destination branch batch
          const destRes = await client.query(
            'SELECT id FROM inventory_batches WHERE branch_id = $1 AND product_id = $2 AND batch_number = $3 LIMIT 1;',
            [existing.to_branch_id, srcBatch.product_id, srcBatch.batch_number]
          );

          if (destRes.rows.length > 0) {
            await client.query(
              'UPDATE inventory_batches SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;',
              [item.quantity, destRes.rows[0].id]
            );
          } else {
            await client.query(`
              INSERT INTO inventory_batches (
                product_id, branch_id, supplier_id, batch_number, expiry_date,
                mrp, quantity, shelf_location
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
            `, [
              srcBatch.product_id,
              existing.to_branch_id,
              srcBatch.supplier_id,
              srcBatch.batch_number,
              srcBatch.expiry_date,
              srcBatch.mrp,
              item.quantity,
              srcBatch.shelf_location,
            ]);
          }
        }

        // Update transfer status
        const updateRes = await client.query(`
          UPDATE stock_transfers
          SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND organisation_id = $2
          RETURNING *;
        `, [id, organisationId]);

        await client.query('COMMIT');

        await auditService.log({
          organisationId,
          userId,
          action: 'STOCK_TRANSFER_COMPLETED',
          entityType: 'stock_transfers',
          entityId: id,
          metadata: { transferNumber: existing.transfer_number },
        });

        return updateRes.rows[0];
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      const updated = await stockTransferRepo.updateStockTransferStatus(organisationId, id, upperStatus);
      return updated;
    }
  }
}

module.exports = new StockTransferService();
