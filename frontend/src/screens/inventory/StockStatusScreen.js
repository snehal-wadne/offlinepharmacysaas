import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
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

  // 3-Dots Action Menu & Backend Dev Guide Modal State
  const [selectedItemForAction, setSelectedItemForAction] = useState(null);
  const [actionItemType, setActionItemType] = useState('low-stock'); // 'low-stock' | 'expiry'
  const [actionMenuModalOpen, setActionMenuModalOpen] = useState(false);
  const [devGuideModalOpen, setDevGuideModalOpen] = useState(false);

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

  const handleOpenActionMenu = (item, type) => {
    setSelectedItemForAction(item);
    setActionItemType(type);
    setActionMenuModalOpen(true);
  };

  const handleExecuteAction = (actionKey) => {
    const item = selectedItemForAction;
    setActionMenuModalOpen(false);
    if (!item) return;

    if (actionKey === 'dev-guide') {
      setDevGuideModalOpen(true);
      return;
    }

    if (actionKey === 'reorder') {
      if (onShowToast) {
        onShowToast(`[POST /api/purchase-orders] Created PO for ${item.brandName || item.medicine} (Qty: ${item.reorderLevel * 2 || 100})`);
      }
      return;
    }

    if (actionKey === 'write-off') {
      if (onShowToast) {
        onShowToast(`[POST /api/inventory/write-off] Batch ${item.batchNo || item.sku} flagged for quarantine / destruction.`);
      }
      return;
    }

    if (actionKey === 'transfer') {
      if (onShowToast) {
        onShowToast(`Redirecting to Stock Transfer for ${item.brandName || item.medicine}`);
      }
      if (onNavigate) {
        onNavigate('stock-transfer', { sku: item.sku, batchNo: item.batchNo });
      }
      return;
    }

    if (actionKey === 'notify-supplier') {
      if (onShowToast) {
        onShowToast(`📧 Supplier notification email dispatched to ${item.supplier}`);
      }
      return;
    }
  };

  const handleReorder = (item) => {
    handleOpenActionMenu(item, 'low-stock');
  };

  const handleWriteOff = (item) => {
    handleOpenActionMenu(item, 'expiry');
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

        {/* Search Bar & Filter Controls */}
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
                        onPress={() => handleOpenActionMenu(item, 'low-stock')}
                        style={styles.mobileActionDotsBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Stock Actions"
                      >
                        <Text style={styles.mobileActionDotsText}>⋮ Actions</Text>
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

                      {/* 3-Dots Action Button */}
                      <View style={[styles.actionWrapper, { width: 95 }]}>
                        <Pressable
                          onPress={() => handleOpenActionMenu(item, 'low-stock')}
                          style={styles.actionDotsButton}
                          accessibilityRole="button"
                          accessibilityLabel="Actions"
                        >
                          <Text style={styles.actionDotsButtonText}>⋮</Text>
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
                        onPress={() => handleOpenActionMenu(item, 'expiry')}
                        style={styles.mobileActionDotsBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Batch Actions"
                      >
                        <Text style={styles.mobileActionDotsText}>⋮ Actions</Text>
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

                      {/* 3-Dots Action Button */}
                      <View style={[styles.actionWrapper, { width: 95 }]}>
                        <Pressable
                          onPress={() => handleOpenActionMenu(item, 'expiry')}
                          style={styles.actionDotsButton}
                          accessibilityRole="button"
                          accessibilityLabel="Actions"
                        >
                          <Text style={styles.actionDotsButtonText}>⋮</Text>
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

      {/* 1. 3-DOTS ACTION MENU MODAL */}
      <Modal
        visible={actionMenuModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setActionMenuModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.actionMenuCard}>
            <View style={styles.actionMenuHeader}>
              <View>
                <Text style={styles.actionMenuTitle}>
                  {selectedItemForAction?.brandName || selectedItemForAction?.medicine}
                </Text>
                <Text style={styles.actionMenuSub}>
                  {actionItemType === 'low-stock'
                    ? `SKU: ${selectedItemForAction?.sku} • Stock: ${selectedItemForAction?.currentStock} / Min: ${selectedItemForAction?.minimumStock}`
                    : `Batch: ${selectedItemForAction?.batchNo} • Expiry: ${selectedItemForAction?.expiryDate} • Qty: ${selectedItemForAction?.quantity}`}
                </Text>
              </View>
              <Pressable onPress={() => setActionMenuModalOpen(false)} style={styles.closeActionBtn}>
                <Text style={styles.closeActionText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.actionList}>
              <Pressable
                onPress={() => handleExecuteAction('reorder')}
                style={styles.actionOptionRow}
              >
                <Text style={styles.actionOptionIcon}>🛒</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={styles.actionOptionTitle}>Generate Purchase Reorder (PO)</Text>
                  <Text style={styles.actionOptionDesc}>Issue purchase order to supplier ({selectedItemForAction?.supplier})</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => handleExecuteAction('write-off')}
                style={[styles.actionOptionRow, styles.actionOptionRowDanger]}
              >
                <Text style={styles.actionOptionIcon}>🗑️</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={[styles.actionOptionTitle, { color: '#DC2626' }]}>
                    {actionItemType === 'expiry' ? 'Write-Off Expired Batch' : 'Quarantine / Damaged Loss'}
                  </Text>
                  <Text style={styles.actionOptionDesc}>Deduct inventory with financial write-off loss reason</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => handleExecuteAction('transfer')}
                style={styles.actionOptionRow}
              >
                <Text style={styles.actionOptionIcon}>🔄</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={styles.actionOptionTitle}>Transfer from Another Branch</Text>
                  <Text style={styles.actionOptionDesc}>Request surplus stock from nearby pharmacy branch</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => handleExecuteAction('notify-supplier')}
                style={styles.actionOptionRow}
              >
                <Text style={styles.actionOptionIcon}>📧</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={styles.actionOptionTitle}>Notify Supplier / Rep</Text>
                  <Text style={styles.actionOptionDesc}>Send priority replenishment notice to medical rep</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => handleExecuteAction('dev-guide')}
                style={[styles.actionOptionRow, styles.actionOptionRowDev]}
              >
                <Text style={styles.actionOptionIcon}>🔌</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={[styles.actionOptionTitle, { color: '#0F766E' }]}>
                    Backend & Database Guide (For Developers)
                  </Text>
                  <Text style={styles.actionOptionDesc}>
                    View API endpoints, JSON payloads, and DB schemas for stock alerts
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. BACKEND & DATABASE DEVELOPER GUIDE MODAL */}
      <Modal
        visible={devGuideModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDevGuideModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.devGuideModalCard, isMobile && styles.devGuideModalCardMobile]}>
            <View style={styles.devGuideModalHeader}>
              <View style={styles.devGuideTitleRow}>
                <View style={styles.devGuideIconBadge}>
                  <Text style={styles.devGuideIconText}>🔌</Text>
                </View>
                <View>
                  <Text style={styles.devGuideModalTitle}>Stock Alerts & Expiry Backend / DB Guide</Text>
                  <Text style={styles.devGuideModalSubtitle}>
                    Specification for automated PO generation and expiry write-off audit
                  </Text>
                </View>
              </View>
              <Pressable onPress={() => setDevGuideModalOpen(false)} style={styles.closeActionBtn}>
                <Text style={styles.closeActionText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.devGuideModalBody} showsVerticalScrollIndicator={true}>
              <View style={styles.guideSec}>
                <Text style={styles.guideSecTitle}>1. Required REST API Endpoints</Text>

                <View style={styles.endpointCard}>
                  <View style={styles.endpointHeader}>
                    <View style={styles.methodPost}><Text style={styles.methodText}>POST</Text></View>
                    <Text style={styles.endpointRoute}>/api/purchase-orders</Text>
                  </View>
                  <Text style={styles.endpointDesc}>
                    Triggered by "+ Reorder" or Auto-Reorder Engine when stock drops below reorder_level.
                  </Text>
                  <View style={styles.codeSnippet}>
                    <Text style={styles.codeSnippetText}>
{`// Payload: POST /api/purchase-orders
{
  "supplier_name": "Cipla Ltd",
  "branch_id": "FIT Main Campus",
  "items": [
    { "item_id": "stk-101", "reorder_qty": 200, "unit_cost": 4.20 }
  ],
  "status": "Submitted"
}`}
                    </Text>
                  </View>
                </View>

                <View style={styles.endpointCard}>
                  <View style={styles.endpointHeader}>
                    <View style={styles.methodPost}><Text style={styles.methodText}>POST</Text></View>
                    <Text style={styles.endpointRoute}>/api/inventory/write-off</Text>
                  </View>
                  <Text style={styles.endpointDesc}>
                    Deducts quantity for expired or damaged medicines with accounting loss reason.
                  </Text>
                  <View style={styles.codeSnippet}>
                    <Text style={styles.codeSnippetText}>
{`// Payload: POST /api/inventory/write-off
{
  "batch_id": "BCH-8921",
  "reason": "EXPIRED_BATCH",
  "quantity": 15,
  "approved_by": "USR-102"
}`}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.guideSec}>
                <Text style={styles.guideSecTitle}>2. PostgreSQL Schema & Cron Query</Text>
                <View style={styles.codeSnippet}>
                  <Text style={styles.codeSnippetText}>
{`-- Low stock detection query for automated reorder notification:
SELECT 
  i.id, i.sku, i.brand_name,
  COALESCE(SUM(b.quantity), 0) AS current_stock,
  i.minimum_stock, i.reorder_level
FROM inventory_items i
LEFT JOIN inventory_batches b ON i.id = b.item_id
GROUP BY i.id, i.sku, i.brand_name, i.minimum_stock, i.reorder_level
HAVING COALESCE(SUM(b.quantity), 0) <= i.reorder_level;

-- Write-off audit log table:
CREATE TABLE IF NOT EXISTS stock_writeoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES inventory_batches(id),
  quantity INT NOT NULL,
  reason VARCHAR(100) NOT NULL,
  loss_amount NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);`}
                  </Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.devGuideModalFooter}>
              <Pressable
                onPress={() => setDevGuideModalOpen(false)}
                style={styles.closeDevGuideModalBtn}
              >
                <Text style={styles.closeDevGuideModalBtnText}>Close Developer Guide</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  filterTogglesGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 8,
  },
  filterTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    cursor: 'pointer',
  },
  filterTogglePillActive: {
    backgroundColor: '#F0FDFA',
    borderColor: '#0F766E',
  },
  filterToggleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#94A3B8',
  },
  filterToggleDotActive: {
    backgroundColor: '#0F766E',
  },
  filterToggleText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  filterToggleTextActive: {
    color: '#0F766E',
    fontWeight: '700',
  },
  devGuideTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    cursor: 'pointer',
  },
  devGuideTopBtnIcon: {
    fontSize: 12,
  },
  devGuideTopBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  mobileActionDotsBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignItems: 'center',
    cursor: 'pointer',
  },
  mobileActionDotsText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  actionDotsButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    cursor: 'pointer',
  },
  actionDotsButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#334155',
    lineHeight: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  actionMenuCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
  },
  actionMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  actionMenuTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  actionMenuSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  closeActionBtn: {
    padding: 6,
    cursor: 'pointer',
  },
  closeActionText: {
    fontSize: 18,
    color: '#64748B',
    fontWeight: '700',
  },
  actionList: {
    padding: 10,
    gap: 4,
  },
  actionOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
  },
  actionOptionRowDanger: {
    backgroundColor: '#FEF2F2',
  },
  actionOptionRowDev: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    marginTop: 4,
  },
  actionOptionIcon: {
    fontSize: 20,
  },
  actionOptionTextCol: {
    flex: 1,
  },
  actionOptionTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  actionOptionDesc: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  devGuideModalCard: {
    width: '100%',
    maxWidth: 780,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
  },
  devGuideModalCardMobile: {
    maxHeight: '95%',
  },
  devGuideModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  devGuideTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  devGuideIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  devGuideIconText: {
    fontSize: 18,
  },
  devGuideModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  devGuideModalSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  devGuideModalBody: {
    padding: 20,
  },
  guideSec: {
    marginBottom: 20,
  },
  guideSecTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F766E',
    marginBottom: 6,
  },
  guideSecDesc: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 8,
  },
  codeSnippet: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 12,
    marginTop: 6,
  },
  codeSnippetText: {
    color: '#38BDF8',
    fontSize: 11.5,
    fontFamily: Platform.select({ web: 'Consolas, Monaco, monospace', default: 'System' }),
    lineHeight: 17,
  },
  endpointCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  endpointHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  methodPost: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  methodText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  endpointRoute: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    fontFamily: Platform.select({ web: 'monospace', default: 'System' }),
  },
  endpointDesc: {
    fontSize: 12,
    color: '#475569',
  },
  devGuideModalFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'flex-end',
  },
  closeDevGuideModalBtn: {
    backgroundColor: '#0F766E',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: 'pointer',
  },
  closeDevGuideModalBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
});
