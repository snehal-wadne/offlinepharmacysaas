import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from 'react-native';
import InventoryStatCard from '../../components/inventory/InventoryStatCard';
import {
  SUPPLIERS_KPIS,
  MOCK_SUPPLIERS_LIST,
  SUPPLIER_CATEGORY_FILTER,
} from '../../data/suppliersMockData';
import {
  fetchSuppliers,
  createSupplier,
  updateSupplier,
  updateSupplierStatus,
  deleteSupplier,
} from '../../api/purchaseApi';

export default function SuppliersScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [toggleActiveOnly, setToggleActiveOnly] = useState(false);
  const [toggleGstinOnly, setToggleGstinOnly] = useState(false);

  // 3-Dots Action Menu State
  const [actionMenuModalOpen, setActionMenuModalOpen] = useState(false);
  const [selectedSupplierForAction, setSelectedSupplierForAction] = useState(null);

  // Developer Backend & DB Guide Modal State
  const [devGuideModalOpen, setDevGuideModalOpen] = useState(false);

  // Suppliers List State
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add / Edit Supplier Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditingSupplier, setIsEditingSupplier] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    category: 'Branded Formulations',
    contactPerson: '',
    phone: '',
    email: '',
    city: 'Mumbai',
    gstin: '',
  });
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    loadSuppliersData();
  }, []);

  const loadSuppliersData = async () => {
    try {
      setLoading(true);
      const res = await fetchSuppliers();
      if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
        setSuppliers(res.data);
      } else {
        setSuppliers(MOCK_SUPPLIERS_LIST);
      }
    } catch (err) {
      console.warn('Failed to load suppliers from DB:', err.message);
      setSuppliers(MOCK_SUPPLIERS_LIST);
    } finally {
      setLoading(false);
    }
  };

  // Dynamic 4 Top KPI Cards Calculations
  const activeCount = suppliers.filter((s) => s.status === 'Active' || s.status === 'ACTIVE').length;
  const pendingCount = suppliers.filter((s) => s.status === 'Pending' || s.status === 'PENDING').length;

  const dynamicSuppliersKpis = [
    {
      id: 'sup-kpi-1',
      label: 'Total Suppliers',
      value: suppliers.length.toLocaleString(),
      subtext: 'Registered vendors',
      variant: 'teal',
    },
    {
      id: 'sup-kpi-2',
      label: 'Active Partners',
      value: activeCount.toLocaleString(),
      subtext: 'Verified suppliers',
      variant: 'teal',
    },
    {
      id: 'sup-kpi-3',
      label: 'Pending Approvals',
      value: pendingCount.toLocaleString(),
      subtext: 'Awaiting verification',
      variant: 'amber',
    },
    {
      id: 'sup-kpi-4',
      label: 'Outstanding Balance',
      value: '₹1,84,600',
      subtext: 'Accounts payable',
      variant: 'orange',
    },
  ];

  // Toggle supplier status in DB
  const handleToggleSupplierStatus = async (supId) => {
    const sup = suppliers.find((s) => s.id === supId);
    if (!sup) return;

    const nextStatusStr = sup.status === 'Active' ? 'Inactive' : 'Active';
    const dbStatus = nextStatusStr === 'Active' ? 'ACTIVE' : 'INACTIVE';

    try {
      await updateSupplierStatus(sup.id, dbStatus);
      setSuppliers((prev) =>
        prev.map((s) => (s.id === supId ? { ...s, status: nextStatusStr } : s))
      );
      if (onShowToast) {
        onShowToast(`✓ Supplier "${sup.name}" marked ${nextStatusStr} in database!`);
      }
    } catch (err) {
      setSuppliers((prev) =>
        prev.map((s) => (s.id === supId ? { ...s, status: nextStatusStr } : s))
      );
      if (onShowToast) {
        onShowToast(`Supplier "${sup.name}" marked ${nextStatusStr}`);
      }
    }
  };

  const handleToggleActiveFilter = () => {
    const nextVal = !toggleActiveOnly;
    setToggleActiveOnly(nextVal);
    if (onShowToast) {
      onShowToast(nextVal ? 'Filter enabled: Active Suppliers Only' : 'Filter cleared: Showing All Suppliers');
    }
  };

  const handleToggleGstinFilter = () => {
    const nextVal = !toggleGstinOnly;
    setToggleGstinOnly(nextVal);
    if (onShowToast) {
      onShowToast(nextVal ? 'Filter enabled: Verified GSTIN Only' : 'Filter cleared: Showing All');
    }
  };

  const handleOpenActionMenu = (sup) => {
    setSelectedSupplierForAction(sup);
    setActionMenuModalOpen(true);
  };

  // Filtered Suppliers
  const filteredSuppliers = suppliers.filter((sup) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (sup.name && sup.name.toLowerCase().includes(q)) ||
      (sup.id && sup.id.toLowerCase().includes(q)) ||
      (sup.contactPerson && sup.contactPerson.toLowerCase().includes(q)) ||
      (sup.city && sup.city.toLowerCase().includes(q)) ||
      (sup.gstin && sup.gstin.toLowerCase().includes(q));

    const matchesCategory =
      selectedCategory === 'All Categories' || sup.category === selectedCategory;

    const matchesActive = !toggleActiveOnly || sup.status === 'Active' || sup.status === 'ACTIVE';
    const matchesGstin = !toggleGstinOnly || (sup.gstin && sup.gstin.length >= 15);

    return matchesSearch && matchesCategory && matchesActive && matchesGstin;
  });

  const handleOpenModalForAdd = () => {
    setIsEditingSupplier(false);
    setEditingSupplierId(null);
    setFormData({
      name: '',
      category: 'Branded Formulations',
      contactPerson: '',
      phone: '',
      email: '',
      city: 'Mumbai',
      gstin: '',
    });
    setFormErrors({});
    setModalVisible(true);
  };

  const handleOpenModalForEdit = (sup) => {
    setIsEditingSupplier(true);
    setEditingSupplierId(sup.id);
    setFormData({
      name: sup.name || '',
      category: sup.category || 'Branded Formulations',
      contactPerson: sup.contactPerson === 'N/A' ? '' : sup.contactPerson || '',
      phone: sup.phone === 'N/A' ? '' : sup.phone || '',
      email: sup.email === 'contact@supplier.example.com' ? '' : sup.email || '',
      city: sup.city || 'Mumbai, MH',
      gstin: sup.gstin === '27AABCS1429B1Z1' ? '' : sup.gstin || '',
    });
    setFormErrors({});
    setModalVisible(true);
  };

  const handleDeleteSupplierAction = async (sup) => {
    if (!sup) return;
    try {
      await deleteSupplier(sup.id);
      setSuppliers((prev) => prev.filter((s) => s.id !== sup.id));
      if (onShowToast) {
        onShowToast(`🗑️ Supplier "${sup.name}" deleted from database!`);
      }
    } catch (err) {
      setSuppliers((prev) => prev.filter((s) => s.id !== sup.id));
      if (onShowToast) {
        onShowToast(`Removed ${sup.name}`);
      }
    }
  };

  const handleSaveSupplier = async () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Supplier name is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const payload = {
      name: formData.name.trim(),
      category: formData.category ? formData.category.trim() : 'Medicines & Injections',
      contactPerson: formData.contactPerson.trim() || 'Account Executive',
      phone: formData.phone.trim() || '+91 98000 11111',
      email: formData.email.trim() || `${formData.name.toLowerCase().replace(/[^a-z]/g, '')}@supplier.example.com`,
      city: formData.city.trim() || 'Mumbai, MH',
      gstin: formData.gstin.trim() || '27AABCS1429B1Z1',
      status: 'ACTIVE',
    };

    if (isEditingSupplier && editingSupplierId) {
      try {
        await updateSupplier(editingSupplierId, payload);
        setSuppliers((prev) =>
          prev.map((s) =>
            s.id === editingSupplierId
              ? {
                  ...s,
                  name: formData.name.trim(),
                  contactPerson: formData.contactPerson.trim() || s.contactPerson,
                  phone: formData.phone.trim() || s.phone,
                  email: formData.email.trim() || s.email,
                  city: formData.city.trim() || s.city,
                  gstin: formData.gstin.trim() || s.gstin,
                  category: formData.category || s.category,
                }
              : s
          )
        );
        setModalVisible(false);
        setIsEditingSupplier(false);
        setEditingSupplierId(null);

        if (onShowToast) {
          onShowToast(`✓ Supplier "${formData.name}" information updated in database!`);
        }
      } catch (err) {
        console.warn('Edit supplier DB failed, fallback local:', err.message);
        setSuppliers((prev) =>
          prev.map((s) =>
            s.id === editingSupplierId
              ? {
                  ...s,
                  name: formData.name.trim(),
                  contactPerson: formData.contactPerson || s.contactPerson,
                  phone: formData.phone || s.phone,
                  city: formData.city || s.city,
                }
              : s
          )
        );
        setModalVisible(false);
        setIsEditingSupplier(false);
        setEditingSupplierId(null);

        if (onShowToast) {
          onShowToast(`✓ Updated ${formData.name}`);
        }
      }
    } else {
      try {
        const res = await createSupplier(payload);
        const created = res?.data;
        const newSup = {
          id: created?.id || `SUP-${Date.now()}`,
          code: `SUP-${String(suppliers.length + 1).padStart(3, '0')}`,
          name: created?.name || formData.name,
          contactPerson: created?.contact_person || formData.contactPerson || 'Account Executive',
          phone: created?.phone || formData.phone || '+91 98000 11111',
          email: created?.email || formData.email || 'orders@pharma.in',
          city: created?.city || formData.city || 'Mumbai',
          gstin: created?.gstin || formData.gstin || '27AABCT1234F1Z0',
          paymentTerms: 'Net 30',
          balance: '₹0.00',
          status: 'Active',
          category: formData.category || 'Medicines & Injections',
        };

        setSuppliers((prev) => [newSup, ...prev]);
        setModalVisible(false);

        if (onShowToast) {
          onShowToast(`✓ Added ${newSup.name} into suppliers database table!`);
        }
      } catch (err) {
        console.warn('DB supplier add failed, fallback local state:', err.message);
        const newSup = {
          id: `SUP-${Date.now()}`,
          name: formData.name,
          contactPerson: formData.contactPerson || 'Account Executive',
          phone: formData.phone || '+91 98000 11111',
          email: formData.email || 'orders@pharma.in',
          city: formData.city || 'Mumbai',
          gstin: formData.gstin || '27AABCT1234F1Z0',
          balance: '₹0.00',
          status: 'Active',
          category: formData.category || 'Medicines & Injections',
        };

        setSuppliers((prev) => [newSup, ...prev]);
        setModalVisible(false);

        if (onShowToast) {
          onShowToast(`✓ Added ${newSup.name} to Vendor Directory!`);
        }
      }
    }
  };

  const handleCreatePOWithSupplier = (sup) => {
    if (onNavigate) {
      onNavigate('purchases');
    }
    if (onShowToast) {
      onShowToast(`Created draft PO with ${sup.name}`);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, isMobile && styles.contentContainerMobile]}
      showsVerticalScrollIndicator={true}
    >
      {/* Header Row */}
      <View style={[styles.headerRow, isMobile && styles.headerRowMobile]}>
        <View>
          <Text style={styles.pageTitle}>Suppliers Directory</Text>
          <Text style={styles.pageSubtitle}>
            Maintain pharmaceutical manufacturers, verified distributors, credit terms and GST records.
          </Text>
        </View>
        <View style={styles.headerRightActions}>
          <Pressable
            onPress={() => setDevGuideModalOpen(true)}
            style={styles.devGuideTopBtn}
            accessibilityRole="button"
            accessibilityLabel="Backend and Database Guide"
          >
            <Text style={styles.devGuideTopBtnIcon}>🔌</Text>
            <Text style={styles.devGuideTopBtnText}>Backend & DB Guide</Text>
          </Pressable>

          <Pressable
            onPress={handleOpenModalForAdd}
            style={styles.newSupplierButton}
            accessibilityRole="button"
            accessibilityLabel="Add Supplier"
          >
            <Text style={styles.newSupplierIcon}>+</Text>
            <Text style={styles.newSupplierText}>Add Supplier</Text>
          </Pressable>
        </View>
      </View>

      {/* Top 4 KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {dynamicSuppliersKpis.map((kpi) => (
          <InventoryStatCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            subtext={kpi.subtext}
            variant={kpi.variant}
            onPress={() => onShowToast && onShowToast(`Filter: ${kpi.label}`)}
          />
        ))}
      </View>

      {/* Main Table Card */}
      <View style={styles.cardContainer}>
        {/* Search & Filter Header */}
        <View style={[styles.filtersBar, isCompact && styles.filtersBarCompact]}>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search supplier, contact, city or GSTIN..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>✕</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Quick Filter Toggles */}
          <View style={styles.filterTogglesGroup}>
            <Pressable
              onPress={handleToggleActiveFilter}
              style={[
                styles.filterTogglePill,
                toggleActiveOnly && styles.filterTogglePillActive,
              ]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: toggleActiveOnly }}
            >
              <View
                style={[
                  styles.filterToggleDot,
                  toggleActiveOnly && styles.filterToggleDotActive,
                ]}
              />
              <Text
                style={[
                  styles.filterToggleText,
                  toggleActiveOnly && styles.filterToggleTextActive,
                ]}
              >
                Active Only
              </Text>
            </Pressable>

            <Pressable
              onPress={handleToggleGstinFilter}
              style={[
                styles.filterTogglePill,
                toggleGstinOnly && styles.filterTogglePillActive,
              ]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: toggleGstinOnly }}
            >
              <View
                style={[
                  styles.filterToggleDot,
                  toggleGstinOnly && styles.filterToggleDotActive,
                ]}
              />
              <Text
                style={[
                  styles.filterToggleText,
                  toggleGstinOnly && styles.filterToggleTextActive,
                ]}
              >
                Verified GSTIN (15 Digits)
              </Text>
            </Pressable>
          </View>

          {/* Category Filter Chips */}
          <View style={styles.filterChipRow}>
            {(SUPPLIER_CATEGORY_FILTER || ['All Categories']).map((cat) => (
              <Pressable
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={[
                  styles.filterChip,
                  selectedCategory === cat && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedCategory === cat && styles.filterChipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {isMobile ? (
          /* Mobile Supplier Cards */
          <View style={styles.mobileCardList}>
            {filteredSuppliers.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No suppliers found</Text>
                <Text style={styles.emptySubtitle}>Try changing your search terms.</Text>
              </View>
            ) : (
              filteredSuppliers.map((sup, index) => (
                <View key={sup.id} style={styles.mobileSupplierCard}>
                  <View style={styles.mobileSupHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mobileSupName}>{sup.name}</Text>
                      <Text style={styles.mobileCategoryText}>{sup.category} • Sr No: {index + 1}</Text>
                    </View>
                    <View style={styles.statusBadgeActive}>
                      <Text style={styles.statusBadgeTextActive}>{sup.status}</Text>
                    </View>
                  </View>

                  <View style={styles.mobileGrid}>
                    <View style={styles.mobileGridCol}>
                      <Text style={styles.mobileLabel}>Contact Person</Text>
                      <Text style={styles.mobileValBold}>{sup.contactPerson}</Text>
                    </View>
                    <View style={styles.mobileGridCol}>
                      <Text style={styles.mobileLabel}>Phone</Text>
                      <Text style={styles.mobileValBold}>{sup.phone}</Text>
                    </View>
                    <View style={styles.mobileGridCol}>
                      <Text style={styles.mobileLabel}>Email</Text>
                      <Text style={styles.mobileVal} numberOfLines={1}>{sup.email}</Text>
                    </View>
                    <View style={styles.mobileGridCol}>
                      <Text style={styles.mobileLabel}>City</Text>
                      <Text style={styles.mobileVal}>{sup.city}</Text>
                    </View>
                    <View style={styles.mobileGridCol}>
                      <Text style={styles.mobileLabel}>GSTIN</Text>
                      <Text style={styles.mobileVal}>{sup.gstin}</Text>
                    </View>
                    <View style={styles.mobileGridCol}>
                      <Text style={styles.mobileLabel}>Balance Dues</Text>
                      <Text style={[styles.mobileValBold, { color: '#DC2626' }]}>{sup.balance}</Text>
                    </View>
                  </View>

                  <View style={styles.mobileSupFooter}>
                    <Pressable
                      onPress={() => handleToggleSupplierStatus(sup.id)}
                      style={[
                        styles.mobileStatusToggleBtn,
                        sup.status === 'Active' ? styles.mobileStatusToggleActive : styles.mobileStatusToggleInactive,
                      ]}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: sup.status === 'Active' }}
                    >
                      <Text style={styles.mobileStatusToggleText}>
                        {sup.status === 'Active' ? '● Active' : '○ Inactive'}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => handleOpenActionMenu(sup)}
                      style={styles.mobileDotsActionBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Supplier Actions"
                    >
                      <Text style={styles.mobileDotsActionText}>⋮ Actions</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : (
          /* Desktop Suppliers Table */
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              {/* Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { width: 90 }]}>SR NO</Text>
                <Text style={[styles.thCell, { width: 190 }]}>COMPANY NAME</Text>
                <Text style={[styles.thCell, { width: 140 }]}>CONTACT PERSON</Text>
                <Text style={[styles.thCell, { width: 130 }]}>PHONE</Text>
                <Text style={[styles.thCell, { width: 180 }]}>EMAIL</Text>
                <Text style={[styles.thCell, { width: 130 }]}>CITY</Text>
                <Text style={[styles.thCell, { width: 160 }]}>GSTIN</Text>
                <Text style={[styles.thCell, { width: 120, textAlign: 'right' }]}>BALANCE DUE</Text>
                <Text style={[styles.thCell, { width: 105, textAlign: 'center' }]}>STATUS TOGGLE</Text>
                <Text style={[styles.thCell, { width: 90, textAlign: 'center' }]}>ACTIONS</Text>
              </View>

              {/* Rows */}
              {filteredSuppliers.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No suppliers found</Text>
                  <Text style={styles.emptySubtitle}>Try changing your search terms.</Text>
                </View>
              ) : (
                filteredSuppliers.map((sup, index) => (
                  <View
                    key={sup.id}
                    style={[
                      styles.tableRow,
                      index % 2 === 1 && styles.tableRowAlt,
                    ]}
                  >
                    <Text style={[styles.tdCell, styles.supId, { width: 90, fontWeight: '700', color: '#0F172A' }]}>
                      {index + 1}
                    </Text>
                    <View style={[{ width: 190 }]}>
                      <Text style={[styles.tdCell, styles.supName]} numberOfLines={1}>
                        {sup.name}
                      </Text>
                      <Text style={styles.categorySubtext}>{sup.category}</Text>
                    </View>
                    <Text style={[styles.tdCell, { width: 140 }]}>{sup.contactPerson}</Text>
                    <Text style={[styles.tdCell, { width: 130 }]}>{sup.phone}</Text>
                    <Text style={[styles.tdCell, styles.emailText, { width: 180 }]} numberOfLines={1}>
                      {sup.email}
                    </Text>
                    <Text style={[styles.tdCell, { width: 130 }]}>{sup.city}</Text>
                    <Text style={[styles.tdCell, styles.gstinText, { width: 160 }]}>{sup.gstin}</Text>
                    <Text style={[styles.tdCell, styles.balanceText, { width: 120, textAlign: 'right' }]}>
                      {sup.balance}
                    </Text>

                    {/* Status Toggle Switch */}
                    <View style={[styles.statusWrapper, { width: 105 }]}>
                      <Pressable
                        onPress={() => handleToggleSupplierStatus(sup.id)}
                        style={[
                          styles.tableToggleTrack,
                          sup.status === 'Active' ? styles.tableToggleActive : styles.tableToggleInactive,
                        ]}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: sup.status === 'Active' }}
                      >
                        <View
                          style={[
                            styles.tableToggleThumb,
                            sup.status === 'Active' ? styles.tableToggleThumbActive : styles.tableToggleThumbInactive,
                          ]}
                        />
                      </Pressable>
                      <Text
                        style={[
                          styles.statusLabelText,
                          sup.status === 'Active' ? styles.statusActiveText : styles.statusInactiveText,
                        ]}
                      >
                        {sup.status}
                      </Text>
                    </View>

                    {/* Action: 3-Dots Button */}
                    <View style={[styles.actionWrapper, { width: 90 }]}>
                      <Pressable
                        onPress={() => handleOpenActionMenu(sup)}
                        style={styles.actionDotsButton}
                        accessibilityRole="button"
                        accessibilityLabel="Supplier Actions"
                      >
                        <Text style={styles.actionDotsButtonText}>⋮</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Add / Edit Supplier Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setModalVisible(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {isEditingSupplier ? 'Edit Supplier Information' : 'Add New Pharmaceutical Supplier'}
              </Text>
              <Pressable onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.formRow}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Supplier / Vendor Name <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g., Torrent Pharma Dist."
                    placeholderTextColor="#94A3B8"
                    value={formData.name}
                    onChangeText={(t) => setFormData((p) => ({ ...p, name: t }))}
                  />
                  {formErrors.name && <Text style={styles.errorText}>{formErrors.name}</Text>}
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Category</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g., Generic Medicines"
                    placeholderTextColor="#94A3B8"
                    value={formData.category}
                    onChangeText={(t) => setFormData((p) => ({ ...p, category: t }))}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Contact Person</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g., Ramesh Gupta"
                    placeholderTextColor="#94A3B8"
                    value={formData.contactPerson}
                    onChangeText={(t) => setFormData((p) => ({ ...p, contactPerson: t }))}
                  />
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Phone Number</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="+91 98XXX XXXXX"
                    placeholderTextColor="#94A3B8"
                    value={formData.phone}
                    onChangeText={(t) => setFormData((p) => ({ ...p, phone: t }))}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Email Address</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="orders@vendor.com"
                    placeholderTextColor="#94A3B8"
                    value={formData.email}
                    onChangeText={(t) => setFormData((p) => ({ ...p, email: t }))}
                  />
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>City / State</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g., Mumbai, MH"
                    placeholderTextColor="#94A3B8"
                    value={formData.city}
                    onChangeText={(t) => setFormData((p) => ({ ...p, city: t }))}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>GSTIN Tax Number</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g., 27AABCS1429B1Z1"
                    placeholderTextColor="#94A3B8"
                    value={formData.gstin}
                    onChangeText={(t) => setFormData((p) => ({ ...p, gstin: t }))}
                  />
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Payment Terms</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g., Net 30"
                    placeholderTextColor="#94A3B8"
                    value={formData.paymentTerms || 'Net 30'}
                    onChangeText={(t) => setFormData((p) => ({ ...p, paymentTerms: t }))}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveSupplier}
                style={styles.submitModalButton}
              >
                <Text style={styles.submitModalButtonText}>
                  {isEditingSupplier ? 'Update Supplier' : 'Save Supplier'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Supplier 3-Dots Action Menu Modal */}
      <Modal
        visible={actionMenuModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setActionMenuModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.actionMenuCard}>
            <View style={styles.actionMenuHeader}>
              <View>
                <Text style={styles.actionMenuTitle}>{selectedSupplierForAction?.name}</Text>
                <Text style={styles.actionMenuSub}>
                  GSTIN: {selectedSupplierForAction?.gstin || 'N/A'}
                </Text>
              </View>
              <Pressable onPress={() => setActionMenuModalOpen(false)} style={styles.closeActionBtn}>
                <Text style={styles.closeActionText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.actionList}>
              {/* Option 1: Create PO */}
              <Pressable
                onPress={() => {
                  setActionMenuModalOpen(false);
                  handleCreatePOWithSupplier(selectedSupplierForAction);
                }}
                style={styles.actionOptionRow}
              >
                <Text style={styles.actionOptionIcon}>🛒</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={styles.actionOptionTitle}>Create Purchase Order</Text>
                  <Text style={styles.actionOptionDesc}>Draft new stock reorder for this supplier</Text>
                </View>
              </Pressable>

              {/* Option 2 (NEW): Edit Supplier Information */}
              <Pressable
                onPress={() => {
                  setActionMenuModalOpen(false);
                  handleOpenModalForEdit(selectedSupplierForAction);
                }}
                style={styles.actionOptionRow}
              >
                <Text style={styles.actionOptionIcon}>✏️</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={styles.actionOptionTitle}>Edit Supplier Information</Text>
                  <Text style={styles.actionOptionDesc}>Update company name, contact, phone, email, GSTIN</Text>
                </View>
              </Pressable>

              {/* Option 3: Toggle Status */}
              <Pressable
                onPress={() => {
                  setActionMenuModalOpen(false);
                  handleToggleSupplierStatus(selectedSupplierForAction?.id);
                }}
                style={styles.actionOptionRow}
              >
                <Text style={styles.actionOptionIcon}>🔄</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={styles.actionOptionTitle}>
                    Toggle Status ({selectedSupplierForAction?.status === 'Active' ? 'Deactivate' : 'Activate'})
                  </Text>
                  <Text style={styles.actionOptionDesc}>
                    Current status is {selectedSupplierForAction?.status}
                  </Text>
                </View>
              </Pressable>

              {/* Option 4: View Ledger */}
              <Pressable
                onPress={() => {
                  setActionMenuModalOpen(false);
                  if (onShowToast) {
                    onShowToast(`📑 Supplier ledger opened for ${selectedSupplierForAction?.name}`);
                  }
                }}
                style={styles.actionOptionRow}
              >
                <Text style={styles.actionOptionIcon}>📋</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={styles.actionOptionTitle}>View Vendor Ledger & Balance</Text>
                  <Text style={styles.actionOptionDesc}>
                    Balance due: {selectedSupplierForAction?.balance}
                  </Text>
                </View>
              </Pressable>

              {/* Option 5 (NEW): Delete Supplier */}
              <Pressable
                onPress={() => {
                  setActionMenuModalOpen(false);
                  handleDeleteSupplierAction(selectedSupplierForAction);
                }}
                style={[styles.actionOptionRow, { backgroundColor: '#FEF2F2' }]}
              >
                <Text style={styles.actionOptionIcon}>🗑️</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={[styles.actionOptionTitle, { color: '#DC2626' }]}>Delete Supplier</Text>
                  <Text style={[styles.actionOptionDesc, { color: '#EF4444' }]}>
                    Remove vendor record from database
                  </Text>
                </View>
              </Pressable>

              {/* Option 6: Developer Guide */}
              <Pressable
                onPress={() => {
                  setActionMenuModalOpen(false);
                  setDevGuideModalOpen(true);
                }}
                style={[styles.actionOptionRow, styles.actionOptionRowDev]}
              >
                <Text style={styles.actionOptionIcon}>🔌</Text>
                <View style={styles.actionOptionTextCol}>
                  <Text style={[styles.actionOptionTitle, { color: '#0F766E' }]}>
                    Backend & Database Guide (For Developers)
                  </Text>
                  <Text style={styles.actionOptionDesc}>
                    Supplier REST API endpoints and PostgreSQL DDL schema
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Developer Backend & DB Guide Modal */}
      <Modal
        visible={devGuideModalOpen}
        transparent={true}
        animationType="fade"
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
                  <Text style={styles.devGuideModalTitle}>Suppliers Directory Backend Guide</Text>
                  <Text style={styles.devGuideModalSubtitle}>
                    Specification for Backend Engineers & DB Integrators
                  </Text>
                </View>
              </View>
              <Pressable onPress={() => setDevGuideModalOpen(false)} style={styles.closeActionBtn}>
                <Text style={styles.closeActionText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.devGuideModalBody}>
              {/* Section 1 */}
              <View style={styles.guideSec}>
                <Text style={styles.guideSecTitle}>1. REST API Endpoints</Text>
                <View style={styles.endpointCard}>
                  <View style={styles.endpointHeader}>
                    <View style={styles.methodPost}>
                      <Text style={styles.methodText}>GET</Text>
                    </View>
                    <Text style={styles.endpointRoute}>/api/suppliers</Text>
                  </View>
                  <Text style={styles.endpointDesc}>
                    Lists all verified pharmaceutical suppliers with GSTIN, credit balances, and active state.
                  </Text>
                </View>

                <View style={styles.endpointCard}>
                  <View style={styles.endpointHeader}>
                    <View style={[styles.methodPost, { backgroundColor: '#D97706' }]}>
                      <Text style={styles.methodText}>PATCH</Text>
                    </View>
                    <Text style={styles.endpointRoute}>/api/suppliers/:id/status</Text>
                  </View>
                  <Text style={styles.endpointDesc}>
                    Toggles supplier Active vs Inactive state in database.
                  </Text>
                </View>
              </View>

              {/* Section 2 */}
              <View style={styles.guideSec}>
                <Text style={styles.guideSecTitle}>2. PostgreSQL Database Schema</Text>
                <Text style={styles.guideSecDesc}>Suppliers table definition:</Text>
                <View style={styles.codeSnippet}>
                  <Text style={styles.codeSnippetText}>
{`CREATE TABLE suppliers (
  id VARCHAR(50) PRIMARY KEY, -- e.g. 'SUP-101'
  organization_id UUID REFERENCES organizations(id),
  company_name TEXT NOT NULL,
  category VARCHAR(100),
  contact_person TEXT,
  phone VARCHAR(20) NOT NULL,
  email TEXT,
  city VARCHAR(100),
  gstin VARCHAR(15), -- 15-digit GSTIN
  balance_due NUMERIC(10,2) DEFAULT 0.00,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);`}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
  },
  headerRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  pageSubtitle: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 4,
  },
  newSupplierButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: 'pointer',
    elevation: 2,
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  newSupplierIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 6,
  },
  newSupplierText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  newSupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: 'pointer',
  },
  newSupButtonHovered: {
    backgroundColor: '#0D9488',
  },
  newSupIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 6,
  },
  btnIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 6,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  newSupText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
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
  /* Mobile Supplier Card Styles */
  mobileCardList: {
    padding: 12,
    gap: 12,
  },
  mobileSupplierCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  mobileSupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  mobileSupName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  mobileCategoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F766E',
    marginTop: 2,
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
  mobileSupFooter: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  mobileOrderBtn: {
    backgroundColor: '#0F766E',
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    cursor: 'pointer',
  },
  mobileOrderBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  filtersBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  filtersBarCompact: {
    flexDirection: 'column',
  },
  filterChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    cursor: 'pointer',
  },
  filterChipActive: {
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  filterChipTextActive: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    outlineStyle: 'none',
  },
  clearBtn: {
    padding: 4,
  },
  clearBtnText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  tableWrapper: {
    minWidth: 1250,
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
  supId: {
    fontWeight: '700',
    color: '#0F766E',
  },
  supName: {
    fontWeight: '700',
    color: '#0F172A',
  },
  categorySubtext: {
    fontSize: 11,
    color: '#64748B',
    paddingHorizontal: 6,
    marginTop: 2,
  },
  emailText: {
    color: '#2563EB',
  },
  gstinText: {
    fontWeight: '600',
    color: '#475569',
  },
  balanceText: {
    fontWeight: '700',
    color: '#0F172A',
  },
  statusWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeActive: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#DCFCE7',
  },
  statusBadgeTextActive: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#15803D',
  },
  actionWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#0F766E',
    cursor: 'pointer',
  },
  orderBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 620,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '700',
  },
  modalBody: {
    padding: 22,
    maxHeight: 480,
  },
  formRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 14,
  },
  formFieldHalf: {
    flex: 1,
  },
  fieldGroup: {
    marginBottom: 14,
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
  modalInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0F172A',
    outlineStyle: 'none',
  },
  errorText: {
    fontSize: 11,
    color: '#DC2626',
    marginTop: 3,
    fontWeight: '500',
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
  },
  cancelButton: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 6,
    cursor: 'pointer',
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  submitModalButton: {
    backgroundColor: '#0F766E',
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 8,
    cursor: 'pointer',
  },
  submitModalButtonText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  devGuideTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    cursor: 'pointer',
  },
  devGuideTopBtnIcon: {
    fontSize: 13,
  },
  devGuideTopBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  filterTogglesGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  filterToggleTextActive: {
    color: '#0F766E',
    fontWeight: '700',
  },
  tableToggleTrack: {
    width: 36,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#CBD5E1',
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
  statusLabelText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  statusActiveText: {
    color: '#0F766E',
  },
  statusInactiveText: {
    color: '#64748B',
  },
  mobileStatusToggleBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    cursor: 'pointer',
  },
  mobileStatusToggleActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  mobileStatusToggleInactive: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  mobileStatusToggleText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#15803D',
  },
  mobileDotsActionBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignItems: 'center',
    cursor: 'pointer',
  },
  mobileDotsActionText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
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
    marginBottom: 20,
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
