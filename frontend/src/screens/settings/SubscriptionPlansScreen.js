import React, { useState } from 'react';
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

const SUBSCRIPTION_PLANS = [
  {
    id: 'plan-starter',
    name: 'Single Pharmacy Starter',
    monthlyPrice: 999,
    annualPrice: 9990,
    features: [
      '1 Pharmacy Store Branch',
      'Up to 3 Staff / Cashier Logins',
      'Real-time Inventory & Batch Tracking',
      'GST Billing & Barcode Thermal Printing',
      'Customer Ledger & Credit Balances',
      'Standard Daily Sales Reports',
    ],
    badge: null,
    highlight: false,
  },
  {
    id: 'plan-growth',
    name: 'Multi-Branch Growth ERP',
    monthlyPrice: 2499,
    annualPrice: 24990,
    features: [
      'Up to 5 Store Branches / Warehouses',
      'Inter-Branch Stock Transfers',
      'Unlimited Users & Custom Role Permissions',
      'Automated Low-Stock & Expiry Alerts',
      'Centralized Purchase Orders & Goods Receiving',
      'Priority WhatsApp & Phone Support',
      'Automated GST GSTR-1 Data Export',
    ],
    badge: 'MOST POPULAR',
    highlight: true,
  },
  {
    id: 'plan-enterprise',
    name: 'Hospital Chain Enterprise',
    monthlyPrice: 4999,
    annualPrice: 49990,
    features: [
      'Unlimited Branches & Central Warehouses',
      'Custom Dedicated Database Deployment',
      'Automated NIC e-Invoicing & e-Way Bill API',
      'HL7 / Hospital HIS & Lab Integration',
      '24/7 Dedicated Account Manager & SLA',
      'Custom ERP Feature Development',
    ],
    badge: 'ENTERPRISE',
    highlight: false,
  },
];

