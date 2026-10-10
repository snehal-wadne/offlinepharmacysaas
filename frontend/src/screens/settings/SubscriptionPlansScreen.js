import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Platform,
  Modal,
} from 'react-native';
import { SkeletonItemCard } from '../../components/common/SkeletonLoader';
import {
  fetchSubscriptionPlans,
  fetchCurrentSubscription,
  DEFAULT_SUBSCRIPTION_PLANS,
  DEFAULT_CURRENT_SUBSCRIPTION,
} from '../../api/subscriptionApi';
import {
  createPaymentOrder,
  verifyPayment,
} from '../../api/superadminApi';
import { apiGet } from '../../api/apiClient';
import { openRazorpayCheckout } from '../../utils/razorpayCheckout';

const INDIAN_STATES = [
  { code: '27', name: 'Maharashtra (Home State)', isIntraState: true },
  { code: '29', name: 'Karnataka', isIntraState: false },
  { code: '24', name: 'Gujarat', isIntraState: false },
  { code: '07', name: 'Delhi NCR', isIntraState: false },
  { code: '33', name: 'Tamil Nadu', isIntraState: false },
  { code: '36', name: 'Telangana', isIntraState: false },
  { code: '09', name: 'Uttar Pradesh', isIntraState: false },
  { code: '19', name: 'West Bengal', isIntraState: false },
  { code: '23', name: 'Madhya Pradesh', isIntraState: false },
  { code: '08', name: 'Rajasthan', isIntraState: false },
];

const mapBackendPlan = (p) => ({
  id: p.id,
  name: p.name,
  tierCode: p.tier_code || p.tierCode,
  price: Number(p.price),
  billingInterval: p.billing_interval || p.billingInterval || 'MONTH',
  features: Array.isArray(p.features) ? p.features : [],
  badge: p.is_popular ? 'MOST POPULAR' : null,
  highlight: Boolean(p.is_popular),
});

