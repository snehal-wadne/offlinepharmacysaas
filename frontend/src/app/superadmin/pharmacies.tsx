import React, { useMemo, useState } from 'react';
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
      contentContainerStyle={styles.content}
      horizontal={false}
    >
      <View style={styles.header}>
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
          color="#DFF5ED"
        />

        <SummaryCard
          title="Active"
          value={String(activeCount)}
          subtitle="Currently active"
          icon="✓"
          color="#E7F0FF"
        />

        <SummaryCard
          title="Expiring Soon"
          value={String(expiringCount)}
          subtitle="Within next 30 days"
          icon="◷"
          color="#FFF4D9"
        />

        <SummaryCard
          title="Expired"
          value={String(expiredCount)}
          subtitle="Subscription expired"
          icon="×"
          color="#FEE2E2"
        />
      </View>

      <View style={styles.filters}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search pharmacy name, admin..."
            placeholderTextColor="#94A3B8"
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
      <View style={[styles.summaryIcon, { backgroundColor: color }]}>
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
  const usagePercent = Math.min(
    Math.round((pharmacy.usersUsed / pharmacy.userLimit) * 100),
    100,
  );

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

function PlanBadge({ plan }: { plan: PlanName }) {
  const colors: Record<PlanName, { bg: string; text: string }> = {
    Basic: { bg: '#DBEAFE', text: '#2563EB' },
    Standard: { bg: '#FEF3C7', text: '#B45309' },
    Professional: { bg: '#EDE9FE', text: '#7C3AED' },
    Enterprise: { bg: '#D1FAE5', text: '#047857' },
    Custom: { bg: '#DFF5ED', text: '#047857' },
  };

  return (
    <Text
      style={[
        styles.planBadge,
        {
          backgroundColor: colors[plan].bg,
          color: colors[plan].text,
        },
      ]}
    >
      {plan}
    </Text>
  );
}

function StatusBadge({ status }: { status: PharmacyStatus }) {
  const style =
    status === 'Active'
      ? styles.activeBadge
      : status === 'Expired'
        ? styles.expiredBadge
        : status === 'Deactivated'
          ? styles.deactivatedBadge
          : styles.expiringBadge;

  return <Text style={[styles.statusBadge, style]}>{status}</Text>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 24,
    paddingBottom: 50,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  title: {
    color: '#172033',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 5,
    color: '#718096',
    fontSize: 14,
  },
  addButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#047857',
  },
  addButtonText: {
    color: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    color: '#047857',
    fontSize: 20,
    fontWeight: '800',
  },
  summaryTitle: {
    color: '#64748B',
    fontSize: 12,
  },
  summaryValue: {
    marginTop: 3,
    color: '#172033',
    fontSize: 24,
    fontWeight: '800',
  },
  summarySubtitle: {
    marginTop: 2,
    color: '#94A3B8',
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
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchIcon: {
    marginRight: 7,
    color: '#64748B',
    fontSize: 20,
  },
  searchInput: {
    flex: 1,
    color: '#334155',
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
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeFilterButton: {
    borderColor: '#047857',
    backgroundColor: '#F0FDF4',
  },
  activeFilterText: {
    color: '#047857',
    fontWeight: '800',
  },
  filterText: {
    color: '#334155',
    fontSize: 13,
  },
  filterArrow: {
    color: '#64748B',
    fontSize: 17,
  },
  dropdown: {
    position: 'absolute',
    top: 46,
    left: 0,
    minWidth: 180,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
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
    borderBottomColor: '#F1F5F9',
  },
  activeDropdownItem: {
    backgroundColor: '#E2F5EF',
  },
  activeDropdownText: {
    color: '#047857',
    fontWeight: '800',
  },
  dropdownText: {
    color: '#334155',
    fontSize: 13,
  },
  clearButton: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#EEF2F7',
    justifyContent: 'center',
  },
  clearText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
  tableCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  tableRow: {
    minHeight: 76,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  heading: {
    color: '#64748B',
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
    backgroundColor: '#DFF5ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '800',
  },
  pharmacyName: {
    color: '#1E293B',
    fontSize: 12,
    fontWeight: '800',
  },
  branchText: {
    marginTop: 3,
    color: '#94A3B8',
    fontSize: 10,
  },
  adminName: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  email: {
    marginTop: 3,
    color: '#94A3B8',
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
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  progressBackground: {
    width: 90,
    height: 4,
    marginTop: 7,
    borderRadius: 5,
    backgroundColor: '#E2E8F0',
  },
  progressValue: {
    height: 4,
    borderRadius: 5,
    backgroundColor: '#16A47A',
  },
  cellText: {
    color: '#334155',
    fontSize: 12,
  },
  expiryText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '700',
  },
  daysText: {
    marginTop: 4,
    color: '#059669',
    fontSize: 10,
    fontWeight: '700',
  },
  orangeText: {
    color: '#D97706',
  },
  redText: {
    color: '#DC2626',
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
    color: '#047857',
    backgroundColor: '#D1FAE5',
  },
  expiringBadge: {
    color: '#B45309',
    backgroundColor: '#FEF3C7',
  },
  expiredBadge: {
    color: '#B91C1C',
    backgroundColor: '#FEE2E2',
  },
  deactivatedBadge: {
    color: '#475569',
    backgroundColor: '#E2E8F0',
  },
  viewText: {
    color: '#047857',
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
    color: '#64748B',
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
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePage: {
    borderColor: '#047857',
    backgroundColor: '#047857',
  },
  activePageText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  dots: {
    color: '#64748B',
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748B',
  },
});
