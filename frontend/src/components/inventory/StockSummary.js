import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";

export default function StockSummary({ data = [], onViewAll }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Safely fallback to an empty array if data prop is undefined, null, or non-array
  const stockList = Array.isArray(data) ? data : [];

  return (
    <View style={styles.cardContainer}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardTitle}>Stock Summary</Text>
          <Text style={styles.cardSubtitle}>
            Categorized live item breakdown
          </Text>
        </View>
        <Pressable
          onPress={onViewAll}
          style={styles.headerActionBtn}
          accessibilityRole="button"
          accessibilityLabel="View All Stock"
        >
          <Text style={styles.headerActionText}>View Stock →</Text>
        </Pressable>
      </View>

      {/* Table / Mobile Cards Container */}
      {isMobile ? (
        <View style={styles.mobileCardsContainer}>
          {stockList.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                No stock summary data available
              </Text>
            </View>
          ) : (
            stockList.map((row, index) => (
              <Pressable
                key={row?.id || `stock-item-${index}`}
                onPress={onViewAll}
                style={styles.mobileCategoryCard}
              >
                <View style={styles.mobileCardHeader}>
                  <Text style={styles.mobileCategoryTitle}>
                    {row?.category || "-"}
                  </Text>
                  <View style={styles.totalBadge}>
                    <Text style={styles.totalBadgeText}>
                      {row?.totalItems ?? 0} Items
                    </Text>
                  </View>
                </View>

                <View style={styles.mobileMetricsRow}>
                  <View style={[styles.mobileMetricBadge, styles.inStockBadge]}>
                    <Text style={styles.mobileMetricLabel}>IN STOCK</Text>
                    <Text style={styles.inStockVal}>{row?.inStock ?? 0}</Text>
                  </View>

                  <View
                    style={[styles.mobileMetricBadge, styles.lowStockBadge]}
                  >
                    <Text style={styles.mobileMetricLabel}>LOW STOCK</Text>
                    <Text style={styles.lowStockVal}>{row?.lowStock ?? 0}</Text>
                  </View>

                  <View
                    style={[styles.mobileMetricBadge, styles.outOfStockBadge]}
                  >
                    <Text style={styles.mobileMetricLabel}>OUT OF STOCK</Text>
                    <Text style={styles.outOfStockVal}>
                      {row?.outOfStock ?? 0}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))
          )}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.tableContainer}>
            {/* Table Header */}
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.thCell, styles.categoryCol]}>CATEGORY</Text>
              <Text style={[styles.thCell, styles.numCol]}>TOTAL ITEMS</Text>
              <Text style={[styles.thCell, styles.numCol]}>IN-STOCK</Text>
              <Text style={[styles.thCell, styles.numCol]}>LOW STOCK</Text>
              <Text style={[styles.thCell, styles.numCol]}>OUT OF STOCK</Text>
            </View>

            {/* Table Rows */}
            {stockList.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  No stock summary data available
                </Text>
              </View>
            ) : (
              stockList.map((row, index) => {
                const lowStockCount = Number(row?.lowStock ?? 0);
                const outOfStockCount = Number(row?.outOfStock ?? 0);

                return (
                  <View
                    key={row?.id || `stock-row-${index}`}
                    style={[
                      styles.tableRow,
                      index % 2 === 1 && styles.tableRowAlt,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tdCell,
                        styles.categoryCol,
                        styles.categoryText,
                      ]}
                    >
                      {row?.category || "-"}
                    </Text>
                    <Text
                      style={[styles.tdCell, styles.numCol, styles.totalText]}
                    >
                      {row?.totalItems ?? 0}
                    </Text>
                    <Text
                      style={[styles.tdCell, styles.numCol, styles.inStockText]}
                    >
                      {row?.inStock ?? 0}
                    </Text>
                    <Text
                      style={[
                        styles.tdCell,
                        styles.numCol,
                        lowStockCount > 0
                          ? styles.lowStockText
                          : styles.zeroText,
                      ]}
                    >
                      {lowStockCount}
                    </Text>
                    <Text
                      style={[
                        styles.tdCell,
                        styles.numCol,
                        outOfStockCount > 0
                          ? styles.outOfStockText
                          : styles.zeroText,
                      ]}
                    >
                      {outOfStockCount}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}

      {/* Footer Action Button */}
      <View style={styles.cardFooter}>
        <Pressable
          onPress={onViewAll}
          style={styles.viewAllBtn}
          accessibilityRole="button"
          accessibilityLabel="View All Stock Inventory"
        >
          <Text style={styles.viewAllBtnText}>
            📦 View All Stock Inventory →
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    padding: 20,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#28242B",
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#77717A",
    marginTop: 2,
  },
  headerActionBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  headerActionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#A66D86",
  },
  mobileCardsContainer: {
    gap: 12,
  },
  mobileCategoryCard: {
    backgroundColor: "#F8F5F7",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F8F5F7",
  },
  mobileCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  mobileCategoryTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#28242B",
  },
  totalBadge: {
    backgroundColor: "#E5DFE4",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  totalBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#77717A",
  },
  mobileMetricsRow: {
    flexDirection: "row",
    gap: 8,
  },
  mobileMetricBadge: {
    flex: 1,
    padding: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  mobileMetricLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#77717A",
    marginBottom: 2,
  },
  inStockBadge: {
    backgroundColor: "#EAF2EE",
  },
  inStockVal: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4F8A72",
  },
  lowStockBadge: {
    backgroundColor: "#F7F0E5",
  },
  lowStockVal: {
    fontSize: 13,
    fontWeight: "700",
    color: "#C49752",
  },
  outOfStockBadge: {
    backgroundColor: "#F7EDEE",
  },
  outOfStockVal: {
    fontSize: 13,
    fontWeight: "700",
    color: "#B85C64",
  },
  tableContainer: {
    minWidth: 500,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#F8F5F7",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 4,
  },
  thCell: {
    fontSize: 11,
    fontWeight: "700",
    color: "#77717A",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F8F5F7",
    alignItems: "center",
  },
  tableRowAlt: {
    backgroundColor: "#F8F5F7",
  },
  tdCell: {
    fontSize: 13,
  },
  categoryCol: {
    flex: 2,
  },
  numCol: {
    flex: 1,
    textAlign: "right",
  },
  categoryText: {
    fontWeight: "600",
    color: "#28242B",
  },
  totalText: {
    fontWeight: "600",
    color: "#28242B",
  },
  inStockText: {
    fontWeight: "600",
    color: "#4F8A72",
  },
  lowStockText: {
    fontWeight: "700",
    color: "#C49752",
  },
  outOfStockText: {
    fontWeight: "700",
    color: "#B85C64",
  },
  zeroText: {
    color: "#77717A",
  },
  emptyContainer: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 13,
    color: "#77717A",
    fontStyle: "italic",
  },
  cardFooter: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F8F5F7",
  },
  viewAllBtn: {
    alignItems: "center",
    paddingVertical: 8,
  },
  viewAllBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#A66D86",
  },
});