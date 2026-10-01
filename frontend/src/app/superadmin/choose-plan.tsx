import React, { useState } from 'react';
import { SuperAdminPalette as C } from '../../constants/theme';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import type { PlanName } from './types';
import { useIsMobile } from '../../utils/responsive';

const PLANS: {
  name: PlanName;
  price: string;
  description: string;
  users: string;
  modules: string;
  features: string[];
  color: string;
}[] = [
  {
    name: 'Basic',
    price: '₹9,999',
    description: 'For small pharmacies',
    users: 'Up to 5 Users',
    modules: '2 Modules',
    features: [
      'All Basic Features',
      'Inventory Tracking',
      'Single Store Support',
      'Daily Sales Reports',
    ],
    color: C.dustyRose,
  },
  {
    name: 'Standard',
    price: '₹19,999',
    description: 'For growing pharmacies',
    users: 'Up to 20 Users',
    modules: '5 Modules',
    features: [
      'All in Basic',
      'Inventory Management',
      'Purchases Modules',
      'Customers CRM',
      'Stock Transfer System',
    ],
    color: C.warmGold,
  },
  {
    name: 'Professional',
    price: '₹39,999',
    description: 'For established pharmacies',
    users: 'Up to 50 Users',
    modules: '8 Modules',
    features: [
      'All in Standard',
      'Advanced Reports',
      'Pharmacist Management',
      'Goods Receiving',
      'Users & Roles Access',
      'Page Permissions',
    ],
    color: C.dustyRose,
  },
  {
    name: 'Enterprise',
    price: '₹49,999',
    description: 'For large pharmacies',
    users: 'Custom Users',
    modules: 'All Modules',
    features: [
      'All Available Modules',
      'Priority 24/7 Support',
      'Custom Integrations',
      'Dedicated Onboarding',
      'Multi-Store Syncing',
    ],
    color: C.sageGreen,
  },
  {
    name: 'Custom',
    price: 'Custom Pricing',
    description: 'Build your own plan',
    users: 'Flexible Users',
    modules: 'Custom Modules',
    features: [
      'Choose Specific Modules',
      'Set Custom User Limits',
      'Flexible Billing Options',
      'SLA Agreements',
    ],
    color: C.mutedGray,
  },
];

