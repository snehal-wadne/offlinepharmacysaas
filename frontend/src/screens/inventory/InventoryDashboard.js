import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import InventoryStatCard from "../../components/inventory/InventoryStatCard";
import StockSummary from "../../components/inventory/StockSummary";
import PendingPurchaseOrders from "../../components/inventory/PendingPurchaseOrders";
import RecentStockMovements from "../../components/inventory/RecentStockMovements";
import QuickActions from "../../components/inventory/QuickActions";
import { SkeletonKpiCard } from "../../components/common/SkeletonLoader";
import { fetchPurchases } from "../../api/purchaseApi";
import {
  fetchInventory,
  fetchInventorySummary,
  fetchStockMovements,
} from "../../api/inventoryApi";

// Universal array extractor for flexible backend response structures
const extractArray = (res) => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  if (res.data && Array.isArray(res.data.data)) return res.data.data;
  if (res.data && Array.isArray(res.data.items)) return res.data.items;
  if (res.data && Array.isArray(res.data.purchases)) return res.data.purchases;
  if (res.data && Array.isArray(res.data.orders)) return res.data.orders;
  if (res.data && Array.isArray(res.data.movements)) return res.data.movements;
  if (Array.isArray(res.items)) return res.items;
  return [];
};

export default function InventoryDashboard({
  onNavigate,
  onShowToast,
  selectedBranch = "All Branches",
}) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;

  const [pendingOrders, setPendingOrders] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [recentMovements, setRecentMovements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const branchName =
      typeof selectedBranch === "object" && selectedBranch !== null
        ? selectedBranch.name
        : selectedBranch;
    const branchId =
      typeof selectedBranch === "object" && selectedBranch !== null
        ? selectedBranch.id
        : selectedBranch;
    const isFiltered = Boolean(
      branchName &&
      branchName !== "All Branches" &&
      branchName !== "all" &&
      branchName !== "No Active Branch"
    );
    const branchParam = isFiltered ? branchId || branchName : undefined;

    async function loadDashboardData() {
      setLoading(true);

      // 1. Fetch Pending Purchase Orders
      try {
        const poRes = await fetchPurchases({
          status: "PENDING",
          branchId: branchParam,
        });

        const rawOrders = extractArray(poRes);


        if (isMounted) {
          let list = rawOrders;
          if (isFiltered) {
            list = list.filter(
              (po) =>
                !po.branch ||
                po.branch === branchName ||
                po.branchName === branchName ||
                po.branch_id === branchId ||
                po.branchId === branchId
            );
          }

          const formatted = list.map((po) => ({
            id: po.purchase_number || po.purchaseNumber || po.id || "PO-000",
            rawId: po.id,
            supplierName:
              po.supplier_name ||
              po.supplierName ||
              (typeof po.supplier === "object" ? po.supplier?.name : po.supplier) ||
              "Supplier",
            amount:
              po.total_amount != null
                ? `₹${Number(po.total_amount).toLocaleString("en-IN")}`
                : po.totalAmount != null
                  ? `₹${Number(po.totalAmount).toLocaleString("en-IN")}`
                  : po.amount != null
                    ? `₹${Number(po.amount).toLocaleString("en-IN")}`
                    : "₹0.00",
            timeAgo:
              po.order_date || po.orderDate || po.createdAt
                ? new Date(
                  po.order_date || po.orderDate || po.createdAt
                ).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
                : "Recently",
          }));
          console.log(formatted);

          setPendingOrders(formatted);
        }
      } catch (err) {
        console.warn(
          "[InventoryDashboard] Pending POs fetch error:",
          err.message
        );
        if (isMounted) setPendingOrders([]);
      }

      // 2. Fetch Summary Statistics
      try {
        const summaryRes = await fetchInventorySummary({ branchId: branchParam });
        if (isMounted && summaryRes) {
          const payload = summaryRes.data?.data || summaryRes.data || summaryRes;
          setSummaryData(payload);
        }
      } catch (err) {
        console.warn("[InventoryDashboard] Summary API error:", err.message);
      }

      // 3. Fetch Recent Stock Movements
      try {
        const movementsRes = await fetchStockMovements({
          branchId: branchParam,
        });

        const rawMovs = extractArray(movementsRes);

        if (isMounted) {
          let movs = rawMovs;
          if (isFiltered) {
            movs = movs.filter(
              (m) =>
                !m.branchName ||
                m.branchName === branchName ||
                m.branch_id === branchId ||
                m.branchId === branchId
            );
          }
          setRecentMovements(movs);
        }
      } catch (err) {
        console.warn(
          "[InventoryDashboard] Stock movements API error:",
          err.message
        );
        if (isMounted) setRecentMovements([]);
      }

      // 4. Fetch Inventory Items
      try {
        const invRes = await fetchInventory({ branchId: branchParam });
        const rawInv = extractArray(invRes);

        if (isMounted) {
          let items = rawInv;
          if (isFiltered) {
            items = items.filter(
              (item) =>
                !item.branchName ||
                item.branchName === branchName ||
                item.branch_id === branchId ||
                item.branchId === branchId
            );
          }
          setInventoryItems(items);
        }
      } catch (err) {
        console.warn("[InventoryDashboard] Inventory API error:", err.message);
        if (isMounted) setInventoryItems([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDashboardData();
    return () => {
      isMounted = false;
    };
  }, [selectedBranch]);

  const handleQuickAction = (id) => {
    if (id === "view-stock" || id === "stock-adjustment") {
      onNavigate?.("stock-adjustments");
    } else if (id === "add-customer") {
      onNavigate?.("customers-patients");
      onShowToast?.("Redirecting to Customers & Patients Directory...");
    } else if (id === "receive-stock") {
      onNavigate?.("goods-receiving");
    } else if (id === "customer-ledger") {
      onNavigate?.("customer-ledger");
      onShowToast?.("Redirecting to Customer Ledger Statement...");
    } else if (id === "stock-transfer") {
      onNavigate?.("stock-transfer");
    } else if (id === "create-stocktake") {
      onNavigate?.("inventory-reports");
    }
  };

  const handleViewAllStock = () => onNavigate?.("stock-adjustments");
  const handleViewAllPurchaseOrders = () => onNavigate?.("purchases");
  const handleViewAllMovements = () => onNavigate?.("inventory-reports");

  const handleOrderPress = (order) => {
    onNavigate?.("purchases");
    onShowToast?.(`Viewing details for ${order.id || order.poNumber}`);
  };

  const handleMovementPress = (movement) => {
    onShowToast?.(
      `Movement: ${movement.item || movement.productName || "Item"} (${movement.type || ""} ${movement.quantity || ""})`
    );
  };

  // KPI Calculations
  const totalProductsVal =
    summaryData?.totalProducts != null
      ? summaryData.totalProducts
      : inventoryItems.length > 0
        ? new Set(
          inventoryItems.map(
            (i) => i.productId || i.brandName || i.medicineName || i.name || i.id
          )
        ).size
        : 0;

  const lowStockVal =
    summaryData?.lowStockCount != null
      ? summaryData.lowStockCount
      : inventoryItems.length > 0
        ? inventoryItems.filter((i) => {
          const qty = Number(i.quantity ?? i.stock_quantity ?? i.stock ?? 0);
          return qty < 50 && qty > 0;
        }).length
        : 0;

  const nearExpiryVal =
    summaryData?.nearExpiryCount != null
      ? summaryData.nearExpiryCount
      : inventoryItems.length > 0
        ? inventoryItems.filter((i) => {
          const expDate = i.expiryDate || i.expiry_date || i.exp_date;
          if (expDate) {
            const diffDays =
              (new Date(expDate) - new Date()) / (1000 * 60 * 60 * 24);
            return diffDays >= 0 && diffDays <= 60;
          }
          return false;
        }).length
        : 0;

  const expiredVal =
    summaryData?.expiredCount != null
      ? summaryData.expiredCount
      : inventoryItems.length > 0
        ? inventoryItems.filter((i) => {
          const expDate = i.expiryDate || i.expiry_date || i.exp_date;
          const qty = Number(i.quantity ?? i.stock_quantity ?? i.stock ?? 0);
          if (expDate) return new Date(expDate) < new Date();
          return qty === 0;
        }).length
        : 0;

  const dynamicKpiData = [
    {
      id: "kpi-1",
      label: "TOTAL PRODUCTS",
      value: Number(totalProductsVal).toLocaleString(),
      subtext:
        summaryData || inventoryItems.length > 0
          ? "Live database count"
          : "0 products in inventory",
      variant: "teal",
    },
    {
      id: "kpi-2",
      label: "LOW STOCK ALERTS",
      value: Number(lowStockVal).toLocaleString(),
      subtext: "Requires reorder soon",
      variant: "amber",
    },
    {
      id: "kpi-3",
      label: "NEAR EXPIRY (< 60D)",
      value: Number(nearExpiryVal).toLocaleString(),
      subtext: "Discount or return",
      variant: "blue",
    },
    {
      id: "kpi-4",
      label: "EXPIRED STOCK",
      value: Number(expiredVal).toLocaleString(),
      subtext: "Pending disposal/return",
      variant: "red",
    },
  ];

  // Dynamic Categorized Stock Summary Calculation
  const categorySummaryData = useMemo(() => {
    if (!inventoryItems || inventoryItems.length === 0) {
      return [];
    }

    const categoryMap = {};

    inventoryItems.forEach((item) => {
      const medName = (
        item.medicineName ||
        item.brandName ||
        item.name ||
        ""
      ).toLowerCase();

      // Resolve explicit category field first, fallback to keyword matching
      let catName =
        item.category ||
        item.categoryName ||
        item.category_name ||
        item.category_title;

      if (!catName) {
        if (
          medName.includes("paracetamol") ||
          medName.includes("dolo") ||
          medName.includes("brufen") ||
          medName.includes("ibuprofen") ||
          medName.includes("advil") ||
          medName.includes("calpol") ||
          medName.includes("suraj")
        ) {
          catName = "Pain Relief & Analgesics";
        } else if (
          medName.includes("amox") ||
          medName.includes("mox") ||
          medName.includes("antibiotic") ||
          medName.includes("azithro")
        ) {
          catName = "Antibiotics & Antibacterials";
        } else if (
          medName.includes("cetirizine") ||
          medName.includes("cetcip") ||
          medName.includes("zyrtec") ||
          medName.includes("cough")
        ) {
          catName = "Respiratory & Anti-Allergy";
        } else if (
          medName.includes("omeprazole") ||
          medName.includes("omez") ||
          medName.includes("razole") ||
          medName.includes("antacid")
        ) {
          catName = "Gastrointestinal & Acid Relief";
        } else {
          catName = "General Health & Others";
        }
      }

      if (!categoryMap[catName]) {
        categoryMap[catName] = {
          id: `cat-${Object.keys(categoryMap).length + 1}`,
          category: catName,
          totalItems: 0,
          inStock: 0,
          lowStock: 0,
          outOfStock: 0,
        };
      }

      const cat = categoryMap[catName];
      const qty = Number(item.quantity ?? item.stock_quantity ?? item.stock ?? 0);

      cat.totalItems += 1;
      if (qty >= 50) cat.inStock += 1;
      else if (qty > 0) cat.lowStock += 1;
      else cat.outOfStock += 1;
    });

    return Object.values(categoryMap);
  }, [inventoryItems]);

  if (loading) {
    return (
      <View
        style={[
          styles.scrollContent,
          { flexDirection: "row", gap: 16, flexWrap: "wrap" },
        ]}
      >
        <SkeletonKpiCard />
        <SkeletonKpiCard />
        <SkeletonKpiCard />
        <SkeletonKpiCard />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scrollBody}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={true}
    >
      {/* Page Title Section */}
      <View style={styles.titleSection}>
        <Text style={styles.pageTitle}>Inventory Overview</Text>
        <Text style={styles.pageSubtitle}>
          Monitor stock levels, expiry risks and recent inventory activity.
        </Text>
      </View>

      {/* Section 1: Dynamic KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {dynamicKpiData.map((kpi) => (
          <InventoryStatCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            subtext={kpi.subtext}
            variant={kpi.variant}
            onPress={() => {
              if (kpi.id === "kpi-2") {
                onNavigate?.("stock-status");
              } else if (kpi.id === "kpi-3" || kpi.id === "kpi-4") {
                onNavigate?.("expiry-reports");
              } else {
                onNavigate?.("stock-adjustments");
              }
            }}
          />
        ))}
      </View>

      {/* Section 2: Stock Summary + Pending Purchase Orders */}
      <View style={[styles.gridRow, isCompact && styles.gridRowStacked]}>
        <View style={[styles.gridColLeft, isCompact && styles.gridColFull]}>
          <StockSummary
            data={categorySummaryData}
            onViewAll={handleViewAllStock}
          />
        </View>
        <View style={[styles.gridColRight, isCompact && styles.gridColFull]}>
          <PendingPurchaseOrders
            orders={pendingOrders || []}
            onViewAll={handleViewAllPurchaseOrders}
            onOrderPress={handleOrderPress}
          />
        </View>
      </View>

      {/* Section 3: Recent Stock Movements + Quick Actions */}
      <View style={[styles.gridRow, isCompact && styles.gridRowStacked]}>
        <View style={[styles.gridColLeft, isCompact && styles.gridColFull]}>
          <RecentStockMovements
            movements={recentMovements || []}
            onViewAll={handleViewAllMovements}
            onMovementPress={handleMovementPress}
          />
        </View>
        <View style={[styles.gridColRight, isCompact && styles.gridColFull]}>
          <QuickActions onAction={handleQuickAction} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 24,
  },
  titleSection: {
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.4,
  },
  pageSubtitle: {
    fontSize: 13.5,
    fontWeight: "500",
    color: "#64748B",
    marginTop: 4,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },
  kpiRowCompact: {
    gap: 12,
  },
  gridRow: {
    flexDirection: "row",
    gap: 24,
  },
  gridRowStacked: {
    flexDirection: "column",
    gap: 16,
  },
  gridColLeft: {
    flex: 2,
    minWidth: 320,
  },
  gridColRight: {
    flex: 1,
    minWidth: 280,
  },
  gridColFull: {
    flex: 1,
    width: "100%",
  },
});