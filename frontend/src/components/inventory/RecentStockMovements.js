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
    bgColor: '#CCFBF1',
    textColor: '#0F766E',
    borderColor: '#99F6E4',
  },
  Sale: {
    bgColor: '#DBEAFE',
    textColor: '#1D4ED8',
    borderColor: '#BFDBFE',
  },
  Adjustment: {
    bgColor: '#FEF3C7',
    textColor: '#B45309',
    borderColor: '#FDE68A',
  },
  Transfer: {
    bgColor: '#EDE9FE',
    textColor: '#6D28D9',
    borderColor: '#DDD6FE',
  },
  Return: {
    bgColor: '#FEE2E2',
    textColor: '#B91C1C',
    borderColor: '#FECACA',
  },
  Stocktake: {
    bgColor: '#F1F5F9',
    textColor: '#475569',
    borderColor: '#E2E8F0',
  },
};

const STATUS_CONFIG = {
  Completed: {
    bgColor: '#DCFCE7',
    textColor: '#15803D',
  },
  Synced: {
    bgColor: '#DCFCE7',
    textColor: '#15803D',
  },
  Approved: {
    bgColor: '#DCFCE7',
    textColor: '#15803D',
  },
  'In Transit': {
    bgColor: '#DBEAFE',
    textColor: '#1D4ED8',
  },
  Pending: {
    bgColor: '#FEF3C7',
    textColor: '#B45309',
  },
};

function Badge({ label, config }) {
  const c = config || { bgColor: '#F1F5F9', textColor: '#475569' };
  return (
    <View style={[styles.badge, { backgroundColor: c.bgColor }]}>
      <Text style={[styles.badgeText, { color: c.textColor }]}>{label}</Text>
    </View>
  );
}

export default function RecentStockMovements({
  movements = MOCK_RECENT_MOVEMENTS,
  onViewAll,
  onRowPress,
}) {
  return (
    <View style={styles.cardContainer}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Recent Stock Movements</Text>
        <Pressable
          onPress={onViewAll}
          style={({ pressed, hovered }) => [
            styles.viewAllLink,
            (pressed || hovered) && styles.viewAllLinkHovered,
          ]}
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
        {movements.map((mov, index) => {
          const isPositive = mov.quantity.startsWith('+');
          const isNegative = mov.quantity.startsWith('-');
          return (
            <Pressable
              key={mov.id || index}
              onPress={() => onRowPress && onRowPress(mov)}
              style={({ pressed, hovered }) => [
                styles.tableRow,
                index % 2 === 1 && styles.tableRowAlt,
                (pressed || hovered) && styles.tableRowHovered,
              ]}
            >
              {/* Date */}
              <Text style={[styles.tdCell, styles.colDate, styles.dateText]}>
                {mov.date}
              </Text>

              {/* Movement Type */}
              <View style={[styles.colType, styles.badgeWrapper]}>
                <Badge
                  label={mov.type}
                  config={TYPE_CONFIG[mov.type]}
                />
              </View>

              {/* Item Name */}
              <Text
                style={[styles.tdCell, styles.colItem, styles.itemText]}
                numberOfLines={1}
              >
                {mov.item}
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
                {mov.quantity}
              </Text>

              {/* Reference */}
              <Text style={[styles.tdCell, styles.colRef, styles.refText]}>
                {mov.reference}
              </Text>

              {/* Status */}
              <View style={[styles.colStatus, styles.badgeWrapper]}>
                <Badge
                  label={mov.status}
                  config={STATUS_CONFIG[mov.status]}
                />
              </View>
            </Pressable>
          );
        })}
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
    borderBottomColor: '#F1F5F9',
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
  viewAllLinkHovered: {
    backgroundColor: '#F1F5F9',
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F766E',
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
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    cursor: 'pointer',
  },
  tableRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  tableRowHovered: {
    backgroundColor: '#F1F5F9',
  },
  tdCell: {
    fontSize: 13,
    color: '#334155',
  },
  colDate: {
    flex: 1.2,
  },
  colType: {
    flex: 1.5,
  },
  colItem: {
    flex: 2.8,
  },
  colQty: {
    flex: 1.2,
    textAlign: 'center',
  },
  colRef: {
    flex: 1.5,
  },
  colStatus: {
    flex: 1.5,
    alignItems: 'flex-start',
  },
  badgeWrapper: {
    alignItems: 'flex-start',
  },
  dateText: {
    fontWeight: '500',
    color: '#64748B',
  },
  itemText: {
    fontWeight: '600',
    color: '#0F172A',
  },
  qtyText: {
    fontWeight: '700',
  },
  qtyPositive: {
    color: '#16A34A',
  },
  qtyNegative: {
    color: '#334155',
  },
  refText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#64748B',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
});
