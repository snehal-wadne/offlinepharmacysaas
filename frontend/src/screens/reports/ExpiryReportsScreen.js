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
  EXPIRY_REPORTS_KPIS,
  MOCK_EXPIRY_RISK_ITEMS,
} from '../../data/reportsMockData';
import { exportToCSV, exportToPDF } from '../../utils/exportUtils';

const RISK_BADGES = {
  Critical: { bg: '#FEE2E2', text: '#B91C1C' },
  'High Risk': { bg: '#FFEDD5', text: '#C2410C' },
  'Medium Risk': { bg: '#FEF3C7', text: '#B45309' },
  Expired: { bg: '#FEE2E2', text: '#991B1B' },
};

export default function ExpiryReportsScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  const [searchQuery, setSearchQuery] = useState('');
  const [riskItems, setRiskItems] = useState(MOCK_EXPIRY_RISK_ITEMS);

  const filteredItems = riskItems.filter((item) => {
    const q = searchQuery.toLowerCase();
    return (
      item.batchNo.toLowerCase().includes(q) ||
      item.medicine.toLowerCase().includes(q) ||
      item.supplier.toLowerCase().includes(q) ||
      item.riskLevel.toLowerCase().includes(q)
    );
  });

  const handleExport = (type) => {
    const headers = [
      'Batch No.',
      'Medicine Name',
      'Supplier',
      'Expiry Date',
      'Days Remaining',
      'Quantity',
      'Cost Value',
      'Risk Level',
      'Recommended Action',
    ];
    const rows = filteredItems.map((item) => [
      item.batchNo,
      item.medicine,
      item.supplier,
      item.expiryDate,
      item.daysRemaining,
      item.quantity,
      item.costValue,
      item.riskLevel,
      item.recommendedAction,
    ]);

    if (type === 'csv') {
      exportToCSV(headers, rows, 'batch_expiry_risk_report.csv');
    } else if (type === 'pdf') {
      exportToPDF(
        'Batch Expiry Risk & Exposure Report',
        'Near-expiry batches requiring price markdowns, transfer velocity, or vendor write-off returns.',
        headers,
        rows,
        'batch_expiry_risk_report.pdf'
      );
    }

    if (onShowToast) {
      onShowToast(`✓ Exported Batch Expiry Risk Report as ${type.toUpperCase()}!`);
    }
  };

  const handleExecuteAction = (item) => {
    if (onShowToast) {
      onShowToast(`Action triggered: "${item.recommendedAction}" for batch ${item.batchNo}`);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={true}
    >
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.pageTitle}>Expiry Reports</Text>
          <Text style={styles.pageSubtitle}>
            Batch expiration timelines, financial exposure, write-off loss metrics, and risk mitigation.
          </Text>
        </View>

        {/* Export Buttons */}
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
        {EXPIRY_REPORTS_KPIS.map((kpi) => (
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

      {/* Expiry Risk & Action Table Card */}
      <View style={styles.cardContainer}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Batch Expiry Risk & Financial Exposure</Text>
            <Text style={styles.cardSubtitle}>
              Near-expiry batches requiring price markdowns, transfer velocity, or vendor write-off returns.
            </Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.filtersBar}>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search batch number, medicine, supplier or risk level..."
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

        {isMobile ? (
          <View style={styles.mobileCardsList}>
            {filteredItems.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No expiring batches found</Text>
                <Text style={styles.emptySubtitle}>Try changing your search terms.</Text>
              </View>
            ) : (
              filteredItems.map((item) => {
                const badge = RISK_BADGES[item.riskLevel] || RISK_BADGES.Critical;
                const isCriticalOrExpired = item.riskLevel === 'Critical' || item.riskLevel === 'Expired';

                return (
                  <View key={item.batchNo} style={styles.mobileExpiryCard}>
                    {/* Header Row: Batch No + Days countdown + Risk badge */}
                    <View style={styles.mobileExpiryTopRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={styles.batchText}>{item.batchNo}</Text>
                        <View style={[styles.mobileDaysPill, isCriticalOrExpired && styles.daysPillUrgent]}>
                          <Text style={[styles.mobileDaysText, isCriticalOrExpired && styles.daysTextUrgent]}>
                            ⏳ {item.daysRemaining}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                          {item.riskLevel}
                        </Text>
                      </View>
                    </View>

                    {/* Medicine & Supplier */}
                    <Text style={styles.mobileMedName}>{item.medicine}</Text>
                    <Text style={styles.mobileSupplierText}>Supplier: {item.supplier} • Exp: {item.expiryDate}</Text>

                    {/* Quantity & Cost */}
                    <View style={styles.mobileExpiryDetailsGrid}>
                      <View style={styles.mobileExpiryDetailItem}>
                        <Text style={styles.mobileExpiryDetailLabel}>QUANTITY</Text>
                        <Text style={styles.mobileExpiryDetailVal}>{item.quantity} units</Text>
                      </View>
                      <View style={styles.mobileExpiryDetailItem}>
                        <Text style={styles.mobileExpiryDetailLabel}>FINANCIAL EXPOSURE</Text>
                        <Text style={[styles.mobileExpiryDetailVal, { color: '#DC2626' }]}>{item.costValue}</Text>
                      </View>
                    </View>

                    {/* Action Trigger Footer */}
                    <Pressable
                      onPress={() => handleExecuteAction(item)}
                      style={styles.mobileActionBtn}
                      accessibilityRole="button"
                    >
                      <Text style={styles.mobileActionBtnText} numberOfLines={1}>
                        ⚡ {item.recommendedAction} ➔
                      </Text>
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { width: 110 }]}>BATCH NO.</Text>
                <Text style={[styles.thCell, { width: 180 }]}>MEDICINE NAME</Text>
                <Text style={[styles.thCell, { width: 160 }]}>SUPPLIER</Text>
                <Text style={[styles.thCell, { width: 120 }]}>EXPIRY DATE</Text>
                <Text style={[styles.thCell, { width: 130, textAlign: 'center' }]}>DAYS REMAINING</Text>
                <Text style={[styles.thCell, { width: 90, textAlign: 'center' }]}>QUANTITY</Text>
                <Text style={[styles.thCell, { width: 130, textAlign: 'right' }]}>COST VALUE (₹)</Text>
                <Text style={[styles.thCell, { width: 120, textAlign: 'center' }]}>RISK LEVEL</Text>
                <Text style={[styles.thCell, { width: 200 }]}>RECOMMENDED ACTION</Text>
              </View>

              {filteredItems.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No expiring batches found</Text>
                  <Text style={styles.emptySubtitle}>Try changing your search terms.</Text>
                </View>
              ) : (
                filteredItems.map((item, index) => {
                  const badge = RISK_BADGES[item.riskLevel] || RISK_BADGES.Critical;
                  return (
                    <View
                      key={item.batchNo}
                      style={[
                        styles.tableRow,
                        index % 2 === 1 && styles.tableRowAlt,
                      ]}
                    >
                      <Text style={[styles.tdCell, styles.batchText, { width: 110 }]}>
                        {item.batchNo}
                      </Text>
                      <Text style={[styles.tdCell, styles.medName, { width: 180 }]} numberOfLines={1}>
                        {item.medicine}
                      </Text>
                      <Text style={[styles.tdCell, { width: 160 }]} numberOfLines={1}>
                        {item.supplier}
                      </Text>
                      <Text style={[styles.tdCell, { width: 120 }]}>{item.expiryDate}</Text>
                      <Text
                        style={[
                          styles.tdCell,
                          styles.daysText,
                          item.daysRemaining === 'Expired' && styles.expiredText,
                          { width: 130, textAlign: 'center' },
                        ]}
                      >
                        {item.daysRemaining}
                      </Text>
                      <Text style={[styles.tdCell, { width: 90, textAlign: 'center', fontWeight: '600' }]}>
                        {item.quantity}
                      </Text>
                      <Text style={[styles.tdCell, styles.costText, { width: 130, textAlign: 'right' }]}>
                        {item.costValue}
                      </Text>

                      {/* Risk Badge */}
                      <View style={[styles.statusWrapper, { width: 120 }]}>
                        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                            {item.riskLevel}
                          </Text>
                        </View>
                      </View>

                      {/* Action Trigger */}
                      <View style={[{ width: 200 }]}>
                        <Pressable
                          onPress={() => handleExecuteAction(item)}
                          style={styles.actionPillBtn}
                        >
                          <Text style={styles.actionPillText} numberOfLines={1}>
                            {item.recommendedAction}
                          </Text>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
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
  filtersBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FAFAFA',
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
    minWidth: 1150,
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
  batchText: {
    fontWeight: '700',
    color: '#0F766E',
  },
  medName: {
    fontWeight: '600',
    color: '#0F172A',
  },
  daysText: {
    fontWeight: '700',
    color: '#D97706',
  },
  expiredText: {
    color: '#DC2626',
  },
  costText: {
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
  actionPillBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  actionPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
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
  // Mobile Batch Expiry KPI Cards
  mobileCardsList: {
    padding: 12,
    gap: 12,
  },
  mobileExpiryCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
      default: { elevation: 1 },
    }),
  },
  mobileExpiryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  mobileDaysPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  daysPillUrgent: {
    backgroundColor: '#FEE2E2',
  },
  mobileDaysText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#B45309',
  },
  daysTextUrgent: {
    color: '#B91C1C',
  },
  mobileMedName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 3,
  },
  mobileSupplierText: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 10,
  },
  mobileExpiryDetailsGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  mobileExpiryDetailItem: {
    alignItems: 'center',
    flex: 1,
  },
  mobileExpiryDetailLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  mobileExpiryDetailVal: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  mobileActionBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  mobileActionBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#2563EB',
  },
});
