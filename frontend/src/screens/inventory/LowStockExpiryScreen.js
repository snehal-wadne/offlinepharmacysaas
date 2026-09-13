import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SkeletonItemCard } from '../../components/common/SkeletonLoader';
import PaginationControls from '../../components/common/PaginationControls';
import {
  MOCK_LOW_STOCK_ITEMS,
  MOCK_EXPIRY_ITEMS,
} from '../../data/lowStockExpiryMockData';
import { fetchInventory } from '../../api/inventoryApi';

const LOW_STOCK_BADGES = {
  'Low Stock': { bg: '#FEF3C7', text: '#B45309' },
  Critical: { bg: '#FFEDD5', text: '#C2410C' },
  'Out of Stock': { bg: '#FEE2E2', text: '#B91C1C' },
};

const EXPIRY_BADGES = {
  Safe: { bg: '#DCFCE7', text: '#15803D' },
  'Expiring Soon': { bg: '#FEF3C7', text: '#B45309' },
  Expired: { bg: '#FEE2E2', text: '#B91C1C' },
};

export default function LowStockExpiryScreen({ onShowToast }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;

  // Active Tab: 'low-stock' or 'expiry'
  const [activeTab, setActiveTab] = useState('low-stock');
  const [searchQuery, setSearchQuery] = useState('');
  const [rawInventory, setRawInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Reset page when tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  useEffect(() => {
    loadInventoryData();
  }, []);

  const loadInventoryData = async () => {
    try {
      setLoading(true);
      const res = await fetchInventory();
      if (res && res.data && Array.isArray(res.data)) {
        setRawInventory(res.data);
      }
    } catch (err) {
      console.warn('Failed to load inventory for Low Stock Expiry screen:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Live DB Low Stock Items (Quantity < 50 Rule)
  const dbLowStockItems = rawInventory
    .filter((item) => Number(item.quantity) < 50)
    .map((item) => {
      const qty = Number(item.quantity);
      let status = 'Low Stock';
      if (qty === 0) status = 'Out of Stock';
      else if (qty < 15) status = 'Critical';

      return {
        id: item.id,
        medicine: `${item.brandName || item.medicineName} (${item.medicineName || item.genericName})`,
        sku: item.sku,
        currentStock: qty,
        minimumStock: 15,
        reorderLevel: 50,
        supplier: item.supplierName || item.manufacturer || 'Pharma Distributor',
        status: status,
      };
    });

  const lowStockItemsList = rawInventory.length > 0 ? dbLowStockItems : MOCK_LOW_STOCK_ITEMS;

  // Live DB Expiry Items
  const dbExpiryItems = rawInventory.map((item) => {
    const qty = Number(item.quantity);
    let status = 'Safe';
    if (qty === 0) status = 'Expired';
    else if (qty < 50) status = 'Expiring Soon';

    return {
      id: item.id,
      medicine: `${item.brandName || item.medicineName} (${item.medicineName || item.genericName})`,
      batchNo: item.batchNo || 'B-1001',
      expiryDate: item.expiryDate || null,
      quantity: qty,
      supplier: item.supplierName || item.manufacturer || 'Pharma Distributor',
      status: status,
    };
  });

  const expiryItemsList = rawInventory.length > 0 ? dbExpiryItems : MOCK_EXPIRY_ITEMS;

  // Low Stock Items filter
  const filteredLowStock = lowStockItemsList.filter(
    (item) =>
      item.medicine.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.supplier.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Expiry Items filter
  const filteredExpiry = expiryItemsList.filter(
    (item) =>
      item.medicine.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.batchNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.supplier.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleReorder = (item) => {
    if (onShowToast) {
      onShowToast(`Draft purchase order created for "${item.medicine}" (Reorder level: ${item.reorderLevel})`);
    }
  };

  const handleWriteOff = (item) => {
    if (onShowToast) {
      onShowToast(`Disposal / write-off logged for batch ${item.batchNo} (${item.medicine})`);
    }
  };

  const criticalCount = lowStockItemsList.filter((i) => i.currentStock < 15 || i.status === 'Critical').length;
  const expiringCount = expiryItemsList.filter((i) => i.status === 'Expiring Soon').length;
  const expiredCount = expiryItemsList.filter((i) => i.status === 'Expired' || i.quantity === 0).length;

  const paginatedLowStock = filteredLowStock.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const paginatedExpiry = filteredExpiry.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 16 }}>
        <SkeletonItemCard />
        <SkeletonItemCard />
        <SkeletonItemCard />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={true}
    >
      {/* Header */}
      <View style={styles.headerSection}>
        <Text style={styles.pageTitle}>Low Stock & Expiry Tracking</Text>
        <Text style={styles.pageSubtitle}>
          Monitor critical stock replenishment levels and upcoming medicine batch expirations.
        </Text>
      </View>

      {/* Summary Alert Strip */}
      <View style={styles.summaryStrip}>
        <View style={[styles.summaryCard, { borderLeftColor: '#D97706' }]}>
          <Text style={styles.summaryLabel}>LOW STOCK ITEMS</Text>
          <Text style={[styles.summaryVal, { color: '#D97706' }]}>{lowStockItemsList.length}</Text>
          <Text style={styles.summarySub}>Needs reorder</Text>
        </View>
        <View style={[styles.summaryCard, { borderLeftColor: '#EA580C' }]}>
          <Text style={styles.summaryLabel}>CRITICAL DEFICIT</Text>
          <Text style={[styles.summaryVal, { color: '#EA580C' }]}>{criticalCount}</Text>
          <Text style={styles.summarySub}>Stock &lt; 15 units</Text>
        </View>
        <View style={[styles.summaryCard, { borderLeftColor: '#F59E0B' }]}>
          <Text style={styles.summaryLabel}>EXPIRING SOON</Text>
          <Text style={[styles.summaryVal, { color: '#D97706' }]}>{expiringCount}</Text>
          <Text style={styles.summarySub}>Within 90 days</Text>
        </View>
        <View style={[styles.summaryCard, { borderLeftColor: '#DC2626' }]}>
          <Text style={styles.summaryLabel}>EXPIRED BATCHES</Text>
          <Text style={[styles.summaryVal, { color: '#DC2626' }]}>{expiredCount}</Text>
          <Text style={styles.summarySub}>Immediate removal</Text>
        </View>
      </View>

      {/* Main Table Card with Tabs */}
      <View style={styles.cardContainer}>
        {/* Navigation Tab Bar */}
        <View style={styles.tabBar}>
          <Pressable
            onPress={() => setActiveTab('low-stock')}
            style={[styles.tabButton, activeTab === 'low-stock' && styles.tabButtonActive]}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'low-stock' && styles.tabButtonTextActive,
              ]}
            >
              Low Stock Items ({MOCK_LOW_STOCK_ITEMS.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('expiry')}
            style={[styles.tabButton, activeTab === 'expiry' && styles.tabButtonActive]}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'expiry' && styles.tabButtonTextActive,
              ]}
            >
              Expiry Management ({MOCK_EXPIRY_ITEMS.length})
            </Text>
          </Pressable>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBarContainer}>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder={
                activeTab === 'low-stock'
                  ? 'Search low stock medicine, SKU, supplier...'
                  : 'Search batch, medicine, supplier...'
              }
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>✕</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Tab 1: Low Stock Table */}
        {activeTab === 'low-stock' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { width: 180 }]}>MEDICINE</Text>
                <Text style={[styles.thCell, { width: 90 }]}>SKU</Text>
                <Text style={[styles.thCell, { width: 110, textAlign: 'center' }]}>
                  CURRENT STOCK
                </Text>
                <Text style={[styles.thCell, { width: 100, textAlign: 'center' }]}>
                  MIN STOCK
                </Text>
                <Text style={[styles.thCell, { width: 110, textAlign: 'center' }]}>
                  REORDER LEVEL
                </Text>
                <Text style={[styles.thCell, { width: 150 }]}>SUPPLIER</Text>
                <Text style={[styles.thCell, { width: 130 }]}>BRANCH</Text>
                <Text style={[styles.thCell, { width: 110, textAlign: 'center' }]}>STATUS</Text>
                <Text style={[styles.thCell, { width: 100, textAlign: 'center' }]}>ACTION</Text>
              </View>

              {paginatedLowStock.map((item, index) => {
                const badge = LOW_STOCK_BADGES[item.status] || LOW_STOCK_BADGES['Low Stock'];
                const isCritical = item.status === 'Critical' || item.status === 'Out of Stock';

                return (
                  <View
                    key={item.id}
                    style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}
                  >
                    <Text style={[styles.tdCell, styles.medName, { width: 180 }]} numberOfLines={1}>
                      {item.medicine}
                    </Text>
                    <Text style={[styles.tdCell, { width: 90 }]}>{item.sku}</Text>
                    <Text
                      style={[
                        styles.tdCell,
                        styles.currentStockNum,
                        isCritical && styles.stockCritical,
                        { width: 110, textAlign: 'center' },
                      ]}
                    >
                      {item.currentStock}
                    </Text>
                    <Text style={[styles.tdCell, { width: 100, textAlign: 'center' }]}>
                      {item.minimumStock}
                    </Text>
                    <Text
                      style={[
                        styles.tdCell,
                        { width: 110, textAlign: 'center', fontWeight: '600' },
                      ]}
                    >
                      {item.reorderLevel}
                    </Text>
                    <Text style={[styles.tdCell, { width: 150 }]}>{item.supplier}</Text>
                    <Text style={[styles.tdCell, { width: 130 }]}>{item.branch}</Text>

                    {/* Status */}
                    <View style={[styles.statusWrapper, { width: 110 }]}>
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                          {item.status}
                        </Text>
                      </View>
                    </View>

                    {/* Reorder Action */}
                    <View style={[styles.actionWrapper, { width: 100 }]}>
                      <Pressable
                        onPress={() => handleReorder(item)}
                        style={styles.reorderBtn}
                      >
                        <Text style={styles.reorderBtnText}>+ Reorder</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* Tab 2: Expiry Table */}
        {activeTab === 'expiry' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { width: 180 }]}>MEDICINE</Text>
                <Text style={[styles.thCell, { width: 100 }]}>BATCH NO.</Text>
                <Text style={[styles.thCell, { width: 130 }]}>EXPIRY DATE</Text>
                <Text style={[styles.thCell, { width: 100, textAlign: 'center' }]}>
                  QUANTITY
                </Text>
                <Text style={[styles.thCell, { width: 140 }]}>BRANCH</Text>
                <Text style={[styles.thCell, { width: 150 }]}>SUPPLIER</Text>
                <Text style={[styles.thCell, { width: 120, textAlign: 'center' }]}>STATUS</Text>
                <Text style={[styles.thCell, { width: 110, textAlign: 'center' }]}>ACTION</Text>
              </View>

              {paginatedExpiry.map((item, index) => {
                const badge = EXPIRY_BADGES[item.status] || EXPIRY_BADGES.Safe;
                const isExpired = item.status === 'Expired';
                const isSoon = item.status === 'Expiring Soon';

                return (
                  <View
                    key={item.id}
                    style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}
                  >
                    <Text style={[styles.tdCell, styles.medName, { width: 180 }]} numberOfLines={1}>
                      {item.medicine}
                    </Text>
                    <Text style={[styles.tdCell, { width: 100 }]}>{item.batchNo}</Text>
                    <Text
                      style={[
                        styles.tdCell,
                        styles.expiryDateText,
                        isExpired && styles.dateExpired,
                        isSoon && styles.dateSoon,
                        { width: 130 },
                      ]}
                    >
                      {item.expiryDate ? item.expiryDate : 'No expiry set'}
                    </Text>
                    <Text
                      style={[
                        styles.tdCell,
                        { width: 100, textAlign: 'center', fontWeight: '700' },
                      ]}
                    >
                      {item.quantity}
                    </Text>
                    <Text style={[styles.tdCell, { width: 140 }]}>{item.branch}</Text>
                    <Text style={[styles.tdCell, { width: 150 }]}>{item.supplier}</Text>

                    {/* Status */}
                    <View style={[styles.statusWrapper, { width: 120 }]}>
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                          {item.status}
                        </Text>
                      </View>
                    </View>

                    {/* Action */}
                    <View style={[styles.actionWrapper, { width: 110 }]}>
                      <Pressable
                        onPress={() => handleWriteOff(item)}
                        style={[
                          styles.writeOffBtn,
                          isExpired && styles.writeOffBtnExpired,
                        ]}
                      >
                        <Text
                          style={[
                            styles.writeOffBtnText,
                            isExpired && styles.writeOffTextExpired,
                          ]}
                        >
                          {isExpired ? 'Write-Off' : 'Inspect'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}
        
        <View style={{ padding: 16 }}>
          <PaginationControls
            currentPage={currentPage}
            totalItems={activeTab === 'low-stock' ? filteredLowStock.length : filteredExpiry.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 24,
  },
  headerSection: {
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
  summaryStrip: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  summaryCard: {
    flex: 1,
    minWidth: 200,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    padding: 16,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  summaryVal: {
    fontSize: 28,
    fontWeight: '800',
    marginVertical: 4,
  },
  summarySub: {
    fontSize: 12,
    color: '#94A3B8',
  },
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
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FAFAFA',
  },
  tabButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    cursor: 'pointer',
  },
  tabButtonActive: {
    borderBottomColor: '#0F766E',
    backgroundColor: '#FFFFFF',
  },
  tabButtonText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#64748B',
  },
  tabButtonTextActive: {
    color: '#0F766E',
    fontWeight: '700',
  },
  searchBarContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    outlineStyle: 'none',
  },
  clearBtn: {
    padding: 4,
  },
  clearBtnText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  tableWrapper: {
    minWidth: 1080,
    paddingHorizontal: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  thCell: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    paddingHorizontal: 6,
    letterSpacing: 0.3,
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
    fontSize: 13,
    color: '#334155',
    paddingHorizontal: 6,
  },
  medName: {
    fontWeight: '600',
    color: '#0F172A',
  },
  currentStockNum: {
    fontWeight: '800',
    color: '#D97706',
  },
  stockCritical: {
    color: '#DC2626',
  },
  expiryDateText: {
    fontWeight: '600',
  },
  dateExpired: {
    color: '#DC2626',
    fontWeight: '700',
  },
  dateSoon: {
    color: '#D97706',
    fontWeight: '700',
  },
  statusWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  actionWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#0F766E',
    cursor: 'pointer',
  },
  reorderBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  writeOffBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    cursor: 'pointer',
  },
  writeOffBtnExpired: {
    backgroundColor: '#FEE2E2',
  },
  writeOffBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  writeOffTextExpired: {
    color: '#DC2626',
    fontWeight: '700',
  },
});
