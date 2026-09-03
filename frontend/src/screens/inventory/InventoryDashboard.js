import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import InventoryStatCard from '../../components/inventory/InventoryStatCard';
import StockSummary from '../../components/inventory/StockSummary';
import PendingPurchaseOrders from '../../components/inventory/PendingPurchaseOrders';
import RecentStockMovements from '../../components/inventory/RecentStockMovements';
import QuickActions from '../../components/inventory/QuickActions';
import {
  MOCK_KPI_DATA,
  MOCK_STOCK_SUMMARY,
  MOCK_PURCHASE_ORDERS,
  MOCK_RECENT_MOVEMENTS,
} from '../../data/inventoryDashboardMockData';
import { fetchPurchases } from '../../api/purchaseApi';

export default function InventoryDashboard({ onNavigate, onShowToast }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;

  const [pendingOrders, setPendingOrders] = useState(MOCK_PURCHASE_ORDERS || []);

  useEffect(() => {
    let isMounted = true;
    async function loadPendingPOs() {
      try {
        const response = await fetchPurchases({ status: 'PENDING' });
        if (isMounted && response && Array.isArray(response.data) && response.data.length > 0) {
          const formatted = response.data.map((po) => ({
            id: po.purchase_number || po.purchaseNumber || po.id,
            rawId: po.id,
            supplierName: po.supplier_name || po.supplierName || po.supplier || 'Supplier',
            amount: po.total_amount != null
              ? `₹${Number(po.total_amount).toLocaleString('en-IN')}`
              : po.totalAmount
              ? `₹${Number(po.totalAmount).toLocaleString('en-IN')}`
              : po.amount || '₹12,450.00',
            timeAgo: po.order_date
              ? new Date(po.order_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
              : po.orderDate || 'Today',
          }));
          setPendingOrders(formatted);
        }
      } catch (err) {
        console.log('[InventoryDashboard] Backend offline or using fallback mock pending POs');
      }
    }
    loadPendingPOs();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleQuickAction = (id, label) => {
    if (id === 'stock-adjustment') {
      if (onNavigate) onNavigate('stock-adjustments');
    } else if (id === 'stock-transfer') {
      if (onNavigate) onNavigate('stock-transfer');
    } else if (id === 'receive-stock') {
      if (onNavigate) onNavigate('goods-receiving');
    } else if (id === 'create-stocktake') {
      if (onNavigate) onNavigate('inventory-reports');
    }
  };

  const handleViewAllStock = () => {
    if (onNavigate) {
      onNavigate('stock-adjustments');
    }
  };

  const handleViewAllPurchaseOrders = () => {
    if (onNavigate) {
      onNavigate('purchases');
    }
  };

  const handleViewAllMovements = () => {
    if (onNavigate) {
      onNavigate('inventory-reports');
    }
  };

  const handleOrderPress = (order) => {
    if (onNavigate) {
      onNavigate('purchases');
    }
    if (onShowToast) {
      onShowToast(`Viewing details for ${order.id} (${order.supplierName})`);
    }
  };

  const handleMovementPress = (movement) => {
    if (onShowToast) {
      onShowToast(`Movement: ${movement.item} (${movement.type} ${movement.quantity})`);
    }
  };

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

      {/* Section 1: KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {(MOCK_KPI_DATA || []).map((kpi) => (
          <InventoryStatCard
            key={kpi.id}
            label={kpi.label || kpi.title}
            value={kpi.value}
            subtext={kpi.subtext || kpi.trend}
            variant={kpi.variant || 'teal'}
            onPress={() => {
              if (kpi.id === 'kpi-2') {
                if (onNavigate) onNavigate('stock-status');
              } else if (kpi.id === 'kpi-3' || kpi.id === 'kpi-4') {
                if (onNavigate) onNavigate('expiry-reports');
              } else {
                if (onNavigate) onNavigate('stock-adjustments');
              }
            }}
          />
        ))}
      </View>

      {/* Section 2: Stock Summary + Pending Purchase Orders */}
      <View style={[styles.gridRow, isCompact && styles.gridRowStacked]}>
        <View style={[styles.gridColLeft, isCompact && styles.gridColFull]}>
          <StockSummary
            data={MOCK_STOCK_SUMMARY || []}
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
            movements={MOCK_RECENT_MOVEMENTS || []}
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
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  pageSubtitle: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 4,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  kpiRowCompact: {
    gap: 12,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 24,
  },
  gridRowStacked: {
    flexDirection: 'column',
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
    width: '100%',
  },
});
