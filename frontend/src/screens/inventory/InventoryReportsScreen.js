import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
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

const REPORT_TYPES = [
  { id: 'stock_valuation', icon: '📊', title: 'Stock Valuation', description: 'Current stock value by product and category' },
  { id: 'low_stock', icon: '⚠️', title: 'Low Stock Report', description: 'Products below minimum stock levels' },
  { id: 'expiry', icon: '📅', title: 'Expiry Report', description: 'Products expiring within selected period' },
  { id: 'stock_ageing', icon: '⏳', title: 'Stock Ageing', description: 'Stock age analysis and slow-moving items' },
  { id: 'stock_movement', icon: '🔄', title: 'Stock Movement', description: 'Detailed movement history for selected period' },
  { id: 'product_wise', icon: '💊', title: 'Product-wise Stock', description: 'Current stock levels by product' },
  { id: 'branch_wise', icon: '🏢', title: 'Branch-wise Stock', description: 'Stock distribution across branches' },
];

const STOCK_VALUATION_DATA = [
  { product: 'Paracetamol 500mg', category: 'Medicines', qty: 500, purchaseValue: '₹11,000', sellingValue: '₹14,000', mrpValue: '₹17,500' },
  { product: 'Amoxicillin 500mg', category: 'Medicines', qty: 320, purchaseValue: '₹21,760', sellingValue: '₹23,040', mrpValue: '₹27,200' },
  { product: 'Metformin 500mg', category: 'Medicines', qty: 750, purchaseValue: '₹26,250', sellingValue: '₹28,500', mrpValue: '₹33,750' },
  { product: 'Atorvastatin 10mg', category: 'Medicines', qty: 180, purchaseValue: '₹16,200', sellingValue: '₹17,640', mrpValue: '₹21,600' },
  { product: 'Vitamin C 500mg', category: 'Supplements', qty: 280, purchaseValue: '₹35,000', sellingValue: '₹42,000', mrpValue: '₹50,400' },
];

const BRANCH_OPTIONS = ['All Branches', 'Main Branch', 'BR-02', 'BR-03', 'BR-04', 'BR-05'];
const CATEGORY_OPTIONS = ['All Categories', 'Medicines', 'Supplements', 'Equipment', 'Cosmetics'];

