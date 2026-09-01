import React, { useState } from 'react';
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
import InventoryStatCard from '../../components/inventory/InventoryStatCard';
import {
  MOCK_LOW_STOCK_ITEMS,
  MOCK_EXPIRY_BATCHES,
} from '../../data/lowStockExpiryMockData';

const STOCK_STATUS_KPIS = [
  {
    id: 'kpi-1',
    label: 'Low Stock Alerts',
    value: '24',
    subtext: 'Reorder triggered',
    variant: 'amber',
  },
  {
    id: 'kpi-2',
    label: 'Expiring in 30 Days',
    value: '18',
    subtext: 'Requires monitoring',
    variant: 'blue',
  },
  {
    id: 'kpi-3',
    label: 'Expired Items',
    value: '6',
    subtext: 'Action required',
    variant: 'red',
  },
  {
    id: 'kpi-4',
    label: 'Reorder Deficit',
    value: '₹48,250',
    subtext: 'Procurement value',
    variant: 'teal',
  },
];

const STOCK_STATUS_BADGES = {
  'In Stock': { bg: '#DCFCE7', text: '#15803D' },
  'Low Stock': { bg: '#FEF3C7', text: '#B45309' },
  Critical: { bg: '#FEE2E2', text: '#B91C1C' },
  'Out of Stock': { bg: '#FEE2E2', text: '#DC2626' },
};

const BATCH_TIMELINE_BADGES = {
  Safe: { bg: '#DCFCE7', text: '#15803D' },
  'Expiring Soon': { bg: '#FEF3C7', text: '#B45309' },
  Expired: { bg: '#FEE2E2', text: '#DC2626' },
};

