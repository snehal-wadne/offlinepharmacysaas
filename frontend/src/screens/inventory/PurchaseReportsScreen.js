import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView } from 'react-native';

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

const REPORT_TYPES = [
  { id: 'purchase_summary', icon: '📊', title: 'Purchase Summary', description: 'Overview of all purchases in the period' },
  { id: 'supplier_purchases', icon: '🏭', title: 'Supplier Purchases', description: 'Purchase breakdown by supplier' },
  { id: 'purchase_value', icon: '💰', title: 'Purchase Value', description: 'Total purchase value analysis' },
  { id: 'pending_orders', icon: '⏳', title: 'Pending Orders', description: 'Outstanding purchase orders' },
  { id: 'goods_received', icon: '📥', title: 'Goods Received', description: 'Goods receiving note history' },
  { id: 'purchase_returns', icon: '↩️', title: 'Purchase Returns', description: 'Returns to suppliers' },
];

const MOCK_PO_DATA = [
  { id: 'PO-1025', date: '29 Aug 2026', supplier: 'PharmaCo', items: 5, amount: '₹12,450', status: 'Received', branch: 'Main Branch' },
  { id: 'PO-1024', date: '28 Aug 2026', supplier: 'NutriLife', items: 3, amount: '₹8,200', status: 'Received', branch: 'BR-03' },
  { id: 'PO-1023', date: '27 Aug 2026', supplier: 'CareSupply', items: 8, amount: '₹15,800', status: 'Pending', branch: 'Main Branch' },
  { id: 'PO-1022', date: '25 Aug 2026', supplier: 'GenSupply', items: 2, amount: '₹6,400', status: 'Received', branch: 'BR-04' },
  { id: 'PO-1021', date: '24 Aug 2026', supplier: 'PharmaCo', items: 4, amount: '₹9,800', status: 'Pending', branch: 'BR-02' },
  { id: 'PO-1020', date: '22 Aug 2026', supplier: 'MedLife', items: 6, amount: '₹18,200', status: 'Received', branch: 'Main Branch' },
  { id: 'PO-1019', date: '20 Aug 2026', supplier: 'NutriLife', items: 2, amount: '₹5,600', status: 'Partially Received', branch: 'BR-03' },
  { id: 'PO-1018', date: '18 Aug 2026', supplier: 'CareSupply', items: 7, amount: '₹14,300', status: 'Received', branch: 'Main Branch' },
  { id: 'PO-1017', date: '15 Aug 2026', supplier: 'GenSupply', items: 3, amount: '₹7,100', status: 'Cancelled', branch: 'BR-05' },
  { id: 'PO-1016', date: '12 Aug 2026', supplier: 'PharmaCo', items: 5, amount: '₹11,600', status: 'Received', branch: 'Main Branch' },
];

