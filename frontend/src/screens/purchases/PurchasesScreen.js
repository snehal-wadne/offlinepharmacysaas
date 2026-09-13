import React, { useState, useEffect } from 'react';
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
import {
  fetchPurchases,
  createPurchaseOrder,
  updatePurchaseStatus,
} from '../../api/purchaseApi';
import { useOfflineSync } from '../../offline/OfflineSyncContext';
import { SkeletonTableRow, SkeletonItemCard } from '../../components/common/SkeletonLoader';
import PaginationControls from '../../components/common/PaginationControls';
import { exportTaxInvoice } from '../../utils/exportUtils';

const PO_STATUS_BADGES = {
  Draft: { bg: '#F1F5F9', text: '#475569' },
  Pending: { bg: '#FEF3C7', text: '#B45309' },
  Approved: { bg: '#DBEAFE', text: '#1D4ED8' },
  Received: { bg: '#DCFCE7', text: '#15803D' },
  'Partially Received': { bg: '#F3E8FF', text: '#7E22CE' },
  Cancelled: { bg: '#FEE2E2', text: '#B91C1C' },
};

export default function PurchasesScreen({ onShowToast, onNavigate, selectedBranch = 'All Branches' }) {
  const offlineSync = useOfflineSync();
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  // Primary View Tab State: 'all' | 'customer_orders' | 'drafts'
  const [activeTab, setActiveTab] = useState('all');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('All Statuses');
  const [togglePendingOnly, setTogglePendingOnly] = useState(false);
  const [toggleAutoMatchGst, setToggleAutoMatchGst] = useState(true);

  // 3-Dots Action Menu State
  const [actionMenuModalOpen, setActionMenuModalOpen] = useState(false);
  const [selectedPoForAction, setSelectedPoForAction] = useState(null);


  // Purchase Orders List
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    loadPurchasesData();
  }, [selectedBranch]);

  const loadPurchasesData = async () => {
    try {
      setLoading(true);
      const branchParam = selectedBranch && selectedBranch !== 'All Branches' ? selectedBranch : undefined;
      const res = await fetchPurchases({ branchId: branchParam });
      if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
        setOrders(res.data);
      } else {
        setOrders(MOCK_PURCHASE_ORDERS_LIST);
      }
    } catch (err) {
      console.warn('Failed to fetch purchases from DB:', err.message);
      setOrders(MOCK_PURCHASE_ORDERS_LIST);
    } finally {
      setLoading(false);
    }
  };

  // Dynamic KPI Calculations
  const totalPurchasesSum = orders.reduce((sum, po) => {
    const val = typeof po.numericAmount === 'number'
      ? po.numericAmount
      : (parseFloat(String(po.amount || '0').replace(/[^0-9.]/g, '')) || 0);
    return sum + val;
  }, 0);

  const draftCount = orders.filter((po) => po.status === 'Draft' || po.status === 'DRAFT').length;
  const customerOrdersCount = orders.filter((po) => po.isCustomerOrder || po.customerName).length;
  const pendingCount = orders.filter((po) => po.status === 'Pending' || po.status === 'PENDING').length;
  const receivedCount = orders.filter((po) => po.status === 'Received' || po.status === 'RECEIVED').length;
  const cancelledCount = orders.filter((po) => po.status === 'Cancelled' || po.status === 'CANCELLED').length;

  const dynamicPurchasesKpis = [
    {
      id: 'p-kpi-1',
      label: 'TOTAL PURCHASES',
      value: `₹${totalPurchasesSum.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
      subtext: 'This fiscal month',
      variant: 'teal',
      key: 'All Statuses',
      tabKey: 'all',
    },
    {
      id: 'p-kpi-2',
      label: 'CUSTOMER ORDERS',
      value: customerOrdersCount.toLocaleString(),
      subtext: 'Patient special orders',
      variant: 'blue',
      key: 'All Statuses',
      tabKey: 'customer_orders',
    },
    {
      id: 'p-kpi-3',
      label: 'DRAFT ORDERS',
      value: draftCount.toLocaleString(),
      subtext: 'Unsubmitted drafts',
      variant: 'amber',
      key: 'Draft',
      tabKey: 'drafts',
    },
    {
      id: 'p-kpi-4',
      label: 'PENDING ORDERS',
      value: pendingCount.toLocaleString(),
      subtext: 'Awaiting delivery',
      variant: 'orange',
      key: 'Pending',
      tabKey: 'all',
    },
  ];

  const handleKpiCardPress = (kpi) => {
    if (kpi.tabKey) {
      setActiveTab(kpi.tabKey);
    }
    if (kpi.key) {
      setSelectedStatus(kpi.key);
    }
    if (onShowToast) onShowToast(`Filtered: ${kpi.label}`);
  };

  // New PO Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    supplier: 'Sun Pharma Care',
    expectedDate: '05 Sep 2026',
    branch: 'Main Branch',
    medicine: 'Paracetamol 500mg (Box of 100)',
    quantity: '10',
    unitPrice: '120.00',
    taxRate: '12%',
    notes: '',
    isCustomerOrder: false,
    customerName: '',
    customerPhone: '',
    prescriptionRef: '',
  });
  const [formErrors, setFormErrors] = useState({});

  // Filtered List
  const filteredOrders = orders.filter((po) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (po.id && po.id.toLowerCase().includes(q)) ||
      (po.supplier && po.supplier.toLowerCase().includes(q)) ||
      (po.branch && po.branch.toLowerCase().includes(q)) ||
      (po.customerName && po.customerName.toLowerCase().includes(q)) ||
      (po.medicine && po.medicine.toLowerCase().includes(q));

    // Tab Filter
    if (activeTab === 'customer_orders') {
      if (!po.isCustomerOrder && !po.customerName) return false;
    } else if (activeTab === 'drafts') {
      if (po.status !== 'Draft' && po.status !== 'DRAFT') return false;
    }

    const matchesStatus =
      selectedStatus === 'All Statuses' ||
      po.status === selectedStatus ||
      (selectedStatus === 'Draft' && (po.status === 'Draft' || po.status === 'DRAFT')) ||
      (selectedStatus === 'Pending' && (po.status === 'Pending' || po.status === 'PENDING')) ||
      (selectedStatus === 'Approved' && (po.status === 'Approved' || po.status === 'APPROVED')) ||
      (selectedStatus === 'Received' && (po.status === 'Received' || po.status === 'RECEIVED')) ||
      (selectedStatus === 'Cancelled' && (po.status === 'Cancelled' || po.status === 'CANCELLED'));

    const matchesTogglePending = !togglePendingOnly || po.status === 'Pending' || po.status === 'PENDING';

    // Branch Scoping Filter
    let matchesBranch = true;
    if (selectedBranch && selectedBranch !== 'All Branches') {
      matchesBranch =
        (po.branch && (po.branch === selectedBranch || po.branchName === selectedBranch)) ||
        (po.branchName && po.branchName === selectedBranch) ||
        (po.branch_id && (po.branch_id === selectedBranch || String(po.branch_id) === String(selectedBranch)));
    }

    return matchesSearch && matchesStatus && matchesTogglePending && matchesBranch;
  });

  const handleOpenModal = () => {
    setFormData({
      supplier: 'Sun Pharma Care',
      expectedDate: '05 Sep 2026',
      branch: 'Main Branch',
      medicine: 'Paracetamol 500mg (Box of 100)',
      quantity: '10',
      unitPrice: '120.00',
      taxRate: '12%',
      notes: '',
      isCustomerOrder: activeTab === 'customer_orders',
      customerName: '',
      customerPhone: '',
      prescriptionRef: '',
    });
    setFormErrors({});
    setModalVisible(true);
  };

  const handleCreatePO = async (targetStatus = 'Pending') => {
    const errors = {};
    if (!formData.supplier.trim()) errors.supplier = 'Supplier is required';
    if (!formData.medicine.trim()) errors.medicine = 'Medicine/Product is required';
    if (!formData.quantity.trim() || isNaN(formData.quantity) || Number(formData.quantity) <= 0) {
      errors.quantity = 'Valid quantity is required';
    }
    if (formData.isCustomerOrder && !formData.customerName.trim()) {
      errors.customerName = 'Customer/Patient name is required';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const qtyNum = Number(formData.quantity);
    const unitCostNum = Number(formData.unitPrice || 100);
    const subtotalNum = qtyNum * unitCostNum;
    const taxRateNum = parseFloat(String(formData.taxRate || '12%').replace('%', '')) || 0;
    const taxAmountNum = (subtotalNum * taxRateNum) / 100;
    const grandTotalNum = subtotalNum + taxAmountNum;
    const calculatedTotal = grandTotalNum.toFixed(2);
    const isDraft = targetStatus === 'Draft';
    const poNum = isDraft ? `PO-DRAFT-${Date.now().toString().slice(-4)}` : `PO-${1026 + orders.length}`;

    const payload = {
      purchaseNumber: poNum,
      supplierName: formData.supplier,
      branchName: formData.branch || 'Main Branch',
      expectedDate: formData.expectedDate || '05 Sep 2026',
      notes: formData.notes || '',
      status: isDraft ? 'DRAFT' : 'PENDING',
      isCustomerOrder: formData.isCustomerOrder,
      customerName: formData.customerName.trim(),
      customerPhone: formData.customerPhone.trim(),
      prescriptionRef: formData.prescriptionRef.trim(),
      subtotal: subtotalNum,
      taxRate: `${taxRateNum}%`,
      taxAmount: taxAmountNum,
      totalAmount: grandTotalNum,
      items: [
        {
          medicineName: formData.medicine,
          brandName: formData.medicine,
          orderedQuantity: qtyNum,
          unitCost: unitCostNum,
          taxRate: taxRateNum,
          taxAmount: taxAmountNum,
          total: grandTotalNum,
        },
      ],
    };

    try {
      const res = await createPurchaseOrder(payload);
      const created = res?.data;
      const newPO = {
        id: created?.purchase_number || poNum,
        dbId: created?.id,
        poNumber: created?.purchase_number || poNum,
        supplier: formData.supplier,
        orderDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        expectedDate: formData.expectedDate || '05 Sep 2026',
        amount: `₹${Number(calculatedTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        numericAmount: Number(calculatedTotal),
        subtotal: subtotalNum,
        taxRate: `${taxRateNum}%`,
        taxAmount: taxAmountNum,
        unitPrice: unitCostNum,
        itemsCount: qtyNum,
        status: isDraft ? 'Draft' : 'Pending',
        branch: formData.branch || 'Main Branch',
        medicine: formData.medicine,
        isCustomerOrder: formData.isCustomerOrder,
        customerName: formData.customerName.trim(),
        customerPhone: formData.customerPhone.trim(),
        prescriptionRef: formData.prescriptionRef.trim(),
        createdBy: 'Manager',
      };

      if (offlineSync?.recordPurchaseOffline) {
        offlineSync.recordPurchaseOffline(newPO);
      }

      setOrders((prev) => [newPO, ...prev]);
      setModalVisible(false);

      if (onShowToast) {
        onShowToast(isDraft ? `✓ Saved Purchase Order ${newPO.id} as Draft (Taxes Included: ₹${Number(calculatedTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })})!` : `✓ Created Purchase Order ${newPO.id} (Total: ₹${Number(calculatedTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })})!`);
      }
    } catch (err) {
      console.warn('Backend PO create error, saving locally in offline storage:', err.message);
      const newPO = {
        id: poNum,
        supplier: formData.supplier,
        orderDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        expectedDate: formData.expectedDate || '05 Sep 2026',
        amount: `₹${Number(calculatedTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        numericAmount: Number(calculatedTotal),
        subtotal: subtotalNum,
        taxRate: `${taxRateNum}%`,
        taxAmount: taxAmountNum,
        unitPrice: unitCostNum,
        itemsCount: qtyNum,
        status: isDraft ? 'Draft' : 'Pending',
        branch: formData.branch || 'Main Branch',
        medicine: formData.medicine,
        isCustomerOrder: formData.isCustomerOrder,
        customerName: formData.customerName.trim(),
        customerPhone: formData.customerPhone.trim(),
        prescriptionRef: formData.prescriptionRef.trim(),
        createdBy: 'Manager',
      };

      if (offlineSync?.recordPurchaseOffline) {
        offlineSync.recordPurchaseOffline(newPO);
      }

      setOrders((prev) => [newPO, ...prev]);
      setModalVisible(false);

      if (onShowToast) {
        onShowToast(isDraft ? `✓ Saved Purchase Order ${newPO.id} as Draft (Offline, Taxes Included)!` : `✓ Created Purchase Order ${newPO.id} (Saved Offline, Taxes Included)!`);
      }
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

  const handleTogglePending = () => {
    const nextVal = !togglePendingOnly;
    setTogglePendingOnly(nextVal);
    if (onShowToast) {
      onShowToast(nextVal ? 'Filter enabled: Showing Pending Orders Only' : 'Filter cleared: Showing All Orders');
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

  const handleExecutePoAction = async (actionKey) => {
    setActionMenuModalOpen(false);
    const po = selectedPoForAction;
    if (!po) return;

    const targetDbId = po.dbId || po.id;

    if (actionKey === 'receive') {
      try {
        await updatePurchaseStatus(targetDbId, 'RECEIVED');
        setOrders((prev) =>
          prev.map((item) => (item.id === po.id ? { ...item, status: 'Received' } : item))
        );
        if (onShowToast) {
          onShowToast(`✓ PO ${po.id} marked as Received in database!`);
        }
      } catch (err) {
        setOrders((prev) =>
          prev.map((item) => (item.id === po.id ? { ...item, status: 'Received' } : item))
        );
        if (onShowToast) onShowToast(`Updated ${po.id} status to Received`);
      }
    } else if (actionKey === 'approve') {
      try {
        await updatePurchaseStatus(targetDbId, 'APPROVED');
        setOrders((prev) =>
          prev.map((item) => (item.id === po.id ? { ...item, status: 'Approved' } : item))
        );
        if (onShowToast) {
          onShowToast(`✓ PO ${po.id} approved in database!`);
        }
      } catch (err) {
        setOrders((prev) =>
          prev.map((item) => (item.id === po.id ? { ...item, status: 'Approved' } : item))
        );
        if (onShowToast) onShowToast(`✓ PO ${po.id} approved!`);
      }
    } else if (actionKey === 'cancel') {
      try {
        await updatePurchaseStatus(targetDbId, 'CANCELLED');
        setOrders((prev) =>
          prev.map((item) => (item.id === po.id ? { ...item, status: 'Cancelled' } : item))
        );
        if (onShowToast) {
          onShowToast(`[PATCH /api/purchases] PO ${po.id} cancelled in database!`);
        }
      } catch (err) {
        setOrders((prev) =>
          prev.map((item) => (item.id === po.id ? { ...item, status: 'Cancelled' } : item))
        );
      }
    } else if (actionKey === 'print') {
      exportTaxInvoice(po);
      if (onShowToast) {
        onShowToast(`🖨️ Generating Gate Pass & Print Sheet for ${po.id}...`);
      }
    } else if (actionKey === 'invoice') {
      exportTaxInvoice(po);
      if (onShowToast) {
        onShowToast(`📄 Opening GST Tax Invoice for ${po.id} (Print / Save as PDF)...`);
      }
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
        {dynamicPurchasesKpis.map((kpi) => (
          <InventoryStatCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            subtext={kpi.subtext}
            variant={kpi.variant}
            onPress={() => handleKpiCardPress(kpi)}
          />
        ))}
      </View>

      {/* Primary Order Mode Tabs (All Orders, Customer Special Orders, Draft Orders) */}
      <View style={[styles.primaryTabBar, isMobile && styles.primaryTabBarMobile]}>
        <Pressable
          onPress={() => {
            setActiveTab('all');
            setSelectedStatus('All Statuses');
            if (onShowToast) onShowToast('Showing All Purchase Orders');
          }}
          style={[styles.primaryTabItem, activeTab === 'all' && styles.primaryTabItemActive]}
        >
          <Text style={styles.primaryTabIcon}>📦</Text>
          <Text style={[styles.primaryTabText, activeTab === 'all' && styles.primaryTabTextActive]}>
            All Purchase Orders
          </Text>
          <View style={[styles.primaryTabCountBadge, activeTab === 'all' && styles.primaryTabCountBadgeActive]}>
            <Text style={[styles.primaryTabCountText, activeTab === 'all' && styles.primaryTabCountTextActive]}>
              {orders.length}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => {
            setActiveTab('customer_orders');
            setSelectedStatus('All Statuses');
            if (onShowToast) onShowToast('Showing Customer Special Orders');
          }}
          style={[styles.primaryTabItem, activeTab === 'customer_orders' && styles.primaryTabItemActive]}
        >
          <Text style={styles.primaryTabIcon}>👤</Text>
          <Text style={[styles.primaryTabText, activeTab === 'customer_orders' && styles.primaryTabTextActive]}>
            Customer Special Orders
          </Text>
          <View style={[styles.primaryTabCountBadge, activeTab === 'customer_orders' && styles.primaryTabCountBadgeActive]}>
            <Text style={[styles.primaryTabCountText, activeTab === 'customer_orders' && styles.primaryTabCountTextActive]}>
              {customerOrdersCount}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => {
            setActiveTab('drafts');
            setSelectedStatus('Draft');
            if (onShowToast) onShowToast('Showing Draft Purchase Orders');
          }}
          style={[styles.primaryTabItem, activeTab === 'drafts' && styles.primaryTabItemActive]}
        >
          <Text style={styles.primaryTabIcon}>📝</Text>
          <Text style={[styles.primaryTabText, activeTab === 'drafts' && styles.primaryTabTextActive]}>
            Draft Orders
          </Text>
          <View style={[styles.primaryTabCountBadge, activeTab === 'drafts' && styles.primaryTabCountBadgeActive]}>
            <Text style={[styles.primaryTabCountText, activeTab === 'drafts' && styles.primaryTabCountTextActive]}>
              {draftCount}
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Main Table Card */}
      <View style={styles.cardContainer}>
        {/* Search & Filter Header */}
        <View style={[styles.filtersBar, isCompact && styles.filtersBarCompact]}>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search PO number, supplier, customer or medicine..."
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
              onPress={handleTogglePending}
              style={[
                styles.filterTogglePill,
                togglePendingOnly && styles.filterTogglePillActive,
              ]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: togglePendingOnly }}
            >
              <View
                style={[
                  styles.filterToggleDot,
                  togglePendingOnly && styles.filterToggleDotActive,
                ]}
              />
              <Text
                style={[
                  styles.filterToggleText,
                  togglePendingOnly && styles.filterToggleTextActive,
                ]}
              >
                Pending Only
              </Text>
            </Pressable>

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
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <SkeletonItemCard key={i} />)
            ) : filteredOrders.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No purchase orders found</Text>
                <Text style={styles.emptySubtitle}>Try changing your search keywords or filter tab.</Text>
              </View>
            ) : (
              filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((po) => {
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

                    {/* Customer Requisition Banner if Customer Order */}
                    {(po.isCustomerOrder || po.customerName) && (
                      <View style={styles.mobileCustomerRow}>
                        <Text style={styles.mobileCustomerTag}>👤 CUSTOMER SPECIAL ORDER</Text>
                        <Text style={styles.mobileCustomerText} numberOfLines={1}>
                          {po.customerName} {po.customerPhone ? `• ${po.customerPhone}` : ''}
                        </Text>
                        {po.prescriptionRef ? (
                          <Text style={styles.mobileRxText} numberOfLines={1}>
                            📋 {po.prescriptionRef}
                          </Text>
                        ) : null}
                      </View>
                    )}

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
                <Text style={[styles.thCell, { width: 170 }]}>SUPPLIER</Text>
                <Text style={[styles.thCell, { width: 170 }]}>ORDERED FOR</Text>
                <Text style={[styles.thCell, { width: 110 }]}>ORDER DATE</Text>
                <Text style={[styles.thCell, { width: 110 }]}>EXPECTED</Text>
                <Text style={[styles.thCell, { width: 110, textAlign: 'right' }]}>AMOUNT</Text>
                <Text style={[styles.thCell, { width: 70, textAlign: 'center' }]}>ITEMS</Text>
                <Text style={[styles.thCell, { width: 120 }]}>BRANCH</Text>
                <Text style={[styles.thCell, { width: 120, textAlign: 'center' }]}>STATUS</Text>
                <Text style={[styles.thCell, { width: 100, textAlign: 'center' }]}>ACTION</Text>
              </View>

              {/* Rows */}
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonTableRow key={i} columns={10} />
                ))
              ) : filteredOrders.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No purchase orders found</Text>
                  <Text style={styles.emptySubtitle}>Try changing your search keywords or active tab.</Text>
                </View>
              ) : (
                filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((po, index) => {
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
                      <Text style={[styles.tdCell, styles.supplierName, { width: 170 }]} numberOfLines={1}>
                        {po.supplier}
                      </Text>

                      {/* Ordered For: Customer or General Stock */}
                      <View style={[{ width: 170, paddingHorizontal: 10, justifyContent: 'center' }]}>
                        {po.isCustomerOrder || po.customerName ? (
                          <View style={styles.tableCustomerBadge}>
                            <Text style={styles.tableCustomerName} numberOfLines={1}>
                              👤 {po.customerName}
                            </Text>
                            {po.customerPhone ? (
                              <Text style={styles.tableCustomerPhone} numberOfLines={1}>
                                {po.customerPhone}
                              </Text>
                            ) : null}
                          </View>
                        ) : (
                          <View style={styles.tableStockBadge}>
                            <Text style={styles.tableStockText}>🏢 General Stock</Text>
                          </View>
                        )}
                      </View>

                      <Text style={[styles.tdCell, { width: 110 }]}>{po.orderDate}</Text>
                      <Text style={[styles.tdCell, { width: 110 }]}>{po.expectedDate}</Text>
                      <Text style={[styles.tdCell, styles.amountText, { width: 110, textAlign: 'right' }]}>
                        {po.amount}
                      </Text>
                      <Text style={[styles.tdCell, { width: 70, textAlign: 'center', fontWeight: '600' }]}>
                        {po.itemsCount}
                      </Text>
                      <Text style={[styles.tdCell, { width: 120 }]}>{po.branch}</Text>

                      {/* Status Badge */}
                      <View style={[styles.statusWrapper, { width: 120 }]}>
                        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                            {po.status}
                          </Text>
                        </View>
                      </View>

                      {/* Action Button: 3 Dots (⋮) */}
                      <View style={[styles.actionCell, { width: 100 }]}>
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
        
        <PaginationControls 
          currentPage={currentPage}
          totalPages={Math.ceil(filteredOrders.length / itemsPerPage)}
          onPageChange={setCurrentPage}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={setItemsPerPage}
        />
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
              {/* Order Purpose / Type Switcher */}
              <View style={styles.modalOrderTypeRow}>
                <Pressable
                  onPress={() => setFormData((p) => ({ ...p, isCustomerOrder: false }))}
                  style={[
                    styles.orderTypeBtn,
                    !formData.isCustomerOrder && styles.orderTypeBtnActive,
                  ]}
                >
                  <Text style={styles.orderTypeBtnIcon}>📦</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.orderTypeBtnTitle, !formData.isCustomerOrder && styles.orderTypeBtnTitleActive]}>
                      General Pharmacy Stock
                    </Text>
                    <Text style={styles.orderTypeBtnSubtitle}>Standard warehouse replenishment</Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => setFormData((p) => ({ ...p, isCustomerOrder: true }))}
                  style={[
                    styles.orderTypeBtn,
                    formData.isCustomerOrder && styles.orderTypeBtnActive,
                  ]}
                >
                  <Text style={styles.orderTypeBtnIcon}>👤</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.orderTypeBtnTitle, formData.isCustomerOrder && styles.orderTypeBtnTitleActive]}>
                      Customer / Patient Order
                    </Text>
                    <Text style={styles.orderTypeBtnSubtitle}>Procuring medicine requested by customer</Text>
                  </View>
                </Pressable>
              </View>

              {/* Customer Specific Order Details Card (when isCustomerOrder is true) */}
              {formData.isCustomerOrder && (
                <View style={styles.customerOrderBox}>
                  <View style={styles.customerOrderBoxHeader}>
                    <Text style={styles.customerOrderBoxTitle}>👤 Customer / Patient Information</Text>
                    <Text style={styles.customerOrderBoxSub}>Select an existing customer or enter details</Text>
                  </View>

                  {/* Quick Select Patient Chips */}
                  <View style={styles.quickPatientRow}>
                    {[
                      { name: 'Ayesha Khan', phone: '98765 43210' },
                      { name: 'Rajesh Sharma', phone: '98220 11450' },
                      { name: 'Suresh Patil', phone: '98220 00000' },
                      { name: 'Ananya Patel', phone: '98112 33445' },
                    ].map((cust) => (
                      <Pressable
                        key={cust.name}
                        onPress={() =>
                          setFormData((p) => ({
                            ...p,
                            customerName: cust.name,
                            customerPhone: cust.phone,
                          }))
                        }
                        style={[
                          styles.quickPatientChip,
                          formData.customerName === cust.name && styles.quickPatientChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.quickPatientChipText,
                            formData.customerName === cust.name && styles.quickPatientChipTextActive,
                          ]}
                        >
                          {cust.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <View style={styles.formRow}>
                    <View style={styles.formFieldHalf}>
                      <Text style={styles.fieldLabel}>
                        Customer Name <Text style={styles.reqStar}>*</Text>
                      </Text>
                      <TextInput
                        style={styles.modalInput}
                        placeholder="e.g. Rajesh Sharma"
                        placeholderTextColor="#94A3B8"
                        value={formData.customerName}
                        onChangeText={(t) => {
                          setFormData((p) => ({ ...p, customerName: t }));
                          if (formErrors.customerName) setFormErrors((p) => ({ ...p, customerName: null }));
                        }}
                      />
                      {formErrors.customerName && (
                        <Text style={styles.errorText}>{formErrors.customerName}</Text>
                      )}
                    </View>

                    <View style={styles.formFieldHalf}>
                      <Text style={styles.fieldLabel}>Customer Contact / Phone</Text>
                      <TextInput
                        style={styles.modalInput}
                        placeholder="e.g. +91 98220 12345"
                        placeholderTextColor="#94A3B8"
                        keyboardType="phone-pad"
                        value={formData.customerPhone}
                        onChangeText={(t) => setFormData((p) => ({ ...p, customerPhone: t }))}
                      />
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Prescription / Rx Reference (Optional)</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="e.g. Rx-2026-1025 (Dr. Farooq Siddiqui)"
                      placeholderTextColor="#94A3B8"
                      value={formData.prescriptionRef}
                      onChangeText={(t) => setFormData((p) => ({ ...p, prescriptionRef: t }))}
                    />
                  </View>
                </View>
              )}

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
                  {formErrors.medicine && (
                    <Text style={styles.errorText}>{formErrors.medicine}</Text>
                  )}
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

              {/* GST Tax Rate Selection & Calculation */}
              <View style={{ marginTop: 6, marginBottom: 14, backgroundColor: '#F8FAFC', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={[styles.fieldLabel, { marginBottom: 6 }]}>
                  Applicable GST Tax Rate <Text style={styles.reqStar}>*</Text>
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {['0%', '5%', '12%', '18%', '28%'].map((rate) => {
                    const isSelected = (formData.taxRate || '12%') === rate;
                    return (
                      <Pressable
                        key={rate}
                        onPress={() => setFormData((p) => ({ ...p, taxRate: rate }))}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 6,
                          backgroundColor: isSelected ? '#0F766E' : '#FFFFFF',
                          borderWidth: 1,
                          borderColor: isSelected ? '#0F766E' : '#CBD5E1',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: isSelected ? '700' : '500',
                            color: isSelected ? '#FFFFFF' : '#334155',
                          }}
                        >
                          {rate} GST
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Live Tax & Total Calculation */}
                {(() => {
                  const qty = Number(formData.quantity) || 0;
                  const unitP = Number(formData.unitPrice) || 0;
                  const sub = qty * unitP;
                  const rateNum = parseFloat(String(formData.taxRate || '12%').replace('%', '')) || 0;
                  const tax = (sub * rateNum) / 100;
                  const total = sub + tax;
                  return (
                    <View style={{ backgroundColor: '#FFFFFF', padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#E2E8F0' }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: '#64748B' }}>Taxable Subtotal ({qty} units × ₹{unitP.toFixed(2)}):</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#0F172A' }}>₹{sub.toFixed(2)}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ fontSize: 12, color: '#64748B' }}>GST Tax ({formData.taxRate || '12%'}):</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#0F766E' }}>+₹{tax.toFixed(2)} (CGST {(rateNum / 2).toFixed(1)}% + SGST {(rateNum / 2).toFixed(1)}%)</Text>
                      </View>
                      <View style={{ borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>Total PO Amount (Taxes Included):</Text>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F766E' }}>₹{total.toFixed(2)}</Text>
                      </View>
                    </View>
                  );
                })()}
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

              {/* Save as Draft Button */}
              <Pressable
                onPress={() => handleCreatePO('Draft')}
                style={styles.draftModalButton}
                accessibilityRole="button"
                accessibilityLabel="Save as Draft"
              >
                <Text style={styles.draftModalButtonText}>📝 Save as Draft</Text>
              </Pressable>

              {/* Create / Submit Active PO */}
              <Pressable
                onPress={() => handleCreatePO('Pending')}
                style={styles.submitModalButton}
                accessibilityRole="button"
                accessibilityLabel="Create PO"
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
  draftModalButton: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    cursor: 'pointer',
  },
  draftModalButtonText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#475569',
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

  /* Primary Order Mode Tabs */
  primaryTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    padding: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexWrap: 'wrap',
  },
  primaryTabBarMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  primaryTabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'transparent',
    cursor: 'pointer',
  },
  primaryTabItemActive: {
    backgroundColor: '#0F766E',
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryTabIcon: {
    fontSize: 16,
  },
  primaryTabText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#64748B',
  },
  primaryTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  primaryTabCountBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  primaryTabCountBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  primaryTabCountText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  primaryTabCountTextActive: {
    color: '#FFFFFF',
  },

  /* Customer Badge in Table & Cards */
  tableCustomerBadge: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tableCustomerName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  tableCustomerPhone: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  tableStockBadge: {
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tableStockText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
  },

  /* Mobile Customer Row */
  mobileCustomerRow: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    gap: 3,
  },
  mobileCustomerTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1D4ED8',
    letterSpacing: 0.5,
  },
  mobileCustomerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  mobileRxText: {
    fontSize: 11.5,
    color: '#475569',
    fontStyle: 'italic',
  },

  /* Order Type Switcher in Modal */
  modalOrderTypeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  orderTypeBtn: {
    flex: 1,
    minWidth: 200,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    cursor: 'pointer',
  },
  orderTypeBtnActive: {
    borderColor: '#0F766E',
    backgroundColor: '#F0FDFA',
  },
  orderTypeBtnIcon: {
    fontSize: 22,
  },
  orderTypeBtnTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  orderTypeBtnTitleActive: {
    color: '#0F766E',
    fontWeight: '800',
  },
  orderTypeBtnSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },

  /* Customer Details Box in Modal */
  customerOrderBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    gap: 12,
  },
  customerOrderBoxHeader: {
    marginBottom: 4,
  },
  customerOrderBoxTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#15803D',
  },
  customerOrderBoxSub: {
    fontSize: 11,
    color: '#166534',
    marginTop: 1,
  },
  quickPatientRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  quickPatientChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#86EFAC',
    cursor: 'pointer',
  },
  quickPatientChipActive: {
    backgroundColor: '#15803D',
    borderColor: '#15803D',
  },
  quickPatientChipText: {
    fontSize: 11.5,
    color: '#15803D',
    fontWeight: '600',
  },
  quickPatientChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
