import React, { useMemo, useState } from 'react';
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
import type { Pharmacy, PlanName } from './types';
import {
  provisionPharmacy,
  renewSubscription,
  upgradeSubscriptionPlan,
  verifyPayment,
  fetchSubscriptionPlans,
} from '../../api/superadminApi';
import { openRazorpayCheckout } from '../../utils/razorpayCheckout';
import { notify } from '../../utils/alert';
import { useIsMobile } from '../../utils/responsive';
import { clearAddPharmacyDraft } from './add-pharmacy';

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

  const [isProcessing, setIsProcessing] = useState(false);
  const isMobile = useIsMobile();

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
      notify(
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
        const order = renewRes?.data;
        if (order && order.razorpayOrderId) {
          await new Promise<void>((resolve, reject) => {
            openRazorpayCheckout({
              orderId: order.razorpayOrderId,
              amount: order.amount || totalAmount * 100,
              currency: order.currency || 'INR',
              keyId: order.keyId,
              pharmacyName: existingPharmacy.name,
              email: existingPharmacy.email,
              phone: existingPharmacy.phone,
              description: `Renew ${existingPharmacy.name} Subscription`,
              onSuccess: async (resp) => {
                try {
                  await verifyPayment(resp);
                  resolve();
                } catch (e) {
                  reject(e);
                }
              },
              onDismiss: () => {
                setIsProcessing(false);
              },
              onError: (err) => {
                reject(err);
              },
            });
          });
        }

        updatePharmacy(existingPharmacy.id, {
          status: 'Active',
          expiryDate: '01 Sep 2027',
        });

        refreshPharmacies().catch(() => {});
        refreshDashboard().catch(() => {});

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
          const order = upRes?.data;
          if (order && order.razorpayOrderId) {
            await new Promise<void>((resolve, reject) => {
              openRazorpayCheckout({
                orderId: order.razorpayOrderId,
                amount: order.amount || totalAmount * 100,
                currency: order.currency || 'INR',
                keyId: order.keyId,
                pharmacyName: existingPharmacy.name,
                email: existingPharmacy.email,
                phone: existingPharmacy.phone,
                description: `Upgrade to ${selectedPlan} Subscription`,
                onSuccess: async (resp) => {
                  try {
                    await verifyPayment(resp);
                    resolve();
                  } catch (e) {
                    reject(e);
                  }
                },
                onDismiss: () => {
                  setIsProcessing(false);
                },
                onError: (err) => {
                  reject(err);
                },
              });
            });
          }
        }

        updatePharmacy(existingPharmacy.id, {
          plan: selectedPlan,
          userLimit: PLAN_USERS[selectedPlan] || 50,
          status: 'Active',
        });

        refreshPharmacies().catch(() => {});
        refreshDashboard().catch(() => {});

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
        await new Promise<void>((resolve, reject) => {
          openRazorpayCheckout({
            orderId: paymentOrder.razorpayOrderId,
            amount: paymentOrder.amount || totalAmount * 100,
            currency: paymentOrder.currency || 'INR',
            keyId: paymentOrder.keyId,
            pharmacyName,
            email,
            phone: getParam(params.phone),
            description: `${selectedPlan} Plan Subscription`,
            onSuccess: async (resp) => {
              try {
                await verifyPayment(resp);
                resolve();
              } catch (e) {
                reject(e);
              }
            },
            onDismiss: () => {
              setIsProcessing(false);
            },
            onError: (err) => {
              reject(err);
            },
          });
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
      clearAddPharmacyDraft();
      refreshPharmacies().catch(() => {});
      refreshDashboard().catch(() => {});

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
      console.error('Payment error:', err);
      notify('Payment Error', err?.message || 'Payment processing encountered an error.');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isMobile && styles.contentMobile]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.breadcrumb, isMobile && styles.breadcrumbMobile]}>
        <Text style={styles.breadcrumbText}>Pharmacies</Text>
        <Text style={styles.separator}>/</Text>
        <Text style={styles.breadcrumbText}>Add New Pharmacy</Text>
        <Text style={styles.separator}>/</Text>
        <Text style={styles.activeBreadcrumb}>{modeTitle}</Text>
      </View>

      <StepProgress isMobile={isMobile} />

      <Text style={styles.title}>{modeTitle}</Text>
      <Text style={styles.subtitle}>
        Make the payment as per your selected plan.
      </Text>

      <View style={styles.mainGrid}>
        <View style={[styles.orderCard, isMobile && styles.fullWidthCard]}>
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

        <View style={[styles.paymentCard, isMobile && styles.fullWidthCard]}>
          <Text style={styles.cardTitle}>Payment</Text>

          <View style={styles.razorpayBadge}>
            <Text style={styles.razorpayBadgeText}>Secured by Razorpay</Text>
          </View>

          <Text style={styles.infoText}>
            Clicking below opens the Razorpay checkout where you can pay using
            UPI, Card, Net Banking, or Wallet.
          </Text>
        </View>
      </View>

      <View style={[styles.bottomActions, isMobile && styles.bottomActionsMobile]}>
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
            {isProcessing ? 'Processing with Razorpay...' : `Pay with Razorpay (${formatCurrency(totalAmount)}) →`}
          </Text>
        </Pressable>
      </View>
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

      <Step number="3" title="Payment" active compact={isMobile} />
      {!isMobile && <View style={styles.inactiveLine} />}

      <Step number="4" title="Confirmation" compact={isMobile} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.offWhite,
  },
  content: {
    padding: 24,
    paddingBottom: 45,
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
    borderColor: C.softGray,
    backgroundColor: C.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  stepsMobile: {
    minHeight: 0,
    padding: 12,
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 12,
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
    borderColor: C.dustyRose,
    backgroundColor: C.dustyRose,
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
    backgroundColor: C.dustyRose,
  },
  inactiveLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 15,
    backgroundColor: C.softGray,
  },
  title: {
    color: C.charcoal,
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 5,
    color: C.mutedGray,
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
    borderColor: C.softGray,
    backgroundColor: C.white,
  },
  paymentCard: {
    flex: 1,
    minWidth: 430,
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.softGray,
    backgroundColor: C.white,
  },
  fullWidthCard: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    flexBasis: '100%',
    padding: 18,
  },
  cardTitle: {
    marginBottom: 14,
    color: C.charcoal,
    fontSize: 17,
    fontWeight: '900',
  },
  summaryRow: {
    minHeight: 42,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.tableRose,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
  },
  summaryLabel: {
    flex: 1,
    color: C.mutedGray,
    fontSize: 12,
  },
  summaryValue: {
    flex: 1,
    color: C.mutedGray,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  amountBox: {
    marginTop: 18,
    padding: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.softGray,
  },
  totalRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.softGray,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    color: C.charcoal,
    fontSize: 14,
    fontWeight: '900',
  },
  totalValue: {
    color: C.sageGreen,
    fontSize: 15,
    fontWeight: '900',
  },
  razorpayBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: C.softRose,
    marginBottom: 12,
  },
  razorpayBadgeText: {
    color: C.dustyRose,
    fontSize: 12,
    fontWeight: '800',
  },
  infoText: {
    color: C.mutedGray,
    fontSize: 13,
    lineHeight: 19,
  },
  bottomActions: {
    marginTop: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 10,
  },
  bottomActionsMobile: {
    flexDirection: 'column-reverse',
    alignItems: 'stretch',
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.secondaryBorder,
    backgroundColor: C.white,
    alignItems: 'center',
  },
  cancelText: {
    color: C.midnightViolet,
    fontSize: 13,
    fontWeight: '800',
  },
  paidButton: {
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: C.dustyRose,
    alignItems: 'center',
  },
  paidText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