export default function PurchaseReportsScreen({ navigation, route }) {
  const [selectedReport, setSelectedReport] = useState('purchase_summary');
  const [quickRange, setQuickRange] = useState('this_month');
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    branch: 'All Branches',
    supplier: 'All Suppliers',
    status: 'All Status'
  });
  
  const [openDropdown, setOpenDropdown] = useState(null);

  const BRANCH_OPTIONS = ['All Branches', 'Main Branch', 'BR-02', 'BR-03', 'BR-04', 'BR-05'];
  const SUPPLIER_OPTIONS = ['All Suppliers', 'PharmaCo', 'NutriLife', 'CareSupply', 'GenSupply', 'MedLife'];
  const STATUS_OPTIONS = ['All Status', 'Received', 'Pending', 'Partially Received', 'Cancelled'];
  const QUICK_RANGES = [
    { id: 'today', label: 'Today' },
    { id: 'this_week', label: 'This Week' },
    { id: 'this_month', label: 'This Month' },
    { id: 'last_month', label: 'Last Month' },
    { id: 'custom', label: 'Custom' },
  ];

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setOpenDropdown(null);
  };

  const toggleDropdown = (dropdownName) => {
    setOpenDropdown(openDropdown === dropdownName ? null : dropdownName);
  };

  const renderDropdown = (options, filterKey) => {
    if (openDropdown !== filterKey) return null;
    
    return (
      <View style={styles.dropdownContainer}>
        <ScrollView style={styles.dropdownScroll} nestedScrollEnabled={true}>
          {options.map((option, index) => (
            <TouchableOpacity 
              key={index} 
              style={[
                styles.dropdownOption,
                filters[filterKey] === option && styles.dropdownOptionSelected
              ]}
              onPress={() => handleFilterChange(filterKey, option)}
            >
              <Text style={[
                styles.dropdownOptionText,
                filters[filterKey] === option && styles.dropdownOptionTextSelected
              ]}>
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const getStatusStyle = (status) => {
    switch(status) {
      case 'Received': return { bg: COLORS.successLight, text: COLORS.success };
      case 'Pending': return { bg: COLORS.warningLight, text: COLORS.warning };
      case 'Partially Received': return { bg: COLORS.secondaryLight, text: COLORS.secondary };
      case 'Cancelled': return { bg: COLORS.dangerLight, text: COLORS.danger };
      default: return { bg: COLORS.border, text: COLORS.textSecondary };
    }
  };

  const activeReport = REPORT_TYPES.find(r => r.id === selectedReport);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Purchase Reports</Text>
            <Text style={styles.headerSubtitle}>Track and analyze purchase transactions</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.headerExportButton}>
          <Text style={styles.headerExportText}>⬇ Export</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
        {/* REPORT TYPE SELECTOR */}
        <View style={styles.sectionContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll} contentContainerStyle={styles.horizontalScrollContent}>
            {REPORT_TYPES.map((report) => {
              const isSelected = selectedReport === report.id;
              return (
                <TouchableOpacity
                  key={report.id}
                  style={[styles.reportCard, isSelected && styles.reportCardSelected]}
                  onPress={() => setSelectedReport(report.id)}
                >
                  <Text style={styles.reportIcon}>{report.icon}</Text>
                  <Text style={[styles.reportCardTitle, isSelected && styles.reportCardTitleSelected]} numberOfLines={1}>{report.title}</Text>
                  <Text style={styles.reportCardDesc} numberOfLines={2}>{report.description}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* FILTERS SECTION */}
        <View style={[styles.card, { zIndex: 1000 }]}>
          <Text style={styles.cardTitle}>Filters</Text>
          
          <View style={styles.quickRangeContainer}>
            {QUICK_RANGES.map(range => (
              <TouchableOpacity
                key={range.id}
                style={[styles.quickRangeButton, quickRange === range.id && styles.quickRangeButtonActive]}
                onPress={() => setQuickRange(range.id)}
              >
                <Text style={[styles.quickRangeText, quickRange === range.id && styles.quickRangeTextActive]}>
                  {range.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {quickRange === 'custom' && (
            <View style={styles.customDateContainer}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>From Date</Text>
                <TextInput
                  style={styles.input}
                  placeholder="DD/MM/YYYY"
                  value={filters.dateFrom}
                  onChangeText={(val) => handleFilterChange('dateFrom', val)}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>To Date</Text>
                <TextInput
                  style={styles.input}
                  placeholder="DD/MM/YYYY"
                  value={filters.dateTo}
                  onChangeText={(val) => handleFilterChange('dateTo', val)}
                />
              </View>
            </View>
          )}

          <View style={styles.dropdownsRow}>
            {/* Branch Dropdown */}
            <View style={styles.dropdownWrapper}>
              <Text style={styles.inputLabel}>Branch</Text>
              <TouchableOpacity style={styles.dropdownButton} onPress={() => toggleDropdown('branch')}>
                <Text style={styles.dropdownButtonText} numberOfLines={1}>{filters.branch}</Text>
                <Text style={styles.dropdownIcon}>▾</Text>
              </TouchableOpacity>
              {renderDropdown(BRANCH_OPTIONS, 'branch')}
            </View>

            {/* Supplier Dropdown */}
            <View style={styles.dropdownWrapper}>
              <Text style={styles.inputLabel}>Supplier</Text>
              <TouchableOpacity style={styles.dropdownButton} onPress={() => toggleDropdown('supplier')}>
                <Text style={styles.dropdownButtonText} numberOfLines={1}>{filters.supplier}</Text>
                <Text style={styles.dropdownIcon}>▾</Text>
              </TouchableOpacity>
              {renderDropdown(SUPPLIER_OPTIONS, 'supplier')}
            </View>

            {/* Status Dropdown */}
            <View style={styles.dropdownWrapper}>
              <Text style={styles.inputLabel}>Status</Text>
              <TouchableOpacity style={styles.dropdownButton} onPress={() => toggleDropdown('status')}>
                <Text style={styles.dropdownButtonText} numberOfLines={1}>{filters.status}</Text>
                <Text style={styles.dropdownIcon}>▾</Text>
              </TouchableOpacity>
              {renderDropdown(STATUS_OPTIONS, 'status')}
            </View>
          </View>
        </View>

        {/* PREVIEW/REPORT SECTION */}
        <View style={[styles.card, { zIndex: 1 }]}>
          <Text style={styles.cardTitle}>Preview — {activeReport?.title}</Text>

          {selectedReport === 'purchase_summary' ? (
            <View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kpiContainer} contentContainerStyle={styles.kpiContent}>
                <View style={[styles.kpiCard, { borderLeftColor: COLORS.primary, borderLeftWidth: 4 }]}>
                  <Text style={styles.kpiLabel}>Total Purchases</Text>
                  <Text style={[styles.kpiValue, { color: COLORS.primary }]}>₹4,28,500</Text>
                </View>
                <View style={[styles.kpiCard, { borderLeftColor: COLORS.secondary, borderLeftWidth: 4 }]}>
                  <Text style={styles.kpiLabel}>Total Orders</Text>
                  <Text style={[styles.kpiValue, { color: COLORS.secondary }]}>48</Text>
                </View>
                <View style={[styles.kpiCard, { borderLeftColor: COLORS.success, borderLeftWidth: 4 }]}>
                  <Text style={styles.kpiLabel}>Avg Order Value</Text>
                  <Text style={[styles.kpiValue, { color: COLORS.success }]}>₹8,927</Text>
                </View>
                <View style={[styles.kpiCard, { borderLeftColor: COLORS.warning, borderLeftWidth: 4 }]}>
                  <Text style={styles.kpiLabel}>Pending</Text>
                  <Text style={[styles.kpiValue, { color: COLORS.warning }]}>12</Text>
                </View>
              </ScrollView>

              <View style={styles.tableContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                  <View>
                    <View style={styles.tableHeader}>
                      <Text style={[styles.tableHeaderText, { width: 110 }]}>PO ID</Text>
                      <Text style={[styles.tableHeaderText, { width: 110 }]}>Date</Text>
                      <Text style={[styles.tableHeaderText, { width: 130 }]}>Supplier</Text>
                      <Text style={[styles.tableHeaderText, { width: 70 }]}>Items</Text>
                      <Text style={[styles.tableHeaderText, { width: 110 }]}>Amount</Text>
                      <Text style={[styles.tableHeaderText, { width: 140 }]}>Status</Text>
                      <Text style={[styles.tableHeaderText, { width: 130 }]}>Branch</Text>
                    </View>
                    
                    {MOCK_PO_DATA.map((row, index) => {
                      const statusStyle = getStatusStyle(row.status);
                      return (
                        <View key={row.id} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
                          <Text style={[styles.tableCell, styles.poIdCell, { width: 110 }]}>{row.id}</Text>
                          <Text style={[styles.tableCell, { width: 110 }]}>{row.date}</Text>
                          <Text style={[styles.tableCell, { width: 130 }]} numberOfLines={1}>{row.supplier}</Text>
                          <Text style={[styles.tableCell, { width: 70 }]}>{row.items}</Text>
                          <Text style={[styles.tableCell, { width: 110 }]}>{row.amount}</Text>
                          <View style={[styles.tableCell, { width: 140 }]}>
                            <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
                              <Text style={[styles.badgeText, { color: statusStyle.text }]}>{row.status}</Text>
                            </View>
                          </View>
                          <Text style={[styles.tableCell, { width: 130 }]} numberOfLines={1}>{row.branch}</Text>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
              <Text style={styles.footerNote}>This is a preview. Use Export to download the complete report.</Text>
            </View>
          ) : (
            <View style={styles.placeholderContainer}>
              <Text style={styles.placeholderIcon}>{activeReport?.icon}</Text>
              <Text style={styles.placeholderText}>Select filters and click Export to view {activeReport?.title.toLowerCase()}</Text>
            </View>
          )}
        </View>

        {/* EXPORT SECTION */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Export Report</Text>
          <View style={styles.exportActions}>
            <TouchableOpacity style={styles.exportPrimaryBtn}>
              <Text style={styles.exportPrimaryBtnText}>⬇ Export as Excel (.xlsx)</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.exportSecondaryBtn}>
              <Text style={styles.exportSecondaryBtnText}>⬇ Export as PDF</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.exportGhostBtn}>
              <Text style={styles.exportGhostBtnText}>📅 Schedule Report</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  backButtonText: {
    fontSize: 24,
    color: COLORS.textPrimary,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  headerExportButton: {
    backgroundColor: COLORS.secondaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  headerExportText: {
    color: COLORS.secondary,
    fontWeight: '600',
    fontSize: 14,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  sectionContainer: {
    marginBottom: 16,
  },
  horizontalScroll: {
    marginHorizontal: -16,
  },
  horizontalScrollContent: {
    paddingHorizontal: 16,
  },
  reportCard: {
    width: 160,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    marginRight: 12,
  },
  reportCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  reportIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  reportCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  reportCardTitleSelected: {
    color: COLORS.primary,
  },
  reportCardDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 14,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  quickRangeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  quickRangeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  quickRangeButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  quickRangeText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  quickRangeTextActive: {
    color: COLORS.surface,
    fontWeight: '500',
  },
  customDateContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  dropdownsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    zIndex: 2000, // higher z-index for the row
  },
  dropdownWrapper: {
    flex: 1,
    minWidth: 120,
    position: 'relative',
    zIndex: 2000,
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
  },
  dropdownButtonText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    flex: 1,
  },
  dropdownIcon: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 4,
  },
  dropdownContainer: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    maxHeight: 150,
    zIndex: 3000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  dropdownScroll: {
    flexGrow: 0,
  },
  dropdownOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceHover,
  },
  dropdownOptionSelected: {
    backgroundColor: COLORS.primaryLight,
  },
  dropdownOptionText: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  dropdownOptionTextSelected: {
    color: COLORS.primary,
    fontWeight: '500',
  },
  kpiContainer: {
    marginHorizontal: -16,
    marginBottom: 16,
  },
  kpiContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  kpiCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 12,
    width: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  kpiLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  tableContainer: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceHover,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceHover,
  },
  tableRowAlt: {
    backgroundColor: '#FAFAFA',
  },
  tableCell: {
    fontSize: 13,
    color: COLORS.textPrimary,
    paddingHorizontal: 4,
  },
  poIdCell: {
    color: COLORS.primary,
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  footerNote: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  placeholderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  placeholderIcon: {
    fontSize: 40,
    marginBottom: 12,
    opacity: 0.8,
  },
  placeholderText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  exportActions: {
    gap: 12,
  },
  exportPrimaryBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  exportPrimaryBtnText: {
    color: COLORS.surface,
    fontWeight: '600',
    fontSize: 15,
  },
  exportSecondaryBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.secondary,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  exportSecondaryBtnText: {
    color: COLORS.secondary,
    fontWeight: '600',
    fontSize: 15,
  },
  exportGhostBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  exportGhostBtnText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 15,
  },
});
