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
import { exportToCSV, openPrintDocument } from '../../utils/exportUtils';
import { SkeletonTableRow } from '../../components/common/SkeletonLoader';
import PaginationControls from '../../components/common/PaginationControls';

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
  const isMobile = width < 768;

  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const totalPages = Math.ceil(MOCK_INVENTORY_CATEGORY_VALUATION.length / itemsPerPage);
  const paginatedCategories = MOCK_INVENTORY_CATEGORY_VALUATION.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleExport = (type) => {
    if (type === 'csv') {
      // Create consolidated CSV
      const headers = ['Product Category / SKU', 'Items Count / Medicine Name', 'Valuation / Monthly Sales', 'Turnover Rate / Monthly Revenue', 'Holding % / Stock Runway', 'Stock Health / Reorder Urgency'];
      const rows = [
        ['PRODUCT CATEGORY VALUATION & STOCK HOLDING'],
        ['Product Category', 'Items Count', 'Valuation (₹)', 'Turnover Rate', 'Holding %', 'Stock Health'],
        ...MOCK_INVENTORY_CATEGORY_VALUATION.map(cat => [
          cat.category, cat.totalItems, cat.valuation, cat.turnover, cat.holdingPercent, cat.status
        ]),
        [],
        ['FAST-MOVING MEDICINES DEMAND FORECAST'],
        ['SKU', 'Medicine Name', 'Monthly Sales', 'Monthly Revenue', 'Stock Runway', 'Reorder Urgency'],
        ...MOCK_FAST_MOVING_ITEMS.map(item => [
          item.sku, item.medicine, `${item.unitsSoldMonthly} units`, item.monthlyRevenue, `${item.daysOfStockLeft} days`, item.reorderUrgency
        ])
      ];
      exportToCSV(headers, rows, 'inventory_valuation_and_forecast.csv');
    } else if (type === 'pdf') {
      const currentDate = new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' });
      const currentTime = new Date().toLocaleTimeString('en-IN', { timeStyle: 'short' });

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Inventory Reports</title>
          <meta charset="utf-8" />
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
            body {
              font-family: 'Inter', sans-serif;
              color: #1e293b;
              margin: 0;
              padding: 40px;
              background-color: #ffffff;
            }
            .header {
              border-bottom: 2px solid #e2e8f0;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .title-row {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
            }
            .title {
              font-size: 26px;
              font-weight: 800;
              color: #0f172a;
              margin: 0 0 6px 0;
            }
            .subtitle {
              font-size: 14px;
              color: #64748b;
              margin: 0;
              max-width: 600px;
              line-height: 1.5;
            }
            .meta-info {
              text-align: right;
              font-size: 12px;
              color: #64748b;
              line-height: 1.6;
            }
            .meta-label {
              font-weight: 600;
              color: #475569;
            }
            .logo {
              font-weight: 800;
              color: #167c68;
              font-size: 18px;
              margin-bottom: 8px;
            }
            .section-title {
              font-size: 16px;
              font-weight: 700;
              color: #1e293b;
              margin-top: 30px;
              margin-bottom: 12px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 30px;
            }
            th {
              background-color: #f1f5f9;
              color: #475569;
              font-weight: 700;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              text-align: left;
              padding: 10px 12px;
              border-bottom: 2px solid #e2e8f0;
            }
            td {
              padding: 10px 12px;
              font-size: 12px;
              border-bottom: 1px solid #e2e8f0;
              color: #334155;
            }
            tr:nth-child(even) td {
              background-color: #f8fafc;
            }
            .text-center {
              text-align: center;
            }
            .text-right {
              text-align: right;
            }
            .font-semibold {
              font-weight: 600;
            }
            .badge {
              display: inline-block;
              padding: 3px 6px;
              border-radius: 12px;
              font-size: 10px;
              font-weight: 700;
              text-align: center;
            }
            .badge-optimal {
              background-color: #dcfce7;
              color: #15803d;
            }
            .badge-moderate {
              background-color: #fef3c7;
              color: #b45309;
            }
            .badge-slow-moving {
              background-color: #fee2e2;
              color: #b91c1c;
            }
            .badge-high {
              background-color: #fee2e2;
              color: #b91c1c;
            }
            .badge-medium {
              background-color: #fef3c7;
              color: #b45309;
            }
            .badge-low {
              background-color: #dcfce7;
              color: #15803d;
            }
            @media print {
              body {
                padding: 20px;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title-row">
              <div>
                <div class="logo">FALAH PHARMACY ERP</div>
                <h1 class="title">Inventory Reports</h1>
                <p class="subtitle">Stock valuation breakdowns, turnover velocity, and fast-moving medicine forecasting.</p>
              </div>
              <div class="meta-info">
                <div><span class="meta-label">Exported Date:</span> ${currentDate}</div>
                <div><span class="meta-label">Time:</span> ${currentTime}</div>
                <div><span class="meta-label">Branch:</span> Main Branch</div>
                <div><span class="meta-label">Status:</span> SECURE & VERIFIED</div>
              </div>
            </div>
          </div>
          
          <div class="section-title">1. Category Valuation & Stock Holding</div>
          <table>
            <thead>
              <tr>
                <th>Product Category</th>
                <th class="text-center">Items Count</th>
                <th class="text-right">Valuation (₹)</th>
                <th class="text-center">Turnover Rate</th>
                <th class="text-center">Holding %</th>
                <th class="text-center">Stock Health</th>
              </tr>
            </thead>
            <tbody>
              ${MOCK_INVENTORY_CATEGORY_VALUATION.map(cat => `
                <tr>
                  <td>${cat.category}</td>
                  <td class="text-center">${cat.totalItems}</td>
                  <td class="text-right font-semibold">${cat.valuation}</td>
                  <td class="text-center font-semibold" style="color: #0f766e">${cat.turnover}</td>
                  <td class="text-center">${cat.holdingPercent}</td>
                  <td class="text-center">
                    <span class="badge badge-${cat.status.toLowerCase().replace(' ', '-')}">${cat.status}</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="section-title">2. Fast-Moving Medicines Demand Forecast</div>
          <table>
            <thead>
              <tr>
                <th class="text-center">SKU</th>
                <th>Medicine Name</th>
                <th class="text-center">Monthly Sales</th>
                <th class="text-right">Monthly Revenue</th>
                <th class="text-center">Stock Runway</th>
                <th class="text-center">Reorder Urgency</th>
              </tr>
            </thead>
            <tbody>
              ${MOCK_FAST_MOVING_ITEMS.map(item => `
                <tr>
                  <td class="text-center font-semibold">${item.sku}</td>
                  <td>${item.medicine}</td>
                  <td class="text-center">${item.unitsSoldMonthly.toLocaleString()} units</td>
                  <td class="text-right font-semibold">${item.monthlyRevenue}</td>
                  <td class="text-center">${item.daysOfStockLeft} days left</td>
                  <td class="text-center">
                    <span class="badge badge-${item.reorderUrgency.toLowerCase()}">${item.reorderUrgency}</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <script>
            window.onload = function() {
              window.focus();
            };
          </script>
        </body>
        </html>
      `;

      openPrintDocument(html, 'Inventory_Valuation_and_Forecast_Report');
    }

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

        {isMobile ? (
          <View style={styles.mobileCardsList}>
            {loading ? (
              <View style={{ padding: 20 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonTableRow key={i} />
                ))}
              </View>
            ) : (
              paginatedCategories.map((cat) => {
              const badge = HEALTH_BADGES[cat.status] || HEALTH_BADGES.Optimal;
              return (
                <View key={cat.category} style={styles.mobileReportCard}>
                  <View style={styles.mobileReportCardHeader}>
                    <Text style={styles.mobileCatName}>{cat.category}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                        {cat.status}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.mobileValuationRow}>
                    <Text style={styles.mobileValLabel}>VALUATION</Text>
                    <Text style={styles.mobileValAmount}>{cat.valuation}</Text>
                  </View>

                  <View style={styles.mobileReportDetailsGrid}>
                    <View style={styles.mobileReportDetailItem}>
                      <Text style={styles.mobileReportDetailLabel}>ITEMS COUNT</Text>
                      <Text style={styles.mobileReportDetailVal}>{cat.totalItems}</Text>
                    </View>
                    <View style={styles.mobileReportDetailItem}>
                      <Text style={styles.mobileReportDetailLabel}>TURNOVER RATE</Text>
                      <Text style={[styles.mobileReportDetailVal, { color: '#0F766E' }]}>{cat.turnover}</Text>
                    </View>
                    <View style={styles.mobileReportDetailItem}>
                      <Text style={styles.mobileReportDetailLabel}>HOLDING %</Text>
                      <Text style={styles.mobileReportDetailVal}>{cat.holdingPercent}</Text>
                    </View>
                  </View>
                </View>
              );
            }))}
          </View>
        ) : (
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

              {loading ? (
                <View style={{ padding: 20 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonTableRow key={i} />
                  ))}
                </View>
              ) : (
                paginatedCategories.map((cat, index) => {
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
              }))}
            </View>
          </ScrollView>
        )}
        {!loading && MOCK_INVENTORY_CATEGORY_VALUATION.length > 0 && (
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={MOCK_INVENTORY_CATEGORY_VALUATION.length}
          />
        )}
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

        {isMobile ? (
          <View style={styles.mobileCardsList}>
            {MOCK_FAST_MOVING_ITEMS.map((item) => {
              const badge = URGENCY_BADGES[item.reorderUrgency] || URGENCY_BADGES.Low;
              return (
                <View key={item.sku} style={styles.mobileReportCard}>
                  <View style={styles.mobileReportCardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.skuText}>{item.sku}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                        {item.reorderUrgency} Urgency
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.mobileMedName}>{item.medicine}</Text>

                  <View style={styles.mobileReportDetailsGrid}>
                    <View style={styles.mobileReportDetailItem}>
                      <Text style={styles.mobileReportDetailLabel}>MONTHLY SALES</Text>
                      <Text style={styles.mobileReportDetailVal}>{item.unitsSoldMonthly.toLocaleString()} units</Text>
                    </View>
                    <View style={styles.mobileReportDetailItem}>
                      <Text style={styles.mobileReportDetailLabel}>REVENUE</Text>
                      <Text style={[styles.mobileReportDetailVal, { color: '#0F766E' }]}>{item.monthlyRevenue}</Text>
                    </View>
                    <View style={styles.mobileReportDetailItem}>
                      <Text style={styles.mobileReportDetailLabel}>STOCK RUNWAY</Text>
                      <Text style={[styles.mobileReportDetailVal, { color: item.daysOfStockLeft <= 15 ? '#DC2626' : '#D97706' }]}>
                        {item.daysOfStockLeft} days left
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
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
  // Mobile Report KPI Cards
  mobileCardsList: {
    padding: 12,
    gap: 12,
  },
  mobileReportCard: {
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
  mobileReportCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  mobileCatName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  mobileMedName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  mobileValuationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0FDFA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  mobileValLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
    letterSpacing: 0.5,
  },
  mobileValAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F766E',
  },
  mobileReportDetailsGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    justifyContent: 'space-between',
  },
  mobileReportDetailItem: {
    alignItems: 'center',
    flex: 1,
  },
  mobileReportDetailLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  mobileReportDetailVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
});