export default function ChoosePlanPage() {
  const params = useLocalSearchParams<{
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
  }>();

  const [selectedPlan, setSelectedPlan] = useState<PlanName>(
    isPlanName(params.plan) ? params.plan : 'Professional',
  );
  const isMobile = useIsMobile();

  const continueToPayment = () => {
    router.push({
      pathname: '/superadmin/payment',
      params: {
        ...params,
        mode: params.mode || 'create',
        plan: selectedPlan,
      },
    });
  };

  const goBack = () => {
    if (params.mode === 'upgrade' && params.pharmacyId) {
      router.back();
      return;
    }

    router.replace('/superadmin/add-pharmacy');
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isMobile && styles.contentMobile]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.breadcrumb}>
        <Text style={styles.breadcrumbText}>Pharmacies</Text>
        <Text style={styles.separator}>/</Text>
        <Text style={styles.breadcrumbText}>Add New Pharmacy</Text>
        <Text style={styles.separator}>/</Text>
        <Text style={styles.currentBreadcrumb}>Plan Selection</Text>
      </View>

      <StepProgress isMobile={isMobile} />

      <Text style={styles.title}>Choose Subscription Plan</Text>
      <Text style={styles.subtitle}>
        Choose a plan that fits your pharmacy business.
      </Text>

      <View style={styles.billingToggle}>
        <View style={styles.toggleCircle} />
        <Text style={styles.billingText}>Yearly</Text>
        <Text style={styles.saveText}>(Save 20%)</Text>
      </View>

      <View style={styles.planGrid}>
        {PLANS.map((plan) => {
          const isSelected = selectedPlan === plan.name;

          return (
            <View
              key={plan.name}
              style={[
                styles.planCard,
                isSelected && styles.selectedPlanCard,
              ]}
            >
              {plan.name === 'Professional' && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>POPULAR</Text>
                </View>
              )}

              <Text style={[styles.planName, { color: plan.color }]}>
                {plan.name}
              </Text>

              <Text style={styles.planDescription}>
                {plan.description}
              </Text>

              <Text style={styles.price}>{plan.price}</Text>
              <Text style={styles.perYear}>/ year</Text>

              <Text style={styles.planLimit}>{plan.users}</Text>
              <Text style={styles.planLimit}>{plan.modules}</Text>

              <View style={styles.divider} />

              {plan.features.map((feature) => (
                <Text
                  key={feature}
                  style={[styles.feature, { color: plan.color }]}
                >
                  ✓{' '}
                  <Text style={styles.featureText}>{feature}</Text>
                </Text>
              ))}

              <Pressable
                style={[
                  styles.selectButton,
                  isSelected && {
                    backgroundColor: plan.color,
                    borderColor: plan.color,
                  },
                ]}
                onPress={() => setSelectedPlan(plan.name)}
              >
                <Text
                  style={[
                    styles.selectButtonText,
                    isSelected && styles.selectedButtonText,
                  ]}
                >
                  {isSelected ? 'Selected ✓' : 'Select Plan'}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={[styles.bottomBar, isMobile && styles.bottomBarMobile]}>
        <View style={styles.selectedSummary}>
          <Text style={styles.selectedPlanText}>
            {selectedPlan} Plan
          </Text>

          <Text style={styles.summaryText}>
            {getPlan(selectedPlan).users}
          </Text>

          <Text style={styles.summaryText}>
            {getPlan(selectedPlan).modules}
          </Text>

          <Text style={styles.summaryPrice}>
            {getPlan(selectedPlan).price}/yr
          </Text>
        </View>

        <View style={styles.navigationButtons}>
          <Pressable style={styles.backButton} onPress={goBack}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>

          <Pressable
            style={styles.nextButton}
            onPress={continueToPayment}
          >
            <Text style={styles.nextText}>Next →</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function StepProgress({ isMobile }: { isMobile: boolean }) {
  return (
    <View style={[styles.steps, isMobile && styles.stepsMobile]}>
      <Step number="1" title="Business Details" completed compact={isMobile} />
      {!isMobile && <View style={styles.stepLineActive} />}

      <Step number="2" title="Choose Plan" active compact={isMobile} />
      {!isMobile && <View style={styles.stepLine} />}

      <Step number="3" title="Payment" compact={isMobile} />
      {!isMobile && <View style={styles.stepLine} />}

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
          (active || completed) && styles.stepCircleActive,
        ]}
      >
        <Text
          style={[
            styles.stepNumber,
            (active || completed) && styles.stepNumberActive,
          ]}
        >
          {completed ? '✓' : number}
        </Text>
      </View>

      <Text style={[styles.stepTitle, active && styles.stepTitleActive]}>
        {title}
      </Text>
    </View>
  );
}

function isPlanName(value?: string): value is PlanName {
  return (
    value === 'Basic' ||
    value === 'Standard' ||
    value === 'Professional' ||
    value === 'Enterprise' ||
    value === 'Custom'
  );
}

function getPlan(name: PlanName) {
  return PLANS.find((plan) => plan.name === name) || PLANS[2];
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
  breadcrumbText: {
    color: C.mutedGray,
    fontSize: 13,
  },
  currentBreadcrumb: {
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
  stepCircleActive: {
    borderColor: C.dustyRose,
    backgroundColor: C.dustyRose,
  },
  stepNumber: {
    color: C.mutedGray,
    fontSize: 11,
    fontWeight: '800',
  },
  stepNumberActive: {
    color: C.white,
  },
  stepTitle: {
    color: C.mutedGray,
    fontSize: 12,
  },
  stepTitleActive: {
    color: C.dustyRose,
    fontWeight: '800',
  },
  stepLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 15,
    backgroundColor: C.softGray,
  },
  stepLineActive: {
    flex: 1,
    height: 2,
    marginHorizontal: 15,
    backgroundColor: C.dustyRose,
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
  billingToggle: {
    width: 130,
    height: 34,
    marginTop: 16,
    borderRadius: 20,
    backgroundColor: C.sageTint,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 5,
  },
  toggleCircle: {
    width: 18,
    height: 18,
    borderRadius: 10,
    backgroundColor: C.dustyRose,
  },
  billingText: {
    color: C.sageGreen,
    fontSize: 12,
    fontWeight: '800',
  },
  saveText: {
    color: C.sageGreen,
    fontSize: 11,
    fontWeight: '700',
  },
  planGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 22,
  },
  planCard: {
    flex: 1,
    minWidth: 190,
    minHeight: 350,
    padding: 18,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: C.softGray,
    backgroundColor: C.white,
    position: 'relative',
  },
  selectedPlanCard: {
    borderWidth: 2,
    borderColor: C.sageGreen,
  },
  popularBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: C.sageTint,
  },
  popularText: {
    color: C.sageGreen,
    fontSize: 9,
    fontWeight: '900',
  },
  planName: {
    fontSize: 19,
    fontWeight: '900',
  },
  planDescription: {
    minHeight: 32,
    marginTop: 7,
    color: C.mutedGray,
    fontSize: 11,
  },
  price: {
    marginTop: 17,
    color: C.charcoal,
    fontSize: 21,
    fontWeight: '900',
  },
  perYear: {
    marginTop: -4,
    color: C.mutedGray,
    fontSize: 10,
  },
  planLimit: {
    marginTop: 6,
    color: C.mutedGray,
    fontSize: 11,
  },
  divider: {
    height: 1,
    marginVertical: 14,
    backgroundColor: C.softGray,
  },
  feature: {
    marginTop: 7,
    fontSize: 12,
  },
  featureText: {
    color: C.mutedGray,
  },
  selectButton: {
    marginTop: 'auto',
    paddingVertical: 9,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: C.mutedGray,
    alignItems: 'center',
  },
  selectButtonText: {
    color: C.mutedGray,
    fontSize: 12,
    fontWeight: '800',
  },
  selectedButtonText: {
    color: C.white,
  },
  bottomBar: {
    minHeight: 70,
    marginTop: 20,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: C.softGray,
    backgroundColor: C.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 15,
  },
  bottomBarMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
  },
  selectedSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
  },
  selectedPlanText: {
    color: C.dustyRose,
    fontSize: 12,
    fontWeight: '900',
  },
  summaryText: {
    color: C.mutedGray,
    fontSize: 11,
  },
  summaryPrice: {
    color: C.dustyRose,
    fontSize: 12,
    fontWeight: '900',
  },
  navigationButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  backButton: {
    paddingHorizontal: 17,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.secondaryBorder,
    backgroundColor: C.white,
  },
  backText: {
    color: C.midnightViolet,
    fontSize: 12,
    fontWeight: '800',
  },
  nextButton: {
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: C.dustyRose,
  },
  nextText: {
    color: C.white,
    fontSize: 12,
    fontWeight: '800',
  },
});
