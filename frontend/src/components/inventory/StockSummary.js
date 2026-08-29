import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { MOCK_STOCK_SUMMARY } from '../../data/inventoryDashboardMockData';

export default function StockSummary({ data = MOCK_STOCK_SUMMARY, onViewAll }) {
  const [btnHovered, setBtnHovered] = useState(false);

  return (
    <View style={styles.cardContainer}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Stock Summary</Text>
      </View>

      {/* Table Container */}
      <View style={styles.tableContainer}>
        {/* Table Header */}
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.thCell, styles.categoryCol]}>Category</Text>
          <Text style={[styles.thCell, styles.numCol]}>Total Items</Text>
          <Text style={[styles.thCell, styles.numCol]}>In-Stock</Text>
          <Text style={[styles.thCell, styles.numCol]}>Low Stock</Text>
          <Text style={[styles.thCell, styles.numCol]}>Out-of-Stock</Text>
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

      {/* Footer Action */}
      <View style={styles.cardFooter}>
        <Pressable
          onPress={onViewAll}
          onHoverIn={() => setBtnHovered(true)}
          onHoverOut={() => setBtnHovered(false)}
          style={({ pressed }) => [
            styles.viewAllBtn,
            btnHovered && styles.viewAllBtnHovered,
            pressed && styles.viewAllBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="View All Stock"
        >
          <Text style={styles.viewAllBtnText}>View All Stock</Text>
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
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  tableContainer: {
    paddingHorizontal: 8,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  thCell: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'none',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  tdCell: {
    fontSize: 13.5,
    color: '#334155',
  },
  categoryCol: {
    flex: 2.2,
  },
  numCol: {
    flex: 1.2,
    textAlign: 'center',
  },
  categoryText: {
    fontWeight: '600',
    color: '#0F172A',
  },
  totalText: {
    fontWeight: '600',
    color: '#334155',
  },
  inStockText: {
    fontWeight: '600',
    color: '#16A34A',
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
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
    alignItems: 'flex-start',
  },
  viewAllBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#0F766E',
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
  },
  viewAllBtnHovered: {
    backgroundColor: '#CCFBF1',
  },
  viewAllBtnPressed: {
    backgroundColor: '#99F6E4',
  },
  viewAllBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F766E',
  },
});
