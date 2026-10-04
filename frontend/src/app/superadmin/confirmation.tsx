import React from 'react';
import { SuperAdminPalette as C } from '../../constants/theme';
import {
  Platform,
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

type ConfirmationParams = {
  mode?: string;
  pharmacyId?: string;
  name?: string;
  email?: string;
  plan?: string;
  temporaryPassword?: string;
};

export default function ConfirmationPage() {
  const params = useLocalSearchParams<ConfirmationParams>();
  const { getPharmacy } = useSuperAdmin();
  const isMobile = useIsMobile();

  const pharmacyId = getValue(params.pharmacyId);
  const pharmacy = pharmacyId ? getPharmacy(pharmacyId) : undefined;

  const pharmacyName =
    pharmacy?.name || getValue(params.name) || 'New Pharmacy';

  const email =
    pharmacy?.email || getValue(params.email) || 'admin@pharmacy.com';

  const plan = pharmacy?.plan || getValue(params.plan) || 'Professional';

  const temporaryPassword =
    getValue(params.temporaryPassword) || 'PF@PharmaFlow#2026';

  const mode = getValue(params.mode);

  const copyToClipboard = (text: string, label: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(text);
      }
      notify('Copied', `${label} copied to clipboard.`);
    } catch {
      notify('Copy', text);
    }
  };

  const copyFullCredentials = () => {
    const text = `PharmaFlow Account Credentials:\nPharmacy: ${pharmacyName}\nPharmacy Code: ${pharmacyId || 'Assigned'}\nLogin Email: ${email}\nInitial Password: ${temporaryPassword}\nLogin URL: http://localhost:8081\n\n(Please change your password upon initial login)`;
    copyToClipboard(text, 'All login credentials');
  };

  const pageMessage =
    mode === 'renew'
      ? 'Subscription renewed successfully.'
      : mode === 'upgrade'
        ? 'Subscription upgraded successfully.'
        : 'Your pharmacy is now onboarded.';

  const exportBill = async () => {
    if (!pharmacyId) {
      notify('Bill Export', 'No pharmacy is associated with this confirmation yet.');
      return;
    }
    try {
      const res = await fetchPharmacyInvoices(pharmacyId);
      const latestInvoice = res?.data?.[0];
      if (!latestInvoice) {
        notify('Bill Export', 'Invoice is still being generated. Please try again shortly.');
        return;
      }
      await downloadInvoicePdf(latestInvoice.id, `${latestInvoice.invoice_number}.pdf`);
    } catch (err: any) {
      notify('Download Failed', err?.message || 'Could not download the invoice.');
    }
  };

  const viewPharmacy = () => {
    if (!pharmacyId) {
      router.replace('/superadmin/pharmacies');
      return;
    }

    router.replace({
      pathname: '/superadmin/pharmacy-details',
      params: { pharmacyId },
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isMobile && styles.contentMobile]}
    >
      <View style={[styles.breadcrumb, isMobile && styles.breadcrumbMobile]}>
        <Text style={styles.breadcrumbText}>Pharmacies</Text>
        <Text style={styles.separator}>/</Text>
        <Text style={styles.breadcrumbText}>Add New Pharmacy</Text>
        <Text style={styles.separator}>/</Text>
        <Text style={styles.activeBreadcrumb}>Confirmation</Text>
      </View>

      <StepProgress isMobile={isMobile} />

      <View style={[styles.successLayout, isMobile && styles.successLayoutMobile]}>
        <View style={[styles.successSection, isMobile && styles.fullWidthCard]}>
          <View style={styles.successCircleOuter}>
            <View style={styles.successCircleInner}>
              <Text style={styles.checkMark}>✓</Text>
            </View>
          </View>

          <Text style={styles.successTitle}>
            {mode === 'renew'
              ? 'Subscription Renewed Successfully!'
              : mode === 'upgrade'
                ? 'Plan Upgraded Successfully!'
                : 'Pharmacy Created Successfully!'}
          </Text>

          <Text style={styles.successSubtitle}>{pageMessage}</Text>

          <View style={styles.emailNotice}>
            <Text style={styles.noticeIcon}>ⓘ</Text>
            <Text style={styles.noticeText}>
              Login credentials have also been sent to{' '}
              <Text style={styles.bold}>{email}</Text>
            </Text>
          </View>
        </View>

        <View style={[styles.credentialsCard, isMobile && styles.fullWidthCard]}>
          <View style={styles.cardHeading}>
            <View style={styles.shield}>
              <Text style={styles.shieldText}>♢</Text>
            </View>

            <Text style={styles.cardTitle}>
              Your Login Credentials
            </Text>
          </View>

          <CredentialRow label="Pharmacy Name" value={pharmacyName} />
          <CredentialRow label="Login ID (Email)" value={email} />
          <CredentialRow label="Plan" value={plan} />

          <View style={styles.passwordRow}>
            <View style={styles.passwordHeader}>
              <Text style={styles.credentialLabel}>Initial Password</Text>
              <Pressable
                style={styles.inlineCopyBtn}
                onPress={() => copyToClipboard(temporaryPassword, 'Initial password')}
              >
                <Text style={styles.inlineCopyBtnText}>📋 Copy</Text>
              </Pressable>
            </View>
            <Text style={styles.password}>{temporaryPassword}</Text>
          </View>

          <View style={styles.passwordNotice}>
            <Text style={styles.noticeIcon}>ⓘ</Text>
            <Text style={styles.passwordNoticeText}>
              Please provide this password to the client. They should change it upon first login.
            </Text>
          </View>

          <Pressable
            style={styles.copyAllButton}
            onPress={copyFullCredentials}
          >
            <Text style={styles.copyAllButtonText}>
              📋 Copy Full Credentials for Client
            </Text>
          </Pressable>

          <View style={styles.cardActions}>
            <Pressable
              style={styles.viewButton}
              onPress={viewPharmacy}
            >
              <Text style={styles.viewButtonText}>
                ◉ View Pharmacy
              </Text>
            </Pressable>

            <Pressable
              style={styles.exportButton}
              onPress={exportBill}
            >
              <Text style={styles.exportButtonText}>
                ⇩ Export Bill
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <Pressable
        style={styles.backButton}
        onPress={() => router.replace('/superadmin/pharmacies')}
      >
        <Text style={styles.backButtonText}>
          ← Back to Pharmacies
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function StepProgress({ isMobile }: { isMobile: boolean }) {
  return (
    <View style={[styles.steps, isMobile && styles.stepsMobile]}>
      <Step number="1" title="Business Details" completed compact={isMobile} />
      {!isMobile && <View style={styles.activeLine} />}

      <Step number="2" title="Choose Plan" completed compact={isMobile} />
      {!isMobile && <View style={styles.activeLine} />}

      <Step number="3" title="Payment" completed compact={isMobile} />
      {!isMobile && <View style={styles.activeLine} />}

      <Step number="4" title="Confirmation" active compact={isMobile} />
    </View>
  );
}

function Step({
  number,
  title,
  active = false,
  completed = false,
  compact = false,
}: {
  number: string;
  title: string;
  active?: boolean;
  completed?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={[styles.step, compact && styles.stepMobile]}>
      <View
        style={[
          styles.stepCircle,
          (active || completed) && styles.activeCircle,
        ]}
      >
        <Text
          style={[
            styles.stepNumber,
            (active || completed) && styles.activeNumber,
          ]}
        >
          {completed ? '✓' : number}
        </Text>
      </View>

      <Text style={[styles.stepTitle, active && styles.activeStepTitle]}>
        {title}
      </Text>
    </View>
  );
}

function CredentialRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.credentialRow}>
      <Text style={styles.credentialLabel}>{label}</Text>
      <Text style={styles.credentialValue}>{value}</Text>
    </View>
  );
}

