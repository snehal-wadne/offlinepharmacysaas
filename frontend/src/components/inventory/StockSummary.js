import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { MOCK_STOCK_SUMMARY } from '../../data/inventoryDashboardMockData';

export default function StockSummary({ data = MOCK_STOCK_SUMMARY, onViewAll }) {
  return (
    <View style={styles.cardContainer}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardTitle}>Stock Summary</Text>
          <Text style={styles.cardSubtitle}>Categorized live item breakdown</Text>
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

      {/* Table Container */}
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
          {data.map((row, index) => (
            <View
              key={row.id || index}
              style={[
                styles.tableRow,
                index % 2 === 1 && styles.tableRowAlt,
              ]}
            >
              <Text style={[styles.tdCell, styles.categoryCol, styles.categoryText]}>
                {row.category}
              </Text>
              <Text style={[styles.tdCell, styles.numCol, styles.totalText]}>
                {row.totalItems}
              </Text>
              <Text style={[styles.tdCell, styles.numCol, styles.inStockText]}>
                {row.inStock}
              </Text>
              <Text
                style={[
                  styles.tdCell,
                  styles.numCol,
                  row.lowStock > 0 ? styles.lowStockText : styles.zeroText,
                ]}
              >
                {row.lowStock}
              </Text>
              <Text
                style={[
                  styles.tdCell,
                  styles.numCol,
                  row.outOfStock > 0 ? styles.outOfStockText : styles.zeroText,
                ]}
              >
                {row.outOfStock}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Footer Action Button */}
      <View style={styles.cardFooter}>
        <Pressable
          onPress={onViewAll}
          style={styles.viewAllBtn}
          accessibilityRole="button"
          accessibilityLabel="View All Stock Inventory"
        >
          <Text style={styles.viewAllBtnText}>📦 View All Stock Inventory →</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  cardHeader: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  headerActionBtn: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    cursor: 'pointer',
  },
  headerActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
  },
  tableContainer: {
    minWidth: 500,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  thCell: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryCol: {
    width: 130,
  },
  numCol: {
    width: 90,
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  tdCell: {
    fontSize: 13,
  },
  categoryText: {
    fontWeight: '600',
    color: '#334155',
  },
  totalText: {
    fontWeight: '700',
    color: '#0F172A',
  },
  inStockText: {
    fontWeight: '600',
    color: '#15803D',
  },
  lowStockText: {
    fontWeight: '700',
    color: '#D97706',
  },
  outOfStockText: {
    fontWeight: '700',
    color: '#DC2626',
  },
  zeroText: {
    color: '#94A3B8',
  },
  cardFooter: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#0F766E',
    cursor: 'pointer',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(15, 118, 110, 0.2)',
      },
    }),
  },
  viewAllBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
