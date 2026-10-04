import React from 'react';
import { SuperAdminPalette as C } from '../../constants/theme';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';

import { useSuperAdmin } from './store';
import { useIsMobile } from '../../utils/responsive';

export default function SuperAdminDashboard() {
  const isMobile = useIsMobile();
  const {
    pharmacies,
    activePharmacies,
    expiringPharmacies,
    expiredPharmacies,
    metrics,
    charts,
  } = useSuperAdmin();

  const formattedRevenue = metrics?.monthlyRevenue !== undefined
    ? `₹${metrics.monthlyRevenue.toLocaleString('en-IN')}`
    : '₹12,45,000';

  const usersDisplay = metrics?.totalUsersUsed !== undefined
    ? `${metrics.totalUsersUsed} / ${metrics.totalUserLimit || 1800}`
    : '1,248 / 1,800';

  const userQuotaPercent = metrics?.totalUserLimit && metrics.totalUserLimit > 0
    ? Math.round((metrics.totalUsersUsed / metrics.totalUserLimit) * 100)
    : 69;

  const activeCount = charts?.statusDistribution?.active ?? activePharmacies.length;
  const expiringCount = charts?.statusDistribution?.expiringSoon ?? expiringPharmacies.length;
  const expiredCount = charts?.statusDistribution?.expired ?? expiredPharmacies.length;
  const totalDistribution = Math.max(activeCount + expiringCount + expiredCount, 1);
  const activePercent = ((activeCount / totalDistribution) * 100).toFixed(1);
  const expiringPercent = ((expiringCount / totalDistribution) * 100).toFixed(1);
  const expiredPercent = ((expiredCount / totalDistribution) * 100).toFixed(1);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isMobile && styles.contentMobile]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.subtitle}>
            Welcome back, Super Admin! Here’s an overview of your platform.
          </Text>
        </View>

      </View>

      <View style={styles.statsGrid}>
        <KpiCard
          title="Total Pharmacies"
          value={String(metrics?.totalPharmacies ?? pharmacies.length)}
          subtitle="+3 onboarded this month"
          trend="▲ +12% MoM"
          trendPositive={true}
          color={C.sageGreen}
          icon="⌂"
          onPress={() => router.push('/superadmin/pharmacies')}
        />

        <KpiCard
          title="Active Subscriptions"
          value={String(metrics?.activeSubscriptions ?? activePharmacies.length)}
          subtitle={`${Math.round(
            (activePharmacies.length / Math.max(pharmacies.length, 1)) * 100,
          )}% active retention`}
          trend="● 80% Healthy"
          trendPositive={true}
          color={C.dustyRose}
          icon="✓"
          progress={80}
          onPress={() => router.push('/superadmin/pharmacies')}
        />

        <KpiCard
          title="Expiring Soon"
          value={String(metrics?.expiringSoon ?? expiringPharmacies.length)}
          subtitle="Expires within 7 days"
          trend="⚠ Action Needed"
          trendPositive={false}
          color={C.warmGold}
          icon="◷"
          onPress={() => router.push('/superadmin/pharmacies')}
        />

        <KpiCard
          title="Monthly SaaS Revenue"
          value={formattedRevenue}
          subtitle="+18.7% revenue growth"
          trend="▲ +18.7%"
          trendPositive={true}
          color={C.sageGreen}
          icon="₹"
          onPress={() => router.push('/superadmin/razorpay-payment')}
        />

        <KpiCard
          title="Total Users (SaaS)"
          value={usersDisplay}
          subtitle={`${userQuotaPercent}% platform quota used`}
          trend={`● ${userQuotaPercent}% Quota`}
          trendPositive={true}
          color={C.dustyRose}
          icon="▦"
          progress={userQuotaPercent}
          onPress={() => router.push('/superadmin/pharmacies')}
        />
      </View>

      <View style={[styles.threeColumn, isMobile && styles.mobileColumn]}>
        <Panel title="Subscription Status Overview" mobile={isMobile}>
          <View style={[styles.statusChart, isMobile && styles.statusChartMobile]}>
            <View style={styles.chartRing}>
              <Text style={styles.chartNumber}>
                {activeCount}
              </Text>
              <Text style={styles.chartLabel}>Active</Text>
            </View>

            <View style={styles.legend}>
              <Text style={styles.activeLegend}>
                ● Active {activeCount} ({activePercent}%)
              </Text>
              <Text style={styles.expiringLegend}>
                ● Expiring Soon {expiringCount} ({expiringPercent}%)
              </Text>
              <Text style={styles.expiredLegend}>
                ● Expired {expiredCount} ({expiredPercent}%)
              </Text>
            </View>
          </View>

          <View style={styles.alertBox}>
            <Text style={styles.alertText}>
              {expiringCount} subscriptions are expiring within 30 days.
            </Text>
          </View>
        </Panel>

        <Panel title="Pharmacies Trend" mobile={isMobile}>
          <View style={styles.trendHeader}>
            <Text style={styles.trendText}>This Month</Text>
            <Text style={styles.trendArrow}>⌄</Text>
          </View>

          <View style={styles.trendChart}>
            <View style={[styles.trendLine, styles.trendLineOne]} />
            <View style={[styles.trendLine, styles.trendLineTwo]} />
            <View style={[styles.trendLine, styles.trendLineThree]} />
            <View style={[styles.trendLine, styles.trendLineFour]} />
          </View>

          <View style={styles.dateLabels}>
            {charts?.trend && charts.trend.length > 0 ? (
              charts.trend.map((t: any) => <Text key={t.month_key}>{t.month}</Text>)
            ) : (
              <>
                <Text>Apr</Text>
                <Text>May</Text>
                <Text>Jun</Text>
                <Text>Jul</Text>
                <Text>Aug</Text>
                <Text>Sep</Text>
              </>
            )}
          </View>

          <View style={styles.trendFooter}>
            <View>
              <Text style={styles.smallText}>New Pharmacies</Text>
              <Text style={styles.greenValue}>
                +{metrics?.totalPharmacies ? metrics.totalPharmacies : '14'}
              </Text>
            </View>

            <View>
              <Text style={styles.smallText}>New Subscriptions</Text>
              <Text style={styles.greenValue}>
                +{metrics?.activeSubscriptions ? metrics.activeSubscriptions : '3'}
              </Text>
            </View>
          </View>
        </Panel>

        <Panel title="Top Plans by Revenue" mobile={isMobile}>
          {charts?.topPlans && charts.topPlans.length > 0 ? (
            charts.topPlans.slice(0, 5).map((plan: any, idx: number) => (
              <RevenueRow
                key={`${plan.plan_name}-${idx}`}
                label={plan.plan_name}
                amount={`₹${Number(plan.total_revenue || 0).toLocaleString('en-IN')}`}
                color={C.dustyRose}
              />
            ))
          ) : (
            <>
              <RevenueRow label="Professional" amount="₹5,20,000"               color={C.sageGreen} />
              <RevenueRow label="Standard" amount="₹3,65,000" color={C.dustyRose} />
              <RevenueRow label="Custom" amount="₹1,85,000" color={C.dustyRose} />
              <RevenueRow label="Enterprise" amount="₹90,000" color={C.warmGold} />
              <RevenueRow label="Basic" amount="₹85,000" color={C.mutedGray} />
            </>
          )}
        </Panel>
      </View>

      <View style={[styles.bottomRow, isMobile && styles.mobileColumn]}>
        <Panel title="Recently Onboarded Pharmacies" large mobile={isMobile}>
          {pharmacies.slice(0, 4).map((pharmacy) => (
            <Pressable
              key={pharmacy.id}
              style={[styles.pharmacyRow, isMobile && styles.pharmacyRowMobile]}
              onPress={() =>
                router.push({
                  pathname: '/superadmin/pharmacy-details',
                  params: { pharmacyId: pharmacy.id },
                })
              }
            >
              <Text style={[styles.pharmacyName, isMobile && styles.pharmacyNameMobile]}>{pharmacy.name}</Text>
              <Text style={[styles.rowText, isMobile && styles.pharmacyMetaMobile]}>{pharmacy.adminName}</Text>
              <Text style={[styles.rowText, isMobile && styles.pharmacyMetaMobile]}>{pharmacy.plan}</Text>
              <Text style={[styles.rowText, isMobile && styles.pharmacyMetaMobile]}>{pharmacy.usersUsed}</Text>
              <Text
                style={
                  pharmacy.status === 'Active'
                    ? [styles.activeText, isMobile && styles.pharmacyMetaMobile]
                    : pharmacy.status === 'Expiring Soon'
                    ? [styles.expiringLegend, isMobile && styles.pharmacyMetaMobile]
                    : pharmacy.status === 'Deactivated'
                    ? [styles.expiredLegend, isMobile && styles.pharmacyMetaMobile]
                    : [styles.activeText, isMobile && styles.pharmacyMetaMobile]
                }
              >
                {pharmacy.status}
              </Text>
            </Pressable>
          ))}

          <Pressable
            style={styles.viewAllButton}
            onPress={() => router.push('/superadmin/pharmacies')}
          >
            <Text style={styles.viewAllText}>View All Pharmacies →</Text>
          </Pressable>
        </Panel>

        <Panel title="Upcoming Expiry (Next 30 Days)" mobile={isMobile}>
          {expiringPharmacies.map((pharmacy) => (
            <View key={pharmacy.id} style={styles.expiryRow}>
              <View>
                <Text style={styles.pharmacyName}>{pharmacy.name}</Text>
                <Text style={styles.rowText}>{pharmacy.plan}</Text>
              </View>

              <Text style={styles.expiringText}>7 days left</Text>
            </View>
          ))}

          {expiringPharmacies.length === 0 && (
            <Text style={styles.rowText}>No upcoming expiry.</Text>
          )}

          <Pressable
            style={styles.viewAllButton}
            onPress={() => router.push('/superadmin/pharmacies')}
          >
            <Text style={styles.viewAllText}>View All Expiring →</Text>
          </Pressable>
        </Panel>
      </View>
    </ScrollView>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  trend,
  trendPositive,
  color,
  icon,
  progress,
  onPress,
}: {
  title: string;
  value: string;
  subtitle: string;
  trend?: string;
  trendPositive?: boolean;
  color: string;
  icon: string;
  progress?: number;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.kpiCard} onPress={onPress}>
      <View style={styles.kpiTop}>
        <View style={[styles.kpiIcon, { backgroundColor: C.softRose }]}>
          <Text style={styles.kpiIconText}>{icon}</Text>
        </View>

        {trend && (
          <View
            style={[
              styles.kpiTrendBadge,
              trendPositive === false ? styles.kpiTrendNegative : styles.kpiTrendPositive,
            ]}
          >
            <Text
              style={[
                styles.kpiTrendText,
                trendPositive === false ? styles.kpiTrendNegativeText : styles.kpiTrendPositiveText,
              ]}
            >
              {trend}
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.kpiTitle}>{title}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiSubtitle}>{subtitle}</Text>

      {progress !== undefined && (
        <View style={styles.kpiProgressBarBg}>
          <View
            style={[
              styles.kpiProgressBarFill,
              { width: `${Math.min(progress, 100)}%`, backgroundColor: C.dustyRose },
            ]}
          />
        </View>
      )}
    </Pressable>
  );
}

