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
  CUSTOMERS_KPIS,
  PATIENT_TYPE_FILTER,
  MOCK_CUSTOMERS_LIST,
  MOCK_PATIENT_PURCHASE_HISTORY,
} from '../../data/customersMockData';

export default function CustomersPatientsScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isCompact = width < 1100;

  // Search & Filter State (RX-04)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Customers');

  // Customers Data List
  const [customers, setCustomers] = useState(MOCK_CUSTOMERS_LIST);

  // Modal 1: Add/Edit Customer Profile Modal (RX-01, RX-02, RX-03, RX-06)
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    age: '',
    gender: 'Male',
    category: 'Regular',
    city: 'Mumbai, MH',
    address: '',
    doctorName: '',
    doctorSpecialization: '',
    hospitalClinic: '',
    doctorRegNo: '',
    activeRxNo: '',
    chronicConditions: '',
    allergies: '',
    creditAllowed: true,
    creditLimit: '15000',
  });
  const [formErrors, setFormErrors] = useState({});

  // Modal 2: Customer History & Prescription Details Modal (RX-03, RX-05)
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);

  // Filtered Customers List
  const filteredCustomers = customers.filter((cust) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      cust.name.toLowerCase().includes(query) ||
      cust.phone.toLowerCase().includes(query) ||
      cust.id.toLowerCase().includes(query) ||
      cust.doctorName.toLowerCase().includes(query) ||
      cust.city.toLowerCase().includes(query);

    const matchesCategory =
      selectedCategory === 'All Customers' || selectedCategory === 'All Patients' ||
      (selectedCategory === 'Credit Allowed' ? cust.creditAllowed : cust.category === selectedCategory);

    return matchesSearch && matchesCategory;
  });

  const handleOpenAddModal = () => {
    setFormData({
      name: '',
      phone: '',
      email: '',
      age: '',
      gender: 'Male',
      category: 'Regular',
      city: 'Mumbai, MH',
      address: '',
      doctorName: '',
      doctorSpecialization: '',
      hospitalClinic: '',
      doctorRegNo: '',
      activeRxNo: `Rx-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      chronicConditions: '',
      allergies: '',
      creditAllowed: true,
      creditLimit: '15000',
    });
    setFormErrors({});
    setAddModalVisible(true);
  };

  const handleSavePatient = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Customer Full Name is required';
    if (!formData.phone.trim()) errors.phone = 'Phone number is required';
    if (!formData.age.trim() || isNaN(formData.age)) errors.age = 'Valid age required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const newPatient = {
      id: `CUST-${1040 + customers.length + 1}`,
      name: formData.name,
      phone: formData.phone,
      email: formData.email || 'customer@mail.com',
      age: formData.age,
      gender: formData.gender,
      category: formData.category,
      city: formData.city,
      address: formData.address || 'Local Resident',
      doctorName: formData.doctorName || 'Dr. General Prescriber',
      doctorSpecialization: formData.doctorSpecialization || 'General Medicine',
      hospitalClinic: formData.hospitalClinic || 'City Hospital',
      doctorRegNo: formData.doctorRegNo || 'MCI-MH-10029',
      activeRxNo: formData.activeRxNo,
      rxDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      rxExpiry: '6 Months',
      chronicConditions: formData.chronicConditions || 'None Reported',
      allergies: formData.allergies || 'None',
      rxDocumentName: 'Rx_Attached_Doc.pdf',
      creditAllowed: formData.creditAllowed,
      creditLimit: formData.creditAllowed ? `₹${Number(formData.creditLimit).toLocaleString('en-IN')}` : '₹0 (Cash Only)',
      currentOutstanding: '₹0.00',
      creditAging: 'Settled',
      totalPurchases: '₹0.00',
      lastPurchaseDate: 'New Customer',
      totalInvoices: 0,
      loyaltyPoints: 50,
      status: 'Active',
    };

    setCustomers((prev) => [newPatient, ...prev]);
    setAddModalVisible(false);

    if (onShowToast) {
      onShowToast(`✓ Added customer profile "${newPatient.name}" (${newPatient.id}) with Rx details!`);
    }
  };

  const handleViewPatientDetails = (cust) => {
    setSelectedPatient(cust);
    setHistoryModalVisible(true);
  };

  const handleOpenCustomerDetailsPage = (cust) => {
    if (onNavigate) {
      onNavigate('customer-details', cust.id);
    }
  };

  const handleExportData = (type) => {
    if (onShowToast) {
      onShowToast(`✓ Exported ${filteredCustomers.length} customer records as ${type.toUpperCase()}! (RX-07 Audit Logged)`);
    }
  };

  const handleAttachToPOS = (cust) => {
    if (onNavigate) {
      onNavigate('dashboard');
    }
    if (onShowToast) {
      onShowToast(`✓ Selected customer "${cust.name}" attached to active sale transaction! (RX-01 & RX-04)`);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        isMobile && styles.contentContainerMobile,
      ]}
      showsVerticalScrollIndicator={true}
    >
      {/* Professional Page Header */}
      <View style={[styles.headerRow, isMobile && styles.headerRowMobile]}>
        <View style={styles.headerTitleBox}>
          <View style={styles.titleBadgeRow}>
            <Text style={styles.pageTitle}>Customers Directory</Text>
            <View style={styles.liveTagBadge}>
              <Text style={styles.liveTagText}>CUSTOMER MODULE</Text>
            </View>
          </View>
          <Text style={styles.pageSubtitle}>
            Customer profiles, prescriber records (RX-02), prescriptions (RX-03), and purchase history.
          </Text>
        </View>

        <View style={[styles.headerActions, isMobile && styles.headerActionsMobile]}>
          <Pressable
            onPress={() => handleExportData('csv')}
            style={styles.exportBtnSecondary}
            accessibilityRole="button"
          >
            <Text style={styles.exportBtnTextSecondary}>Export CSV</Text>
          </Pressable>

          <Pressable
            onPress={handleOpenAddModal}
            style={styles.newPatientBtn}
            accessibilityRole="button"
            accessibilityLabel="+ Add Customer"
          >
            <Text style={styles.newPatientIcon}>+</Text>
            <Text style={styles.newPatientText}>Add Customer</Text>
          </Pressable>
        </View>
      </View>

      {/* Top 4 Responsive KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {CUSTOMERS_KPIS.map((kpi) => (
          <View
            key={kpi.id}
            style={[styles.kpiCol, isMobile && styles.kpiColMobile]}
          >
            <InventoryStatCard
              label={kpi.label === 'Total Registered Patients' ? 'Total Customers' : kpi.label}
              value={kpi.value}
              subtext={kpi.subtext}
              variant={kpi.variant}
              onPress={() => onShowToast && onShowToast(`Filter: ${kpi.label}`)}
            />
          </View>
        ))}
      </View>

      {/* Main Directory Card */}
      <View style={styles.cardContainer}>
        {/* Search & Filter Header (RX-04) */}
        <View style={[styles.filtersBar, isCompact && styles.filtersBarCompact]}>
          <View style={[styles.searchBox, isMobile && styles.searchBoxMobile]}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search customer name, phone, ID, doctor or city..."
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

          {/* Filter Category Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipScroll}>
            <View style={styles.filterChipRow}>
              {PATIENT_TYPE_FILTER.map((cat) => {
                const chipLabel = cat === 'All Patients' ? 'All Customers' : cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setSelectedCategory(cat)}
                    style={[
                      styles.filterChip,
                      (selectedCategory === cat || (selectedCategory === 'All Customers' && cat === 'All Patients')) && styles.filterChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        (selectedCategory === cat || (selectedCategory === 'All Customers' && cat === 'All Patients')) && styles.filterChipTextActive,
                      ]}
                    >
                      {chipLabel}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* Section Title & Pagination Subheader */}
        <View style={styles.tableSubheader}>
          <Text style={styles.sectionTitle}>Customer Accounts & Prescriptions</Text>
          <Text style={styles.paginationInfo}>Showing 1-{filteredCustomers.length} of {customers.length} records</Text>
        </View>

        {isMobile ? (
          /* Mobile Customer Cards */
          <View style={styles.mobileCardList}>
            {filteredCustomers.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No customer records found</Text>
                <Text style={styles.emptySubtitle}>Try changing your search keywords or filter selections.</Text>
              </View>
            ) : (
              filteredCustomers.map((cust) => {
                const isOverdue = cust.status === 'Overdue';
                return (
                  <View key={cust.id} style={styles.mobileCustomerCard}>
                    <View style={styles.mobileCustHeader}>
                      <Pressable onPress={() => handleOpenCustomerDetailsPage(cust)} style={{ flex: 1 }}>
                        <Text style={styles.mobileCustName}>{cust.name}</Text>
                        <Text style={styles.mobileCustSub}>{cust.id} • {cust.category} • {cust.age}y/{cust.gender === 'Male' ? 'M' : 'F'}</Text>
                      </Pressable>
                      <View style={[styles.statusBadgeActive, isOverdue && styles.statusBadgeOverdue]}>
                        <Text style={[styles.statusBadgeTextActive, isOverdue && styles.statusBadgeTextOverdue]}>
                          {cust.status}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.mobileGrid}>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Phone</Text>
                        <Text style={styles.mobileValBold}>{cust.phone}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Active Rx No</Text>
                        <Text style={[styles.mobileValBold, { color: '#0F766E' }]}>{cust.activeRxNo}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Doctor / Clinic</Text>
                        <Text style={styles.mobileVal} numberOfLines={1}>{cust.doctorName}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Outstanding Due</Text>
                        <Text style={[styles.mobileValBold, { color: cust.currentOutstanding !== '₹0.00' ? '#DC2626' : '#16A34A' }]}>
                          {cust.currentOutstanding}
                        </Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Credit Limit</Text>
                        <Text style={styles.mobileVal}>{cust.creditLimit}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Total Spent</Text>
                        <Text style={styles.mobileValBold}>{cust.totalSpent}</Text>
                      </View>
                    </View>

                    <View style={styles.mobileCustFooter}>
                      <Pressable
                        onPress={() => handleAttachToPOS(cust)}
                        style={styles.mobileAttachPOSBtn}
                        accessibilityRole="button"
                      >
                        <Text style={styles.mobileAttachPOSText}>+ Attach to POS Bill</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleOpenCustomerDetailsPage(cust)}
                        style={styles.mobileHistoryBtn}
                        accessibilityRole="button"
                      >
                        <Text style={styles.mobileHistoryBtnText}>Profile →</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          /* Desktop Responsive Customers Directory Table */
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              {/* Table Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { width: 100 }]}>CUSTOMER ID</Text>
                <Text style={[styles.thCell, { width: 180 }]}>CUSTOMER NAME</Text>
                <Text style={[styles.thCell, { width: 130 }]}>PHONE</Text>
                <Text style={[styles.thCell, { width: 90, textAlign: 'center' }]}>AGE / GENDER</Text>
                <Text style={[styles.thCell, { width: 160 }]}>DOCTOR (RX-02)</Text>
                <Text style={[styles.thCell, { width: 120 }]}>ACTIVE RX NO</Text>
                <Text style={[styles.thCell, { width: 110, textAlign: 'right' }]}>CREDIT LIMIT</Text>
                <Text style={[styles.thCell, { width: 110, textAlign: 'right' }]}>OUTSTANDING</Text>
                <Text style={[styles.thCell, { width: 110, textAlign: 'right' }]}>TOTAL SPENT</Text>
                <Text style={[styles.thCell, { width: 90, textAlign: 'center' }]}>STATUS</Text>
                <Text style={[styles.thCell, { width: 150, textAlign: 'center' }]}>ACTIONS</Text>
              </View>

              {/* Table Rows */}
              {filteredCustomers.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No customer records found</Text>
                  <Text style={styles.emptySubtitle}>Try changing your search keywords or filter selections.</Text>
                </View>
              ) : (
                filteredCustomers.map((cust, index) => {
                  const isOverdue = cust.status === 'Overdue';
                  return (
                    <View
                      key={cust.id}
                      style={[
                        styles.tableRow,
                        index % 2 === 1 && styles.tableRowAlt,
                      ]}
                    >
                      <Text style={[styles.tdCell, styles.patientIdText, { width: 100 }]}>
                        {cust.id}
                      </Text>

                      <Pressable
                        onPress={() => handleOpenCustomerDetailsPage(cust)}
                        style={[{ width: 180, cursor: 'pointer' }]}
                      >
                        <Text style={[styles.tdCell, styles.patientNameText, { color: '#0F766E' }]} numberOfLines={1}>
                          {cust.name}
                        </Text>
                        <Text style={styles.categorySubtext}>{cust.category}</Text>
                      </Pressable>

                      <Text style={[styles.tdCell, styles.phoneText, { width: 130 }]}>
                        {cust.phone}
                      </Text>

                      <Text style={[styles.tdCell, { width: 90, textAlign: 'center' }]}>
                        {cust.age} / {cust.gender === 'Male' ? 'M' : 'F'}
                      </Text>

                      <View style={[{ width: 160 }]}>
                        <Text style={[styles.tdCell, styles.docNameText]} numberOfLines={1}>
                          {cust.doctorName}
                        </Text>
                        <Text style={styles.docSpecSubtext} numberOfLines={1}>
                          {cust.doctorSpecialization}
                        </Text>
                      </View>

                      <View style={[{ width: 120 }]}>
                        <Text style={[styles.tdCell, styles.rxTagText]}>
                          {cust.activeRxNo}
                        </Text>
                      </View>

                      <Text style={[styles.tdCell, { width: 110, textAlign: 'right', fontWeight: '600' }]}>
                        {cust.creditLimit}
                      </Text>

                      <Text
                        style={[
                          styles.tdCell,
                          {
                            width: 110,
                            textAlign: 'right',
                            fontWeight: '700',
                            color: cust.currentOutstanding !== '₹0.00' ? '#DC2626' : '#334155',
                          },
                        ]}
                      >
                        {cust.currentOutstanding}
                      </Text>

                      <Text style={[styles.tdCell, { width: 110, textAlign: 'right', fontWeight: '600' }]}>
                        {cust.totalSpent}
                      </Text>

                      {/* Status Badge */}
                      <View style={[styles.statusWrapper, { width: 90 }]}>
                        <View style={[styles.statusBadgeActive, isOverdue && styles.statusBadgeOverdue]}>
                          <Text
                            style={[
                              styles.statusBadgeTextActive,
                              isOverdue && styles.statusBadgeTextOverdue,
                            ]}
                          >
                            {cust.status}
                          </Text>
                        </View>
                      </View>

                      {/* Actions */}
                      <View style={[styles.actionWrapper, { width: 150 }]}>
                        <Pressable
                          onPress={() => handleAttachToPOS(cust)}
                          style={styles.attachPOSButton}
                          accessibilityRole="button"
                          accessibilityLabel="Attach to POS"
                        >
                          <Text style={styles.attachPOSButtonText}>+ POS</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => handleOpenCustomerDetailsPage(cust)}
                          style={styles.viewHistoryButton}
                          accessibilityRole="button"
                          accessibilityLabel="View Customer Details"
                        >
                          <Text style={styles.viewHistoryButtonText}>Details</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        )}
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Modal 1: Add New Customer Profile Modal (RX-01, RX-02, RX-03, RX-06) */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setAddModalVisible(false)}>
          <Pressable style={[styles.modalCardLarge, isMobile && styles.modalCardMobile]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Add Customer Profile</Text>
                <Text style={styles.modalSubtitle}>
                  Demographics, prescriber details (RX-02), and Rx parameters (RX-03).
                </Text>
              </View>
              <Pressable onPress={() => setAddModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.sectionHeading}>1. Demographics & Contact</Text>
              <View style={[styles.formRow, isMobile && styles.formRowMobile]}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Full Name <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.modalInput, formErrors.name && styles.inputError]}
                    placeholder="e.g., Rajesh Verma"
                    placeholderTextColor="#94A3B8"
                    value={formData.name}
                    onChangeText={(t) => setFormData((p) => ({ ...p, name: t }))}
                  />
                  {formErrors.name && <Text style={styles.errorText}>{formErrors.name}</Text>}
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Phone Number <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.modalInput, formErrors.phone && styles.inputError]}
                    placeholder="+91 98XXX XXXXX"
                    placeholderTextColor="#94A3B8"
                    value={formData.phone}
                    onChangeText={(t) => setFormData((p) => ({ ...p, phone: t }))}
                  />
                  {formErrors.phone && <Text style={styles.errorText}>{formErrors.phone}</Text>}
                </View>
              </View>

              <View style={[styles.formRow, isMobile && styles.formRowMobile]}>
                <View style={styles.formFieldThird}>
                  <Text style={styles.fieldLabel}>
                    Age <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.modalInput, formErrors.age && styles.inputError]}
                    placeholder="e.g. 45"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={formData.age}
                    onChangeText={(t) => setFormData((p) => ({ ...p, age: t }))}
                  />
                  {formErrors.age && <Text style={styles.errorText}>{formErrors.age}</Text>}
                </View>

                <View style={styles.formFieldThird}>
                  <Text style={styles.fieldLabel}>Gender</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Male / Female / Other"
                    placeholderTextColor="#94A3B8"
                    value={formData.gender}
                    onChangeText={(t) => setFormData((p) => ({ ...p, gender: t }))}
                  />
                </View>

                <View style={styles.formFieldThird}>
                  <Text style={styles.fieldLabel}>Customer Category</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Regular / Chronic Care"
                    placeholderTextColor="#94A3B8"
                    value={formData.category}
                    onChangeText={(t) => setFormData((p) => ({ ...p, category: t }))}
                  />
                </View>
              </View>

              <Text style={styles.sectionHeading}>2. Prescriber & Clinic Details (RX-02)</Text>
              <View style={[styles.formRow, isMobile && styles.formRowMobile]}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Attending Doctor / Prescriber</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g., Dr. Amitabh Sharma"
                    placeholderTextColor="#94A3B8"
                    value={formData.doctorName}
                    onChangeText={(t) => setFormData((p) => ({ ...p, doctorName: t }))}
                  />
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Specialization</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g., Cardiologist / Diabetologist"
                    placeholderTextColor="#94A3B8"
                    value={formData.doctorSpecialization}
                    onChangeText={(t) => setFormData((p) => ({ ...p, doctorSpecialization: t }))}
                  />
                </View>
              </View>

              <Text style={styles.sectionHeading}>3. Prescription & Clinical Notes (RX-03)</Text>
              <View style={[styles.formRow, isMobile && styles.formRowMobile]}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Prescription Ref No.</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g., Rx-2026-0841"
                    placeholderTextColor="#94A3B8"
                    value={formData.activeRxNo}
                    onChangeText={(t) => setFormData((p) => ({ ...p, activeRxNo: t }))}
                  />
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Credit Limit Allowed (₹) (RX-06)</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    placeholder="e.g., 25000"
                    placeholderTextColor="#94A3B8"
                    value={formData.creditLimit}
                    onChangeText={(t) => setFormData((p) => ({ ...p, creditLimit: t }))}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable onPress={() => setAddModalVisible(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSavePatient} style={styles.submitModalBtn}>
                <Text style={styles.submitModalBtnText}>Save Customer Profile</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal 2: Customer Prescription & Purchase History Modal */}
      {selectedPatient && (
        <Modal
          visible={historyModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setHistoryModalVisible(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setHistoryModalVisible(false)}>
            <Pressable style={[styles.modalCardLarge, isMobile && styles.modalCardMobile]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Customer Record & Details</Text>
                  <Text style={styles.modalSubtitle}>
                    {selectedPatient.name} ({selectedPatient.id}) • Phone: {selectedPatient.phone}
                  </Text>
                </View>
                <Pressable onPress={() => setHistoryModalVisible(false)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.rxDetailsBox}>
                  <Text style={styles.rxBoxTitle}>Active Prescription & Prescriber (RX-02 & RX-03)</Text>
                  <View style={styles.rxGrid}>
                    <View style={styles.rxItem}>
                      <Text style={styles.rxLabel}>Prescribing Doctor:</Text>
                      <Text style={styles.rxValue}>{selectedPatient.doctorName} ({selectedPatient.doctorSpecialization})</Text>
                    </View>
                    <View style={styles.rxItem}>
                      <Text style={styles.rxLabel}>Hospital / Clinic:</Text>
                      <Text style={styles.rxValue}>{selectedPatient.hospitalClinic}</Text>
                    </View>
                    <View style={styles.rxItem}>
                      <Text style={styles.rxLabel}>MCI Reg No:</Text>
                      <Text style={styles.rxValue}>{selectedPatient.doctorRegNo}</Text>
                    </View>
                    <View style={styles.rxItem}>
                      <Text style={styles.rxLabel}>Active Rx Ref:</Text>
                      <Text style={styles.rxValueHighlight}>{selectedPatient.activeRxNo}</Text>
                    </View>
                  </View>

                  <View style={styles.docAttachmentBar}>
                    <Text style={styles.docAttachmentLabel}>📎 Attached Rx Document:</Text>
                    <Text style={styles.docAttachmentName}>{selectedPatient.rxDocumentName}</Text>
                    <Pressable
                      onPress={() => onShowToast && onShowToast(`Previewing ${selectedPatient.rxDocumentName} (Read-only view)`)}
                      style={styles.previewDocBtn}
                    >
                      <Text style={styles.previewDocText}>View Rx Document</Text>
                    </Pressable>
                  </View>
                </View>

                <Text style={styles.sectionHeading}>Prior Purchase Invoices (RX-05)</Text>
                {MOCK_PATIENT_PURCHASE_HISTORY[selectedPatient.id] ? (
                  <View style={styles.historyTableWrapper}>
                    <View style={styles.historyTableHeader}>
                      <Text style={[styles.hThCell, { width: 120 }]}>INVOICE NO</Text>
                      <Text style={[styles.hThCell, { width: 100 }]}>DATE</Text>
                      <Text style={[styles.hThCell, { width: 240 }]}>MEDICINES</Text>
                      <Text style={[styles.hThCell, { width: 90, textAlign: 'right' }]}>AMOUNT</Text>
                      <Text style={[styles.hThCell, { width: 110 }]}>PAYMENT</Text>
                    </View>

                    {MOCK_PATIENT_PURCHASE_HISTORY[selectedPatient.id].map((inv) => (
                      <View key={inv.invoiceNo} style={styles.historyTableRow}>
                        <Text style={[styles.hTdCell, styles.invNoText, { width: 120 }]}>{inv.invoiceNo}</Text>
                        <Text style={[styles.hTdCell, { width: 100 }]}>{inv.date}</Text>
                        <Text style={[styles.hTdCell, { width: 240 }]} numberOfLines={1}>{inv.items}</Text>
                        <Text style={[styles.hTdCell, styles.amountText, { width: 90, textAlign: 'right' }]}>{inv.amount}</Text>
                        <Text style={[styles.hTdCell, { width: 110 }]}>{inv.paymentMode}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.noHistoryBox}>
                    <Text style={styles.noHistoryText}>No prior purchases recorded for this new customer.</Text>
                  </View>
                )}
              </ScrollView>

              <View style={styles.modalFooter}>
                <Pressable onPress={() => setHistoryModalVisible(false)} style={styles.submitModalBtn}>
                  <Text style={styles.submitModalBtnText}>Close Record</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
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
    paddingBottom: 24,
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
  },
  headerTitleBox: {
    flex: 1,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  liveTagBadge: {
    backgroundColor: '#CCFBF1',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  liveTagText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F766E',
    letterSpacing: 0.5,
  },
  pageSubtitle: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerActionsMobile: {
    justifyContent: 'space-between',
    width: '100%',
  },
  exportBtnSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    cursor: 'pointer',
  },
  exportBtnTextSecondary: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  newPatientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: 'pointer',
  },
  newPatientIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 6,
  },
  newPatientText: {
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
  kpiCol: {
    flex: 1,
    minWidth: 220,
  },
  kpiColMobile: {
    minWidth: '47%',
    maxWidth: '48.5%',
  },
  /* Mobile Customer Card Styles */
  mobileCardList: {
    padding: 12,
    gap: 12,
  },
  mobileCustomerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  mobileCustHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  mobileCustName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  mobileCustSub: {
    fontSize: 12,
    color: '#64748B',
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
  mobileCustFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  mobileAttachPOSBtn: {
    flex: 1,
    backgroundColor: '#0F766E',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  mobileAttachPOSText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  mobileHistoryBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignItems: 'center',
  },
  mobileHistoryBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
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
  searchBoxMobile: {
    width: '100%',
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
  filterChipScroll: {
    maxHeight: 44,
  },
  filterChipRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
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
  tableSubheader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  paginationInfo: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#64748B',
  },
  tableWrapper: {
    minWidth: 1380,
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
  patientIdText: {
    fontWeight: '700',
    color: '#0F766E',
  },
  patientNameText: {
    fontWeight: '700',
    color: '#0F172A',
  },
  categorySubtext: {
    fontSize: 11,
    color: '#64748B',
    paddingHorizontal: 6,
    marginTop: 2,
  },
  phoneText: {
    fontWeight: '600',
    color: '#475569',
  },
  docNameText: {
    fontWeight: '600',
    color: '#0F172A',
  },
  docSpecSubtext: {
    fontSize: 11,
    color: '#0284C7',
    paddingHorizontal: 6,
  },
  rxTagText: {
    fontWeight: '700',
    color: '#0F766E',
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 11.5,
  },
  amountSpentText: {
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
  statusBadgeActive: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeOverdue: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  statusTextActive: {
    color: '#15803D',
  },
  statusTextOverdue: {
    color: '#B91C1C',
  },
  actionsCellWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  viewRxBtn: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    cursor: 'pointer',
  },
  viewRxBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
  },
  posAttachBtn: {
    backgroundColor: '#0F766E',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    cursor: 'pointer',
  },
  posAttachBtnText: {
    fontSize: 11,
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
    padding: 16,
  },
  modalCardLarge: {
    width: '100%',
    maxWidth: 740,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      },
    }),
  },
  modalCardMobile: {
    maxWidth: '100%',
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
  modalSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 2,
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
    maxHeight: 520,
  },
  sectionHeading: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F766E',
    marginTop: 10,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 12,
  },
  formRowMobile: {
    flexDirection: 'column',
    gap: 10,
  },
  formFieldHalf: {
    flex: 1,
  },
  formFieldThird: {
    flex: 1,
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
  inputError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
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
  cancelBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 6,
    cursor: 'pointer',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  submitModalBtn: {
    backgroundColor: '#0F766E',
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 8,
    cursor: 'pointer',
  },
  submitModalBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  rxDetailsBox: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
  },
  rxBoxTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F766E',
    marginBottom: 12,
  },
  rxGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  rxItem: {
    width: '48%',
  },
  rxLabel: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  rxValue: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    marginTop: 2,
  },
  rxValueHighlight: {
    fontSize: 13,
    color: '#0F766E',
    fontWeight: '800',
    marginTop: 2,
  },
  docAttachmentBar: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#CCFBF1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  docAttachmentLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  docAttachmentName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0284C7',
  },
  previewDocBtn: {
    backgroundColor: '#0F766E',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    cursor: 'pointer',
  },
  previewDocText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  historyTableWrapper: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
  },
  historyTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  hThCell: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  historyTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  hTdCell: {
    fontSize: 12.5,
    color: '#334155',
  },
  invNoText: {
    fontWeight: '700',
    color: '#0F766E',
  },
  amountText: {
    fontWeight: '700',
    color: '#0F172A',
  },
  noHistoryBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
  },
  noHistoryText: {
    fontSize: 13,
    color: '#64748B',
  },
});
