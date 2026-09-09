import React from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useSuperAdmin } from './store';

export default function PharmacyDetailsPage() {
  const { pharmacyId } = useLocalSearchParams<{ pharmacyId?: string }>();
  const { getPharmacy, updatePharmacy } = useSuperAdmin();

  const pharmacy = pharmacyId ? getPharmacy(pharmacyId) : undefined;

  if (!pharmacy) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Pharmacy not found</Text>

        <Pressable
          style={styles.primaryButton}
          onPress={() => router.replace('/superadmin/pharmacies')}
        >
          <Text style={styles.primaryButtonText}>Back to Pharmacies</Text>
        </Pressable>
      </View>
    );
  }

  const isDeactivated = pharmacy.status === 'Deactivated';

  const toggleStatus = () => {
    updatePharmacy(pharmacy.id, {
      status: isDeactivated ? 'Active' : 'Deactivated',
    });
  };

  const openUpgrade = () => {
    if (isDeactivated) return;

    router.push({
      pathname: '/superadmin/add-pharmacy',
      params: {
        mode: 'upgrade',
        pharmacyId: pharmacy.id,
        name: pharmacy.name,
        adminName: pharmacy.adminName,
        email: pharmacy.email,
        phone: pharmacy.phone || '+91 98765 43210',
        address: pharmacy.address || 'No. 12, Residency Road, Shanthala Nagar',
        city: pharmacy.city || 'Bangalore',
        state: pharmacy.state || 'Karnataka',
        pincode: pharmacy.pincode || '560001',
        gstNumber: pharmacy.gstNumber || '',
        businessType: pharmacy.businessType || 'Private Limited',
        branches: String(pharmacy.branches),
      },
    });
  };

  const openRenew = () => {
    if (isDeactivated) return;

    router.push({
      pathname: '/superadmin/payment',
      params: {
        pharmacyId: pharmacy.id,
        mode: 'renew',
      },
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.breadcrumb}>
        <Pressable onPress={() => router.push('/superadmin/pharmacies')}>
          <Text style={styles.breadcrumbLink}>Pharmacies</Text>
        </Pressable>

        <Text style={styles.breadcrumbSeparator}>/</Text>
        <Text style={styles.breadcrumbCurrent}>{pharmacy.name} - View</Text>
      </View>

      <View style={styles.topSection}>
        <View style={styles.pharmacyHeading}>
          <View style={styles.largeAvatar}>
            <Text style={styles.largeAvatarText}>{pharmacy.initials}</Text>
          </View>

          <View>
            <Text style={styles.title}>{pharmacy.name}</Text>
            <Text style={styles.subtitle}>
              Pharmacy subscription and business details
            </Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            style={styles.deactivateButton}
            onPress={toggleStatus}
          >
            <Text style={styles.deactivateText}>
              {isDeactivated ? '✓ Activate' : '⊘ Deactivate'}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.upgradeButton, isDeactivated && styles.disabledButton]}
            disabled={isDeactivated}
            onPress={openUpgrade}
          >
            <Text style={styles.upgradeText}>↑ Upgrade Plan</Text>
          </Pressable>

          <Pressable
            style={[styles.renewButton, isDeactivated && styles.disabledButton]}
            disabled={isDeactivated}
            onPress={openRenew}
          >
            <Text style={styles.renewText}>⟳ Renew Subscription</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.summaryGrid}>
        <SummaryCard
          title="Current Plan"
          value={pharmacy.plan}
          footer="View plan details"
          color="#F0E8FF"
        />

        <SummaryCard
          title="Users Used / Limit"
          value={`${pharmacy.usersUsed} / ${pharmacy.userLimit}`}
          footer={`${Math.round(
            (pharmacy.usersUsed / pharmacy.userLimit) * 100,
          )}% used`}
          color="#E7F0FF"
        />

        <SummaryCard
          title="Branches"
          value={String(pharmacy.branches)}
          footer="View branches"
          color="#DFF5ED"
        />

        <SummaryCard
          title="Subscription Status"
          value={pharmacy.status}
          footer="365 days left"
          color="#FFF1D9"
        />

        <SummaryCard
          title="Expiry Date"
          value={pharmacy.expiryDate}
          footer="View billing history"
          color="#FEE2E2"
        />
      </View>

      <View style={styles.detailsRow}>
        <View style={styles.businessPanel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Business Information</Text>

            <Pressable>
              <Text style={styles.editText}>✎ Edit</Text>
            </Pressable>
          </View>

          <DetailRow
            label="Pharmacy Name"
            value={pharmacy.name}
          />

          <DetailRow
            label="Owner / Contact Person"
            value={pharmacy.adminName}
          />

          <DetailRow
            label="Email (Login ID)"
            value={pharmacy.email}
          />

          <DetailRow label="Phone / Mobile" value={pharmacy.phone || '-'} />

          <DetailRow
            label="Business Type"
            value={pharmacy.businessType || '-'}
          />

          <DetailRow label="GST Number" value={pharmacy.gstNumber || '-'} />

          <DetailRow
            label="Country"
            value="India"
          />

          <DetailRow
            label="Business Address"
            value={pharmacy.address || '-'}
          />
        </View>

        <View style={styles.subscriptionPanel}>
          <Text style={styles.panelTitle}>Subscription Summary</Text>

          <DetailRow
            label="Plan Name"
            value={pharmacy.plan}
          />

          <DetailRow
            label="Duration"
            value="1 Year"
          />

          <DetailRow
            label="Start Date"
            value="01 Sep 2026"
          />

          <DetailRow
            label="Expiry Date"
            value={pharmacy.expiryDate}
          />

          <DetailRow
            label="Users"
            value={`${pharmacy.usersUsed} / ${pharmacy.userLimit}`}
          />

          <DetailRow
            label="Branches"
            value={String(pharmacy.branches)}
          />

          <DetailRow
            label="Amount"
            value={getPlanAmount(pharmacy.plan)}
          />

          <DetailRow
            label="Payment Method"
            value="UPI"
          />

          <View style={styles.modulesBox}>
            <Text style={styles.modulesTitle}>
              Plan Includes
            </Text>

            <Text style={styles.moduleItem}>✓ All-in-One Dashboard</Text>
            <Text style={styles.moduleItem}>✓ Advanced Reports</Text>
            <Text style={styles.moduleItem}>✓ Pharmacist Management</Text>
            <Text style={styles.moduleItem}>✓ Goods Receiving</Text>
            <Text style={styles.moduleItem}>✓ Users & Roles Access</Text>
            <Text style={styles.moduleItem}>✓ Inventory Management</Text>
          </View>
        </View>
      </View>

      <View style={styles.invoicePanel}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={styles.panelTitle}>Invoice & Billing KPI Cards</Text>
            <Text style={styles.invoiceSubtext}>
              Financial transaction summary and invoice records for {pharmacy.name}
            </Text>
          </View>

          <Pressable
            style={styles.downloadAllBtn}
            onPress={() => Alert.alert('Export Invoices', 'All invoices downloaded successfully.')}
          >
            <Text style={styles.downloadAllText}>⇩ Download All</Text>
          </Pressable>
        </View>

        {/* Invoice Metric KPI Cards */}
        <View style={styles.invoiceKpiGrid}>
          <View style={styles.invoiceKpiCard}>
            <View style={[styles.invoiceKpiIcon, { backgroundColor: '#DFF5ED' }]}>
              <Text style={styles.invoiceKpiIconText}>₹</Text>
            </View>
            <Text style={styles.invoiceKpiLabel}>Total Invoiced</Text>
            <Text style={styles.invoiceKpiValue}>
              {getPlanAmount(pharmacy.plan).split('/')[0].trim()}
            </Text>
            <Text style={styles.invoiceKpiSubtitle}>Annual Subscription Fee</Text>
          </View>

          <View style={styles.invoiceKpiCard}>
            <View style={[styles.invoiceKpiIcon, { backgroundColor: '#D1FAE5' }]}>
              <Text style={[styles.invoiceKpiIconText, { color: '#047857' }]}>✓</Text>
            </View>
            <Text style={styles.invoiceKpiLabel}>Payment Status</Text>
            <Text style={[styles.invoiceKpiValue, { color: '#047857' }]}>Paid in Full</Text>
            <Text style={styles.invoiceKpiSubtitle}>Settled via Razorpay UPI</Text>
          </View>

          <View style={styles.invoiceKpiCard}>
            <View style={[styles.invoiceKpiIcon, { backgroundColor: '#EFF6FF' }]}>
              <Text style={[styles.invoiceKpiIconText, { color: '#2563EB' }]}>▣</Text>
            </View>
            <Text style={styles.invoiceKpiLabel}>Latest Invoice</Text>
            <Text style={[styles.invoiceKpiValue, { color: '#1E293B' }]}>INV-2026-0012</Text>
            <Text style={styles.invoiceKpiSubtitle}>Issued on 30 Aug 2026</Text>
          </View>

          <View style={styles.invoiceKpiCard}>
            <View style={[styles.invoiceKpiIcon, { backgroundColor: '#FEF3C7' }]}>
              <Text style={[styles.invoiceKpiIconText, { color: '#B45309' }]}>◷</Text>
            </View>
            <Text style={styles.invoiceKpiLabel}>Next Billing Cycle</Text>
            <Text style={[styles.invoiceKpiValue, { color: '#B45309' }]}>
              {pharmacy.expiryDate}
            </Text>
            <Text style={styles.invoiceKpiSubtitle}>Auto-renewal active</Text>
          </View>
        </View>

        {/* Detailed Invoice Documents */}
        <Text style={styles.invoiceRecordHeader}>Invoice Documents</Text>

        <View style={styles.invoiceListGrid}>
          <View style={styles.invoiceDocCard}>
            <View style={styles.invoiceDocTop}>
              <View style={styles.invoiceDocTag}>
                <Text style={styles.invoiceDocTagText}>ANNUAL RENEWAL</Text>
              </View>
              <Text style={styles.invoiceDocStatus}>● PAID</Text>
            </View>

            <Text style={styles.invoiceDocNumber}>INV-2026-0012</Text>
            <Text style={styles.invoiceDocDesc}>
              {pharmacy.plan} Plan • {pharmacy.userLimit} Users • 1 Year License
            </Text>

            <View style={styles.invoiceDocDivider} />

            <View style={styles.invoiceDocBottom}>
              <View>
                <Text style={styles.invoiceDocDate}>Issued: 30 Aug 2026</Text>
                <Text style={styles.invoiceDocAmount}>
                  {getPlanAmount(pharmacy.plan)}
                </Text>
              </View>

              <Pressable
                style={styles.invoiceDownloadBtn}
                onPress={() => Alert.alert('Download', 'Downloading INV-2026-0012.pdf')}
              >
                <Text style={styles.invoiceDownloadBtnText}>⇩ PDF</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.invoiceDocCard}>
            <View style={styles.invoiceDocTop}>
              <View style={[styles.invoiceDocTag, { backgroundColor: '#F1F5F9' }]}>
                <Text style={[styles.invoiceDocTagText, { color: '#475569' }]}>ONBOARDING</Text>
              </View>
              <Text style={styles.invoiceDocStatus}>● PAID</Text>
            </View>

            <Text style={styles.invoiceDocNumber}>INV-2025-0089</Text>
            <Text style={styles.invoiceDocDesc}>
              Initial Platform Onboarding & License Activation
            </Text>

            <View style={styles.invoiceDocDivider} />

            <View style={styles.invoiceDocBottom}>
              <View>
                <Text style={styles.invoiceDocDate}>Issued: 01 Sep 2025</Text>
                <Text style={styles.invoiceDocAmount}>₹9,999</Text>
              </View>

              <Pressable
                style={styles.invoiceDownloadBtn}
                onPress={() => Alert.alert('Download', 'Downloading INV-2025-0089.pdf')}
              >
                <Text style={styles.invoiceDownloadBtnText}>⇩ PDF</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function SummaryCard({
  title,
  value,
  footer,
  color,
}: {
  title: string;
  value: string;
  footer: string;
  color: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor: color }]}>
        <Text style={styles.summaryIconText}>✓</Text>
      </View>

      <Text style={styles.summaryTitle}>{title}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryFooter}>{footer}</Text>
    </View>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function getPlanAmount(plan: string) {
  const amounts: Record<string, string> = {
    Basic: '₹9,999 / year',
    Standard: '₹19,999 / year',
    Professional: '₹39,999 / year',
    Enterprise: '₹49,999 / year',
    Custom: 'Custom Pricing',
  };

  return amounts[plan] || '₹39,999 / year';
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
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 22,
  },
  breadcrumbLink: {
    color: '#64748B',
    fontSize: 13,
  },
  breadcrumbSeparator: {
    color: '#94A3B8',
  },
  breadcrumbCurrent: {
    color: '#1E293B',
    fontSize: 13,
    fontWeight: '700',
  },
  topSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 20,
  },
  pharmacyHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  largeAvatar: {
    width: 58,
    height: 58,
    borderRadius: 30,
    backgroundColor: '#DFF5ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  largeAvatarText: {
    color: '#047857',
    fontSize: 19,
    fontWeight: '900',
  },
  title: {
    color: '#172033',
    fontSize: 25,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 4,
    color: '#64748B',
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  deactivateButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FFF1F2',
  },
  deactivateText: {
    color: '#B91C1C',
    fontWeight: '800',
    fontSize: 12,
  },
  upgradeButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
  },
  upgradeText: {
    color: '#2563EB',
    fontWeight: '800',
    fontSize: 12,
  },
  renewButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#DFF5ED',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  disabledButton: {
    opacity: 0.45,
  },
  renewText: {
    color: '#047857',
    fontWeight: '800',
    fontSize: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 18,
  },
  summaryCard: {
    flex: 1,
    minWidth: 170,
    minHeight: 115,
    padding: 15,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  summaryIcon: {
    width: 28,
    height: 28,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  summaryIconText: {
    color: '#047857',
    fontWeight: '900',
  },
  summaryTitle: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
  },
  summaryValue: {
    marginTop: 5,
    color: '#172033',
    fontSize: 17,
    fontWeight: '900',
  },
  summaryFooter: {
    marginTop: 5,
    color: '#047857',
    fontSize: 10,
    fontWeight: '700',
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    marginBottom: 18,
  },
  businessPanel: {
    flex: 1,
    minWidth: 430,
    padding: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  subscriptionPanel: {
    flex: 1,
    minWidth: 430,
    padding: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  panelTitle: {
    color: '#1E293B',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 10,
  },
  editText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '800',
  },
  detailRow: {
    minHeight: 42,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  detailLabel: {
    flex: 1,
    color: '#64748B',
    fontSize: 12,
  },
  detailValue: {
    flex: 1.4,
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  modulesBox: {
    marginTop: 14,
    padding: 13,
    borderRadius: 8,
    backgroundColor: '#F5F3FF',
  },
  modulesTitle: {
    marginBottom: 8,
    color: '#7C3AED',
    fontSize: 12,
    fontWeight: '900',
  },
  moduleItem: {
    marginTop: 5,
    color: '#64748B',
    fontSize: 11,
  },
  invoicePanel: {
    padding: 22,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    marginTop: 18,
  },
  invoiceSubtext: {
    marginTop: 3,
    color: '#64748B',
    fontSize: 12,
  },
  downloadAllBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#DFF5ED',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  downloadAllText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '800',
  },
  invoiceKpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 18,
    marginBottom: 24,
  },
  invoiceKpiCard: {
    flex: 1,
    minWidth: 190,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  invoiceKpiIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  invoiceKpiIconText: {
    color: '#047857',
    fontSize: 17,
    fontWeight: '900',
  },
  invoiceKpiLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  invoiceKpiValue: {
    marginTop: 4,
    color: '#172033',
    fontSize: 19,
    fontWeight: '900',
  },
  invoiceKpiSubtitle: {
    marginTop: 4,
    color: '#94A3B8',
    fontSize: 10,
  },
  invoiceRecordHeader: {
    color: '#1E293B',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 12,
  },
  invoiceListGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  invoiceDocCard: {
    flex: 1,
    minWidth: 280,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  invoiceDocTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  invoiceDocTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#EDE9FE',
  },
  invoiceDocTagText: {
    color: '#7C3AED',
    fontSize: 9,
    fontWeight: '800',
  },
  invoiceDocStatus: {
    color: '#047857',
    fontSize: 11,
    fontWeight: '800',
  },
  invoiceDocNumber: {
    color: '#172033',
    fontSize: 16,
    fontWeight: '900',
  },
  invoiceDocDesc: {
    marginTop: 3,
    color: '#64748B',
    fontSize: 11,
  },
  invoiceDocDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  invoiceDocBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invoiceDocDate: {
    color: '#94A3B8',
    fontSize: 10,
  },
  invoiceDocAmount: {
    color: '#047857',
    fontSize: 14,
    fontWeight: '900',
    marginTop: 2,
  },
  invoiceDownloadBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 7,
    backgroundColor: '#047857',
  },
  invoiceDownloadBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  primaryButton: {
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#047857',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  emptyTitle: {
    color: '#334155',
    fontSize: 20,
    fontWeight: '800',
  },
});
