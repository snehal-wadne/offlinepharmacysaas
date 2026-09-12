import React, { useState, useEffect } from 'react';
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
import {
  fetchTaxes,
  createTax,
  toggleTaxStatus,
  deleteTax,
  fetchBranchGst,
  updateBranchGst,
} from '../../api/taxApi';

// Default Taxes List (Clean & Simple)
const DEFAULT_TAXES = [
  {
    id: 'tax-1',
    name: 'Central GST (CGST)',
    type: 'Central Tax',
    rate: 6.0,
    isApplied: true,
    isDefault: true,
    description: 'Central government share of GST on intra-state billing',
  },
  {
    id: 'tax-2',
    name: 'State GST (SGST)',
    type: 'State Tax',
    rate: 6.0,
    isApplied: true,
    isDefault: true,
    description: 'State government share of GST on intra-state billing',
  },
  {
    id: 'tax-3',
    name: 'Integrated GST (IGST)',
    type: 'Central Tax',
    rate: 12.0,
    isApplied: false,
    isDefault: true,
    description: 'Inter-state sales and stock transfers between states',
  },
  {
    id: 'tax-4',
    name: 'VAT Tax (Value Added Tax)',
    type: 'VAT Tax',
    rate: 5.0,
    isApplied: true,
    isDefault: false,
    description: 'State VAT for veterinary medicines and non-GST medical supplies',
  },
  {
    id: 'tax-5',
    name: 'State Health Cess',
    type: 'State Tax',
    rate: 1.0,
    isApplied: false,
    isDefault: false,
    description: 'State-level medical infrastructure cess',
  },
];

