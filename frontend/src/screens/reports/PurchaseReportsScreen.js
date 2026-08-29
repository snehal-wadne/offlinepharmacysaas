import React, { useState } from 'react';
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

export default function PurchaseReportsScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;

  const handleExport = (type) => {
    if (onShowToast) {
      onShowToast(`✓ Exported Vendor Procurement Analytics as ${type.toUpperCase()}!`);
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
          <Text style={styles.pageTitle}>Purchase Reports</Text>
          <Text style={styles.pageSubtitle}>
            Procurement spend breakdowns, vendor lead time analytics, and fulfillment reliability scores.
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
        {PURCHASE_REPORTS_KPIS.map((kpi) => (
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

            {MOCK_VENDOR_SPEND_ANALYSIS.map((v, index) => (
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
            ))}
          </View>
        </ScrollView>
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