export default function SubscriptionPlansScreen({ onNavigate, onShowToast, isMultiBranch = true }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Billing Cycle: 'monthly' or 'annual'
  const [billingCycle, setBillingCycle] = useState('monthly');

  // Currently active subscription (Mock state)
  const [activePlan, setActivePlan] = useState('plan-growth');

  // Checkout Modal State
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [selectedPlanForCheckout, setSelectedPlanForCheckout] = useState(null);

  // Customer Checkout Details
  const [customerGstin, setCustomerGstin] = useState('27AABCF1234F1Z5');
  const [businessName, setBusinessName] = useState('Flora Pharmacy & Diagnostics');
  const [selectedStateCode, setSelectedStateCode] = useState('27');
  const [paymentMethod, setPaymentMethod] = useState('upi'); // 'upi' | 'card' | 'netbanking'

  // Invoice Success Modal State
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [generatedInvoice, setGeneratedInvoice] = useState(null);


  // Open Checkout
  const handleSelectPlan = (plan) => {
    setSelectedPlanForCheckout(plan);
    setCheckoutModalOpen(true);
  };

  // Tax calculations for current checkout selection
  const basePrice = selectedPlanForCheckout
    ? billingCycle === 'annual'
      ? selectedPlanForCheckout.annualPrice
      : selectedPlanForCheckout.monthlyPrice
    : 0;

  const GST_RATE = 18.0; // 18% Government Mandated for SaaS SAC 998313
  const isIntraState = selectedStateCode === '27'; // Home state is Maharashtra (Code 27)
  const gstAmount = (basePrice * GST_RATE) / 100;
  const cgstAmount = isIntraState ? gstAmount / 2 : 0;
  const sgstAmount = isIntraState ? gstAmount / 2 : 0;
  const igstAmount = isIntraState ? 0 : gstAmount;
  const totalAmount = basePrice + gstAmount;

  // Confirm and process checkout
  const handleConfirmSubscription = () => {
    const invoice = {
      invoiceNumber: `INV-PF-${Date.now().toString().slice(-6)}`,
      date: new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      planName: selectedPlanForCheckout.name,
      billingCycle: billingCycle === 'annual' ? 'Annual (12 Months)' : 'Monthly',
      basePrice,
      gstRate: '18%',
      sacCode: '998313 (IT & Cloud SaaS ERP Services)',
      cgstAmount,
      sgstAmount,
      igstAmount,
      totalAmount,
      customerGstin: customerGstin.trim() || 'Unregistered / B2C',
      businessName,
      state: INDIAN_STATES.find((s) => s.code === selectedStateCode)?.name || 'Maharashtra',
      paymentMethod: paymentMethod.toUpperCase(),
      status: 'PAID (Tax Invoice)',
    };

    setActivePlan(selectedPlanForCheckout.id);
    setGeneratedInvoice(invoice);
    setCheckoutModalOpen(false);
    setInvoiceModalOpen(true);

    if (onShowToast) {
      onShowToast(`✓ Subscription confirmed! 18% GST added. Total: ₹${totalAmount.toFixed(2)}`);
    }
  };

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
      <View style={styles.activePlanBanner}>
        <View style={styles.activePlanLeft}>
          <View style={styles.activeIcon}>
            <Text style={styles.activeIconText}>⭐</Text>
          </View>
          <View>
            <Text style={styles.activePlanTitle}>
              Current Active Subscription: Multi-Branch Growth ERP
            </Text>
            <Text style={styles.activePlanSub}>
              Active for 5 Branches • Renews on 28th of next month • Billed with 18% GST (SAC 998313)
            </Text>
          </View>
        </View>
        <View style={styles.activePlanStatusBadge}>
          <Text style={styles.activePlanStatusText}>ACTIVE SUBSCRIBER</Text>
        </View>
      </View>

      {/* Billing Cycle Toggle (Monthly vs Annual with 20% Discount) */}
      <View style={styles.billingToggleWrapper}>
        <View style={styles.billingToggleContainer}>
          <Pressable
            onPress={() => setBillingCycle('monthly')}
            style={[
              styles.billingToggleButton,
              billingCycle === 'monthly' && styles.billingToggleButtonActive,
            ]}
          >
            <Text
              style={[
                styles.billingToggleText,
                billingCycle === 'monthly' && styles.billingToggleTextActive,
              ]}
            >
              Monthly Billing
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setBillingCycle('annual')}
            style={[
              styles.billingToggleButton,
              billingCycle === 'annual' && styles.billingToggleButtonActive,
            ]}
          >
            <Text
              style={[
                styles.billingToggleText,
                billingCycle === 'annual' && styles.billingToggleTextActive,
              ]}
            >
              Annual Billing
            </Text>
            <View style={styles.saveBadge}>
              <Text style={styles.saveBadgeText}>SAVE 20%</Text>
            </View>
          </Pressable>
        </View>
      </View>

      {/* 3 Subscription Plan Cards Grid */}
      <View style={styles.planCardsGrid}>
        {SUBSCRIPTION_PLANS.map((plan) => {
          const price = billingCycle === 'annual' ? plan.annualPrice : plan.monthlyPrice;
          const isCurrentActive = activePlan === plan.id;
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
              {plan.badge && (
                <View style={styles.planBadge}>
                  <Text style={styles.planBadgeText}>{plan.badge}</Text>
                </View>
              )}

              <Text style={styles.planCardName}>{plan.name}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.currencySymbol}>₹</Text>
                <Text style={styles.priceNumber}>{price.toLocaleString('en-IN')}</Text>
                <Text style={styles.priceInterval}>
                  /{billingCycle === 'annual' ? 'yr' : 'mo'}
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
        })}
      </View>

      {/* Tax Information Banner */}
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
                    Billing Cycle: {billingCycle === 'annual' ? 'Annual (Save 20%)' : 'Monthly'}
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
                  <Text style={[styles.taxRowValue, { color: '#0F766E', fontWeight: '700' }]}>
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
                style={styles.confirmPayBtn}
                accessibilityRole="button"
              >
                <Text style={styles.confirmPayBtnText}>
                  Pay ₹{totalAmount.toFixed(2)} & Activate
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
                      ₹{generatedInvoice.basePrice.toFixed(2)}
                    </Text>
                    <Text style={[styles.invTd, { width: 70, textAlign: 'center' }]}>18%</Text>
                    <Text style={[styles.invTdBold, { width: 100, textAlign: 'right' }]}>
                      ₹{generatedInvoice.totalAmount.toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Tax Breakdown Summary */}
                <View style={styles.invSummaryBox}>
                  <View style={styles.invSumRow}>
                    <Text style={styles.invSumLabel}>Taxable Base Value:</Text>
                    <Text style={styles.invSumVal}>₹{generatedInvoice.basePrice.toFixed(2)}</Text>
                  </View>

                  {generatedInvoice.cgstAmount > 0 ? (
                    <>
                      <View style={styles.invSumRow}>
                        <Text style={styles.invSumLabel}>Central Tax (CGST @ 9%):</Text>
                        <Text style={styles.invSumVal}>₹{generatedInvoice.cgstAmount.toFixed(2)}</Text>
                      </View>
                      <View style={styles.invSumRow}>
                        <Text style={styles.invSumLabel}>State Tax (SGST @ 9%):</Text>
                        <Text style={styles.invSumVal}>₹{generatedInvoice.sgstAmount.toFixed(2)}</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.invSumRow}>
                      <Text style={styles.invSumLabel}>Integrated Tax (IGST @ 18%):</Text>
                      <Text style={styles.invSumVal}>₹{generatedInvoice.igstAmount.toFixed(2)}</Text>
                    </View>
                  )}

                  <View style={styles.invSumDivider} />

                  <View style={styles.invGrandTotalRow}>
                    <Text style={styles.invGrandTotalLabel}>Total Paid (Inclusive of 18% GST):</Text>
                    <Text style={styles.invGrandTotalVal}>₹{generatedInvoice.totalAmount.toFixed(2)}</Text>
                  </View>
                </View>
              </ScrollView>
            )}

            <View style={styles.invoiceFooter}>
              <Pressable
                onPress={() => {
                  setInvoiceModalOpen(false);
                  if (onShowToast) onShowToast('🖨️ Tax Invoice receipt printed/downloaded!');
                }}
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
    backgroundColor: '#F8FAFC',
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
    borderColor: '#E2E8F0',
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
    color: '#0F766E',
    letterSpacing: 0.8,
  },
  gstTag: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  gstTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#7C3AED',
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#64748B',
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
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
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
    color: '#334155',
  },
  taxSettingsBtn: {
    backgroundColor: '#0F766E',
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
    backgroundColor: '#F0FDFA',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#99F6E4',
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
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIconText: {
    fontSize: 18,
  },
  activePlanTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F766E',
  },
  activePlanSub: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  activePlanStatusBadge: {
    backgroundColor: '#0F766E',
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
    borderColor: '#E2E8F0',
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
    backgroundColor: '#0F766E',
  },
  billingToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  billingToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  saveBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  saveBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#15803D',
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
    borderColor: '#E2E8F0',
    padding: 24,
    position: 'relative',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)',
      },
    }),
  },
  planCardHighlight: {
    borderColor: '#0F766E',
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
  },
  planCardActiveOutline: {
    borderColor: '#0F766E',
  },
  planBadge: {
    position: 'absolute',
    top: -12,
    right: 20,
    backgroundColor: '#0F766E',
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
    color: '#0F172A',
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
    color: '#0F172A',
    marginRight: 2,
  },
  priceNumber: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
  },
  priceInterval: {
    fontSize: 13,
    color: '#64748B',
    marginLeft: 4,
  },
  planGstBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    color: '#64748B',
  },
  planGstVal: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  planGstValHighlight: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7C3AED',
  },
  planGstDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 2,
  },
  planGstTotalLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  planGstTotalVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F766E',
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
    color: '#0F766E',
    marginTop: 1,
  },
  featureText: {
    fontSize: 12.5,
    color: '#475569',
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
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  selectPlanBtnHighlight: {
    backgroundColor: '#0F766E',
  },
  selectPlanBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  selectPlanBtnTextHighlight: {
    color: '#FFFFFF',
  },
  taxNoticeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    color: '#0F172A',
  },
  taxNoticeText: {
    fontSize: 12,
    color: '#64748B',
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
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  checkoutModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  checkoutModalSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  modalCloseBtn: {
    padding: 6,
    cursor: 'pointer',
  },
  modalCloseText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#64748B',
  },
  checkoutModalBody: {
    padding: 20,
  },
  checkoutPlanSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    padding: 14,
    borderRadius: 8,
    marginBottom: 18,
  },
  summaryPlanName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F766E',
  },
  summaryPlanBilling: {
    fontSize: 12,
    color: '#475569',
  },
  summaryPlanPrice: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F766E',
  },
  checkoutFormSection: {
    marginBottom: 18,
    gap: 14,
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldGroup: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    backgroundColor: '#FFFFFF',
  },
  formFieldHelp: {
    fontSize: 11,
    color: '#94A3B8',
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
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    cursor: 'pointer',
  },
  stateChipSelected: {
    borderColor: '#0F766E',
    backgroundColor: '#F0FDFA',
  },
  stateChipText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
  },
  stateChipTextSelected: {
    color: '#0F766E',
    fontWeight: '700',
  },
  paymentMethodsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  paymentMethodOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    cursor: 'pointer',
  },
  paymentMethodOptionSelected: {
    borderColor: '#0F766E',
    backgroundColor: '#F0FDFA',
  },
  paymentMethodIcon: {
    fontSize: 18,
    marginBottom: 4,
  },
  paymentMethodName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  taxComputationCard: {
    backgroundColor: '#FAF5FF',
    borderWidth: 1,
    borderColor: '#C4B5FD',
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
    color: '#6D28D9',
  },
  liveBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#7C3AED',
  },
  taxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  taxRowLabel: {
    fontSize: 12,
    color: '#475569',
  },
  taxRowValue: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  taxCompDivider: {
    height: 1,
    backgroundColor: '#DDD6FE',
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
    color: '#0F172A',
  },
  taxTotalSubtitle: {
    fontSize: 10.5,
    color: '#6D28D9',
  },
  taxTotalValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F766E',
  },
  checkoutModalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  cancelBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    cursor: 'pointer',
  },
  cancelBtnText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  confirmPayBtn: {
    backgroundColor: '#0F766E',
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
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
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
    backgroundColor: '#0F766E',
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
    color: '#0F172A',
  },
  invoiceGstin: {
    fontSize: 11,
    color: '#64748B',
  },
  paidBadge: {
    backgroundColor: '#DCFCE7',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  paidBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  invoiceBody: {
    padding: 20,
  },
  invoiceDetailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 20,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
  },
  invoiceCol: {
    minWidth: 130,
  },
  invLabel: {
    fontSize: 10.5,
    color: '#64748B',
  },
  invVal: {
    fontSize: 12,
    color: '#0F172A',
  },
  invValBold: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  invTable: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
  },
  invTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  invTh: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
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
    color: '#0F172A',
  },
  invItemSub: {
    fontSize: 10.5,
    color: '#64748B',
  },
  invTd: {
    fontSize: 12,
    color: '#334155',
  },
  invTdBold: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  invSummaryBox: {
    backgroundColor: '#F8FAFC',
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
    color: '#475569',
  },
  invSumVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  invSumDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
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
    color: '#0F172A',
  },
  invGrandTotalVal: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F766E',
  },
  invoiceFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  printBtn: {
    backgroundColor: '#0F766E',
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
    backgroundColor: '#F1F5F9',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    cursor: 'pointer',
  },
  closeInvBtnText: {
    color: '#475569',
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
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
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
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  devGuideIconText: {
    fontSize: 18,
  },
  devGuideModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  devGuideModalSubtitle: {
    fontSize: 12,
    color: '#64748B',
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
    color: '#0F766E',
    marginBottom: 6,
  },
  guideBlockDesc: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 8,
  },
  sqlCodeBox: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 12,
  },
  sqlCodeText: {
    color: '#38BDF8',
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
    backgroundColor: '#16A34A',
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
    color: '#0F172A',
    fontFamily: Platform.select({ web: 'monospace', default: 'System' }),
  },
  devGuideFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'flex-end',
  },
  closeDevGuideBtn: {
    backgroundColor: '#0F766E',
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
