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

const GST_SLABS = [
  {
    rate: '0%',
    slabName: 'Nil / Exempted',
    cgst: '0%',
    sgst: '0%',
    igst: '0%',
    description: 'Life-saving emergency drugs, blood units, human vaccines',
    hsnExample: 'HSN 3002',
    color: '#64748B',
    bgColor: '#F1F5F9',
  },
  {
    rate: '5%',
    slabName: 'Essential Medicines',
    cgst: '2.5%',
    sgst: '2.5%',
    igst: '5%',
    description: 'Insulin, diagnostic kits, essential oral rehydration salts',
    hsnExample: 'HSN 3004',
    color: '#0284C7',
    bgColor: '#E0F2FE',
  },
  {
    rate: '12%',
    slabName: 'Standard Formulations',
    cgst: '6.0%',
    sgst: '6.0%',
    igst: '12%',
    description: 'Antibiotics, vitamins, cough syrups, medical syringes',
    hsnExample: 'HSN 3004',
    color: '#0F766E',
    bgColor: '#CCFBF1',
  },
  {
    rate: '18%',
    slabName: 'Healthcare Services & SaaS',
    cgst: '9.0%',
    sgst: '9.0%',
    igst: '18%',
    description: 'Disinfectants, SaaS ERP Subscriptions (SAC 998313), Medical Equipment',
    hsnExample: 'SAC 998313 / HSN 3808',
    color: '#7C3AED',
    bgColor: '#EDE9FE',
    isSpecial: true,
  },
  {
    rate: '28%',
    slabName: 'Luxury & Cosmetic',
    cgst: '14.0%',
    sgst: '14.0%',
    igst: '28%',
    description: 'Specialty dermatological cosmetics, high-end nutritional drinks',
    hsnExample: 'HSN 3304',
    color: '#E11D48',
    bgColor: '#FFE4E6',
  },
];

const HSN_SAC_MAPPINGS = [
  {
    code: '3004',
    type: 'HSN',
    description: 'Medicaments consisting of mixed or unmixed products for therapeutic uses',
    gstRate: '12%',
    category: 'Pharmaceutical Formulations',
  },
  {
    code: '3002',
    type: 'HSN',
    description: 'Human blood; animal blood; antisera, vaccines, toxins & cultures',
    gstRate: '0% - 5%',
    category: 'Biologics & Vaccines',
  },
  {
    code: '998313',
    type: 'SAC',
    description: 'Information technology (IT) software application services & SaaS ERP Subscription',
    gstRate: '18%',
    category: 'Cloud SaaS / IT Services',
    highlight: true,
  },
  {
    code: '9018',
    type: 'HSN',
    description: 'Instruments and appliances used in medical, surgical or veterinary sciences',
    gstRate: '12% - 18%',
    category: 'Medical Devices',
  },
  {
    code: '3808',
    type: 'HSN',
    description: 'Disinfectants, sanitizers and surgical antiseptic formulations',
    gstRate: '18%',
    category: 'Hygiene & Disinfectants',
  },
];

