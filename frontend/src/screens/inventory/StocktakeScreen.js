import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, FlatList, StyleSheet, SafeAreaView, useWindowDimensions } from 'react-native';
import { SkeletonTableRow, SkeletonItemCard, SkeletonKpiCard } from '../../components/common/SkeletonLoader';
import PaginationControls from '../../components/common/PaginationControls';

const COLORS = {
  primary: '#0F766E',
  primaryHover: '#0D9488',
  primaryLight: '#CCFBF1',
  secondary: '#2563EB',
  secondaryLight: '#DBEAFE',
  success: '#16A34A',
  successLight: '#DCFCE7',
  warning: '#D97706',
  warningLight: '#FEF3C7',
  danger: '#DC2626',
  dangerLight: '#FEE2E2',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceHover: '#F1F5F9',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
};

const MOCK_STOCKTAKES = [
  { id: 'ST-2026-08', date: '29 Aug 2026', branch: 'Main Branch', itemsCounted: 48, totalItems: 156, discrepancies: 5, status: 'In Progress', createdBy: 'Admin' },
  { id: 'ST-2026-07', date: '20 Aug 2026', branch: 'BR-02', itemsCounted: 156, totalItems: 156, discrepancies: 12, status: 'Completed', createdBy: 'Manager' },
  { id: 'ST-2026-06', date: '15 Aug 2026', branch: 'Main Branch', itemsCounted: 156, totalItems: 156, discrepancies: 3, status: 'Completed', createdBy: 'Admin' },
  { id: 'ST-2026-05', date: '10 Aug 2026', branch: 'BR-03', itemsCounted: 156, totalItems: 156, discrepancies: 8, status: 'Completed', createdBy: 'Staff' },
  { id: 'ST-2026-04', date: '01 Aug 2026', branch: 'BR-04', itemsCounted: 156, totalItems: 156, discrepancies: 2, status: 'Completed', createdBy: 'Manager' },
  { id: 'ST-2026-03', date: '20 Jul 2026', branch: 'Main Branch', itemsCounted: 156, totalItems: 156, discrepancies: 15, status: 'Completed', createdBy: 'Admin' },
  { id: 'ST-2026-02', date: '10 Jul 2026', branch: 'BR-02', itemsCounted: 156, totalItems: 156, discrepancies: 6, status: 'Completed', createdBy: 'Admin' },
  { id: 'ST-2026-01', date: '01 Jul 2026', branch: 'Main Branch', itemsCounted: 156, totalItems: 156, discrepancies: 4, status: 'Completed', createdBy: 'Manager' },
  { id: 'ST-2026-C1', date: '15 Jun 2026', branch: 'BR-05', itemsCounted: 156, totalItems: 156, discrepancies: 9, status: 'Completed', createdBy: 'Staff' },
  { id: 'ST-2026-C2', date: '01 Jun 2026', branch: 'Main Branch', itemsCounted: 156, totalItems: 156, discrepancies: 7, status: 'Cancelled', createdBy: 'Admin' },
];

const MOCK_DETAIL = [
  { product: 'Paracetamol 500mg', batch: 'B-1001', systemQty: 205, countedQty: 200, variance: -5, status: 'Discrepancy' },
  { product: 'Amoxicillin 500mg', batch: 'B-2001', systemQty: 320, countedQty: 320, variance: 0, status: 'Matched' },
  { product: 'Metformin 500mg', batch: 'B-3001', systemQty: 752, countedQty: 750, variance: -2, status: 'Discrepancy' },
  { product: 'Atorvastatin 10mg', batch: 'B-4001', systemQty: 180, countedQty: 180, variance: 0, status: 'Matched' },
  { product: 'Omeprazole 20mg', batch: 'B-5001', systemQty: 95, countedQty: 98, variance: 3, status: 'Discrepancy' },
  { product: 'Cetirizine 10mg', batch: 'B-6001', systemQty: 440, countedQty: 440, variance: 0, status: 'Matched' },
  { product: 'Vitamin C 500mg', batch: 'B-7001', systemQty: 280, countedQty: 280, variance: 0, status: 'Matched' },
  { product: 'Ibuprofen 400mg', batch: 'B-8001', systemQty: 38, countedQty: 35, variance: -3, status: 'Discrepancy' },
  { product: 'Azithromycin 500mg', batch: 'B-9001', systemQty: 150, countedQty: 155, variance: 5, status: 'Discrepancy' },
  { product: 'Aspirin 75mg', batch: 'B-A001', systemQty: 400, countedQty: 400, variance: 0, status: 'Matched' },
];

