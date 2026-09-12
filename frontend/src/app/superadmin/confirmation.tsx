import React from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useSuperAdmin } from './store';

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
      Alert.alert('Copied', `${label} copied to clipboard.`);
    } catch {
      Alert.alert('Copy', text);
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
    Alert.alert('Bill Export', `Invoice for ${pharmacyName} is ready.`);
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
      contentContainerStyle={styles.content}
    >
      <View style={styles.breadcrumb}>
        <Text style={styles.breadcrumbText}>Pharmacies</Text>
        <Text style={styles.separator}>/</Text>
        <Text style={styles.breadcrumbText}>Add New Pharmacy</Text>
        <Text style={styles.separator}>/</Text>
        <Text style={styles.activeBreadcrumb}>Confirmation</Text>
      </View>

      <StepProgress />

      <View style={styles.successLayout}>
        <View style={styles.successSection}>
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

        <View style={styles.credentialsCard}>
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

function StepProgress() {
  return (
    <View style={styles.steps}>
      <Step number="1" title="Business Details" completed />
      <View style={styles.activeLine} />

      <Step number="2" title="Choose Plan" completed />
      <View style={styles.activeLine} />

      <Step number="3" title="Payment" completed />
      <View style={styles.activeLine} />

      <Step number="4" title="Confirmation" active />
    </View>
  );
}

function Step({
  number,
  title,
  active = false,
  completed = false,
}: {
  number: string;
  title: string;
  active?: boolean;
  completed?: boolean;
}) {
  return (
    <View style={styles.step}>
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
    backgroundColor: '#EFFAF6',
  },
  content: {
    padding: 24,
    paddingBottom: 50,
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
  },
  breadcrumbText: {
    color: '#64748B',
    fontSize: 13,
  },
  activeBreadcrumb: {
    color: '#1E293B',
    fontSize: 13,
    fontWeight: '800',
  },
  separator: {
    color: '#94A3B8',
  },
  steps: {
    minHeight: 64,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D6EEE6',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 35,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCircle: {
    borderColor: '#10B981',
    backgroundColor: '#10B981',
  },
  stepNumber: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
  },
  activeNumber: {
    color: '#FFFFFF',
  },
  stepTitle: {
    color: '#64748B',
    fontSize: 12,
  },
  activeStepTitle: {
    color: '#047857',
    fontWeight: '800',
  },
  activeLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 15,
    backgroundColor: '#10B981',
  },
  successLayout: {
    minHeight: 480,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    flexWrap: 'wrap',
    gap: 40,
  },
  successSection: {
    flex: 1,
    minWidth: 350,
    alignItems: 'center',
  },
  successCircleOuter: {
    width: 125,
    height: 125,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: '#B6EBD9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCircleInner: {
    width: 82,
    height: 82,
    borderRadius: 50,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#8DDFC5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: '#047857',
    fontSize: 43,
    fontWeight: '900',
  },
  successTitle: {
    marginTop: 30,
    color: '#166534',
    fontSize: 25,
    fontWeight: '900',
    textAlign: 'center',
  },
  successSubtitle: {
    marginTop: 8,
    color: '#64748B',
    fontSize: 14,
    textAlign: 'center',
  },
  emailNotice: {
    maxWidth: 430,
    marginTop: 26,
    padding: 13,
    borderRadius: 9,
    backgroundColor: '#DDF5EC',
    flexDirection: 'row',
    gap: 8,
  },
  noticeIcon: {
    color: '#047857',
    fontSize: 14,
  },
  noticeText: {
    flex: 1,
    color: '#166534',
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCEFE8',
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
    backgroundColor: '#E3F7F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldText: {
    color: '#047857',
    fontSize: 20,
    fontWeight: '900',
  },
  cardTitle: {
    color: '#1E293B',
    fontSize: 16,
    fontWeight: '900',
  },
  credentialRow: {
    minHeight: 51,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    justifyContent: 'center',
  },
  credentialLabel: {
    color: '#64748B',
    fontSize: 11,
  },
  credentialValue: {
    marginTop: 5,
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  passwordRow: {
    minHeight: 58,
    padding: 12,
    marginTop: 10,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    backgroundColor: '#E2E8F0',
  },
  inlineCopyBtnText: {
    color: '#0F172A',
    fontSize: 10,
    fontWeight: '800',
  },
  password: {
    marginTop: 6,
    color: '#047857',
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
    backgroundColor: '#047857',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyAllButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  passwordNotice: {
    marginTop: 12,
    padding: 10,
    borderRadius: 7,
    backgroundColor: '#E3F7F0',
    flexDirection: 'row',
    gap: 7,
  },
  passwordNoticeText: {
    flex: 1,
    color: '#166534',
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
    borderColor: '#047857',
    alignItems: 'center',
  },
  viewButtonText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '800',
  },
  exportButton: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: '#047857',
    alignItems: 'center',
  },
  exportButtonText: {
    color: '#FFFFFF',
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
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  backButtonText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
  },
});
