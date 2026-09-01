import React from 'react';
import {
  View,
  Text,
  Pressable,
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

export default function InventoryDashboard({ onNavigate, onShowToast }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  const handleQuickAction = (id, label) => {
    if (id === 'stock-adjustment' || id === 'view-stock') {
      if (onNavigate) onNavigate('stock-adjustments');
    } else if (id === 'add-customer') {
      if (onNavigate) onNavigate('customers-patients');
    } else if (id === 'receive-stock') {
      if (onNavigate) onNavigate('goods-receiving');
    } else if (id === 'customer-ledger') {
      if (onNavigate) onNavigate('customer-ledger');
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
      contentContainerStyle={[styles.scrollContent, isMobile && styles.scrollContentMobile]}
      showsVerticalScrollIndicator={true}
    >
      {/* Page Title Section */}
      <View style={[styles.titleSection, isMobile && styles.titleSectionMobile]}>
        <View>
          <Text style={styles.pageTitle}>Inventory Overview</Text>
          <Text style={styles.pageSubtitle}>
            Monitor stock levels, expiry risks and recent inventory activity.
          </Text>
        </View>
        <Pressable
          onPress={handleViewAllStock}
          style={styles.viewStockHeaderBtn}
          accessibilityRole="button"
          accessibilityLabel="View Stock Inventory"
        >
          <Text style={styles.viewStockHeaderBtnText}>📦 View Stock Inventory →</Text>
        </Pressable>
      </View>

      {/* Section 1: KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {MOCK_KPI_DATA.map((kpi) => (
          <InventoryStatCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            subtext={kpi.subtext}
            variant={kpi.variant}
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
            data={MOCK_STOCK_SUMMARY}
            onViewAll={handleViewAllStock}
          />
        </View>
        <View style={[styles.gridColRight, isCompact && styles.gridColFull]}>
          <PendingPurchaseOrders
            orders={MOCK_PURCHASE_ORDERS}
            onViewAll={handleViewAllPurchaseOrders}
            onOrderPress={handleOrderPress}
          />
        </View>
      </View>

      {/* Section 3: Recent Stock Movements + Quick Actions */}
      <View style={[styles.gridRow, isCompact && styles.gridRowStacked]}>
        <View style={[styles.gridColLeft, isCompact && styles.gridColFull]}>
          <RecentStockMovements
            movements={MOCK_RECENT_MOVEMENTS}
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
  scrollContentMobile: {
    paddingHorizontal: 12,
    paddingTop: 16,
    gap: 16,
  },
  titleSection: {
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  titleSectionMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
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
  viewStockHeaderBtn: {
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewStockHeaderBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
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
    alignItems: 'flex-start',
    gap: 24,
  },
  gridRowStacked: {
    flexDirection: 'column',
    gap: 32,
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
