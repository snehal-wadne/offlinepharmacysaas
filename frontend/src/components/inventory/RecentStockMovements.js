import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { MOCK_RECENT_MOVEMENTS } from '../../data/inventoryDashboardMockData';

const TYPE_CONFIG = {
  Purchase: {
    bgColor: '#E6F4EA',
    textColor: '#137333',
    label: 'Purchase',
  },
  Sale: {
    bgColor: '#E8F0FE',
    textColor: '#1A73E8',
    label: 'Sale',
  },
  Adjustment: {
    bgColor: '#F3E8FF',
    textColor: '#7C3AED',
    label: 'Adjustment',
  },
  Transfer: {
    bgColor: '#E0F2FE',
    textColor: '#0369A1',
    label: 'Transfer',
  },
  Return: {
    bgColor: '#FEF3C7',
    textColor: '#B45309',
    label: 'Return',
  },
};

const STATUS_CONFIG = {
  Completed: {
    bgColor: '#DCFCE7',
    textColor: '#15803D',
    label: 'Completed',
  },
  Approved: {
    bgColor: '#DCFCE7',
    textColor: '#15803D',
    label: 'Approved',
  },
  'In Transit': {
    bgColor: '#DBEAFE',
    textColor: '#1D4ED8',
    label: 'In Transit',
  },
  Pending: {
    bgColor: '#FEF3C7',
    textColor: '#B45309',
    label: 'Pending',
  },
  Cancelled: {
    bgColor: '#FEE2E2',
    textColor: '#B91C1C',
    label: 'Cancelled',
  },
};

export default function RecentStockMovements({
  movements = MOCK_RECENT_MOVEMENTS,
  onViewAll,
  onMovementPress,
}) {
  const movementList = Array.isArray(movements)
    ? movements
    : Array.isArray(MOCK_RECENT_MOVEMENTS)
    ? MOCK_RECENT_MOVEMENTS
    : [];

  return (
    <View style={styles.cardContainer}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Recent Stock Movements</Text>
        <Pressable
          onPress={onViewAll}
          style={styles.viewAllLink}
          accessibilityRole="button"
          accessibilityLabel="View all recent stock movements"
        >
          <Text style={styles.viewAllText}>View All</Text>
        </Pressable>
      </View>

      {/* Table Container */}
      <View style={styles.tableContainer}>
        {/* Table Header */}
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.thCell, styles.colDate]}>Date</Text>
          <Text style={[styles.thCell, styles.colType]}>Type</Text>
          <Text style={[styles.thCell, styles.colItem]}>Item</Text>
          <Text style={[styles.thCell, styles.colQty]}>Quantity</Text>
          <Text style={[styles.thCell, styles.colRef]}>Reference</Text>
          <Text style={[styles.thCell, styles.colStatus]}>Status</Text>
        </View>

        {/* Table Rows */}
        {movementList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No recent stock movements recorded</Text>
          </View>
        ) : (
          movementList.map((mov, index) => {
            const qtyStr = String(mov.quantity || '');
            const isPositive = qtyStr.startsWith('+');
            const isNegative = qtyStr.startsWith('-');
            const typeConf = TYPE_CONFIG[mov.type] || TYPE_CONFIG.Purchase;
            const statusConf = STATUS_CONFIG[mov.status] || STATUS_CONFIG.Completed;

            return (
              <Pressable
                key={mov.id || index}
                onPress={() => onMovementPress && onMovementPress(mov)}
                style={[
                  styles.tableRow,
                  index % 2 === 1 && styles.tableRowAlt,
                ]}
              >
                {/* Date */}
                <Text style={[styles.tdCell, styles.colDate, styles.dateText]}>
                  {mov.date || '-'}
                </Text>

                {/* Movement Type */}
                <View style={[styles.colType, styles.badgeWrapper]}>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: typeConf.bgColor },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        { color: typeConf.textColor },
                      ]}
                    >
                      {typeConf.label}
                    </Text>
                  </View>
                </View>

                {/* Item Name */}
                <Text
                  style={[styles.tdCell, styles.colItem, styles.itemText]}
                  numberOfLines={1}
                >
                  {mov.item || '-'}
                </Text>

                {/* Quantity */}
                <Text
                  style={[
                    styles.tdCell,
                    styles.colQty,
                    styles.qtyText,
                    isPositive && styles.qtyPositive,
                    isNegative && styles.qtyNegative,
                  ]}
                >
                  {mov.quantity || '0'}
                </Text>

                {/* Reference */}
                <Text style={[styles.tdCell, styles.colRef, styles.refText]}>
                  {mov.reference || '-'}
                </Text>

                {/* Status */}
                <View style={[styles.colStatus, styles.badgeWrapper]}>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: statusConf.bgColor },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        { color: statusConf.textColor },
                      ]}
                    >
                      {statusConf.label}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  viewAllLink: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    cursor: 'pointer',
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F766E',
  },
  tableContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  thCell: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    cursor: 'pointer',
  },
  tableRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  tdCell: {
    fontSize: 13,
  },
  colDate: {
    flex: 1.2,
  },
  colType: {
    flex: 1.2,
  },
  colItem: {
    flex: 2,
  },
  colQty: {
    flex: 1,
    textAlign: 'center',
  },
  colRef: {
    flex: 1.2,
    textAlign: 'center',
  },
  colStatus: {
    flex: 1.2,
    alignItems: 'center',
  },
  dateText: {
    color: '#64748B',
    fontWeight: '500',
  },
  itemText: {
    color: '#0F172A',
    fontWeight: '600',
  },
  qtyText: {
    fontWeight: '700',
  },
  qtyPositive: {
    color: '#15803D',
  },
  qtyNegative: {
    color: '#DC2626',
  },
  refText: {
    color: '#64748B',
    fontWeight: '500',
  },
  badgeWrapper: {
    alignItems: 'flex-start',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  emptyContainer: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
});
