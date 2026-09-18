import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView, useWindowDimensions } from 'react-native';
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

const MOCK_MOVEMENTS = [];

export default function StockMovementHistoryScreen({ navigation, route }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [movementType, setMovementType] = useState('All');
  const [branchFilter, setBranchFilter] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [userFilter, setUserFilter] = useState('All');

  const [activeDropdown, setActiveDropdown] = useState(null); // 'type', 'branch', 'user'

  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const typeOptions = ['All', 'Purchase', 'Sale', 'Transfer', 'Adjustment', 'Return', 'Stocktake'];
  const branchOptions = ['All', 'Main Branch', 'BR-02', 'BR-03', 'BR-04', 'BR-05'];
  const userOptions = ['All', 'Admin', 'Manager', 'Staff'];

  const filteredData = useMemo(() => {
    return MOCK_MOVEMENTS.filter((item) => {
      const matchSearch = 
        item.product.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.batch.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchType = movementType === 'All' || item.type === movementType;
      const matchBranch = branchFilter === 'All' || item.branch === branchFilter;
      const matchUser = userFilter === 'All' || item.user === userFilter;

      return matchSearch && matchType && matchBranch && matchUser;
    });
  }, [searchQuery, movementType, branchFilter, userFilter]);

  const clearFilters = () => {
    setSearchQuery('');
    setMovementType('All');
    setBranchFilter('All');
    setFromDate('');
    setToDate('');
    setUserFilter('All');
    setActiveDropdown(null);
  };

  const toggleDropdown = (type) => {
    setActiveDropdown(activeDropdown === type ? null : type);
  };

  const renderBadge = (type) => {
    let bgColor = COLORS.background;
    let textColor = COLORS.textSecondary;

    switch (type) {
      case 'Purchase':
        bgColor = COLORS.successLight;
        textColor = COLORS.success;
        break;
      case 'Sale':
        bgColor = COLORS.secondaryLight;
        textColor = COLORS.secondary;
        break;
      case 'Transfer':
        bgColor = '#EDE9FE';
        textColor = '#7C3AED';
        break;
      case 'Adjustment':
        bgColor = COLORS.warningLight;
        textColor = COLORS.warning;
        break;
      case 'Return':
        bgColor = COLORS.primaryLight;
        textColor = COLORS.primary;
        break;
      case 'Stocktake':
        bgColor = COLORS.surfaceHover;
        textColor = COLORS.textSecondary;
        break;
    }

    return (
      <View style={[styles.badge, { backgroundColor: bgColor }]}>
        <Text style={[styles.badgeText, { color: textColor }]}>{type}</Text>
      </View>
    );
  };

  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Stock Movement History</Text>
          <Text style={styles.headerSubtitle}>Complete audit trail of all inventory movements</Text>
        </View>
        <TouchableOpacity style={styles.exportBtn}>
          <Text style={styles.exportBtnText}>⬇ Export</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {/* Filters */}
        <View style={styles.filterCard}>
          <View style={[styles.filterRow, isMobile && styles.filterRowMobile]}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Search product, reference or batch..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor={COLORS.textMuted}
            />
            
            <View style={[styles.dropdownContainer, isMobile && { width: '100%' }]}>
              <TouchableOpacity style={styles.dropdownBtn} onPress={() => toggleDropdown('type')}>
                <Text style={styles.dropdownBtnText}>{movementType}</Text>
                <Text style={styles.dropdownBtnIcon}>▾</Text>
              </TouchableOpacity>
              {activeDropdown === 'type' && (
                <View style={styles.dropdownList}>
                  {typeOptions.map(opt => (
                    <TouchableOpacity key={opt} style={styles.dropdownItem} onPress={() => { setMovementType(opt); setActiveDropdown(null); }}>
                      <Text style={styles.dropdownItemText}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={[styles.dropdownContainer, isMobile && { width: '100%' }]}>
              <TouchableOpacity style={styles.dropdownBtn} onPress={() => toggleDropdown('branch')}>
                <Text style={styles.dropdownBtnText}>{branchFilter}</Text>
                <Text style={styles.dropdownBtnIcon}>▾</Text>
              </TouchableOpacity>
              {activeDropdown === 'branch' && (
                <View style={styles.dropdownList}>
                  {branchOptions.map(opt => (
                    <TouchableOpacity key={opt} style={styles.dropdownItem} onPress={() => { setBranchFilter(opt); setActiveDropdown(null); }}>
                      <Text style={styles.dropdownItemText}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          <View style={[styles.filterRow, isMobile && styles.filterRowMobile, { marginTop: 12 }]}>
            <TextInput
              style={[styles.input, isMobile && { width: '100%' }]}
              placeholder="From Date"
              value={fromDate}
              onChangeText={setFromDate}
              placeholderTextColor={COLORS.textMuted}
            />
            <TextInput
              style={[styles.input, isMobile && { width: '100%' }]}
              placeholder="To Date"
              value={toDate}
              onChangeText={setToDate}
              placeholderTextColor={COLORS.textMuted}
            />

            <View style={[styles.dropdownContainer, isMobile && { width: '100%' }]}>
              <TouchableOpacity style={styles.dropdownBtn} onPress={() => toggleDropdown('user')}>
                <Text style={styles.dropdownBtnText}>{userFilter}</Text>
                <Text style={styles.dropdownBtnIcon}>▾</Text>
              </TouchableOpacity>
              {activeDropdown === 'user' && (
                <View style={styles.dropdownList}>
                  {userOptions.map(opt => (
                    <TouchableOpacity key={opt} style={styles.dropdownItem} onPress={() => { setUserFilter(opt); setActiveDropdown(null); }}>
                      <Text style={styles.dropdownItemText}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.clearBtn} onPress={clearFilters}>
              <Text style={styles.clearBtnText}>Clear Filters</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Summary Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsContainer}>
          <View style={[styles.chip, { backgroundColor: COLORS.surfaceHover }]}>
            <Text style={[styles.chipLabel, { color: COLORS.textSecondary }]}>Total Movements</Text>
            <Text style={[styles.chipValue, { color: COLORS.textPrimary }]}>1,842</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: COLORS.successLight }]}>
            <Text style={[styles.chipLabel, { color: COLORS.success }]}>Purchases</Text>
            <Text style={[styles.chipValue, { color: COLORS.success }]}>420</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: COLORS.secondaryLight }]}>
            <Text style={[styles.chipLabel, { color: COLORS.secondary }]}>Sales</Text>
            <Text style={[styles.chipValue, { color: COLORS.secondary }]}>890</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: COLORS.warningLight }]}>
            <Text style={[styles.chipLabel, { color: COLORS.warning }]}>Adjustments</Text>
            <Text style={[styles.chipValue, { color: COLORS.warning }]}>156</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: '#EDE9FE' }]}>
            <Text style={[styles.chipLabel, { color: '#7C3AED' }]}>Transfers</Text>
            <Text style={[styles.chipValue, { color: '#7C3AED' }]}>248</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: COLORS.primaryLight }]}>
            <Text style={[styles.chipLabel, { color: COLORS.primary }]}>Returns</Text>
            <Text style={[styles.chipValue, { color: COLORS.primary }]}>128</Text>
          </View>
        </ScrollView>

        {/* Data Table / Mobile Movement Cards */}
        {isMobile ? (
          <View style={styles.mobileCardList}>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <SkeletonItemCard key={i} />
              ))
            ) : filteredData.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No movements found matching filters.</Text>
              </View>
            ) : (
              filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((item) => (
                <View key={item.id} style={styles.mobileMovementCard}>
                  <View style={styles.mobileCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mobileProductTitle}>{item.product}</Text>
                      <Text style={styles.mobileBatchText}>Batch: {item.batch}</Text>
                    </View>
                    {renderBadge(item.type)}
                  </View>

                  <View style={styles.mobileGrid}>
                    <View style={styles.mobileGridCol}>
                      <Text style={styles.mobileLabel}>Date</Text>
                      <Text style={styles.mobileVal}>{item.date}</Text>
                    </View>
                    <View style={styles.mobileGridCol}>
                      <Text style={styles.mobileLabel}>Quantity</Text>
                      <Text style={[styles.mobileValBold, { color: item.quantity > 0 ? COLORS.success : item.quantity < 0 ? COLORS.danger : COLORS.textSecondary }]}>
                        {item.quantity > 0 ? `+${item.quantity}` : item.quantity} units
                      </Text>
                    </View>
                    <View style={styles.mobileGridCol}>
                      <Text style={styles.mobileLabel}>Reference</Text>
                      <Text style={[styles.mobileValBold, { color: COLORS.primary }]}>{item.reference}</Text>
                    </View>
                    <View style={styles.mobileGridCol}>
                      <Text style={styles.mobileLabel}>Branch & User</Text>
                      <Text style={styles.mobileVal}>{item.branch} • {item.user}</Text>
                    </View>
                    <View style={styles.mobileGridColFull}>
                      <Text style={styles.mobileLabel}>Reason</Text>
                      <Text style={styles.mobileVal}>{item.reason}</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : (
          <View style={styles.tableCard}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                {/* Table Header */}
                <View style={styles.tableHeader}>
                  <Text style={[styles.colHeader, { width: 110 }]}>Date</Text>
                  <Text style={[styles.colHeader, { width: 120 }]}>Movement Type</Text>
                  <Text style={[styles.colHeader, { width: 180 }]}>Product</Text>
                  <Text style={[styles.colHeader, { width: 100 }]}>Batch</Text>
                  <Text style={[styles.colHeader, { width: 90 }]}>Quantity</Text>
                  <Text style={[styles.colHeader, { width: 110 }]}>Reference</Text>
                  <Text style={[styles.colHeader, { width: 120 }]}>Branch</Text>
                  <Text style={[styles.colHeader, { width: 90 }]}>User</Text>
                  <Text style={[styles.colHeader, { width: 200 }]}>Reason/Notes</Text>
                </View>

                {/* Table Body */}
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonTableRow key={i} columns={9} />
                  ))
                ) : filteredData.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>No movements found matching filters.</Text>
                  </View>
                ) : (
                  filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((item, index) => (
                    <View key={item.id} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
                      <Text style={[styles.cellText, { width: 110 }]}>{item.date}</Text>
                      <View style={[styles.cellContent, { width: 120 }]}>
                        {renderBadge(item.type)}
                      </View>
                      <Text style={[styles.cellText, { width: 180, fontWeight: '500' }]}>{item.product}</Text>
                      <Text style={[styles.cellText, { width: 100 }]}>{item.batch}</Text>
                      <Text style={[styles.cellText, { width: 90, color: item.quantity > 0 ? COLORS.success : item.quantity < 0 ? COLORS.danger : COLORS.textSecondary, fontWeight: '600' }]}>
                        {item.quantity > 0 ? `+${item.quantity}` : item.quantity}
                      </Text>
                      <Text style={[styles.cellText, styles.referenceLink, { width: 110 }]}>{item.reference}</Text>
                      <Text style={[styles.cellText, { width: 120 }]}>{item.branch}</Text>
                      <Text style={[styles.cellText, { width: 90 }]}>{item.user}</Text>
                      <Text style={[styles.cellText, { width: 200 }]} numberOfLines={1}>{item.reason}</Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          </View>
        )}
        
        <PaginationControls 
          currentPage={currentPage}
          totalPages={Math.ceil(filteredData.length / itemsPerPage)}
          onPageChange={setCurrentPage}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={setItemsPerPage}
        />

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  exportBtn: {
    backgroundColor: COLORS.secondaryLight,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  exportBtnText: {
    color: COLORS.secondary,
    fontWeight: '600',
    fontSize: 14,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  filterCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 20,
    zIndex: 10,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    zIndex: 1,
  },
  filterRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
  },
  /* Mobile Movement Card Styles */
  mobileCardList: {
    gap: 12,
    marginBottom: 20,
  },
  mobileMovementCard: {
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
    gap: 8,
  },
  mobileProductTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  mobileBatchText: {
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
  mobileGridColFull: {
    width: '100%',
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
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 14,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.background,
  },
  dropdownContainer: {
    position: 'relative',
    width: 150,
  },
  dropdownBtn: {
    height: 40,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  dropdownBtnText: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  dropdownBtnIcon: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  dropdownList: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 5,
    zIndex: 100,
  },
  dropdownItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  dropdownItemText: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  clearBtnText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '500',
  },
  chipsContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 12,
    minWidth: 120,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  chipValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  tableCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    zIndex: 1,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surfaceHover,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  colHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    paddingRight: 16,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  tableRowAlt: {
    backgroundColor: '#FAFAFA',
  },
  cellText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    paddingRight: 16,
  },
  cellContent: {
    paddingRight: 16,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  referenceLink: {
    color: COLORS.primary,
    fontWeight: '500',
  },
  emptyState: {
    padding: 30,
    alignItems: 'center',
  },
  emptyStateText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  pagination: {
    marginTop: 16,
    marginBottom: 40,
    alignItems: 'center',
  },
  paginationText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
});
