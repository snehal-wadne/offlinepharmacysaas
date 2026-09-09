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
import { fetchInventory, fetchInventorySummary, fetchStockMovements } from '../../api/inventoryApi';

export default function InventoryDashboard({ onNavigate, onShowToast }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;

  const [pendingOrders, setPendingOrders] = useState(MOCK_PURCHASE_ORDERS || []);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [recentMovements, setRecentMovements] = useState(MOCK_RECENT_MOVEMENTS || []);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      try {
        // Load Pending Purchase Orders
        const poRes = await fetchPurchases({ status: 'PENDING' });
        if (isMounted && poRes && Array.isArray(poRes.data) && poRes.data.length > 0) {
          const formatted = poRes.data.map((po) => ({
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
        console.log('[InventoryDashboard] Backend pending POs fetch fallback');
      }

      try {
        // Load Summary KPI statistics
        const summaryRes = await fetchInventorySummary();
        if (isMounted && summaryRes && summaryRes.data) {
          setSummaryData(summaryRes.data);
        }
      } catch (err) {
        console.log('[InventoryDashboard] Summary API fallback');
      }

      try {
        // Load Recent Stock Movements from backend
        const movementsRes = await fetchStockMovements();
        if (isMounted && movementsRes && Array.isArray(movementsRes.data) && movementsRes.data.length > 0) {
          setRecentMovements(movementsRes.data);
        }
      } catch (err) {
        console.log('[InventoryDashboard] Stock movements API fallback');
      }

      try {
        // Load Inventory Batches for dynamic calculation
        const invRes = await fetchInventory();
        if (isMounted && invRes && Array.isArray(invRes.data)) {
          setInventoryItems(invRes.data);
        }
      } catch (err) {
        console.log('[InventoryDashboard] Inventory API fallback');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDashboardData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleQuickAction = (id, label) => {
    if (id === 'view-stock') {
      if (onNavigate) onNavigate('stock-adjustments');
    } else if (id === 'stock-adjustment') {
      if (onNavigate) onNavigate('stock-adjustments');
    } else if (id === 'add-customer') {
      if (onNavigate) onNavigate('customers-patients');
      if (onShowToast) onShowToast('Redirecting to Customers & Patients Directory...');
    } else if (id === 'receive-stock') {
      if (onNavigate) onNavigate('goods-receiving');
    } else if (id === 'customer-ledger') {
      if (onNavigate) onNavigate('customer-ledger');
      if (onShowToast) onShowToast('Redirecting to Customer Ledger Statement...');
    } else if (id === 'stock-transfer') {
      if (onNavigate) onNavigate('stock-transfer');
    } else if (id === 'create-stocktake') {
      if (onNavigate) onNavigate('inventory-reports');
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

  // Compute Dynamic 4 KPI Stat Cards
  const totalProductsVal = summaryData?.totalProducts != null
    ? summaryData.totalProducts
    : inventoryItems.length > 0
    ? new Set(inventoryItems.map((i) => i.productId || i.brandName || i.medicineName || i.id)).size
    : 11;

  const lowStockVal = summaryData?.lowStockCount != null
    ? summaryData.lowStockCount
    : inventoryItems.length > 0
    ? inventoryItems.filter((i) => Number(i.quantity) < 50 && Number(i.quantity) > 0).length
    : 28;

  const nearExpiryVal = summaryData?.nearExpiryCount != null
    ? summaryData.nearExpiryCount
    : inventoryItems.length > 0
    ? inventoryItems.filter((i) => {
        if (i.expiryDate) {
          const diffDays = (new Date(i.expiryDate) - new Date()) / (1000 * 60 * 60 * 24);
          return diffDays >= 0 && diffDays <= 60;
        }
        return false;
      }).length
    : 14;

  const expiredVal = summaryData?.expiredCount != null
    ? summaryData.expiredCount
    : inventoryItems.length > 0
    ? inventoryItems.filter((i) => {
        if (i.expiryDate) return new Date(i.expiryDate) < new Date();
        return Number(i.quantity) === 0;
      }).length
    : 3;

  const dynamicKpiData = [
    {
      id: 'kpi-1',
      label: 'TOTAL PRODUCTS',
      value: Number(totalProductsVal).toLocaleString(),
      subtext: summaryData || inventoryItems.length > 0 ? 'Live database count' : '+24 new this month',
      variant: 'teal',
    },
    {
      id: 'kpi-2',
      label: 'LOW STOCK ALERTS',
      value: Number(lowStockVal).toLocaleString(),
      subtext: 'Requires reorder soon',
      variant: 'amber',
    },
    {
      id: 'kpi-3',
      label: 'NEAR EXPIRY (< 60D)',
      value: Number(nearExpiryVal).toLocaleString(),
      subtext: 'Discount or return',
      variant: 'blue',
    },
    {
      id: 'kpi-4',
      label: 'EXPIRED STOCK',
      value: Number(expiredVal).toLocaleString(),
      subtext: 'Pending disposal/return',
      variant: 'red',
    },
  ];

  // Compute Categorized Stock Summary dynamically
  const categorySummaryData = React.useMemo(() => {
    if (!inventoryItems || inventoryItems.length === 0) {
      return MOCK_STOCK_SUMMARY;
    }

    const categoryMap = {
      'Pain Relief & Analgesics': { id: 'cat-1', category: 'Pain Relief & Analgesics', totalItems: 0, inStock: 0, lowStock: 0, outOfStock: 0 },
      'Antibiotics & Antibacterials': { id: 'cat-2', category: 'Antibiotics & Antibacterials', totalItems: 0, inStock: 0, lowStock: 0, outOfStock: 0 },
      'Respiratory & Anti-Allergy': { id: 'cat-3', category: 'Respiratory & Anti-Allergy', totalItems: 0, inStock: 0, lowStock: 0, outOfStock: 0 },
      'Gastrointestinal & Acid Relief': { id: 'cat-4', category: 'Gastrointestinal & Acid Relief', totalItems: 0, inStock: 0, lowStock: 0, outOfStock: 0 },
      'General Health & Others': { id: 'cat-5', category: 'General Health & Others', totalItems: 0, inStock: 0, lowStock: 0, outOfStock: 0 },
    };

    inventoryItems.forEach((item) => {
      const med = (item.medicineName || item.brandName || '').toLowerCase();
      let catKey = 'General Health & Others';

      if (med.includes('paracetamol') || med.includes('dolo') || med.includes('brufen') || med.includes('ibuprofen') || med.includes('advil') || med.includes('calpol') || med.includes('suraj')) {
        catKey = 'Pain Relief & Analgesics';
      } else if (med.includes('amox') || med.includes('mox') || med.includes('antibiotic') || med.includes('azithro')) {
        catKey = 'Antibiotics & Antibacterials';
      } else if (med.includes('cetirizine') || med.includes('cetcip') || med.includes('zyrtec') || med.includes('cough')) {
        catKey = 'Respiratory & Anti-Allergy';
      } else if (med.includes('omeprazole') || med.includes('omez') || med.includes('razole') || med.includes('antacid')) {
        catKey = 'Gastrointestinal & Acid Relief';
      }

      const cat = categoryMap[catKey];
      const qty = Number(item.quantity || 0);

      cat.totalItems += 1;
      if (qty >= 50) cat.inStock += 1;
      else if (qty > 0) cat.lowStock += 1;
      else cat.outOfStock += 1;
    });

    return Object.values(categoryMap).filter((c) => c.totalItems > 0);
  }, [inventoryItems]);

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

      {/* Section 1: Dynamic KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {dynamicKpiData.map((kpi) => (
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
            data={categorySummaryData}
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
            movements={recentMovements || []}
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