export default function TaxGstSettingsScreen({ onNavigate, onShowToast, isMultiBranch = true }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Active Tab: 'config' | 'slabs' | 'hsn' | 'calculator'
  const [activeTab, setActiveTab] = useState('config');

  // GST Registration Form State
  const [gstConfig, setGstConfig] = useState({
    gstin: '27AABCF1234F1Z5',
    legalName: 'Flora Institute Healthcare & Pharmacy Pvt Ltd',
    tradeName: 'PharmaFlow FIT Main Store',
    state: 'Maharashtra (State Code: 27)',
    stateCode: '27',
    registrationType: 'Regular', // 'Regular' or 'Composition'
    filingFrequency: 'Monthly (GSTR-1 & GSTR-3B)',
    taxInclusivePricing: true,
    autoCalculateInterstate: true,
    eInvoicingEnabled: false,
    auto18PercentSubscriptionGst: true,
  });

  // Live Calculator State
  const [calcAmount, setCalcAmount] = useState('1000');
  const [calcRate, setCalcRate] = useState('18');
  const [calcIsInterstate, setCalcIsInterstate] = useState(false);

  // Backend Dev Guide Modal
  const [showDevGuide, setShowDevGuide] = useState(false);

  const handleSaveGstConfig = () => {
    if (onShowToast) {
      onShowToast('✓ Tax & GST settings saved and applied across billing & subscriptions!');
    }
  };

  // Calculator computation
  const baseNum = parseFloat(calcAmount) || 0;
  const rateNum = parseFloat(calcRate) || 0;
  const taxAmount = (baseNum * rateNum) / 100;
  const totalPayable = baseNum + taxAmount;
  const cgstAmount = calcIsInterstate ? 0 : taxAmount / 2;
  const sgstAmount = calcIsInterstate ? 0 : taxAmount / 2;
  const igstAmount = calcIsInterstate ? taxAmount : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, isMobile && styles.contentContainerMobile]}
      showsVerticalScrollIndicator={true}
    >
      {/* Top Banner Header */}
      <View style={styles.headerBanner}>
        <View style={styles.headerTextGroup}>
          <View style={styles.headerTagRow}>
            <Text style={styles.headerTag}>COMPLIANCE & BILLING</Text>
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedBadgeText}>✓ GST READY</Text>
            </View>
          </View>
          <Text style={styles.headerTitle}>Tax / GST Settings</Text>
          <Text style={styles.headerSubtitle}>
            Configure your Pharmacy GSTIN profile, tax rate slabs, HSN/SAC codes, and automatic 18% SaaS subscription billing rules.
          </Text>
        </View>

        <View style={styles.headerActionsGroup}>
          <Pressable
            onPress={() => setShowDevGuide(true)}
            style={styles.devGuideButton}
            accessibilityRole="button"
            accessibilityLabel="Backend & Database Guide"
          >
            <Text style={styles.devGuideButtonIcon}>🔌</Text>
            <Text style={styles.devGuideButtonText}>Backend & DB Guide</Text>
          </Pressable>

          <Pressable
            onPress={() => onNavigate && onNavigate('subscription-plans')}
            style={styles.subscriptionNavButton}
            accessibilityRole="button"
            accessibilityLabel="View Subscription Plans"
          >
            <Text style={styles.subscriptionNavText}>💳 SaaS Subscriptions (18% GST)</Text>
          </Pressable>
        </View>
      </View>

      {/* Tabs Bar */}
      <View style={styles.tabBar}>
        <Pressable
          onPress={() => setActiveTab('config')}
          style={[styles.tabItem, activeTab === 'config' && styles.tabItemActive]}
        >
          <Text style={[styles.tabItemText, activeTab === 'config' && styles.tabItemTextActive]}>
            ⚙️ GST Profile & Invoicing
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('slabs')}
          style={[styles.tabItem, activeTab === 'slabs' && styles.tabItemActive]}
        >
          <Text style={[styles.tabItemText, activeTab === 'slabs' && styles.tabItemTextActive]}>
            📊 GST Rate Slabs (0% - 28%)
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('hsn')}
          style={[styles.tabItem, activeTab === 'hsn' && styles.tabItemActive]}
        >
          <Text style={[styles.tabItemText, activeTab === 'hsn' && styles.tabItemTextActive]}>
            🏷️ HSN & SAC Codes (SAC 998313)
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('calculator')}
          style={[styles.tabItem, activeTab === 'calculator' && styles.tabItemActive]}
        >
          <Text style={[styles.tabItemText, activeTab === 'calculator' && styles.tabItemTextActive]}>
            🧮 Live GST Simulator
          </Text>
        </Pressable>
      </View>

      {/* TAB 1: GST Profile & Invoicing */}
      {activeTab === 'config' && (
        <View style={styles.sectionContainer}>
          {/* Card 1: Business GST Details */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>Pharmacy GST Identification (GSTIN)</Text>
                <Text style={styles.cardSubtitle}>
                  Used on all customer tax invoices, supplier purchase credits, and B2B SaaS subscription invoices.
                </Text>
              </View>
              <View style={styles.statusPillActive}>
                <Text style={styles.statusPillActiveText}>Verified Active</Text>
              </View>
            </View>

            <View style={styles.formGrid}>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>GSTIN Number (15 Digits)</Text>
                <TextInput
                  style={styles.textInput}
                  value={gstConfig.gstin}
                  onChangeText={(v) => setGstConfig({ ...gstConfig, gstin: v.toUpperCase() })}
                  maxLength={15}
                  placeholder="e.g. 27AABCF1234F1Z5"
                />
                <Text style={styles.fieldHint}>First 2 digits represent State Code (27 = Maharashtra)</Text>
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>State / Union Territory</Text>
                <TextInput
                  style={styles.textInput}
                  value={gstConfig.state}
                  onChangeText={(v) => setGstConfig({ ...gstConfig, state: v })}
                  placeholder="e.g. Maharashtra (Code: 27)"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Legal Entity Name (As per GST Certificate)</Text>
                <TextInput
                  style={styles.textInput}
                  value={gstConfig.legalName}
                  onChangeText={(v) => setGstConfig({ ...gstConfig, legalName: v })}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Trade Name / Pharmacy Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={gstConfig.tradeName}
                  onChangeText={(v) => setGstConfig({ ...gstConfig, tradeName: v })}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>GST Registration Scheme</Text>
                <View style={styles.radioGroupRow}>
                  <Pressable
                    onPress={() => setGstConfig({ ...gstConfig, registrationType: 'Regular' })}
                    style={[
                      styles.radioOption,
                      gstConfig.registrationType === 'Regular' && styles.radioOptionSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.radioOptionText,
                        gstConfig.registrationType === 'Regular' && styles.radioOptionTextSelected,
                      ]}
                    >
                      ● Regular Scheme (ITC Allowed)
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setGstConfig({ ...gstConfig, registrationType: 'Composition' })}
                    style={[
                      styles.radioOption,
                      gstConfig.registrationType === 'Composition' && styles.radioOptionSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.radioOptionText,
                        gstConfig.registrationType === 'Composition' && styles.radioOptionTextSelected,
                      ]}
                    >
                      ○ Composition (No ITC)
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Filing Frequency</Text>
                <TextInput
                  style={styles.textInput}
                  value={gstConfig.filingFrequency}
                  onChangeText={(v) => setGstConfig({ ...gstConfig, filingFrequency: v })}
                />
              </View>
            </View>
          </View>

          {/* Card 2: Automatic GST Toggles & Invoicing Rules */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>GST Invoicing & Automation Rules</Text>
                <Text style={styles.cardSubtitle}>
                  Control how tax is computed during Point-of-Sale billing and SaaS subscription checkout.
                </Text>
              </View>
            </View>

            <View style={styles.toggleRulesList}>
              {/* Toggle 1: Subscription 18% GST */}
              <View style={styles.toggleRuleRow}>
                <View style={styles.toggleRuleInfo}>
                  <View style={styles.ruleBadgeRow}>
                    <Text style={styles.ruleTitle}>Auto-Apply 18% GST on SaaS Subscriptions</Text>
                    <View style={styles.mandatoryBadge}>
                      <Text style={styles.mandatoryBadgeText}>GOVERNMENT MANDATED</Text>
                    </View>
                  </View>
                  <Text style={styles.ruleDesc}>
                    Automatically adds 18% GST under SAC Code 998313 (IT & Cloud Application Software Services).
                    Splits into 9% CGST + 9% SGST for intra-state billing, or 18% IGST for inter-state clients.
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    setGstConfig({
                      ...gstConfig,
                      auto18PercentSubscriptionGst: !gstConfig.auto18PercentSubscriptionGst,
                    })
                  }
                  style={[
                    styles.toggleSwitch,
                    gstConfig.auto18PercentSubscriptionGst ? styles.toggleOn : styles.toggleOff,
                  ]}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: gstConfig.auto18PercentSubscriptionGst }}
                >
                  <View
                    style={[
                      styles.toggleKnob,
                      gstConfig.auto18PercentSubscriptionGst ? styles.toggleKnobOn : styles.toggleKnobOff,
                    ]}
                  />
                </Pressable>
              </View>

              {/* Toggle 2: Tax Inclusive Retail Pricing */}
              <View style={styles.toggleRuleRow}>
                <View style={styles.toggleRuleInfo}>
                  <Text style={styles.ruleTitle}>MRP Tax-Inclusive Invoicing (Pharma Retail standard)</Text>
                  <Text style={styles.ruleDesc}>
                    When enabled, medicine MRP prices are treated as tax-inclusive. The bill calculates backward:
                    Base = MRP / (1 + GST_Rate), extracting CGST and SGST on retail receipts.
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    setGstConfig({
                      ...gstConfig,
                      taxInclusivePricing: !gstConfig.taxInclusivePricing,
                    })
                  }
                  style={[
                    styles.toggleSwitch,
                    gstConfig.taxInclusivePricing ? styles.toggleOn : styles.toggleOff,
                  ]}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: gstConfig.taxInclusivePricing }}
                >
                  <View
                    style={[
                      styles.toggleKnob,
                      gstConfig.taxInclusivePricing ? styles.toggleKnobOn : styles.toggleKnobOff,
                    ]}
                  />
                </Pressable>
              </View>

              {/* Toggle 3: Auto Inter-state vs Intra-state */}
              <View style={styles.toggleRuleRow}>
                <View style={styles.toggleRuleInfo}>
                  <Text style={styles.ruleTitle}>Automatic Inter-State (IGST) vs Intra-State (CGST + SGST) Split</Text>
                  <Text style={styles.ruleDesc}>
                    Automatically compares customer or subscriber state with pharmacy store state (Code 27). If states differ, IGST is applied; otherwise 50-50 CGST + SGST is applied.
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    setGstConfig({
                      ...gstConfig,
                      autoCalculateInterstate: !gstConfig.autoCalculateInterstate,
                    })
                  }
                  style={[
                    styles.toggleSwitch,
                    gstConfig.autoCalculateInterstate ? styles.toggleOn : styles.toggleOff,
                  ]}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: gstConfig.autoCalculateInterstate }}
                >
                  <View
                    style={[
                      styles.toggleKnob,
                      gstConfig.autoCalculateInterstate ? styles.toggleKnobOn : styles.toggleKnobOff,
                    ]}
                  />
                </Pressable>
              </View>

              {/* Toggle 4: e-Invoicing Portal API */}
              <View style={styles.toggleRuleRow}>
                <View style={styles.toggleRuleInfo}>
                  <Text style={styles.ruleTitle}>NIC e-Invoicing & IRN Generation (B2B Sales)</Text>
                  <Text style={styles.ruleDesc}>
                    Generate IRN (Invoice Reference Number) and signed QR code via GST Suvidha Provider (GSP) for B2B transactions over threshold.
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    setGstConfig({
                      ...gstConfig,
                      eInvoicingEnabled: !gstConfig.eInvoicingEnabled,
                    })
                  }
                  style={[
                    styles.toggleSwitch,
                    gstConfig.eInvoicingEnabled ? styles.toggleOn : styles.toggleOff,
                  ]}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: gstConfig.eInvoicingEnabled }}
                >
                  <View
                    style={[
                      styles.toggleKnob,
                      gstConfig.eInvoicingEnabled ? styles.toggleKnobOn : styles.toggleKnobOff,
                    ]}
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.cardFooter}>
              <Pressable
                onPress={handleSaveGstConfig}
                style={styles.savePrimaryButton}
                accessibilityRole="button"
              >
                <Text style={styles.savePrimaryButtonText}>💾 Save GST Settings</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* TAB 2: GST Rate Slabs */}
      {activeTab === 'slabs' && (
        <View style={styles.sectionContainer}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>Standard GST Rate Slabs for Pharmacy & SaaS</Text>
                <Text style={styles.cardSubtitle}>
                  Current tax rates mapped to pharmaceutical items, medical supplies, and cloud SaaS ERP plans.
                </Text>
              </View>
            </View>

            <View style={styles.slabList}>
              {GST_SLABS.map((slab) => (
                <View
                  key={slab.rate}
                  style={[
                    styles.slabCard,
                    slab.isSpecial && styles.slabCardSpecial,
                  ]}
                >
                  <View style={styles.slabRateCol}>
                    <View style={[styles.rateBadge, { backgroundColor: slab.bgColor }]}>
                      <Text style={[styles.rateBadgeText, { color: slab.color }]}>{slab.rate}</Text>
                    </View>
                    <Text style={styles.slabNameText}>{slab.slabName}</Text>
                  </View>

                  <View style={styles.slabDescCol}>
                    <Text style={styles.slabDescText}>{slab.description}</Text>
                    <Text style={styles.slabHsnTag}>Reference: {slab.hsnExample}</Text>
                  </View>

                  <View style={styles.slabBreakdownCol}>
                    <View style={styles.slabTaxPill}>
                      <Text style={styles.slabTaxPillLabel}>Intra-State:</Text>
                      <Text style={styles.slabTaxPillVal}>
                        CGST {slab.cgst} + SGST {slab.sgst}
                      </Text>
                    </View>
                    <View style={styles.slabTaxPill}>
                      <Text style={styles.slabTaxPillLabel}>Inter-State:</Text>
                      <Text style={styles.slabTaxPillVal}>IGST {slab.igst}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* TAB 3: HSN & SAC Codes */}
      {activeTab === 'hsn' && (
        <View style={styles.sectionContainer}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>HSN & SAC Code Directory</Text>
                <Text style={styles.cardSubtitle}>
                  Harmonized System of Nomenclature (HSN) for goods & Services Accounting Code (SAC) for cloud SaaS subscriptions.
                </Text>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={styles.tableWrapper}>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.thCell, { width: 100 }]}>CODE</Text>
                  <Text style={[styles.thCell, { width: 80, textAlign: 'center' }]}>TYPE</Text>
                  <Text style={[styles.thCell, { width: 180 }]}>CATEGORY</Text>
                  <Text style={[styles.thCell, { width: 260 }]}>DESCRIPTION</Text>
                  <Text style={[styles.thCell, { width: 120, textAlign: 'center' }]}>APPLICABLE GST</Text>
                  <Text style={[styles.thCell, { width: 100, textAlign: 'center' }]}>STATUS</Text>
                </View>

                {HSN_SAC_MAPPINGS.map((item, idx) => (
                  <View
                    key={item.code}
                    style={[
                      styles.tableDataRow,
                      idx % 2 === 1 && styles.tableDataRowAlt,
                      item.highlight && styles.tableDataRowHighlight,
                    ]}
                  >
                    <Text style={[styles.tdCell, styles.codeCell, { width: 100 }]}>
                      {item.code}
                    </Text>
                    <View style={[{ width: 80, alignItems: 'center' }]}>
                      <View style={[styles.typeBadge, item.type === 'SAC' ? styles.typeSac : styles.typeHsn]}>
                        <Text style={styles.typeBadgeText}>{item.type}</Text>
                      </View>
                    </View>
                    <Text style={[styles.tdCell, { width: 180, fontWeight: '600' }]}>
                      {item.category}
                    </Text>
                    <Text style={[styles.tdCell, { width: 260 }]} numberOfLines={2}>
                      {item.description}
                    </Text>
                    <Text style={[styles.tdCell, styles.rateCell, { width: 120, textAlign: 'center' }]}>
                      {item.gstRate}
                    </Text>
                    <View style={[{ width: 100, alignItems: 'center' }]}>
                      <Text style={styles.activeTag}>Active</Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {/* TAB 4: Live GST Calculator */}
      {activeTab === 'calculator' && (
        <View style={styles.sectionContainer}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>Live GST Calculation Simulator</Text>
                <Text style={styles.cardSubtitle}>
                  Test how GST amounts are computed for medicines or software subscriptions in real-time.
                </Text>
              </View>
            </View>

            <View style={[styles.calcContainer, isMobile && styles.calcContainerMobile]}>
              {/* Inputs Column */}
              <View style={styles.calcInputsCol}>
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>Base Amount (₹)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={calcAmount}
                    onChangeText={setCalcAmount}
                    keyboardType="numeric"
                    placeholder="Enter base amount"
                  />
                </View>

                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>Select GST Slab Rate (%)</Text>
                  <View style={styles.slabBtnRow}>
                    {['0', '5', '12', '18', '28'].map((r) => (
                      <Pressable
                        key={r}
                        onPress={() => setCalcRate(r)}
                        style={[
                          styles.slabSelectBtn,
                          calcRate === r && styles.slabSelectBtnActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.slabSelectBtnText,
                            calcRate === r && styles.slabSelectBtnTextActive,
                          ]}
                        >
                          {r}%
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>Transaction Territory</Text>
                  <View style={styles.radioGroupRow}>
                    <Pressable
                      onPress={() => setCalcIsInterstate(false)}
                      style={[
                        styles.radioOption,
                        !calcIsInterstate && styles.radioOptionSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.radioOptionText,
                          !calcIsInterstate && styles.radioOptionTextSelected,
                        ]}
                      >
                        Intra-State (CGST + SGST)
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setCalcIsInterstate(true)}
                      style={[
                        styles.radioOption,
                        calcIsInterstate && styles.radioOptionSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.radioOptionText,
                          calcIsInterstate && styles.radioOptionTextSelected,
                        ]}
                      >
                        Inter-State (IGST)
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* Output Result Card */}
              <View style={styles.calcResultCol}>
                <View style={styles.resultBox}>
                  <Text style={styles.resultBoxTitle}>Tax Computation Breakdown</Text>

                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Taxable Base Amount:</Text>
                    <Text style={styles.resultVal}>₹{baseNum.toFixed(2)}</Text>
                  </View>

                  {!calcIsInterstate ? (
                    <>
                      <View style={styles.resultRow}>
                        <Text style={styles.resultLabel}>CGST ({(rateNum / 2).toFixed(1)}%):</Text>
                        <Text style={styles.resultVal}>₹{cgstAmount.toFixed(2)}</Text>
                      </View>
                      <View style={styles.resultRow}>
                        <Text style={styles.resultLabel}>SGST ({(rateNum / 2).toFixed(1)}%):</Text>
                        <Text style={styles.resultVal}>₹{sgstAmount.toFixed(2)}</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.resultRow}>
                      <Text style={styles.resultLabel}>IGST ({rateNum}%):</Text>
                      <Text style={styles.resultVal}>₹{igstAmount.toFixed(2)}</Text>
                    </View>
                  )}

                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Total Tax Calculated:</Text>
                    <Text style={[styles.resultVal, { color: '#0F766E', fontWeight: '700' }]}>
                      ₹{taxAmount.toFixed(2)}
                    </Text>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.resultTotalRow}>
                    <Text style={styles.resultTotalLabel}>Total Invoice Amount:</Text>
                    <Text style={styles.resultTotalVal}>₹{totalPayable.toFixed(2)}</Text>
                  </View>

                  <View style={styles.calcFormulaNote}>
                    <Text style={styles.formulaNoteText}>
                      Formula: Total = Base Amount + [Base Amount × ({rateNum} / 100)]
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* BACKEND & DATABASE DEVELOPER GUIDE MODAL */}
      <Modal
        visible={showDevGuide}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDevGuide(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isMobile && styles.modalCardMobile]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <View style={styles.modalIconBadge}>
                  <Text style={styles.modalIconText}>🔌</Text>
                </View>
                <View>
                  <Text style={styles.modalTitle}>Backend & Database Integration Guide</Text>
                  <Text style={styles.modalSubtitle}>
                    Complete technical specification for the backend engineering team
                  </Text>
                </View>
              </View>
              <Pressable onPress={() => setShowDevGuide(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            {/* Modal Body with Code Specs */}
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={true}>
              {/* 1. Database Schema */}
              <View style={styles.guideSection}>
                <Text style={styles.guideSectionTitle}>1. PostgreSQL Database Tables</Text>
                <Text style={styles.guideSectionDesc}>
                  Add the following tables in PostgreSQL to persist pharmacy GST profile and tax rate mappings:
                </Text>
                <View style={styles.codeBlock}>
                  <Text style={styles.codeText}>
{`-- 1. GST Settings per Organization/Tenant
CREATE TABLE IF NOT EXISTS gst_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  gstin VARCHAR(15) NOT NULL,
  legal_name TEXT NOT NULL,
  trade_name TEXT NOT NULL,
  state_code VARCHAR(2) NOT NULL DEFAULT '27',
  registration_type VARCHAR(20) NOT NULL DEFAULT 'Regular', -- 'Regular' | 'Composition'
  filing_frequency VARCHAR(20) NOT NULL DEFAULT 'Monthly',
  tax_inclusive_pricing BOOLEAN DEFAULT true,
  auto_18_percent_subscription BOOLEAN DEFAULT true,
  e_invoice_enabled BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. HSN and SAC Tax Rates Directory
CREATE TABLE IF NOT EXISTS hsn_sac_codes (
  code VARCHAR(10) PRIMARY KEY,
  type VARCHAR(3) NOT NULL, -- 'HSN' or 'SAC'
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  gst_rate NUMERIC(5,2) NOT NULL, -- 0.00, 5.00, 12.00, 18.00, 28.00
  cgst_rate NUMERIC(5,2) GENERATED ALWAYS AS (gst_rate / 2) STORED,
  sgst_rate NUMERIC(5,2) GENERATED ALWAYS AS (gst_rate / 2) STORED,
  igst_rate NUMERIC(5,2) GENERATED ALWAYS AS (gst_rate) STORED
);`}
                  </Text>
                </View>
              </View>

              {/* 2. REST API Endpoints */}
              <View style={styles.guideSection}>
                <Text style={styles.guideSectionTitle}>2. REST API Endpoints to Implement</Text>
                
                <View style={styles.endpointCard}>
                  <View style={styles.endpointHeader}>
                    <View style={styles.methodGet}><Text style={styles.methodText}>GET</Text></View>
                    <Text style={styles.endpointRoute}>/api/settings/tax</Text>
                  </View>
                  <Text style={styles.endpointDesc}>
                    Fetches current pharmacy GSTIN profile, active tax slabs, and calculation rules.
                  </Text>
                </View>

                <View style={styles.endpointCard}>
                  <View style={styles.endpointHeader}>
                    <View style={styles.methodPut}><Text style={styles.methodText}>PUT</Text></View>
                    <Text style={styles.endpointRoute}>/api/settings/tax</Text>
                  </View>
                  <Text style={styles.endpointDesc}>
                    Updates the pharmacy GSTIN profile, registration scheme, and toggle settings.
                  </Text>
                  <View style={styles.codeBlockSmall}>
                    <Text style={styles.codeText}>
{`// Expected Request Body
{
  "gstin": "27AABCF1234F1Z5",
  "legalName": "Flora Institute Healthcare Pvt Ltd",
  "tradeName": "PharmaFlow FIT Main Store",
  "stateCode": "27",
  "registrationType": "Regular",
  "taxInclusivePricing": true,
  "auto18PercentSubscriptionGst": true
}`}
                    </Text>
                  </View>
                </View>

                <View style={styles.endpointCard}>
                  <View style={styles.endpointHeader}>
                    <View style={styles.methodPost}><Text style={styles.methodText}>POST</Text></View>
                    <Text style={styles.endpointRoute}>/api/subscriptions/checkout</Text>
                  </View>
                  <Text style={styles.endpointDesc}>
                    Creates a new subscription with server-enforced 18% GST calculation (SAC 998313).
                  </Text>
                </View>
              </View>

              {/* 3. Tax Calculation Logic in Backend */}
              <View style={styles.guideSection}>
                <Text style={styles.guideSectionTitle}>3. Backend 18% GST Calculation Formula</Text>
                <View style={styles.codeBlock}>
                  <Text style={styles.codeText}>
{`// Express API Controller (backend/server.js)
const GST_RATE = 18.0; // 18% GST for SaaS ERP Subscription
const basePrice = req.body.planAmount; // e.g. 2499
const buyerStateCode = req.body.stateCode || '27';
const pharmacyStateCode = '27'; // Maharashtra

const isIntraState = buyerStateCode === pharmacyStateCode;
const totalGstAmount = (basePrice * GST_RATE) / 100; // 449.82
const cgstAmount = isIntraState ? (totalGstAmount / 2) : 0; // 224.91
const sgstAmount = isIntraState ? (totalGstAmount / 2) : 0; // 224.91
const igstAmount = isIntraState ? 0 : totalGstAmount; // 449.82
const totalPayable = basePrice + totalGstAmount; // 2948.82`}
                  </Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                onPress={() => setShowDevGuide(false)}
                style={styles.modalDoneBtn}
              >
                <Text style={styles.modalDoneBtnText}>Got it, Close Guide</Text>
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
    paddingBottom: 48,
  },
  contentContainerMobile: {
    padding: 14,
  },
  headerBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 24,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
  },
  headerTextGroup: {
    flex: 1,
    minWidth: 280,
  },
  headerTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  headerTag: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F766E',
    letterSpacing: 0.8,
  },
  verifiedBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verifiedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 19,
  },
  headerActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  devGuideButton: {
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
  devGuideButtonIcon: {
    fontSize: 14,
  },
  devGuideButtonText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  subscriptionNavButton: {
    backgroundColor: '#0F766E',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    cursor: 'pointer',
  },
  subscriptionNavText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 6,
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 6,
  },
  tabItem: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    cursor: 'pointer',
  },
  tabItemActive: {
    backgroundColor: '#0F766E',
  },
  tabItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabItemTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  sectionContainer: {
    gap: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 22,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
      },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 2,
  },
  statusPillActive: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillActiveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  formField: {
    flex: 1,
    minWidth: 280,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    fontSize: 13.5,
    color: '#0F172A',
  },
  fieldHint: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },
  radioGroupRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  radioOption: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    cursor: 'pointer',
  },
  radioOptionSelected: {
    borderColor: '#0F766E',
    backgroundColor: '#F0FDFA',
  },
  radioOptionText: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '500',
  },
  radioOptionTextSelected: {
    color: '#0F766E',
    fontWeight: '700',
  },
  toggleRulesList: {
    gap: 16,
  },
  toggleRuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 16,
  },
  toggleRuleInfo: {
    flex: 1,
  },
  ruleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  ruleTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  mandatoryBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mandatoryBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#B91C1C',
  },
  ruleDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: 'center',
    cursor: 'pointer',
  },
  toggleOn: {
    backgroundColor: '#0F766E',
  },
  toggleOff: {
    backgroundColor: '#CBD5E1',
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  toggleKnobOn: {
    alignSelf: 'flex-end',
  },
  toggleKnobOff: {
    alignSelf: 'flex-start',
  },
  cardFooter: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  savePrimaryButton: {
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 8,
    cursor: 'pointer',
  },
  savePrimaryButtonText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  slabList: {
    gap: 12,
  },
  slabCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FAFAFA',
    flexWrap: 'wrap',
    gap: 14,
  },
  slabCardSpecial: {
    borderColor: '#C4B5FD',
    backgroundColor: '#FAF5FF',
  },
  slabRateCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 160,
  },
  rateBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  rateBadgeText: {
    fontSize: 15,
    fontWeight: '800',
  },
  slabNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  slabDescCol: {
    flex: 2,
    minWidth: 220,
  },
  slabDescText: {
    fontSize: 12.5,
    color: '#475569',
  },
  slabHsnTag: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 3,
    fontFamily: Platform.select({ web: 'monospace', default: 'System' }),
  },
  slabBreakdownCol: {
    minWidth: 180,
    gap: 4,
  },
  slabTaxPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  slabTaxPillLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  slabTaxPillVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  tableWrapper: {
    minWidth: 800,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  thCell: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  tableDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  tableDataRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  tableDataRowHighlight: {
    backgroundColor: '#F5F3FF',
  },
  tdCell: {
    fontSize: 12.5,
    color: '#334155',
  },
  codeCell: {
    fontFamily: Platform.select({ web: 'monospace', default: 'System' }),
    fontWeight: '700',
    color: '#0F766E',
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeHsn: {
    backgroundColor: '#E0F2FE',
  },
  typeSac: {
    backgroundColor: '#EDE9FE',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F172A',
  },
  rateCell: {
    fontWeight: '700',
    color: '#0F172A',
  },
  activeTag: {
    fontSize: 11,
    fontWeight: '600',
    color: '#15803D',
  },
  calcContainer: {
    flexDirection: 'row',
    gap: 24,
    flexWrap: 'wrap',
  },
  calcContainerMobile: {
    flexDirection: 'column',
  },
  calcInputsCol: {
    flex: 1,
    minWidth: 280,
    gap: 16,
  },
  calcResultCol: {
    flex: 1,
    minWidth: 280,
  },
  slabBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  slabSelectBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    cursor: 'pointer',
  },
  slabSelectBtnActive: {
    borderColor: '#0F766E',
    backgroundColor: '#0F766E',
  },
  slabSelectBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  slabSelectBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  resultBox: {
    backgroundColor: '#F0FDFA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#99F6E4',
    padding: 20,
    gap: 12,
  },
  resultBoxTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F766E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultLabel: {
    fontSize: 13,
    color: '#475569',
  },
  resultVal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  divider: {
    height: 1,
    backgroundColor: '#99F6E4',
    marginVertical: 4,
  },
  resultTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultTotalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  resultTotalVal: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F766E',
  },
  calcFormulaNote: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#CCFBF1',
  },
  formulaNoteText: {
    fontSize: 11,
    color: '#0F766E',
    fontStyle: 'italic',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 780,
    maxHeight: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  modalCardMobile: {
    maxHeight: '94%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalIconText: {
    fontSize: 18,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  modalCloseBtn: {
    padding: 6,
    cursor: 'pointer',
  },
  modalCloseText: {
    fontSize: 18,
    color: '#64748B',
    fontWeight: '700',
  },
  modalBody: {
    flex: 1,
    padding: 20,
  },
  guideSection: {
    marginBottom: 24,
  },
  guideSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F766E',
    marginBottom: 6,
  },
  guideSectionDesc: {
    fontSize: 12.5,
    color: '#475569',
    marginBottom: 10,
    lineHeight: 18,
  },
  codeBlock: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 14,
    overflow: 'hidden',
  },
  codeBlockSmall: {
    backgroundColor: '#0F172A',
    borderRadius: 6,
    padding: 10,
    marginTop: 8,
  },
  codeText: {
    color: '#38BDF8',
    fontSize: 11.5,
    fontFamily: Platform.select({ web: 'Consolas, Monaco, monospace', default: 'System' }),
    lineHeight: 17,
  },
  endpointCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  endpointHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  methodGet: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  methodPut: {
    backgroundColor: '#D97706',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  methodPost: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  methodText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  endpointRoute: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    fontFamily: Platform.select({ web: 'monospace', default: 'System' }),
  },
  endpointDesc: {
    fontSize: 12,
    color: '#475569',
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'flex-end',
  },
  modalDoneBtn: {
    backgroundColor: '#0F766E',
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 8,
    cursor: 'pointer',
  },
  modalDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
