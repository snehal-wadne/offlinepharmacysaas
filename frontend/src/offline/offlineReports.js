/**
 * Offline report builders.
 *
 * Builds the same payloads the backend /reports/* endpoints return, but from the stock held
 * in IndexedDB, so reports keep working (and include stock added offline) with no network.
 */

import { db } from "../db/pharmaflowDb";

const DAY = 24 * 60 * 60 * 1000;
const isPlaceholder = (b) => !b || b === "BRANCH-MAIN" || b === "main";

function parseExpiry(value) {
  if (!value) return null;
  const s = String(value).trim();
  const my = s.match(/^(\d{1,2})\/(\d{4})$/); // MM/YYYY -> last day of that month
  if (my) return new Date(Number(my[2]), Number(my[1]), 0);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function loadBatches(branchId) {
  const org = (() => {
    try {
      return window.localStorage?.getItem("organisationId");
    } catch (e) {
      return null;
    }
  })();

  let records = [];
  try {
    records = org ? await db.inventory.where("organisationId").equals(org).toArray() : [];
  } catch (e) {}
  if (!records.length) {
    try {
      records = await db.inventory.toArray();
    } catch (e) {}
  }

  let products = [];
  try {
    products = await db.products.toArray();
  } catch (e) {}
  const byId = new Map(products.map((p) => [p.productId, p]));

  const wanted = branchId && branchId !== "All Branches" && branchId !== "all" ? branchId : null;

  return records
    .filter((r) => !wanted || r.branchId === wanted || isPlaceholder(r.branchId))
    .map((r) => {
      const p = byId.get(r.productId) || {};
      const name = r.medicineName || p.name || "Medicine";
      const mrp = Number(r.mrp ?? p.mrp ?? 0) || 0;
      return {
        productId: r.productId,
        name,
        sku: r.sku || p.sku || "",
        batch: r.batchNumber || "-",
        expiry: r.expiryDate || "",
        stock: Number(r.availableQuantity) || 0,
        mrp,
        costPrice: Math.round(mrp * 0.75 * 100) / 100,
        manufacturer: r.manufacturer || p.manufacturer || "",
        category: p.category || "",
      };
    });
}

const money = (n) => Math.round(n * 100) / 100;

export async function buildOfflineInventoryReport({ branchId } = {}) {
  const rows = await loadBatches(branchId);
  const now = Date.now();

  const items = rows
    .map((r) => {
      const exp = parseExpiry(r.expiry);
      return {
        productId: r.productId,
        name: r.name,
        sku: r.sku,
        batch: r.batch,
        expiry: r.expiry,
        stock: r.stock,
        mrp: r.mrp,
        costPrice: r.costPrice,
        valuationMrp: money(r.stock * r.mrp),
        valuationCost: money(r.stock * r.costPrice),
        status: r.stock < 50 ? "Low Stock" : "In Stock",
        manufacturer: r.manufacturer,
        category: r.category,
        _exp: exp,
      };
    })
    .sort((a, b) => a.stock - b.stock);

  const summary = {
    totalProducts: new Set(rows.map((r) => r.productId)).size,
    totalBatches: rows.length,
    totalUnitsInStock: rows.reduce((s, r) => s + r.stock, 0),
    totalValuationMrp: money(rows.reduce((s, r) => s + r.stock * r.mrp, 0)),
    totalValuationCost: money(rows.reduce((s, r) => s + r.stock * r.costPrice, 0)),
    lowStockBatches: items.filter((i) => i.stock > 0 && i.stock < 50).length,
    outOfStockBatches: items.filter((i) => i.stock === 0).length,
    expiredBatches: items.filter((i) => i._exp && i._exp.getTime() < now).length,
    nearExpiryBatches: items.filter(
      (i) => i._exp && i._exp.getTime() >= now && i._exp.getTime() <= now + 60 * DAY,
    ).length,
  };

  return { summary, items: items.map(({ _exp, ...rest }) => rest) };
}

export async function buildOfflineExpiryReport({ branchId } = {}) {
  const rows = await loadBatches(branchId);
  const now = Date.now();

  const batches = rows
    .filter((r) => r.stock > 0)
    .map((r) => ({ r, exp: parseExpiry(r.expiry) }))
    .filter(({ exp }) => exp && exp.getTime() <= now + 90 * DAY)
    .sort((a, b) => a.exp - b.exp)
    .map(({ r, exp }) => {
      const t = exp.getTime();
      const urgency =
        t < now
          ? "EXPIRED"
          : t <= now + 30 * DAY
            ? "EXPIRING_30_DAYS"
            : t <= now + 60 * DAY
              ? "EXPIRING_60_DAYS"
              : "EXPIRING_90_DAYS";
      return {
        productName: r.name,
        batchNumber: r.batch,
        expiryDate: r.expiry,
        stockQuantity: r.stock,
        mrp: r.mrp,
        costPrice: r.costPrice,
        totalCostValuation: money(r.stock * r.costPrice),
        urgency,
      };
    });

  const count = (u) => batches.filter((b) => b.urgency === u).length;
  return {
    summary: {
      totalExpiringBatches: batches.length,
      expiredCount: count("EXPIRED"),
      within30DaysCount: count("EXPIRING_30_DAYS"),
      within60DaysCount: count("EXPIRING_60_DAYS"),
      within90DaysCount: count("EXPIRING_90_DAYS"),
      totalLossAtRisk: money(batches.reduce((s, b) => s + b.totalCostValuation, 0)),
    },
    batches,
  };
}

/** Wrap a payload the way apiGet returns the server's { success, data } body. */
export const asApiResponse = (payload) => ({
  success: true,
  isOffline: true,
  fromCache: true,
  data: { success: true, data: payload },
});

async function loadSales({ branchId, startDate, endDate }) {
  let txs = [];
  try {
    txs = await db.transactions.toArray();
  } catch (e) {}
  const wanted = branchId && branchId !== "All Branches" && branchId !== "all" ? branchId : null;
  const start = startDate ? new Date(startDate).getTime() : Date.now() - 30 * DAY;
  const end = endDate ? new Date(endDate).getTime() : Date.now();
  return txs.filter((t) => {
    if (t.type !== "SALE") return false;
    if (t.status && ["CANCELLED", "FAILED", "VOIDED"].includes(String(t.status).toUpperCase())) return false;
    if (wanted && t.branchId !== wanted && !isPlaceholder(t.branchId)) return false;
    const at = new Date(t.occurredAt || t.createdAt).getTime();
    return at >= start && at <= end;
  });
}

export async function buildOfflineProfitLoss(params = {}) {
  const sales = await loadSales(params);
  const sum = (f) => sales.reduce((a, t) => a + (Number(f(t.payload || {})) || 0), 0);
  const subtotal = sum((p) => p.subtotal);
  const gross = sum((p) => p.totalAmount);
  return {
    grossRevenue: money(gross),
    subtotal: money(subtotal),
    totalDiscounts: money(sum((p) => p.discountAmount)),
    taxCollected: money(sum((p) => p.taxAmount)),
    invoicesCount: sales.length,
    estimatedCogs: money(subtotal * 0.75),
    grossProfit: money(gross - subtotal * 0.75),
  };
}

export async function buildOfflineSalesReport(params = {}) {
  const sales = await loadSales(params);
  const total = sales.reduce((a, t) => a + (Number(t.payload?.totalAmount) || 0), 0);
  const byDay = new Map();
  const byMethod = new Map();
  for (const t of sales) {
    const day = String(t.occurredAt || t.createdAt).slice(0, 10);
    const amt = Number(t.payload?.totalAmount) || 0;
    byDay.set(day, (byDay.get(day) || 0) + amt);
    for (const pay of t.payload?.payments || []) {
      byMethod.set(pay.method, (byMethod.get(pay.method) || 0) + (Number(pay.amount) || 0));
    }
  }
  return {
    overview: {
      totalSales: money(total),
      totalInvoices: sales.length,
      averageOrderValue: sales.length ? money(total / sales.length) : 0,
    },
    dailyTrend: [...byDay.entries()].sort().map(([date, amount]) => ({ date, total: money(amount) })),
    paymentMethods: [...byMethod.entries()].map(([method, amount]) => ({ method, total: money(amount) })),
  };
}
