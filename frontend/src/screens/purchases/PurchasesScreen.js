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
  PURCHASES_KPIS,
  MOCK_PURCHASE_ORDERS_LIST,
  PO_STATUS_FILTER,
} from '../../data/purchasesMockData';

const PO_STATUS_BADGES = {
  Pending: { bg: '#FEF3C7', text: '#B45309' },
  Approved: { bg: '#DBEAFE', text: '#1D4ED8' },
  Received: { bg: '#DCFCE7', text: '#15803D' },
  'Partially Received': { bg: '#F3E8FF', text: '#7E22CE' },
  Cancelled: { bg: '#FEE2E2', text: '#B91C1C' },
};

export default function PurchasesScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('All Statuses');
  const [toggleAutoMatchGst, setToggleAutoMatchGst] = useState(true);

  // 3-Dots Action Menu State
  const [actionMenuModalOpen, setActionMenuModalOpen] = useState(false);
  const [selectedPoForAction, setSelectedPoForAction] = useState(null);

  // Developer Backend & DB Guide Modal State
  const [devGuideModalOpen, setDevGuideModalOpen] = useState(false);

  // Purchase Orders List
  const [orders, setOrders] = useState(MOCK_PURCHASE_ORDERS_LIST);

  // New PO Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    supplier: 'Sun Pharma Care',
    expectedDate: '05 Sep 2026',
    branch: 'Main Branch',
    medicine: 'Paracetamol 500mg (Box of 100)',
    quantity: '10',
    unitPrice: '120.00',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState({});

  // Filtered List
  const filteredOrders = orders.filter((po) => {
    const matchesSearch =
      po.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      po.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      po.branch.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      selectedStatus === 'All Statuses' || po.status === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  const handleOpenModal = () => {
    setFormData({
      supplier: 'Sun Pharma Care',
      expectedDate: '05 Sep 2026',
      branch: 'Main Branch',
      medicine: 'Paracetamol 500mg (Box of 100)',
      quantity: '10',
      unitPrice: '120.00',
      notes: '',
    });
    setFormErrors({});
    setModalVisible(true);
  };

  const handleCreatePO = () => {
    const errors = {};
    if (!formData.supplier.trim()) errors.supplier = 'Supplier is required';
    if (!formData.medicine.trim()) errors.medicine = 'Medicine/Product is required';
    if (!formData.quantity.trim() || isNaN(formData.quantity) || Number(formData.quantity) <= 0) {
      errors.quantity = 'Valid quantity is required';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const calculatedTotal = (Number(formData.quantity) * Number(formData.unitPrice || 100)).toFixed(2);
    const newPO = {
      id: `PO-${1026 + orders.length}`,
      supplier: formData.supplier,
      orderDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      expectedDate: formData.expectedDate || '05 Sep 2026',
      amount: `₹${Number(calculatedTotal).toLocaleString('en-IN')}`,
      itemsCount: Number(formData.quantity),
      status: 'Pending',
      branch: formData.branch || 'Main Branch',
      createdBy: 'Manager',
    };

    setOrders((prev) => [newPO, ...prev]);
    setModalVisible(false);

    if (onShowToast) {
      onShowToast(`✓ Created Purchase Order ${newPO.id} for ${newPO.supplier}!`);
    }
  };

  const handleReceiveStockShortcut = (po) => {
    if (onNavigate) {
      onNavigate('goods-receiving');
    }
    if (onShowToast) {
      onShowToast(`Switched to Goods Receiving for ${po.id}`);
    }
  };

  const handleToggleAutoMatch = () => {
    const nextVal = !toggleAutoMatchGst;
    setToggleAutoMatchGst(nextVal);
    if (onShowToast) {
      onShowToast(nextVal ? '✓ Auto-Match GST (18%) Invoices Activated' : 'Auto-Match GST Invoices Paused');
    }
  };

  const handleOpenActionMenu = (po) => {
    setSelectedPoForAction(po);
    setActionMenuModalOpen(true);
  };

  const handleExecutePoAction = (actionKey) => {
    setActionMenuModalOpen(false);
    const po = selectedPoForAction;
    if (!po) return;

    if (actionKey === 'receive') {
      handleReceiveStockShortcut(po);
    } else if (actionKey === 'approve') {
      setOrders((prev) =>
        prev.map((item) => (item.id === po.id ? { ...item, status: 'Approved' } : item))
      );
      if (onShowToast) {
        onShowToast(`✓ Purchase Order ${po.id} approved successfully!`);
      }
    } else if (actionKey === 'print') {
      if (onShowToast) {
        onShowToast(`🖨️ Generating Gate Pass & Print Sheet for ${po.id}...`);
      }
    } else if (actionKey === 'invoice') {
      if (onShowToast) {
        onShowToast(`📄 GST Invoice downloaded for ${po.id} (Supplier: ${po.supplier})`);
      }
    } else if (actionKey === 'devGuide') {
      setDevGuideModalOpen(true);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, isMobile && styles.contentContainerMobile]}
      showsVerticalScrollIndicator={true}
    >
      {/* Header Row */}
      <View style={[styles.headerRow, isMobile && styles.headerRowMobile]}>
        <View>
          <Text style={styles.pageTitle}>Purchases</Text>
          <Text style={styles.pageSubtitle}>
            Create, track and manage vendor purchase orders and incoming supply lines.
          </Text>
        </View>
        <View style={styles.headerRightActions}>
          <Pressable
            onPress={() => setDevGuideModalOpen(true)}
            style={styles.devGuideTopBtn}
            accessibilityRole="button"
            accessibilityLabel="Backend and Database Guide"
          >
            <Text style={styles.devGuideTopBtnIcon}>🔌</Text>
            <Text style={styles.devGuideTopBtnText}>Backend & DB Guide</Text>
          </Pressable>

          <Pressable
            onPress={handleOpenModal}
            style={styles.newPOButton}
            accessibilityRole="button"
            accessibilityLabel="New Purchase Order"
          >
            <Text style={styles.newPOIcon}>+</Text>
            <Text style={styles.newPOText}>New Purchase Order</Text>
          </Pressable>
        </View>
      </View>

      {/* Top 4 KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {PURCHASES_KPIS.map((kpi) => (
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

      {/* Main Table Card */}
      <View style={styles.cardContainer}>
        {/* Search & Filter Header */}
        <View style={[styles.filtersBar, isCompact && styles.filtersBarCompact]}>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search PO number, supplier or branch..."
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

          {/* Quick Filter Toggles */}
          <View style={styles.filterTogglesGroup}>
            <Pressable
              onPress={handleToggleAutoMatch}
              style={[
                styles.filterTogglePill,
                toggleAutoMatchGst && styles.filterTogglePillActive,
              ]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: toggleAutoMatchGst }}
            >
              <View
                style={[
                  styles.filterToggleDot,
                  toggleAutoMatchGst && styles.filterToggleDotActive,
                ]}
              />
              <Text
                style={[
                  styles.filterToggleText,
                  toggleAutoMatchGst && styles.filterToggleTextActive,
                ]}
              >
                Auto-Match Invoices (18% GST)
              </Text>
            </Pressable>
          </View>

          {/* Status Filter Chips */}
          <View style={styles.filterChipRow}>
            {PO_STATUS_FILTER.map((st) => (
              <Pressable
                key={st}
                onPress={() => setSelectedStatus(st)}
                style={[
                  styles.filterChip,
                  selectedStatus === st && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedStatus === st && styles.filterChipTextActive,
                  ]}
                >
                  {st}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {isMobile ? (
          /* Mobile Purchase Order Cards (No horizontal scroll) */
          <View style={styles.mobileCardList}>
            {filteredOrders.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No purchase orders found</Text>
                <Text style={styles.emptySubtitle}>Try changing your search keywords.</Text>
              </View>
            ) : (
              filteredOrders.map((po) => {
                const badge = PO_STATUS_BADGES[po.status] || PO_STATUS_BADGES.Pending;
                return (
                  <View key={po.id} style={styles.mobilePOCard}>
                    {/* Header: PO ID & Status Badge */}
                    <View style={styles.mobilePOHeader}>
                      <View>
                        <Text style={styles.mobilePOId}>{po.id}</Text>
                        <Text style={styles.mobilePOSupplier}>{po.supplier}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                          {po.status}
                        </Text>
                      </View>
                    </View>

                    {/* PO Details Grid */}
                    <View style={styles.mobileGrid}>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Order Date</Text>
                        <Text style={styles.mobileVal}>{po.orderDate}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Expected Delivery</Text>
                        <Text style={styles.mobileVal}>{po.expectedDate}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Total Amount</Text>
                        <Text style={[styles.mobileValBold, { color: '#0F172A' }]}>{po.amount}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Items Count</Text>
                        <Text style={styles.mobileValBold}>{po.itemsCount} units</Text>
                      </View>
                      <View style={styles.mobileGridColFull}>
                        <Text style={styles.mobileLabel}>Destination Branch</Text>
                        <Text style={styles.mobileVal}>{po.branch}</Text>
                      </View>
                    </View>

                    {/* Action */}
                    <View style={styles.mobilePOFooter}>
                      <Pressable
                        onPress={() => handleOpenActionMenu(po)}
                        style={styles.mobileDotsActionBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Order Actions"
                      >
                        <Text style={styles.mobileDotsActionText}>⋮ Actions</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          /* Desktop Table View */
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              {/* Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { width: 110 }]}>PO NUMBER</Text>
                <Text style={[styles.thCell, { width: 180 }]}>SUPPLIER</Text>
                <Text style={[styles.thCell, { width: 120 }]}>ORDER DATE</Text>
                <Text style={[styles.thCell, { width: 120 }]}>EXPECTED</Text>
                <Text style={[styles.thCell, { width: 120, textAlign: 'right' }]}>AMOUNT</Text>
                <Text style={[styles.thCell, { width: 80, textAlign: 'center' }]}>ITEMS</Text>
                <Text style={[styles.thCell, { width: 130 }]}>BRANCH</Text>
                <Text style={[styles.thCell, { width: 130, textAlign: 'center' }]}>STATUS</Text>
                <Text style={[styles.thCell, { width: 110, textAlign: 'center' }]}>ACTION</Text>
              </View>

              {/* Rows */}
              {filteredOrders.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No purchase orders found</Text>
                  <Text style={styles.emptySubtitle}>Try changing your search keywords.</Text>
                </View>
              ) : (
                filteredOrders.map((po, index) => {
                  const badge = PO_STATUS_BADGES[po.status] || PO_STATUS_BADGES.Pending;
                  return (
                    <View
                      key={po.id}
                      style={[
                        styles.tableRow,
                        index % 2 === 1 && styles.tableRowAlt,
                      ]}
                    >
                      <Text style={[styles.tdCell, styles.poId, { width: 110 }]}>{po.id}</Text>
                      <Text style={[styles.tdCell, styles.supplierName, { width: 180 }]} numberOfLines={1}>
                        {po.supplier}
                      </Text>
                      <Text style={[styles.tdCell, { width: 120 }]}>{po.orderDate}</Text>
                      <Text style={[styles.tdCell, { width: 120 }]}>{po.expectedDate}</Text>
                      <Text style={[styles.tdCell, styles.amountText, { width: 120, textAlign: 'right' }]}>
                        {po.amount}
                      </Text>
                      <Text style={[styles.tdCell, { width: 80, textAlign: 'center', fontWeight: '600' }]}>
                        {po.itemsCount}
                      </Text>
                      <Text style={[styles.tdCell, { width: 130 }]}>{po.branch}</Text>

                      {/* Status Badge */}
                      <View style={[styles.statusWrapper, { width: 130 }]}>
                        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                            {po.status}
                          </Text>
                        </View>
                      </View>

                      {/* Action Button: 3 Dots (⋮) */}
                      <View style={[styles.actionCell, { width: 110 }]}>
                        <Pressable
                          onPress={() => handleOpenActionMenu(po)}
                          style={styles.actionDotsButton}
                          accessibilityRole="button"
                          accessibilityLabel="Order Actions"
                        >
                          <Text style={styles.actionDotsButtonText}>⋮</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        )}
      </View>

      {/* New Purchase Order Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setModalVisible(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Purchase Order</Text>
              <Pressable onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.formRow}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Supplier <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formData.supplier}
                    onChangeText={(t) => setFormData((p) => ({ ...p, supplier: t }))}
                  />
                  {formErrors.supplier && (
                    <Text style={styles.errorText}>{formErrors.supplier}</Text>
                  )}
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Expected Delivery Date</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formData.expectedDate}
                    onChangeText={(t) => setFormData((p) => ({ ...p, expectedDate: t }))}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Branch</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formData.branch}
                    onChangeText={(t) => setFormData((p) => ({ ...p, branch: t }))}
                  />
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Medicine / Product <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formData.medicine}
                    onChangeText={(t) => setFormData((p) => ({ ...p, medicine: t }))}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Quantity (Boxes/Units) <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    value={formData.quantity}
                    onChangeText={(t) => setFormData((p) => ({ ...p, quantity: t }))}
                  />
                  {formErrors.quantity && (
                    <Text style={styles.errorText}>{formErrors.quantity}</Text>
                  )}
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Unit Purchase Price (₹)</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    value={formData.unitPrice}
                    onChangeText={(t) => setFormData((p) => ({ ...p, unitPrice: t }))}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Order Notes / Instructions</Text>
                <TextInput
                  style={[styles.modalInput, styles.textArea]}
                  multiline
                  numberOfLines={3}
                  placeholder="Payment terms, delivery instructions..."
                  placeholderTextColor="#94A3B8"
                  value={formData.notes}
                  onChangeText={(t) => setFormData((p) => ({ ...p, notes: t }))}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleCreatePO}
                style={styles.submitModalButton}
              >
                <Text style={styles.submitModalButtonText}>Create PO</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 3-Dots Action Menu Modal */}
      <Modal
        visible={actionMenuModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setActionMenuModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.actionMenuCard}>
            <View style={styles.actionMenuHeader}>
              <View>
                <Text style={styles.actionMenuTitle}>{selectedPoForAction?.id}</Text>
                <Text style={styles.actionMenuSub}>
                  Supplier: {selectedPoForAction?.supplier} • {selectedPoForAction?.amount}
                </Text>
              </View>
              <Pressable onPress={() => setActionMenuModalOpen(false)} style={styles.closeActionBtn}>
                <Text style={styles.closeActionText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.actionList}>
              <Pressable
                onPress={() => handleExecutePoAction('receive')}
                style={styles.actionOptionRow}
              >
                <Text style={styles.actionOptionIcon}>📦</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={styles.actionOptionTitle}>Receive Shipment & Inspect</Text>
                  <Text style={styles.actionOptionDesc}>Proceed to Goods Receiving (GRN) inspection checklist</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => handleExecutePoAction('approve')}
                style={styles.actionOptionRow}
              >
                <Text style={styles.actionOptionIcon}>✅</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={styles.actionOptionTitle}>Approve Purchase Order</Text>
                  <Text style={styles.actionOptionDesc}>Confirm procurement authorization and notify vendor</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => handleExecutePoAction('print')}
                style={styles.actionOptionRow}
              >
                <Text style={styles.actionOptionIcon}>🖨️</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={styles.actionOptionTitle}>Print PO Gate Pass</Text>
                  <Text style={styles.actionOptionDesc}>Generate printable PO slip for warehouse receiving dock</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => handleExecutePoAction('invoice')}
                style={styles.actionOptionRow}
              >
                <Text style={styles.actionOptionIcon}>📄</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={styles.actionOptionTitle}>Download Tax Invoice</Text>
                  <Text style={styles.actionOptionDesc}>Input Tax Credit (ITC) compliant invoice (18% / 12% GST)</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => handleExecutePoAction('devGuide')}
                style={[styles.actionOptionRow, styles.actionOptionRowDev]}
              >
                <Text style={styles.actionOptionIcon}>🔌</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={[styles.actionOptionTitle, { color: '#0F766E' }]}>
                    Backend & Database Guide (For Developers)
                  </Text>
                  <Text style={styles.actionOptionDesc}>
                    View REST APIs, database schemas, and queries for backend engineers
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Developer Backend & DB Guide Modal */}
      <Modal
        visible={devGuideModalOpen}
        transparent={true}
        animationType="fade"
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
                  <Text style={styles.devGuideModalTitle}>Purchase Orders & Vendor Backend Guide</Text>
                  <Text style={styles.devGuideModalSubtitle}>
                    Specification for Backend Engineers & DB Integrators
                  </Text>
                </View>
              </View>
              <Pressable onPress={() => setDevGuideModalOpen(false)} style={styles.closeActionBtn}>
                <Text style={styles.closeActionText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.devGuideModalBody}>
              {/* Section 1 */}
              <View style={styles.guideSec}>
                <Text style={styles.guideSecTitle}>1. REST API Endpoints</Text>
                <View style={styles.endpointCard}>
                  <View style={styles.endpointHeader}>
                    <View style={styles.methodPost}>
                      <Text style={styles.methodText}>POST</Text>
                    </View>
                    <Text style={styles.endpointRoute}>/api/purchase-orders</Text>
                  </View>
                  <Text style={styles.endpointDesc}>
                    Generates a new purchase order with line items, tax computations (GST 12%/18%), and supplier details.
                  </Text>
                </View>

                <View style={styles.endpointCard}>
                  <View style={styles.endpointHeader}>
                    <View style={[styles.methodPost, { backgroundColor: '#D97706' }]}>
                      <Text style={styles.methodText}>PATCH</Text>
                    </View>
                    <Text style={styles.endpointRoute}>/api/purchase-orders/:id/status</Text>
                  </View>
                  <Text style={styles.endpointDesc}>
                    Updates status to 'Approved', 'Partially Received', or 'Received'.
                  </Text>
                </View>
              </View>

              {/* Section 2 */}
              <View style={styles.guideSec}>
                <Text style={styles.guideSecTitle}>2. PostgreSQL Database Schema</Text>
                <Text style={styles.guideSecDesc}>Tables connecting purchase orders to suppliers and inventory:</Text>
                <View style={styles.codeSnippet}>
                  <Text style={styles.codeSnippetText}>
{`CREATE TABLE purchase_orders (
  id VARCHAR(50) PRIMARY KEY, -- e.g. 'PO-1024'
  supplier_id UUID REFERENCES suppliers(id),
  branch_id UUID REFERENCES branches(id),
  expected_date DATE NOT NULL,
  total_amount NUMERIC(10,2) NOT NULL,
  gst_amount NUMERIC(10,2) NOT NULL,
  status VARCHAR(30) DEFAULT 'Pending',
  created_by VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id VARCHAR(50) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  medicine_id UUID REFERENCES inventory_items(id),
  quantity INT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  gst_rate NUMERIC(5,2) DEFAULT 12.00
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
                <Text style={styles.closeDevGuideModalBtnText}>Done / Close Guide</Text>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
  },
  headerRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
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
  newPOButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: 'pointer',
  },
  newPOButtonHovered: {
    backgroundColor: '#0D9488',
  },
  newPOIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 6,
  },
  newPOText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
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
  /* Mobile Purchase Order Card Styles */
  mobileCardList: {
    padding: 12,
    gap: 12,
  },
  mobilePOCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
      },
    }),
  },
  mobilePOHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  mobilePOId: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F766E',
  },
  mobilePOSupplier: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
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
  mobilePOFooter: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    alignItems: 'flex-end',
  },
  mobileReceiveBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 6,
    cursor: 'pointer',
    width: '100%',
    alignItems: 'center',
  },
  mobileReceiveBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  filtersBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  filtersBarCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  searchBox: {
    flex: 1,
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
  filterChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    cursor: 'pointer',
  },
  filterChipActive: {
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  filterChipTextActive: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tableWrapper: {
    minWidth: 1100,
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
  poId: {
    fontWeight: '700',
    color: '#0F766E',
  },
  supplierName: {
    fontWeight: '600',
    color: '#0F172A',
  },
  amountText: {
    fontWeight: '700',
    color: '#0F172A',
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
  actionCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiveBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#2563EB',
    cursor: 'pointer',
  },
  receiveBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 580,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '700',
  },
  modalBody: {
    padding: 22,
    maxHeight: 480,
  },
  formRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 14,
  },
  formFieldHalf: {
    flex: 1,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  reqStar: {
    color: '#DC2626',
  },
  modalInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0F172A',
    outlineStyle: 'none',
  },
  errorText: {
    fontSize: 11,
    color: '#DC2626',
    marginTop: 3,
    fontWeight: '500',
  },
  textArea: {
    height: 70,
    paddingTop: 8,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
  },
  cancelButton: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 6,
    cursor: 'pointer',
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  submitModalButton: {
    backgroundColor: '#0F766E',
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 8,
    cursor: 'pointer',
  },
  submitModalButtonText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  devGuideTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    cursor: 'pointer',
  },
  devGuideTopBtnIcon: {
    fontSize: 13,
  },
  devGuideTopBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
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
  mobileDotsActionBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignItems: 'center',
    cursor: 'pointer',
  },
  mobileDotsActionText: {
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
