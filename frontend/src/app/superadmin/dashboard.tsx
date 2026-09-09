import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';

import { useSuperAdmin } from './store';

export default function SuperAdminDashboard() {
  const {
    pharmacies,
    activePharmacies,
    expiringPharmacies,
    expiredPharmacies,
  } = useSuperAdmin();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
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
          value={String(pharmacies.length)}
          subtitle="+3 onboarded this month"
          trend="▲ +12% MoM"
          trendPositive={true}
          color="#047857"
          icon="⌂"
          onPress={() => router.push('/superadmin/pharmacies')}
        />

        <KpiCard
          title="Active Subscriptions"
          value={String(activePharmacies.length)}
          subtitle={`${Math.round(
            (activePharmacies.length / pharmacies.length) * 100,
          )}% active retention`}
          trend="● 80% Healthy"
          trendPositive={true}
          color="#2563EB"
          icon="✓"
          progress={80}
          onPress={() => router.push('/superadmin/pharmacies')}
        />

        <KpiCard
          title="Expiring Soon"
          value={String(expiringPharmacies.length)}
          subtitle="Expires within 7 days"
          trend="⚠ Action Needed"
          trendPositive={false}
          color="#D97706"
          icon="◷"
          onPress={() => router.push('/superadmin/pharmacies')}
        />

        <KpiCard
          title="Monthly SaaS Revenue"
          value="₹12,45,000"
          subtitle="+18.7% revenue growth"
          trend="▲ +18.7%"
          trendPositive={true}
          color="#059669"
          icon="₹"
          onPress={() => router.push('/superadmin/razorpay-payment')}
        />

        <KpiCard
          title="Total Users (SaaS)"
          value="1,248 / 1,800"
          subtitle="69% platform quota used"
          trend="● 69% Quota"
          trendPositive={true}
          color="#7C3AED"
          icon="▦"
          progress={69}
          onPress={() => router.push('/superadmin/pharmacies')}
        />
      </View>

      <View style={styles.threeColumn}>
        <Panel title="Subscription Status Overview">
          <View style={styles.statusChart}>
            <View style={styles.chartRing}>
              <Text style={styles.chartNumber}>
                {activePharmacies.length}
              </Text>
              <Text style={styles.chartLabel}>Active</Text>
            </View>

            <View style={styles.legend}>
              <Text style={styles.activeLegend}>
                ● Active {activePharmacies.length} (90.5%)
              </Text>
              <Text style={styles.expiringLegend}>
                ● Expiring Soon {expiringPharmacies.length} (4.8%)
              </Text>
              <Text style={styles.expiredLegend}>
                ● Expired {expiredPharmacies.length} (4.8%)
              </Text>
            </View>
          </View>

          <View style={styles.alertBox}>
            <Text style={styles.alertText}>
              {expiringPharmacies.length} subscriptions are expiring within
              30 days.
            </Text>
          </View>
        </Panel>

        <Panel title="Pharmacies Trend">
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
            <Text>01 Sep</Text>
            <Text>05 Sep</Text>
            <Text>10 Sep</Text>
            <Text>15 Sep</Text>
            <Text>20 Sep</Text>
            <Text>25 Sep</Text>
            <Text>30 Sep</Text>
          </View>

          <View style={styles.trendFooter}>
            <View>
              <Text style={styles.smallText}>New Pharmacies</Text>
              <Text style={styles.greenValue}>+5 +12%</Text>
            </View>

            <View>
              <Text style={styles.smallText}>New Subscriptions</Text>
              <Text style={styles.greenValue}>+6 +20%</Text>
            </View>
          </View>
        </Panel>

        <Panel title="Top Plans by Revenue">
          <RevenueRow label="Professional" amount="₹5,20,000" color="#16A47A" />
          <RevenueRow label="Standard" amount="₹3,65,000" color="#2563EB" />
          <RevenueRow label="Custom" amount="₹1,85,000" color="#7C3AED" />
          <RevenueRow label="Enterprise" amount="₹90,000" color="#D97706" />
          <RevenueRow label="Basic" amount="₹85,000" color="#64748B" />
        </Panel>
      </View>

      <View style={styles.bottomRow}>
        <Panel title="Recently Onboarded Pharmacies" large>
          {pharmacies.slice(0, 4).map((pharmacy) => (
            <Pressable
              key={pharmacy.id}
              style={styles.pharmacyRow}
              onPress={() =>
                router.push({
                  pathname: '/superadmin/pharmacy-details',
                  params: { pharmacyId: pharmacy.id },
                })
              }
            >
              <Text style={styles.pharmacyName}>{pharmacy.name}</Text>
              <Text style={styles.rowText}>{pharmacy.adminName}</Text>
              <Text style={styles.rowText}>{pharmacy.plan}</Text>
              <Text style={styles.rowText}>{pharmacy.usersUsed}</Text>
              <Text style={styles.activeText}>Active</Text>
            </Pressable>
          ))}

          <Pressable
            style={styles.viewAllButton}
            onPress={() => router.push('/superadmin/pharmacies')}
          >
            <Text style={styles.viewAllText}>View All Pharmacies →</Text>
          </Pressable>
        </Panel>

        <Panel title="Upcoming Expiry (Next 30 Days)">
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
        <View style={[styles.kpiIcon, { backgroundColor: color }]}>
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
              { width: `${Math.min(progress, 100)}%`, backgroundColor: color },
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
}: {
  title: string;
  children: React.ReactNode;
  large?: boolean;
}) {
  return (
    <View style={[styles.panel, large && styles.largePanel]}>
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
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  title: {
    color: '#172033',
    fontSize: 29,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 5,
    color: '#718096',
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
    color: '#FFFFFF',
    backgroundColor: '#087F63',
    fontWeight: '800',
  },
  adminName: {
    color: '#1E293B',
    fontSize: 12,
    fontWeight: '800',
  },
  adminRole: {
    color: '#94A3B8',
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  kpiTrendBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  kpiTrendPositive: {
    backgroundColor: '#D1FAE5',
  },
  kpiTrendPositiveText: {
    color: '#047857',
    fontSize: 10,
    fontWeight: '800',
  },
  kpiTrendNegative: {
    backgroundColor: '#FEF3C7',
  },
  kpiTrendNegativeText: {
    color: '#B45309',
    fontSize: 10,
    fontWeight: '800',
  },
  kpiTrendText: {
    fontSize: 10,
    fontWeight: '800',
  },
  kpiTitle: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  kpiValue: {
    marginTop: 6,
    color: '#172033',
    fontSize: 24,
    fontWeight: '900',
  },
  kpiSubtitle: {
    marginTop: 4,
    color: '#94A3B8',
    fontSize: 11,
  },
  kpiProgressBarBg: {
    height: 4,
    backgroundColor: '#F1F5F9',
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
  panel: {
    flex: 1,
    minWidth: 290,
    padding: 18,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  largePanel: {
    flex: 2,
  },
  panelTitle: {
    color: '#1F2937',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 16,
  },
  statusChart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  chartRing: {
    width: 112,
    height: 112,
    borderRadius: 60,
    borderWidth: 15,
    borderColor: '#19B486',
    borderRightColor: '#F59E0B',
    borderBottomColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartNumber: {
    color: '#172033',
    fontSize: 21,
    fontWeight: '800',
  },
  chartLabel: {
    color: '#64748B',
    fontSize: 11,
  },
  legend: {
    gap: 9,
  },
  activeLegend: {
    color: '#16A47A',
    fontSize: 11,
  },
  expiringLegend: {
    color: '#D97706',
    fontSize: 11,
  },
  expiredLegend: {
    color: '#64748B',
    fontSize: 11,
  },
  alertBox: {
    marginTop: 16,
    padding: 10,
    borderRadius: 7,
    backgroundColor: '#E3F7F0',
  },
  alertText: {
    color: '#087F63',
    fontSize: 11,
    fontWeight: '700',
  },
  trendHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 5,
  },
  trendText: {
    color: '#64748B',
    fontSize: 11,
  },
  trendArrow: {
    color: '#64748B',
  },
  trendChart: {
    height: 120,
    marginTop: 10,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  trendLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#16A47A',
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
    color: '#94A3B8',
    fontSize: 9,
  },
  trendFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 17,
  },
  smallText: {
    color: '#64748B',
    fontSize: 10,
  },
  greenValue: {
    color: '#059669',
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
    color: '#334155',
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
    borderBottomColor: '#F1F5F9',
  },
  pharmacyName: {
    flex: 1.5,
    color: '#334155',
    fontSize: 11,
    fontWeight: '800',
  },
  rowText: {
    flex: 1,
    color: '#64748B',
    fontSize: 11,
  },
  activeText: {
    flex: 1,
    color: '#059669',
    fontSize: 11,
    fontWeight: '800',
  },
  expiryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  expiringText: {
    color: '#D97706',
    fontSize: 10,
    fontWeight: '800',
  },
  viewAllButton: {
    marginTop: 15,
    alignItems: 'flex-end',
  },
  viewAllText: {
    color: '#087F63',
    fontSize: 11,
    fontWeight: '800',
  },
});