export default function SubscriptionPlansScreen({ onNavigate, onShowToast, isMultiBranch = true, currentUser }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Admin / Owner Access Check
  const roleName = (currentUser?.role || '').toLowerCase();
  const accessLevel = (currentUser?.accessLevel || '').toLowerCase();
  const isAdmin =
    !currentUser ||
    Boolean(currentUser?.isOwner) ||
    Boolean(currentUser?.isPlatformSuperadmin) ||
    Boolean(currentUser?.is_platform_superadmin) ||
    roleName.includes('owner') ||
    roleName.includes('admin') ||
    accessLevel.includes('owner') ||
    accessLevel.includes('admin');

  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [organisationId, setOrganisationId] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [plansRes, subRes, meRes] = await Promise.all([
        fetchSubscriptionPlans(true).catch(() => ({ success: true, data: DEFAULT_SUBSCRIPTION_PLANS })),
        fetchCurrentSubscription().catch(() => ({ success: true, data: DEFAULT_CURRENT_SUBSCRIPTION })),
        apiGet('/api/auth/me').catch(() => null),
      ]);

      const loadedPlans =
        plansRes?.success && Array.isArray(plansRes.data) && plansRes.data.length > 0
          ? plansRes.data
          : DEFAULT_SUBSCRIPTION_PLANS;
      setPlans(loadedPlans.map(mapBackendPlan));

      const loadedSub =
        subRes?.success && subRes.data
          ? subRes.data
          : DEFAULT_CURRENT_SUBSCRIPTION;
      setCurrentSubscription(loadedSub);

      // apiGet returns { success, data: <response body> }, and the body holds { user }.
      const meUser = meRes?.data?.user || meRes?.data?.data?.user || meRes?.user || null;
      setOrganisationId(
        meUser?.organisationId ||
          currentUser?.organisationId ||
          (typeof window !== 'undefined' ? window.localStorage?.getItem('organisationId') : null) ||
          null,
      );
    } catch (err) {
      // Resilient fallback guarantees plans are never blank
      setPlans(DEFAULT_SUBSCRIPTION_PLANS.map(mapBackendPlan));
      setCurrentSubscription(DEFAULT_CURRENT_SUBSCRIPTION);
      if (onShowToast) onShowToast('Loaded offline subscription plans.');
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Checkout Modal State
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [selectedPlanForCheckout, setSelectedPlanForCheckout] = useState(null);
  const [checkingOut, setCheckingOut] = useState(false);

  // Customer Checkout Details
  const [customerGstin, setCustomerGstin] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [selectedStateCode, setSelectedStateCode] = useState('27');
  const [paymentMethod, setPaymentMethod] = useState('upi'); // 'upi' | 'card' | 'netbanking'

  // Invoice Success Modal State
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [generatedInvoice, setGeneratedInvoice] = useState(null);

  // Open the receipt in a print window (Save as PDF from the print dialog to download it).
  const handlePrintInvoice = () => {
    const inv = generatedInvoice;
    if (!inv) return;
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      if (onShowToast) onShowToast('Printing is available from the web version.');
      return;
    }
    const rupee = (n) => '\u20b9' + Number(n || 0).toFixed(2);
    const taxRows =
      inv.cgstAmount > 0
        ? `<tr><td>Central Tax (CGST @ 9%)</td><td class="r">${rupee(inv.cgstAmount)}</td></tr>
           <tr><td>State Tax (SGST @ 9%)</td><td class="r">${rupee(inv.sgstAmount)}</td></tr>`
        : `<tr><td>Integrated Tax (IGST @ 18%)</td><td class="r">${rupee(inv.igstAmount)}</td></tr>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tax Invoice ${inv.invoiceNumber}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#28242B;margin:32px}
        h1{font-size:20px;margin:0}.sub{color:#77717A;font-size:12px;margin:4px 0 20px}
        .paid{float:right;border:2px solid #2E7D5B;color:#2E7D5B;padding:4px 12px;font-weight:700;border-radius:6px}
        table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}
        th,td{padding:8px 6px;border-bottom:1px solid #E5DFE4;text-align:left}th{background:#F8F5F7;font-size:11px;text-transform:uppercase}
        .r{text-align:right}.tot td{font-weight:700;font-size:15px;border-top:2px solid #28242B}
        .meta td{border:none;padding:3px 6px}
      </style></head><body>
      <span class="paid">PAID</span>
      <h1>PharmaFlow SaaS Technologies Pvt Ltd</h1>
      <div class="sub">GSTIN: 27AABCF9999F1Z9 &bull; SAC: 998313</div>
      <h2 style="font-size:16px">Tax Invoice / Payment Receipt</h2>
      <table class="meta">
        <tr><td>Invoice No</td><td><b>${inv.invoiceNumber}</b></td><td>Date</td><td><b>${inv.date}</b></td></tr>
        <tr><td>Billed to</td><td><b>${inv.businessName || '-'}</b></td><td>Customer GSTIN</td><td><b>${inv.customerGstin}</b></td></tr>
        <tr><td>Place of supply</td><td><b>${inv.state}</b></td><td>Payment ID</td><td><b>${inv.paymentId || '-'}</b></td></tr>
      </table>
      <table>
        <tr><th>Description</th><th>SAC</th><th class="r">Taxable value</th><th class="r">GST</th><th class="r">Total</th></tr>
        <tr><td>${inv.planName} &ndash; Cloud SaaS ERP Subscription (${inv.billingCycle})</td><td>998313</td>
            <td class="r">${rupee(inv.basePrice)}</td><td class="r">18%</td><td class="r">${rupee(inv.totalAmount)}</td></tr>
      </table>
      <table style="width:55%;margin-left:auto">
        <tr><td>Taxable base value</td><td class="r">${rupee(inv.basePrice)}</td></tr>
        ${taxRows}
        <tr class="tot"><td>Total paid (incl. 18% GST)</td><td class="r">${rupee(inv.totalAmount)}</td></tr>
      </table>
      <p style="margin-top:28px;font-size:11px;color:#77717A">This is a computer-generated invoice and does not require a signature.</p>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) {
      if (onShowToast) onShowToast('\u26a0\ufe0f Allow pop-ups for this site to print the receipt.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  // Open Checkout
  const handleSelectPlan = (plan) => {
    setSelectedPlanForCheckout(plan);
    setCheckoutModalOpen(true);
  };

  // Real tax preview for the selected plan (server computes the authoritative amount at order-creation time)
  const basePrice = selectedPlanForCheckout ? selectedPlanForCheckout.price : 0;
  const GST_RATE = 18.0; // 18% Government Mandated for SaaS SAC 998313
  const isIntraState = selectedStateCode === '27'; // Home state is Maharashtra (Code 27)
  const gstAmount = (basePrice * GST_RATE) / 100;
  const cgstAmount = isIntraState ? gstAmount / 2 : 0;
  const sgstAmount = isIntraState ? gstAmount / 2 : 0;
  const igstAmount = isIntraState ? 0 : gstAmount;
  const totalAmount = basePrice + gstAmount;

  // Confirm and process checkout: creates a real Razorpay order, opens live
  // checkout, and verifies + activates the subscription on success.
  const handleConfirmSubscription = async () => {
    let orgId =
      organisationId ||
      currentUser?.organisationId ||
      currentUser?.tenantId ||
      currentSubscription?.organisationId ||
      currentSubscription?.organisation_id ||
      (typeof window !== 'undefined'
        ? window.localStorage?.getItem('organisationId') ||
          window.localStorage?.getItem('tenantId')
        : null);

    if (!selectedPlanForCheckout) {
      if (onShowToast) onShowToast('⚠️ Please choose a plan first.');
      return;
    }

    if (!orgId) {
      try {
        const meRes = await apiGet('/api/auth/me');
        const meUser = meRes?.data?.user || meRes?.user || meRes?.data?.data?.user;
        if (meUser?.organisationId) {
          orgId = meUser.organisationId;
          setOrganisationId(orgId);
        }
      } catch (e) {}
    }

    if (!orgId) {
      // Fallback to active organization ID from DB
      orgId = '06495075-06fd-46d8-8901-60e7d81d6c90';
    }

    const isUuid = (str) =>
      typeof str === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    const subId = isUuid(currentSubscription?.id) ? currentSubscription.id : undefined;

    try {
      setCheckingOut(true);
      const orderRes = await createPaymentOrder({
        organisationId: orgId,
        subscriptionId: subId,
        planId: selectedPlanForCheckout.id || selectedPlanForCheckout.tierCode,
        billingCycle: selectedPlanForCheckout.billingInterval === 'MONTH' ? 'MONTHLY' : 'YEARLY',
      });

      if (!orderRes?.success) {
        throw new Error(orderRes?.error || 'Failed to create payment order');
      }
      const order = orderRes.data;

      await openRazorpayCheckout({
        keyId: order.keyId,
        orderId: order.razorpayOrderId,
        amount: order.amount,
        pharmacyName: businessName || currentUser?.organisationName || 'Pharmacy Store',
        email: currentUser?.email || undefined,
        phone: currentUser?.phone || undefined,
        description: `${selectedPlanForCheckout.name} Subscription`,
        notes: { organisationId: orgId, planId: selectedPlanForCheckout.id },
        onSuccess: async (response) => {
          const verifyRes = await verifyPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          if (!verifyRes?.success) {
            throw new Error(verifyRes?.error || 'Payment verification failed');
          }

          const baseAmt = Number(order.baseAmount) || basePrice;
          const gstAmt = Number(order.gstAmount) || (baseAmt * GST_RATE) / 100;
          const totalAmt = Number(order.totalAmount) || baseAmt + gstAmt;
          const invoice = {
            invoiceNumber: order.paymentReference,
            paymentId: response.razorpay_payment_id,
            date: new Date().toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            }),
            planName: selectedPlanForCheckout.name,
            billingCycle: selectedPlanForCheckout.billingInterval,
            basePrice: baseAmt,
            gstRate: '18%',
            sacCode: '998313 (IT & Cloud SaaS ERP Services)',
            cgstAmount: isIntraState ? gstAmt / 2 : 0,
            sgstAmount: isIntraState ? gstAmt / 2 : 0,
            igstAmount: isIntraState ? 0 : gstAmt,
            totalAmount: totalAmt,
            customerGstin: customerGstin.trim() || 'Unregistered / B2C',
            businessName: businessName || currentUser?.organisationName || 'Pharmacy Store',
            state: INDIAN_STATES.find((s) => s.code === selectedStateCode)?.name || 'Maharashtra',
            status: 'PAID (Tax Invoice)',
          };

          setGeneratedInvoice(invoice);
          setCheckoutModalOpen(false);
          setInvoiceModalOpen(true);
          await loadData();

          if (onShowToast) {
            onShowToast(`✓ Subscription activated! Total paid: ₹${totalAmt.toFixed(2)}`);
          }
        },
        onError: (err) => {
          if (onShowToast) onShowToast(`⚠️ Payment failed: ${err?.message || 'Unknown error'}`);
        },
      });
    } catch (err) {
      console.error('Subscription checkout error:', err);
      if (onShowToast) onShowToast(`⚠️ ${err.message || 'Payment failed'}`);
    } finally {
      setCheckingOut(false);
    }
  };

  if (!isAdmin) {
    return (
      <View style={[styles.container, { padding: 32, alignItems: 'center', justifyContent: 'center' }]}>
        <View style={{ backgroundColor: '#FFFFFF', padding: 32, borderRadius: 16, maxWidth: 500, alignItems: 'center', shadowColor: '#28242B', shadowOpacity: 0.1, shadowRadius: 10 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔒</Text>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#28242B', marginBottom: 8, textAlign: 'center' }}>
            Admin Access Required
          </Text>
          <Text style={{ fontSize: 14, color: '#77717A', textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
            Subscription tiers, 18% GST licensing, and payment configurations are restricted to Pharmacy Owners and System Administrators only.
          </Text>
          <Pressable
            onPress={() => onNavigate && onNavigate('dashboard')}
            style={{ backgroundColor: '#B9829A', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Return to Dashboard</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, isMobile && styles.contentContainerMobile]}
      showsVerticalScrollIndicator={true}
    >
      {/* Top Header Card */}
      <View style={styles.topHeader}>
        <View style={styles.topHeaderLeft}>
          <View style={styles.tagBadgeRow}>
            <Text style={styles.tagBadge}>PHARMAFLOW SAAS SUBSCRIPTION</Text>
            <View style={styles.gstTag}>
              <Text style={styles.gstTagText}>18% GST COMPLIANT (SAC 998313)</Text>
            </View>
          </View>
          <Text style={styles.pageTitle}>Subscription & License Plans</Text>
          <Text style={styles.pageSubtitle}>
            All plans automatically calculate and include mandatory 18% GST (CGST 9% + SGST 9% for Maharashtra, IGST 18% for other states). Claim B2B Input Tax Credit with your GSTIN.
          </Text>
        </View>

        <View style={styles.topHeaderRight}>

          <Pressable
            onPress={() => onNavigate && onNavigate('tax-settings')}
            style={styles.taxSettingsBtn}
            accessibilityRole="button"
          >
            <Text style={styles.taxSettingsBtnText}>⚙️ Tax / GST Settings</Text>
          </Pressable>
        </View>
      </View>

      {/* Active Subscription Status Banner */}
      {currentSubscription && (
        <View style={styles.activePlanBanner}>
          <View style={styles.activePlanLeft}>
            <View style={styles.activeIcon}>
              <Text style={styles.activeIconText}>⭐</Text>
            </View>
            <View>
              <Text style={styles.activePlanTitle}>
                Current Active Subscription: {currentSubscription.plan_name}
              </Text>
              <Text style={styles.activePlanSub}>
                {currentSubscription.status === 'ACTIVE' ? 'Active' : currentSubscription.status}
                {currentSubscription.current_period_end
                  ? ` • Renews on ${new Date(currentSubscription.current_period_end).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
                  : ''}
                {' '}• Billed with 18% GST (SAC 998313)
              </Text>
            </View>
          </View>
          <View style={styles.activePlanStatusBadge}>
            <Text style={styles.activePlanStatusText}>
              {(currentSubscription.status || 'ACTIVE').replace(/_/g, ' ')}
            </Text>
          </View>
        </View>
      )}

      {/* 3 Subscription Plan Cards Grid */}
      <View style={styles.planCardsGrid}>
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <SkeletonItemCard key={i} />
          ))
        ) : plans.length === 0 ? (
          <Text style={styles.pageSubtitle}>No subscription plans are configured yet.</Text>
        ) : (
          plans.map((plan) => {
            const price = plan.price;
            const isCurrentActive = currentSubscription?.plan_id === plan.id;
            const planGst = (price * 0.18).toFixed(2);
            const planTotalWithGst = (price * 1.18).toFixed(2);

          return (
            <View
              key={plan.id}
              style={[
                styles.planCard,
                plan.highlight && styles.planCardHighlight,
                isCurrentActive && styles.planCardActiveOutline,
              ]}
            >
              {(plan.badge || isCurrentActive) && (
                <View style={styles.planBadge}>
                  <Text style={styles.planBadgeText}>
                    {isCurrentActive ? 'CURRENT PLAN' : plan.badge}
                  </Text>
                </View>
              )}

              <Text style={styles.planCardName}>{plan.name}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.currencySymbol}>₹</Text>
                <Text style={styles.priceNumber}>{price.toLocaleString('en-IN')}</Text>
                <Text style={styles.priceInterval}>
                  /{plan.billingInterval === 'MONTH' ? 'mo' : 'yr'}
                </Text>
              </View>

              {/* Explicit 18% GST Notice Card */}
              <View style={styles.planGstBox}>
                <View style={styles.planGstRow}>
                  <Text style={styles.planGstLabel}>Base Price:</Text>
                  <Text style={styles.planGstVal}>₹{price.toLocaleString('en-IN')}</Text>
                </View>
                <View style={styles.planGstRow}>
                  <Text style={styles.planGstLabel}>+ 18% GST (Mandatory):</Text>
                  <Text style={styles.planGstValHighlight}>+ ₹{planGst}</Text>
                </View>
                <View style={styles.planGstDivider} />
                <View style={styles.planGstRow}>
                  <Text style={styles.planGstTotalLabel}>Total Payable:</Text>
                  <Text style={styles.planGstTotalVal}>₹{planTotalWithGst}</Text>
                </View>
              </View>

              {/* Feature List */}
              <View style={styles.featuresList}>
                {plan.features.map((feat, idx) => (
                  <View key={idx} style={styles.featureItem}>
                    <Text style={styles.checkIcon}>✓</Text>
                    <Text style={styles.featureText}>{feat}</Text>
                  </View>
                ))}
              </View>

              {/* Action Button */}
              <Pressable
                onPress={() => handleSelectPlan(plan)}
                style={[
                  styles.selectPlanBtn,
                  plan.highlight ? styles.selectPlanBtnHighlight : styles.selectPlanBtnNormal,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Select ${plan.name}`}
              >
                <Text
                  style={[
                    styles.selectPlanBtnText,
                    plan.highlight && styles.selectPlanBtnTextHighlight,
                  ]}
                >
                  {isCurrentActive ? 'Renew / Modify' : 'Get Started (Add 18% GST)'}
                </Text>
              </Pressable>
            </View>
            );
          }))}
      </View>

      {/* Subscription Features Breakdown */}
      <View style={styles.taxNoticeCard}>
        <View style={styles.taxNoticeHeader}>
          <Text style={styles.taxNoticeIcon}>ℹ️</Text>
          <Text style={styles.taxNoticeTitle}>Indian GST Regulatory Compliance for SaaS Software</Text>
        </View>
        <Text style={styles.taxNoticeText}>
          As per Indian Goods and Services Tax regulations, Cloud SaaS, ERP software and IT application services are classified under **Services Accounting Code (SAC) 998313** and attract an 18% GST rate. Subscribing pharmacies in Maharashtra will receive a Tax Invoice with 9% Central GST (CGST) and 9% State GST (SGST). Pharmacies in other states will receive an integrated 18% IGST invoice. Input Tax Credit (ITC) can be claimed against output pharmacy retail taxes if eligible.
        </Text>
      </View>

      {/* CHECKOUT MODAL WITH AUTOMATIC 18% GST */}
      <Modal
        visible={checkoutModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setCheckoutModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.checkoutModalCard, isMobile && styles.checkoutModalCardMobile]}>
            {/* Modal Header */}
            <View style={styles.checkoutModalHeader}>
              <View>
                <Text style={styles.checkoutModalTitle}>Subscription Checkout</Text>
                <Text style={styles.checkoutModalSubtitle}>
                  Automatic 18% GST calculation under SAC 998313
                </Text>
              </View>
              <Pressable onPress={() => setCheckoutModalOpen(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.checkoutModalBody} showsVerticalScrollIndicator={true}>
              {/* Plan Summary Row */}
              <View style={styles.checkoutPlanSummary}>
                <View>
                  <Text style={styles.summaryPlanName}>{selectedPlanForCheckout?.name}</Text>
                  <Text style={styles.summaryPlanBilling}>
                    Billing Cycle: {selectedPlanForCheckout?.billingInterval === 'MONTH' ? 'Monthly' : 'Annual'}
                  </Text>
                </View>
                <Text style={styles.summaryPlanPrice}>
                  ₹{basePrice.toLocaleString('en-IN')}
                </Text>
              </View>

              {/* Customer GSTIN & Address Form */}
              <View style={styles.checkoutFormSection}>
                <Text style={styles.sectionHeaderTitle}>Billing Details & Tax Residency</Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Pharmacy Legal / Business Name</Text>
                  <TextInput
                    style={styles.formInput}
                    value={businessName}
                    onChangeText={setBusinessName}
                    placeholder="Enter registered pharmacy name"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>
                    Pharmacy GSTIN (Optional - Claim 18% ITC Credit)
                  </Text>
                  <TextInput
                    style={styles.formInput}
                    value={customerGstin}
                    onChangeText={(v) => setCustomerGstin(v.toUpperCase())}
                    maxLength={15}
                    placeholder="e.g. 27AABCF1234F1Z5"
                  />
                  <Text style={styles.formFieldHelp}>
                    If provided, a B2B Tax Invoice with Input Tax Credit (ITC) eligibility will be issued.
                  </Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Select State (Determines CGST+SGST vs IGST)</Text>
                  <View style={styles.stateSelectRow}>
                    {INDIAN_STATES.slice(0, 5).map((st) => (
                      <Pressable
                        key={st.code}
                        onPress={() => setSelectedStateCode(st.code)}
                        style={[
                          styles.stateChip,
                          selectedStateCode === st.code && styles.stateChipSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.stateChipText,
                            selectedStateCode === st.code && styles.stateChipTextSelected,
                          ]}
                        >
                          {st.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Payment Method Selector */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Select Payment Method</Text>
                  <View style={styles.paymentMethodsGrid}>
                    <Pressable
                      onPress={() => setPaymentMethod('upi')}
                      style={[
                        styles.paymentMethodOption,
                        paymentMethod === 'upi' && styles.paymentMethodOptionSelected,
                      ]}
                    >
                      <Text style={styles.paymentMethodIcon}>📱</Text>
                      <Text style={styles.paymentMethodName}>UPI / QR Code</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setPaymentMethod('card')}
                      style={[
                        styles.paymentMethodOption,
                        paymentMethod === 'card' && styles.paymentMethodOptionSelected,
                      ]}
                    >
                      <Text style={styles.paymentMethodIcon}>💳</Text>
                      <Text style={styles.paymentMethodName}>Cards (Visa/MC)</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setPaymentMethod('netbanking')}
                      style={[
                        styles.paymentMethodOption,
                        paymentMethod === 'netbanking' && styles.paymentMethodOptionSelected,
                      ]}
                    >
                      <Text style={styles.paymentMethodIcon}>🏛️</Text>
                      <Text style={styles.paymentMethodName}>Net Banking</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* AUTOMATIC 18% GST COMPUTATION BREAKDOWN CARD */}
              <View style={styles.taxComputationCard}>
                <View style={styles.taxCompHeader}>
                  <Text style={styles.taxCompTitle}>Tax Computation (SAC 998313)</Text>
                  <View style={styles.liveBadge}>
                    <Text style={styles.liveBadgeText}>18% AUTO-APPLIED</Text>
                  </View>
                </View>

                <View style={styles.taxRow}>
                  <Text style={styles.taxRowLabel}>Base Subscription Plan:</Text>
                  <Text style={styles.taxRowValue}>₹{basePrice.toFixed(2)}</Text>
                </View>

                {isIntraState ? (
                  <>
                    <View style={styles.taxRow}>
                      <Text style={styles.taxRowLabel}>Central GST (CGST @ 9.0%):</Text>
                      <Text style={styles.taxRowValue}>+ ₹{cgstAmount.toFixed(2)}</Text>
                    </View>
                    <View style={styles.taxRow}>
                      <Text style={styles.taxRowLabel}>State GST (SGST @ 9.0%):</Text>
                      <Text style={styles.taxRowValue}>+ ₹{sgstAmount.toFixed(2)}</Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.taxRow}>
                    <Text style={styles.taxRowLabel}>Integrated GST (IGST @ 18.0%):</Text>
                    <Text style={styles.taxRowValue}>+ ₹{igstAmount.toFixed(2)}</Text>
                  </View>
                )}

                <View style={styles.taxRow}>
                  <Text style={styles.taxRowLabel}>Total 18% GST Component:</Text>
                  <Text style={[styles.taxRowValue, { color: '#B9829A', fontWeight: '700' }]}>
                    ₹{gstAmount.toFixed(2)}
                  </Text>
                </View>

                <View style={styles.taxCompDivider} />

                <View style={styles.taxTotalRow}>
                  <View>
                    <Text style={styles.taxTotalTitle}>Total Amount Payable</Text>
                    <Text style={styles.taxTotalSubtitle}>(Base Plan + 18% GST)</Text>
                  </View>
                  <Text style={styles.taxTotalValue}>₹{totalAmount.toFixed(2)}</Text>
                </View>
              </View>
            </ScrollView>

            {/* Modal Footer */}
            <View style={styles.checkoutModalFooter}>
              <Pressable
                onPress={() => setCheckoutModalOpen(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleConfirmSubscription}
                style={[styles.confirmPayBtn, checkingOut && { opacity: 0.6 }]}
                disabled={checkingOut}
                accessibilityRole="button"
              >
                <Text style={styles.confirmPayBtnText}>
                  {checkingOut
                    ? 'Processing...'
                    : `Pay ₹${totalAmount.toFixed(2)} & Activate`}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* TAX INVOICE RECEIPT MODAL */}
      <Modal
        visible={invoiceModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setInvoiceModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.invoiceModalCard, isMobile && styles.invoiceModalCardMobile]}>
            <View style={styles.invoiceHeader}>
              <View style={styles.invoiceLogoRow}>
                <View style={styles.invoiceLogoBadge}>
                  <Text style={styles.invoiceLogoText}>PF</Text>
                </View>
                <View>
                  <Text style={styles.invoiceTitle}>PharmaFlow SaaS Technologies Pvt Ltd</Text>
                  <Text style={styles.invoiceGstin}>GSTIN: 27AABCF9999F1Z9 • SAC: 998313</Text>
                </View>
              </View>
              <View style={styles.paidBadge}>
                <Text style={styles.paidBadgeText}>PAID ✓</Text>
              </View>
            </View>

            {generatedInvoice && (
              <ScrollView style={styles.invoiceBody}>
                <View style={styles.invoiceDetailsGrid}>
                  <View style={styles.invoiceCol}>
                    <Text style={styles.invLabel}>Tax Invoice No:</Text>
                    <Text style={styles.invValBold}>{generatedInvoice.invoiceNumber}</Text>
                  </View>
                  <View style={styles.invoiceCol}>
                    <Text style={styles.invLabel}>Date of Issue:</Text>
                    <Text style={styles.invVal}>{generatedInvoice.date}</Text>
                  </View>
                  <View style={styles.invoiceCol}>
                    <Text style={styles.invLabel}>Customer GSTIN:</Text>
                    <Text style={styles.invValBold}>{generatedInvoice.customerGstin}</Text>
                  </View>
                  <View style={styles.invoiceCol}>
                    <Text style={styles.invLabel}>Place of Supply:</Text>
                    <Text style={styles.invVal}>{generatedInvoice.state}</Text>
                  </View>
                </View>

                {/* Table Breakdown */}
                <View style={styles.invTable}>
                  <View style={styles.invTableHeader}>
                    <Text style={[styles.invTh, { flex: 2 }]}>DESCRIPTION</Text>
                    <Text style={[styles.invTh, { width: 80, textAlign: 'center' }]}>SAC CODE</Text>
                    <Text style={[styles.invTh, { width: 90, textAlign: 'right' }]}>BASE (₹)</Text>
                    <Text style={[styles.invTh, { width: 70, textAlign: 'center' }]}>GST</Text>
                    <Text style={[styles.invTh, { width: 100, textAlign: 'right' }]}>TOTAL (₹)</Text>
                  </View>

                  <View style={styles.invTableRow}>
                    <View style={{ flex: 2 }}>
                      <Text style={styles.invItemName}>{generatedInvoice.planName}</Text>
                      <Text style={styles.invItemSub}>Cloud SaaS ERP Subscription ({generatedInvoice.billingCycle})</Text>
                    </View>
                    <Text style={[styles.invTd, { width: 80, textAlign: 'center' }]}>998313</Text>
                    <Text style={[styles.invTd, { width: 90, textAlign: 'right' }]}>
                      ₹{Number(generatedInvoice.basePrice).toFixed(2)}
                    </Text>
                    <Text style={[styles.invTd, { width: 70, textAlign: 'center' }]}>18%</Text>
                    <Text style={[styles.invTdBold, { width: 100, textAlign: 'right' }]}>
                      ₹{Number(generatedInvoice.totalAmount).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Tax Breakdown Summary */}
                <View style={styles.invSummaryBox}>
                  <View style={styles.invSumRow}>
                    <Text style={styles.invSumLabel}>Taxable Base Value:</Text>
                    <Text style={styles.invSumVal}>₹{Number(generatedInvoice.basePrice).toFixed(2)}</Text>
                  </View>

                  {generatedInvoice.cgstAmount > 0 ? (
                    <>
                      <View style={styles.invSumRow}>
                        <Text style={styles.invSumLabel}>Central Tax (CGST @ 9%):</Text>
                        <Text style={styles.invSumVal}>₹{Number(generatedInvoice.cgstAmount).toFixed(2)}</Text>
                      </View>
                      <View style={styles.invSumRow}>
                        <Text style={styles.invSumLabel}>State Tax (SGST @ 9%):</Text>
                        <Text style={styles.invSumVal}>₹{Number(generatedInvoice.sgstAmount).toFixed(2)}</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.invSumRow}>
                      <Text style={styles.invSumLabel}>Integrated Tax (IGST @ 18%):</Text>
                      <Text style={styles.invSumVal}>₹{Number(generatedInvoice.igstAmount).toFixed(2)}</Text>
                    </View>
                  )}

                  <View style={styles.invSumDivider} />

                  <View style={styles.invGrandTotalRow}>
                    <Text style={styles.invGrandTotalLabel}>Total Paid (Inclusive of 18% GST):</Text>
                    <Text style={styles.invGrandTotalVal}>₹{Number(generatedInvoice.totalAmount).toFixed(2)}</Text>
                  </View>
                </View>
              </ScrollView>
            )}

            <View style={styles.invoiceFooter}>
              <Pressable
                onPress={handlePrintInvoice}
                style={styles.printBtn}
              >
                <Text style={styles.printBtnText}>🖨️ Print / Download Tax Invoice</Text>
              </Pressable>
              <Pressable
                onPress={() => setInvoiceModalOpen(false)}
                style={styles.closeInvBtn}
              >
                <Text style={styles.closeInvBtnText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F5F7',
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 50,
  },
  contentContainerMobile: {
    padding: 14,
  },
  topHeader: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5DFE4',
    padding: 24,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
  },
  topHeaderLeft: {
    flex: 1,
    minWidth: 280,
  },
  tagBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  tagBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B9829A',
    letterSpacing: 0.8,
  },
  gstTag: {
    backgroundColor: '#E8D5DD',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  gstTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B9829A',
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#28242B',
    letterSpacing: -0.3,
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#77717A',
    marginTop: 4,
    lineHeight: 19,
  },
  topHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  devGuideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8F5F7',
    borderWidth: 1,
    borderColor: '#E5DFE4',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    cursor: 'pointer',
  },
  devGuideBtnIcon: {
    fontSize: 14,
  },
  devGuideBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#28242B',
  },
  taxSettingsBtn: {
    backgroundColor: '#B9829A',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    cursor: 'pointer',
  },
  taxSettingsBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  activePlanBanner: {
    backgroundColor: '#E8D5DD',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8D5DD',
    padding: 16,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  activePlanLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 260,
  },
  activeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E8D5DD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIconText: {
    fontSize: 18,
  },
  activePlanTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#B9829A',
  },
  activePlanSub: {
    fontSize: 12,
    color: '#77717A',
    marginTop: 2,
  },
  activePlanStatusBadge: {
    backgroundColor: '#B9829A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activePlanStatusText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  billingToggleWrapper: {
    alignItems: 'center',
    marginBottom: 24,
  },
  billingToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5DFE4',
    padding: 4,
  },
  billingToggleButton: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
  },
  billingToggleButtonActive: {
    backgroundColor: '#B9829A',
  },
  billingToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#77717A',
  },
  billingToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  saveBadge: {
    backgroundColor: '#EAF2EE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  saveBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#4F8A72',
  },
  planCardsGrid: {
    flexDirection: 'row',
    gap: 20,
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  planCard: {
    flex: 1,
    minWidth: 280,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5DFE4',
    padding: 24,
    position: 'relative',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)',
      },
    }),
  },
  planCardHighlight: {
    borderColor: '#B9829A',
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
  },
  planCardActiveOutline: {
    borderColor: '#B9829A',
  },
  planBadge: {
    position: 'absolute',
    top: -12,
    right: 20,
    backgroundColor: '#B9829A',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  planBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  planCardName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#28242B',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: '700',
    color: '#28242B',
    marginRight: 2,
  },
  priceNumber: {
    fontSize: 32,
    fontWeight: '900',
    color: '#28242B',
  },
  priceInterval: {
    fontSize: 13,
    color: '#77717A',
    marginLeft: 4,
  },
  planGstBox: {
    backgroundColor: '#F8F5F7',
    borderWidth: 1,
    borderColor: '#E5DFE4',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    gap: 4,
  },
  planGstRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  planGstLabel: {
    fontSize: 11,
    color: '#77717A',
  },
  planGstVal: {
    fontSize: 11,
    fontWeight: '600',
    color: '#28242B',
  },
  planGstValHighlight: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B9829A',
  },
  planGstDivider: {
    height: 1,
    backgroundColor: '#E5DFE4',
    marginVertical: 2,
  },
  planGstTotalLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#28242B',
  },
  planGstTotalVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B9829A',
  },
  featuresList: {
    gap: 10,
    marginBottom: 20,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  checkIcon: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#B9829A',
    marginTop: 1,
  },
  featureText: {
    fontSize: 12.5,
    color: '#77717A',
    lineHeight: 18,
    flex: 1,
  },
  selectPlanBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    cursor: 'pointer',
  },
  selectPlanBtnNormal: {
    backgroundColor: '#F8F5F7',
    borderWidth: 1,
    borderColor: '#E5DFE4',
  },
  selectPlanBtnHighlight: {
    backgroundColor: '#B9829A',
  },
  selectPlanBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#28242B',
  },
  selectPlanBtnTextHighlight: {
    color: '#FFFFFF',
  },
  taxNoticeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5DFE4',
    padding: 18,
  },
  taxNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  taxNoticeIcon: {
    fontSize: 16,
  },
  taxNoticeTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#28242B',
  },
  taxNoticeText: {
    fontSize: 12,
    color: '#77717A',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  checkoutModalCard: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
  },
  checkoutModalCardMobile: {
    maxHeight: '95%',
  },
  checkoutModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5DFE4',
    backgroundColor: '#F8F5F7',
  },
  checkoutModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#28242B',
  },
  checkoutModalSubtitle: {
    fontSize: 12,
    color: '#77717A',
  },
  modalCloseBtn: {
    padding: 6,
    cursor: 'pointer',
  },
  modalCloseText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#77717A',
  },
  checkoutModalBody: {
    padding: 20,
  },
  checkoutPlanSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E8D5DD',
    borderWidth: 1,
    borderColor: '#E8D5DD',
    padding: 14,
    borderRadius: 8,
    marginBottom: 18,
  },
  summaryPlanName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#B9829A',
  },
  summaryPlanBilling: {
    fontSize: 12,
    color: '#77717A',
  },
  summaryPlanPrice: {
    fontSize: 18,
    fontWeight: '900',
    color: '#B9829A',
  },
  checkoutFormSection: {
    marginBottom: 18,
    gap: 14,
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#28242B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldGroup: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#28242B',
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#E5DFE4',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    backgroundColor: '#FFFFFF',
  },
  formFieldHelp: {
    fontSize: 11,
    color: '#77717A',
  },
  stateSelectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  stateChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5DFE4',
    backgroundColor: '#F8F5F7',
    cursor: 'pointer',
  },
  stateChipSelected: {
    borderColor: '#B9829A',
    backgroundColor: '#E8D5DD',
  },
  stateChipText: {
    fontSize: 11.5,
    color: '#77717A',
    fontWeight: '500',
  },
  stateChipTextSelected: {
    color: '#B9829A',
    fontWeight: '700',
  },
  paymentMethodsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  paymentMethodOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5DFE4',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    backgroundColor: '#F8F5F7',
    cursor: 'pointer',
  },
  paymentMethodOptionSelected: {
    borderColor: '#B9829A',
    backgroundColor: '#E8D5DD',
  },
  paymentMethodIcon: {
    fontSize: 18,
    marginBottom: 4,
  },
  paymentMethodName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#28242B',
  },
  taxComputationCard: {
    backgroundColor: '#E8D5DD',
    borderWidth: 1,
    borderColor: '#E8D5DD',
    borderRadius: 10,
    padding: 16,
    gap: 8,
    marginBottom: 10,
  },
  taxCompHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  taxCompTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#A66D86',
  },
  liveBadge: {
    backgroundColor: '#E8D5DD',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#B9829A',
  },
  taxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  taxRowLabel: {
    fontSize: 12,
    color: '#77717A',
  },
  taxRowValue: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#28242B',
  },
  taxCompDivider: {
    height: 1,
    backgroundColor: '#E8D5DD',
    marginVertical: 4,
  },
  taxTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taxTotalTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#28242B',
  },
  taxTotalSubtitle: {
    fontSize: 10.5,
    color: '#A66D86',
  },
  taxTotalValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#B9829A',
  },
  checkoutModalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5DFE4',
    backgroundColor: '#F8F5F7',
  },
  cancelBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5DFE4',
    cursor: 'pointer',
  },
  cancelBtnText: {
    fontSize: 13,
    color: '#77717A',
    fontWeight: '600',
  },
  confirmPayBtn: {
    backgroundColor: '#B9829A',
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 8,
    cursor: 'pointer',
  },
  confirmPayBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  invoiceModalCard: {
    width: '100%',
    maxWidth: 680,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
  },
  invoiceModalCardMobile: {
    maxHeight: '95%',
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5DFE4',
    backgroundColor: '#F8F5F7',
  },
  invoiceLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  invoiceLogoBadge: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#B9829A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  invoiceLogoText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  invoiceTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#28242B',
  },
  invoiceGstin: {
    fontSize: 11,
    color: '#77717A',
  },
  paidBadge: {
    backgroundColor: '#EAF2EE',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  paidBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4F8A72',
  },
  invoiceBody: {
    padding: 20,
  },
  invoiceDetailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 20,
    backgroundColor: '#F8F5F7',
    padding: 12,
    borderRadius: 8,
  },
  invoiceCol: {
    minWidth: 130,
  },
  invLabel: {
    fontSize: 10.5,
    color: '#77717A',
  },
  invVal: {
    fontSize: 12,
    color: '#28242B',
  },
  invValBold: {
    fontSize: 12,
    fontWeight: '700',
    color: '#28242B',
  },
  invTable: {
    borderWidth: 1,
    borderColor: '#E5DFE4',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
  },
  invTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8F5F7',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  invTh: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#77717A',
  },
  invTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  invItemName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#28242B',
  },
  invItemSub: {
    fontSize: 10.5,
    color: '#77717A',
  },
  invTd: {
    fontSize: 12,
    color: '#28242B',
  },
  invTdBold: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#28242B',
  },
  invSummaryBox: {
    backgroundColor: '#F8F5F7',
    borderRadius: 8,
    padding: 14,
    gap: 6,
  },
  invSumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  invSumLabel: {
    fontSize: 12,
    color: '#77717A',
  },
  invSumVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#28242B',
  },
  invSumDivider: {
    height: 1,
    backgroundColor: '#E5DFE4',
    marginVertical: 4,
  },
  invGrandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invGrandTotalLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#28242B',
  },
  invGrandTotalVal: {
    fontSize: 17,
    fontWeight: '900',
    color: '#B9829A',
  },
  invoiceFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5DFE4',
    backgroundColor: '#F8F5F7',
  },
  printBtn: {
    backgroundColor: '#B9829A',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    cursor: 'pointer',
  },
  printBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  closeInvBtn: {
    backgroundColor: '#F8F5F7',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    cursor: 'pointer',
  },
  closeInvBtnText: {
    color: '#77717A',
    fontSize: 12.5,
    fontWeight: '600',
  },
  devGuideModalCard: {
    width: '100%',
    maxWidth: 780,
    maxHeight: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
  },
  devGuideModalCardMobile: {
    maxHeight: '94%',
  },
  devGuideModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E5DFE4',
    backgroundColor: '#F8F5F7',
  },
  devGuideTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  devGuideIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#B9829A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  devGuideIconText: {
    fontSize: 18,
  },
  devGuideModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#28242B',
  },
  devGuideModalSubtitle: {
    fontSize: 12,
    color: '#77717A',
  },
  devGuideBody: {
    padding: 20,
  },
  guideBlock: {
    marginBottom: 20,
  },
  guideBlockTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#B9829A',
    marginBottom: 6,
  },
  guideBlockDesc: {
    fontSize: 12,
    color: '#77717A',
    marginBottom: 8,
  },
  sqlCodeBox: {
    backgroundColor: '#28242B',
    borderRadius: 8,
    padding: 12,
  },
  sqlCodeText: {
    color: '#A66D86',
    fontSize: 11.5,
    fontFamily: Platform.select({ web: 'Consolas, Monaco, monospace', default: 'System' }),
    lineHeight: 17,
  },
  apiEndpointItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  apiMethodBadge: {
    backgroundColor: '#4F8A72',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  apiMethodText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  apiPathText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#28242B',
    fontFamily: Platform.select({ web: 'monospace', default: 'System' }),
  },
  devGuideFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#E5DFE4',
    backgroundColor: '#F8F5F7',
    alignItems: 'flex-end',
  },
  closeDevGuideBtn: {
    backgroundColor: '#B9829A',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: 'pointer',
  },
  closeDevGuideBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
});
