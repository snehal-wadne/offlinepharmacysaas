import React, { useEffect, useState } from "react";
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

import { fetchMainDashboard } from "../../api/apiDashboard";

export default function InventoryDashboard({
  onNavigate,
  onShowToast,
  selectedBranch = "All Branches",
}) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      setLoading(true);

      try {
        const rawBranchId =
          typeof selectedBranch === "object" &&
          selectedBranch !== null
            ? selectedBranch.id
            : typeof selectedBranch === "string" && selectedBranch !== "All Branches"
            ? selectedBranch
            : null;

        const isAllBranches =
          !selectedBranch ||
          selectedBranch === "All Branches" ||
          selectedBranch === "all" ||
          selectedBranch === "ALL" ||
          selectedBranch === "No Active Branch" ||
          !rawBranchId ||
          rawBranchId === "main" ||
          rawBranchId === "null" ||
          rawBranchId === "undefined";

        const response = await fetchMainDashboard(
          isAllBranches ? null : rawBranchId
        );

        console.log(
          "📊 INVENTORY DASHBOARD RESPONSE:",
          response
        );

        if (!response?.success) {
          console.error(
            "❌ INVENTORY DASHBOARD ERROR:",
            response?.error
          );

          if (isMounted) {
            setDashboardData(null);
          }

          return;
        }

        const data = response?.data?.data || response?.data;

        console.log(
          "📊 INVENTORY DASHBOARD DATA:",
          data
        );

        if (isMounted) {
          setDashboardData(data || null);
        }
      } catch (error) {
        console.error(
          "❌ INVENTORY DASHBOARD LOAD ERROR:",
          error
        );

        if (isMounted) {
          setDashboardData(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [selectedBranch]);

  const handleQuickAction = (id) => {
    if (
      id === "view-stock" ||
      id === "stock-adjustment"
    ) {
      onNavigate?.("stock-adjustments");
    } else if (id === "add-customer") {
      onNavigate?.("customers-patients");
      onShowToast?.(
        "Redirecting to Customers & Patients Directory..."
      );
    } else if (id === "receive-stock") {
      onNavigate?.("goods-receiving");
    } else if (id === "customer-ledger") {
      onNavigate?.("customer-ledger");
      onShowToast?.(
        "Redirecting to Customer Ledger Statement..."
      );
    } else if (id === "stock-transfer") {
      onNavigate?.("stock-transfer");
    } else if (id === "create-stocktake") {
      onNavigate?.("inventory-reports");
    }
  };

  const handleViewAllStock = () => {
    onNavigate?.("stock-adjustments");
  };

  const handleViewAllPurchaseOrders = () => {
    onNavigate?.("purchases");
  };

  const handleViewAllMovements = () => {
    onNavigate?.("inventory-reports");
  };

  const handleOrderPress = (order) => {
    onNavigate?.("purchases");

    onShowToast?.(
      `Viewing details for ${
        order?.purchaseNumber ||
        order?.id ||
        "purchase order"
      }`
    );
  };

  const handleMovementPress = (movement) => {
    onShowToast?.(
      `Movement: ${
        movement?.item || "Item"
      } (${movement?.type || ""} ${
        movement?.quantity ?? ""
      })`
    );
  };

  // ============================================================
  // DASHBOARD DATA
  // ============================================================

  const overview =
    dashboardData?.overview || {
      totalProducts: 0,
      lowStockAlerts: 0,
      nearExpiry: 0,
      expiredStock: 0,
    };

  const stockSummary =
    Array.isArray(dashboardData?.stockSummary)
      ? dashboardData.stockSummary
      : [];

  const pendingPurchaseOrders =
    Array.isArray(
      dashboardData?.pendingPurchaseOrders
    )
      ? dashboardData.pendingPurchaseOrders
      : [];

  const recentStockMovements =
    Array.isArray(
      dashboardData?.recentStockMovements
    )
      ? dashboardData.recentStockMovements
      : [];

  // ============================================================
  // KPI DATA
  // ============================================================

  const kpiData = [
    {
      id: "kpi-1",
      label: "TOTAL PRODUCTS",
      value: Number(
        overview.totalProducts || 0
      ).toLocaleString(),
      subtext: "Live database count",
      variant: "teal",
    },
    {
      id: "kpi-2",
      label: "LOW STOCK ALERTS",
      value: Number(
        overview.lowStockAlerts || 0
      ).toLocaleString(),
      subtext: "Requires reorder soon",
      variant: "amber",
    },
    {
      id: "kpi-3",
      label: "NEAR EXPIRY (< 90D)",
      value: Number(
        overview.nearExpiry || 0
      ).toLocaleString(),
      subtext: "Discount or return",
      variant: "blue",
    },
    {
      id: "kpi-4",
      label: "EXPIRED STOCK",
      value: Number(
        overview.expiredStock || 0
      ).toLocaleString(),
      subtext: "Pending disposal/return",
      variant: "red",
    },
  ];

  // ============================================================
  // LOADING
  // ============================================================

  if (loading) {
    return (
      <View
        style={[
          styles.scrollContent,
          {
            flexDirection: "row",
            gap: 16,
            flexWrap: "wrap",
          },
        ]}
      >
        <SkeletonKpiCard />
        <SkeletonKpiCard />
        <SkeletonKpiCard />
        <SkeletonKpiCard />
      </View>
    );
  }

  // ============================================================
  // UI
  // ============================================================

  return (
    <ScrollView
      style={styles.scrollBody}
      contentContainerStyle={[
        styles.scrollContent,
        isMobile && styles.scrollContentMobile,
      ]}
      showsVerticalScrollIndicator={true}
    >
      <View style={styles.titleSection}>
        <Text style={styles.pageTitle}>
          Inventory Overview
        </Text>

        <Text style={styles.pageSubtitle}>
          Monitor stock levels, expiry risks and recent
          inventory activity.
        </Text>
      </View>

      {/* KPI CARDS */}

      <View
        style={[
          styles.kpiRow,
          isCompact && styles.kpiRowCompact,
          isMobile && styles.kpiRowMobile,
        ]}
      >
        {kpiData.map((kpi) => (
          <View
            key={kpi.id}
            style={[styles.kpiCol, isMobile && styles.kpiColMobile]}
          >
            <InventoryStatCard
              label={kpi.label}
              value={kpi.value}
              subtext={kpi.subtext}
              variant={kpi.variant}
              onPress={() => {
                if (kpi.id === "kpi-2") {
                  onNavigate?.("stock-status");
                } else if (
                  kpi.id === "kpi-3" ||
                  kpi.id === "kpi-4"
                ) {
                  onNavigate?.("expiry-reports");
                } else {
                  onNavigate?.("stock-adjustments");
                }
              }}
            />
          </View>
        ))}
      </View>

      {/* STOCK SUMMARY + PURCHASE ORDERS */}

      <View
        style={[
          styles.gridRow,
          isCompact && styles.gridRowStacked,
        ]}
      >
        <View
          style={[
            styles.gridColLeft,
            isCompact && styles.gridColFull,
          ]}
        >
          <StockSummary
            data={stockSummary}
            onViewAll={handleViewAllStock}
          />
        </View>

        <View
          style={[
            styles.gridColRight,
            isCompact && styles.gridColFull,
          ]}
        >
          <PendingPurchaseOrders
            orders={pendingPurchaseOrders}
            onViewAll={handleViewAllPurchaseOrders}
            onOrderPress={handleOrderPress}
          />
        </View>
      </View>

      {/* RECENT MOVEMENTS + QUICK ACTIONS */}

      <View
        style={[
          styles.gridRow,
          isCompact && styles.gridRowStacked,
        ]}
      >
        <View
          style={[
            styles.gridColLeft,
            isCompact && styles.gridColFull,
          ]}
        >
          <RecentStockMovements
            movements={recentStockMovements}
            onViewAll={handleViewAllMovements}
            onMovementPress={handleMovementPress}
          />
        </View>

        <View
          style={[
            styles.gridColRight,
            isCompact && styles.gridColFull,
          ]}
        >
          <QuickActions
            onAction={handleQuickAction}
          />
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

  scrollContentMobile: {
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 32,
    gap: 14,
  },

  titleSection: {
    marginBottom: 4,
  },

  pageTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#28242B",
    letterSpacing: -0.4,
  },

  pageSubtitle: {
    fontSize: 13.5,
    fontWeight: "500",
    color: "#77717A",
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

  kpiRowMobile: {
    gap: 10,
    justifyContent: "space-between",
  },

  kpiCol: {
    flex: 1,
    minWidth: 160,
  },

  kpiColMobile: {
    width: "48.5%",
    minWidth: "48.5%",
    maxWidth: "48.5%",
    flex: 0,
    flexGrow: 0,
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
