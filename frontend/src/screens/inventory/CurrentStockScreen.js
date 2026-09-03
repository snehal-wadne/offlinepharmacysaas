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
} from 'react-native';
import InventoryStatCard from '../../components/inventory/InventoryStatCard';
import {
  MOCK_STOCK_ITEMS,
} from '../../data/currentStockMockData';
import { fetchInventory } from '../../api/inventoryApi';

export default function CurrentStockScreen({ onShowToast }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  // Stock Items State
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeKpiFilter, setActiveKpiFilter] = useState('ALL');

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    try {
      setLoading(true);
      const res = await fetchInventory();
      if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
        setStockItems(res.data);
      } else {
        setStockItems(MOCK_STOCK_ITEMS);
      }
    } catch (err) {
      console.warn('CurrentStockScreen fetch failed:', err.message);
      setStockItems(MOCK_STOCK_ITEMS);
    } finally {
      setLoading(false);
    }
  };

  // Add Medicine Form State
  const [formData, setFormData] = useState({
    medicineName: '',
    sku: '',
    batchNo: '',
    quantity: '',
    branchId: '',
    shelfLocation: '',
  });
  const [formErrors, setFormErrors] = useState({});

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
      quantity: Number(formData.quantity),
      amount: '₹120.00',
      branchId: formData.branchId || 'BR-01',
      shelfLocation: formData.shelfLocation || 'A1-S1',
      supplierName: 'PharmaCo',
      updatedBy: 'Manager',
      lastUpdated: new Date().toISOString().split('T')[0],
      status: 'In Stock',
    };

    setStockItems((prev) => [newItem, ...prev]);
    setFormData({
      medicineName: '',
      sku: '',
      batchNo: '',
      quantity: '',
      branchId: '',
      shelfLocation: '',
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

  // Dynamic 4 KPI Stat Cards Calculations
  const totalProductsCount = stockItems.length;
  const lowStockCount = stockItems.filter((i) => Number(i.quantity) < 50).length;
  const nearExpiryCount = stockItems.filter((i) => {
    if (i.status === 'Near Expiry') return true;
    if (i.expiryDate || i.expiry_date) {
      const d = new Date(i.expiryDate || i.expiry_date);
      const now = new Date();
      const diffDays = (d - now) / (1000 * 60 * 60 * 24);
      return diffDays > 0 && diffDays <= 90;
    }
    return false;
  }).length;
  const expiredCount = stockItems.filter((i) => {
    if (i.status === 'Expired') return true;
    if (i.expiryDate || i.expiry_date) {
      return new Date(i.expiryDate || i.expiry_date) < new Date();
    }
    return Number(i.quantity) === 0;
  }).length;

  const dynamicKpis = [
    {
      id: 'c-kpi-1',
      label: 'TOTAL PRODUCTS',
      value: totalProductsCount.toLocaleString(),
      subtext: activeKpiFilter === 'ALL' ? 'Showing all products' : 'Click to view all',
      variant: 'teal',
      key: 'ALL',
    },
    {
      id: 'c-kpi-2',
      label: 'LOW STOCK ITEMS',
      value: lowStockCount.toLocaleString(),
      subtext: activeKpiFilter === 'LOW_STOCK' ? 'Filtered: Qty < 50' : 'Quantity < 50 units',
      variant: 'amber',
      key: 'LOW_STOCK',
    },
    {
      id: 'c-kpi-3',
      label: 'NEAR EXPIRY ITEMS',
      value: nearExpiryCount.toLocaleString(),
      subtext: activeKpiFilter === 'NEAR_EXPIRY' ? 'Filtered: Expiring < 90d' : 'Expiring < 90 days',
      variant: 'blue',
      key: 'NEAR_EXPIRY',
    },
    {
      id: 'c-kpi-4',
      label: 'EXPIRED ITEMS',
      value: expiredCount.toLocaleString(),
      subtext: activeKpiFilter === 'EXPIRED' ? 'Filtered: Out of stock / expired' : 'Expired / Out of stock',
      variant: 'red',
      key: 'EXPIRED',
    },
  ];

  const handleKpiCardPress = (kpiKey, label) => {
    if (activeKpiFilter === kpiKey && kpiKey !== 'ALL') {
      setActiveKpiFilter('ALL');
      if (onShowToast) onShowToast(`Reset filter: Showing all products`);
    } else {
      setActiveKpiFilter(kpiKey);
      if (onShowToast) onShowToast(`Filtered: ${label}`);
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
        {dynamicKpis.map((kpi) => (
          <InventoryStatCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            subtext={kpi.subtext}
            variant={kpi.variant}
            onPress={() => handleKpiCardPress(kpi.key, kpi.label)}
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
          </View>

          {/* Row 2: Batch No & Quantity */}
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

          {/* Row 3: Branch ID & Shelf Location */}
          <View style={styles.formFieldHalf}>
            <Text style={styles.fieldLabel}>Branch ID</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g., BR-001"
              placeholderTextColor="#94A3B8"
              value={formData.branchId}
              onChangeText={(t) => handleFormChange('branchId', t)}
            />
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
});
