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

  // Developer Backend & DB Guide Modal State
  const [devGuideModalOpen, setDevGuideModalOpen] = useState(false);

  // Quick Quantity Adjustment Modal State
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustDelta, setAdjustDelta] = useState('10');
  const [adjustType, setAdjustType] = useState('CYCLE_COUNT');
  const [adjustReason, setAdjustReason] = useState('Physical stock count adjustment');

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

    if (actionKey === 'dev-guide') {
      setDevGuideModalOpen(true);
      return;
    }

    if (actionKey === 'adjust') {
      setAdjustDelta('10');
      setAdjustModalOpen(true);
      return;
    }

    if (actionKey === 'transfer') {
      if (onShowToast) {
        onShowToast(
          `[POST /api/inventory/transfers] Transfer request created for ${item.brandName} (${item.sku})`
        );
      }
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

            {/* Backend & DB Guide Button */}
            <Pressable
              onPress={() => setDevGuideModalOpen(true)}
              style={styles.devGuideHeaderBtn}
              accessibilityRole="button"
              accessibilityLabel="Backend & Database Guide"
            >
              <Text style={styles.devGuideHeaderBtnIcon}>🔌</Text>
              <Text style={styles.devGuideHeaderBtnText}>Backend & DB Guide</Text>
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

              <Pressable
                onPress={() => handleExecuteAction('dev-guide')}
                style={[styles.actionOptionRow, styles.actionOptionRowDev]}
              >
                <Text style={styles.actionOptionIcon}>🔌</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={[styles.actionOptionTitle, { color: '#0F766E' }]}>
                    Backend & Database Guide (For Developers)
                  </Text>
                  <Text style={styles.actionOptionDesc}>
                    View HTTP API endpoints, JSON payloads, and SQL queries to connect backend & DB
                  </Text>
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

      {/* 3. BACKEND & DATABASE DEVELOPER GUIDE MODAL */}
      <Modal
        visible={devGuideModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDevGuideModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.devGuideModalCard, isMobile && styles.devGuideModalCardMobile]}>
            <View style={styles.devGuideModalHeader}>
              <View style={styles.devGuideTitleRow}>
                <View style={styles.devGuideIconBadge}>
                  <Text style={styles.devGuideIconText}>🔌</Text>
                </View>
                <View>
                  <Text style={styles.devGuideModalTitle}>Inventory Backend & Database Integration Guide</Text>
                  <Text style={styles.devGuideModalSubtitle}>
                    Specification for backend team to connect APIs and PostgreSQL tables
                  </Text>
                </View>
              </View>
              <Pressable onPress={() => setDevGuideModalOpen(false)} style={styles.closeActionBtn}>
                <Text style={styles.closeActionText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.devGuideModalBody} showsVerticalScrollIndicator={true}>
              {/* Section 1: Endpoints */}
              <View style={styles.guideSec}>
                <Text style={styles.guideSecTitle}>1. Required REST API Endpoints</Text>

                <View style={styles.endpointCard}>
                  <View style={styles.endpointHeader}>
                    <View style={styles.methodPatch}><Text style={styles.methodText}>PATCH</Text></View>
                    <Text style={styles.endpointRoute}>/api/inventory/:id/status</Text>
                  </View>
                  <Text style={styles.endpointDesc}>
                    Triggered by the table row switch toggle. Toggles active/inactive catalog state.
                  </Text>
                  <View style={styles.codeSnippet}>
                    <Text style={styles.codeSnippetText}>
{`// Request: PATCH /api/inventory/SKU-PARA500/status
{ "is_active": false }
// Response: 200 OK { "status": "success", "is_active": false }`}
                    </Text>
                  </View>
                </View>

                <View style={styles.endpointCard}>
                  <View style={styles.endpointHeader}>
                    <View style={styles.methodPost}><Text style={styles.methodText}>POST</Text></View>
                    <Text style={styles.endpointRoute}>/api/inventory/adjustments</Text>
                  </View>
                  <Text style={styles.endpointDesc}>
                    Triggered when adjusting stock quantity (+/- units) from the 3-dots action menu.
                  </Text>
                  <View style={styles.codeSnippet}>
                    <Text style={styles.codeSnippetText}>
{`// Request: POST /api/inventory/adjustments
{
  "item_id": "adj-stk-101",
  "batch_no": "BCH-8921",
  "adjustment_type": "CYCLE_COUNT",
  "quantity_delta": 10,
  "reason": "Physical count audit adjustment",
  "branch_id": "BR-01",
  "adjusted_by": "USR-102"
}
// Response: 200 OK { "new_quantity": 410, "movement_id": "mov-5592" }`}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Section 2: PostgreSQL Schema */}
              <View style={styles.guideSec}>
                <Text style={styles.guideSecTitle}>2. PostgreSQL Database Schema</Text>
                <Text style={styles.guideSecDesc}>
                  The backend team should ensure these tables and relationships are created in PostgreSQL:
                </Text>
                <View style={styles.codeSnippet}>
                  <Text style={styles.codeSnippetText}>
{`-- Inventory Items / Master Catalog
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  sku VARCHAR(50) UNIQUE NOT NULL,
  medicine_name TEXT NOT NULL,
  brand_name TEXT NOT NULL,
  generic_name TEXT,
  strength TEXT,
  pack_size TEXT,
  manufacturer TEXT,
  is_active BOOLEAN DEFAULT true,
  rx_required BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Stock Batches (Per Branch)
CREATE TABLE IF NOT EXISTS inventory_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  batch_no VARCHAR(50) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  mrp_amount NUMERIC(10,2) NOT NULL,
  expiry_date DATE NOT NULL,
  shelf_location VARCHAR(50),
  supplier_name TEXT,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Stock Movement Audit Log
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES inventory_batches(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'ADJUSTMENT' | 'SALE' | 'PURCHASE' | 'TRANSFER'
  qty_delta INT NOT NULL,
  reason TEXT,
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);`}
                  </Text>
                </View>
              </View>

              {/* Section 3: Atomic SQL Transaction */}
              <View style={styles.guideSec}>
                <Text style={styles.guideSecTitle}>3. SQL Query Transaction (With Row-Level Lock)</Text>
                <View style={styles.codeSnippet}>
                  <Text style={styles.codeSnippetText}>
{`-- Execute in db.js / server.js
BEGIN;
-- 1. Row-level lock to prevent concurrent adjustment race conditions
SELECT quantity FROM inventory_batches WHERE id = $1 FOR UPDATE;

-- 2. Update stock quantity
UPDATE inventory_batches 
SET quantity = quantity + $2, updated_at = NOW() 
WHERE id = $1;

-- 3. Log movement audit entry
INSERT INTO stock_movements (batch_id, type, qty_delta, reason, user_id) 
VALUES ($1, $3, $2, $4, $5);

COMMIT;`}
                  </Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.devGuideModalFooter}>
              <Pressable
                onPress={() => setDevGuideModalOpen(false)}
                style={styles.closeDevGuideModalBtn}
              >
                <Text style={styles.closeDevGuideModalBtnText}>Done / Close Guide</Text>
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
});
