import React, { useEffect, useState } from 'react';
import { SuperAdminPalette as C } from '../../constants/theme';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { router } from 'expo-router';

import type { PlanName } from './types';
import { fetchSubscriptionPlans } from '../../api/superadminApi';
import { useIsMobile } from '../../utils/responsive';
import { notify } from '../../utils/alert';

const PLANS: {
  name: PlanName;
  price: string;
  description: string;
  users: string;
  modules: string;
  features: string[];
  color: string;
  popular?: boolean;
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
      'Stock Transfer',
      'Pharmacist Management',
      'Goods Receiving',
      'Users & Roles Access',
    ],
    color: C.dustyRose,
    popular: true,
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
      'Custom User Limits',
      'Flexible Billing Options',
      'SLA Agreements',
    ],
    color: C.mutedGray,
  },
];

export default function SubscriptionPlansPage() {
  const [plans, setPlans] = useState(PLANS);
  const isMobile = useIsMobile();

  useEffect(() => {
    fetchSubscriptionPlans()
      .then((res) => {
        if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
          const mapped = res.data.map((p: any) => ({
            name: (p.name || 'Basic') as PlanName,
            price: `₹${Number(p.price || 0).toLocaleString('en-IN')}`,
            description: p.description || '',
            users: `Up to ${p.max_users || 5} Users`,
            modules: `${(p.features || []).length || 2} Modules`,
            features: Array.isArray(p.features) ? p.features : ['Core Module'],
            color: C.dustyRose,
            popular: Boolean(p.is_popular),
          }));
          setPlans(mapped);
        }
      })
      .catch((err) => console.warn('Could not load plans from backend:', err));
  }, []);

  const exportPlan = async (plan: PlanName) => {
    notify('Plan Export', `Plan ${plan} details printed.`);
  };

  const usePlan = (plan: PlanName) => {
    router.push({
      pathname: '/superadmin/razorpay-payment',
      params: { plan },
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isMobile && styles.contentMobile]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Subscription Tiers</Text>
        <Text style={styles.subtitle}>
          Choose the right operational scale for your pharmacy.
        </Text>
      </View>

      <View style={styles.planGrid}>
        {plans.map((plan) => (
          <View
            key={plan.name}
            style={[
              styles.planCard,
              plan.popular && styles.popularCard,
            ]}
          >
            {plan.popular && (
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

            <View style={styles.priceRow}>
              <Text style={styles.price}>{plan.price}</Text>
              {plan.price !== 'Custom Pricing' && (
                <Text style={styles.perYear}>/ year</Text>
              )}
            </View>

            <Text style={styles.planLimit}>
              {plan.users} • {plan.modules}
            </Text>

            <View style={styles.divider} />

            <Text style={styles.includes}>INCLUDES</Text>

            {plan.features.map((feature) => (
              <Text key={feature} style={styles.feature}>
                <Text style={{ color: plan.color }}>✓ </Text>
                {feature}
              </Text>
            ))}

            <View style={styles.buttons}>
              <Pressable
                style={[
                  styles.useButton,
                  {
                    borderColor: plan.color,
                  },
                ]}
                onPress={() => usePlan(plan.name)}
              >
                <Text style={[styles.useButtonText, { color: plan.color }]}>
                  Use This Plan
                </Text>
              </Pressable>

              <Pressable
                style={styles.exportButton}
                onPress={() => exportPlan(plan.name)}
              >
                <Text style={styles.exportButtonText}>⇩ Export</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
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
  header: {
    marginBottom: 22,
  },
  title: {
    color: C.charcoal,
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 6,
    color: C.mutedGray,
    fontSize: 14,
  },
  planGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  planCard: {
    flex: 1,
    minWidth: 205,
    minHeight: 410,
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.softGray,
    backgroundColor: C.white,
  },
  popularCard: {
    borderWidth: 2,
    borderColor: C.softRose,
  },
  popularBadge: {
    alignSelf: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: C.softRose,
  },
  popularText: {
    color: C.dustyRose,
    fontSize: 9,
    fontWeight: '900',
  },
  planName: {
    marginTop: 12,
    fontSize: 20,
    fontWeight: '900',
  },
  planDescription: {
    minHeight: 35,
    marginTop: 8,
    color: C.mutedGray,
    fontSize: 12,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 18,
  },
  price: {
    color: C.charcoal,
    fontSize: 23,
    fontWeight: '900',
  },
  perYear: {
    marginLeft: 5,
    color: C.mutedGray,
    fontSize: 11,
  },
  planLimit: {
    marginTop: 9,
    color: C.mutedGray,
    fontSize: 11,
  },
  divider: {
    height: 1,
    marginVertical: 17,
    backgroundColor: C.softGray,
  },
  includes: {
    marginBottom: 8,
    color: C.mutedGray,
    fontSize: 10,
    fontWeight: '900',
  },
  feature: {
    marginTop: 9,
    color: C.mutedGray,
    fontSize: 11,
  },
  buttons: {
    marginTop: 'auto',
    gap: 9,
  },
  useButton: {
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  useButtonText: {
    fontSize: 12,
    fontWeight: '900',
  },
  exportButton: {
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.softGray,
    alignItems: 'center',
  },
  exportButtonText: {
    color: C.mutedGray,
    fontSize: 12,
    fontWeight: '800',
  },
});
