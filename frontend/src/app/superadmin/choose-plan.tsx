import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import type { PlanName } from './types';

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
    color: '#2563EB',
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
    color: '#D97706',
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
    color: '#7C3AED',
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
    color: '#059669',
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
    color: '#475569',
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
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.breadcrumb}>
        <Text style={styles.breadcrumbText}>Pharmacies</Text>
        <Text style={styles.separator}>/</Text>
        <Text style={styles.breadcrumbText}>Add New Pharmacy</Text>
        <Text style={styles.separator}>/</Text>
        <Text style={styles.currentBreadcrumb}>Plan Selection</Text>
      </View>

      <StepProgress />

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

      <View style={styles.bottomBar}>
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

function StepProgress() {
  return (
    <View style={styles.steps}>
      <Step number="1" title="Business Details" completed />
      <View style={styles.stepLineActive} />

      <Step number="2" title="Choose Plan" active />
      <View style={styles.stepLine} />

      <Step number="3" title="Payment" />
      <View style={styles.stepLine} />

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
  currentBreadcrumb: {
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
  stepCircleActive: {
    borderColor: '#10B981',
    backgroundColor: '#10B981',
  },
  stepNumber: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
  },
  stepNumberActive: {
    color: '#FFFFFF',
  },
  stepTitle: {
    color: '#64748B',
    fontSize: 12,
  },
  stepTitleActive: {
    color: '#047857',
    fontWeight: '800',
  },
  stepLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 15,
    backgroundColor: '#E2E8F0',
  },
  stepLineActive: {
    flex: 1,
    height: 2,
    marginHorizontal: 15,
    backgroundColor: '#10B981',
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
  billingToggle: {
    width: 130,
    height: 34,
    marginTop: 16,
    borderRadius: 20,
    backgroundColor: '#DFF5ED',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 5,
  },
  toggleCircle: {
    width: 18,
    height: 18,
    borderRadius: 10,
    backgroundColor: '#059669',
  },
  billingText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '800',
  },
  saveText: {
    color: '#047857',
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
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  selectedPlanCard: {
    borderWidth: 2,
    borderColor: '#059669',
  },
  popularBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#DFF5ED',
  },
  popularText: {
    color: '#047857',
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
    color: '#64748B',
    fontSize: 11,
  },
  price: {
    marginTop: 17,
    color: '#172033',
    fontSize: 21,
    fontWeight: '900',
  },
  perYear: {
    marginTop: -4,
    color: '#64748B',
    fontSize: 10,
  },
  planLimit: {
    marginTop: 6,
    color: '#64748B',
    fontSize: 11,
  },
  divider: {
    height: 1,
    marginVertical: 14,
    backgroundColor: '#E2E8F0',
  },
  feature: {
    marginTop: 7,
    fontSize: 12,
  },
  featureText: {
    color: '#475569',
  },
  selectButton: {
    marginTop: 'auto',
    paddingVertical: 9,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#94A3B8',
    alignItems: 'center',
  },
  selectButtonText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
  },
  selectedButtonText: {
    color: '#FFFFFF',
  },
  bottomBar: {
    minHeight: 70,
    marginTop: 20,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 15,
  },
  selectedSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
  },
  selectedPlanText: {
    color: '#7C3AED',
    fontSize: 12,
    fontWeight: '900',
  },
  summaryText: {
    color: '#64748B',
    fontSize: 11,
  },
  summaryPrice: {
    color: '#7C3AED',
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
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  backText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
  },
  nextButton: {
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: '#059669',
  },
  nextText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});
