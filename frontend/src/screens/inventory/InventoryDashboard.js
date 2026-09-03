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
import {
  DASHBOARD_KPIS,
  SALES_OVERVIEW_DATA,
  PAYMENT_METHODS_DATA,
  QUICK_ACCESS_BUTTONS,
  PERMISSION_OVERVIEW_ROWS,
} from '../../data/inventoryDashboardMockData';

export default function InventoryDashboard({ onNavigate, onShowToast }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  // Selected Time Filter for Sales Overview
  const [salesTimeFilter, setSalesTimeFilter] = useState('This Week');
  const [timeDropdownOpen, setTimeDropdownOpen] = useState(false);

  // Active Hovered/Selected Day for Tooltip in Sales Chart
  const [activeDayIdx, setActiveDayIdx] = useState(3); // Default to Thu

  // Active Highlighted Payment Method
  const [hoveredPaymentId, setHoveredPaymentId] = useState(null);

  // Selected KPI card for active highlight
  const [selectedKpi, setSelectedKpi] = useState('kpi-sales');

  const handleQuickActionPress = (button) => {
    if (onNavigate && button.route) {
      onNavigate(button.route);
    }
    if (onShowToast) {
      onShowToast(`Quick Access: ${button.label}`);
    }
  };

  const handleManagePermissions = () => {
    if (onNavigate) {
      onNavigate('roles-permissions');
    }
  };

  // Sparkline mini smooth SVG chart
  const renderSparkline = (points, color, gradientId) => {
    const minVal = Math.min(...points);
    const maxVal = Math.max(...points);
    const range = maxVal - minVal || 1;
    const width = 80;
    const height = 30;

    const coords = points.map((p, idx) => {
      const x = (idx / (points.length - 1)) * width;
      const y = height - 4 - ((p - minVal) / range) * (height - 8);
      return { x, y };
    });

    // Generate smooth cubic bezier SVG path
    let linePath = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i];
      const p1 = coords[i + 1];
      const cpX1 = p0.x + (p1.x - p0.x) / 2;
      const cpY1 = p0.y;
      const cpX2 = p0.x + (p1.x - p0.x) / 2;
      const cpY2 = p1.y;
      linePath += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }

    const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

    if (Platform.OS === 'web') {
      return (
        <div style={{ width: 80, height: 30, display: 'inline-block' }}>
          <svg width="80" height="30" viewBox="0 0 80 30" style={{ overflow: 'visible' }}>
            <defs>
              <linearGradient id={`grad-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                <stop offset="100%" stopColor={color} stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#grad-${gradientId})`} />
            <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="2.5" fill={color} />
          </svg>
        </div>
      );
    }

    // React Native Fallback
    return (
      <View style={styles.nativeSparkline}>
        {points.map((p, idx) => (
          <View
            key={idx}
            style={[
              styles.nativeSparkDot,
              {
                left: (idx / (points.length - 1)) * 65,
                bottom: ((p - minVal) / range) * 20,
                backgroundColor: color,
              },
            ]}
          />
        ))}
      </View>
    );
  };

  // High-Quality Sales Overview Line & Area Chart
  const renderSalesAreaChart = () => {
    const data = SALES_OVERVIEW_DATA;
    const maxVal = 35000;
    const chartW = 560;
    const chartH = 160;
    const paddingLeft = 36;
    const paddingBottom = 24;
    const plotW = chartW - paddingLeft - 16;
    const plotH = chartH - paddingBottom - 10;

    const coords = data.map((d, idx) => {
      const x = paddingLeft + (idx / (data.length - 1)) * plotW;
      const y = plotH + 10 - (d.value / maxVal) * plotH;
      return { x, y, ...d };
    });

    // Build smooth curve
    let linePath = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i];
      const p1 = coords[i + 1];
      const cpX1 = p0.x + (p1.x - p0.x) / 2;
      const cpY1 = p0.y;
      const cpX2 = p0.x + (p1.x - p0.x) / 2;
      const cpY2 = p1.y;
      linePath += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }

    const lastX = coords[coords.length - 1].x;
    const firstX = coords[0].x;
    const bottomY = plotH + 10;
    const areaPath = `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;

    const activePoint = coords[activeDayIdx] || coords[3];

    return (
      <View style={styles.chartOuterContainer}>
        {/* Floating Tooltip Display */}
        <View style={styles.chartTooltipRow}>
          <View style={styles.chartTooltipBadge}>
            <View style={styles.tooltipDot} />
            <Text style={styles.tooltipText}>
              <Text style={styles.tooltipBold}>{activePoint.day}: </Text>
              {activePoint.label} (₹{activePoint.value.toLocaleString()})
            </Text>
          </View>
        </View>

        {Platform.OS === 'web' ? (
          <div style={{ width: '100%', height: 180, position: 'relative' }}>
            <svg
              viewBox={`0 0 ${chartW} ${chartH + 10}`}
              style={{ width: '100%', height: '100%', overflow: 'visible' }}
            >
              <defs>
                <linearGradient id="salesAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0F766E" stopOpacity="0.22" />
                  <stop offset="60%" stopColor="#0F766E" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#0F766E" stopOpacity="0.00" />
                </linearGradient>
              </defs>

              {/* Horizontal Grid lines & Y-Axis Labels */}
              {[0, 10000, 20000, 30000].map((val) => {
                const y = plotH + 10 - (val / maxVal) * plotH;
                const label = val === 0 ? '0' : `₹${val / 1000}k`;
                return (
                  <g key={val}>
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={chartW - 10}
                      y2={y}
                      stroke="#F1F5F9"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={paddingLeft - 6}
                      y={y + 3.5}
                      fontSize="9"
                      fill="#94A3B8"
                      textAnchor="end"
                      fontWeight="600"
                    >
                      {label}
                    </text>
                  </g>
                );
              })}

              {/* Active Day Vertical Guideline */}
              <line
                x1={activePoint.x}
                y1={10}
                x2={activePoint.x}
                y2={bottomY}
                stroke="#0F766E"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.4"
              />

              {/* Shaded Area Under Curve */}
              <path d={areaPath} fill="url(#salesAreaGrad)" />

              {/* Smooth Trend Line */}
              <path
                d={linePath}
                fill="none"
                stroke="#0F766E"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Interactive Data Points & Hover Targets */}
              {coords.map((c, idx) => {
                const isActive = activeDayIdx === idx;
                return (
                  <g
                    key={c.day}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setActiveDayIdx(idx)}
                    onMouseEnter={() => setActiveDayIdx(idx)}
                  >
                    {/* Transparent Click Target */}
                    <circle cx={c.x} cy={c.y} r="14" fill="transparent" />

                    {/* Outer Glow on Active */}
                    {isActive && (
                      <circle
                        cx={c.x}
                        cy={c.y}
                        r="7"
                        fill="#0F766E"
                        fillOpacity="0.25"
                      />
                    )}

                    {/* Core Point Dot */}
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={isActive ? '4.5' : '3.5'}
                      fill={isActive ? '#0F766E' : '#FFFFFF'}
                      stroke="#0F766E"
                      strokeWidth={isActive ? '2.5' : '2'}
                    />

                    {/* X-Axis Day Label */}
                    <text
                      x={c.x}
                      y={chartH + 4}
                      fontSize="10.5"
                      fontWeight={isActive ? '800' : '600'}
                      fill={isActive ? '#0F766E' : '#64748B'}
                      textAnchor="middle"
                    >
                      {c.day}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        ) : (
          /* Native Fallback */
          <View style={styles.nativeChartBox}>
            <View style={styles.nativePlotRow}>
              {data.map((d, idx) => (
                <Pressable
                  key={d.day}
                  onPress={() => setActiveDayIdx(idx)}
                  style={styles.nativeBarCol}
                >
                  <View
                    style={[
                      styles.nativeBar,
                      {
                        height: (d.value / maxVal) * 110,
                        backgroundColor: activeDayIdx === idx ? '#0F766E' : '#99F6E4',
                      },
                    ]}
                  />
                  <Text style={styles.nativeDayText}>{d.day}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>
    );
  };

  // High-Quality SVG Donut Chart with Accurate Arc Math
  const renderDonutChart = () => {
    const size = 120;
    const strokeW = 16;
    const radius = (size - strokeW) / 2;
    const circumference = 2 * Math.PI * radius;

    let cumulativePct = 0;
    const segments = PAYMENT_METHODS_DATA.map((item) => {
      const strokeDasharray = `${(item.percentage / 100) * circumference} ${circumference}`;
      const strokeDashoffset = -((cumulativePct / 100) * circumference);
      cumulativePct += item.percentage;
      return {
        ...item,
        strokeDasharray,
        strokeDashoffset,
      };
    });

    return (
      <View style={styles.donutContainer}>
        {/* SVG Donut Ring with Center Stats */}
        <View style={styles.donutRingWrapper}>
          {Platform.OS === 'web' ? (
            <div style={{ width: size, height: size, position: 'relative' }}>
              <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {/* Background Ring */}
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke="#F1F5F9"
                  strokeWidth={strokeW}
                />

                {/* Colored Arcs for each payment method */}
                {segments.map((seg) => {
                  const isHovered = hoveredPaymentId === seg.id;
                  return (
                    <circle
                      key={seg.id}
                      cx={size / 2}
                      cy={size / 2}
                      r={radius}
                      fill="none"
                      stroke={seg.color}
                      strokeWidth={isHovered ? strokeW + 2 : strokeW}
                      strokeDasharray={seg.strokeDasharray}
                      strokeDashoffset={seg.strokeDashoffset}
                      strokeLinecap="round"
                      transform={`rotate(-90 ${size / 2} ${size / 2})`}
                      style={{
                        cursor: 'pointer',
                        transition: 'stroke-width 0.2s ease',
                      }}
                      onMouseEnter={() => setHoveredPaymentId(seg.id)}
                      onMouseLeave={() => setHoveredPaymentId(null)}
                    />
                  );
                })}
              </svg>

              {/* Center Donut Hole Text */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: size,
                  height: size,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, color: '#64748B' }}>
                  TOTAL
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>
                  ₹1.25L
                </span>
              </div>
            </div>
          ) : (
            <View style={styles.donutFallbackCircle}>
              <Text style={styles.donutCenterText}>₹1.25L</Text>
            </View>
          )}
        </View>

        {/* Legend Breakdown Table */}
        <View style={styles.donutLegendTable}>
          {PAYMENT_METHODS_DATA.map((method) => {
            const isHovered = hoveredPaymentId === method.id;
            return (
              <Pressable
                key={method.id}
                onPress={() => setHoveredPaymentId(isHovered ? null : method.id)}
                style={[styles.legendRow, isHovered && styles.legendRowHovered]}
              >
                <View style={styles.legendLeft}>
                  <View
                    style={[styles.legendDot, { backgroundColor: method.color }]}
                  />
                  <Text style={[styles.legendName, isHovered && styles.legendNameBold]}>
                    {method.name}
                  </Text>
                </View>
                <Text style={styles.legendPercentage}>{method.percentage}%</Text>
                <Text style={styles.legendAmount}>{method.amount}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        isMobile && styles.contentContainerMobile,
      ]}
      showsVerticalScrollIndicator={true}
    >
      {/* 1. Header Row */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.pageTitle}>Dashboard</Text>
          <Text style={styles.pageSubtitle}>
            Welcome back, Admin Owner! Here's what's happening.
          </Text>
        </View>

        {/* Date Filter Button */}
        <Pressable
          style={styles.datePickerBtn}
          onPress={() => {
            if (onShowToast) onShowToast('Date Range: 29 Aug 2026 - 29 Aug 2026');
          }}
          accessibilityRole="button"
          accessibilityLabel="Select Date Range"
        >
          <Text style={styles.datePickerIcon}>📅</Text>
          <Text style={styles.datePickerText}>29 Aug 2026 - 29 Aug 2026</Text>
        </Pressable>
      </View>

      {/* 2. Top 4 KPI Cards Grid */}
      <View style={[styles.kpiGrid, isCompact && styles.kpiGridCompact]}>
        {DASHBOARD_KPIS.map((kpi, idx) => {
          const isSelected = selectedKpi === kpi.id;
          return (
            <Pressable
              key={kpi.id}
              onPress={() => setSelectedKpi(kpi.id)}
              style={[styles.kpiCard, isSelected && styles.kpiCardSelected]}
              accessibilityRole="button"
              accessibilityLabel={`${kpi.title}: ${kpi.value}`}
            >
              <View style={styles.kpiTopRow}>
                <View>
                  <Text style={styles.kpiTitle}>{kpi.title}</Text>
                  <Text style={styles.kpiValue}>{kpi.value}</Text>
                </View>
                <View
                  style={[
                    styles.kpiIconCircle,
                    { backgroundColor: kpi.iconBg },
                  ]}
                >
                  <Text
                    style={[
                      styles.kpiIconText,
                      { color: kpi.iconColor },
                    ]}
                  >
                    {kpi.icon}
                  </Text>
                </View>
              </View>

              <View style={styles.kpiBottomRow}>
                <View style={styles.kpiTrendBadge}>
                  <Text style={styles.kpiTrendIcon}>↗</Text>
                  <Text style={styles.kpiTrendText}>{kpi.trend}</Text>
                </View>
                {renderSparkline(kpi.sparklinePoints, kpi.sparklineColor, `kpi-${idx}`)}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* 3. Middle Charts Section (Sales Overview & Payment Methods) */}
      <View style={[styles.chartsRow, isCompact && styles.chartsRowCompact]}>
        {/* Left: Sales Overview Area Chart */}
        <View style={[styles.chartCard, styles.salesOverviewCard]}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardHeaderTitle}>Sales Overview</Text>
            <Pressable
              onPress={() => setTimeDropdownOpen(!timeDropdownOpen)}
              style={styles.timeDropdownBtn}
              accessibilityRole="button"
              accessibilityLabel="Select Time Period"
            >
              <Text style={styles.timeDropdownBtnText}>{salesTimeFilter}</Text>
              <Text style={styles.timeDropdownChevron}>▾</Text>
            </Pressable>
          </View>
          {renderSalesAreaChart()}
        </View>

        {/* Right: Sales by Payment Method Donut Chart */}
        <View style={[styles.chartCard, styles.paymentMethodCard]}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardHeaderTitle}>Sales by Payment Method</Text>
          </View>
          {renderDonutChart()}
        </View>
      </View>

      {/* 4. Quick Access Row */}
      <View style={styles.quickAccessSection}>
        <Text style={styles.sectionHeading}>Quick Access</Text>
        <ScrollView
          horizontal={true}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickAccessRow}
        >
          {QUICK_ACCESS_BUTTONS.map((button) => (
            <Pressable
              key={button.id}
              onPress={() => handleQuickActionPress(button)}
              style={styles.quickAccessPill}
              accessibilityRole="button"
              accessibilityLabel={button.label}
            >
              <Text style={styles.quickAccessIcon}>{button.icon}</Text>
              <Text style={styles.quickAccessText}>{button.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* 5. Page Permissions Overview Table Card */}
      <View style={styles.permissionsCard}>
        <View style={styles.permissionsHeaderRow}>
          <View>
            <Text style={styles.permissionsTitle}>Page Permissions Overview</Text>
            <Text style={styles.permissionsSubtitle}>
              Manage what each role can see and do in the system.
            </Text>
          </View>

          <Pressable
            onPress={handleManagePermissions}
            style={styles.managePermsBtn}
            accessibilityRole="button"
            accessibilityLabel="Manage Permissions"
          >
            <Text style={styles.managePermsBtnText}>Manage Permissions</Text>
          </Pressable>
        </View>

        {/* Table Content */}
        <View style={styles.permsTable}>
          <View style={styles.permsTableHeader}>
            <Text style={[styles.permsTh, styles.colRole]}>Role</Text>
            <Text style={[styles.permsTh, styles.colUsers]}>Users</Text>
            <Text style={[styles.permsTh, styles.colAccess]}>Access Level</Text>
            <Text style={[styles.permsTh, styles.colStatus]}>Status</Text>
          </View>

          {PERMISSION_OVERVIEW_ROWS.map((row, idx) => {
            const isLast = idx === PERMISSION_OVERVIEW_ROWS.length - 1;
            return (
              <View
                key={row.id}
                style={[styles.permsTableRow, isLast && styles.permsTableRowLast]}
              >
                <Text style={[styles.permsTdRole, styles.colRole]}>{row.role}</Text>
                <Text style={[styles.permsTdUsers, styles.colUsers]}>{row.users}</Text>
                <Text style={[styles.permsTdAccess, styles.colAccess]}>
                  {row.accessLevel}
                </Text>
                <View style={[styles.colStatus, styles.statusCell]}>
                  <View style={styles.activeStatusPill}>
                    <Text style={styles.activeStatusText}>{row.status}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 60,
  },
  contentContainerMobile: {
    padding: 12,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 12,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    gap: 8,
    cursor: 'pointer',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      },
    }),
  },
  datePickerIcon: {
    fontSize: 13,
  },
  datePickerText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  /* KPI Grid */
  kpiGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  kpiGridCompact: {
    flexWrap: 'wrap',
  },
  kpiCard: {
    flex: 1,
    minWidth: 220,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    cursor: 'pointer',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      },
    }),
  },
  kpiCardSelected: {
    borderColor: '#0F766E',
    backgroundColor: '#FAFCFF',
  },
  kpiTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  kpiTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  kpiIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiIconText: {
    fontSize: 16,
    fontWeight: '700',
  },
  kpiBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  kpiTrendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  kpiTrendIcon: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '800',
  },
  kpiTrendText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#10B981',
  },
  nativeSparkline: {
    width: 70,
    height: 24,
    position: 'relative',
  },
  nativeSparkDot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  /* Charts Section */
  chartsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  chartsRowCompact: {
    flexDirection: 'column',
  },
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 18,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      },
    }),
  },
  salesOverviewCard: {
    flex: 1.6,
  },
  paymentMethodCard: {
    flex: 1.1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardHeaderTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  timeDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    gap: 6,
    cursor: 'pointer',
  },
  timeDropdownBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  timeDropdownChevron: {
    fontSize: 11,
    color: '#64748B',
  },
  chartOuterContainer: {
    width: '100%',
  },
  chartTooltipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 6,
  },
  chartTooltipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 6,
  },
  tooltipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0F766E',
  },
  tooltipText: {
    fontSize: 11.5,
    color: '#0F766E',
  },
  tooltipBold: {
    fontWeight: '700',
  },
  nativeChartBox: {
    height: 140,
    justifyContent: 'flex-end',
  },
  nativePlotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
  },
  nativeBarCol: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  nativeBar: {
    width: 24,
    borderRadius: 4,
  },
  nativeDayText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  /* Donut Chart */
  donutContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingTop: 8,
    flexWrap: 'wrap',
  },
  donutRingWrapper: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutFallbackCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 14,
    borderColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenterText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  donutLegendTable: {
    flex: 1,
    gap: 10,
    minWidth: 170,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 6,
    cursor: 'pointer',
  },
  legendRowHovered: {
    backgroundColor: '#F8FAFC',
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 65,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  legendNameBold: {
    fontWeight: '700',
    color: '#0F172A',
  },
  legendPercentage: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    width: 35,
    textAlign: 'right',
  },
  legendAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'right',
    flex: 1,
  },
  /* Quick Access */
  quickAccessSection: {
    marginBottom: 20,
    gap: 10,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    letterSpacing: 0.2,
  },
  quickAccessRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  quickAccessPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    gap: 8,
    cursor: 'pointer',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      },
    }),
  },
  quickAccessIcon: {
    fontSize: 14,
  },
  quickAccessText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  /* Page Permissions Overview Card */
  permissionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      },
    }),
  },
  permissionsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 12,
  },
  permissionsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  permissionsSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  managePermsBtn: {
    backgroundColor: '#0F766E',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    cursor: 'pointer',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(15, 118, 110, 0.2)',
      },
    }),
  },
  managePermsBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  permsTable: {
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 8,
    overflow: 'hidden',
  },
  permsTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  permsTh: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  permsTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  permsTableRowLast: {
    borderBottomWidth: 0,
  },
  colRole: {
    flex: 1.5,
    minWidth: 140,
  },
  colUsers: {
    flex: 0.8,
    minWidth: 60,
  },
  colAccess: {
    flex: 2.2,
    minWidth: 180,
  },
  colStatus: {
    flex: 1,
    minWidth: 80,
    alignItems: 'flex-end',
  },
  statusCell: {
    justifyContent: 'center',
  },
  permsTdRole: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  permsTdUsers: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  permsTdAccess: {
    fontSize: 12.5,
    color: '#64748B',
  },
  activeStatusPill: {
    backgroundColor: '#DCFCE7',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  activeStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
});
