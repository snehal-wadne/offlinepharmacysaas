import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
export default function PendingPurchaseOrders({
  orders = [],
  onViewAll,
  onOrderPress,
}) {
  const orderList = Array.isArray(orders) ? orders : [];

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
        {orderList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No pending purchase orders</Text>
          </View>
        ) : (
          orderList.map((order, index) => {
            const isLast = index === orderList.length - 1;
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
                  <Text style={styles.poNumber} numberOfLines={1}>
                    {order.id || "-"}
                  </Text>
                  <Text style={styles.supplierName} numberOfLines={1}>
                    {order.supplierName || "Unknown Supplier"}
                  </Text>
                </View>

                {/* Right Info: Amount & Time */}
                <View style={styles.orderRight}>
                  <Text style={styles.amount} numberOfLines={1}>
                    ₹{order.totalAmount || order.formattedAmount || "₹0.00"}
                  </Text>
                  <Text style={styles.timeAgo} numberOfLines={1}>
                    {order.timeAgo || ""}
                  </Text>
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
    borderColor: '#E5DFE4',
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
    borderBottomColor: '#F8F5F7',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#28242B',
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
    color: '#B9829A',
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
    borderBottomColor: '#F8F5F7',
  },
  orderLeft: {
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    marginRight: 10,
  },
  poNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#28242B',
    marginBottom: 3,
  },
  supplierName: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#77717A',
  },
  orderRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  amount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#28242B',
    marginBottom: 3,
  },
  timeAgo: {
    fontSize: 12,
    fontWeight: '500',
    color: '#77717A',
  },
  emptyContainer: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#77717A',
    fontStyle: 'italic',
  },
});
