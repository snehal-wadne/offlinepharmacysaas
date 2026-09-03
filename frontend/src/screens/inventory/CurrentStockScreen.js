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
} from 'react-native';
import InventoryStatCard from '../../components/inventory/InventoryStatCard';
import {
  CURRENT_STOCK_KPIS,
  MOCK_STOCK_ITEMS,
} from '../../data/currentStockMockData';
import { MOCK_SUPPLIERS_LIST } from '../../data/suppliersMockData';
import { MOCK_BRANCHES_LIST } from '../../data/managementMockData';

export default function CurrentStockScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  // Stock Items State
  const [stockItems, setStockItems] = useState(MOCK_STOCK_ITEMS);

  // Add Medicine Form State
  const [formData, setFormData] = useState({
    medicineName: '',
    sku: '',
    batchNo: '',
    expiryDate: '',
    quantity: '',
    supplierName: MOCK_SUPPLIERS_LIST[0]?.name || 'Sun Pharma Care',
    branchId: MOCK_BRANCHES_LIST[0]?.name || 'FIT Main Campus Hospital Pharmacy',
    shelfLocation: '',
    isActive: true,
  });
  const [formErrors, setFormErrors] = useState({});
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const handleAddMedicine = () => {
    const errors = {};
    if (!formData.medicineName.trim()) errors.medicineName = 'Medicine name is required';
    if (!formData.sku.trim()) errors.sku = 'SKU is required';
    if (!formData.batchNo.trim()) errors.batchNo = 'Batch No is required';
    if (!formData.expiryDate.trim()) errors.expiryDate = 'Expiry date is required (e.g. 2027-06)';
    if (!formData.quantity.trim() || isNaN(formData.quantity) || Number(formData.quantity) <= 0) {
      errors.quantity = 'Valid quantity is required';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      if (onShowToast) onShowToast('Please fill all required fields.');
      return;
    }

    const newItem = {
      id: `stk-${Date.now()}`,
      medicineName: formData.medicineName,
      sku: formData.sku,
      batchNo: formData.batchNo,
      expiryDate: formData.expiryDate,
      quantity: Number(formData.quantity),
      amount: '₹120.00',
      branchId: formData.branchId || 'BR-01',
      shelfLocation: formData.shelfLocation || 'A1-S1',
      supplierName: formData.supplierName || 'Sun Pharma Care',
      updatedBy: 'Manager',
      lastUpdated: new Date().toISOString().split('T')[0],
      status: 'In Stock',
      isActive: formData.isActive !== undefined ? formData.isActive : true,
    };

    setStockItems((prev) => [newItem, ...prev]);
    setFormData({
      medicineName: '',
      sku: '',
      batchNo: '',
      expiryDate: '',
      quantity: '',
      supplierName: MOCK_SUPPLIERS_LIST[0]?.name || 'Sun Pharma Care',
      branchId: MOCK_BRANCHES_LIST[0]?.name || 'FIT Main Campus Hospital Pharmacy',
      shelfLocation: '',
      isActive: true,
    });
    setFormErrors({});

    if (onShowToast) {
      onShowToast(`✓ Added "${newItem.medicineName}" to inventory!`);
    }
  };

  const handleEditOrDelete = (item) => {
    if (onShowToast) {
      onShowToast(`Modify action clicked for ${item.medicineName} (${item.sku})`);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, isMobile && styles.contentContainerMobile]}
      showsVerticalScrollIndicator={true}
    >
      {/* Top 4 KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {CURRENT_STOCK_KPIS.map((kpi) => (
          <InventoryStatCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            subtext=""
            icon={kpi.icon}
            variant={kpi.variant}
            onPress={() => onShowToast && onShowToast(`Filter: ${kpi.label}`)}
          />
        ))}
      </View>

      {/* Stock Information Table Card */}
      <View style={styles.cardContainer}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Stock Information</Text>
        </View>

        {isMobile ? (
          /* Mobile Card View */
          <View style={styles.mobileCardList}>
            {stockItems.map((item) => (
              <View key={item.id} style={styles.mobileStockCard}>
                <View style={styles.mobileStockHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mobileMedTitle}>{item.medicineName}</Text>
                    <Text style={styles.mobileSkuText}>SKU: {item.sku}</Text>
                  </View>
                  <View style={styles.mobileInStockBadge}>
                    <Text style={styles.mobileInStockText}>In Stock</Text>
                  </View>
                </View>

                <View style={styles.mobileGrid}>
                  <View style={styles.mobileGridCol}>
                    <Text style={styles.mobileLabel}>Batch No.</Text>
                    <Text style={styles.mobileValBold}>{item.batchNo}</Text>
                  </View>
                  <View style={styles.mobileGridCol}>
                    <Text style={styles.mobileLabel}>Qty Available</Text>
                    <Text style={[styles.mobileValBold, { color: '#0F766E' }]}>{item.quantity} units</Text>
                  </View>
                  <View style={styles.mobileGridCol}>
                    <Text style={styles.mobileLabel}>Amount</Text>
                    <Text style={styles.mobileValBold}>{item.amount}</Text>
                  </View>
                  <View style={styles.mobileGridCol}>
                    <Text style={styles.mobileLabel}>Shelf Location</Text>
                    <Text style={styles.mobileVal}>{item.shelfLocation}</Text>
                  </View>
                  <View style={styles.mobileGridCol}>
                    <Text style={styles.mobileLabel}>Branch</Text>
                    <Text style={styles.mobileVal}>{item.branchId}</Text>
                  </View>
                  <View style={styles.mobileGridCol}>
                    <Text style={styles.mobileLabel}>Supplier</Text>
                    <Text style={styles.mobileVal} numberOfLines={1}>{item.supplierName}</Text>
                  </View>
                </View>

                <View style={styles.mobileCardFooter}>
                  <Text style={styles.mobileUpdatedText}>Updated: {item.lastUpdated}</Text>
                  <Pressable
                    onPress={() => handleEditOrDelete(item)}
                    style={styles.mobileModBtn}
                    accessibilityRole="button"
                  >
                    <Text style={styles.mobileModBtnText}>Modify</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : (
          /* Desktop Table View */
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              {/* Table Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { width: 140 }]}>Medicine Name</Text>
                <Text style={[styles.thCell, { width: 100 }]}>SKU</Text>
                <Text style={[styles.thCell, { width: 100 }]}>Batch No.</Text>
                <Text style={[styles.thCell, { width: 120, textAlign: 'center' }]}>
                  Quantity Available
                </Text>
                <Text style={[styles.thCell, { width: 100, textAlign: 'right' }]}>Amount</Text>
                <Text style={[styles.thCell, { width: 100, textAlign: 'center' }]}>Branch ID</Text>
                <Text style={[styles.thCell, { width: 100, textAlign: 'center' }]}>Shelf Location</Text>
                <Text style={[styles.thCell, { width: 120 }]}>Supplier Name</Text>
                <Text style={[styles.thCell, { width: 100 }]}>Updated By</Text>
                <Text style={[styles.thCell, { width: 110 }]}>Last Updated</Text>
                <Text style={[styles.thCell, { width: 90, textAlign: 'center' }]}>Modify</Text>
              </View>

              {/* Table Rows */}
              {stockItems.map((item, index) => (
                <View
                  key={item.id}
                  style={[
                    styles.tableRow,
                    index % 2 === 1 && styles.tableRowAlt,
                  ]}
                >
                  <Text style={[styles.tdCell, styles.medName, { width: 140 }]} numberOfLines={1}>
                    {item.medicineName}
                  </Text>
                  <Text style={[styles.tdCell, { width: 100 }]}>{item.sku}</Text>
                  <Text style={[styles.tdCell, { width: 100 }]}>{item.batchNo}</Text>
                  <Text style={[styles.tdCell, { width: 120, textAlign: 'center', fontWeight: '600' }]}>
                    {item.quantity}
                  </Text>
                  <Text style={[styles.tdCell, styles.amountCell, { width: 100, textAlign: 'right' }]}>
                    {item.amount}
                  </Text>
                  <Text style={[styles.tdCell, { width: 100, textAlign: 'center' }]}>
                    {item.branchId}
                  </Text>
                  <Text style={[styles.tdCell, { width: 100, textAlign: 'center' }]}>
                    {item.shelfLocation}
                  </Text>
                  <Text style={[styles.tdCell, { width: 120 }]}>{item.supplierName}</Text>
                  <Text style={[styles.tdCell, { width: 100 }]}>{item.updatedBy}</Text>
                  <Text style={[styles.tdCell, { width: 110 }]}>{item.lastUpdated}</Text>

                  {/* Modify Button Pill */}
                  <View style={[styles.modifyWrapper, { width: 90 }]}>
                    <Pressable
                      onPress={() => handleEditOrDelete(item)}
                      style={styles.modifyButton}
                      accessibilityRole="button"
                      accessibilityLabel="Edit or Delete medicine"
                    >
                      <Text style={styles.modifyButtonText}>Edit/Del</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Add Medicine Entry Form Card */}
      <View style={styles.cardContainer}>
        <View style={styles.formHeader}>
          <Text style={styles.cardTitle}>Add Medicine Entry</Text>
          <Text style={styles.formSubtitle}>
            Enter medicine details below to add/modify inventory entry.
          </Text>
        </View>

        {/* 2-Column Form Fields Grid */}
        <View style={styles.formGrid}>
          {/* Row 1: Medicine Name & SKU */}
          <View style={styles.formFieldHalf}>
            <Text style={styles.fieldLabel}>Medicine Name</Text>
            <TextInput
              style={[styles.formInput, formErrors.medicineName && styles.formInputError]}
              placeholder="e.g., Paracetamol 500mg"
              placeholderTextColor="#94A3B8"
              value={formData.medicineName}
              onChangeText={(t) => handleFormChange('medicineName', t)}
            />
            {formErrors.medicineName && (
              <Text style={styles.errorText}>{formErrors.medicineName}</Text>
            )}
          </View>

          <View style={styles.formFieldHalf}>
            <Text style={styles.fieldLabel}>SKU</Text>
            <TextInput
              style={[styles.formInput, formErrors.sku && styles.formInputError]}
              placeholder="e.g., MED-2024-001"
              placeholderTextColor="#94A3B8"
              value={formData.sku}
              onChangeText={(t) => handleFormChange('sku', t)}
            />
            {formErrors.sku && <Text style={styles.errorText}>{formErrors.sku}</Text>}
          </View>          {/* Row 2: Batch No & Expiry Date */}
          <View style={styles.formFieldHalf}>
            <Text style={styles.fieldLabel}>Batch No.</Text>
            <TextInput
              style={[styles.formInput, formErrors.batchNo && styles.formInputError]}
              placeholder="e.g., BT-2024-08"
              placeholderTextColor="#94A3B8"
              value={formData.batchNo}
              onChangeText={(t) => handleFormChange('batchNo', t)}
            />
            {formErrors.batchNo && <Text style={styles.errorText}>{formErrors.batchNo}</Text>}
          </View>

          <View style={styles.formFieldHalf}>
            <Text style={styles.fieldLabel}>Expiry Date (YYYY-MM)</Text>
            <TextInput
              style={[styles.formInput, formErrors.expiryDate && styles.formInputError]}
              placeholder="e.g., 2027-06 or 12/26"
              placeholderTextColor="#94A3B8"
              value={formData.expiryDate}
              onChangeText={(t) => handleFormChange('expiryDate', t)}
            />
            {formErrors.expiryDate && <Text style={styles.errorText}>{formErrors.expiryDate}</Text>}
          </View>

          {/* Row 3: Quantity & Shelf Location */}
          <View style={styles.formFieldHalf}>
            <Text style={styles.fieldLabel}>Quantity</Text>
            <TextInput
              style={[styles.formInput, formErrors.quantity && styles.formInputError]}
              placeholder="e.g., 120"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={formData.quantity}
              onChangeText={(t) => handleFormChange('quantity', t)}
            />
            {formErrors.quantity && <Text style={styles.errorText}>{formErrors.quantity}</Text>}
          </View>

          <View style={styles.formFieldHalf}>
            <Text style={styles.fieldLabel}>Shelf Location</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g., A-12-04"
              placeholderTextColor="#94A3B8"
              value={formData.shelfLocation}
              onChangeText={(t) => handleFormChange('shelfLocation', t)}
            />
          </View>

          {/* Row 4: Supplier Name (Dropdown) & Branch Selector (Dropdown) */}
          <View style={[styles.formFieldHalf, { zIndex: 30 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.fieldLabel}>Supplier Name / Vendor</Text>
              {onNavigate && (
                <Pressable onPress={() => onNavigate('suppliers')}>
                  <Text style={{ fontSize: 11, color: '#0F766E', fontWeight: '700' }}>+ Add Supplier</Text>
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={() => {
                setSupplierDropdownOpen(!supplierDropdownOpen);
                setBranchDropdownOpen(false);
              }}
              style={[styles.formInput, styles.selectTrigger]}
            >
              <Text style={formData.supplierName ? styles.selectTriggerText : styles.selectPlaceholderText} numberOfLines={1}>
                {formData.supplierName || 'Select Registered Supplier'}
              </Text>
              <Text style={styles.dropdownCaret}>▾</Text>
            </Pressable>

            {supplierDropdownOpen && (
              <View style={styles.dropdownContainerBox}>
                <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                  {MOCK_SUPPLIERS_LIST.map((sup) => (
                    <Pressable
                      key={sup.id}
                      onPress={() => {
                        handleFormChange('supplierName', sup.name);
                        setSupplierDropdownOpen(false);
                      }}
                      style={[
                        styles.dropdownOptionItem,
                        formData.supplierName === sup.name && styles.dropdownOptionItemSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dropdownOptionLabel,
                          formData.supplierName === sup.name && styles.dropdownOptionLabelSelected,
                        ]}
                      >
                        {sup.name}
                      </Text>
                      <Text style={styles.dropdownOptionSub}>{sup.city || sup.category || 'Registered Vendor'}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {onNavigate && (
                  <Pressable
                    onPress={() => {
                      setSupplierDropdownOpen(false);
                      onNavigate('suppliers');
                    }}
                    style={styles.dropdownAddNewBtn}
                  >
                    <Text style={styles.dropdownAddNewText}>+ Manage / Add Supplier in Directory</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>

          <View style={[styles.formFieldHalf, { zIndex: 20 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.fieldLabel}>Branch / Location</Text>
              {onNavigate && (
                <Pressable onPress={() => onNavigate('branches')}>
                  <Text style={{ fontSize: 11, color: '#0F766E', fontWeight: '700' }}>+ Add Branch</Text>
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={() => {
                setBranchDropdownOpen(!branchDropdownOpen);
                setSupplierDropdownOpen(false);
              }}
              style={[styles.formInput, styles.selectTrigger]}
            >
              <Text style={formData.branchId ? styles.selectTriggerText : styles.selectPlaceholderText} numberOfLines={1}>
                {formData.branchId || 'Select Pharmacy Branch'}
              </Text>
              <Text style={styles.dropdownCaret}>▾</Text>
            </Pressable>

            {branchDropdownOpen && (
              <View style={styles.dropdownContainerBox}>
                <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                  {MOCK_BRANCHES_LIST.map((br) => (
                    <Pressable
                      key={br.id}
                      onPress={() => {
                        handleFormChange('branchId', br.name);
                        setBranchDropdownOpen(false);
                      }}
                      style={[
                        styles.dropdownOptionItem,
                        formData.branchId === br.name && styles.dropdownOptionItemSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dropdownOptionLabel,
                          formData.branchId === br.name && styles.dropdownOptionLabelSelected,
                        ]}
                      >
                        {br.name}
                      </Text>
                      <Text style={styles.dropdownOptionSub}>{br.code} • {br.city}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {onNavigate && (
                  <Pressable
                    onPress={() => {
                      setBranchDropdownOpen(false);
                      onNavigate('branches');
                    }}
                    style={styles.dropdownAddNewBtn}
                  >
                    <Text style={styles.dropdownAddNewText}>+ Manage / Add Branch in Management</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>

          {/* Row 5: Billing Status (Active/Inactive) & Prescription Classification (Rx vs OTC) */}
          <View style={styles.formFieldHalf}>
            <Text style={styles.fieldLabel}>Billing Status</Text>
            <Pressable
              onPress={() => handleFormChange('isActive', !formData.isActive)}
              style={[
                styles.formInput,
                styles.statusToggleBtn,
                formData.isActive ? styles.statusActiveBg : styles.statusInactiveBg,
              ]}
              accessibilityRole="switch"
              accessibilityState={{ checked: formData.isActive }}
            >
              <View style={[styles.statusDot, formData.isActive ? styles.statusDotActive : styles.statusDotInactive]} />
              <Text style={[styles.statusToggleText, formData.isActive ? styles.statusTextActive : styles.statusTextInactive]}>
                {formData.isActive ? 'Active (Live in Billing & POS)' : 'Inactive (Hidden from POS)'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Blue Submit Button (Screenshot 2 style) */}
        <View style={styles.formFooter}>
          <Pressable
            onPress={handleAddMedicine}
            style={({ pressed, hovered }) => [
              styles.blueSubmitButton,
              (pressed || hovered) && styles.blueSubmitButtonHovered,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Submit Medicine Entry"
          >
            <Text style={styles.blueSubmitButtonText}>Submit</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 24,
  },
  contentContainerMobile: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 16,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  kpiRowCompact: {
    gap: 12,
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  cardHeader: {
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  /* Mobile Card View Styles */
  mobileCardList: {
    padding: 12,
    gap: 12,
  },
  mobileStockCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  mobileStockHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  mobileMedTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  mobileSkuText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  mobileInStockBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  mobileInStockText: {
    color: '#15803D',
    fontSize: 11,
    fontWeight: '700',
  },
  mobileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 10,
    gap: 10,
  },
  mobileGridCol: {
    width: '47%',
  },
  mobileLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  mobileVal: {
    fontSize: 12.5,
    color: '#334155',
    marginTop: 1,
  },
  mobileValBold: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },
  mobileCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 4,
  },
  mobileUpdatedText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  mobileModBtn: {
    backgroundColor: '#E2E8F0',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 4,
    cursor: 'pointer',
  },
  mobileModBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  tableWrapper: {
    minWidth: 1100,
    paddingHorizontal: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FAFAFA',
  },
  thCell: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableRowAlt: {
    backgroundColor: '#FAFAFA',
  },
  tdCell: {
    fontSize: 13,
    color: '#334155',
    paddingHorizontal: 6,
  },
  medName: {
    fontWeight: '700',
    color: '#0F172A',
  },
  amountCell: {
    fontWeight: '600',
    color: '#0F172A',
  },
  modifyWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  modifyButton: {
    backgroundColor: '#E2E8F0',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
    cursor: 'pointer',
  },
  modifyButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  formHeader: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 10,
  },
  formSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 22,
    paddingVertical: 16,
    gap: 16,
  },
  formFieldHalf: {
    flex: 1,
    minWidth: 260,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 8,
  },
  formInput: {
    height: 42,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    fontSize: 13,
    color: '#0F172A',
    outlineStyle: 'none',
  },
  formInputError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  errorText: {
    fontSize: 11,
    color: '#DC2626',
    marginTop: 3,
    fontWeight: '500',
  },
  formFooter: {
    paddingHorizontal: 22,
    paddingBottom: 22,
    alignItems: 'flex-end',
  },
  blueSubmitButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderRadius: 8,
    cursor: 'pointer',
  },
  blueSubmitButtonHovered: {
    backgroundColor: '#1D4ED8',
  },
  blueSubmitButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  selectTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
  },
  selectTriggerText: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
    flex: 1,
  },
  selectPlaceholderText: {
    fontSize: 13,
    color: '#94A3B8',
    flex: 1,
  },
  dropdownCaret: {
    fontSize: 13,
    color: '#64748B',
    marginLeft: 6,
  },
  dropdownContainerBox: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    marginTop: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 999,
    overflow: 'hidden',
  },
  dropdownOptionItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    cursor: 'pointer',
  },
  dropdownOptionItemSelected: {
    backgroundColor: '#F0FDFA',
  },
  dropdownOptionLabel: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '600',
  },
  dropdownOptionLabelSelected: {
    color: '#0F766E',
    fontWeight: '700',
  },
  dropdownOptionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  dropdownAddNewBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    alignItems: 'center',
    cursor: 'pointer',
  },
  dropdownAddNewText: {
    fontSize: 12,
    color: '#0F766E',
    fontWeight: '700',
  },
  statusToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    cursor: 'pointer',
    paddingVertical: 9,
  },
  statusActiveBg: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  statusInactiveBg: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusDotActive: {
    backgroundColor: '#16A34A',
  },
  statusDotInactive: {
    backgroundColor: '#DC2626',
  },
  statusToggleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusTextActive: {
    color: '#15803D',
  },
  statusTextInactive: {
    color: '#B91C1C',
  },
  rxChoicePill: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  rxChoicePillOtcSelected: {
    backgroundColor: '#F0FDF4',
    borderColor: '#16A34A',
  },
  rxChoicePillRxSelected: {
    backgroundColor: '#FAF5FF',
    borderColor: '#9333EA',
  },
  rxChoiceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  rxChoiceTextSelected: {
    color: '#16A34A',
    fontWeight: '700',
  },
  rxChoiceTextRxSelected: {
    color: '#9333EA',
    fontWeight: '700',
  },
});