export default function InventoryReportsScreen({ navigation, route }) {
  const [selectedReport, setSelectedReport] = useState('stock_valuation');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('All Branches');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [quickRange, setQuickRange] = useState('this_month');
  const [searchQuery, setSearchQuery] = useState('');

  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  const getSelectedReportData = () => {
    return REPORT_TYPES.find((report) => report.id === selectedReport);
  };

  const currentReport = getSelectedReportData();

  const filteredData = STOCK_VALUATION_DATA.filter(item => {
    const matchesSearch = !searchQuery || item.product.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All Categories' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backButton}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Inventory Reports</Text>
            <Text style={styles.headerSubtitle}>Generate and export inventory reports</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.exportButtonHeader}>
          <Text style={styles.exportButtonHeaderText}>⬇ Export</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {/* HORIZONTAL REPORT TYPE SELECTOR */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reportTypeScroll} contentContainerStyle={styles.reportTypeScrollContent}>
          {REPORT_TYPES.map((report) => {
            const isSelected = selectedReport === report.id;
            return (
              <TouchableOpacity
                key={report.id}
                style={[styles.reportCard, isSelected && styles.reportCardSelected]}
                onPress={() => setSelectedReport(report.id)}
              >
                <Text style={styles.reportCardIcon}>{report.icon}</Text>
                <Text style={[styles.reportCardTitle, isSelected && styles.reportCardTitleSelected]}>{report.title}</Text>
                <Text style={styles.reportCardDesc}>{report.description}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* FILTERS SECTION */}
        <View style={[styles.card, { zIndex: 100 }]}>
          <Text style={styles.cardTitle}>Filters</Text>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickRangeScroll} contentContainerStyle={styles.quickRangeScrollContent}>
            {['today', 'this_week', 'this_month', 'last_month', 'custom'].map((range) => {
              const isActive = quickRange === range;
              const labels = {
                today: 'Today',
                this_week: 'This Week',
                this_month: 'This Month',
                last_month: 'Last Month',
                custom: 'Custom'
              };
              return (
                <TouchableOpacity
                  key={range}
                  style={[styles.quickRangeBtn, isActive && styles.quickRangeBtnActive]}
                  onPress={() => setQuickRange(range)}
                >
                  <Text style={[styles.quickRangeText, isActive && styles.quickRangeTextActive]}>{labels[range]}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {quickRange === 'custom' && (
            <View style={styles.customDateRow}>
              <View style={styles.customDateInputContainer}>
                <Text style={styles.label}>From Date</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="YYYY-MM-DD"
                  value={dateFrom}
                  onChangeText={setDateFrom}
                />
              </View>
              <View style={styles.customDateInputContainer}>
                <Text style={styles.label}>To Date</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="YYYY-MM-DD"
                  value={dateTo}
                  onChangeText={setDateTo}
                />
              </View>
            </View>
          )}

          <View style={styles.dropdownRow}>
            <View style={[styles.dropdownContainer, { zIndex: showBranchDropdown ? 200 : 10 }]}>
              <Text style={styles.label}>Branch</Text>
              <TouchableOpacity style={styles.dropdownTrigger} onPress={() => { setShowBranchDropdown(!showBranchDropdown); setShowCategoryDropdown(false); }}>
                <Text style={styles.dropdownTriggerText}>{selectedBranch}</Text>
                <Text style={styles.dropdownIcon}>▾</Text>
              </TouchableOpacity>
              {showBranchDropdown && (
                <View style={styles.dropdownMenu}>
                  {BRANCH_OPTIONS.map((opt) => (
                    <TouchableOpacity key={opt} style={styles.dropdownOption} onPress={() => { setSelectedBranch(opt); setShowBranchDropdown(false); }}>
                      <Text style={styles.dropdownOptionText}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={[styles.dropdownContainer, { zIndex: showCategoryDropdown ? 200 : 10, marginRight: 0 }]}>
              <Text style={styles.label}>Category</Text>
              <TouchableOpacity style={styles.dropdownTrigger} onPress={() => { setShowCategoryDropdown(!showCategoryDropdown); setShowBranchDropdown(false); }}>
                <Text style={styles.dropdownTriggerText}>{selectedCategory}</Text>
                <Text style={styles.dropdownIcon}>▾</Text>
              </TouchableOpacity>
              {showCategoryDropdown && (
                <View style={styles.dropdownMenu}>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <TouchableOpacity key={opt} style={styles.dropdownOption} onPress={() => { setSelectedCategory(opt); setShowCategoryDropdown(false); }}>
                      <Text style={styles.dropdownOptionText}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          <View style={[styles.searchContainer, { zIndex: 1 }]}>
            <Text style={styles.label}>Product Search</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Search product..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {/* PREVIEW SECTION */}
        <View style={[styles.card, { zIndex: 1 }]}>
          <Text style={styles.cardTitle}>Preview — {currentReport?.title}</Text>
          
          {selectedReport === 'stock_valuation' ? (
            <View>
              <View style={styles.kpiGrid}>
                <View style={[styles.kpiCard, { borderLeftColor: COLORS.primary }]}>
                  <Text style={styles.kpiLabel}>Total Inventory Value</Text>
                  <Text style={[styles.kpiValue, { color: COLORS.primary }]}>₹18,42,650</Text>
                </View>
                <View style={[styles.kpiCard, { borderLeftColor: COLORS.secondary }]}>
                  <Text style={styles.kpiLabel}>Total Products</Text>
                  <Text style={[styles.kpiValue, { color: COLORS.secondary }]}>1,248</Text>
                </View>
                <View style={[styles.kpiCard, { borderLeftColor: COLORS.success }]}>
                  <Text style={styles.kpiLabel}>Total Quantity</Text>
                  <Text style={[styles.kpiValue, { color: COLORS.success }]}>45,680 units</Text>
                </View>
                <View style={[styles.kpiCard, { borderLeftColor: COLORS.warning }]}>
                  <Text style={styles.kpiLabel}>Average Item Value</Text>
                  <Text style={[styles.kpiValue, { color: COLORS.warning }]}>₹1,476</Text>
                </View>
              </View>

              <ScrollView horizontal style={styles.tableContainer}>
                <View>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableCellHeader, styles.cellProduct]}>Product</Text>
                    <Text style={[styles.tableCellHeader, styles.cellCategory]}>Category</Text>
                    <Text style={[styles.tableCellHeader, styles.cellQty]}>Total Qty</Text>
                    <Text style={[styles.tableCellHeader, styles.cellAmount]}>Purchase Value</Text>
                    <Text style={[styles.tableCellHeader, styles.cellAmount]}>Selling Value</Text>
                    <Text style={[styles.tableCellHeader, styles.cellAmount]}>MRP Value</Text>
                  </View>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <SkeletonTableRow key={i} columns={6} />
                    ))
                  ) : (
                    filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((row, index) => (
                      <View key={index} style={[styles.tableRow, index % 2 !== 0 && styles.tableRowAlt]}>
                        <Text style={[styles.tableCell, styles.cellProduct, styles.textBold]}>{row.product}</Text>
                        <Text style={[styles.tableCell, styles.cellCategory]}>{row.category}</Text>
                        <Text style={[styles.tableCell, styles.cellQty]}>{row.qty}</Text>
                        <Text style={[styles.tableCell, styles.cellAmount]}>{row.purchaseValue}</Text>
                        <Text style={[styles.tableCell, styles.cellAmount]}>{row.sellingValue}</Text>
                        <Text style={[styles.tableCell, styles.cellAmount]}>{row.mrpValue}</Text>
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>
              
              <PaginationControls 
                currentPage={currentPage}
                totalPages={Math.ceil(filteredData.length / itemsPerPage)}
                onPageChange={setCurrentPage}
                itemsPerPage={itemsPerPage}
                onItemsPerPageChange={setItemsPerPage}
              />
              
              <Text style={styles.footerNote}>This is a preview. Use Export to download the complete report.</Text>
            </View>
          ) : (
            <View style={styles.placeholderContainer}>
              <Text style={styles.placeholderIcon}>{currentReport?.icon}</Text>
              <Text style={styles.placeholderText}>{currentReport?.title}</Text>
              <Text style={styles.placeholderSubtext}>Select filters above and click Export to generate this report.</Text>
            </View>
          )}
        </View>

        {/* EXPORT SECTION */}
        <View style={[styles.card, { zIndex: 1 }]}>
          <Text style={styles.cardTitle}>Export Report</Text>
          <TouchableOpacity style={styles.exportExcelBtn}>
            <Text style={styles.exportExcelBtnText}>⬇ Export as Excel (.xlsx)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportPdfBtn}>
            <Text style={styles.exportPdfBtnText}>⬇ Export as PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.scheduleBtn}>
            <Text style={styles.scheduleBtnText}>📅 Schedule Report</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom padding for scroll */}
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
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  backIcon: {
    fontSize: 24,
    color: COLORS.textPrimary,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  exportButtonHeader: {
    backgroundColor: COLORS.secondaryLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  exportButtonHeaderText: {
    color: COLORS.secondary,
    fontWeight: '600',
    fontSize: 14,
  },
  reportTypeScroll: {
    marginBottom: 16,
  },
  reportTypeScrollContent: {
    paddingRight: 16,
  },
  reportCard: {
    width: 160,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
  },
  reportCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  reportCardIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  reportCardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  reportCardTitleSelected: {
    color: COLORS.primary,
  },
  reportCardDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
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
  quickRangeScroll: {
    marginBottom: 16,
  },
  quickRangeScrollContent: {
    paddingRight: 16,
  },
  quickRangeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 8,
    backgroundColor: COLORS.surface,
  },
  quickRangeBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  quickRangeText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  quickRangeTextActive: {
    color: '#FFF',
  },
  customDateRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  customDateInputContainer: {
    flex: 1,
    marginRight: 8,
  },
  label: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
    fontWeight: '500',
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surface,
  },
  dropdownRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  dropdownContainer: {
    flex: 1,
    marginRight: 8,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
  },
  dropdownTriggerText: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  dropdownIcon: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  dropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceHover,
  },
  dropdownOptionText: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  searchContainer: {
    marginBottom: 8,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: COLORS.surfaceHover,
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    justifyContent: 'space-between',
    minHeight: 75,
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
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceHover,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 10,
  },
  tableCellHeader: {
    fontWeight: '600',
    fontSize: 12,
    color: COLORS.textSecondary,
    paddingHorizontal: 12,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
  },
  tableRowAlt: {
    backgroundColor: '#FAFAFA',
  },
  tableCell: {
    fontSize: 13,
    color: COLORS.textPrimary,
    paddingHorizontal: 12,
  },
  textBold: {
    fontWeight: '600',
  },
  cellProduct: { width: 160 },
  cellCategory: { width: 120 },
  cellQty: { width: 80, textAlign: 'right' },
  cellAmount: { width: 110, textAlign: 'right' },
  footerNote: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },
  placeholderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  placeholderIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  placeholderText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  placeholderSubtext: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  exportExcelBtn: {
    backgroundColor: COLORS.primary,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  exportExcelBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  exportPdfBtn: {
    backgroundColor: COLORS.surface,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.secondary,
    marginBottom: 12,
  },
  exportPdfBtnText: {
    color: COLORS.secondary,
    fontWeight: 'bold',
    fontSize: 15,
  },
  scheduleBtn: {
    backgroundColor: COLORS.primaryLight,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  scheduleBtnText: {
    color: COLORS.primary,
    fontWeight: 'bold',
    fontSize: 15,
  },
});
