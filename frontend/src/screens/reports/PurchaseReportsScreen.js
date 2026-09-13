import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from 'react-native';
import InventoryStatCard from '../../components/inventory/InventoryStatCard';
import {
  PURCHASE_REPORTS_KPIS,
  MOCK_VENDOR_SPEND_ANALYSIS,
} from '../../data/reportsMockData';
import { exportToCSV, exportToPDF } from '../../utils/exportUtils';
import { SkeletonTableRow } from '../../components/common/SkeletonLoader';
import PaginationControls from '../../components/common/PaginationControls';
import { fetchProfitLossReport, fetchSalesReport } from '../../api/reportApi';

export default function PurchaseReportsScreen({ onShowToast, onNavigate, selectedBranch = 'All Branches' }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [kpis, setKpis] = useState(PURCHASE_REPORTS_KPIS);
  const itemsPerPage = 10;

  useEffect(() => {
    let isMounted = true;
    async function loadPurchaseAnalytics() {
      try {
        setLoading(true);
        const [pnlRes, salesRes] = await Promise.all([
          fetchProfitLossReport({ branchId: selectedBranch }),
          fetchSalesReport({ branchId: selectedBranch }),
        ]);

        if (!isMounted) return;

        if (pnlRes && pnlRes.success && pnlRes.data) {
          const pnl = pnlRes.data;
          const grossRev = Number(pnl.grossRevenue || 0);
          const cogs = Number(pnl.estimatedCogs || 0);
          const profit = Number(pnl.grossProfit || 0);
          const margin = pnl.profitMarginPercent || (grossRev > 0 ? ((profit / grossRev) * 100).toFixed(1) : 0);

          setKpis([
            {
              id: 'rep-pur-1',
              label: 'Est. Procurement COGS',
              value: `₹${cogs.toLocaleString('en-IN')}`,
              subtext: selectedBranch === 'All Branches' ? 'Across all branches' : selectedBranch,
              variant: 'teal',
            },
            {
              id: 'rep-pur-2',
              label: 'Gross Revenue',
              value: `₹${grossRev.toLocaleString('en-IN')}`,
              subtext: `${pnl.invoicesCount || 0} invoices settled`,
              variant: 'teal',
            },
            {
              id: 'rep-pur-3',
              label: 'Gross Profit',
              value: `₹${profit.toLocaleString('en-IN')}`,
              subtext: `${margin}% gross margin`,
              variant: 'teal',
            },
            {
              id: 'rep-pur-4',
              label: 'Taxes Collected (GST)',
              value: `₹${Number(pnl.taxCollected || 0).toLocaleString('en-IN')}`,
              subtext: 'Output GST liability',
              variant: 'amber',
            },
          ]);
        }
      } catch (err) {
        console.warn('Backend purchase report unavailable, using local metrics:', err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadPurchaseAnalytics();
    return () => { isMounted = false; };
  }, [selectedBranch]);

  const totalPages = Math.ceil(MOCK_VENDOR_SPEND_ANALYSIS.length / itemsPerPage);
  const paginatedVendors = MOCK_VENDOR_SPEND_ANALYSIS.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleExport = (type) => {
    const headers = [
      'Supplier / Distributor',
      'Total POs',
      'Total Spent',
      'Avg Lead Time',
      'Fulfillment Rate',
      'Quality Score',
      'Primary Category',
    ];
    const rows = MOCK_VENDOR_SPEND_ANALYSIS.map((v) => [
      v.supplier,
      v.totalPOs,
      v.totalSpent,
      v.leadTimeAvg,
      v.fulfillmentRate,
      v.qualityAcceptance,
      v.primaryCategory,
    ]);

    if (type === 'csv') {
      exportToCSV(headers, rows, 'vendor_procurement_analytics.csv');
    } else if (type === 'pdf') {
      exportToPDF(
        'Vendor Spend & Delivery Performance',
        'Comparison of procurement volume, on-time delivery percentages, and quality ratings.',
        headers,
        rows,
        'vendor_procurement_analytics.pdf'
      );
    }

    if (onShowToast) {
      onShowToast(`✓ Exported Vendor Purchase Analysis as ${type.toUpperCase()}!`);
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
          <Text style={styles.pageTitle}>Procurement & Vendor Reports</Text>
          <Text style={styles.pageSubtitle}>
            Vendor spend distribution, order lead times, fulfillment percentages, and supplier quality rankings.
          </Text>
        </View>

        {/* Export Actions */}
        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => handleExport('csv')}
            style={styles.exportBtnSecondary}
            accessibilityRole="button"
          >
            <Text style={styles.exportBtnTextSecondary}>Export CSV</Text>
          </Pressable>

          <Pressable
            onPress={() => handleExport('pdf')}
            style={styles.exportBtnPrimary}
            accessibilityRole="button"
          >
            <Text style={styles.exportBtnTextPrimary}>Export PDF</Text>
          </Pressable>
        </View>
      </View>

      {/* Top 4 KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {kpis.map((kpi) => (
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

      {/* Vendor Spend & Performance Analysis Table Card */}
      <View style={styles.cardContainer}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Vendor Spend & Delivery Performance</Text>
            <Text style={styles.cardSubtitle}>
              Comparison of procurement volume, on-time delivery percentages, and quality ratings.
            </Text>
          </View>
        </View>

        {isMobile ? (
          /* Mobile Vendor Spend Cards */
          <View style={styles.mobileCardList}>
            {loading ? (
              <View style={{ padding: 20 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonTableRow key={i} />
                ))}
              </View>
            ) : (
              paginatedVendors.map((v) => (
              <View key={v.supplier} style={styles.mobileVendorCard}>
                <View style={styles.mobileCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mobileVendorName}>{v.supplier}</Text>
                    <Text style={styles.mobileVendorCat}>{v.primaryCategory}</Text>
                  </View>
                  <View style={styles.ratePill}>
                    <Text style={styles.ratePillText}>{v.fulfillmentRate}</Text>
                  </View>
                </View>

                <View style={styles.mobileGrid}>
                  <View style={styles.mobileGridCol}>
                    <Text style={styles.mobileLabel}>Total Spent</Text>
                    <Text style={[styles.mobileValBold, { color: '#0F766E' }]}>{v.totalSpent}</Text>
                  </View>
                  <View style={styles.mobileGridCol}>
                    <Text style={styles.mobileLabel}>Total Orders</Text>
                    <Text style={styles.mobileValBold}>{v.totalPOs} POs</Text>
                  </View>
                  <View style={styles.mobileGridCol}>
                    <Text style={styles.mobileLabel}>Lead Time</Text>
                    <Text style={styles.mobileVal}>{v.leadTimeAvg}</Text>
                  </View>
                  <View style={styles.mobileGridCol}>
                    <Text style={styles.mobileLabel}>Quality Score</Text>
                    <Text style={[styles.mobileValBold, { color: '#16A34A' }]}>{v.qualityAcceptance}</Text>
                  </View>
                </View>
              </View>
            )))}
          </View>
        ) : (
          /* Desktop Table */
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { width: 200 }]}>SUPPLIER / DISTRIBUTOR</Text>
                <Text style={[styles.thCell, { width: 100, textAlign: 'center' }]}>TOTAL POS</Text>
                <Text style={[styles.thCell, { width: 150, textAlign: 'right' }]}>TOTAL SPENT (₹)</Text>
                <Text style={[styles.thCell, { width: 130, textAlign: 'center' }]}>AVG LEAD TIME</Text>
                <Text style={[styles.thCell, { width: 150, textAlign: 'center' }]}>FULFILLMENT RATE</Text>
                <Text style={[styles.thCell, { width: 150, textAlign: 'center' }]}>QUALITY SCORE</Text>
                <Text style={[styles.thCell, { width: 180 }]}>PRIMARY CATEGORY</Text>
              </View>

              {loading ? (
                <View style={{ padding: 20 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonTableRow key={i} />
                  ))}
                </View>
              ) : (
                paginatedVendors.map((v, index) => (
                <View
                  key={v.supplier}
                  style={[
                    styles.tableRow,
                    index % 2 === 1 && styles.tableRowAlt,
                  ]}
                >
                  <Text style={[styles.tdCell, styles.supName, { width: 200 }]} numberOfLines={1}>
                    {v.supplier}
                  </Text>
                  <Text style={[styles.tdCell, { width: 100, textAlign: 'center', fontWeight: '600' }]}>
                    {v.totalPOs}
                  </Text>
                  <Text style={[styles.tdCell, styles.spentText, { width: 150, textAlign: 'right' }]}>
                    {v.totalSpent}
                  </Text>
                  <Text style={[styles.tdCell, { width: 130, textAlign: 'center', fontWeight: '600' }]}>
                    {v.leadTimeAvg}
                  </Text>

                  {/* Fulfillment Rate Pill */}
                  <View style={[styles.statusWrapper, { width: 150 }]}>
                    <View style={styles.ratePill}>
                      <Text style={styles.ratePillText}>{v.fulfillmentRate}</Text>
                    </View>
                  </View>

                  {/* Quality Acceptance Pill */}
                  <View style={[styles.statusWrapper, { width: 150 }]}>
                    <View style={styles.qualityPill}>
                      <Text style={styles.qualityPillText}>{v.qualityAcceptance}</Text>
                    </View>
                  </View>

                  <Text style={[styles.tdCell, { width: 180 }]} numberOfLines={1}>
                    {v.primaryCategory}
                  </Text>
                </View>
              )))}
            </View>
          </ScrollView>
        )}
        {!loading && MOCK_VENDOR_SPEND_ANALYSIS.length > 0 && (
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={MOCK_VENDOR_SPEND_ANALYSIS.length}
          />
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
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  exportBtnSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    cursor: 'pointer',
  },
  exportBtnTextSecondary: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  exportBtnPrimary: {
    backgroundColor: '#0F766E',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    cursor: 'pointer',
  },
  exportBtnTextPrimary: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  kpiRowCompact: {
    gap: 12,
  },
  /* Mobile Vendor Card Styles */
  mobileCardList: {
    padding: 12,
    gap: 12,
  },
  mobileVendorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  mobileCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  mobileVendorName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  mobileVendorCat: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  mobileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 8,
    gap: 10,
  },
  mobileGridCol: {
    width: '47%',
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
  cardHeader: {
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 2,
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
  supName: {
    fontWeight: '700',
    color: '#0F172A',
  },
  spentText: {
    fontWeight: '700',
    color: '#0F172A',
  },
  statusWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratePill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  ratePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  qualityPill: {
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  qualityPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
  },
});