export default function StocktakeScreen({ navigation, route }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [activeTab, setActiveTab] = useState('active');
  const [selectedStocktake, setSelectedStocktake] = useState(null);
  
  // Modal state
  const [showNewModal, setShowNewModal] = useState(false);
  const [modalBranch, setModalBranch] = useState('Main Branch');
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [modalNotes, setModalNotes] = useState('');
  const [modalCountType, setModalCountType] = useState('full');

  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const branches = ['Main Branch', 'BR-02', 'BR-03', 'BR-04', 'BR-05'];

  const getFilteredData = useCallback(() => {
    switch (activeTab) {
      case 'active':
        return MOCK_STOCKTAKES.filter(item => item.status === 'In Progress');
      case 'completed':
        return MOCK_STOCKTAKES.filter(item => item.status === 'Completed');
      case 'all':
      default:
        return MOCK_STOCKTAKES;
    }
  }, [activeTab]);

  const getStatusStyle = (status) => {
    switch (status) {
      case 'In Progress':
        return { bg: COLORS.secondaryLight, text: COLORS.secondary };
      case 'Completed':
      case 'Matched':
        return { bg: COLORS.successLight, text: COLORS.success };
      case 'Discrepancy':
        return { bg: COLORS.warningLight, text: COLORS.warning };
      case 'Cancelled':
        return { bg: COLORS.surfaceHover, text: COLORS.textSecondary };
      default:
        return { bg: COLORS.border, text: COLORS.textPrimary };
    }
  };

  const renderStocktakeItem = ({ item, index }) => {
    const isEven = index % 2 === 0;
    const statusStyle = getStatusStyle(item.status);

    return (
      <View style={[styles.tableRow, isEven ? styles.rowEven : styles.rowOdd]}>
        <Text style={[styles.cellText, { width: 120, color: COLORS.primary, fontWeight: 'bold' }]}>{item.id}</Text>
        <Text style={[styles.cellText, { width: 120 }]}>{item.date}</Text>
        <Text style={[styles.cellText, { width: 140 }]}>{item.branch}</Text>
        <Text style={[styles.cellText, { width: 140 }]}>{item.itemsCounted} / {item.totalItems}</Text>
        <Text style={[styles.cellText, { width: 120, color: item.discrepancies > 0 ? COLORS.danger : COLORS.textPrimary }]}>
          {item.discrepancies}
        </Text>
        <View style={[styles.badge, { backgroundColor: statusStyle.bg, width: 120 }]}>
          <Text style={[styles.badgeText, { color: statusStyle.text }]}>{item.status}</Text>
        </View>
        <Text style={[styles.cellText, { width: 120 }]}>{item.createdBy}</Text>
        <View style={{ width: 120, flexDirection: 'row' }}>
          <TouchableOpacity 
            style={[styles.actionButton, item.status === 'In Progress' ? styles.actionPrimary : styles.actionSecondary]}
            onPress={() => setSelectedStocktake(item)}
          >
            <Text style={[styles.actionButtonText, item.status === 'In Progress' ? styles.actionTextPrimary : styles.actionTextSecondary]}>
              {item.status === 'In Progress' ? 'Resume' : 'View'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderDetailItem = ({ item, index }) => {
    const isEven = index % 2 === 0;
    const statusStyle = getStatusStyle(item.status);

    return (
      <View style={[styles.tableRow, isEven ? styles.rowEven : styles.rowOdd]}>
        <Text style={[styles.cellText, { width: 200, fontWeight: '500' }]}>{item.product}</Text>
        <Text style={[styles.cellText, { width: 120 }]}>{item.batch}</Text>
        <Text style={[styles.cellText, { width: 120 }]}>{item.systemQty}</Text>
        <Text style={[styles.cellText, { width: 120 }]}>{item.countedQty}</Text>
        <Text style={[styles.cellText, { width: 100, color: item.variance !== 0 ? COLORS.danger : COLORS.success, fontWeight: 'bold' }]}>
          {item.variance > 0 ? `+${item.variance}` : item.variance}
        </Text>
        <View style={[styles.badge, { backgroundColor: statusStyle.bg, width: 120 }]}>
          <Text style={[styles.badgeText, { color: statusStyle.text }]}>{item.status}</Text>
        </View>
        <View style={{ width: 120 }}>
          {item.status === 'Discrepancy' && (
            <TouchableOpacity style={styles.actionWarning}>
              <Text style={styles.actionTextWarning}>Recount</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Physical Stocktake</Text>
          <Text style={styles.headerSubtitle}>Reconcile recorded inventory with actual physical stock counts</Text>
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={() => setShowNewModal(true)}>
          <Text style={styles.primaryButtonText}>+ New Stocktake</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* KPI Cards */}
        <View style={[styles.kpiRow, isMobile && styles.kpiRowMobile]}>
          <View style={[styles.kpiCard, isMobile && styles.kpiCardMobile]}>
            <Text style={styles.kpiLabel}>Total Stocktakes</Text>
            <Text style={styles.kpiValue}>10</Text>
            <Text style={styles.kpiSubtext}>All time records</Text>
          </View>
          <View style={[styles.kpiCard, isMobile && styles.kpiCardMobile]}>
            <Text style={styles.kpiLabel}>Active Audits</Text>
            <Text style={[styles.kpiValue, { color: COLORS.secondary }]}>1</Text>
            <Text style={styles.kpiSubtext}>Currently in progress</Text>
          </View>
          <View style={[styles.kpiCard, isMobile && styles.kpiCardMobile]}>
            <Text style={styles.kpiLabel}>Completed</Text>
            <Text style={[styles.kpiValue, { color: COLORS.success }]}>8</Text>
            <Text style={styles.kpiSubtext}>Reconciled audits</Text>
          </View>
          <View style={[styles.kpiCard, isMobile && styles.kpiCardMobile]}>
            <Text style={styles.kpiLabel}>Avg Discrepancy</Text>
            <Text style={[styles.kpiValue, { color: COLORS.warning }]}>6.9</Text>
            <Text style={styles.kpiSubtext}>Items per session</Text>
          </View>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'active' && styles.tabActive]} 
            onPress={() => setActiveTab('active')}
          >
            <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>Active Stocktakes (1)</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'all' && styles.tabActive]} 
            onPress={() => setActiveTab('all')}
          >
            <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>All Stocktakes</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'completed' && styles.tabActive]} 
            onPress={() => setActiveTab('completed')}
          >
            <Text style={[styles.tabText, activeTab === 'completed' && styles.tabTextActive]}>Completed (8)</Text>
          </TouchableOpacity>
        </View>

        {/* Main Table / Mobile Cards */}
        {isMobile ? (
          <View style={styles.mobileCardList}>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <SkeletonItemCard key={i} />)
            ) : (
              getFilteredData().slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((item) => {
                const statusStyle = getStatusStyle(item.status);
                return (
                  <View key={item.id} style={styles.mobileCard}>
                    <View style={styles.mobileCardHeader}>
                      <View>
                        <Text style={styles.mobileCardId}>{item.id}</Text>
                        <Text style={styles.mobileCardBranch}>{item.branch}</Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
                        <Text style={[styles.badgeText, { color: statusStyle.text }]}>{item.status}</Text>
                      </View>
                    </View>

                    <View style={styles.mobileGrid}>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Date</Text>
                        <Text style={styles.mobileVal}>{item.date}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Count Progress</Text>
                        <Text style={styles.mobileValBold}>{item.itemsCounted} / {item.totalItems}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Discrepancies</Text>
                        <Text style={[styles.mobileValBold, { color: item.discrepancies > 0 ? COLORS.danger : COLORS.success }]}>
                          {item.discrepancies} items
                        </Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Created By</Text>
                        <Text style={styles.mobileVal}>{item.createdBy}</Text>
                      </View>
                    </View>

                    <View style={styles.mobileCardFooter}>
                      <TouchableOpacity
                        style={[styles.mobileActionBtn, item.status === 'In Progress' ? styles.actionPrimary : styles.actionSecondary]}
                        onPress={() => setSelectedStocktake(item)}
                      >
                        <Text style={[styles.actionButtonText, item.status === 'In Progress' ? styles.actionTextPrimary : styles.actionTextSecondary]}>
                          {item.status === 'In Progress' ? 'Resume Stocktake →' : 'View Audit Details'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          <View style={styles.card}>
            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View>
                <View style={styles.tableHeader}>
                  <Text style={[styles.columnHeader, { width: 120 }]}>Stocktake ID</Text>
                  <Text style={[styles.columnHeader, { width: 120 }]}>Date</Text>
                  <Text style={[styles.columnHeader, { width: 140 }]}>Branch</Text>
                  <Text style={[styles.columnHeader, { width: 140 }]}>Items Counted</Text>
                  <Text style={[styles.columnHeader, { width: 120 }]}>Discrepancies</Text>
                  <Text style={[styles.columnHeader, { width: 140 }]}>Status</Text>
                  <Text style={[styles.columnHeader, { width: 120 }]}>Created By</Text>
                  <Text style={[styles.columnHeader, { width: 120 }]}>Actions</Text>
                </View>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonTableRow key={i} columns={8} />
                  ))
                ) : (
                  <FlatList
                    data={getFilteredData().slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)}
                    keyExtractor={(item) => item.id}
                    renderItem={renderStocktakeItem}
                    scrollEnabled={false}
                  />
                )}
              </View>
            </ScrollView>
          </View>
        )}
        
        <PaginationControls 
          currentPage={currentPage}
          totalPages={Math.ceil(getFilteredData().length / itemsPerPage)}
          onPageChange={setCurrentPage}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={setItemsPerPage}
        />

        {/* Detail Panel */}
        {selectedStocktake && (
          <View style={styles.detailPanel}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Stocktake Details — {selectedStocktake.id}</Text>
              <TouchableOpacity onPress={() => setSelectedStocktake(null)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {isMobile ? (
              <View style={styles.mobileCardList}>
                {(selectedStocktake.items || MOCK_DETAIL).map((item, index) => {
                  const statusStyle = getStatusStyle(item.status);
                  return (
                    <View key={`${item.product}-${index}`} style={styles.mobileCard}>
                      <View style={styles.mobileCardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.mobileCardId}>{item.product}</Text>
                          <Text style={styles.mobileCardBranch}>Batch: {item.batch}</Text>
                        </View>
                        <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
                          <Text style={[styles.badgeText, { color: statusStyle.text }]}>{item.status}</Text>
                        </View>
                      </View>

                      <View style={styles.mobileGrid}>
                        <View style={styles.mobileGridCol}>
                          <Text style={styles.mobileLabel}>System Qty</Text>
                          <Text style={styles.mobileVal}>{item.systemQty}</Text>
                        </View>
                        <View style={styles.mobileGridCol}>
                          <Text style={styles.mobileLabel}>Counted Qty</Text>
                          <Text style={styles.mobileValBold}>{item.countedQty}</Text>
                        </View>
                        <View style={styles.mobileGridCol}>
                          <Text style={styles.mobileLabel}>Variance</Text>
                          <Text style={[styles.mobileValBold, { color: item.variance !== 0 ? COLORS.danger : COLORS.success }]}>
                            {item.variance > 0 ? `+${item.variance}` : item.variance}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.columnHeader, { width: 200 }]}>Product</Text>
                    <Text style={[styles.columnHeader, { width: 120 }]}>Batch</Text>
                    <Text style={[styles.columnHeader, { width: 120 }]}>System Qty</Text>
                    <Text style={[styles.columnHeader, { width: 120 }]}>Counted Qty</Text>
                    <Text style={[styles.columnHeader, { width: 100 }]}>Variance</Text>
                    <Text style={[styles.columnHeader, { width: 140 }]}>Status</Text>
                    <Text style={[styles.columnHeader, { width: 120 }]}>Actions</Text>
                  </View>
                  <FlatList
                    data={selectedStocktake.items || MOCK_DETAIL}
                    keyExtractor={(item, index) => `${item.product}-${index}`}
                    renderItem={renderDetailItem}
                    scrollEnabled={false}
                  />
                </View>
              </ScrollView>
            )}
          </View>
        )}
      </ScrollView>

      {/* New Stocktake Modal */}
      <Modal
        visible={showNewModal}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Stocktake</Text>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Branch</Text>
              <TouchableOpacity 
                style={styles.dropdownButton}
                onPress={() => setShowBranchDropdown(!showBranchDropdown)}
              >
                <Text style={styles.dropdownText}>{modalBranch}</Text>
                <Text style={styles.dropdownIcon}>▼</Text>
              </TouchableOpacity>
              
              {showBranchDropdown && (
                <View style={styles.dropdownMenu}>
                  {branches.map((branch) => (
                    <TouchableOpacity 
                      key={branch}
                      style={styles.dropdownItem}
                      onPress={() => {
                        setModalBranch(branch);
                        setShowBranchDropdown(false);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>{branch}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="Optional notes for this stocktake"
                value={modalNotes}
                onChangeText={setModalNotes}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Count Type</Text>
              <View style={styles.toggleGroup}>
                <TouchableOpacity 
                  style={[styles.toggleButton, modalCountType === 'full' && styles.toggleButtonActive]}
                  onPress={() => setModalCountType('full')}
                >
                  <Text style={[styles.toggleButtonText, modalCountType === 'full' && styles.toggleButtonTextActive]}>Full Count</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.toggleButton, modalCountType === 'spot' && styles.toggleButtonActive]}
                  onPress={() => setModalCountType('spot')}
                >
                  <Text style={[styles.toggleButtonText, modalCountType === 'spot' && styles.toggleButtonTextActive]}>Spot Check</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoBoxText}>Products from this branch will be loaded automatically</Text>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={() => setShowNewModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.primaryButton}
                onPress={() => {
                  // Handle creation logic here
                  setShowNewModal(false);
                }}
              >
                <Text style={styles.primaryButtonText}>Create Stocktake</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  kpiRowMobile: {
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: COLORS.surface,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  kpiCardMobile: {
    minWidth: '47%',
    maxWidth: '48.5%',
    padding: 12,
  },
  kpiLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginVertical: 3,
  },
  kpiSubtext: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 16,
  },
  /* Mobile Card Styles */
  mobileCardList: {
    gap: 12,
    marginBottom: 20,
  },
  mobileCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  mobileCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceHover,
  },
  mobileCardId: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  mobileCardBranch: {
    fontSize: 12.5,
    color: COLORS.textSecondary,
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
  mobileLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  mobileVal: {
    fontSize: 12.5,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  mobileValBold: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 1,
  },
  mobileCardFooter: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceHover,
  },
  mobileActionBtn: {
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  actionPrimary: {
    backgroundColor: COLORS.primaryLight,
  },
  actionSecondary: {
    backgroundColor: COLORS.surfaceHover,
  },
  actionTextPrimary: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 12.5,
  },
  actionTextSecondary: {
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: 12.5,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  activeBanner: {
    backgroundColor: COLORS.secondaryLight,
    padding: 16,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  activeBannerText: {
    color: COLORS.secondary,
    fontWeight: '600',
    fontSize: 14,
  },
  bannerButton: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.secondary,
  },
  bannerButtonText: {
    color: COLORS.secondary,
    fontWeight: '600',
    fontSize: 12,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 20,
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceHover,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  columnHeader: {
    padding: 16,
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    alignItems: 'center',
  },
  rowEven: {
    backgroundColor: COLORS.surface,
  },
  rowOdd: {
    backgroundColor: COLORS.background,
  },
  cell: {
    padding: 16,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionText: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  detailPanel: {
    marginTop: 24,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 18,
    color: COLORS.textSecondary,
    fontWeight: 'bold',
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
  },
  primaryButtonText: {
    color: COLORS.surface,
    fontWeight: '600',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxWidth: 500,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 16,
    zIndex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 12,
    backgroundColor: COLORS.surface,
  },
  dropdownText: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  dropdownIcon: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceHover,
  },
  dropdownItemText: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  textArea: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    color: COLORS.textPrimary,
    textAlignVertical: 'top',
    backgroundColor: COLORS.surface,
  },
  toggleGroup: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: COLORS.surfaceHover,
  },
  toggleButtonActive: {
    backgroundColor: COLORS.primaryLight,
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  toggleButtonTextActive: {
    color: COLORS.primaryHover,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 6,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.textMuted,
  },
  infoBoxText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
});
