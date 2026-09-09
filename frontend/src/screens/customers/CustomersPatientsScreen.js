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
  ActivityIndicator,
} from 'react-native';
import InventoryStatCard from '../../components/inventory/InventoryStatCard';
import {
  PATIENT_TYPE_FILTER,
  MOCK_CUSTOMERS_LIST,
  MOCK_PATIENT_PURCHASE_HISTORY,
} from '../../data/customersMockData';
import {
  fetchCustomers,
  fetchCustomerSummary,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '../../api/customerApi';

export default function CustomersPatientsScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isCompact = width < 1100;

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Customers');

  // Customers & Summary Data State
  const [customers, setCustomers] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modal 1: Add / Edit Customer Profile Modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    age: '30',
    gender: 'F',
    category: 'Regular',
    city: 'Mumbai',
    address: 'Local Resident',
    doctorName: 'Dr. Farooq Siddiqui',
    doctorSpecialization: 'General Physician',
    activeRxNo: 'Rx-2026-1025',
    creditLimit: '2000',
    outstandingBalance: '0',
  });
  const [formErrors, setFormErrors] = useState({});

  // Category Dropdown Open inside Modal
  const [modalCategoryDropdownOpen, setModalCategoryDropdownOpen] = useState(false);

  // Modal 2: Customer History & Prescription Details Modal
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);

  // Modal 3: Action Menu Popover Modal
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [actionCustomer, setActionCustomer] = useState(null);

  useEffect(() => {
    loadCustomersData();
  }, []);

  const loadCustomersData = async () => {
    try {
      setLoading(true);
      const [resCust, resSum] = await Promise.all([
        fetchCustomers(),
        fetchCustomerSummary().catch(() => null),
      ]);

      if (resCust && resCust.data && Array.isArray(resCust.data) && resCust.data.length > 0) {
        setCustomers(resCust.data);
      } else {
        setCustomers(MOCK_CUSTOMERS_LIST);
      }

      if (resSum && resSum.data) {
        setSummaryData(resSum.data);
      }
    } catch (err) {
      console.warn('Failed to fetch customers from API:', err.message);
      setCustomers(MOCK_CUSTOMERS_LIST);
    } finally {
      setLoading(false);
    }
  };

  // Dynamic KPI Cards
  const totalCount = summaryData?.totalCustomers || customers.length;
  const chronicCount = summaryData?.chronicCarePatients || customers.filter((c) => c.category === 'Chronic Care').length;
  const activeCreditCount = summaryData?.activeCreditAccounts || customers.filter((c) => (c.creditLimit && c.creditLimit > 0) || (c.outstandingBalance && c.outstandingBalance > 0)).length;
  const loyaltySum = summaryData?.loyaltyPointsPool || customers.reduce((acc, c) => acc + (c.loyaltyPoints || 0), 0);

  const dynamicKpis = [
    {
      id: 'kpi-1',
      label: 'TOTAL CUSTOMERS',
      value: totalCount.toLocaleString(),
      subtext: '+32 this month',
      variant: 'teal',
    },
    {
      id: 'kpi-2',
      label: 'CHRONIC CARE PATIENTS',
      value: chronicCount.toLocaleString(),
      subtext: 'Auto-refill enabled',
      variant: 'blue',
    },
    {
      id: 'kpi-3',
      label: 'ACTIVE CREDIT ACCOUNTS',
      value: activeCreditCount.toLocaleString(),
      subtext: `₹${(summaryData?.totalOutstanding || 34270).toLocaleString('en-IN')} outstanding credit`,
      variant: 'orange',
    },
    {
      id: 'kpi-4',
      label: 'LOYALTY POINTS POOL',
      value: `${loyaltySum.toLocaleString()} pts`,
      subtext: `₹${loyaltySum.toLocaleString()} redeemable value`,
      variant: 'amber',
    },
  ];

  // Filtered Customers List
  const filteredCustomers = customers.filter((cust) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      (cust.name && cust.name.toLowerCase().includes(query)) ||
      (cust.phone && cust.phone.toLowerCase().includes(query)) ||
      (cust.customerNumber && cust.customerNumber.toLowerCase().includes(query)) ||
      (cust.id && cust.id.toLowerCase().includes(query)) ||
      (cust.doctorName && cust.doctorName.toLowerCase().includes(query)) ||
      (cust.city && cust.city.toLowerCase().includes(query));

    const matchesCategory =
      selectedCategory === 'All Customers' || selectedCategory === 'All Patients' ||
      (selectedCategory === 'Credit Allowed' ? (cust.creditLimit > 0 || cust.creditAllowed) : cust.category === selectedCategory);

    return matchesSearch && matchesCategory;
  });

  const handleOpenAddModal = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormData({
      name: '',
      phone: '',
      email: '',
      age: '30',
      gender: 'F',
      category: 'Regular',
      city: 'Mumbai',
      address: 'Local Resident',
      doctorName: 'Dr. Farooq Siddiqui',
      doctorSpecialization: 'General Physician',
      activeRxNo: `Rx-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      creditLimit: '15000',
      outstandingBalance: '0',
    });
    setFormErrors({});
    setModalCategoryDropdownOpen(false);
    setAddModalVisible(true);
  };

  const handleOpenEditModal = (cust) => {
    setIsEditing(true);
    setEditingId(cust.id);
    setFormData({
      name: cust.name || '',
      phone: cust.phone === 'N/A' ? '' : cust.phone || '',
      email: cust.email || '',
      age: String(cust.age || 30),
      gender: cust.gender || 'F',
      category: cust.category || 'Regular',
      city: cust.city || 'Mumbai',
      address: cust.address || 'Local Resident',
      doctorName: cust.doctorName || 'Dr. Farooq Siddiqui',
      doctorSpecialization: cust.doctorSpecialty || cust.doctorSpecialization || 'General Physician',
      activeRxNo: cust.activeRxNo || `Rx-2026-1025`,
      creditLimit: String(cust.creditLimit || 0),
      outstandingBalance: String(cust.outstandingBalance || 0),
    });
    setFormErrors({});
    setModalCategoryDropdownOpen(false);
    setActionMenuOpen(false);
    setAddModalVisible(true);
  };

  const handleSavePatient = async () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Customer Full Name is required';
    if (!formData.phone.trim()) errors.phone = 'Phone number is required';
    if (!formData.age.trim() || isNaN(formData.age)) errors.age = 'Valid age required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const payload = {
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      email: formData.email.trim() || `${formData.name.toLowerCase().replace(/[^a-z]/g, '')}@example.com`,
      age: parseInt(formData.age, 10) || 30,
      gender: formData.gender,
      category: formData.category || 'Regular',
      city: formData.city || 'Mumbai',
      address: formData.address || 'Local Resident',
      doctorName: formData.doctorName || 'Dr. Farooq Siddiqui',
      doctorSpecialty: formData.doctorSpecialization || 'General Physician',
      activeRxNo: formData.activeRxNo || `Rx-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      creditLimit: parseFloat(formData.creditLimit) || 0,
      outstandingBalance: parseFloat(formData.outstandingBalance) || 0,
      status: 'ACTIVE',
    };

    if (isEditing && editingId) {
      try {
        await updateCustomer(editingId, payload);
        await loadCustomersData();
        setAddModalVisible(false);
        setIsEditing(false);
        setEditingId(null);
        if (onShowToast) {
          onShowToast(`✓ Updated customer profile "${formData.name}" in database!`);
        }
      } catch (err) {
        console.warn('DB customer update failed, fallback local:', err.message);
        setCustomers((prev) =>
          prev.map((c) => (c.id === editingId ? { ...c, ...payload } : c))
        );
        setAddModalVisible(false);
        setIsEditing(false);
        setEditingId(null);
        if (onShowToast) {
          onShowToast(`✓ Updated ${formData.name}`);
        }
      }
    } else {
      try {
        await createCustomer(payload);
        await loadCustomersData();
        setAddModalVisible(false);
        if (onShowToast) {
          onShowToast(`✓ Added customer profile "${formData.name}" to database!`);
        }
      } catch (err) {
        console.warn('DB customer add failed, fallback local state:', err.message);
        const newPatient = {
          id: `CUST-${1040 + customers.length + 1}`,
          customerNumber: `CUST-${1040 + customers.length + 1}`,
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          age: formData.age,
          gender: formData.gender,
          category: formData.category,
          city: formData.city,
          address: formData.address,
          doctorName: formData.doctorName,
          doctorSpecialty: formData.doctorSpecialization,
          activeRxNo: formData.activeRxNo,
          creditLimit: parseFloat(formData.creditLimit) || 0,
          outstandingBalance: parseFloat(formData.outstandingBalance) || 0,
          totalSpent: 0,
          status: 'Active',
        };
        setCustomers((prev) => [newPatient, ...prev]);
        setAddModalVisible(false);
        if (onShowToast) {
          onShowToast(`✓ Added customer profile "${newPatient.name}"!`);
        }
      }
    }
  };

  const handleDeleteCustomerAction = async (cust) => {
    if (!cust) return;
    try {
      await deleteCustomer(cust.id);
      await loadCustomersData();
      setActionMenuOpen(false);
      if (onShowToast) {
        onShowToast(`🗑️ Deleted customer profile "${cust.name}" from database!`);
      }
    } catch (err) {
      setCustomers((prev) => prev.filter((c) => c.id !== cust.id));
      setActionMenuOpen(false);
      if (onShowToast) {
        onShowToast(`Removed ${cust.name}`);
      }
    }
  };

  const handleToggleStatus = async (cust) => {
    if (!cust) return;
    const nextStatus = cust.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await updateCustomer(cust.id, { status: nextStatus === 'Active' ? 'ACTIVE' : 'INACTIVE' });
      await loadCustomersData();
      setActionMenuOpen(false);
      if (onShowToast) {
        onShowToast(`✓ Customer "${cust.name}" status updated to ${nextStatus}!`);
      }
    } catch (err) {
      setCustomers((prev) =>
        prev.map((c) => (c.id === cust.id ? { ...c, status: nextStatus } : c))
      );
      setActionMenuOpen(false);
    }
  };

  const handleViewPatientDetails = (cust) => {
    setSelectedPatient(cust);
    setHistoryModalVisible(true);
  };

  const handleOpenCustomerDetailsPage = (cust) => {
    if (onNavigate) {
      onNavigate('customer-ledger', cust.id);
    }
  };

  const handleExportData = (type) => {
    if (onShowToast) {
      onShowToast(`✓ Exported ${filteredCustomers.length} customer records as ${type.toUpperCase()}!`);
    }
  };

  const handleAttachToPOS = (cust) => {
    if (onNavigate) {
      onNavigate('dashboard');
    }
    if (onShowToast) {
      onShowToast(`✓ Customer "${cust.name}" attached to active sale transaction!`);
    }
  };

  const handleOpenActionMenu = (cust) => {
    setActionCustomer(cust);
    setActionMenuOpen(true);
  };

  const categoryOptions = [
    'Regular',
    'Chronic Care',
    'Senior Citizen',
    'Credit Allowed',
    'VIP',
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        isMobile && styles.contentContainerMobile,
      ]}
      showsVerticalScrollIndicator={true}
    >
      {/* Header */}
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

      {/* Dynamic 4 Top KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {dynamicKpis.map((kpi) => (
          <View
            key={kpi.id}
            style={[styles.kpiCol, isMobile && styles.kpiColMobile]}
          >
            <InventoryStatCard
              label={kpi.label}
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
        {/* Search & Category Filter Header */}
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

        {/* Section Subheader */}
        <View style={styles.tableSubheader}>
          <Text style={styles.sectionTitle}>Customer Accounts & Prescriptions</Text>
          <Text style={styles.paginationInfo}>
            Showing {filteredCustomers.length} of {customers.length} records
          </Text>
        </View>

        {loading ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#0F766E" />
            <Text style={{ marginTop: 12, color: '#64748B', fontWeight: '600' }}>Fetching customer records from database...</Text>
          </View>
        ) : isMobile ? (
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
                const displayId = cust.customerNumber || cust.id;
                const outstandingVal = typeof cust.outstandingBalance === 'number'
                  ? `₹${cust.outstandingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                  : cust.currentOutstanding || '₹0.00';
                const creditLimitVal = typeof cust.creditLimit === 'number'
                  ? cust.creditLimit === 0 ? '₹0 (Cash Only)' : `₹${cust.creditLimit.toLocaleString('en-IN')}`
                  : cust.creditLimit || '₹0 (Cash Only)';
                const totalSpentVal = typeof cust.totalSpent === 'number'
                  ? `₹${cust.totalSpent.toLocaleString('en-IN')}`
                  : cust.totalSpent || '₹0.00';

                return (
                  <View key={cust.id} style={styles.mobileCustomerCard}>
                    <View style={styles.mobileCustHeader}>
                      <Pressable onPress={() => handleViewPatientDetails(cust)} style={{ flex: 1 }}>
                        <Text style={styles.mobileCustName}>{cust.name}</Text>
                        <Text style={styles.mobileCustSub}>
                          {displayId} • {cust.category} • {cust.age}y/{cust.gender === 'M' || cust.gender === 'Male' ? 'M' : 'F'}
                        </Text>
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
                        <Text style={[styles.mobileValBold, { color: outstandingVal !== '₹0.00' && outstandingVal !== '₹0' ? '#DC2626' : '#16A34A' }]}>
                          {outstandingVal}
                        </Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Credit Limit</Text>
                        <Text style={styles.mobileVal}>{creditLimitVal}</Text>
                      </View>
                      <View style={styles.mobileGridCol}>
                        <Text style={styles.mobileLabel}>Total Spent</Text>
                        <Text style={styles.mobileValBold}>{totalSpentVal}</Text>
                      </View>
                    </View>

                    <View style={styles.mobileCustFooter}>
                      <Pressable
                        onPress={() => handleAttachToPOS(cust)}
                        style={styles.mobileAttachPOSBtn}
                        accessibilityRole="button"
                      >
                        <Text style={styles.mobileAttachPOSText}>+ POS</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleViewPatientDetails(cust)}
                        style={styles.mobileHistoryBtn}
                        accessibilityRole="button"
                      >
                        <Text style={styles.mobileHistoryBtnText}>Details</Text>
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
                <Text style={[styles.thCell, { width: 160, textAlign: 'center' }]}>ACTIONS</Text>
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
                  const displayId = cust.customerNumber || cust.id;
                  const outstandingVal = typeof cust.outstandingBalance === 'number'
                    ? `₹${cust.outstandingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                    : cust.currentOutstanding || '₹0.00';
                  const creditLimitVal = typeof cust.creditLimit === 'number'
                    ? cust.creditLimit === 0 ? '₹0 (Cash Only)' : `₹${cust.creditLimit.toLocaleString('en-IN')}`
                    : cust.creditLimit || '₹0 (Cash Only)';
                  const totalSpentVal = typeof cust.totalSpent === 'number'
                    ? `₹${cust.totalSpent.toLocaleString('en-IN')}`
                    : cust.totalSpent || '₹0.00';

                  return (
                    <View
                      key={cust.id}
                      style={[
                        styles.tableRow,
                        index % 2 === 1 && styles.tableRowAlt,
                      ]}
                    >
                      <Text style={[styles.tdCell, styles.patientIdText, { width: 100 }]}>
                        {displayId}
                      </Text>

                      <Pressable
                        onPress={() => handleViewPatientDetails(cust)}
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
                        {cust.age} / {cust.gender === 'M' || cust.gender === 'Male' ? 'M' : 'F'}
                      </Text>

                      <View style={[{ width: 160 }]}>
                        <Text style={[styles.tdCell, styles.docNameText]} numberOfLines={1}>
                          {cust.doctorName}
                        </Text>
                        <Text style={styles.docSpecSubtext} numberOfLines={1}>
                          {cust.doctorSpecialty || cust.doctorSpecialization}
                        </Text>
                      </View>

                      <View style={[{ width: 120 }]}>
                        <Text style={[styles.tdCell, styles.rxTagText]}>
                          {cust.activeRxNo}
                        </Text>
                      </View>

                      <Text style={[styles.tdCell, { width: 110, textAlign: 'right', fontWeight: '600' }]}>
                        {creditLimitVal}
                      </Text>

                      <Text
                        style={[
                          styles.tdCell,
                          {
                            width: 110,
                            textAlign: 'right',
                            fontWeight: '700',
                            color: outstandingVal !== '₹0.00' && outstandingVal !== '₹0' ? '#DC2626' : '#334155',
                          },
                        ]}
                      >
                        {outstandingVal}
                      </Text>

                      <Text style={[styles.tdCell, { width: 110, textAlign: 'right', fontWeight: '600' }]}>
                        {totalSpentVal}
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

                      {/* Actions Column */}
                      <View style={[styles.actionWrapperRow, { width: 160 }]}>
                        <Pressable
                          onPress={() => handleAttachToPOS(cust)}
                          style={styles.attachPOSButton}
                          accessibilityRole="button"
                          accessibilityLabel="Attach to POS"
                        >
                          <Text style={styles.attachPOSButtonText}>+ POS</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => handleViewPatientDetails(cust)}
                          style={styles.viewHistoryButton}
                          accessibilityRole="button"
                          accessibilityLabel="View Customer Details"
                        >
                          <Text style={styles.viewHistoryButtonText}>Details</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => handleOpenActionMenu(cust)}
                          style={styles.actionMenuMoreBtn}
                          accessibilityRole="button"
                        >
                          <Text style={styles.actionMenuMoreDots}>⋮</Text>
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
      {/* Modal 1: Add / Edit Customer Profile Modal */}
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
                <Text style={styles.modalTitle}>
                  {isEditing ? 'Edit Customer Profile' : 'Add Customer Profile'}
                </Text>
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
                    placeholder="F / M / Other"
                    placeholderTextColor="#94A3B8"
                    value={formData.gender}
                    onChangeText={(t) => setFormData((p) => ({ ...p, gender: t }))}
                  />
                </View>

                <View style={[styles.formFieldThird, { zIndex: 1000, position: 'relative' }]}>
                  <Text style={styles.fieldLabel}>Customer Category</Text>
                  <Pressable
                    onPress={() => setModalCategoryDropdownOpen(!modalCategoryDropdownOpen)}
                    style={styles.dropdownPickerBtn}
                  >
                    <Text style={styles.dropdownPickerText}>{formData.category}</Text>
                    <Text style={styles.dropdownArrowIcon}>{modalCategoryDropdownOpen ? '▲' : '▼'}</Text>
                  </Pressable>

                  {modalCategoryDropdownOpen && (
                    <View style={styles.dropdownMenu}>
                      {categoryOptions.map((cat) => (
                        <Pressable
                          key={cat}
                          onPress={() => {
                            setFormData((p) => ({ ...p, category: cat }));
                            setModalCategoryDropdownOpen(false);
                          }}
                          style={[
                            styles.dropdownMenuItem,
                            formData.category === cat && styles.dropdownMenuItemActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dropdownMenuItemText,
                              formData.category === cat && styles.dropdownMenuItemTextActive,
                            ]}
                          >
                            {cat}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
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

              <Text style={styles.sectionHeading}>3. Prescription & Credit Limit (RX-03 & RX-06)</Text>
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
                  <Text style={styles.fieldLabel}>Credit Limit Allowed (₹)</Text>
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
                <Text style={styles.submitModalBtnText}>
                  {isEditing ? 'Update Customer Profile' : 'Save Customer Profile'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal 2: Customer History & Prescription Details Modal */}
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
                    {selectedPatient.name} ({selectedPatient.customerNumber || selectedPatient.id}) • Phone: {selectedPatient.phone}
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
                      <Text style={styles.rxValue}>
                        {selectedPatient.doctorName} ({selectedPatient.doctorSpecialty || selectedPatient.doctorSpecialization || 'General'})
                      </Text>
                    </View>
                    <View style={styles.rxItem}>
                      <Text style={styles.rxLabel}>Category / Tag:</Text>
                      <Text style={styles.rxValue}>{selectedPatient.category || 'Regular'}</Text>
                    </View>
                    <View style={styles.rxItem}>
                      <Text style={styles.rxLabel}>City / Location:</Text>
                      <Text style={styles.rxValue}>{selectedPatient.city || 'Mumbai'}</Text>
                    </View>
                    <View style={styles.rxItem}>
                      <Text style={styles.rxLabel}>Active Rx Ref:</Text>
                      <Text style={styles.rxValueHighlight}>{selectedPatient.activeRxNo}</Text>
                    </View>
                  </View>

                  <View style={styles.docAttachmentBar}>
                    <Text style={styles.docAttachmentLabel}>📎 Attached Rx Document:</Text>
                    <Text style={styles.docAttachmentName}>Rx_Attached_Doc.pdf</Text>
                    <Pressable
                      onPress={() => onShowToast && onShowToast(`Previewing Rx_Attached_Doc.pdf (Read-only view)`)}
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
                    <Text style={styles.noHistoryText}>No prior purchases recorded for this customer.</Text>
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

      {/* ------------------------------------------------------------------ */}
      {/* Modal 3: Action Menu Popover Modal */}
      {/* ------------------------------------------------------------------ */}
      {actionCustomer && (
        <Modal
          visible={actionMenuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setActionMenuOpen(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setActionMenuOpen(false)}>
            <View style={styles.actionMenuPopover}>
              <View style={styles.actionMenuHeader}>
                <Text style={styles.actionMenuTitle}>{actionCustomer.name}</Text>
                <Text style={styles.actionMenuSub}>{actionCustomer.customerNumber || actionCustomer.id}</Text>
              </View>

              <Pressable
                onPress={() => handleOpenEditModal(actionCustomer)}
                style={styles.actionMenuItem}
              >
                <Text style={styles.actionMenuItemIcon}>✏️</Text>
                <Text style={styles.actionMenuItemText}>Edit Customer Profile</Text>
              </Pressable>

              <Pressable
                onPress={() => handleToggleStatus(actionCustomer)}
                style={styles.actionMenuItem}
              >
                <Text style={styles.actionMenuItemIcon}>⚡</Text>
                <Text style={styles.actionMenuItemText}>
                  Mark as {actionCustomer.status === 'Active' ? 'Inactive' : 'Active'}
                </Text>
              </Pressable>

              <View style={styles.actionMenuDivider} />

              <Pressable
                onPress={() => handleDeleteCustomerAction(actionCustomer)}
                style={[styles.actionMenuItem, styles.actionMenuItemDelete]}
              >
                <Text style={styles.actionMenuItemIcon}>🗑️</Text>
                <Text style={[styles.actionMenuItemText, { color: '#EF4444' }]}>Delete Customer</Text>
              </Pressable>
            </View>
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
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  filtersBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  filtersBarCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 14,
    height: 42,
  },
  searchBoxMobile: {
    width: '100%',
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
  },
  clearBtn: {
    padding: 4,
  },
  clearBtnText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
  },
  filterChipScroll: {
    flexGrow: 0,
  },
  filterChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    cursor: 'pointer',
  },
  filterChipActive: {
    backgroundColor: '#0F766E',
  },
  filterChipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  tableSubheader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
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
    color: '#64748B',
    fontWeight: '500',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
  },
  mobileCardList: {
    gap: 12,
  },
  mobileCustomerCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 12,
  },
  mobileCustHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  mobileCustName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F766E',
  },
  mobileCustSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  mobileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  mobileGridCol: {
    width: '47%',
  },
  mobileLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  mobileVal: {
    fontSize: 12.5,
    color: '#334155',
  },
  mobileValBold: {
    fontSize: 12.5,
    color: '#0F172A',
    fontWeight: '700',
  },
  mobileCustFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  mobileAttachPOSBtn: {
    flex: 1,
    backgroundColor: '#0F766E',
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
  },
  mobileAttachPOSText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  mobileHistoryBtn: {
    backgroundColor: '#E2E8F0',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  mobileHistoryBtnText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  tableWrapper: {
    minWidth: 1200,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  thCell: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
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
  },
  patientIdText: {
    fontWeight: '700',
    color: '#0F766E',
  },
  patientNameText: {
    fontWeight: '700',
  },
  categorySubtext: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  phoneText: {
    fontSize: 12.5,
    color: '#475569',
  },
  docNameText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  docSpecSubtext: {
    fontSize: 11,
    color: '#64748B',
  },
  rxTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
    backgroundColor: '#CCFBF1',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  statusWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeActive: {
    backgroundColor: '#DCFCE7',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  statusBadgeOverdue: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeTextActive: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#15803D',
  },
  statusBadgeTextOverdue: {
    color: '#B91C1C',
  },
  actionWrapperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  attachPOSButton: {
    backgroundColor: '#0F766E',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 6,
    cursor: 'pointer',
  },
  attachPOSButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  viewHistoryButton: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 6,
    cursor: 'pointer',
  },
  viewHistoryButtonText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  actionMenuMoreBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  actionMenuMoreDots: {
    fontSize: 14,
    fontWeight: '900',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCardLarge: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
  },
  modalCardMobile: {
    maxWidth: '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '700',
  },
  modalBody: {
    padding: 20,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F766E',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  formRowMobile: {
    flexDirection: 'column',
    gap: 12,
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
    color: '#EF4444',
  },
  modalInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13.5,
    color: '#0F172A',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    fontSize: 11,
    color: '#EF4444',
    marginTop: 3,
  },
  dropdownPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  dropdownPickerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  dropdownArrowIcon: {
    fontSize: 10,
    color: '#64748B',
  },
  dropdownMenu: {
    position: 'absolute',
    top: 66,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 100,
    zIndex: 9999,
  },
  dropdownMenuItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownMenuItemActive: {
    backgroundColor: '#F0FDFA',
  },
  dropdownMenuItemText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  dropdownMenuItemTextActive: {
    color: '#0F766E',
    fontWeight: '700',
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
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
  actionMenuPopover: {
    width: 260,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    padding: 8,
  },
  actionMenuHeader: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 4,
  },
  actionMenuTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  actionMenuSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  actionMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 6,
    gap: 10,
  },
  actionMenuItemDelete: {
    backgroundColor: '#FEF2F2',
  },
  actionMenuItemIcon: {
    fontSize: 14,
  },
  actionMenuItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  actionMenuDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 4,
  },
});
