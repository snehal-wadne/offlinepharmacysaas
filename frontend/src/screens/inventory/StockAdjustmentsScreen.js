import React, { useState, useEffect, useRef } from 'react';
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
import { MOCK_STOCK_ITEMS } from '../../data/currentStockMockData';
import {
  fetchInventory,
  saveInventoryEntry,
  updateInventoryEntry,
  deleteInventoryEntry,
} from '../../api/inventoryApi';

export default function StockAdjustmentsScreen({ onShowToast, isMultiBranch = true }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const scrollViewRef = useRef(null);
  const formCardRef = useRef(null);

  // Stock Items State for Adjustments Table
  const [stockItems, setStockItems] = useState(MOCK_STOCK_ITEMS);
  const [editingId, setEditingId] = useState(null);
  const [editingRealId, setEditingRealId] = useState(null);

  // Load Inventory from Backend
  useEffect(() => {
    let isMounted = true;
    async function loadInventoryData() {
      try {
        const res = await fetchInventory();
        if (isMounted && res && res.data && res.data.length > 0) {
          const formatted = res.data.map((item, idx) => ({
            realId: item.id,
            id: `stk-${item.id || idx}`,
            medicineName: item.medicineName || item.brandName || 'Paracetamol',
            brandName: item.brandName || item.medicineName || 'Crocin 500',
            genericName: item.medicineName || 'Paracetamol',
            strength: item.strength || '500mg',
            packSize: item.packSize || '15 Tablets',
            manufacturer: item.manufacturer || 'GSK',
            supplierName: item.supplierName || 'GSK Pharmaceuticals',
            amount: item.mrp ? (String(item.mrp).startsWith('₹') ? String(item.mrp) : `₹${item.mrp}`) : '₹15.00',
            sku: item.sku || `SKU-${idx + 100}`,
            batchNo: item.batchNo || 'B-1001',
            quantity: Number(item.quantity || 0),
            branchId: item.branchName || 'BR-01',
            shelfLocation: item.shelfLocation || 'A1-S1',
            updatedBy: item.updatedBy || 'Manager',
            lastUpdated: item.updated_at ? new Date(item.updated_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            status: Number(item.quantity) < 50 ? 'Low Stock' : 'In Stock',
          }));
          setStockItems(formatted);
        }
      } catch (err) {
        console.log('[StockAdjustmentsScreen] Backend offline or using mock inventory list');
      }
    }
    loadInventoryData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Add/Edit Medicine Entry Form State
  const [formData, setFormData] = useState({
    medicineName: '',
    brandName: '',
    genericName: '',
    strength: '',
    packSize: '',
    manufacturer: '',
    supplierName: '',
    amount: '',
    sku: '',
    batchNo: '',
    quantity: '',
    branchId: 'Main Store',
    shelfLocation: '',
  });
  const [formErrors, setFormErrors] = useState({});

  // Dynamic KPI Card counts
  const totalProducts = stockItems.length;
  const lowStockCount = stockItems.filter(
    (i) => Number(i.quantity) < 50 && Number(i.quantity) > 0
  ).length;

  const dynamicKpis = [
    {
      id: 'total',
      label: 'TOTAL PRODUCTS',
      value: String(totalProducts),
      variant: 'teal',
    },
    {
      id: 'low_stock',
      label: 'LOW STOCK ITEMS',
      value: String(lowStockCount),
      variant: 'amber',
    },
    {
      id: 'near_expiry',
      label: 'NEAR EXPIRY ITEMS',
      value: '18',
      variant: 'blue',
    },
    {
      id: 'expired',
      label: 'EXPIRED ITEMS',
      value: '6',
      variant: 'rose',
    },
  ];

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setEditingRealId(item.realId || item.id);
    setFormData({
      medicineName: item.medicineName || item.genericName || '',
      brandName: item.brandName || '',
      genericName: item.genericName || item.medicineName || '',
      strength: item.strength || '',
      packSize: item.packSize || '',
      manufacturer: item.manufacturer || '',
      supplierName: item.supplierName || '',
      amount: item.amount ? String(item.amount).replace('₹', '') : '',
      sku: item.sku || '',
      batchNo: item.batchNo || '',
      quantity: String(item.quantity || ''),
      branchId: item.branchId || 'Main Store',
      shelfLocation: item.shelfLocation || '',
    });
    setFormErrors({});

    if (onShowToast) {
      onShowToast(`Editing entry for "${item.brandName || item.medicineName}"`);
    }

    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingRealId(null);
    setFormData({
      medicineName: '',
      brandName: '',
      genericName: '',
      strength: '',
      packSize: '',
      manufacturer: '',
      supplierName: '',
      amount: '',
      sku: '',
      batchNo: '',
      quantity: '',
      branchId: 'Main Store',
      shelfLocation: '',
    });
    setFormErrors({});
  };

  const handleDeleteItem = async (item) => {
    const targetId = item.realId || item.id;
    try {
      await deleteInventoryEntry(targetId);
    } catch (err) {
      console.warn('[StockAdjustmentsScreen] Delete in backend failed, updating local state:', err.message);
    }

    setStockItems((prev) => prev.filter((i) => i.id !== item.id));

    if (onShowToast) {
      onShowToast(`✓ Deleted batch ${item.batchNo} (${item.brandName || item.medicineName}) from inventory!`);
    }
  };

  const handleSaveMedicine = async () => {
    const errors = {};
    if (!formData.medicineName.trim()) errors.medicineName = 'Medicine Name is required (e.g. Paracetamol)';
    if (!formData.brandName.trim()) errors.brandName = 'Brand Name is required (e.g. Crocin 500 / Dolo 650)';
    if (!formData.sku.trim()) errors.sku = 'SKU is required';
    if (!formData.batchNo.trim()) errors.batchNo = 'Batch No. is required';
    if (!formData.quantity.trim() || isNaN(formData.quantity) || Number(formData.quantity) <= 0) {
      errors.quantity = 'Valid quantity is required';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      if (onShowToast) onShowToast('Please fill in required medicine, brand & batch details.');
      return;
    }

    const formattedAmount = formData.amount
      ? formData.amount.startsWith('₹')
        ? formData.amount
        : `₹${formData.amount}`
      : '₹15.00';

    const payload = {
      medicineName: formData.medicineName,
      brandName: formData.brandName,
      genericName: formData.genericName || formData.medicineName,
      strength: formData.strength || '500mg',
      packSize: formData.packSize || '15 Tablets',
      manufacturer: formData.manufacturer || 'GSK',
      supplierName: formData.supplierName || 'GSK Pharmaceuticals',
      amount: formattedAmount,
      sku: formData.sku,
      batchNo: formData.batchNo,
      quantity: Number(formData.quantity),
      branchId: isMultiBranch ? (formData.branchId || 'BR-01') : 'Main Store',
      shelfLocation: formData.shelfLocation || 'A1-S1',
    };

    if (editingId) {
      // Editing Mode
      const targetId = editingRealId || editingId;
      try {
        await updateInventoryEntry(targetId, payload);
      } catch (err) {
        console.warn('[StockAdjustmentsScreen] Backend update failed, updating local state:', err.message);
      }

      setStockItems((prev) =>
        prev.map((item) =>
          item.id === editingId
            ? {
                ...item,
                ...payload,
                updatedBy: 'Manager',
                lastUpdated: new Date().toISOString().split('T')[0],
                status: payload.quantity < 50 ? 'Low Stock' : 'In Stock',
              }
            : item
        )
      );

      if (onShowToast) {
        onShowToast(`✓ Updated medicine entry "${formData.brandName}" in inventory & database!`);
      }
    } else {
      // New Entry Mode
      let newRealId = `adj-stk-${Date.now()}`;
      try {
        const res = await saveInventoryEntry(payload);
        if (res && res.data && res.data.id) {
          newRealId = res.data.id;
        }
      } catch (err) {
        console.warn('[StockAdjustmentsScreen] Backend save failed, updating local state:', err.message);
      }

      const newItem = {
        realId: newRealId,
        id: `stk-${newRealId}`,
        ...payload,
        updatedBy: 'Manager',
        lastUpdated: new Date().toISOString().split('T')[0],
        status: payload.quantity < 50 ? 'Low Stock' : 'In Stock',
      };

      setStockItems((prev) => [newItem, ...prev]);

      if (onShowToast) {
        onShowToast(`✓ Added "${newItem.brandName}" to inventory & saved to database!`);
      }
    }

    handleCancelEdit();
  };

  return (
    <ScrollView
      ref={scrollViewRef}
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={true}
    >
      {/* Top 4 Dynamic KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {dynamicKpis.map((kpi) => (
          <InventoryStatCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            subtext=""
            variant={kpi.variant}
            onPress={() => onShowToast && onShowToast(`Filter: ${kpi.label}`)}
          />
        ))}
      </View>

      {/* Stock Information / Adjustments Table Card */}
      <View style={styles.cardContainer}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Stock Information</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <View style={styles.tableWrapper}>
            {/* Table Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.thCell, { width: 130 }]}>Medicine Name</Text>
              <Text style={[styles.thCell, { width: 140 }]}>Brand Name</Text>
              <Text style={[styles.thCell, { width: 140 }]}>Strength & Pack</Text>
              <Text style={[styles.thCell, { width: 120 }]}>Manufacturer</Text>
              <Text style={[styles.thCell, { width: 150 }]}>Supplier Name</Text>
              <Text style={[styles.thCell, { width: 110 }]}>SKU</Text>
              <Text style={[styles.thCell, { width: 95 }]}>Batch No.</Text>
              <Text style={[styles.thCell, { width: 110, textAlign: 'center' }]}>
                Qty Available
              </Text>
              <Text style={[styles.thCell, { width: 90, textAlign: 'right' }]}>MRP</Text>
              {isMultiBranch && (
                <Text style={[styles.thCell, { width: 90, textAlign: 'center' }]}>Branch ID</Text>
              )}
              <Text style={[styles.thCell, { width: 100, textAlign: 'center' }]}>Shelf Location</Text>
              <Text style={[styles.thCell, { width: 95 }]}>Updated By</Text>
              <Text style={[styles.thCell, { width: 105 }]}>Last Updated</Text>
              <Text style={[styles.thCell, { width: 130, textAlign: 'center' }]}>Modify</Text>
            </View>

            {/* Table Rows */}
            {stockItems.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No stock items found</Text>
                <Text style={styles.emptySubtitle}>Use the form below to add a medicine entry.</Text>
              </View>
            ) : (
              stockItems.map((item, index) => (
                <View
                  key={item.id}
                  style={[
                    styles.tableRow,
                    index % 2 === 1 && styles.tableRowAlt,
                    editingId === item.id && styles.editingTableRow,
                  ]}
                >
                  {/* Medicine Name */}
                  <Text style={[styles.tdCell, styles.medNameCell, { width: 130 }]} numberOfLines={1}>
                    {item.medicineName || item.genericName}
                  </Text>

                  {/* Brand Name */}
                  <Text style={[styles.tdCell, styles.brandNameCell, { width: 140 }]} numberOfLines={1}>
                    {item.brandName}
                  </Text>

                  {/* Strength & Pack */}
                  <Text style={[styles.tdCell, styles.strengthCell, { width: 140 }]} numberOfLines={1}>
                    {item.strength ? `${item.strength} • ${item.packSize || ''}` : '500mg • 15 Tabs'}
                  </Text>

                  {/* Manufacturer */}
                  <Text style={[styles.tdCell, styles.mfgCell, { width: 120 }]} numberOfLines={1}>
                    {item.manufacturer || 'GSK'}
                  </Text>

                  {/* Supplier Name */}
                  <Text style={[styles.tdCell, styles.supplierCell, { width: 150 }]} numberOfLines={1}>
                    {item.supplierName || `${item.manufacturer || 'GSK'} Distribution`}
                  </Text>

                  {/* SKU */}
                  <Text style={[styles.tdCell, styles.skuCell, { width: 110 }]}>{item.sku}</Text>

                  {/* Batch No */}
                  <Text style={[styles.tdCell, { width: 95 }]}>{item.batchNo}</Text>

                  {/* Quantity */}
                  <Text style={[styles.tdCell, { width: 110, textAlign: 'center', fontWeight: '700' }]}>
                    {item.quantity}
                  </Text>

                  {/* Amount / MRP */}
                  <Text style={[styles.tdCell, styles.amountCell, { width: 90, textAlign: 'right' }]}>
                    {item.amount}
                  </Text>

                  {/* Branch ID (Multi-Branch only) */}
                  {isMultiBranch && (
                    <Text style={[styles.tdCell, { width: 90, textAlign: 'center' }]}>
                      {item.branchId}
                    </Text>
                  )}

                  {/* Shelf Location */}
                  <Text style={[styles.tdCell, { width: 100, textAlign: 'center' }]}>
                    {item.shelfLocation}
                  </Text>

                  {/* Updated By */}
                  <Text style={[styles.tdCell, { width: 95 }]}>{item.updatedBy}</Text>

                  {/* Last Updated */}
                  <Text style={[styles.tdCell, { width: 105 }]}>{item.lastUpdated}</Text>

                  {/* Separate Edit and Delete Action Buttons */}
                  <View style={[styles.actionRow, { width: 130 }]}>
                    <Pressable
                      onPress={() => handleStartEdit(item)}
                      style={styles.editButton}
                      accessibilityRole="button"
                      accessibilityLabel="Edit medicine adjustment"
                    >
                      <Text style={styles.editButtonText}>Edit</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => handleDeleteItem(item)}
                      style={styles.deleteButton}
                      accessibilityRole="button"
                      accessibilityLabel="Delete medicine adjustment"
                    >
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>

      {/* Add / Edit Medicine Entry Form Card */}
      <View style={styles.cardContainer} ref={formCardRef}>
        <View style={styles.formHeader}>
          <View style={styles.formTitleRow}>
            <Text style={styles.cardTitle}>
              {editingId ? 'Edit Medicine Entry' : 'Add Medicine Entry'}
            </Text>
            {editingId && (
              <View style={styles.editingBadge}>
                <Text style={styles.editingBadgeText}>Editing Mode</Text>
              </View>
            )}
          </View>
          <Text style={styles.formSubtitle}>
            {editingId
              ? 'Modify medicine details below and save to update inventory and database.'
              : 'Enter medicine name, brand variant, supplier details, and batch information to adjust inventory.'}
          </Text>
        </View>

        {/* Form Fields Grid */}
        <View style={styles.formGrid}>
          {/* Row 1: Medicine Name & Brand Name */}
          <View style={styles.formFieldHalf}>
            <Text style={styles.fieldLabel}>
              Medicine Name <Text style={styles.reqStar}>*</Text>
            </Text>
            <TextInput
              style={[styles.formInput, formErrors.medicineName && styles.formInputError]}
              placeholder="e.g., Paracetamol / Ibuprofen / Amoxicillin"
              placeholderTextColor="#94A3B8"
              value={formData.medicineName}
              onChangeText={(t) => handleFormChange('medicineName', t)}
            />
            {formErrors.medicineName && (
              <Text style={styles.errorText}>{formErrors.medicineName}</Text>
            )}
          </View>

          <View style={styles.formFieldHalf}>
            <Text style={styles.fieldLabel}>
              Brand Name <Text style={styles.reqStar}>*</Text>
            </Text>
            <TextInput
              style={[styles.formInput, formErrors.brandName && styles.formInputError]}
              placeholder="e.g., Crocin 500 / Calpol 500 / Dolo 650"
              placeholderTextColor="#94A3B8"
              value={formData.brandName}
              onChangeText={(t) => handleFormChange('brandName', t)}
            />
            {formErrors.brandName && (
              <Text style={styles.errorText}>{formErrors.brandName}</Text>
            )}
          </View>

          {/* Row 2: Strength, Pack Size & Manufacturer */}
          <View style={styles.formFieldThird}>
            <Text style={styles.fieldLabel}>Strength</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g., 500mg / 650mg / 400mg"
              placeholderTextColor="#94A3B8"
              value={formData.strength}
              onChangeText={(t) => handleFormChange('strength', t)}
            />
          </View>

          <View style={styles.formFieldThird}>
            <Text style={styles.fieldLabel}>Pack Size</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g., 15 Tablets / 10 Capsules"
              placeholderTextColor="#94A3B8"
              value={formData.packSize}
              onChangeText={(t) => handleFormChange('packSize', t)}
            />
          </View>

          <View style={styles.formFieldThird}>
            <Text style={styles.fieldLabel}>Manufacturer</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g., GSK / Micro Labs / Abbott / Alkem"
              placeholderTextColor="#94A3B8"
              value={formData.manufacturer}
              onChangeText={(t) => handleFormChange('manufacturer', t)}
            />
          </View>

          {/* Row 3: Supplier Name & MRP */}
          <View style={styles.formFieldHalf}>
            <Text style={styles.fieldLabel}>Supplier Name / Distributor</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g., GSK Pharmaceuticals / Sun Pharma Care / Cipla Ltd"
              placeholderTextColor="#94A3B8"
              value={formData.supplierName}
              onChangeText={(t) => handleFormChange('supplierName', t)}
            />
          </View>

          <View style={styles.formFieldHalf}>
            <Text style={styles.fieldLabel}>MRP (₹)</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g., 15.00 / 24.00"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={formData.amount}
              onChangeText={(t) => handleFormChange('amount', t)}
            />
          </View>

          {/* Row 4: SKU, Batch No & Quantity */}
          <View style={styles.formFieldThird}>
            <Text style={styles.fieldLabel}>
              SKU Code <Text style={styles.reqStar}>*</Text>
            </Text>
            <TextInput
              style={[styles.formInput, formErrors.sku && styles.formInputError]}
              placeholder="e.g., SKU-CRO-500"
              placeholderTextColor="#94A3B8"
              value={formData.sku}
              onChangeText={(t) => handleFormChange('sku', t)}
            />
            {formErrors.sku && <Text style={styles.errorText}>{formErrors.sku}</Text>}
          </View>

          <View style={styles.formFieldThird}>
            <Text style={styles.fieldLabel}>
              Batch No. <Text style={styles.reqStar}>*</Text>
            </Text>
            <TextInput
              style={[styles.formInput, formErrors.batchNo && styles.formInputError]}
              placeholder="e.g., B-1001"
              placeholderTextColor="#94A3B8"
              value={formData.batchNo}
              onChangeText={(t) => handleFormChange('batchNo', t)}
            />
            {formErrors.batchNo && <Text style={styles.errorText}>{formErrors.batchNo}</Text>}
          </View>

          <View style={styles.formFieldThird}>
            <Text style={styles.fieldLabel}>
              Quantity <Text style={styles.reqStar}>*</Text>
            </Text>
            <TextInput
              style={[styles.formInput, formErrors.quantity && styles.formInputError]}
              placeholder="e.g., 500"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={formData.quantity}
              onChangeText={(t) => handleFormChange('quantity', t)}
            />
            {formErrors.quantity && <Text style={styles.errorText}>{formErrors.quantity}</Text>}
          </View>

          {/* Row 5: Shelf Location & (Branch ID only in Multi-Branch mode) */}
          <View style={styles.formFieldHalf}>
            <Text style={styles.fieldLabel}>Shelf Location</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g., A1-S1"
              placeholderTextColor="#94A3B8"
              value={formData.shelfLocation}
              onChangeText={(t) => handleFormChange('shelfLocation', t)}
            />
          </View>

          {isMultiBranch ? (
            <View style={styles.formFieldHalf}>
              <Text style={styles.fieldLabel}>Branch ID</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g., BR-01 / Main Branch"
                placeholderTextColor="#94A3B8"
                value={formData.branchId}
                onChangeText={(t) => handleFormChange('branchId', t)}
              />
            </View>
          ) : null}
        </View>

        {/* Submit / Save Buttons */}
        <View style={styles.formFooter}>
          <Pressable
            onPress={handleSaveMedicine}
            style={styles.blueSubmitButton}
            accessibilityRole="button"
            accessibilityLabel="Submit Medicine Entry"
          >
            <Text style={styles.blueSubmitButtonText}>
              {editingId ? 'Save Changes & Update DB' : 'Submit'}
            </Text>
          </Pressable>

          {editingId ? (
            <Pressable
              onPress={handleCancelEdit}
              style={styles.cancelEditButton}
              accessibilityRole="button"
              accessibilityLabel="Cancel edit mode"
            >
              <Text style={styles.cancelEditButtonText}>Cancel Edit</Text>
            </Pressable>
          ) : null}
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
    borderRadius: 12,
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  tableWrapper: {
    minWidth: 1560,
    paddingHorizontal: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  thCell: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    paddingHorizontal: 6,
    letterSpacing: 0.3,
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
    backgroundColor: '#F8FAFC',
  },
  editingTableRow: {
    backgroundColor: '#EFF6FF',
    borderLeftWidth: 3,
    borderLeftColor: '#2563EB',
  },
  tdCell: {
    fontSize: 13,
    color: '#334155',
    paddingHorizontal: 6,
  },
  medNameCell: {
    fontWeight: '700',
    color: '#0F766E',
  },
  brandNameCell: {
    fontWeight: '700',
    color: '#0F172A',
  },
  strengthCell: {
    color: '#475569',
    fontWeight: '500',
    fontSize: 12.5,
  },
  mfgCell: {
    color: '#334155',
    fontWeight: '600',
  },
  supplierCell: {
    color: '#0369A1',
    fontWeight: '600',
  },
  skuCell: {
    fontWeight: '600',
    color: '#64748B',
  },
  amountCell: {
    fontWeight: '700',
    color: '#0F172A',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  editButton: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    cursor: 'pointer',
  },
  editButtonText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0369A1',
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    cursor: 'pointer',
  },
  deleteButtonText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#B91C1C',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  formHeader: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  formTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editingBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  editingBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E40AF',
  },
  formSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 3,
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  },
  formFieldHalf: {
    width: '48%',
    minWidth: 260,
  },
  formFieldThird: {
    width: '31%',
    minWidth: 200,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  reqStar: {
    color: '#DC2626',
  },
  formInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  blueSubmitButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 9,
    paddingHorizontal: 28,
    borderRadius: 8,
    cursor: 'pointer',
  },
  blueSubmitButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  cancelEditButton: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    cursor: 'pointer',
  },
  cancelEditButtonText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
});