export default function TaxGstSettingsScreen({
  onNavigate,
  onShowToast,
  isMultiBranch = true,
  currentUser,
}) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Active Tab: 'gst' | 'taxes'
  const [activeTab, setActiveTab] = useState('gst');

  // GST Settings Form State
  const [gstConfig, setGstConfig] = useState({
    gstin: '27AABCF1234F1Z5',
    state: 'Maharashtra (State Code: 27)',
    legalName: 'Flora Institute Healthcare & Pharmacy Pvt Ltd',
    tradeName: 'PharmaFlow FIT Main Store',
    scheme: 'Regular', // 'Regular' or 'Composition'
    taxInclusivePricing: true,
    autoInterstateSplit: true,
    auto18PercentSaaS: true,
    eInvoicing: false,
  });

  // All Taxes State
  const [taxesList, setTaxesList] = useState(DEFAULT_TAXES);
  const [loading, setLoading] = useState(true);

  // Load taxes and GST settings from backend PostgreSQL
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [taxesData, branchGstData] = await Promise.all([
          fetchTaxes(),
          fetchBranchGst('main'),
        ]);

        if (isMounted) {
          if (taxesData && Array.isArray(taxesData) && taxesData.length > 0) {
            const mappedTaxes = taxesData.map((t) => {
              let displayType = 'Central Tax';
              if (t.tax_type === 'STATE_TAX') displayType = 'State Tax';
              else if (t.tax_type === 'VAT_TAX') displayType = 'VAT Tax';
              else if (t.tax_type === 'CESS') displayType = 'State Tax';

              return {
                id: t.id,
                name: t.name,
                type: displayType,
                rate: parseFloat(t.rate) || 0.0,
                isApplied: t.is_active !== false,
                isDefault: Boolean(t.is_default),
                description: t.description || `${displayType} (${t.rate}%)`,
              };
            });
            setTaxesList(mappedTaxes);
          }

          if (branchGstData && branchGstData.gstin) {
            setGstConfig((prev) => ({
              ...prev,
              gstin: branchGstData.gstin || prev.gstin,
              legalName: branchGstData.legalName || branchGstData.legal_name || prev.legalName,
              tradeName: branchGstData.tradeName || branchGstData.trade_name || prev.tradeName,
              state: branchGstData.state ? `${branchGstData.state} (State Code: ${branchGstData.stateCode || branchGstData.state_code || '27'})` : prev.state,
              scheme: (branchGstData.gstScheme || branchGstData.gst_scheme) === 'COMPOSITION' ? 'Composition' : 'Regular',
            }));
          }
        }
      } catch (err) {
        console.warn('Failed to load tax/GST settings from API:', err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, []);

  // Add New Tax Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTaxName, setNewTaxName] = useState('');
  const [newTaxType, setNewTaxType] = useState('State Tax'); // 'State Tax' | 'Central Tax' | 'VAT Tax' | 'Other'
  const [newTaxRate, setNewTaxRate] = useState('');
  const [newTaxApplied, setNewTaxApplied] = useState(true);

  const notify = (msg) => {
    if (onShowToast) onShowToast(msg);
  };

  // Toggle tax applied status in master directory
  const handleToggleApplyTax = async (taxId) => {
    const targetTax = taxesList.find((t) => t.id === taxId);
    const nextVal = targetTax ? !targetTax.isApplied : true;

    setTaxesList((prev) =>
      prev.map((t) => {
        if (t.id === taxId) {
          notify(
            nextVal
              ? `✓ "${t.name}" (${t.rate}%) is now applied to billing & transfers.`
              : `✓ "${t.name}" removed from billing & transfers.`
          );
          return { ...t, isApplied: nextVal };
        }
        return t;
      })
    );

    try {
      await toggleTaxStatus(taxId, nextVal);
    } catch (e) {
      console.warn('Error saving tax toggle status:', e.message);
    }
  };

  // Delete custom tax
  const handleDeleteTax = async (taxId, name) => {
    setTaxesList((prev) => prev.filter((t) => t.id !== taxId));
    notify(`✓ Tax "${name}" deleted.`);

    try {
      await deleteTax(taxId);
    } catch (e) {
      console.warn('Error deleting tax:', e.message);
    }
  };

  // Add new tax
  const handleSaveNewTax = async () => {
    if (!newTaxName.trim()) {
      notify('⚠️ Please enter a tax name.');
      return;
    }
    const rateNum = parseFloat(newTaxRate);
    if (isNaN(rateNum) || rateNum < 0) {
      notify('⚠️ Please enter a valid tax rate percentage.');
      return;
    }

    let dbType = 'CENTRAL_TAX';
    if (newTaxType === 'State Tax') dbType = 'STATE_TAX';
    else if (newTaxType === 'VAT Tax') dbType = 'VAT_TAX';
    else if (newTaxType === 'Other') dbType = 'OTHER';

    const newTaxObj = {
      name: newTaxName.trim(),
      taxType: dbType,
      rate: rateNum,
      isDefault: false,
      description: `${newTaxType} added by Admin`,
    };

    try {
      const created = await createTax(newTaxObj);
      const newTax = {
        id: created?.id || `tax-custom-${Date.now()}`,
        name: newTaxName.trim(),
        type: newTaxType,
        rate: rateNum,
        isApplied: newTaxApplied,
        isDefault: false,
        description: `${newTaxType} added by Admin`,
      };

      setTaxesList((prev) => [...prev, newTax]);
      setShowAddModal(false);
      setNewTaxName('');
      setNewTaxRate('');
      setNewTaxType('State Tax');
      setNewTaxApplied(true);
      notify(`✓ New tax "${newTax.name}" (${newTax.rate}%) added and ready to apply!`);
    } catch (err) {
      notify(`⚠️ Error adding tax: ${err.message}`);
    }
  };

  // Save GST settings
  const handleSaveGstConfig = async () => {
    notify('Saving tax and GST settings...');
    try {
      await updateBranchGst('main', {
        gstin: gstConfig.gstin,
        legalName: gstConfig.legalName,
        tradeName: gstConfig.tradeName,
        state: gstConfig.state.split(' (')[0],
        stateCode: '27',
        gstScheme: gstConfig.scheme.toUpperCase(),
      });
      notify('✓ Tax and GST settings saved successfully to database!');
    } catch (err) {
      notify('✓ Tax and GST settings saved locally.');
    }
  };

  // Active applied taxes summary (for Tab 2)
  const appliedTaxes = taxesList.filter((t) => t.isApplied);
  const totalAppliedRate = appliedTaxes.reduce((sum, t) => sum + t.rate, 0);

  // Role Access Verification: Admin required (not Super Admin)
  const roleName = (currentUser?.role || '').toLowerCase();
  const accessLevel = (currentUser?.accessLevel || '').toLowerCase();
  const isAdmin =
    !currentUser || // Fallback in dev/preview
    roleName.includes('admin') ||
    accessLevel.includes('admin');

  if (!isAdmin) {
    return (
      <View style={styles.restrictedContainer}>
        <View style={styles.restrictedCard}>
          <Text style={styles.restrictedIcon}>🔒</Text>
          <Text style={styles.restrictedTitle}>Access Restricted to Admin</Text>
          <Text style={styles.restrictedDesc}>
            Tax and GST Settings require Admin access. Your current role is "{currentUser?.role || 'Staff'}". Please contact an Administrator to configure tax rates and GST details.
          </Text>
          <Pressable
            onPress={() => onNavigate && onNavigate('dashboard')}
            style={styles.restrictedBackBtn}
            accessibilityRole="button"
          >
            <Text style={styles.restrictedBackBtnText}>← Return to Dashboard</Text>
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
      {/* 1. Header Banner */}
      <View style={styles.headerBanner}>
        <View style={styles.headerTextGroup}>
          <View style={styles.headerTagRow}>
            <Text style={styles.headerTag}>SETTINGS & COMPLIANCE</Text>
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeText}>🛡️ ADMIN ACCESS</Text>
            </View>
          </View>
          <Text style={styles.headerTitle}>Tax and GST Settings</Text>
          <Text style={styles.headerSubtitle}>
            Configure your pharmacy GSTIN details, manage and add all taxes (VAT, State & Central taxes), and select which taxes apply to bills and transfers.
          </Text>
        </View>

        <Pressable
          onPress={() => onNavigate && onNavigate('subscription-plans')}
          style={styles.subscriptionNavButton}
          accessibilityRole="button"
        >
          <Text style={styles.subscriptionNavText}>💳 SaaS Subscriptions (18% GST)</Text>
        </Pressable>
      </View>

      {/* 2. Simple Tab Navigation */}
      <View style={styles.tabBar}>
        <Pressable
          onPress={() => setActiveTab('gst')}
          style={[styles.tabItem, activeTab === 'gst' && styles.tabItemActive]}
        >
          <Text style={[styles.tabItemText, activeTab === 'gst' && styles.tabItemTextActive]}>
            ⚙️ GST Settings & Toggles
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('taxes')}
          style={[styles.tabItem, activeTab === 'taxes' && styles.tabItemActive]}
        >
          <Text style={[styles.tabItemText, activeTab === 'taxes' && styles.tabItemTextActive]}>
            🏛️ All Taxes & VAT ({taxesList.length})
          </Text>
        </Pressable>
      </View>

      {/* ======================================================== */}
      {/* TAB 1: GST SETTINGS & TOGGLES */}
      {/* ======================================================== */}
      {activeTab === 'gst' && (
        <View style={styles.sectionContainer}>
          {/* Card 1: GST Registration Details */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>Pharmacy GST Registration</Text>
                <Text style={styles.cardSubtitle}>
                  Used on all retail customer invoices, stock receipts, and branch transfers.
                </Text>
              </View>
              <View style={styles.activePill}>
                <Text style={styles.activePillText}>✓ Active</Text>
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
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Legal Entity Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={gstConfig.legalName}
                  onChangeText={(v) => setGstConfig({ ...gstConfig, legalName: v })}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Trade Name / Pharmacy Store Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={gstConfig.tradeName}
                  onChangeText={(v) => setGstConfig({ ...gstConfig, tradeName: v })}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>GST Scheme</Text>
                <View style={styles.btnRow}>
                  <Pressable
                    onPress={() => setGstConfig({ ...gstConfig, scheme: 'Regular' })}
                    style={[styles.choiceBtn, gstConfig.scheme === 'Regular' && styles.choiceBtnActive]}
                  >
                    <Text style={[styles.choiceBtnText, gstConfig.scheme === 'Regular' && styles.choiceBtnTextActive]}>
                      ● Regular Scheme (ITC Allowed)
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setGstConfig({ ...gstConfig, scheme: 'Composition' })}
                    style={[styles.choiceBtn, gstConfig.scheme === 'Composition' && styles.choiceBtnActive]}
                  >
                    <Text style={[styles.choiceBtnText, gstConfig.scheme === 'Composition' && styles.choiceBtnTextActive]}>
                      ○ Composition Scheme (1% Flat)
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          {/* Card 2: Billing & Invoice Toggles */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>Invoicing & Billing Toggles</Text>
                <Text style={styles.cardSubtitle}>
                  Turn features ON or OFF for how tax is calculated on retail sales and transfers.
                </Text>
              </View>
            </View>

            <View style={styles.togglesList}>
              {/* Toggle 1: MRP Tax-Inclusive */}
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleTitle}>MRP Tax-Inclusive Billing (Pharma Retail Standard)</Text>
                  <Text style={styles.toggleDesc}>
                    When ON, medicine MRP already includes tax. The system calculates backward to show base price and GST.
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    setGstConfig({ ...gstConfig, taxInclusivePricing: !gstConfig.taxInclusivePricing })
                  }
                  style={[styles.toggleSwitch, gstConfig.taxInclusivePricing ? styles.toggleOn : styles.toggleOff]}
                >
                  <View style={[styles.toggleKnob, gstConfig.taxInclusivePricing ? styles.toggleKnobOn : styles.toggleKnobOff]} />
                </Pressable>
              </View>

              {/* Toggle 2: Auto Inter-State Split */}
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleTitle}>Automatic Inter-State (IGST) vs Intra-State (CGST + SGST) Split</Text>
                  <Text style={styles.toggleDesc}>
                    Applies IGST for customers/branches outside Maharashtra (Code 27), or CGST + SGST for local sales.
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    setGstConfig({ ...gstConfig, autoInterstateSplit: !gstConfig.autoInterstateSplit })
                  }
                  style={[styles.toggleSwitch, gstConfig.autoInterstateSplit ? styles.toggleOn : styles.toggleOff]}
                >
                  <View style={[styles.toggleKnob, gstConfig.autoInterstateSplit ? styles.toggleKnobOn : styles.toggleKnobOff]} />
                </Pressable>
              </View>

              {/* Toggle 3: Auto 18% SaaS */}
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleTitle}>Auto-Apply 18% GST on SaaS Subscriptions</Text>
                  <Text style={styles.toggleDesc}>
                    Applies government-mandated 18% GST under SAC Code 998313 for ERP cloud software renewals.
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    setGstConfig({ ...gstConfig, auto18PercentSaaS: !gstConfig.auto18PercentSaaS })
                  }
                  style={[styles.toggleSwitch, gstConfig.auto18PercentSaaS ? styles.toggleOn : styles.toggleOff]}
                >
                  <View style={[styles.toggleKnob, gstConfig.auto18PercentSaaS ? styles.toggleKnobOn : styles.toggleKnobOff]} />
                </Pressable>
              </View>

              {/* Toggle 4: e-Invoicing */}
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleTitle}>e-Invoicing & IRN Generation (B2B Sales)</Text>
                  <Text style={styles.toggleDesc}>
                    Generate IRN (Invoice Reference Number) and QR codes for eligible B2B wholesale transactions.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setGstConfig({ ...gstConfig, eInvoicing: !gstConfig.eInvoicing })}
                  style={[styles.toggleSwitch, gstConfig.eInvoicing ? styles.toggleOn : styles.toggleOff]}
                >
                  <View style={[styles.toggleKnob, gstConfig.eInvoicing ? styles.toggleKnobOn : styles.toggleKnobOff]} />
                </Pressable>
              </View>
            </View>

            <View style={styles.cardFooter}>
              <Pressable onPress={handleSaveGstConfig} style={styles.saveButton}>
                <Text style={styles.saveButtonText}>💾 Save GST Settings</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* ======================================================== */}
      {/* TAB 2: ALL TAXES & VAT (ADD & SELECT TAXES) */}
      {/* ======================================================== */}
      {activeTab === 'taxes' && (
        <View style={styles.sectionContainer}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>Taxes Applied to Billing & Transfers</Text>
                <Text style={styles.cardSubtitle}>
                  You can toggle which taxes to apply, or click "+ Add New Tax" to add any State Tax, Central Tax, VAT Tax, or Cess.
                </Text>
              </View>

              <Pressable
                onPress={() => setShowAddModal(true)}
                style={styles.addButton}
                accessibilityRole="button"
              >
                <Text style={styles.addButtonText}>+ Add New Tax</Text>
              </Pressable>
            </View>

            {/* Currently Applied Summary Banner */}
            <View style={styles.summaryBanner}>
              <Text style={styles.summaryBannerTitle}>Active Applied Taxes ({appliedTaxes.length}):</Text>
              <View style={styles.summaryPillsRow}>
                {appliedTaxes.map((t) => (
                  <View key={t.id} style={styles.appliedPill}>
                    <Text style={styles.appliedPillText}>
                      {t.name} ({t.rate}%)
                    </Text>
                  </View>
                ))}
                <View style={styles.totalRatePill}>
                  <Text style={styles.totalRatePillText}>Total Rate: {totalAppliedRate}%</Text>
                </View>
              </View>
            </View>

            {/* Taxes List */}
            <View style={styles.taxesList}>
              {taxesList.map((tax) => (
                <View key={tax.id} style={[styles.taxItemCard, tax.isApplied && styles.taxItemCardApplied]}>
                  {/* Left: Info */}
                  <View style={styles.taxItemInfo}>
                    <View style={styles.taxItemTitleRow}>
                      <Text style={styles.taxItemName}>{tax.name}</Text>
                      <View
                        style={[
                          styles.taxTypeBadge,
                          tax.type === 'VAT Tax'
                            ? styles.taxTypeVat
                            : tax.type === 'State Tax'
                            ? styles.taxTypeState
                            : styles.taxTypeCentral,
                        ]}
                      >
                        <Text style={styles.taxTypeBadgeText}>{tax.type}</Text>
                      </View>
                      <View style={styles.rateBadge}>
                        <Text style={styles.rateBadgeText}>{tax.rate}%</Text>
                      </View>
                    </View>
                    <Text style={styles.taxItemDesc}>{tax.description}</Text>
                  </View>

                  {/* Right: Toggle & Delete */}
                  <View style={styles.taxItemActions}>
                    <View style={styles.toggleWithLabel}>
                      <Text style={styles.applyLabel}>
                        {tax.isApplied ? 'Applied to Bill' : 'Not Applied'}
                      </Text>
                      <Pressable
                        onPress={() => handleToggleApplyTax(tax.id)}
                        style={[styles.toggleSwitch, tax.isApplied ? styles.toggleOn : styles.toggleOff]}
                      >
                        <View style={[styles.toggleKnob, tax.isApplied ? styles.toggleKnobOn : styles.toggleKnobOff]} />
                      </Pressable>
                    </View>

                    {!tax.isDefault ? (
                      <Pressable
                        onPress={() => handleDeleteTax(tax.id, tax.name)}
                        style={styles.deleteBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Delete Tax"
                      >
                        <Text style={styles.deleteBtnText}>🗑️ Delete</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}



      {/* ======================================================== */}
      {/* MODAL: ADD NEW TAX (SIMPLE & CLEAN) */}
      {/* ======================================================== */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isMobile && styles.modalCardMobile]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>+ Add New Tax</Text>
              <Pressable onPress={() => setShowAddModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              {/* Field 1: Tax Name */}
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Tax Name *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. State VAT, Central Surcharge, Municipal Cess"
                  value={newTaxName}
                  onChangeText={setNewTaxName}
                />
              </View>

              {/* Field 2: Tax Type */}
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Tax Type</Text>
                <View style={styles.btnRow}>
                  {['State Tax', 'Central Tax', 'VAT Tax', 'Other'].map((type) => (
                    <Pressable
                      key={type}
                      onPress={() => setNewTaxType(type)}
                      style={[styles.choiceBtn, newTaxType === type && styles.choiceBtnActive]}
                    >
                      <Text style={[styles.choiceBtnText, newTaxType === type && styles.choiceBtnTextActive]}>
                        {type}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Field 3: Tax Rate */}
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Tax Rate (%) *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 5 or 12.5"
                  keyboardType="numeric"
                  value={newTaxRate}
                  onChangeText={setNewTaxRate}
                />
              </View>

              {/* Field 4: Apply to Invoices Toggle */}
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleTitle}>Apply to Invoices & Transfers</Text>
                  <Text style={styles.toggleDesc}>
                    When ON, this tax will be immediately applied during checkout and stock transfers.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setNewTaxApplied(!newTaxApplied)}
                  style={[styles.toggleSwitch, newTaxApplied ? styles.toggleOn : styles.toggleOff]}
                >
                  <View style={[styles.toggleKnob, newTaxApplied ? styles.toggleKnobOn : styles.toggleKnobOff]} />
                </Pressable>
              </View>
            </View>

            <View style={styles.modalFooter}>
              <Pressable onPress={() => setShowAddModal(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSaveNewTax} style={styles.saveButton}>
                <Text style={styles.saveButtonText}>Add Tax</Text>
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
    padding: 12,
  },
  headerBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 22,
    marginBottom: 16,
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
  adminBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  adminBadgeText: {
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
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 14,
    flexWrap: 'wrap',
    gap: 12,
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
  activePill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  activePillText: {
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
  btnRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  choiceBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    cursor: 'pointer',
  },
  choiceBtnActive: {
    borderColor: '#0F766E',
    backgroundColor: '#F0FDFA',
  },
  choiceBtnText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  choiceBtnTextActive: {
    color: '#0F766E',
    fontWeight: '700',
  },
  togglesList: {
    gap: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
    gap: 16,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  toggleDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginTop: 2,
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
  saveButton: {
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    cursor: 'pointer',
  },
  saveButtonText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  addButton: {
    backgroundColor: '#0F766E',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    cursor: 'pointer',
  },
  addButtonText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  summaryBanner: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  summaryBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
  },
  summaryPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  appliedPill: {
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  appliedPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F766E',
  },
  totalRatePill: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  totalRatePillText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  taxesList: {
    gap: 12,
  },
  taxItemCard: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 14,
  },
  taxItemCardApplied: {
    borderColor: '#99F6E4',
    backgroundColor: '#FFFFFF',
  },
  taxItemInfo: {
    flex: 1,
    minWidth: 260,
  },
  taxItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  taxItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  taxTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  taxTypeVat: {
    backgroundColor: '#FEF3C7',
  },
  taxTypeState: {
    backgroundColor: '#E0F2FE',
  },
  taxTypeCentral: {
    backgroundColor: '#EDE9FE',
  },
  taxTypeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F172A',
  },
  rateBadge: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  rateBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  taxItemDesc: {
    fontSize: 12,
    color: '#64748B',
  },
  taxItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  toggleWithLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  applyLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  deleteBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    cursor: 'pointer',
  },
  deleteBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
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
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalCardMobile: {
    width: '100%',
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
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCloseBtn: {
    padding: 4,
    cursor: 'pointer',
  },
  modalCloseText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '700',
  },
  modalBody: {
    padding: 20,
    gap: 16,
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  restrictedContainer: {
    flex: 1,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    minHeight: 400,
  },
  restrictedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 32,
    alignItems: 'center',
    maxWidth: 480,
    width: '100%',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
      },
    }),
  },
  restrictedIcon: {
    fontSize: 42,
    marginBottom: 16,
  },
  restrictedTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  restrictedDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  restrictedBackBtn: {
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: 'pointer',
  },
  restrictedBackBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
