import React, { useMemo, useState } from 'react';
import { SuperAdminPalette as C } from '../../constants/theme';
import { useIsMobile } from '../../utils/responsive';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';

import { useSuperAdmin } from './store';
import type { Pharmacy, PharmacyStatus, PlanName } from './types';

export default function PharmaciesTenantsPage() {
  const { pharmacies } = useSuperAdmin();
  const isMobile = useIsMobile();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'All Status' | PharmacyStatus
  >('All Status');
  const [planFilter, setPlanFilter] = useState<'All Plans' | PlanName>(
    'All Plans',
  );

  const filteredPharmacies = useMemo(() => {
    return pharmacies.filter((pharmacy) => {
      const searchText = `${pharmacy.name} ${pharmacy.adminName} ${pharmacy.email}`.toLowerCase();

      const matchesSearch = searchText.includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === 'All Status' ||
        pharmacy.status === statusFilter;

      const matchesPlan =
        planFilter === 'All Plans' ||
        pharmacy.plan === planFilter;

      return matchesSearch && matchesStatus && matchesPlan;
    });
  }, [pharmacies, search, statusFilter, planFilter]);

  const activeCount = pharmacies.filter(
    (item) => item.status === 'Active',
  ).length;

  const expiringCount = pharmacies.filter(
    (item) => item.status === 'Expiring Soon',
  ).length;

  const expiredCount = pharmacies.filter(
    (item) => item.status === 'Expired',
  ).length;

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('All Status');
    setPlanFilter('All Plans');
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isMobile && styles.contentMobile]}
      horizontal={false}
    >
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View>
          <Text style={styles.title}>Pharmacies / Tenants</Text>
          <Text style={styles.subtitle}>
            View and manage all onboarded pharmacy businesses.
          </Text>
        </View>

        <Pressable
          style={styles.addButton}
          onPress={() => router.push('/superadmin/add-pharmacy')}
        >
          <Text style={styles.addButtonText}>＋ Add Pharmacy</Text>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <SummaryCard
          title="Total Pharmacies"
          value={String(pharmacies.length)}
          subtitle="View all pharmacies"
          icon="⌂"
          color={C.sageTint}
        />

        <SummaryCard
          title="Active"
          value={String(activeCount)}
          subtitle="Currently active"
          icon="✓"
          color={C.softRose}
        />

        <SummaryCard
          title="Expiring Soon"
          value={String(expiringCount)}
          subtitle="Within next 30 days"
          icon="◷"
          color={C.goldTint}
        />

        <SummaryCard
          title="Expired"
          value={String(expiredCount)}
          subtitle="Subscription expired"
          icon="×"
          color={C.redTint}
        />
      </View>

      <View style={styles.filters}>
        <View style={[styles.searchBox, isMobile && styles.searchBoxMobile]}>
          <Text style={styles.searchIcon}>⌕</Text>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search pharmacy name, admin..."
            placeholderTextColor={C.mutedGray}
            style={styles.searchInput}
          />
        </View>

        <FilterSelect
          value={statusFilter}
          options={[
            'All Status',
            'Active',
            'Expiring Soon',
            'Expired',
            'Deactivated',
          ]}
          onChange={(value) =>
            setStatusFilter(value as 'All Status' | PharmacyStatus)
          }
        />

        <FilterSelect
          value={planFilter}
          options={[
            'All Plans',
            'Basic',
            'Standard',
            'Professional',
            'Enterprise',
            'Custom',
          ]}
          onChange={(value) =>
            setPlanFilter(value as 'All Plans' | PlanName)
          }
        />

        <Pressable style={styles.clearButton} onPress={clearFilters}>
          <Text style={styles.clearText}>⟳ Clear</Text>
        </Pressable>
      </View>

      <View style={styles.tableCard}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.tableWidth}>
            <View style={styles.tableHeader}>
              <Text style={[styles.heading, styles.pharmacyColumn]}>
                Pharmacy / Tenant
              </Text>

              <Text style={[styles.heading, styles.adminColumn]}>
                Admin / Email
              </Text>

              <Text style={[styles.heading, styles.planColumn]}>
                Plan
              </Text>

              <Text style={[styles.heading, styles.usersColumn]}>
                Users (Used / Limit)
              </Text>

              <Text style={[styles.heading, styles.branchColumn]}>
                Branches
              </Text>

              <Text style={[styles.heading, styles.expiryColumn]}>
                Expiry Date
              </Text>

              <Text style={[styles.heading, styles.statusColumn]}>
                Status
              </Text>

              <Text style={[styles.heading, styles.actionColumn]}>
                Actions
              </Text>
            </View>

            {filteredPharmacies.map((pharmacy) => (
              <PharmacyRow
                key={pharmacy.id}
                pharmacy={pharmacy}
                onView={() =>
                  router.push({
                    pathname: '/superadmin/pharmacy-details',
                    params: {
                      pharmacyId: pharmacy.id,
                    },
                  })
                }
              />
            ))}

            {filteredPharmacies.length === 0 && (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  No pharmacies found.
                </Text>
              </View>
            )}

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Showing 1 to {filteredPharmacies.length} of{' '}
                {pharmacies.length} entries
              </Text>

              <View style={styles.pagination}>
                <Pressable style={styles.pageButton}>
                  <Text>‹</Text>
                </Pressable>

                <Pressable
                  style={[styles.pageButton, styles.activePage]}
                >
                  <Text style={styles.activePageText}>1</Text>
                </Pressable>

                <Pressable style={styles.pageButton}>
                  <Text>2</Text>
                </Pressable>

                <Pressable style={styles.pageButton}>
                  <Text>3</Text>
                </Pressable>

                <Text style={styles.dots}>...</Text>

                <Pressable style={styles.pageButton}>
                  <Text>6</Text>
                </Pressable>

                <Pressable style={styles.pageButton}>
                  <Text>›</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
  color: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor: C.softRose }]}>
        <Text style={styles.summaryIconText}>{icon}</Text>
      </View>

      <View>
        <Text style={styles.summaryTitle}>{title}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
        <Text style={styles.summarySubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function FilterSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={[styles.filterWrapper, open && { zIndex: 10002 }]}>
      <Pressable
        style={[styles.filterButton, open && styles.activeFilterButton]}
        onPress={() => setOpen((current) => !current)}
      >
        <Text style={[styles.filterText, open && styles.activeFilterText]}>{value}</Text>
        <Text style={styles.filterArrow}>{open ? '⌃' : '⌄'}</Text>
      </Pressable>

      {open && (
        <View style={styles.dropdown}>
          {options.map((option) => (
            <Pressable
              key={option}
              style={[
                styles.dropdownItem,
                option === value && styles.activeDropdownItem,
              ]}
              onPress={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              <Text style={[styles.dropdownText, option === value && styles.activeDropdownText]}>
                {option === value ? '✓ ' : '  '}
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function PharmacyRow({
  pharmacy,
  onView,
}: {
  pharmacy: Pharmacy;
  onView: () => void;
}) {
  const limit = pharmacy.userLimit > 0 ? pharmacy.userLimit : 1;
  const usagePercent = Math.min(
    Math.max(0, Math.round(((pharmacy.usersUsed || 0) / limit) * 100)),
    100,
  ) || 0;

  return (
    <View style={styles.tableRow}>
      <View style={[styles.pharmacyColumn, styles.pharmacyCell]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{pharmacy.initials}</Text>
        </View>

        <View>
          <Text style={styles.pharmacyName}>{pharmacy.name}</Text>
          <Text style={styles.branchText}>
            {pharmacy.branches}{' '}
            {pharmacy.branches === 1 ? 'branch' : 'branches'}
          </Text>
        </View>
      </View>

      <View style={styles.adminColumn}>
        <Text style={styles.adminName}>{pharmacy.adminName}</Text>
        <Text style={styles.email}>{pharmacy.email}</Text>
      </View>

      <View style={styles.planColumn}>
        <PlanBadge plan={pharmacy.plan} />
      </View>

      <View style={styles.usersColumn}>
        <Text style={styles.userText}>
          {pharmacy.usersUsed} / {pharmacy.userLimit}
        </Text>

        <View style={styles.progressBackground}>
          <View
            style={[
              styles.progressValue,
              {
                width: `${usagePercent}%`,
              },
            ]}
          />
        </View>
      </View>

      <Text style={[styles.cellText, styles.branchColumn]}>
        {pharmacy.branches}
      </Text>

      <View style={styles.expiryColumn}>
        <Text style={styles.expiryText}>{pharmacy.expiryDate}</Text>
        <Text
          style={[
            styles.daysText,
            pharmacy.status === 'Expiring Soon' && styles.orangeText,
            pharmacy.status === 'Expired' && styles.redText,
          ]}
        >
          {pharmacy.status === 'Expired'
            ? 'Expired'
            : pharmacy.status === 'Expiring Soon'
              ? '7 days left'
              : pharmacy.status === 'Pending Payment'
                ? 'Pending Payment'
                : 'Active subscription'}
        </Text>
      </View>

      <View style={styles.statusColumn}>
        <StatusBadge status={pharmacy.status} />
      </View>

      <View style={styles.actionColumn}>
        <Pressable onPress={onView}>
          <Text style={styles.viewText}>View</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PlanBadge({ plan }: { plan: PlanName | string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    Basic: { bg: C.softRose, text: C.dustyRose },
    Standard: { bg: C.goldTint, text: C.warmGold },
    Professional: { bg: C.softRose, text: C.dustyRose },
    Enterprise: { bg: C.sageTint, text: C.sageGreen },
    Custom: { bg: C.sageTint, text: C.sageGreen },
  };

  const scheme = (plan && colors[plan]) || { bg: C.tableRose, text: C.mutedGray };

  return (
    <Text
      style={[
        styles.planBadge,
        {
          backgroundColor: scheme.bg,
          color: scheme.text,
        },
      ]}
    >
      {plan || 'Basic'}
    </Text>
  );
}

function StatusBadge({ status }: { status: PharmacyStatus | string }) {
  let style = styles.expiringBadge;
  if (status === 'Active') {
    style = styles.activeBadge;
  } else if (status === 'Expired') {
    style = styles.expiredBadge;
  } else if (status === 'Deactivated') {
    style = styles.deactivatedBadge;
  } else if (status === 'Pending Payment' || status === 'PENDING_PAYMENT') {
    style = styles.pendingBadge;
  }

  return <Text style={[styles.statusBadge, style]}>{status || 'Active'}</Text>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.offWhite,
  },
  content: {
    padding: 24,
    paddingBottom: 50,
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
  headerMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
  },
  title: {
    color: C.charcoal,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 5,
    color: C.mutedGray,
    fontSize: 14,
  },
  addButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: C.dustyRose,
  },
  addButtonText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 18,
  },
  summaryCard: {
    flex: 1,
    minWidth: 190,
    minHeight: 92,
    padding: 16,
    borderRadius: 12,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.softGray,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryIconText: {
    color: C.iconRose,
    fontSize: 20,
    fontWeight: '800',
  },
  summaryTitle: {
    color: C.mutedGray,
    fontSize: 12,
  },
  summaryValue: {
    marginTop: 3,
    color: C.midnightViolet,
    fontSize: 24,
    fontWeight: '800',
  },
  summarySubtitle: {
    marginTop: 2,
    color: C.mutedGray,
    fontSize: 11,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    position: 'relative',
    zIndex: 9999,
    elevation: 9999,
  },
  searchBox: {
    width: 290,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.softGray,
    backgroundColor: C.white,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchBoxMobile: {
    width: '100%',
    flexBasis: '100%',
  },
  searchIcon: {
    marginRight: 7,
    color: C.mutedGray,
    fontSize: 20,
  },
  searchInput: {
    flex: 1,
    color: C.mutedGray,
    fontSize: 13,
  },
  filterWrapper: {
    position: 'relative',
    zIndex: 10000,
    elevation: 10000,
  },
  filterButton: {
    minWidth: 125,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.softGray,
    backgroundColor: C.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeFilterButton: {
    borderColor: C.sageGreen,
    backgroundColor: C.sageTint,
  },
  activeFilterText: {
    color: C.sageGreen,
    fontWeight: '800',
  },
  filterText: {
    color: C.mutedGray,
    fontSize: 13,
  },
  filterArrow: {
    color: C.mutedGray,
    fontSize: 17,
  },
  dropdown: {
    position: 'absolute',
    top: 46,
    left: 0,
    minWidth: 180,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.softGray,
    backgroundColor: C.white,
    zIndex: 10001,
    elevation: 10001,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  dropdownItem: {
    padding: 11,
    borderBottomWidth: 1,
    borderBottomColor: C.tableRose,
  },
  activeDropdownItem: {
    backgroundColor: C.selectedRose,
  },
  activeDropdownText: {
    color: C.sageGreen,
    fontWeight: '800',
  },
  dropdownText: {
    color: C.mutedGray,
    fontSize: 13,
  },
  clearButton: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: C.tableRose,
    justifyContent: 'center',
  },
  clearText: {
    color: C.mutedGray,
    fontSize: 13,
    fontWeight: '700',
  },
  tableCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.softGray,
    backgroundColor: C.white,
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
  },
  tableWidth: {
    minWidth: 1120,
  },
  tableHeader: {
    minHeight: 48,
    paddingHorizontal: 12,
    backgroundColor: C.offWhite,
    borderBottomWidth: 1,
    borderBottomColor: C.softGray,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tableRow: {
    minHeight: 76,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.softGray,
    flexDirection: 'row',
    alignItems: 'center',
  },
  heading: {
    color: C.mutedGray,
    fontSize: 10,
    fontWeight: '800',
  },
  pharmacyColumn: {
    width: 220,
  },
  adminColumn: {
    width: 175,
  },
  planColumn: {
    width: 110,
  },
  usersColumn: {
    width: 145,
  },
  branchColumn: {
    width: 70,
  },
  expiryColumn: {
    width: 145,
  },
  statusColumn: {
    width: 125,
  },
  actionColumn: {
    width: 70,
  },
  pharmacyCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 35,
    height: 35,
    borderRadius: 8,
    backgroundColor: C.sageTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: C.sageGreen,
    fontSize: 12,
    fontWeight: '800',
  },
  pharmacyName: {
    color: C.charcoal,
    fontSize: 12,
    fontWeight: '800',
  },
  branchText: {
    marginTop: 3,
    color: C.mutedGray,
    fontSize: 10,
  },
  adminName: {
    color: C.mutedGray,
    fontSize: 12,
    fontWeight: '700',
  },
  email: {
    marginTop: 3,
    color: C.mutedGray,
    fontSize: 10,
  },
  planBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
  },
  userText: {
    color: C.mutedGray,
    fontSize: 12,
    fontWeight: '700',
  },
  progressBackground: {
    width: 90,
    height: 4,
    marginTop: 7,
    borderRadius: 5,
    backgroundColor: C.softGray,
  },
  progressValue: {
    height: 4,
    borderRadius: 5,
    backgroundColor: C.dustyRose,
  },
  cellText: {
    color: C.mutedGray,
    fontSize: 12,
  },
  expiryText: {
    color: C.mutedGray,
    fontSize: 11,
    fontWeight: '700',
  },
  daysText: {
    marginTop: 4,
    color: C.sageGreen,
    fontSize: 10,
    fontWeight: '700',
  },
  orangeText: {
    color: C.warmGold,
  },
  redText: {
    color: C.mutedRed,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
  },
  activeBadge: {
    color: C.sageGreen,
    backgroundColor: C.sageTint,
  },
  expiringBadge: {
    color: C.warmGold,
    backgroundColor: C.goldTint,
  },
  expiredBadge: {
    color: C.mutedRed,
    backgroundColor: C.redTint,
  },
  deactivatedBadge: {
    color: C.mutedGray,
    backgroundColor: C.softGray,
  },
  pendingBadge: {
    color: C.dustyRose,
    backgroundColor: C.softRose,
  },
  viewText: {
    color: C.deepDustyRose,
    fontSize: 12,
    fontWeight: '800',
  },
  footer: {
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: {
    color: C.mutedGray,
    fontSize: 12,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pageButton: {
    width: 28,
    height: 28,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: C.softGray,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePage: {
    borderColor: C.dustyRose,
    backgroundColor: C.dustyRose,
  },
  activePageText: {
    color: C.white,
    fontWeight: '800',
  },
  dots: {
    color: C.mutedGray,
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: C.mutedGray,
  },
});