function getValue(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.sageTint,
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
    marginBottom: 18,
  },
  breadcrumbMobile: {
    flexWrap: 'wrap',
  },
  breadcrumbText: {
    color: C.mutedGray,
    fontSize: 13,
  },
  activeBreadcrumb: {
    color: C.charcoal,
    fontSize: 13,
    fontWeight: '800',
  },
  separator: {
    color: C.mutedGray,
  },
  steps: {
    minHeight: 64,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.sageTint,
    backgroundColor: C.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 35,
  },
  stepsMobile: {
    minHeight: 0,
    padding: 12,
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 12,
    marginBottom: 24,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepMobile: {
    width: '47%',
    gap: 6,
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.softGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCircle: {
    borderColor: C.sageGreen,
    backgroundColor: C.sageGreen,
  },
  stepNumber: {
    color: C.mutedGray,
    fontSize: 11,
    fontWeight: '800',
  },
  activeNumber: {
    color: C.white,
  },
  stepTitle: {
    color: C.mutedGray,
    fontSize: 12,
  },
  activeStepTitle: {
    color: C.dustyRose,
    fontWeight: '800',
  },
  activeLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 15,
    backgroundColor: C.sageGreen,
  },
  successLayout: {
    minHeight: 480,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    flexWrap: 'wrap',
    gap: 40,
  },
  successLayoutMobile: {
    minHeight: 0,
    gap: 24,
  },
  successSection: {
    flex: 1,
    minWidth: 350,
    alignItems: 'center',
  },
  fullWidthCard: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    flexBasis: '100%',
    padding: 16,
  },
  successCircleOuter: {
    width: 125,
    height: 125,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: C.sageTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCircleInner: {
    width: 82,
    height: 82,
    borderRadius: 50,
    backgroundColor: C.white,
    borderWidth: 2,
    borderColor: C.sageTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: C.sageGreen,
    fontSize: 43,
    fontWeight: '900',
  },
  successTitle: {
    marginTop: 30,
    color: C.sageGreen,
    fontSize: 25,
    fontWeight: '900',
    textAlign: 'center',
  },
  successSubtitle: {
    marginTop: 8,
    color: C.mutedGray,
    fontSize: 14,
    textAlign: 'center',
  },
  emailNotice: {
    maxWidth: 430,
    marginTop: 26,
    padding: 13,
    borderRadius: 9,
    backgroundColor: C.sageTint,
    flexDirection: 'row',
    gap: 8,
  },
  noticeIcon: {
    color: C.sageGreen,
    fontSize: 14,
  },
  noticeText: {
    flex: 1,
    color: C.sageGreen,
    fontSize: 12,
    lineHeight: 18,
  },
  bold: {
    fontWeight: '900',
  },
  credentialsCard: {
    flex: 1,
    minWidth: 360,
    maxWidth: 470,
    padding: 23,
    borderRadius: 14,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.sageTint,
  },
  cardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  shield: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: C.sageTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldText: {
    color: C.sageGreen,
    fontSize: 20,
    fontWeight: '900',
  },
  cardTitle: {
    color: C.charcoal,
    fontSize: 16,
    fontWeight: '900',
  },
  credentialRow: {
    minHeight: 51,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: C.tableRose,
    justifyContent: 'center',
  },
  credentialLabel: {
    color: C.mutedGray,
    fontSize: 11,
  },
  credentialValue: {
    marginTop: 5,
    color: C.mutedGray,
    fontSize: 13,
    fontWeight: '700',
  },
  passwordRow: {
    minHeight: 58,
    padding: 12,
    marginTop: 10,
    borderRadius: 8,
    backgroundColor: C.offWhite,
    borderWidth: 1,
    borderColor: C.softGray,
    justifyContent: 'center',
  },
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inlineCopyBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: C.softGray,
  },
  inlineCopyBtnText: {
    color: C.charcoal,
    fontSize: 10,
    fontWeight: '800',
  },
  password: {
    marginTop: 6,
    color: C.sageGreen,
    fontSize: 15,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 1,
  },
  copyAllButton: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: C.dustyRose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyAllButtonText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '800',
  },
  passwordNotice: {
    marginTop: 12,
    padding: 10,
    borderRadius: 7,
    backgroundColor: C.sageTint,
    flexDirection: 'row',
    gap: 7,
  },
  passwordNoticeText: {
    flex: 1,
    color: C.sageGreen,
    fontSize: 11,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 18,
  },
  viewButton: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.sageGreen,
    alignItems: 'center',
  },
  viewButtonText: {
    color: C.sageGreen,
    fontSize: 12,
    fontWeight: '800',
  },
  exportButton: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: C.dustyRose,
    alignItems: 'center',
  },
  exportButtonText: {
    color: C.white,
    fontSize: 12,
    fontWeight: '800',
  },
  backButton: {
    alignSelf: 'center',
    marginTop: 15,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.secondaryBorder,
    backgroundColor: C.white,
  },
  backButtonText: {
    color: C.midnightViolet,
    fontSize: 12,
    fontWeight: '800',
  },
});
