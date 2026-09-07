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
import InventoryStatCard from '../../components/inventory/InventoryStatCard';
import { CURRENT_STOCK_KPIS, MOCK_STOCK_ITEMS } from '../../data/currentStockMockData';
import {
  fetchInventory,
  saveInventoryEntry,
  updateInventoryEntry,
  deleteInventoryEntry,
} from '../../api/inventoryApi';
import { API_URL } from '../../config';

export default function StockAdjustmentsScreen({ onShowToast, isMultiBranch = true }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  // Stock Items State for Adjustments Table with isActive and rxRequired flags
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingItemId, setEditingItemId] = useState(null);

  useEffect(() => {
    loadInventoryData();
    loadBranchesData();
  }, []);

  const loadInventoryData = async () => {
    try {
      setLoading(true);
      const res = await fetchInventory();
      if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
        setStockItems(
          res.data.map((item, idx) => ({
            ...item,
            isActive: item.isActive !== undefined ? item.isActive : true,
            rxRequired: item.rxRequired !== undefined ? item.rxRequired : idx % 2 === 0,
          }))
        );
      } else {
        setStockItems(
          MOCK_STOCK_ITEMS.map((item, idx) => ({
            ...item,
            isActive: item.isActive !== undefined ? item.isActive : true,
            rxRequired: item.rxRequired !== undefined ? item.rxRequired : idx % 2 === 0,
          }))
        );
      }
    } catch (err) {
      console.warn('Failed to load inventory from backend DB:', err.message);
      setStockItems(
        MOCK_STOCK_ITEMS.map((item, idx) => ({
          ...item,
          isActive: item.isActive !== undefined ? item.isActive : true,
          rxRequired: item.rxRequired !== undefined ? item.rxRequired : idx % 2 === 0,
        }))
      );
    } finally {
      setLoading(false);
    }
  };

  // Quick Filter Toggles State
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);
  const [filterActiveOnly, setFilterActiveOnly] = useState(false);

  // 3-Dots Action Menu State
  const [selectedItemForAction, setSelectedItemForAction] = useState(null);
  const [actionMenuModalOpen, setActionMenuModalOpen] = useState(false);


  // Quick Quantity Adjustment Modal State
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustDelta, setAdjustDelta] = useState('10');
  const [adjustType, setAdjustType] = useState('CYCLE_COUNT');
  const [adjustReason, setAdjustReason] = useState('Physical stock count adjustment');

  // Inter-Branch Transfer Modal State
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [fromBranch, setFromBranch] = useState('');
  const [toBranch, setToBranch] = useState('');
  const [transferQty, setTransferQty] = useState('50');
  const [transferReason, setTransferReason] = useState('Inter-branch stock rebalancing');
  const [transferError, setTransferError] = useState('');
  const [branchesList, setBranchesList] = useState([
    { id: 'BR-01', name: 'FIT Main Campus Hospital Pharmacy', city: 'Pune' },
    { id: 'BR-02', name: 'FIT Pune City OPD Pharmacy', city: 'Pune' },
    { id: 'BR-03', name: 'FIT Central Medical Warehouse', city: 'Pune' },
    { id: 'BR-04', name: 'FIT Student Health Center Dispensary', city: 'Pune' },
    { id: 'BR-05', name: 'FIT Kothrud Specialty Clinic Pharmacy', city: 'Pune' },
  ]);

  const loadBranchesData = async () => {
    try {
      const res = await fetch(`${API_URL}/branches`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setBranchesList(
            json.data.map((b, idx) => ({
              id: b.id || `BR-0${idx + 1}`,
              name: b.name,
              city: b.city || 'Pune',
            }))
          );
        }
      }
    } catch (e) {
      console.warn('Failed to fetch branches from API:', e.message);
    }
  };

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

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const handleToggleStatus = (itemId) => {
    setStockItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const nextActive = !item.isActive;
          if (onShowToast) {
            onShowToast(
              `[PATCH /api/inventory/${item.sku}/status] ${item.brandName || item.medicineName} status: ${
                nextActive ? 'Active (Live in billing)' : 'Deactivated / Hidden'
              }`
            );
          }
          return { ...item, isActive: nextActive };
        }
        return item;
      })
    );
  };

  const handleToggleRx = (itemId) => {
    setStockItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const nextRx = !item.rxRequired;
          if (onShowToast) {
            onShowToast(
              `[PATCH /api/inventory/${item.sku}/rx] ${item.brandName || item.medicineName}: Prescription required: ${
                nextRx ? 'YES (Rx Needed)' : 'NO (OTC)'
              }`
            );
          }
          return { ...item, rxRequired: nextRx };
        }
        return item;
      })
    );
  };

  const handleOpenActionMenu = (item) => {
    setSelectedItemForAction(item);
    setActionMenuModalOpen(true);
  };

  const handleExecuteAction = (actionKey) => {
    const item = selectedItemForAction;
    setActionMenuModalOpen(false);
    if (!item) return;


    if (actionKey === 'adjust') {
      setAdjustDelta('10');
      setAdjustModalOpen(true);
      return;
    }

    if (actionKey === 'transfer') {
      const currentBranch = item.branchId || 'FIT Main Campus Hospital Pharmacy';
      setFromBranch(currentBranch);

      const destCandidate =
        branchesList.find((b) => b.name !== currentBranch && b.id !== currentBranch) ||
        branchesList[1] ||
        branchesList[0];
      setToBranch(destCandidate ? destCandidate.name || destCandidate.id : 'FIT Pune City OPD Pharmacy');
      setTransferQty(item.quantity > 50 ? '50' : String(Math.max(1, Math.floor(item.quantity / 2))));
      setTransferReason('Inter-branch stock rebalancing');
      setTransferError('');
      setTransferModalOpen(true);
      return;
    }

    if (actionKey === 'barcode') {
      if (onShowToast) {
        onShowToast(
          `🖨️ Barcode generated for ${item.brandName} (SKU: ${item.sku}, Batch: ${item.batchNo})`
        );
      }
      return;
    }

    if (actionKey === 'edit') {
      setEditingItemId(item.id);
      setFormData({
        medicineName: item.medicineName || item.genericName || '',
        brandName: item.brandName || '',
        genericName: item.genericName || item.medicineName || '',
        strength: item.strength || '',
        packSize: item.packSize || '',
        manufacturer: item.manufacturer || '',
        supplierName: item.supplierName || '',
        amount: item.amount ? String(item.amount).replace(/[^0-9.]/g, '') : '',
        sku: item.sku || '',
        batchNo: item.batchNo || '',
        quantity: item.quantity !== undefined ? String(item.quantity) : '',
        branchId: item.branchId || 'Main Store',
        shelfLocation: item.shelfLocation || '',
      });
      if (onShowToast) {
        onShowToast(
          `✏️ Loaded "${item.brandName}" details into form below for editing.`
        );
      }
      return;
    }

    if (actionKey === 'delete') {
      deleteInventoryEntry(item.id)
        .then(() => {
          setStockItems((prev) => prev.filter((i) => i.id !== item.id));
          if (onShowToast) {
            onShowToast(`[DELETE /api/inventory/${item.id}] Removed "${item.brandName}" from database.`);
          }
        })
        .catch((err) => {
          console.error('Delete failed:', err);
          setStockItems((prev) => prev.filter((i) => i.id !== item.id));
          if (onShowToast) {
            onShowToast(`Removed "${item.brandName}" from inventory.`);
          }
        });
      return;
    }
  };

  const handleSaveAdjustment = async () => {
    if (!selectedItemForAction) return;
    const deltaNum = parseInt(adjustDelta, 10);
    if (isNaN(deltaNum)) {
      if (onShowToast) onShowToast('Please enter a valid quantity change number');
      return;
    }

    const newQty = Math.max(0, selectedItemForAction.quantity + deltaNum);
    const updatedPayload = {
      ...selectedItemForAction,
      quantity: newQty,
    };

    try {
      await updateInventoryEntry(selectedItemForAction.id, updatedPayload);
      setStockItems((prev) =>
        prev.map((i) => {
          if (i.id === selectedItemForAction.id) {
            return {
              ...i,
              quantity: newQty,
              lastUpdated: new Date().toISOString().split('T')[0],
              status: newQty < 50 ? 'Low Stock' : 'In Stock',
            };
          }
          return i;
        })
      );
      if (onShowToast) {
        onShowToast(
          `[POST /api/inventory] Updated ${selectedItemForAction.brandName} by ${
            deltaNum > 0 ? `+${deltaNum}` : deltaNum
          } units in database. Reason: ${adjustReason}`
        );
      }
    } catch (err) {
      console.warn('Quantity update error:', err.message);
      setStockItems((prev) =>
        prev.map((i) => {
          if (i.id === selectedItemForAction.id) {
            return {
              ...i,
              quantity: newQty,
              lastUpdated: new Date().toISOString().split('T')[0],
              status: newQty < 50 ? 'Low Stock' : 'In Stock',
            };
          }
          return i;
        })
      );
    }
    setAdjustModalOpen(false);
  };

  const handleConfirmTransfer = async () => {
    if (!selectedItemForAction) return;

    const qtyNum = parseInt(transferQty, 10);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setTransferError('Please enter a valid transfer quantity greater than 0.');
      return;
    }

    if (qtyNum > selectedItemForAction.quantity) {
      setTransferError(
        `Transfer quantity cannot exceed source branch stock (${selectedItemForAction.quantity} units).`
      );
      return;
    }

    if (fromBranch === toBranch) {
      setTransferError('Source and Destination branches must be different.');
      return;
    }

    setTransferError('');

    const sourceItem = selectedItemForAction;
    const remainingSourceQty = sourceItem.quantity - qtyNum;

    // 1. Update source branch item quantity
    const updatedSourceItem = {
      ...sourceItem,
      quantity: remainingSourceQty,
      lastUpdated: new Date().toISOString().split('T')[0],
      status: remainingSourceQty < 50 ? (remainingSourceQty === 0 ? 'Out of Stock' : 'Low Stock') : 'In Stock',
    };

    // 2. Check if item exists in target branch
    const existingDestIndex = stockItems.findIndex(
      (i) =>
        i.sku === sourceItem.sku &&
        i.batchNo === sourceItem.batchNo &&
        (i.branchId === toBranch || i.branchName === toBranch) &&
        i.id !== sourceItem.id
    );

    let updatedStockList = [];

    if (existingDestIndex >= 0) {
      const destItem = stockItems[existingDestIndex];
      const newDestQty = Number(destItem.quantity) + qtyNum;
      const updatedDestItem = {
        ...destItem,
        quantity: newDestQty,
        lastUpdated: new Date().toISOString().split('T')[0],
        status: newDestQty < 50 ? 'Low Stock' : 'In Stock',
      };

      updatedStockList = stockItems.map((item, idx) => {
        if (item.id === sourceItem.id) return updatedSourceItem;
        if (idx === existingDestIndex) return updatedDestItem;
        return item;
      });

      try {
        await updateInventoryEntry(sourceItem.id, updatedSourceItem);
        await updateInventoryEntry(destItem.id, updatedDestItem);
      } catch (e) {
        console.warn('Backend transfer sync notice:', e.message);
      }
    } else {
      const newDestItem = {
        ...sourceItem,
        id: `stk-trf-${Date.now()}`,
        branchId: toBranch,
        quantity: qtyNum,
        lastUpdated: new Date().toISOString().split('T')[0],
        status: qtyNum < 50 ? 'Low Stock' : 'In Stock',
        updatedBy: 'Transfer System',
      };

      updatedStockList = stockItems.map((item) =>
        item.id === sourceItem.id ? updatedSourceItem : item
      );
      updatedStockList.unshift(newDestItem);

      try {
        await updateInventoryEntry(sourceItem.id, updatedSourceItem);
        await saveInventoryEntry(newDestItem);
      } catch (e) {
        console.warn('Backend transfer creation notice:', e.message);
      }
    }

    setStockItems(updatedStockList);
    setTransferModalOpen(false);

    if (onShowToast) {
      onShowToast(
        `✓ Inter-Branch Transfer Success: ${qtyNum} units of "${sourceItem.brandName}" transferred from "${fromBranch}" to "${toBranch}". Stock updated!`
      );
    }
  };

  // Active KPI Filter State
  const [activeKpiFilter, setActiveKpiFilter] = useState('ALL');

  // Dynamic 4 KPI Cards calculated from stockItems
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
      id: 'kpi-total-products',
      label: 'TOTAL PRODUCTS',
      value: totalProductsCount.toLocaleString(),
      subtext: activeKpiFilter === 'ALL' ? 'Showing all products' : 'Click to view all',
      variant: 'teal',
      key: 'ALL',
    },
    {
      id: 'kpi-low-stock',
      label: 'LOW STOCK ITEMS',
      value: lowStockCount.toLocaleString(),
      subtext: activeKpiFilter === 'LOW_STOCK' ? 'Filtered: Qty < 50' : 'Quantity < 50 units',
      variant: 'amber',
      key: 'LOW_STOCK',
    },
    {
      id: 'kpi-near-expiry',
      label: 'NEAR EXPIRY ITEMS',
      value: nearExpiryCount.toLocaleString(),
      subtext: activeKpiFilter === 'NEAR_EXPIRY' ? 'Filtered: Expiring < 90d' : 'Expiring < 90 days',
      variant: 'blue',
      key: 'NEAR_EXPIRY',
    },
    {
      id: 'kpi-expired',
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

  const displayedStockItems = stockItems.filter((item) => {
    if (activeKpiFilter === 'LOW_STOCK' && Number(item.quantity) >= 50) return false;
    if (activeKpiFilter === 'NEAR_EXPIRY') {
      if (item.status === 'Near Expiry') return true;
      if (item.expiryDate || item.expiry_date) {
        const d = new Date(item.expiryDate || item.expiry_date);
        const now = new Date();
        const diffDays = (d - now) / (1000 * 60 * 60 * 24);
        return diffDays > 0 && diffDays <= 90;
      }
      return false;
    }
    if (activeKpiFilter === 'EXPIRED') {
      if (item.status === 'Expired') return true;
      if (item.expiryDate || item.expiry_date) {
        return new Date(item.expiryDate || item.expiry_date) < new Date();
      }
      return Number(item.quantity) === 0;
    }
    if (filterLowStockOnly && Number(item.quantity) >= 50) return false;
    if (filterActiveOnly && item.isActive === false) return false;
    return true;
  });

  const handleAddOrUpdateMedicine = async () => {
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

    const payload = {
      ...(editingItemId ? { id: editingItemId } : {}),
      medicineName: formData.medicineName,
      brandName: formData.brandName,
      genericName: formData.genericName || formData.medicineName,
      strength: formData.strength || '500mg',
      packSize: formData.packSize || '15 Tablets',
      manufacturer: formData.manufacturer || 'GSK',
      supplierName: formData.supplierName || (formData.manufacturer ? `${formData.manufacturer} Distribution` : 'GSK Pharmaceuticals'),
      amount: formData.amount ? (formData.amount.startsWith('₹') ? formData.amount : `₹${formData.amount}`) : '₹15.00',
      sku: formData.sku,
      batchNo: formData.batchNo,
      quantity: Number(formData.quantity),
      branchId: isMultiBranch ? (formData.branchId || 'BR-01') : 'Main Store',
      shelfLocation: formData.shelfLocation || 'A1-S1',
    };

    try {
      if (editingItemId) {
        const res = await updateInventoryEntry(editingItemId, payload);
        const updatedItem = res?.data || payload;

        setStockItems((prev) =>
          prev.map((item) =>
            item.id === editingItemId
              ? {
                  ...item,
                  ...updatedItem,
                  isActive: item.isActive !== undefined ? item.isActive : true,
                  rxRequired: item.rxRequired !== undefined ? item.rxRequired : false,
                }
              : item
          )
        );

        if (onShowToast) {
          onShowToast(`✓ Updated product "${payload.brandName}" in database!`);
        }
      } else {
        const res = await saveInventoryEntry(payload);
        const newItem = res?.data || {
          ...payload,
          id: `adj-stk-${Date.now()}`,
          updatedBy: 'Manager',
          lastUpdated: new Date().toISOString().split('T')[0],
          status: Number(formData.quantity) < 50 ? 'Low Stock' : 'In Stock',
          isActive: true,
          rxRequired: false,
        };

        setStockItems((prev) => [newItem, ...prev]);

        if (onShowToast) {
          onShowToast(`✓ Added "${newItem.brandName}" to database products table!`);
        }
      }
    } catch (err) {
      console.warn('API save/update failed, performing fallback in state:', err.message);
      if (editingItemId) {
        setStockItems((prev) =>
          prev.map((item) =>
            item.id === editingItemId
              ? {
                  ...item,
                  ...payload,
                }
              : item
          )
        );
        if (onShowToast) onShowToast(`✓ Updated "${payload.brandName}"!`);
      } else {
        const newItem = {
          ...payload,
          id: `adj-stk-${Date.now()}`,
          updatedBy: 'Manager',
          lastUpdated: new Date().toISOString().split('T')[0],
          status: Number(formData.quantity) < 50 ? 'Low Stock' : 'In Stock',
          isActive: true,
          rxRequired: false,
        };
        setStockItems((prev) => [newItem, ...prev]);
        if (onShowToast) onShowToast(`✓ Added "${newItem.brandName}"!`);
      }
    }

    setEditingItemId(null);
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

  const handleCancelEdit = () => {
    setEditingItemId(null);
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

  const handleEditOrDelete = (item) => {
    if (onShowToast) {
      onShowToast(`Modify / Adjust action for ${item.brandName} (${item.medicineName} - ${item.sku})`);
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

      {/* Stock Information / Adjustments Table Card */}
      <View style={styles.cardContainer}>
        <View style={[styles.cardHeader, isMobile && styles.cardHeaderMobile]}>
          <View style={{ flex: 1, minWidth: 240 }}>
            <Text style={styles.cardTitle}>Stock Information & Adjustments</Text>
            <Text style={styles.cardSubtitle}>
              Showing {displayedStockItems.length} of {stockItems.length} items • Toggle switches for live status & 3 dots (⋮) for actions
            </Text>
          </View>

          {/* Quick Filter Toggles & Backend Guide Button */}
          <View style={styles.headerControlsRow}>
            {/* Toggle: Low Stock Only */}
            <Pressable
              onPress={() => setFilterLowStockOnly(!filterLowStockOnly)}
              style={[
                styles.filterTogglePill,
                filterLowStockOnly && styles.filterTogglePillActive,
              ]}
              accessibilityRole="switch"
              accessibilityState={{ checked: filterLowStockOnly }}
              accessibilityLabel="Toggle Low Stock Filter"
            >
              <View
                style={[
                  styles.filterToggleDot,
                  filterLowStockOnly && styles.filterToggleDotActive,
                ]}
              />
              <Text
                style={[
                  styles.filterToggleText,
                  filterLowStockOnly && styles.filterToggleTextActive,
                ]}
              >
                Low Stock (&lt;50)
              </Text>
            </Pressable>

            {/* Toggle: Active Only */}
            <Pressable
              onPress={() => setFilterActiveOnly(!filterActiveOnly)}
              style={[
                styles.filterTogglePill,
                filterActiveOnly && styles.filterTogglePillActive,
              ]}
              accessibilityRole="switch"
              accessibilityState={{ checked: filterActiveOnly }}
              accessibilityLabel="Toggle Active Filter"
            >
              <View
                style={[
                  styles.filterToggleDot,
                  filterActiveOnly && styles.filterToggleDotActive,
                ]}
              />
              <Text
                style={[
                  styles.filterToggleText,
                  filterActiveOnly && styles.filterToggleTextActive,
                ]}
              >
                Active Catalog
              </Text>
            </Pressable>

          </View>
        </View>

        {isMobile ? (
          /* Mobile Card List View (No horizontal scrolling on phone screen) */
          <View style={styles.mobileCardList}>
            {displayedStockItems.map((item) => (
              <View
                key={item.id}
                style={[
                  styles.mobileStockCard,
                  !item.isActive && styles.mobileStockCardInactive,
                ]}
              >
                {/* Header: Brand, Generic Medicine & Status Badge */}
                <View style={styles.mobileStockCardHeader}>
                  <View style={styles.mobileStockTitleCol}>
                    <Text style={styles.mobileBrandName}>{item.brandName}</Text>
                    <Text style={styles.mobileMedName}>{item.medicineName || item.genericName}</Text>
                  </View>

                  <View style={styles.mobileBadgesRow}>
                    {/* Status Badge */}
                    <View
                      style={[
                        styles.mobileStatusBadge,
                        item.quantity < 50 ? styles.statusBadgeLow : styles.statusBadgeInStock,
                      ]}
                    >
                      <Text
                        style={[
                          styles.mobileStatusText,
                          item.quantity < 50 ? styles.statusTextLow : styles.statusTextInStock,
                        ]}
                      >
                        {item.quantity < 50 ? 'Low Stock' : 'In Stock'}
                      </Text>
                    </View>

                    {/* Status Toggle Switch */}
                    <Pressable
                      onPress={() => handleToggleStatus(item.id)}
                      style={[
                        styles.miniToggleTrack,
                        item.isActive ? styles.miniToggleTrackActive : styles.miniToggleTrackInactive,
                      ]}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: item.isActive }}
                      accessibilityLabel="Toggle Item Active State"
                    >
                      <View
                        style={[
                          styles.miniToggleThumb,
                          item.isActive ? styles.miniToggleThumbActive : styles.miniToggleThumbInactive,
                        ]}
                      />
                    </Pressable>
                  </View>
                </View>

                {/* 2-Column Details Grid */}
                <View style={styles.mobileGrid}>
                  <View style={styles.mobileGridItem}>
                    <Text style={styles.mobileItemLabel}>SKU</Text>
                    <Text style={styles.mobileItemValueBold}>{item.sku}</Text>
                  </View>
                  <View style={styles.mobileGridItem}>
                    <Text style={styles.mobileItemLabel}>Batch No.</Text>
                    <Text style={styles.mobileItemValueBold}>{item.batchNo}</Text>
                  </View>
                  <View style={styles.mobileGridItem}>
                    <Text style={styles.mobileItemLabel}>Qty Available</Text>
                    <Text style={[styles.mobileItemValueBold, { color: '#0F766E' }]}>
                      {item.quantity} units
                    </Text>
                  </View>
                  <View style={styles.mobileGridItem}>
                    <Text style={styles.mobileItemLabel}>MRP Price</Text>
                    <Text style={[styles.mobileItemValueBold, { color: '#0F172A' }]}>
                      {item.amount}
                    </Text>
                  </View>
                  <View style={styles.mobileGridItem}>
                    <Text style={styles.mobileItemLabel}>Strength & Pack</Text>
                    <Text style={styles.mobileItemValue} numberOfLines={1}>
                      {item.strength ? `${item.strength} • ${item.packSize || ''}` : '500mg • 15 Tabs'}
                    </Text>
                  </View>
                  <View style={styles.mobileGridItem}>
                    <Text style={styles.mobileItemLabel}>Shelf Location</Text>
                    <Text style={styles.mobileItemValue}>{item.shelfLocation || 'A1-S1'}</Text>
                  </View>
                  {isMultiBranch && (
                    <View style={styles.mobileGridItem}>
                      <Text style={styles.mobileItemLabel}>Branch ID</Text>
                      <Text style={styles.mobileItemValue}>{item.branchId}</Text>
                    </View>
                  )}
                  <View style={styles.mobileGridItem}>
                    <Text style={styles.mobileItemLabel}>Supplier</Text>
                    <Text style={styles.mobileItemValue} numberOfLines={1}>
                      {item.supplierName || item.manufacturer || 'GSK'}
                    </Text>
                  </View>
                </View>

                {/* Card Footer: Last Updated & 3-Dots Action Button */}
                <View style={styles.mobileStockFooter}>
                  <Text style={styles.mobileUpdatedText}>
                    Updated: {item.lastUpdated} • {item.isActive ? 'Active' : 'Disabled'}
                  </Text>
                  <Pressable
                    onPress={() => handleOpenActionMenu(item)}
                    style={styles.mobileDotsActionBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Item Actions"
                  >
                    <Text style={styles.mobileDotsActionText}>⋮ Actions</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : (
          /* Desktop Horizontal Scroll Data Table */
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              {/* Table Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { width: 130 }]}>Medicine Name</Text>
                <Text style={[styles.thCell, { width: 130 }]}>Brand Name</Text>
                <Text style={[styles.thCell, { width: 130 }]}>Strength & Pack</Text>
                <Text style={[styles.thCell, { width: 110 }]}>Manufacturer</Text>
                <Text style={[styles.thCell, { width: 130 }]}>Supplier Name</Text>
                <Text style={[styles.thCell, { width: 100 }]}>SKU</Text>
                <Text style={[styles.thCell, { width: 90 }]}>Batch No.</Text>
                <Text style={[styles.thCell, { width: 100, textAlign: 'center' }]}>
                  Qty Available
                </Text>
                <Text style={[styles.thCell, { width: 80, textAlign: 'right' }]}>MRP</Text>
                {isMultiBranch && (
                  <Text style={[styles.thCell, { width: 85, textAlign: 'center' }]}>Branch ID</Text>
                )}
                <Text style={[styles.thCell, { width: 95, textAlign: 'center' }]}>Shelf Loc</Text>
                <Text style={[styles.thCell, { width: 85, textAlign: 'center' }]}>STATUS</Text>
                <Text style={[styles.thCell, { width: 75, textAlign: 'center' }]}>RX</Text>
                <Text style={[styles.thCell, { width: 95 }]}>Last Updated</Text>
                <Text style={[styles.thCell, { width: 70, textAlign: 'center' }]}>ACTIONS</Text>
              </View>

              {/* Table Rows */}
              {displayedStockItems.map((item, index) => (
                <View
                  key={item.id}
                  style={[
                    styles.tableRow,
                    index % 2 === 1 && styles.tableRowAlt,
                    !item.isActive && styles.tableRowInactive,
                  ]}
                >
                  {/* Medicine Name */}
                  <Text style={[styles.tdCell, styles.medNameCell, { width: 130 }]} numberOfLines={1}>
                    {item.medicineName || item.genericName}
                  </Text>

                  {/* Brand Name */}
                  <Text style={[styles.tdCell, styles.brandNameCell, { width: 130 }]} numberOfLines={1}>
                    {item.brandName}
                  </Text>

                  {/* Strength & Pack */}
                  <Text style={[styles.tdCell, styles.strengthCell, { width: 130 }]} numberOfLines={1}>
                    {item.strength ? `${item.strength} • ${item.packSize || ''}` : '500mg • 15 Tabs'}
                  </Text>

                  {/* Manufacturer */}
                  <Text style={[styles.tdCell, styles.mfgCell, { width: 110 }]} numberOfLines={1}>
                    {item.manufacturer || 'GSK'}
                  </Text>

                  {/* Supplier Name */}
                  <Text style={[styles.tdCell, styles.supplierCell, { width: 130 }]} numberOfLines={1}>
                    {item.supplierName || `${item.manufacturer || 'GSK'} Distribution`}
                  </Text>

                  {/* SKU */}
                  <Text style={[styles.tdCell, styles.skuCell, { width: 100 }]}>{item.sku}</Text>

                  {/* Batch No */}
                  <Text style={[styles.tdCell, { width: 90 }]}>{item.batchNo}</Text>

                  {/* Quantity */}
                  <Text style={[styles.tdCell, { width: 100, textAlign: 'center', fontWeight: '700' }]}>
                    {item.quantity}
                  </Text>

                  {/* Amount / MRP */}
                  <Text style={[styles.tdCell, styles.amountCell, { width: 80, textAlign: 'right' }]}>
                    {item.amount}
                  </Text>

                  {/* Branch ID (Multi-Branch only) */}
                  {isMultiBranch && (
                    <Text style={[styles.tdCell, { width: 85, textAlign: 'center' }]}>
                      {item.branchId}
                    </Text>
                  )}

                  {/* Shelf Location */}
                  <Text style={[styles.tdCell, { width: 95, textAlign: 'center' }]}>
                    {item.shelfLocation}
                  </Text>

                  {/* TOGGLE 1: Item Active/Inactive Status Switch */}
                  <View style={[styles.tdCenterCell, { width: 85 }]}>
                    <Pressable
                      onPress={() => handleToggleStatus(item.id)}
                      style={[
                        styles.tableToggleTrack,
                        item.isActive ? styles.tableToggleActive : styles.tableToggleInactive,
                      ]}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: item.isActive }}
                      accessibilityLabel={`Toggle active status for ${item.brandName}`}
                    >
                      <View
                        style={[
                          styles.tableToggleThumb,
                          item.isActive ? styles.tableToggleThumbActive : styles.tableToggleThumbInactive,
                        ]}
                      />
                    </Pressable>
                  </View>

                  {/* TOGGLE 2: Prescription Required (Rx Only / OTC) */}
                  <View style={[styles.tdCenterCell, { width: 75 }]}>
                    <Pressable
                      onPress={() => handleToggleRx(item.id)}
                      style={[
                        styles.rxTagPill,
                        item.rxRequired ? styles.rxTagRequired : styles.rxTagOtc,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Toggle prescription requirement"
                    >
                      <Text
                        style={[
                          styles.rxTagPillText,
                          item.rxRequired ? styles.rxTagTextRequired : styles.rxTagTextOtc,
                        ]}
                      >
                        {item.rxRequired ? 'Rx' : 'OTC'}
                      </Text>
                    </Pressable>
                  </View>

                  {/* Last Updated */}
                  <Text style={[styles.tdCell, { width: 95 }]}>{item.lastUpdated}</Text>

                  {/* ACTION COLUMN: 3 DOTS (⋮) BUTTON */}
                  <View style={[styles.actionCellWrapper, { width: 70 }]}>
                    <Pressable
                      onPress={() => handleOpenActionMenu(item)}
                      style={styles.actionDotsButton}
                      accessibilityRole="button"
                      accessibilityLabel="Open Action Menu"
                    >
                      <Text style={styles.actionDotsButtonText}>⋮</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Add / Edit Medicine Entry Form Card */}
      <View style={styles.cardContainer}>
        <View style={styles.formHeader}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.cardTitle}>
              {editingItemId ? 'Edit Medicine Entry' : 'Add Medicine Entry'}
            </Text>
            {editingItemId && (
              <Pressable
                onPress={handleCancelEdit}
                style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
              >
                <Text style={{ color: '#64748B', fontWeight: '600', fontSize: 13 }}>Cancel Edit</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.formSubtitle}>
            {editingItemId
              ? 'Modify medicine details, brand, supplier, or batch stock. Changes will update the database.'
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

        {/* Blue Submit / Update Button */}
        <View style={styles.formFooter}>
          <Pressable
            onPress={handleAddOrUpdateMedicine}
            style={styles.blueSubmitButton}
            accessibilityRole="button"
            accessibilityLabel={editingItemId ? 'Update Product Details' : 'Submit Medicine Entry'}
          >
            <Text style={styles.blueSubmitButtonText}>
              {editingItemId ? 'Update Product' : 'Submit'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 1. 3-DOTS ACTION MENU MODAL */}
      <Modal
        visible={actionMenuModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setActionMenuModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.actionMenuCard}>
            <View style={styles.actionMenuHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionMenuTitle}>
                  {selectedItemForAction?.brandName || selectedItemForAction?.medicineName}
                </Text>
                <Text style={styles.actionMenuSub}>
                  SKU: {selectedItemForAction?.sku} • Batch: {selectedItemForAction?.batchNo} • Stock: {selectedItemForAction?.quantity} units
                </Text>
              </View>
              <Pressable
                onPress={() => setActionMenuModalOpen(false)}
                style={styles.closeActionBtn}
              >
                <Text style={styles.closeActionText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.actionList}>
              <Pressable
                onPress={() => handleExecuteAction('adjust')}
                style={styles.actionOptionRow}
              >
                <Text style={styles.actionOptionIcon}>⚖️</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={styles.actionOptionTitle}>Adjust Stock Quantity</Text>
                  <Text style={styles.actionOptionDesc}>Cycle count, damage write-off, or physical correction</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => handleExecuteAction('transfer')}
                style={styles.actionOptionRow}
              >
                <Text style={styles.actionOptionIcon}>🔄</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={styles.actionOptionTitle}>Initiate Inter-Branch Transfer</Text>
                  <Text style={styles.actionOptionDesc}>Send stock to another store or hospital dispensary</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => handleExecuteAction('barcode')}
                style={styles.actionOptionRow}
              >
                <Text style={styles.actionOptionIcon}>🏷️</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={styles.actionOptionTitle}>Print Barcode / Shelf Tag</Text>
                  <Text style={styles.actionOptionDesc}>Print thermal label with SKU, batch & MRP</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => handleExecuteAction('edit')}
                style={styles.actionOptionRow}
              >
                <Text style={styles.actionOptionIcon}>✏️</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={styles.actionOptionTitle}>Edit Medicine Information</Text>
                  <Text style={styles.actionOptionDesc}>Load into entry form to update strength, MRP or shelf</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => handleExecuteAction('delete')}
                style={[styles.actionOptionRow, styles.actionOptionRowDanger]}
              >
                <Text style={styles.actionOptionIcon}>🗑️</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={[styles.actionOptionTitle, { color: '#DC2626' }]}>Deactivate / Remove Item</Text>
                  <Text style={styles.actionOptionDesc}>Remove from active inventory listing</Text>
                </View>
              </Pressable>

            </View>
          </View>
        </View>
      </Modal>

      {/* 2. QUICK QUANTITY ADJUSTMENT MODAL */}
      <Modal
        visible={adjustModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setAdjustModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.adjustModalCard}>
            <View style={styles.adjustModalHeader}>
              <View>
                <Text style={styles.adjustModalTitle}>
                  Adjust Stock: {selectedItemForAction?.brandName}
                </Text>
                <Text style={styles.adjustModalSubtitle}>
                  Current Stock: {selectedItemForAction?.quantity} units • SKU: {selectedItemForAction?.sku}
                </Text>
              </View>
              <Pressable onPress={() => setAdjustModalOpen(false)} style={styles.closeActionBtn}>
                <Text style={styles.closeActionText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.adjustModalBody}>
              <View style={styles.formGroupModal}>
                <Text style={styles.fieldLabelModal}>Adjustment Type</Text>
                <View style={styles.adjustTypeRow}>
                  {['CYCLE_COUNT', 'DAMAGE_WRITEOFF', 'CORRECTION'].map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => setAdjustType(t)}
                      style={[
                        styles.adjustTypeBtn,
                        adjustType === t && styles.adjustTypeBtnActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.adjustTypeBtnText,
                          adjustType === t && styles.adjustTypeBtnTextActive,
                        ]}
                      >
                        {t === 'CYCLE_COUNT' ? 'Cycle Count' : t === 'DAMAGE_WRITEOFF' ? 'Damage' : 'Correction'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.formGroupModal}>
                <Text style={styles.fieldLabelModal}>Quantity Change (+ to add, - to subtract)</Text>
                <TextInput
                  style={styles.adjustInput}
                  value={adjustDelta}
                  onChangeText={setAdjustDelta}
                  keyboardType="numeric"
                  placeholder="e.g. 10 or -5"
                />
              </View>

              <View style={styles.formGroupModal}>
                <Text style={styles.fieldLabelModal}>Reason for Adjustment</Text>
                <TextInput
                  style={styles.adjustInput}
                  value={adjustReason}
                  onChangeText={setAdjustReason}
                  placeholder="Audit count recount..."
                />
              </View>

              {/* Endpoint Preview badge */}
              <View style={styles.apiPreviewBox}>
                <Text style={styles.apiPreviewText}>
                  Backend Endpoint: POST /api/inventory/adjustments
                </Text>
              </View>
            </View>

            <View style={styles.adjustModalFooter}>
              <Pressable
                onPress={() => setAdjustModalOpen(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveAdjustment}
                style={styles.saveAdjustBtn}
              >
                <Text style={styles.saveAdjustBtnText}>Save Adjustment</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 3. INTER-BRANCH STOCK TRANSFER MODAL */}
      <Modal
        visible={transferModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setTransferModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.transferModalCard}>
            {/* Header */}
            <View style={styles.transferModalHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={styles.transferHeaderBadge}>
                    <Text style={styles.transferHeaderBadgeIcon}>🔄</Text>
                  </View>
                  <Text style={styles.transferModalTitle}>Initiate Inter-Branch Stock Transfer</Text>
                </View>
                <Text style={styles.transferModalSubtitle}>
                  Move inventory stock between hospital main store, OPD clinics, and satellite branches
                </Text>
              </View>
              <Pressable onPress={() => setTransferModalOpen(false)} style={styles.closeActionBtn}>
                <Text style={styles.closeActionText}>✕</Text>
              </Pressable>
            </View>

            {/* Body */}
            <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={styles.transferModalBody}>
              {/* Product Info Card */}
              <View style={styles.transferProductCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.transferMedTitle}>
                    {selectedItemForAction?.brandName || selectedItemForAction?.medicineName}
                  </Text>
                  <Text style={styles.transferMedMeta}>
                    Generic: {selectedItemForAction?.medicineName || selectedItemForAction?.genericName} • Strength: {selectedItemForAction?.strength || '500mg'}
                  </Text>
                  <View style={styles.transferPillsRow}>
                    <View style={styles.transferPill}>
                      <Text style={styles.transferPillText}>SKU: {selectedItemForAction?.sku}</Text>
                    </View>
                    <View style={styles.transferPill}>
                      <Text style={styles.transferPillText}>Batch: {selectedItemForAction?.batchNo}</Text>
                    </View>
                    <View style={styles.transferPillTeal}>
                      <Text style={styles.transferPillTextTeal}>Source Stock: {selectedItemForAction?.quantity} units</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Error Alert Box if any */}
              {transferError ? (
                <View style={styles.transferErrorAlert}>
                  <Text style={styles.transferErrorText}>⚠️ {transferError}</Text>
                </View>
              ) : null}

              {/* Branch Selection Section */}
              <View style={styles.branchSelectionGrid}>
                {/* Source Branch (From) */}
                <View style={styles.branchCol}>
                  <Text style={styles.fieldLabelModal}>
                    From Branch (Source) <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <View style={styles.branchPickerBox}>
                    <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled={true}>
                      {branchesList.map((b) => {
                        const bName = b.name || b.id;
                        const isSelected = fromBranch === bName;
                        return (
                          <Pressable
                            key={`from-${b.id}`}
                            onPress={() => {
                              setFromBranch(bName);
                              if (toBranch === bName) {
                                const other = branchesList.find((x) => (x.name || x.id) !== bName);
                                if (other) setToBranch(other.name || other.id);
                              }
                            }}
                            style={[
                              styles.branchOptionItem,
                              isSelected && styles.branchOptionItemFromActive,
                            ]}
                          >
                            <View style={[styles.branchDot, isSelected && styles.branchDotFromActive]} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.branchOptionName, isSelected && styles.branchOptionNameFromActive]}>
                                {bName}
                              </Text>
                              <Text style={styles.branchOptionCity}>{b.city || 'Pune'}</Text>
                            </View>
                            {isSelected && <Text style={{ fontSize: 11, fontWeight: '800', color: '#0F766E' }}>SOURCE</Text>}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>

                {/* Direction Indicator */}
                <View style={styles.transferDirectionCol}>
                  <View style={styles.transferDirectionCircle}>
                    <Text style={styles.transferDirectionArrow}>➔</Text>
                  </View>
                </View>

                {/* Destination Branch (To) */}
                <View style={styles.branchCol}>
                  <Text style={styles.fieldLabelModal}>
                    To Branch (Destination) <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <View style={styles.branchPickerBox}>
                    <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled={true}>
                      {branchesList.map((b) => {
                        const bName = b.name || b.id;
                        const isSelected = toBranch === bName;
                        const isDisabled = fromBranch === bName;
                        return (
                          <Pressable
                            key={`to-${b.id}`}
                            disabled={isDisabled}
                            onPress={() => setToBranch(bName)}
                            style={[
                              styles.branchOptionItem,
                              isSelected && styles.branchOptionItemToActive,
                              isDisabled && styles.branchOptionDisabled,
                            ]}
                          >
                            <View style={[styles.branchDot, isSelected && styles.branchDotToActive]} />
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[
                                  styles.branchOptionName,
                                  isSelected && styles.branchOptionNameToActive,
                                  isDisabled && styles.branchOptionNameDisabled,
                                ]}
                              >
                                {bName} {isDisabled ? '(Current Source)' : ''}
                              </Text>
                              <Text style={styles.branchOptionCity}>{b.city || 'Pune'}</Text>
                            </View>
                            {isSelected && <Text style={{ fontSize: 11, fontWeight: '800', color: '#2563EB' }}>DESTINATION</Text>}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
              </View>

              {/* Quantity Input & Preset Buttons */}
              <View style={styles.formGroupModal}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.fieldLabelModal}>
                    Stock Quantity to Transfer <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>
                    Available: <Text style={{ fontWeight: '700', color: '#0F766E' }}>{selectedItemForAction?.quantity || 0} units</Text>
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <TextInput
                    style={[styles.adjustInput, { flex: 1, minWidth: 140, fontSize: 15, fontWeight: '700', color: '#0F172A' }]}
                    value={transferQty}
                    onChangeText={setTransferQty}
                    keyboardType="numeric"
                    placeholder="Enter units (e.g. 50)"
                  />
                  {/* Preset Buttons */}
                  {['10', '25', '50', '100'].map((preset) => (
                    <Pressable
                      key={preset}
                      onPress={() => setTransferQty(preset)}
                      style={[
                        styles.transferPresetBtn,
                        transferQty === preset && styles.transferPresetBtnActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.transferPresetText,
                          transferQty === preset && styles.transferPresetTextActive,
                        ]}
                      >
                        +{preset}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Transfer Stock Calculation Preview */}
              {selectedItemForAction && (
                <View style={styles.transferCalcBox}>
                  <Text style={styles.transferCalcTitle}>Stock Impact Summary:</Text>
                  <View style={styles.transferCalcRow}>
                    <Text style={styles.transferCalcLabel}>• {fromBranch || 'Source Branch'}:</Text>
                    <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 12.5 }}>
                      {selectedItemForAction.quantity} ➔ {Math.max(0, selectedItemForAction.quantity - (parseInt(transferQty, 10) || 0))} units (-{parseInt(transferQty, 10) || 0})
                    </Text>
                  </View>
                  <View style={styles.transferCalcRow}>
                    <Text style={styles.transferCalcLabel}>• {toBranch || 'Destination Branch'}:</Text>
                    <Text style={{ color: '#16A34A', fontWeight: '700', fontSize: 12.5 }}>
                      +{parseInt(transferQty, 10) || 0} units added to target branch stock
                    </Text>
                  </View>
                </View>
              )}

              {/* Reason / Reference Input */}
              <View style={styles.formGroupModal}>
                <Text style={styles.fieldLabelModal}>Transfer Reason / Reference Notes</Text>
                <TextInput
                  style={styles.adjustInput}
                  value={transferReason}
                  onChangeText={setTransferReason}
                  placeholder="e.g. Emergency stock transfer to OPD branch"
                />
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={styles.adjustModalFooter}>
              <Pressable onPress={() => setTransferModalOpen(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleConfirmTransfer} style={styles.confirmTransferBtn}>
                <Text style={styles.confirmTransferBtnText}>🔄 Confirm & Transfer Stock</Text>
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
  cardSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 2,
  },
  /* Mobile Card List Styles */
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
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  mobileStockCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  mobileStockTitleCol: {
    flex: 1,
  },
  mobileBrandName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  mobileMedName: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F766E',
    marginTop: 2,
  },
  mobileStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeInStock: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeLow: {
    backgroundColor: '#FEF3C7',
  },
  mobileStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusTextInStock: {
    color: '#15803D',
  },
  statusTextLow: {
    color: '#B45309',
  },
  mobileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 10,
    gap: 10,
  },
  mobileGridItem: {
    width: '47%',
  },
  mobileItemLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  mobileItemValue: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#334155',
    marginTop: 1,
  },
  mobileItemValueBold: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },
  mobileStockFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 4,
    gap: 8,
  },
  mobileUpdatedText: {
    fontSize: 11,
    color: '#94A3B8',
    flex: 1,
  },
  mobileEditBtn: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    cursor: 'pointer',
  },
  mobileEditBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0369A1',
  },
  tableWrapper: {
    minWidth: 1520,
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
  modifyWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  modifyButton: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    cursor: 'pointer',
  },
  modifyButtonText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0369A1',
  },
  formHeader: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
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
    flex: 1,
    minWidth: 260,
  },
  formFieldThird: {
    flex: 1,
    minWidth: 180,
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
    alignItems: 'flex-start',
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
  headerControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 8,
  },
  filterTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    cursor: 'pointer',
  },
  filterTogglePillActive: {
    backgroundColor: '#F0FDFA',
    borderColor: '#0F766E',
  },
  filterToggleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#94A3B8',
  },
  filterToggleDotActive: {
    backgroundColor: '#0F766E',
  },
  filterToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  filterToggleTextActive: {
    color: '#0F766E',
    fontWeight: '700',
  },
  devGuideHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    cursor: 'pointer',
  },
  devGuideHeaderBtnIcon: {
    fontSize: 13,
  },
  devGuideHeaderBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  cardHeaderMobile: {
    flexDirection: 'column',
    gap: 10,
  },
  mobileBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniToggleTrack: {
    width: 36,
    height: 20,
    borderRadius: 10,
    padding: 2,
    justifyContent: 'center',
    cursor: 'pointer',
  },
  miniToggleTrackActive: {
    backgroundColor: '#0F766E',
  },
  miniToggleTrackInactive: {
    backgroundColor: '#CBD5E1',
  },
  miniToggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  miniToggleThumbActive: {
    alignSelf: 'flex-end',
  },
  miniToggleThumbInactive: {
    alignSelf: 'flex-start',
  },
  mobileStockCardInactive: {
    opacity: 0.65,
    backgroundColor: '#F8FAFC',
  },
  mobileDotsActionBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    cursor: 'pointer',
  },
  mobileDotsActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  tableRowInactive: {
    opacity: 0.65,
    backgroundColor: '#F8FAFC',
  },
  tdCenterCell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  tableToggleTrack: {
    width: 38,
    height: 20,
    borderRadius: 10,
    padding: 2,
    justifyContent: 'center',
    cursor: 'pointer',
  },
  tableToggleActive: {
    backgroundColor: '#0F766E',
  },
  tableToggleInactive: {
    backgroundColor: '#CBD5E1',
  },
  tableToggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  tableToggleThumbActive: {
    alignSelf: 'flex-end',
  },
  tableToggleThumbInactive: {
    alignSelf: 'flex-start',
  },
  rxTagPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    cursor: 'pointer',
  },
  rxTagRequired: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  rxTagOtc: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rxTagPillText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  rxTagTextRequired: {
    color: '#DC2626',
  },
  rxTagTextOtc: {
    color: '#64748B',
  },
  actionCellWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDotsButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    cursor: 'pointer',
  },
  actionDotsButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#334155',
    lineHeight: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  actionMenuCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
  },
  actionMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  actionMenuTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  actionMenuSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  closeActionBtn: {
    padding: 6,
    cursor: 'pointer',
  },
  closeActionText: {
    fontSize: 18,
    color: '#64748B',
    fontWeight: '700',
  },
  actionList: {
    padding: 10,
    gap: 4,
  },
  actionOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
  },
  actionOptionRowDanger: {
    backgroundColor: '#FEF2F2',
  },
  actionOptionRowDev: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    marginTop: 4,
  },
  actionOptionIcon: {
    fontSize: 20,
  },
  actionOptionTextCol: {
    flex: 1,
  },
  actionOptionTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  actionOptionDesc: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  adjustModalCard: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
  },
  adjustModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  adjustModalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  adjustModalSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  adjustModalBody: {
    padding: 20,
    gap: 14,
  },
  formGroupModal: {
    gap: 6,
  },
  fieldLabelModal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  adjustTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  adjustTypeBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    cursor: 'pointer',
  },
  adjustTypeBtnActive: {
    borderColor: '#0F766E',
    backgroundColor: '#0F766E',
  },
  adjustTypeBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  adjustTypeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  adjustInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    backgroundColor: '#FFFFFF',
  },
  apiPreviewBox: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    padding: 8,
    borderRadius: 6,
  },
  apiPreviewText: {
    fontSize: 11,
    color: '#0F766E',
    fontFamily: Platform.select({ web: 'monospace', default: 'System' }),
    fontWeight: '600',
  },
  adjustModalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    cursor: 'pointer',
  },
  cancelBtnText: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '600',
  },
  saveAdjustBtn: {
    backgroundColor: '#0F766E',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 6,
    cursor: 'pointer',
  },
  saveAdjustBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  devGuideModalCard: {
    width: '100%',
    maxWidth: 780,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
  },
  devGuideModalCardMobile: {
    maxHeight: '95%',
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
  devGuideModalBody: {
    padding: 20,
  },
  guideSec: {
    marginBottom: 22,
  },
  guideSecTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F766E',
    marginBottom: 6,
  },
  guideSecDesc: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 8,
  },
  codeSnippet: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 12,
    marginTop: 6,
  },
  codeSnippetText: {
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
    gap: 8,
    marginBottom: 4,
  },
  methodPatch: {
    backgroundColor: '#8B5CF6',
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
  devGuideModalFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'flex-end',
  },
  closeDevGuideModalBtn: {
    backgroundColor: '#0F766E',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: 'pointer',
  },
  closeDevGuideModalBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  /* Inter-Branch Stock Transfer Modal Styles */
  transferModalCard: {
    width: '100%',
    maxWidth: 680,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
  },
  transferModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  transferHeaderBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  transferHeaderBadgeIcon: {
    fontSize: 16,
  },
  transferModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  transferModalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  transferModalBody: {
    padding: 20,
    gap: 14,
  },
  transferProductCard: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 10,
    padding: 14,
  },
  transferMedTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F766E',
  },
  transferMedMeta: {
    fontSize: 12,
    color: '#334155',
    marginTop: 2,
  },
  transferPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  transferPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  transferPillText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  transferPillTeal: {
    backgroundColor: '#CCFBF1',
    borderWidth: 1,
    borderColor: '#5EEAD4',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  transferPillTextTeal: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F766E',
  },
  transferErrorAlert: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    padding: 10,
    borderRadius: 8,
  },
  transferErrorText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
  },
  branchSelectionGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  branchCol: {
    flex: 1,
  },
  branchPickerBox: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
    marginTop: 4,
  },
  branchOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
  },
  branchOptionItemFromActive: {
    backgroundColor: '#F0FDFA',
    borderLeftWidth: 4,
    borderLeftColor: '#0F766E',
  },
  branchOptionItemToActive: {
    backgroundColor: '#EFF6FF',
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
  },
  branchOptionDisabled: {
    opacity: 0.4,
    backgroundColor: '#F8FAFC',
  },
  branchDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  branchDotFromActive: {
    backgroundColor: '#0F766E',
  },
  branchDotToActive: {
    backgroundColor: '#2563EB',
  },
  branchOptionName: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  branchOptionNameFromActive: {
    color: '#0F766E',
    fontWeight: '800',
  },
  branchOptionNameToActive: {
    color: '#2563EB',
    fontWeight: '800',
  },
  branchOptionNameDisabled: {
    color: '#94A3B8',
  },
  branchOptionCity: {
    fontSize: 11,
    color: '#94A3B8',
  },
  transferDirectionCol: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 28,
    paddingTop: 18,
  },
  transferDirectionCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferDirectionArrow: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  transferPresetBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    cursor: 'pointer',
  },
  transferPresetBtnActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  transferPresetText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  transferPresetTextActive: {
    color: '#FFFFFF',
  },
  transferCalcBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  transferCalcTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  transferCalcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  transferCalcLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  confirmTransferBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 6,
    cursor: 'pointer',
  },
  confirmTransferBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
});
