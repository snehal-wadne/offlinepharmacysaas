import React, { useState } from 'react';
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
} from '../../data/suppliersMockData';

export default function SuppliersScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;

  const [searchQuery, setSearchQuery] = useState('');
  const [suppliers, setSuppliers] = useState(MOCK_SUPPLIERS_LIST);

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

  const filteredSuppliers = suppliers.filter((sup) => {
    const query = searchQuery.toLowerCase();
    return (
      sup.name.toLowerCase().includes(query) ||
      sup.contactPerson.toLowerCase().includes(query) ||
      sup.city.toLowerCase().includes(query) ||
      sup.gstin.toLowerCase().includes(query) ||
      sup.category.toLowerCase().includes(query)
    );
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

  const handleAddSupplier = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Supplier Name is required';
    if (!formData.contactPerson.trim()) errors.contactPerson = 'Contact person is required';
    if (!formData.phone.trim()) errors.phone = 'Phone number is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const newSup = {
      id: `SUP-00${suppliers.length + 1}`,
      name: formData.name,
      contactPerson: formData.contactPerson,
      phone: formData.phone,
      email: formData.email || 'info@supplier.com',
      city: formData.city || 'Mumbai, MH',
      gstin: formData.gstin || '27AAACB0000A1Z5',
      paymentTerms: formData.paymentTerms || 'Net 30',
      balance: '₹0.00',
      status: 'Active',
      category: formData.category || 'General Pharma',
    };

    setSuppliers((prev) => [newSup, ...prev]);
    setModalVisible(false);

    if (onShowToast) {
      onShowToast(`✓ Added vendor "${newSup.name}" to directory!`);
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
        {SUPPLIERS_KPIS.map((kpi) => (
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

      {/* Suppliers Table Card */}
      <View style={styles.cardContainer}>
        {/* Search Bar */}
        <View style={styles.filtersBar}>
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
        </View>

        {/* Directory Table */}
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <View style={styles.tableWrapper}>
            {/* Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.thCell, { width: 100 }]}>VENDOR ID</Text>
              <Text style={[styles.thCell, { width: 190 }]}>SUPPLIER NAME</Text>
              <Text style={[styles.thCell, { width: 140 }]}>CONTACT PERSON</Text>
              <Text style={[styles.thCell, { width: 130 }]}>PHONE</Text>
              <Text style={[styles.thCell, { width: 180 }]}>EMAIL</Text>
              <Text style={[styles.thCell, { width: 130 }]}>CITY</Text>
              <Text style={[styles.thCell, { width: 160 }]}>GSTIN</Text>
              <Text style={[styles.thCell, { width: 120, textAlign: 'right' }]}>OUTSTANDING</Text>
              <Text style={[styles.thCell, { width: 90, textAlign: 'center' }]}>STATUS</Text>
              <Text style={[styles.thCell, { width: 100, textAlign: 'center' }]}>ACTION</Text>
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
                  <Text style={[styles.tdCell, styles.supId, { width: 100 }]}>{sup.id}</Text>
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

                  {/* Status Badge */}
                  <View style={[styles.statusWrapper, { width: 90 }]}>
                    <View style={styles.statusBadgeActive}>
                      <Text style={styles.statusBadgeTextActive}>{sup.status}</Text>
                    </View>
                  </View>

                  {/* Action */}
                  <View style={[styles.actionWrapper, { width: 100 }]}>
                    <Pressable
                      onPress={() => handleCreatePOWithSupplier(sup)}
                      style={styles.orderBtn}
                    >
                      <Text style={styles.orderBtnText}>+ Order</Text>
                    </Pressable>
                  </View>
                </View>
              ))
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
  newSupButtonHovered: {
    backgroundColor: '#0D9488',
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
  filtersBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
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
});
