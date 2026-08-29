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
  INVENTORY_REPORTS_KPIS,
  MOCK_INVENTORY_CATEGORY_VALUATION,
  MOCK_FAST_MOVING_ITEMS,
} from '../../data/reportsMockData';

const HEALTH_BADGES = {
  Optimal: { bg: '#DCFCE7', text: '#15803D' },
  Moderate: { bg: '#FEF3C7', text: '#B45309' },
  'Slow Moving': { bg: '#FEE2E2', text: '#B91C1C' },
};

const URGENCY_BADGES = {
  High: { bg: '#FEE2E2', text: '#B91C1C' },
  Medium: { bg: '#FEF3C7', text: '#B45309' },
  Low: { bg: '#DCFCE7', text: '#15803D' },
};

export default function InventoryReportsScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;

  const handleExport = (type) => {
    if (onShowToast) {
      onShowToast(`✓ Exported Inventory Valuation & Turnover Report as ${type.toUpperCase()}!`);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={true}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.pageTitle}>Inventory Reports</Text>
          <Text style={styles.pageSubtitle}>
            Stock valuation breakdowns, turnover velocity, and fast-moving medicine forecasting.
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
        {INVENTORY_REPORTS_KPIS.map((kpi) => (
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

      {/* Section 1: Category Stock Valuation Table */}
      <View style={styles.cardContainer}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Category Valuation & Stock Holding</Text>
            <Text style={styles.cardSubtitle}>
              Valuation share and annualized turnover rate categorized by product family.
            </Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <View style={styles.tableWrapper}>
            <View style={styles.tableHeader}>
              <Text style={[styles.thCell, { width: 220 }]}>PRODUCT CATEGORY</Text>
              <Text style={[styles.thCell, { width: 110, textAlign: 'center' }]}>ITEMS COUNT</Text>
              <Text style={[styles.thCell, { width: 150, textAlign: 'right' }]}>VALUATION (₹)</Text>
              <Text style={[styles.thCell, { width: 140, textAlign: 'center' }]}>TURNOVER RATE</Text>
              <Text style={[styles.thCell, { width: 120, textAlign: 'center' }]}>HOLDING %</Text>
              <Text style={[styles.thCell, { width: 140, textAlign: 'center' }]}>STOCK HEALTH</Text>
            </View>

            {MOCK_INVENTORY_CATEGORY_VALUATION.map((cat, index) => {
              const badge = HEALTH_BADGES[cat.status] || HEALTH_BADGES.Optimal;
              return (
                <View
                  key={cat.category}
                  style={[
                    styles.tableRow,
                    index % 2 === 1 && styles.tableRowAlt,
                  ]}
                >
                  <Text style={[styles.tdCell, styles.catName, { width: 220 }]}>
                    {cat.category}
                  </Text>
                  <Text style={[styles.tdCell, { width: 110, textAlign: 'center', fontWeight: '600' }]}>
                    {cat.totalItems}
                  </Text>
                  <Text style={[styles.tdCell, styles.valText, { width: 150, textAlign: 'right' }]}>
                    {cat.valuation}
                  </Text>
                  <Text style={[styles.tdCell, { width: 140, textAlign: 'center', fontWeight: '700', color: '#0F766E' }]}>
                    {cat.turnover}
                  </Text>
                  <Text style={[styles.tdCell, { width: 120, textAlign: 'center', fontWeight: '600' }]}>
                    {cat.holdingPercent}
                  </Text>

                  <View style={[styles.statusWrapper, { width: 140 }]}>
                    <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                        {cat.status}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* Section 2: Fast-Moving Medicines Demand Forecast */}
      <View style={styles.cardContainer}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Fast-Moving Medicines (Runway & Forecast)</Text>
            <Text style={styles.cardSubtitle}>
              Top velocity medications, monthly sales revenue, and projected days of inventory remaining.
            </Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <View style={styles.tableWrapper}>
            <View style={styles.tableHeader}>
              <Text style={[styles.thCell, { width: 100 }]}>SKU</Text>
              <Text style={[styles.thCell, { width: 200 }]}>MEDICINE NAME</Text>
              <Text style={[styles.thCell, { width: 160, textAlign: 'center' }]}>MONTHLY SALES</Text>
              <Text style={[styles.thCell, { width: 160, textAlign: 'right' }]}>MONTHLY REVENUE</Text>
              <Text style={[styles.thCell, { width: 160, textAlign: 'center' }]}>STOCK RUNWAY</Text>
              <Text style={[styles.thCell, { width: 140, textAlign: 'center' }]}>REORDER URGENCY</Text>
            </View>

            {MOCK_FAST_MOVING_ITEMS.map((item, index) => {
              const badge = URGENCY_BADGES[item.reorderUrgency] || URGENCY_BADGES.Low;
              return (
                <View
                  key={item.sku}
                  style={[
                    styles.tableRow,
                    index % 2 === 1 && styles.tableRowAlt,
                  ]}
                >
                  <Text style={[styles.tdCell, styles.skuText, { width: 100 }]}>{item.sku}</Text>
                  <Text style={[styles.tdCell, styles.medName, { width: 200 }]} numberOfLines={1}>
                    {item.medicine}
                  </Text>
                  <Text style={[styles.tdCell, { width: 160, textAlign: 'center', fontWeight: '700' }]}>
                    {item.unitsSoldMonthly.toLocaleString()} units
                  </Text>
                  <Text style={[styles.tdCell, styles.revenueText, { width: 160, textAlign: 'right' }]}>
                    {item.monthlyRevenue}
                  </Text>
                  <Text style={[styles.tdCell, { width: 160, textAlign: 'center', fontWeight: '600' }]}>
                    {item.daysOfStockLeft} days left
                  </Text>

                  <View style={[styles.statusWrapper, { width: 140 }]}>
                    <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                        {item.reorderUrgency}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
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
    minWidth: 980,
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
  catName: {
    fontWeight: '700',
    color: '#0F172A',
  },
  valText: {
    fontWeight: '700',
    color: '#0F172A',
  },
  skuText: {
    fontWeight: '700',
    color: '#0F766E',
  },
  medName: {
    fontWeight: '600',
    color: '#0F172A',
  },
  revenueText: {
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
});
