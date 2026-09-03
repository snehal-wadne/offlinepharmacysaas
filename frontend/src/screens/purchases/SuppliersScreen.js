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
import { MOCK_SUPPLIERS_LIST } from '../../data/suppliersMockData';
import {
  fetchSuppliers,
  createSupplier,
  updateSupplierStatus,
} from '../../api/purchaseApi';

const SUPPLIER_STATUS_FILTER = ['All Statuses', 'Active', 'Pending', 'Inactive'];

const SUPPLIER_STATUS_BADGES = {
  Active: { bg: '#DCFCE7', text: '#15803D', dot: '#16A34A' },
  Pending: { bg: '#FEF3C7', text: '#B45309', dot: '#F59E0B' },
  Inactive: { bg: '#F1F5F9', text: '#64748B', dot: '#94A3B8' },
};

export default function SuppliersScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('All Statuses');
  const [suppliers, setSuppliers] = useState(MOCK_SUPPLIERS_LIST);
  const [activeMenuId, setActiveMenuId] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function loadSuppliers() {
      try {
        const res = await fetchSuppliers();
        if (isMounted && res && res.data && res.data.length > 0) {
          const formatted = res.data.map((sup, idx) => ({
            realId: sup.id,
            id: `SUP-${String(idx + 1).padStart(3, '0')}`,
            name: sup.name,
            contactPerson: sup.contact_person || sup.contactPerson || 'N/A',
            phone: sup.phone || '+91 98XXX XXXXX',
            email: sup.email || 'orders@vendor.com',
            city: sup.city || 'Mumbai, MH',
            gstin: sup.gstin || '27AAACB0000A1Z5',
            paymentTerms: 'Net 30',
            balance: '₹0.00',
            status:
              sup.status === 'ACTIVE'
                ? 'Active'
                : sup.status === 'PENDING'
                ? 'Pending'
                : 'Inactive',
            category: 'Medicines & Injections',
          }));
          setSuppliers(formatted);
        }
      } catch (err) {
        console.log('[SuppliersScreen] Backend offline or using default mock data');
      }
    }
    loadSuppliers();
    return () => {
      isMounted = false;
    };
  }, []);

  const [modalVisible, setModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    city: '',
    gstin: '',
    paymentTerms: 'Net 30',
    category: 'Medicines & Injections',
  });
  const [formErrors, setFormErrors] = useState({});

  // Dynamic KPI calculations
  const totalVendors = suppliers.length;
  const activeVendors = suppliers.filter((s) => s.status === 'Active').length;
  const pendingVendors = suppliers.filter((s) => s.status === 'Pending').length;

  const dynamicKpis = [
    {
      id: 'total',
      label: 'TOTAL VENDORS',
      value: String(totalVendors),
      subtext: 'Active directory',
      variant: 'teal',
      filterKey: 'All Statuses',
    },
    {
      id: 'active',
      label: 'ACTIVE SUPPLIERS',
      value: String(activeVendors),
      subtext: 'Verified suppliers',
      variant: 'emerald',
      filterKey: 'Active',
    },
    {
      id: 'pending',
      label: 'PENDING APPROVALS',
      value: String(pendingVendors),
      subtext: 'Awaiting documentation',
      variant: 'amber',
      filterKey: 'Pending',
    },
    {
      id: 'outstanding',
      label: 'TOTAL OUTSTANDING',
      value: '₹1,42,850',
      subtext: 'Payable balance',
      variant: 'rose',
      filterKey: 'All Statuses',
    },
  ];

  const filteredSuppliers = suppliers.filter((sup) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      sup.name.toLowerCase().includes(query) ||
      sup.contactPerson.toLowerCase().includes(query) ||
      sup.city.toLowerCase().includes(query) ||
      sup.gstin.toLowerCase().includes(query) ||
      sup.category.toLowerCase().includes(query);

    const matchesStatus =
      selectedStatus === 'All Statuses' || sup.status === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  const handleOpenModal = () => {
    setFormData({
      name: '',
      contactPerson: '',
      phone: '',
      email: '',
      city: '',
      gstin: '',
      paymentTerms: 'Net 30',
      category: 'Medicines & Injections',
    });
    setFormErrors({});
    setModalVisible(true);
  };

  const handleAddSupplier = async () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Supplier Name is required';
    if (!formData.contactPerson.trim()) errors.contactPerson = 'Contact person is required';
    if (!formData.phone.trim()) errors.phone = 'Phone number is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const tempId = `SUP-${String(suppliers.length + 1).padStart(3, '0')}`;
    const newSup = {
      realId: tempId,
      id: tempId,
      name: formData.name,
      contactPerson: formData.contactPerson,
      phone: formData.phone,
      email: formData.email || 'info@supplier.com',
      city: formData.city || 'Mumbai, MH',
      gstin: formData.gstin || '27AAACB0000A1Z5',
      paymentTerms: formData.paymentTerms || 'Net 30',
      balance: '₹0.00',
      status: 'Active',
      category: formData.category || 'Medicines & Injections',
    };

    try {
      const res = await createSupplier({
        name: formData.name,
        contactPerson: formData.contactPerson,
        phone: formData.phone,
        email: formData.email,
        city: formData.city,
        gstin: formData.gstin,
        status: 'ACTIVE',
      });
      if (res && res.data && res.data.id) {
        newSup.realId = res.data.id;
      }
    } catch (err) {
      console.warn('[SuppliersScreen] Backend save failed, updated local state:', err.message);
    }

    setSuppliers((prev) => [newSup, ...prev]);
    setModalVisible(false);

    if (onShowToast) {
      onShowToast(`✓ Added vendor "${newSup.name}" to directory!`);
    }
  };

  const handleStatusChange = async (supItem, newStatus) => {
    setActiveMenuId(null);
    const targetId = supItem.realId || supItem.name;

    try {
      await updateSupplierStatus(targetId, newStatus);
    } catch (err) {
      console.warn('[SuppliersScreen] Backend status update failed, updated local state:', err.message);
    }

    setSuppliers((prev) =>
      prev.map((item) =>
        item.id === supItem.id ? { ...item, status: newStatus } : item
      )
    );

    if (onShowToast) {
      onShowToast(`✓ Updated vendor "${supItem.name}" status to ${newStatus}`);
    }
  };

  const handleCreatePOWithSupplier = (sup) => {
    if (onNavigate) {
      onNavigate('purchases');
    }
    if (onShowToast) {
      onShowToast(`Create PO for ${sup.name}`);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={true}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.pageTitle}>Suppliers Directory</Text>
          <Text style={styles.pageSubtitle}>
            Manage pharmaceutical manufacturers, distributors, GSTIN tax records, and vendor terms.
          </Text>
        </View>
        <Pressable
          onPress={handleOpenModal}
          style={styles.newSupButton}
          accessibilityRole="button"
          accessibilityLabel="+ Add Supplier"
        >
          <Text style={styles.newSupIcon}>+</Text>
          <Text style={styles.newSupText}>Add Supplier</Text>
        </Pressable>
      </View>

      {/* Top 4 KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {dynamicKpis.map((kpi) => (
          <InventoryStatCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            subtext={kpi.subtext}
            variant={kpi.variant}
            onPress={() => setSelectedStatus(kpi.filterKey)}
          />
        ))}
      </View>

      {/* Suppliers Table Card */}
      <View style={styles.cardContainer}>
        {/* Filters Bar */}
        <View style={[styles.filtersBar, isCompact && styles.filtersBarCompact]}>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search supplier name, contact person, city or GSTIN..."
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

          {/* Status Filter Chips */}
          <View style={styles.filterChipRow}>
            {SUPPLIER_STATUS_FILTER.map((st) => (
              <Pressable
                key={st}
                onPress={() => setSelectedStatus(st)}
                style={[
                  styles.filterChip,
                  selectedStatus === st && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedStatus === st && styles.filterChipTextActive,
                  ]}
                >
                  {st}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Directory Table */}
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <View style={styles.tableWrapper}>
            {/* Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.thCell, { width: 90 }]}>VENDOR ID</Text>
              <Text style={[styles.thCell, { width: 180 }]}>SUPPLIER NAME</Text>
              <Text style={[styles.thCell, { width: 130 }]}>CONTACT PERSON</Text>
              <Text style={[styles.thCell, { width: 120 }]}>PHONE</Text>
              <Text style={[styles.thCell, { width: 170 }]}>EMAIL</Text>
              <Text style={[styles.thCell, { width: 120 }]}>CITY</Text>
              <Text style={[styles.thCell, { width: 150 }]}>GSTIN</Text>
              <Text style={[styles.thCell, { width: 110, textAlign: 'right' }]}>OUTSTANDING</Text>
              <Text style={[styles.thCell, { width: 110, textAlign: 'center' }]}>STATUS</Text>
              <Text style={[styles.thCell, { width: 60, textAlign: 'center' }]}>ACTION</Text>
              <Text style={[styles.thCell, { width: 90, textAlign: 'center' }]}>ORDER</Text>
            </View>

            {/* Rows */}
            {filteredSuppliers.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No suppliers found</Text>
                <Text style={styles.emptySubtitle}>Try changing your search terms or status filter.</Text>
              </View>
            ) : (
              filteredSuppliers.map((sup, index) => {
                const badge =
                  SUPPLIER_STATUS_BADGES[sup.status] || SUPPLIER_STATUS_BADGES.Active;
                const isMenuOpen = activeMenuId === sup.id;

                return (
                  <View
                    key={sup.id}
                    style={[
                      styles.tableRow,
                      index % 2 === 1 && styles.tableRowAlt,
                      { zIndex: isMenuOpen ? 999 : 1 },
                    ]}
                  >
                    <Text style={[styles.tdCell, styles.supId, { width: 90 }]}>{sup.id}</Text>
                    <View style={[{ width: 180 }]}>
                      <Text style={[styles.tdCell, styles.supName]} numberOfLines={1}>
                        {sup.name}
                      </Text>
                      <Text style={styles.categorySubtext}>{sup.category}</Text>
                    </View>
                    <Text style={[styles.tdCell, { width: 130 }]}>{sup.contactPerson}</Text>
                    <Text style={[styles.tdCell, { width: 120 }]}>{sup.phone}</Text>
                    <Text style={[styles.tdCell, styles.emailText, { width: 170 }]} numberOfLines={1}>
                      {sup.email}
                    </Text>
                    <Text style={[styles.tdCell, { width: 120 }]}>{sup.city}</Text>
                    <Text style={[styles.tdCell, styles.gstinText, { width: 150 }]}>{sup.gstin}</Text>
                    <Text style={[styles.tdCell, styles.balanceText, { width: 110, textAlign: 'right' }]}>
                      {sup.balance}
                    </Text>

                    {/* Status Badge */}
                    <View style={[styles.statusWrapper, { width: 110 }]}>
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                          {sup.status}
                        </Text>
                      </View>
                    </View>

                    {/* 3-Dots Action Column */}
                    <View style={[styles.actionWrapper, { width: 60 }]}>
                      <Pressable
                        onPress={() =>
                          setActiveMenuId((prev) => (prev === sup.id ? null : sup.id))
                        }
                        style={styles.threeDotsBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Action menu"
                      >
                        <Text style={styles.threeDotsText}>⋮</Text>
                      </Pressable>

                      {/* Dropdown Menu */}
                      {isMenuOpen && (
                        <View style={styles.menuPopover}>
                          <Text style={styles.menuHeaderTitle}>Update Status</Text>

                          <Pressable
                            style={styles.menuItem}
                            onPress={() => handleStatusChange(sup, 'Active')}
                          >
                            <View
                              style={[
                                styles.menuDot,
                                { backgroundColor: SUPPLIER_STATUS_BADGES['Active'].dot },
                              ]}
                            />
                            <Text
                              style={[
                                styles.menuItemText,
                                sup.status === 'Active' && styles.menuItemTextActive,
                              ]}
                            >
                              Active
                            </Text>
                          </Pressable>

                          <Pressable
                            style={styles.menuItem}
                            onPress={() => handleStatusChange(sup, 'Pending')}
                          >
                            <View
                              style={[
                                styles.menuDot,
                                { backgroundColor: SUPPLIER_STATUS_BADGES['Pending'].dot },
                              ]}
                            />
                            <Text
                              style={[
                                styles.menuItemText,
                                sup.status === 'Pending' && styles.menuItemTextActive,
                              ]}
                            >
                              Pending
                            </Text>
                          </Pressable>

                          <Pressable
                            style={styles.menuItem}
                            onPress={() => handleStatusChange(sup, 'Inactive')}
                          >
                            <View
                              style={[
                                styles.menuDot,
                                { backgroundColor: SUPPLIER_STATUS_BADGES['Inactive'].dot },
                              ]}
                            />
                            <Text
                              style={[
                                styles.menuItemText,
                                sup.status === 'Inactive' && styles.menuItemTextActive,
                              ]}
                            >
                              Inactive
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </View>

                    {/* Create PO Order Button */}
                    <View style={[styles.actionWrapper, { width: 90 }]}>
                      <Pressable
                        onPress={() => handleCreatePOWithSupplier(sup)}
                        style={styles.orderBtn}
                      >
                        <Text style={styles.orderBtnText}>+ Order</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </View>

      {/* Add Supplier Modal */}
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
              <Text style={styles.modalTitle}>Add New Pharmaceutical Supplier</Text>
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
                  <Text style={styles.fieldLabel}>
                    Contact Person <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g., Ramesh Gupta"
                    placeholderTextColor="#94A3B8"
                    value={formData.contactPerson}
                    onChangeText={(t) => setFormData((p) => ({ ...p, contactPerson: t }))}
                  />
                  {formErrors.contactPerson && (
                    <Text style={styles.errorText}>{formErrors.contactPerson}</Text>
                  )}
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Phone Number <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="+91 98XXX XXXXX"
                    placeholderTextColor="#94A3B8"
                    value={formData.phone}
                    onChangeText={(t) => setFormData((p) => ({ ...p, phone: t }))}
                  />
                  {formErrors.phone && <Text style={styles.errorText}>{formErrors.phone}</Text>}
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
                    value={formData.paymentTerms}
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
                onPress={handleAddSupplier}
                style={styles.submitModalButton}
              >
                <Text style={styles.submitModalButtonText}>Save Supplier</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
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
  newSupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: 'pointer',
  },
  newSupIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 6,
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
    overflow: 'visible',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  filtersBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  filtersBarCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  searchBox: {
    flex: 1,
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
  filterChipRow: {
    flexDirection: 'row',
    gap: 8,
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
  tableWrapper: {
    minWidth: 1280,
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
    position: 'relative',
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
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  actionWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  threeDotsBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    cursor: 'pointer',
  },
  threeDotsText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#64748B',
  },
  menuPopover: {
    position: 'absolute',
    right: 0,
    top: 36,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    zIndex: 1000,
    width: 150,
    paddingVertical: 6,
    ...Platform.select({
      web: {
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      },
      default: {
        elevation: 8,
      },
    }),
  },
  menuHeaderTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    paddingHorizontal: 12,
    paddingVertical: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
    cursor: 'pointer',
  },
  menuDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  menuItemText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#334155',
  },
  menuItemTextActive: {
    fontWeight: '700',
    color: '#0F172A',
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
});

