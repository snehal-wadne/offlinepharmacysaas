import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useSuperAdmin } from './store';
import type { Pharmacy, PlanName } from './types';
import {
  provisionPharmacy,
  renewSubscription,
  upgradeSubscriptionPlan,
  verifyPayment,
  fetchSubscriptionPlans,
} from '../../api/superadminApi';
import OfflineQRCode from '../../components/common/OfflineQRCode';

type PaymentMethod = 'UPI' | 'Card' | 'Net Banking';

type PaymentParams = {
  mode?: string;
  pharmacyId?: string;
  plan?: string;
  name?: string;
  adminName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  branches?: string;
  gstNumber?: string;
  businessType?: string;
};

const PLAN_PRICES: Record<PlanName, number> = {
  Basic: 9999,
  Standard: 19999,
  Professional: 39999,
  Enterprise: 49999,
  Custom: 0,
};

const PLAN_USERS: Record<PlanName, number> = {
  Basic: 5,
  Standard: 20,
  Professional: 50,
  Enterprise: 100,
  Custom: 100,
};

function getParam(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function isPlanName(value: string): value is PlanName {
  return (
    value === 'Basic' ||
    value === 'Standard' ||
    value === 'Professional' ||
    value === 'Enterprise' ||
    value === 'Custom'
  );
}

function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export default function PharmacyPaymentPage() {
  const params = useLocalSearchParams<PaymentParams>();

  const {
    getPharmacy,
    addPharmacy,
    updatePharmacy,
    refreshPharmacies,
    refreshDashboard,
  } = useSuperAdmin();

  const mode = getParam(params.mode) || 'create';
  const pharmacyId = getParam(params.pharmacyId);

  const existingPharmacy = pharmacyId
    ? getPharmacy(pharmacyId)
    : undefined;

  const planParam = getParam(params.plan);
  const selectedPlan: PlanName = isPlanName(planParam)
    ? planParam
    : existingPharmacy?.plan || 'Professional';

  const pharmacyName =
    getParam(params.name) || existingPharmacy?.name || 'New Pharmacy';

  const adminName =
    getParam(params.adminName) || existingPharmacy?.adminName || '';

  const email =
    getParam(params.email) || existingPharmacy?.email || '';

  const branches =
    Number(getParam(params.branches)) ||
    existingPharmacy?.branches ||
    1;

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('UPI');

  const [upiId, setUpiId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const baseAmount = PLAN_PRICES[selectedPlan] ?? 0;
  const gstAmount = Math.round(baseAmount * 0.18);
  const totalAmount = baseAmount + gstAmount;

  const modeTitle = useMemo(() => {
    if (mode === 'renew') return 'Renew Subscription';
    if (mode === 'upgrade') return 'Upgrade Subscription';
    return 'Payment';
  }, [mode]);

  const completePayment = async () => {
    if (existingPharmacy?.status === 'Deactivated') {
      Alert.alert(
        'Pharmacy Deactivated',
        'Activate this pharmacy before processing a payment.',
      );
      return;
    }

    setIsProcessing(true);

    try {
      if (mode === 'renew' && existingPharmacy) {
        const renewRes = await renewSubscription(existingPharmacy.id, {
          billingCycle: 'ANNUAL',
        });
        if (renewRes && renewRes.data && renewRes.data.razorpayOrderId) {
          await verifyPayment({
            razorpay_order_id: renewRes.data.razorpayOrderId,
            razorpay_payment_id: `pay_sim_${Date.now()}`,
            razorpay_signature: `sim_sig_${Date.now()}`,
          });
        }

        updatePharmacy(existingPharmacy.id, {
          status: 'Active',
          expiryDate: '01 Sep 2027',
        });

        await refreshPharmacies().catch(() => {});
        await refreshDashboard().catch(() => {});

        setIsProcessing(false);

        router.replace({
          pathname: '/superadmin/confirmation',
          params: {
            mode: 'renew',
            pharmacyId: existingPharmacy.id,
            plan: existingPharmacy.plan,
            name: existingPharmacy.name,
            email: existingPharmacy.email,
          },
        });

        return;
      }

      if (mode === 'upgrade' && existingPharmacy) {
        const plansRes = await fetchSubscriptionPlans(true).catch(() => null);
        const targetPlan = plansRes?.data?.find(
          (p: any) => (p.name || '').toLowerCase() === selectedPlan.toLowerCase(),
        );
        if (targetPlan) {
          const upRes = await upgradeSubscriptionPlan(existingPharmacy.id, {
            newPlanId: targetPlan.id,
            billingCycle: 'ANNUAL',
          });
          if (upRes && upRes.data && upRes.data.razorpayOrderId) {
            await verifyPayment({
              razorpay_order_id: upRes.data.razorpayOrderId,
              razorpay_payment_id: `pay_sim_${Date.now()}`,
              razorpay_signature: `sim_sig_${Date.now()}`,
            });
          }
        }

        updatePharmacy(existingPharmacy.id, {
          plan: selectedPlan,
          userLimit: PLAN_USERS[selectedPlan] || 50,
          status: 'Active',
        });

        await refreshPharmacies().catch(() => {});
        await refreshDashboard().catch(() => {});

        setIsProcessing(false);

        router.replace({
          pathname: '/superadmin/confirmation',
          params: {
            mode: 'upgrade',
            pharmacyId: existingPharmacy.id,
            plan: selectedPlan,
            name: existingPharmacy.name,
            email: existingPharmacy.email,
          },
        });

        return;
      }

      // Provision new pharmacy on PostgreSQL backend
      const provRes = await provisionPharmacy({
        name: pharmacyName,
        adminName,
        email,
        phone: getParam(params.phone),
        address: getParam(params.address),
        city: getParam(params.city),
        state: getParam(params.state),
        pincode: getParam(params.pincode),
        gstNumber: getParam(params.gstNumber),
        businessType: getParam(params.businessType),
        planName: selectedPlan,
        branches,
        billingCycle: 'ANNUAL',
      });

      if (!provRes || !provRes.success || !provRes.data) {
        throw new Error(provRes?.error || 'Backend pharmacy provisioning failed.');
      }

      const { organisation, paymentOrder, credentials } = provRes.data;
      const finalPharmacyId = organisation?.pharmacy_code || organisation?.id || `PH-${Date.now().toString().slice(-6)}`;
      const temporaryPassword = credentials?.temporaryPassword || '';

      if (paymentOrder && paymentOrder.razorpayOrderId) {
        await verifyPayment({
          razorpay_order_id: paymentOrder.razorpayOrderId,
          razorpay_payment_id: `pay_sim_${Date.now()}`,
          razorpay_signature: `sim_sig_${Date.now()}`,
        });
      }

      const initials = pharmacyName
        .split(' ')
        .filter(Boolean)
        .map((word) => word[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'PH';

      const newPharmacy: Pharmacy = {
        id: finalPharmacyId,
        name: pharmacyName,
        initials,
        adminName,
        email,
        plan: selectedPlan,
        usersUsed: 0,
        userLimit: PLAN_USERS[selectedPlan] || 50,
        branches,
        expiryDate: '01 Sep 2027',
        status: 'Active',
        phone: getParam(params.phone),
        address: getParam(params.address),
        city: getParam(params.city),
        state: getParam(params.state),
        pincode: getParam(params.pincode),
        gstNumber: getParam(params.gstNumber),
        businessType: getParam(params.businessType),
      };

      addPharmacy(newPharmacy);
      await refreshPharmacies().catch(() => {});
      await refreshDashboard().catch(() => {});

      setIsProcessing(false);

      router.replace({
        pathname: '/superadmin/confirmation',
        params: {
          mode: 'create',
          pharmacyId: finalPharmacyId,
          plan: selectedPlan,
          name: pharmacyName,
          email,
          temporaryPassword,
        },
      });
    } catch (err: any) {
      setIsProcessing(false);
      Alert.alert('Payment Error', err.message || 'Payment processing encountered an error.');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.breadcrumb}>
        <Text style={styles.breadcrumbText}>Pharmacies</Text>
        <Text style={styles.separator}>/</Text>
        <Text style={styles.breadcrumbText}>Add New Pharmacy</Text>
        <Text style={styles.separator}>/</Text>
        <Text style={styles.activeBreadcrumb}>{modeTitle}</Text>
      </View>

      <StepProgress />

      <Text style={styles.title}>{modeTitle}</Text>
      <Text style={styles.subtitle}>
        Make the payment as per your selected plan.
      </Text>

      <View style={styles.mainGrid}>
        <View style={styles.orderCard}>
          <Text style={styles.cardTitle}>Order Summary</Text>

          <SummaryRow
            label="Pharmacy Name"
            value={pharmacyName}
          />

          <SummaryRow
            label="Plan"
            value={selectedPlan}
          />

          <SummaryRow
            label="No. of Users"
            value={`Up to ${PLAN_USERS[selectedPlan] || 50} users`}
          />

          <SummaryRow
            label="No. of Modules"
            value={
              selectedPlan === 'Basic'
                ? '2 Modules'
                : selectedPlan === 'Standard'
                  ? '5 Modules'
                  : selectedPlan === 'Professional'
                    ? '8 Modules'
                    : 'All Modules'
            }
          />

          <SummaryRow
            label="Duration"
            value="1 Year"
          />

          <View style={styles.amountBox}>
            <SummaryRow
              label="Sub-Total"
              value={formatCurrency(baseAmount)}
            />

            <SummaryRow
              label="GST / Tax (18%)"
              value={formatCurrency(gstAmount)}
            />

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Amount</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(totalAmount)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.paymentCard}>
          <Text style={styles.cardTitle}>Select Payment Method</Text>

          <Text style={styles.label}>Mode of Payment *</Text>

          <View style={styles.methodRow}>
            <PaymentMethodButton
              title="UPI"
              selected={paymentMethod === 'UPI'}
              onPress={() => setPaymentMethod('UPI')}
            />

            <PaymentMethodButton
              title="Card"
              selected={paymentMethod === 'Card'}
              onPress={() => setPaymentMethod('Card')}
            />

            <PaymentMethodButton
              title="Net Banking"
              selected={paymentMethod === 'Net Banking'}
              onPress={() => setPaymentMethod('Net Banking')}
            />
          </View>

          {paymentMethod === 'UPI' && (
            <>
              <Text style={styles.label}>UPI ID (Optional for custom VPA)</Text>

              <TextInput
                value={upiId}
                onChangeText={setUpiId}
                placeholder="billing@pharmaflow or user@okhdfcbank"
                placeholderTextColor="#94A3B8"
                style={styles.input}
                autoCapitalize="none"
              />

              <View style={styles.qrBox}>
                <View style={styles.qrPlaceholder}>
                  <OfflineQRCode
                    value={`upi://pay?pa=${encodeURIComponent(
                      upiId.trim() || 'billing@pharmaflow'
                    )}&pn=PharmaFlow%20Technologies&am=${totalAmount}&cu=INR&tn=${encodeURIComponent(
                      `Plan ${selectedPlan} - ${pharmacyName}`
                    )}`}
                    size={170}
                  />
                </View>

                <View style={styles.qrDetails}>
                  <Text style={styles.scanTitle}>
                    Scan to Pay {formatCurrency(totalAmount)}
                  </Text>
                  <Text style={styles.scanSubtitle}>
                    Open any UPI app (GPay, PhonePe, Paytm, BHIM) and scan this QR code
                  </Text>
                  <View style={styles.vpaBadge}>
                    <Text style={styles.vpaBadgeText}>
                      VPA: {upiId.trim() || 'billing@pharmaflow'}
                    </Text>
                  </View>
                </View>
              </View>
            </>
          )}

          {paymentMethod === 'Card' && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                Card payment checkout will open securely through Razorpay.
              </Text>
            </View>
          )}

          {paymentMethod === 'Net Banking' && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                Net banking checkout will open securely through Razorpay.
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.bottomActions}>
        <Pressable
          style={styles.cancelButton}
          disabled={isProcessing}
          onPress={() => router.back()}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>

        <Pressable
          style={[
            styles.paidButton,
            isProcessing && styles.disabledButton,
          ]}
          disabled={isProcessing}
          onPress={completePayment}
        >
          <Text style={styles.paidText}>
            {isProcessing ? 'Processing...' : 'Paid'}
          </Text>
        </Pressable>
      </View>
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

      <Step number="3" title="Payment" active />
      <View style={styles.inactiveLine} />

      <Step number="4" title="Confirmation" />
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

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function PaymentMethodButton({
  title,
  selected,
  onPress,
}: {
  title: PaymentMethod;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.methodButton,
        selected && styles.selectedMethodButton,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.methodText,
          selected && styles.selectedMethodText,
        ]}
      >
        {selected ? '● ' : '○ '}
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 24,
    paddingBottom: 45,
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
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
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
  inactiveLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 15,
    backgroundColor: '#E2E8F0',
  },
  title: {
    color: '#172033',
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 5,
    color: '#64748B',
    fontSize: 14,
  },
  mainGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    marginTop: 22,
  },
  orderCard: {
    flex: 1,
    minWidth: 390,
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  paymentCard: {
    flex: 1,
    minWidth: 430,
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  cardTitle: {
    marginBottom: 14,
    color: '#1E293B',
    fontSize: 17,
    fontWeight: '900',
  },
  summaryRow: {
    minHeight: 42,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
  },
  summaryLabel: {
    flex: 1,
    color: '#64748B',
    fontSize: 12,
  },
  summaryValue: {
    flex: 1,
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  amountBox: {
    marginTop: 18,
    padding: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  totalRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    color: '#172033',
    fontSize: 14,
    fontWeight: '900',
  },
  totalValue: {
    color: '#047857',
    fontSize: 15,
    fontWeight: '900',
  },
  label: {
    marginTop: 14,
    marginBottom: 7,
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
  },
  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  methodButton: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  selectedMethodButton: {
    borderColor: '#059669',
    backgroundColor: '#E3F7F0',
  },
  methodText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  selectedMethodText: {
    color: '#047857',
  },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    color: '#1E293B',
    fontSize: 13,
  },
  qrBox: {
    minHeight: 140,
    marginTop: 18,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  qrPlaceholder: {
    width: 112,
    height: 112,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  qrImage: {
    width: 100,
    height: 100,
  },
  qrDetails: {
    flex: 1,
  },
  scanTitle: {
    color: '#065F46',
    fontSize: 14,
    fontWeight: '900',
  },
  scanSubtitle: {
    marginTop: 4,
    color: '#047857',
    fontSize: 12,
    lineHeight: 16,
  },
  vpaBadge: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#DCFCE7',
    alignSelf: 'flex-start',
  },
  vpaBadgeText: {
    color: '#065F46',
    fontSize: 11,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  infoBox: {
    marginTop: 18,
    padding: 15,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },
  infoText: {
    color: '#2563EB',
    fontSize: 12,
  },
  bottomActions: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  cancelText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '800',
  },
  paidButton: {
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#059669',
  },
  paidText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
