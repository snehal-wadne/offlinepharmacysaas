import { apiPost } from "./apiClient";

/**
 * Reorder stock.
 *
 * Quantity will increase by reorderLevel.
 */
export async function reorderStock({
  inventoryBatchId,
  sku,
  batchNo,
  reorderLevel,
}) {
  return apiPost(
    "/api/v1/inventory/stock-status/reorder",
    {
      inventoryBatchId,
      sku,
      batchNo,
      reorderLevel,
    }
  );
}

/**
 * Write off stock.
 *
 * Quantity will become 0.
 */
export async function writeOffStock({
  inventoryBatchId,
  sku,
  batchNo,
}) {
  return apiPost(
    "/api/v1/inventory/stock-status/write-off",
    {
      inventoryBatchId,
      sku,
      batchNo,
    }
  );
}