import React, { useEffect, useState } from 'react';
import { SuperAdminPalette as C } from '../../constants/theme';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useSuperAdmin } from './store';
import { useIsMobile } from '../../utils/responsive';
import { notify } from '../../utils/alert';
import { fetchPharmacyInvoices, downloadInvoicePdf } from '../../api/superadminApi';

type InvoiceRecord = {
  id: string;
  invoice_number: string;
  total_amount: string | number;
  issued_at: string;
  status: string;
};

function formatInvoiceDate(value: string) {
  try {
    return new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return value;
  }
}

export default function PharmacyDetailsPage() {
  const { pharmacyId } = useLocalSearchParams<{ pharmacyId?: string }>();
  const { getPharmacy, updatePharmacy } = useSuperAdmin();
  const isMobile = useIsMobile();

  const pharmacy = pharmacyId ? getPharmacy(pharmacyId) : undefined;

  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!pharmacy?.id) return;
    fetchPharmacyInvoices(pharmacy.id)
      .then((res) => {
        if (res && res.success && Array.isArray(res.data)) {
          setInvoices(res.data);
        }
      })
      .catch((err) => console.warn('Could not load invoices:', err));
  }, [pharmacy?.id]);

  const handleDownloadInvoice = async (invoice: InvoiceRecord) => {
    setDownloadingId(invoice.id);
    try {
      await downloadInvoicePdf(invoice.id, `${invoice.invoice_number}.pdf`);
    } catch (err: any) {
      notify('Download Failed', err?.message || 'Could not download invoice.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadAll = async () => {
    if (invoices.length === 0) {
      notify('No Invoices', 'There are no invoices to download yet.');
      return;
    }
    for (const invoice of invoices) {
      await handleDownloadInvoice(invoice);
    }
  };

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
      contentContainerStyle={[styles.content, isMobile && styles.contentMobile]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.breadcrumb, isMobile && styles.breadcrumbMobile]}>
        <Pressable onPress={() => router.push('/superadmin/pharmacies')}>
          <Text style={styles.breadcrumbLink}>Pharmacies</Text>
        </Pressable>

        <Text style={styles.breadcrumbSeparator}>/</Text>
        <Text
          style={[styles.breadcrumbCurrent, isMobile && styles.breadcrumbCurrentMobile]}
          numberOfLines={1}
        >
          {pharmacy.name} - View
        </Text>
      </View>

      <View style={[styles.topSection, isMobile && styles.topSectionMobile]}>
      <View style={[styles.pharmacyHeading, isMobile && styles.pharmacyHeadingMobile]}>
          <View style={styles.largeAvatar}>
            <Text style={styles.largeAvatarText}>{pharmacy.initials}</Text>
          </View>

          <View style={[styles.pharmacyInfo, isMobile && styles.pharmacyInfoMobile]}>
            <Text style={[styles.title, isMobile && styles.titleMobile]}>{pharmacy.name}</Text>
            <Text style={styles.subtitle}>
              Pharmacy subscription and business details
            </Text>
          </View>
        </View>

        <View style={[styles.actionRow, isMobile && styles.actionRowMobile]}>
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
          color={C.softRose}
        />

        <SummaryCard
          title="Users Used / Limit"
          value={`${pharmacy.usersUsed} / ${pharmacy.userLimit}`}
          footer={`${Math.round(
            (pharmacy.usersUsed / pharmacy.userLimit) * 100,
          )}% used`}
          color={C.softRose}
        />

        <SummaryCard
          title="Branches"
          value={String(pharmacy.branches)}
          footer="View branches"
          color={C.sageTint}
        />

        <SummaryCard
          title="Subscription Status"
          value={pharmacy.status}
          footer="365 days left"
          color={C.goldTint}
        />

        <SummaryCard
          title="Expiry Date"
          value={pharmacy.expiryDate}
          footer="View billing history"
          color={C.redTint}
        />
      </View>

      <View style={styles.detailsRow}>
        <View style={[styles.businessPanel, isMobile && styles.fullWidthCard]}>
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

        <View style={[styles.subscriptionPanel, isMobile && styles.fullWidthCard]}>
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

      <View style={[styles.invoicePanel, isMobile && styles.invoicePanelMobile]}>
        <View style={[styles.panelHeader, isMobile && styles.panelHeaderMobile]}>
          <View style={isMobile && styles.invoiceHeaderInfoMobile}>
            <Text style={styles.panelTitle}>Invoice & Billing KPI Cards</Text>
            <Text style={styles.invoiceSubtext}>
              Financial transaction summary and invoice records for {pharmacy.name}
            </Text>
          </View>

          <Pressable
            style={styles.downloadAllBtn}
            onPress={handleDownloadAll}
          >
            <Text style={styles.downloadAllText}>⇩ Download All</Text>
          </Pressable>
        </View>

        {/* Invoice Metric KPI Cards */}
        <View style={styles.invoiceKpiGrid}>
          <View style={styles.invoiceKpiCard}>
            <View style={[styles.invoiceKpiIcon, { backgroundColor: C.sageTint }]}>
              <Text style={styles.invoiceKpiIconText}>₹</Text>
            </View>
            <Text style={styles.invoiceKpiLabel}>Total Invoiced</Text>
            <Text style={styles.invoiceKpiValue}>
              {getPlanAmount(pharmacy.plan).split('/')[0].trim()}
            </Text>
            <Text style={styles.invoiceKpiSubtitle}>Annual Subscription Fee</Text>
          </View>

          <View style={styles.invoiceKpiCard}>
            <View style={[styles.invoiceKpiIcon, { backgroundColor: C.sageTint }]}>
              <Text style={[styles.invoiceKpiIconText, { color: C.sageGreen }]}>✓</Text>
            </View>
            <Text style={styles.invoiceKpiLabel}>Payment Status</Text>
            <Text style={[styles.invoiceKpiValue, { color: C.sageGreen }]}>Paid in Full</Text>
            <Text style={styles.invoiceKpiSubtitle}>Settled via Razorpay UPI</Text>
          </View>

          <View style={styles.invoiceKpiCard}>
            <View style={[styles.invoiceKpiIcon, { backgroundColor: C.softRose }]}>
              <Text style={[styles.invoiceKpiIconText, { color: C.dustyRose }]}>▣</Text>
            </View>
            <Text style={styles.invoiceKpiLabel}>Latest Invoice</Text>
            <Text style={[styles.invoiceKpiValue, { color: C.charcoal }]}>
              {invoices[0]?.invoice_number || 'No invoices yet'}
            </Text>
            <Text style={styles.invoiceKpiSubtitle}>
              {invoices[0] ? `Issued on ${formatInvoiceDate(invoices[0].issued_at)}` : '-'}
            </Text>
          </View>

          <View style={styles.invoiceKpiCard}>
            <View style={[styles.invoiceKpiIcon, { backgroundColor: C.goldTint }]}>
              <Text style={[styles.invoiceKpiIconText, { color: C.warmGold }]}>◷</Text>
            </View>
            <Text style={styles.invoiceKpiLabel}>Next Billing Cycle</Text>
            <Text style={[styles.invoiceKpiValue, { color: C.warmGold }]}>
              {pharmacy.expiryDate}
            </Text>
            <Text style={styles.invoiceKpiSubtitle}>Auto-renewal active</Text>
          </View>
        </View>

        {/* Detailed Invoice Documents */}
        <Text style={styles.invoiceRecordHeader}>Invoice Documents</Text>

        <View style={styles.invoiceListGrid}>
          {invoices.length === 0 && (
            <Text style={styles.invoiceDocDesc}>
              No invoices have been generated for this pharmacy yet.
            </Text>
          )}

          {invoices.map((invoice) => (
            <View
              key={invoice.id}
              style={[styles.invoiceDocCard, isMobile && styles.invoiceDocCardMobile]}
            >
              <View style={styles.invoiceDocTop}>
                <View style={styles.invoiceDocTag}>
                  <Text style={styles.invoiceDocTagText}>SUBSCRIPTION</Text>
                </View>
                <Text style={styles.invoiceDocStatus}>● {invoice.status}</Text>
              </View>

              <Text style={styles.invoiceDocNumber}>{invoice.invoice_number}</Text>
              <Text style={styles.invoiceDocDesc}>
                {pharmacy.plan} Plan • {pharmacy.userLimit} Users • 1 Year License
              </Text>

              <View style={styles.invoiceDocDivider} />

              <View style={styles.invoiceDocBottom}>
                <View>
                  <Text style={styles.invoiceDocDate}>
                    Issued: {formatInvoiceDate(invoice.issued_at)}
                  </Text>
                  <Text style={styles.invoiceDocAmount}>
                    ₹{Number(invoice.total_amount).toLocaleString('en-IN')}
                  </Text>
                </View>

                <Pressable
                  style={styles.invoiceDownloadBtn}
                  disabled={downloadingId === invoice.id}
                  onPress={() => handleDownloadInvoice(invoice)}
                >
                  <Text style={styles.invoiceDownloadBtnText}>
                    {downloadingId === invoice.id ? '...' : '⇩ PDF'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
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
      <View style={[styles.summaryIcon, { backgroundColor: C.softRose }]}>
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
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 22,
  },
  breadcrumbLink: {
    color: C.mutedGray,
    fontSize: 13,
  },
  breadcrumbSeparator: {
    color: C.mutedGray,
  },
  breadcrumbMobile: {
    width: '100%',
    minWidth: 0,
    flexWrap: 'wrap',
  },
  breadcrumbCurrent: {
    color: C.charcoal,
    fontSize: 13,
    fontWeight: '700',
  },
  breadcrumbCurrentMobile: {
    flexShrink: 1,
  },
  topSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 20,
  },
  topSectionMobile: {
    alignItems: 'flex-start',
    width: '100%',
    minWidth: 0,
  },
  fullWidthCard: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    flexBasis: '100%',
    padding: 16,
  },
  pharmacyHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  pharmacyHeadingMobile: {
    width: '100%',
    minWidth: 0,
    alignItems: 'flex-start',
    gap: 10,
  },
  pharmacyInfo: {
    flex: 1,
    minWidth: 0,
  },
  pharmacyInfoMobile: {
    flexShrink: 1,
  },
  largeAvatar: {
    width: 58,
    height: 58,
    borderRadius: 30,
    backgroundColor: C.sageTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  largeAvatarText: {
    color: C.sageGreen,
    fontSize: 19,
    fontWeight: '900',
  },
  title: {
    color: C.charcoal,
    fontSize: 25,
    fontWeight: '900',
  },
  titleMobile: {
    flexShrink: 1,
    fontSize: 20,
  },
  subtitle: {
    marginTop: 4,
    color: C.mutedGray,
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  actionRowMobile: {
    width: '100%',
    marginTop: 12,
  },
  deactivateButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.redTint,
    backgroundColor: C.redTint,
  },
  deactivateText: {
    color: C.mutedRed,
    fontWeight: '800',
    fontSize: 12,
  },
  upgradeButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.softRose,
    backgroundColor: C.softRose,
  },
  upgradeText: {
    color: C.dustyRose,
    fontWeight: '800',
    fontSize: 12,
  },
  renewButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: C.sageTint,
    borderWidth: 1,
    borderColor: C.sageTint,
  },
  disabledButton: {
    opacity: 0.45,
  },
  renewText: {
    color: C.sageGreen,
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
    borderColor: C.softGray,
    backgroundColor: C.white,
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
    color: C.sageGreen,
    fontWeight: '900',
  },
  summaryTitle: {
    color: C.mutedGray,
    fontSize: 10,
    fontWeight: '700',
  },
  summaryValue: {
    marginTop: 5,
    color: C.charcoal,
    fontSize: 17,
    fontWeight: '900',
  },
  summaryFooter: {
    marginTop: 5,
    color: C.sageGreen,
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
    borderColor: C.softGray,
    backgroundColor: C.white,
  },
  subscriptionPanel: {
    flex: 1,
    minWidth: 430,
    padding: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.softGray,
    backgroundColor: C.white,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  panelHeaderMobile: {
    flexWrap: 'wrap',
    gap: 10,
  },
  invoiceHeaderInfoMobile: {
    width: '100%',
    minWidth: 0,
  },
  panelTitle: {
    color: C.charcoal,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 10,
  },
  editText: {
    color: C.sageGreen,
    fontSize: 12,
    fontWeight: '800',
  },
  detailRow: {
    minHeight: 42,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.tableRose,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  detailLabel: {
    flex: 1,
    color: C.mutedGray,
    fontSize: 12,
  },
  detailValue: {
    flex: 1.4,
    color: C.mutedGray,
    fontSize: 12,
    fontWeight: '700',
  },
  modulesBox: {
    marginTop: 14,
    padding: 13,
    borderRadius: 8,
    backgroundColor: C.softRose,
  },
  modulesTitle: {
    marginBottom: 8,
    color: C.dustyRose,
    fontSize: 12,
    fontWeight: '900',
  },
  moduleItem: {
    marginTop: 5,
    color: C.mutedGray,
    fontSize: 11,
  },
  invoicePanel: {
    padding: 22,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.softGray,
    backgroundColor: C.white,
    marginTop: 18,
  },
  invoicePanelMobile: {
    padding: 16,
  },
  invoiceSubtext: {
    marginTop: 3,
    color: C.mutedGray,
    fontSize: 12,
  },
  downloadAllBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: C.sageTint,
    borderWidth: 1,
    borderColor: C.sageTint,
  },
  downloadAllText: {
    color: C.sageGreen,
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
    borderColor: C.softGray,
    backgroundColor: C.offWhite,
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
    color: C.sageGreen,
    fontSize: 17,
    fontWeight: '900',
  },
  invoiceKpiLabel: {
    color: C.mutedGray,
    fontSize: 11,
    fontWeight: '700',
  },
  invoiceKpiValue: {
    marginTop: 4,
    color: C.charcoal,
    fontSize: 19,
    fontWeight: '900',
  },
  invoiceKpiSubtitle: {
    marginTop: 4,
    color: C.mutedGray,
    fontSize: 10,
  },
  invoiceRecordHeader: {
    color: C.charcoal,
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
    borderColor: C.softGray,
    backgroundColor: C.white,
  },
  invoiceDocCardMobile: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    flexBasis: '100%',
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
    backgroundColor: C.softRose,
  },
  invoiceDocTagText: {
    color: C.dustyRose,
    fontSize: 9,
    fontWeight: '800',
  },
  invoiceDocStatus: {
    color: C.sageGreen,
    fontSize: 11,
    fontWeight: '800',
  },
  invoiceDocNumber: {
    color: C.charcoal,
    fontSize: 16,
    fontWeight: '900',
  },
  invoiceDocDesc: {
    marginTop: 3,
    color: C.mutedGray,
    fontSize: 11,
  },
  invoiceDocDivider: {
    height: 1,
    backgroundColor: C.tableRose,
    marginVertical: 12,
  },
  invoiceDocBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invoiceDocDate: {
    color: C.mutedGray,
    fontSize: 10,
  },
  invoiceDocAmount: {
    color: C.sageGreen,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 2,
  },
  invoiceDownloadBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 7,
    backgroundColor: C.dustyRose,
  },
  invoiceDownloadBtnText: {
    color: C.white,
    fontSize: 11,
    fontWeight: '800',
  },
  primaryButton: {
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: C.dustyRose,
  },
  primaryButtonText: {
    color: C.white,
    fontWeight: '800',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.offWhite,
  },
  emptyTitle: {
    color: C.mutedGray,
    fontSize: 20,
    fontWeight: '800',
  },
});