export default function StockStatusScreen({ onNavigate, onShowToast, isMultiBranch = true }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  const [activeTab, setActiveTab] = useState('low-stock');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLowStock = MOCK_LOW_STOCK_ITEMS.filter((item) => {
    const q = searchQuery.toLowerCase();
    return (
      (item.brandName && item.brandName.toLowerCase().includes(q)) ||
      (item.genericName && item.genericName.toLowerCase().includes(q)) ||
      (item.medicine && item.medicine.toLowerCase().includes(q)) ||
      (item.sku && item.sku.toLowerCase().includes(q)) ||
      (item.supplier && item.supplier.toLowerCase().includes(q))
    );
  });

  const filteredExpiry = MOCK_EXPIRY_BATCHES.filter((item) => {
    const q = searchQuery.toLowerCase();
    return (
      (item.brandName && item.brandName.toLowerCase().includes(q)) ||
      (item.genericName && item.genericName.toLowerCase().includes(q)) ||
      (item.medicine && item.medicine.toLowerCase().includes(q)) ||
      (item.batchNo && item.batchNo.toLowerCase().includes(q)) ||
      (item.supplier && item.supplier.toLowerCase().includes(q))
    );
  });

  const handleReorder = (item) => {
    if (onShowToast) {
      onShowToast(`+ Triggered purchase reorder for ${item.brandName || item.medicine} (${item.sku})`);
    }
  };

  const handleWriteOff = (item) => {
    if (onShowToast) {
      onShowToast(`Initiated batch audit for ${item.brandName || item.medicine} (Batch: ${item.batchNo})`);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, isMobile && styles.contentContainerMobile]}
      showsVerticalScrollIndicator={true}
    >
      {/* Top 4 KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {STOCK_STATUS_KPIS.map((kpi) => (
          <InventoryStatCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            subtext={kpi.subtext}
            variant={kpi.variant}
            onPress={() => onShowToast && onShowToast(`Filter: ${kpi.label}`)}
          />
        ))}
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
            onPress={() => setActiveTab('batch-timeline')}
            style={[styles.tabButton, activeTab === 'batch-timeline' && styles.tabButtonActive]}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'batch-timeline' && styles.tabButtonTextActive,
              ]}
            >
              Batch Expiry Timeline ({MOCK_EXPIRY_BATCHES.length})
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
                  ? 'Search brand name, generic name, SKU, supplier...'
                  : 'Search brand name, batch, supplier...'
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

        {/* Tab 1: Low Stock Items */}
        {activeTab === 'low-stock' && (
          isMobile ? (
            /* Mobile Low Stock Card List */
            <View style={styles.mobileCardList}>
              {filteredLowStock.map((item) => {
                const badge = STOCK_STATUS_BADGES[item.status] || STOCK_STATUS_BADGES['Low Stock'];
                const isCritical = item.status === 'Critical' || item.status === 'Out of Stock';
                return (
                  <View key={item.id} style={styles.mobileStatusCard}>
                    <View style={styles.mobileStatusHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.mobileBrandTitle}>{item.brandName || item.medicine}</Text>
                        <Text style={styles.mobileGenericSubtitle}>{item.genericName || item.medicine}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                          {item.status}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.mobileGrid}>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>SKU Code</Text>
                        <Text style={styles.mobileValBold}>{item.sku}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Current Stock</Text>
                        <Text style={[styles.mobileValBold, isCritical ? { color: '#DC2626' } : { color: '#D97706' }]}>
                          {item.currentStock} units
                        </Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Min Stock Level</Text>
                        <Text style={styles.mobileVal}>{item.minimumStock} units</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Reorder Level</Text>
                        <Text style={styles.mobileValBold}>{item.reorderLevel} units</Text>
                      </View>
                      <View style={styles.mobileGridColFull}>
                        <Text style={styles.mobileLabel}>Supplier / Branch</Text>
                        <Text style={styles.mobileVal} numberOfLines={1}>
                          {item.supplier} {isMultiBranch ? `• ${item.branch}` : ''}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.mobileActionFooter}>
                      <Pressable
                        onPress={() => handleReorder(item)}
                        style={styles.mobileReorderBtn}
                        accessibilityRole="button"
                      >
                        <Text style={styles.mobileReorderBtnText}>+ Purchase Reorder</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            /* Desktop Low Stock Table */
            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={styles.tableWrapper}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.thCell, { width: 140 }]}>BRAND NAME</Text>
                  <Text style={[styles.thCell, { width: 160 }]}>GENERIC / SALT</Text>
                  <Text style={[styles.thCell, { width: 100 }]}>SKU</Text>
                  <Text style={[styles.thCell, { width: 100, textAlign: 'center' }]}>
                    CURRENT STOCK
                  </Text>
                  <Text style={[styles.thCell, { width: 90, textAlign: 'center' }]}>
                    MIN STOCK
                  </Text>
                  <Text style={[styles.thCell, { width: 100, textAlign: 'center' }]}>
                    REORDER LVL
                  </Text>
                  <Text style={[styles.thCell, { width: 150 }]}>SUPPLIER</Text>
                  {isMultiBranch && (
                    <Text style={[styles.thCell, { width: 120 }]}>BRANCH</Text>
                  )}
                  <Text style={[styles.thCell, { width: 100, textAlign: 'center' }]}>STATUS</Text>
                  <Text style={[styles.thCell, { width: 95, textAlign: 'center' }]}>ACTION</Text>
                </View>

                {filteredLowStock.map((item, index) => {
                  const badge = STOCK_STATUS_BADGES[item.status] || STOCK_STATUS_BADGES['Low Stock'];
                  const isCritical = item.status === 'Critical' || item.status === 'Out of Stock';

                  return (
                    <View
                      key={item.id}
                      style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}
                    >
                      <Text style={[styles.tdCell, styles.brandNameCell, { width: 140 }]} numberOfLines={1}>
                        {item.brandName || item.medicine}
                      </Text>
                      <Text style={[styles.tdCell, styles.genericNameCell, { width: 160 }]} numberOfLines={1}>
                        {item.genericName || item.medicine}
                      </Text>
                      <Text style={[styles.tdCell, styles.skuCell, { width: 100 }]}>{item.sku}</Text>
                      <Text
                        style={[
                          styles.tdCell,
                          styles.currentStockNum,
                          isCritical && styles.stockCritical,
                          { width: 100, textAlign: 'center' },
                        ]}
                      >
                        {item.currentStock}
                      </Text>
                      <Text style={[styles.tdCell, { width: 90, textAlign: 'center' }]}>
                        {item.minimumStock}
                      </Text>
                      <Text
                        style={[
                          styles.tdCell,
                          { width: 100, textAlign: 'center', fontWeight: '600' },
                        ]}
                      >
                        {item.reorderLevel}
                      </Text>
                      <Text style={[styles.tdCell, { width: 150 }]} numberOfLines={1}>{item.supplier}</Text>
                      {isMultiBranch && (
                        <Text style={[styles.tdCell, { width: 120 }]} numberOfLines={1}>{item.branch}</Text>
                      )}

                      {/* Status */}
                      <View style={[styles.statusWrapper, { width: 100 }]}>
                        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                            {item.status}
                          </Text>
                        </View>
                      </View>

                      {/* Reorder Action */}
                      <View style={[styles.actionWrapper, { width: 95 }]}>
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
          )
        )}

        {/* Tab 2: Batch Timeline */}
        {activeTab === 'batch-timeline' && (
          isMobile ? (
            /* Mobile Batch Expiry Card List */
            <View style={styles.mobileCardList}>
              {filteredExpiry.map((item) => {
                const badge = BATCH_TIMELINE_BADGES[item.status] || BATCH_TIMELINE_BADGES.Safe;
                const isExpired = item.status === 'Expired';
                const isSoon = item.status === 'Expiring Soon';

                return (
                  <View key={item.id} style={styles.mobileStatusCard}>
                    <View style={styles.mobileStatusHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.mobileBrandTitle}>{item.brandName || item.medicine}</Text>
                        <Text style={styles.mobileGenericSubtitle}>Batch: {item.batchNo}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                          {item.status}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.mobileGrid}>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Expiry Date</Text>
                        <Text
                          style={[
                            styles.mobileValBold,
                            isExpired && { color: '#DC2626' },
                            isSoon && { color: '#D97706' },
                          ]}
                        >
                          {item.expiryDate}
                        </Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Quantity</Text>
                        <Text style={styles.mobileValBold}>{item.quantity} units</Text>
                      </View>
                      <View style={styles.mobileGridColFull}>
                        <Text style={styles.mobileLabel}>Supplier</Text>
                        <Text style={styles.mobileVal} numberOfLines={1}>{item.supplier}</Text>
                      </View>
                    </View>

                    <View style={styles.mobileActionFooter}>
                      <Pressable
                        onPress={() => handleWriteOff(item)}
                        style={[
                          styles.mobileWriteOffBtn,
                          isExpired && styles.mobileWriteOffBtnExpired,
                        ]}
                      >
                        <Text
                          style={[
                            styles.mobileWriteOffText,
                            isExpired && styles.mobileWriteOffTextExpired,
                          ]}
                        >
                          {isExpired ? 'Write-Off Loss' : 'Audit / Inspect'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            /* Desktop Batch Timeline Table */
            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={styles.tableWrapper}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.thCell, { width: 140 }]}>BRAND NAME</Text>
                  <Text style={[styles.thCell, { width: 160 }]}>GENERIC / SALT</Text>
                  <Text style={[styles.thCell, { width: 95 }]}>BATCH NO.</Text>
                  <Text style={[styles.thCell, { width: 110 }]}>EXPIRY DATE</Text>
                  <Text style={[styles.thCell, { width: 90, textAlign: 'center' }]}>
                    QUANTITY
                  </Text>
                  {isMultiBranch && (
                    <Text style={[styles.thCell, { width: 120 }]}>BRANCH</Text>
                  )}
                  <Text style={[styles.thCell, { width: 150 }]}>SUPPLIER</Text>
                  <Text style={[styles.thCell, { width: 110, textAlign: 'center' }]}>STATUS</Text>
                  <Text style={[styles.thCell, { width: 95, textAlign: 'center' }]}>ACTION</Text>
                </View>

                {filteredExpiry.map((item, index) => {
                  const badge = BATCH_TIMELINE_BADGES[item.status] || BATCH_TIMELINE_BADGES.Safe;
                  const isExpired = item.status === 'Expired';
                  const isSoon = item.status === 'Expiring Soon';

                  return (
                    <View
                      key={item.id}
                      style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}
                    >
                      <Text style={[styles.tdCell, styles.brandNameCell, { width: 140 }]} numberOfLines={1}>
                        {item.brandName || item.medicine}
                      </Text>
                      <Text style={[styles.tdCell, styles.genericNameCell, { width: 160 }]} numberOfLines={1}>
                        {item.genericName || item.medicine}
                      </Text>
                      <Text style={[styles.tdCell, { width: 95 }]}>{item.batchNo}</Text>
                      <Text
                        style={[
                          styles.tdCell,
                          styles.expiryDateText,
                          isExpired && styles.dateExpired,
                          isSoon && styles.dateSoon,
                          { width: 110 },
                        ]}
                      >
                        {item.expiryDate}
                      </Text>
                      <Text
                        style={[
                          styles.tdCell,
                          { width: 90, textAlign: 'center', fontWeight: '700' },
                        ]}
                      >
                        {item.quantity}
                      </Text>
                      {isMultiBranch && (
                        <Text style={[styles.tdCell, { width: 120 }]} numberOfLines={1}>{item.branch}</Text>
                      )}
                      <Text style={[styles.tdCell, { width: 150 }]} numberOfLines={1}>{item.supplier}</Text>

                      {/* Status */}
                      <View style={[styles.statusWrapper, { width: 110 }]}>
                        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                            {item.status}
                          </Text>
                        </View>
                      </View>

                      {/* Action */}
                      <View style={[styles.actionWrapper, { width: 95 }]}>
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
          )
        )}
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
  contentContainerMobile: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 16,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  kpiRowCompact: {
    gap: 12,
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
  /* Mobile Card Styles */
  mobileCardList: {
    padding: 12,
    gap: 12,
  },
  mobileStatusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  mobileStatusHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  mobileBrandTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  mobileGenericSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 2,
  },
  mobileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 10,
    gap: 10,
  },
  mobileGridCol: {
    width: '47%',
  },
  mobileGridColFull: {
    width: '100%',
  },
  mobileLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  mobileVal: {
    fontSize: 12.5,
    color: '#334155',
    marginTop: 1,
  },
  mobileValBold: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },
  mobileActionFooter: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  mobileReorderBtn: {
    backgroundColor: '#0F766E',
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    cursor: 'pointer',
  },
  mobileReorderBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  mobileWriteOffBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    cursor: 'pointer',
  },
  mobileWriteOffBtnExpired: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  mobileWriteOffText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },
  mobileWriteOffTextExpired: {
    color: '#DC2626',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  tabButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
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
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    height: 40,
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
    minWidth: 1240,
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
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    paddingHorizontal: 6,
    letterSpacing: 0.5,
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
  brandNameCell: {
    fontWeight: '700',
    color: '#0F172A',
  },
  genericNameCell: {
    color: '#475569',
    fontWeight: '500',
  },
  skuCell: {
    fontWeight: '600',
    color: '#64748B',
  },
  currentStockNum: {
    fontWeight: '700',
    color: '#D97706',
  },
  stockCritical: {
    color: '#DC2626',
  },
  expiryDateText: {
    fontWeight: '600',
    color: '#334155',
  },
  dateSoon: {
    color: '#D97706',
  },
  dateExpired: {
    color: '#DC2626',
    fontWeight: '700',
  },
  statusWrapper: {
    alignItems: 'center',
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
  },
  reorderBtn: {
    backgroundColor: '#0F766E',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    cursor: 'pointer',
  },
  reorderBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  writeOffBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    cursor: 'pointer',
  },
  writeOffBtnExpired: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  writeOffBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  writeOffTextExpired: {
    color: '#DC2626',
  },
});
