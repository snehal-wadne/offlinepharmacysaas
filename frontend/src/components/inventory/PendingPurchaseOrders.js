import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { MOCK_PURCHASE_ORDERS } from '../../data/inventoryDashboardMockData';

export default function PendingPurchaseOrders({
  orders = MOCK_PURCHASE_ORDERS,
  onViewAll,
  onOrderPress,
}) {
  return (
    <View style={styles.cardContainer}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Pending Purchase Orders</Text>
        <Pressable
          onPress={onViewAll}
          style={styles.viewAllLink}
          accessibilityRole="button"
          accessibilityLabel="View all pending purchase orders"
        >
          <Text style={styles.viewAllText}>View All</Text>
        </Pressable>
      </View>

      {/* Orders List */}
      <View style={styles.ordersList}>
        {orders.map((order, index) => {
          const isLast = index === orders.length - 1;
          return (
            <Pressable
              key={order.id || index}
              onPress={() => onOrderPress && onOrderPress(order)}
              style={[
                styles.orderItem,
                !isLast && styles.orderItemBorder,
              ]}
            >
              {/* Left Info: PO Number & Supplier */}
              <View style={styles.orderLeft}>
                <Text style={styles.poNumber}>{order.id}</Text>
                <Text style={styles.supplierName}>{order.supplierName}</Text>
              </View>

              {/* Right Info: Amount & Time */}
              <View style={styles.orderRight}>
                <Text style={styles.amount}>{order.amount || order.formattedAmount}</Text>
                <Text style={styles.timeAgo}>{order.timeAgo}</Text>
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
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F766E',
  },
  ordersList: {
    paddingVertical: 4,
  },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    cursor: 'pointer',
  },
  orderItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  orderLeft: {
    flexDirection: 'column',
  },
  poNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 3,
  },
  supplierName: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#64748B',
  },
  orderRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 3,
  },
  timeAgo: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
  },
});