function Panel({
  title,
  children,
  large = false,
  mobile = false,
}: {
  title: string;
  children: React.ReactNode;
  large?: boolean;
  mobile?: boolean;
}) {
  return (
    <View style={[styles.panel, large && styles.largePanel, mobile && styles.panelMobile]}>
      <Text style={styles.panelTitle}>{title}</Text>
      {children}
    </View>
  );
}

function RevenueRow({
  label,
  amount,
  color,
}: {
  label: string;
  amount: string;
  color: string;
}) {
  return (
    <View style={styles.revenueRow}>
      <Text style={[styles.revenueLabel, { color }]}>● {label}</Text>
      <Text style={styles.revenueAmount}>{amount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.offWhite,
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  contentMobile: {
    padding: 14,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  title: {
    color: C.charcoal,
    fontSize: 29,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 5,
    color: C.mutedGray,
    fontSize: 14,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  adminInitial: {
    width: 34,
    height: 34,
    paddingTop: 8,
    borderRadius: 20,
    textAlign: 'center',
    color: C.white,
    backgroundColor: C.dustyRose,
    fontWeight: '800',
  },
  adminName: {
    color: C.charcoal,
    fontSize: 12,
    fontWeight: '800',
  },
  adminRole: {
    color: C.mutedGray,
    fontSize: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  kpiCard: {
    flex: 1,
    minWidth: 200,
    padding: 18,
    borderRadius: 14,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.softGray,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  kpiTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  kpiIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiIconText: {
    color: C.iconRose,
    fontSize: 18,
    fontWeight: '900',
  },
  kpiTrendBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  kpiTrendPositive: {
    backgroundColor: C.sageTint,
  },
  kpiTrendPositiveText: {
    color: C.sageGreen,
    fontSize: 10,
    fontWeight: '800',
  },
  kpiTrendNegative: {
    backgroundColor: C.goldTint,
  },
  kpiTrendNegativeText: {
    color: C.warmGold,
    fontSize: 10,
    fontWeight: '800',
  },
  kpiTrendText: {
    fontSize: 10,
    fontWeight: '800',
  },
  kpiTitle: {
    color: C.mutedGray,
    fontSize: 12,
    fontWeight: '600',
  },
  kpiValue: {
    marginTop: 6,
    color: C.midnightViolet,
    fontSize: 24,
    fontWeight: '900',
  },
  kpiSubtitle: {
    marginTop: 4,
    color: C.mutedGray,
    fontSize: 11,
  },
  kpiProgressBarBg: {
    height: 4,
    backgroundColor: C.tableRose,
    borderRadius: 4,
    marginTop: 12,
    overflow: 'hidden',
  },
  kpiProgressBarFill: {
    height: 4,
    borderRadius: 4,
  },
  threeColumn: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 18,
  },
  mobileColumn: {
    flexDirection: 'column',
  },
  panel: {
    flex: 1,
    minWidth: 290,
    padding: 18,
    borderRadius: 12,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.softGray,
  },
  panelMobile: {
    width: '100%',
    minWidth: 0,
    flexBasis: '100%',
    padding: 16,
  },
  largePanel: {
    flex: 2,
  },
  panelTitle: {
    color: C.charcoal,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 16,
  },
  statusChart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  statusChartMobile: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  chartRing: {
    width: 112,
    height: 112,
    borderRadius: 60,
    borderWidth: 15,
    borderColor: C.sageGreen,
    borderRightColor: C.warmGold,
    borderBottomColor: C.softGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartNumber: {
    color: C.charcoal,
    fontSize: 21,
    fontWeight: '800',
  },
  chartLabel: {
    color: C.mutedGray,
    fontSize: 11,
  },
  legend: {
    gap: 9,
  },
  activeLegend: {
    color: C.sageGreen,
    fontSize: 11,
  },
  expiringLegend: {
    color: C.warmGold,
    fontSize: 11,
  },
  expiredLegend: {
    color: C.mutedGray,
    fontSize: 11,
  },
  alertBox: {
    marginTop: 16,
    padding: 10,
    borderRadius: 7,
    backgroundColor: C.sageTint,
  },
  alertText: {
    color: C.sageGreen,
    fontSize: 11,
    fontWeight: '700',
  },
  trendHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 5,
  },
  trendText: {
    color: C.mutedGray,
    fontSize: 11,
  },
  trendArrow: {
    color: C.mutedGray,
  },
  trendChart: {
    height: 120,
    marginTop: 10,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderColor: C.softGray,
    position: 'relative',
  },
  trendLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: C.sageGreen,
  },
  trendLineOne: {
    width: '27%',
    top: 78,
    left: '5%',
    transform: [{ rotate: '-12deg' }],
  },
  trendLineTwo: {
    width: '27%',
    top: 56,
    left: '27%',
    transform: [{ rotate: '10deg' }],
  },
  trendLineThree: {
    width: '27%',
    top: 48,
    left: '50%',
    transform: [{ rotate: '-14deg' }],
  },
  trendLineFour: {
    width: '27%',
    top: 35,
    left: '72%',
    transform: [{ rotate: '10deg' }],
  },
  dateLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  dateLabelsText: {
    color: C.mutedGray,
    fontSize: 9,
  },
  trendFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 17,
  },
  smallText: {
    color: C.mutedGray,
    fontSize: 10,
  },
  greenValue: {
    color: C.sageGreen,
    fontSize: 12,
    fontWeight: '800',
  },
  revenueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  revenueLabel: {
    fontSize: 11,
  },
  revenueAmount: {
    color: C.mutedGray,
    fontSize: 11,
    fontWeight: '700',
  },
  bottomRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 18,
  },
  pharmacyRow: {
    flexDirection: 'row',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.tableRose,
  },
  pharmacyRowMobile: {
    flexWrap: 'wrap',
    gap: 8,
  },
  pharmacyName: {
    flex: 1.5,
    color: C.mutedGray,
    fontSize: 11,
    fontWeight: '800',
  },
  pharmacyNameMobile: {
    flexBasis: '100%',
  },
  pharmacyMetaMobile: {
    flexBasis: '30%',
  },
  rowText: {
    flex: 1,
    color: C.mutedGray,
    fontSize: 11,
  },
  activeText: {
    flex: 1,
    color: C.sageGreen,
    fontSize: 11,
    fontWeight: '800',
  },
  expiryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.tableRose,
  },
  expiringText: {
    color: C.warmGold,
    fontSize: 10,
    fontWeight: '800',
  },
  viewAllButton: {
    marginTop: 15,
    alignItems: 'flex-end',
  },
  viewAllText: {
    color: C.sageGreen,
    fontSize: 11,
    fontWeight: '800',
  },
});
