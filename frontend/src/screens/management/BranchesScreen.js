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
  BRANCHES_KPIS,
  MOCK_BRANCHES_LIST,
  BRANCH_TYPES,
} from '../../data/managementMockData';
import { API_URL } from '../../config';

export default function BranchesScreen({ onShowToast, onNavigate, onBranchesUpdated }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('All Types');
  const [selectedStatus, setSelectedStatus] = useState('All'); // 'All' | 'Active' | 'Inactive'

  // Branches State
  const [branches, setBranches] = useState(MOCK_BRANCHES_LIST);

  // Load branches from database
  useEffect(() => {
    let active = true;
    const fetchBranches = async () => {
      try {
        const response = await fetch(`${API_URL}/branches`);
        if (response.ok) {
          const json = await response.json();
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            const mapped = json.data.map((dbB, idx) => ({
              id: dbB.id || `BR-0${idx + 1}`,
              name: dbB.name,
              type: 'Hospital Pharmacy',
              code: `FIT-PUN-0${idx + 1}`,
              contactPerson: 'Pharmacist',
              phone: dbB.phone || '+91 98220 00000',
              email: 'info@flora.edu.in',
              address: dbB.address || 'Pune, Maharashtra',
              city: dbB.city || 'Pune',
              state: dbB.state || 'Maharashtra',
              pincode: dbB.postal_code || '412205',
              gstin: '27AAAAF1234F1Z5',
              drugLicenseNo: 'MH-PZ2-20B-184920',
              invoicePrefix: `FIT-B0${idx + 1}-`,
              currency: 'INR (₹)',
              defaultTaxRate: '12%',
              staffCount: 5,
              monthlyRevenue: '₹4,50,000',
              status: dbB.status === 'INACTIVE' || dbB.status === 'Inactive' ? 'Inactive' : 'Active',
              isMainHub: idx === 0,
              openingHours: '08:00 AM - 10:00 PM',
            }));
            if (active) {
              setBranches(mapped);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load branches from API:', err.message);
      }
    };
    fetchBranches();
    return () => {
      active = false;
    };
  }, []);

  // Add / Edit Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeBranchId, setActiveBranchId] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: 'Hospital Pharmacy',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '412205',
    gstin: '27AAAAF1234F1Z5',
    drugLicenseNo: '',
    invoicePrefix: 'FIT-',
    defaultTaxRate: '12%',
    status: 'Active',
    openingHours: '08:00 AM - 10:00 PM',
  });
  const [formErrors, setFormErrors] = useState({});

  // View Details Modal State
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(null);

  // Filtered branches
  const filteredBranches = branches.filter((branch) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      branch.name.toLowerCase().includes(q) ||
      branch.code.toLowerCase().includes(q) ||
      branch.city.toLowerCase().includes(q) ||
      branch.contactPerson.toLowerCase().includes(q) ||
      branch.phone.includes(q) ||
      branch.drugLicenseNo.toLowerCase().includes(q);

    const matchesType =
      selectedType === 'All Types' || branch.type === selectedType;

    const matchesStatus =
      selectedStatus === 'All' || branch.status === selectedStatus;

    return matchesSearch && matchesType && matchesStatus;
  });

  const handleOpenAddModal = () => {
    setIsEditing(false);
    setActiveBranchId(null);
    setFormData({
      name: '',
      code: `FIT-BR-0${branches.length + 1}`,
      type: 'Retail Dispensary',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
      gstin: '27AAAAF1234F1Z5',
      drugLicenseNo: '',
      invoicePrefix: `FIT-B0${branches.length + 1}-`,
      defaultTaxRate: '12%',
      status: 'Active',
      openingHours: '08:00 AM - 10:00 PM',
    });
    setFormErrors({});
    setModalVisible(true);
  };

  const handleOpenEditModal = (branch) => {
    setIsEditing(true);
    setActiveBranchId(branch.id);
    setFormData({
      name: branch.name,
      code: branch.code,
      type: branch.type,
      contactPerson: branch.contactPerson,
      phone: branch.phone,
      email: branch.email,
      address: branch.address,
      city: branch.city,
      state: branch.state,
      pincode: branch.pincode,
      gstin: branch.gstin,
      drugLicenseNo: branch.drugLicenseNo,
      invoicePrefix: branch.invoicePrefix,
      defaultTaxRate: branch.defaultTaxRate,
      status: branch.status,
      openingHours: branch.openingHours || '08:00 AM - 10:00 PM',
    });
    setFormErrors({});
    setModalVisible(true);
  };

  const handleSaveBranch = async () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Branch name is required';
    if (!formData.code.trim()) errors.code = 'Branch Code is required';
    if (!formData.phone.trim()) errors.phone = 'Contact phone is required';
    if (!formData.address.trim()) errors.address = 'Branch address is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      if (isEditing) {
        // Save edit locally and attempt API call
        setBranches((prev) =>
          prev.map((b) =>
            b.id === activeBranchId
              ? {
                  ...b,
                  ...formData,
                }
              : b
          )
        );

        if (String(activeBranchId).includes('-')) {
          await fetch(`${API_URL}/branches/${activeBranchId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: formData.name,
              address: formData.address,
              city: formData.city,
              state: formData.state,
              postalCode: formData.pincode,
              phone: formData.phone,
              status: formData.status === 'Active' ? 'ACTIVE' : 'INACTIVE',
            }),
          }).catch(() => {});
        }

        if (onShowToast) {
          onShowToast(`✓ Successfully updated branch "${formData.name}"`);
        }
      } else {
        const payload = {
          name: formData.name,
          address: formData.address,
          city: formData.city || 'Pune',
          state: formData.state || 'Maharashtra',
          postalCode: formData.pincode || '412205',
          phone: formData.phone,
          status: formData.status === 'Active' ? 'ACTIVE' : 'INACTIVE',
        };

        const res = await fetch(`${API_URL}/branches`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        let newId = `BR-0${branches.length + 1}`;
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data?.id) {
            newId = json.data.id;
          }
        }

        const newBranch = {
          id: newId,
          ...formData,
          staffCount: 2,
          monthlyRevenue: '₹0.00',
          currency: 'INR (₹)',
          isMainHub: false,
        };
        setBranches((prev) => [newBranch, ...prev]);
        if (onShowToast) {
          onShowToast(`✓ Added new branch "${newBranch.name}" to database!`);
        }
      }
      if (onBranchesUpdated) {
        onBranchesUpdated();
      }
    } catch (err) {
      console.warn('Error saving branch to database:', err.message);
    }

    setModalVisible(false);
  };

  const handleToggleStatus = async (branch) => {
    const newStatus = branch.status === 'Active' ? 'Inactive' : 'Active';
    const dbStatus = newStatus === 'Active' ? 'ACTIVE' : 'INACTIVE';

    setBranches((prev) =>
      prev.map((b) => (b.id === branch.id ? { ...b, status: newStatus } : b))
    );

    // Sync MOCK_BRANCHES_LIST in-memory array for fallbacks
    const mockMatch = MOCK_BRANCHES_LIST.find((m) => m.id === branch.id || m.name === branch.name);
    if (mockMatch) {
      mockMatch.status = newStatus;
    }

    try {
      await fetch(`${API_URL}/branches/${branch.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: dbStatus }),
      });
    } catch (err) {
      console.warn('Error updating branch status in database:', err.message);
    }

    if (onBranchesUpdated) {
      onBranchesUpdated();
    }

    if (onShowToast) {
      onShowToast(
        `Branch "${branch.name}" marked as ${newStatus}`
      );
    }
  };

  const handleViewDetails = (branch) => {
    setSelectedBranch(branch);
    setDetailModalVisible(true);
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
      {/* 1. Header & Title Banner */}
      <View style={styles.headerRow}>
        <View style={styles.titleWrapper}>
          <Text style={styles.pageTitle}>Branch Management</Text>
          <Text style={styles.pageSubtitle}>
            Configure and manage physical pharmacies, hospital dispensaries, and warehouses across Flora Institute of Technology.
          </Text>
        </View>
        <Pressable
          onPress={handleOpenAddModal}
          style={styles.addBranchButton}
          accessibilityRole="button"
          accessibilityLabel="Add New Branch"
        >
          <Text style={styles.addBranchButtonIcon}>+</Text>
          <Text style={styles.addBranchButtonText}>Add Branch</Text>
        </Pressable>
      </View>

      {/* 2. Top KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {BRANCHES_KPIS.map((kpi) => (
          <InventoryStatCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            subtext={kpi.subtext}
            variant={kpi.variant}
          />
        ))}
      </View>

      {/* 3. Search and Filter Bar */}
      <View style={styles.filterCard}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by branch name, code, city, DL or phone..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
              <Text style={styles.clearSearchText}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Type & Status Filters */}
        <View style={styles.filterControls}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.typeTabsContainer}
          >
            {BRANCH_TYPES.map((type) => {
              const isSelected = selectedType === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => setSelectedType(type)}
                  style={[
                    styles.typeTab,
                    isSelected && styles.typeTabSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.typeTabText,
                      isSelected && styles.typeTabTextSelected,
                    ]}
                  >
                    {type}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Status Quick Toggle */}
          <View style={styles.statusToggleGroup}>
            {['All', 'Active', 'Inactive'].map((status) => {
              const isSelected = selectedStatus === status;
              return (
                <Pressable
                  key={status}
                  onPress={() => setSelectedStatus(status)}
                  style={[
                    styles.statusPill,
                    isSelected && styles.statusPillSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      isSelected && styles.statusPillTextSelected,
                    ]}
                  >
                    {status}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* 4. Branches Table Card */}
      <View style={styles.tableCard}>
        <View style={styles.tableHeaderSection}>
          <View style={styles.tableTitleRow}>
            <Text style={styles.tableTitle}>Registered Pharmacy Branches</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>
                {filteredBranches.length} {filteredBranches.length === 1 ? 'Branch' : 'Branches'}
              </Text>
            </View>
          </View>
          <Text style={styles.tableSubtitle}>
            Physical retail dispensaries, clinical hospital stores, and centralized distribution hubs.
          </Text>
        </View>

        {filteredBranches.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🏢</Text>
            <Text style={styles.emptyTitle}>No Branches Found</Text>
            <Text style={styles.emptySubtitle}>
              Try adjusting your search criteria or add a new branch to the network.
            </Text>
            <Pressable
              onPress={handleOpenAddModal}
              style={styles.emptyAddButton}
            >
              <Text style={styles.emptyAddButtonText}>+ Add First Branch</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              {/* Table Header */}
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.thText, styles.colCode]}>Branch Code</Text>
                <Text style={[styles.thText, styles.colName]}>Branch Name & Type</Text>
                <Text style={[styles.thText, styles.colContact]}>Contact Details</Text>
                <Text style={[styles.thText, styles.colAddress]}>Location / City</Text>
                <Text style={[styles.thText, styles.colInvoice]}>Invoice Prefix</Text>
                <Text style={[styles.thText, styles.colStatus]}>Status</Text>
                <Text style={[styles.thText, styles.colActions]}>Actions</Text>
              </View>

              {/* Table Body */}
              {filteredBranches.map((branch, index) => {
                const isActive = branch.status === 'Active';
                const isEven = index % 2 === 0;

                return (
                  <View
                    key={branch.id}
                    style={[styles.tableRow, isEven && styles.tableRowEven]}
                  >
                    {/* Branch Code */}
                    <View style={styles.colCode}>
                      <View style={styles.codeBadge}>
                        <Text style={styles.codeBadgeText}>{branch.code}</Text>
                      </View>
                      {branch.isMainHub && (
                        <View style={styles.mainHubPill}>
                          <Text style={styles.mainHubText}>Primary Hub</Text>
                        </View>
                      )}
                    </View>

                    {/* Branch Name & Type */}
                    <View style={styles.colName}>
                      <Text style={styles.branchNameText} numberOfLines={2}>
                        {branch.name}
                      </Text>
                      <View style={styles.branchTypeRow}>
                        <Text style={styles.branchTypeTag}>{branch.type}</Text>
                        <Text style={styles.staffCountDot}>•</Text>
                        <Text style={styles.staffCountText}>
                          {branch.staffCount} Staff Members
                        </Text>
                      </View>
                    </View>

                    {/* Contact Details */}
                    <View style={styles.colContact}>
                      <Text style={styles.contactPersonText} numberOfLines={1}>
                        {branch.contactPerson}
                      </Text>
                      <Text style={styles.contactPhoneText}>{branch.phone}</Text>
                      <Text style={styles.contactEmailText} numberOfLines={1}>
                        {branch.email}
                      </Text>
                    </View>

                    {/* Address & City */}
                    <View style={styles.colAddress}>
                      <Text style={styles.addressText} numberOfLines={2}>
                        {branch.address}
                      </Text>
                      <Text style={styles.cityStateText}>
                        {branch.city}, {branch.state} - {branch.pincode}
                      </Text>
                    </View>

                    {/* Invoice Prefix & Tax */}
                    <View style={styles.colInvoice}>
                      <Text style={styles.invoicePrefixText}>{branch.invoicePrefix}</Text>
                      <Text style={styles.taxRateText}>Tax: {branch.defaultTaxRate}</Text>
                    </View>

                    {/* Status Toggle Switch */}
                    <View style={styles.colStatus}>
                      <Pressable
                        onPress={() => handleToggleStatus(branch)}
                        style={styles.toggleSwitchRow}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: isActive }}
                        accessibilityLabel={`Branch status: ${branch.status}. Tap to switch.`}
                      >
                        <View
                          style={[
                            styles.toggleTrack,
                            isActive
                              ? styles.toggleTrackActive
                              : styles.toggleTrackInactive,
                          ]}
                        >
                          <View
                            style={[
                              styles.toggleThumb,
                              isActive
                                ? styles.toggleThumbActive
                                : styles.toggleThumbInactive,
                            ]}
                          />
                        </View>
                        <Text
                          style={[
                            styles.toggleLabelText,
                            isActive
                              ? styles.toggleLabelActive
                              : styles.toggleLabelInactive,
                          ]}
                        >
                          {branch.status}
                        </Text>
                      </Pressable>
                    </View>

                    {/* Actions */}
                    <View style={[styles.colActions, styles.actionsRow]}>
                      <Pressable
                        onPress={() => handleViewDetails(branch)}
                        style={styles.actionViewBtn}
                        accessibilityRole="button"
                        accessibilityLabel="View Details"
                      >
                        <Text style={styles.actionViewBtnText}>View</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => handleOpenEditModal(branch)}
                        style={styles.actionEditBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Edit Branch"
                      >
                        <Text style={styles.actionEditBtnText}>Edit</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>

      {/* 5. ADD / EDIT BRANCH MODAL */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isMobile && styles.modalCardMobile]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {isEditing ? 'Edit Branch Profile' : 'Add New Pharmacy Branch'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {isEditing
                    ? `Updating parameters for ${formData.code}`
                    : 'Register a new physical dispensing center in Flora Institute of Technology'}
                </Text>
              </View>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            {/* Modal Body / Form */}
            <ScrollView
              style={styles.modalBodyScroll}
              showsVerticalScrollIndicator={true}
            >
              <View style={styles.formGrid}>
                {/* Branch Name */}
                <View style={styles.formColFull}>
                  <Text style={styles.fieldLabel}>
                    Branch Full Name <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={[
                      styles.formInput,
                      formErrors.name && styles.formInputError,
                    ]}
                    placeholder="e.g. FIT Main Campus Hospital Pharmacy"
                    value={formData.name}
                    onChangeText={(text) => {
                      setFormData({ ...formData, name: text });
                      if (formErrors.name) setFormErrors({ ...formErrors, name: null });
                    }}
                  />
                  {formErrors.name ? (
                    <Text style={styles.errorMsg}>{formErrors.name}</Text>
                  ) : null}
                </View>

                {/* Code & Type */}
                <View style={styles.formColHalf}>
                  <Text style={styles.fieldLabel}>
                    Branch Code / Identifier <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={[
                      styles.formInput,
                      formErrors.code && styles.formInputError,
                    ]}
                    placeholder="e.g. FIT-PUN-01"
                    value={formData.code}
                    onChangeText={(text) => {
                      setFormData({ ...formData, code: text });
                      if (formErrors.code) setFormErrors({ ...formErrors, code: null });
                    }}
                  />
                  {formErrors.code ? (
                    <Text style={styles.errorMsg}>{formErrors.code}</Text>
                  ) : null}
                </View>

                <View style={styles.formColHalf}>
                  <Text style={styles.fieldLabel}>Facility Type</Text>
                  <View style={styles.typeSelectorRow}>
                    {['Hospital Pharmacy', 'Retail Dispensary', 'Central Warehouse'].map(
                      (t) => (
                        <Pressable
                          key={t}
                          onPress={() => setFormData({ ...formData, type: t })}
                          style={[
                            styles.typeChip,
                            formData.type === t && styles.typeChipSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.typeChipText,
                              formData.type === t && styles.typeChipTextSelected,
                            ]}
                          >
                            {t}
                          </Text>
                        </Pressable>
                      )
                    )}
                  </View>
                </View>

                {/* Contact Person & Phone */}
                <View style={styles.formColHalf}>
                  <Text style={styles.fieldLabel}>Contact Person / Pharmacist in Charge</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. Dr. Suresh Patil"
                    value={formData.contactPerson}
                    onChangeText={(text) =>
                      setFormData({ ...formData, contactPerson: text })
                    }
                  />
                </View>

                <View style={styles.formColHalf}>
                  <Text style={styles.fieldLabel}>
                    Contact Phone Number <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={[
                      styles.formInput,
                      formErrors.phone && styles.formInputError,
                    ]}
                    placeholder="+91 98220 00000"
                    value={formData.phone}
                    onChangeText={(text) => {
                      setFormData({ ...formData, phone: text });
                      if (formErrors.phone)
                        setFormErrors({ ...formErrors, phone: null });
                    }}
                  />
                  {formErrors.phone ? (
                    <Text style={styles.errorMsg}>{formErrors.phone}</Text>
                  ) : null}
                </View>

                {/* Email & Operating Hours */}
                <View style={styles.formColHalf}>
                  <Text style={styles.fieldLabel}>Email Address</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="pharmacy@flora.edu.in"
                    value={formData.email}
                    onChangeText={(text) =>
                      setFormData({ ...formData, email: text })
                    }
                  />
                </View>

                <View style={styles.formColHalf}>
                  <Text style={styles.fieldLabel}>Operating Hours</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. 24 Hours or 08:00 AM - 10:00 PM"
                    value={formData.openingHours}
                    onChangeText={(text) =>
                      setFormData({ ...formData, openingHours: text })
                    }
                  />
                </View>

                {/* Address Full */}
                <View style={styles.formColFull}>
                  <Text style={styles.fieldLabel}>
                    Physical Address <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={[
                      styles.formInput,
                      formErrors.address && styles.formInputError,
                    ]}
                    placeholder="Floor, Wing, Street / Campus Location..."
                    value={formData.address}
                    onChangeText={(text) => {
                      setFormData({ ...formData, address: text });
                      if (formErrors.address)
                        setFormErrors({ ...formErrors, address: null });
                    }}
                  />
                  {formErrors.address ? (
                    <Text style={styles.errorMsg}>{formErrors.address}</Text>
                  ) : null}
                </View>

                {/* City, State, Pincode */}
                <View style={styles.formColThird}>
                  <Text style={styles.fieldLabel}>City</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Pune"
                    value={formData.city}
                    onChangeText={(text) =>
                      setFormData({ ...formData, city: text })
                    }
                  />
                </View>

                <View style={styles.formColThird}>
                  <Text style={styles.fieldLabel}>State</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Maharashtra"
                    value={formData.state}
                    onChangeText={(text) =>
                      setFormData({ ...formData, state: text })
                    }
                  />
                </View>

                <View style={styles.formColThird}>
                  <Text style={styles.fieldLabel}>Pincode</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="412205"
                    value={formData.pincode}
                    onChangeText={(text) =>
                      setFormData({ ...formData, pincode: text })
                    }
                  />
                </View>

                {/* License & Tax Settings */}
                <View style={styles.formColHalf}>
                  <Text style={styles.fieldLabel}>Drug License No. (Form 20B/21B)</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="MH-PZ2-20B-XXXXXX"
                    value={formData.drugLicenseNo}
                    onChangeText={(text) =>
                      setFormData({ ...formData, drugLicenseNo: text })
                    }
                  />
                </View>

                <View style={styles.formColHalf}>
                  <Text style={styles.fieldLabel}>GSTIN</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="27AAAAF1234F1Z5"
                    value={formData.gstin}
                    onChangeText={(text) =>
                      setFormData({ ...formData, gstin: text })
                    }
                  />
                </View>

                <View style={styles.formColThird}>
                  <Text style={styles.fieldLabel}>Invoice Prefix</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="FIT-HQ-"
                    value={formData.invoicePrefix}
                    onChangeText={(text) =>
                      setFormData({ ...formData, invoicePrefix: text })
                    }
                  />
                </View>

                <View style={styles.formColThird}>
                  <Text style={styles.fieldLabel}>Default Tax Rate</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="12%"
                    value={formData.defaultTaxRate}
                    onChangeText={(text) =>
                      setFormData({ ...formData, defaultTaxRate: text })
                    }
                  />
                </View>

                <View style={styles.formColThird}>
                  <Text style={styles.fieldLabel}>Status</Text>
                  <View style={styles.statusToggleRow}>
                    <Pressable
                      onPress={() => setFormData({ ...formData, status: 'Active' })}
                      style={[
                        styles.statusSelectPill,
                        formData.status === 'Active' &&
                          styles.statusSelectPillActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusSelectText,
                          formData.status === 'Active' &&
                            styles.statusSelectTextActive,
                        ]}
                      >
                        Active
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        setFormData({ ...formData, status: 'Inactive' })
                      }
                      style={[
                        styles.statusSelectPill,
                        formData.status === 'Inactive' &&
                          styles.statusSelectPillInactive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusSelectText,
                          formData.status === 'Inactive' &&
                            styles.statusSelectTextInactive,
                        ]}
                      >
                        Inactive
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* Modal Footer */}
            <View style={styles.modalFooter}>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={styles.modalCancelButton}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveBranch}
                style={styles.modalSaveButton}
              >
                <Text style={styles.modalSaveText}>
                  {isEditing ? 'Save Changes' : 'Create Branch'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 6. VIEW DETAILS MODAL */}
      {selectedBranch && (
        <Modal
          visible={detailModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setDetailModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.detailModalCard, isMobile && styles.modalCardMobile]}>
              <View style={styles.detailHeader}>
                <View style={styles.detailHeaderLeft}>
                  <View style={styles.detailCodeBadge}>
                    <Text style={styles.detailCodeText}>{selectedBranch.code}</Text>
                  </View>
                  <View>
                    <Text style={styles.detailTitle}>{selectedBranch.name}</Text>
                    <Text style={styles.detailSubtitle}>
                      {selectedBranch.type} • {selectedBranch.city}, {selectedBranch.state}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => setDetailModalVisible(false)}
                  style={styles.modalCloseButton}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.detailBody}>
                <View style={styles.detailGrid}>
                  {/* Card: Operations */}
                  <View style={styles.detailSectionCard}>
                    <Text style={styles.detailSectionTitle}>Operations & Contacts</Text>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>In-Charge:</Text>
                      <Text style={styles.detailValue}>{selectedBranch.contactPerson}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Phone:</Text>
                      <Text style={styles.detailValue}>{selectedBranch.phone}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Email:</Text>
                      <Text style={styles.detailValue}>{selectedBranch.email}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Hours:</Text>
                      <Text style={styles.detailValue}>{selectedBranch.openingHours || 'N/A'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Staff Assigned:</Text>
                      <Text style={styles.detailValue}>{selectedBranch.staffCount} Active Members</Text>
                    </View>
                  </View>

                  {/* Card: Address & Location */}
                  <View style={styles.detailSectionCard}>
                    <Text style={styles.detailSectionTitle}>Address & Facility</Text>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Address:</Text>
                      <Text style={styles.detailValue}>{selectedBranch.address}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Pincode:</Text>
                      <Text style={styles.detailValue}>{selectedBranch.pincode}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Hub Classification:</Text>
                      <Text style={styles.detailValue}>
                        {selectedBranch.isMainHub ? 'Central Distribution Hub' : 'Regional Outlet'}
                      </Text>
                    </View>
                  </View>

                  {/* Card: Legal, Tax & Invoice */}
                  <View style={styles.detailSectionCard}>
                    <Text style={styles.detailSectionTitle}>Billing & Regulatory Compliance</Text>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Drug License No:</Text>
                      <Text style={styles.detailValue}>{selectedBranch.drugLicenseNo || 'Pending'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>GSTIN:</Text>
                      <Text style={styles.detailValue}>{selectedBranch.gstin}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Invoice Series:</Text>
                      <Text style={styles.detailValue}>{selectedBranch.invoicePrefix}XXXX</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Default GST:</Text>
                      <Text style={styles.detailValue}>{selectedBranch.defaultTaxRate}</Text>
                    </View>
                  </View>
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <Pressable
                  onPress={() => {
                    setDetailModalVisible(false);
                    handleOpenEditModal(selectedBranch);
                  }}
                  style={styles.modalSaveButton}
                >
                  <Text style={styles.modalSaveText}>Edit Branch Settings</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 60,
  },
  contentContainerMobile: {
    padding: 12,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 12,
  },
  titleWrapper: {
    flex: 1,
    minWidth: 260,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 18,
  },
  addBranchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    gap: 8,
    cursor: 'pointer',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(15, 118, 110, 0.2)',
      },
    }),
  },
  addBranchButtonIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  addBranchButtonText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  kpiRowCompact: {
    flexWrap: 'wrap',
  },
  filterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 20,
    gap: 14,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    outlineStyle: 'none',
  },
  clearSearchBtn: {
    padding: 4,
  },
  clearSearchText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  filterControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  typeTabsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  typeTab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    cursor: 'pointer',
  },
  typeTabSelected: {
    backgroundColor: '#0F766E',
  },
  typeTabText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  typeTabTextSelected: {
    color: '#FFFFFF',
  },
  statusToggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    padding: 3,
    borderRadius: 8,
  },
  statusPill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    cursor: 'pointer',
  },
  statusPillSelected: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
      },
    }),
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  statusPillTextSelected: {
    color: '#0F766E',
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  tableHeaderSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tableTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  countBadge: {
    backgroundColor: '#F0FDFA',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  countBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F766E',
  },
  tableSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 2,
  },
  tableWrapper: {
    minWidth: 900,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  thText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  colCode: { width: 130 },
  colName: { width: 250 },
  colContact: { width: 210 },
  colAddress: { width: 220 },
  colInvoice: { width: 130 },
  colStatus: { width: 110 },
  colActions: { width: 140 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableRowEven: {
    backgroundColor: '#FAFCFF',
  },
  codeBadge: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  codeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  mainHubPill: {
    backgroundColor: '#EFF6FF',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  mainHubText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB',
  },
  branchNameText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  branchTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  branchTypeTag: {
    fontSize: 11,
    color: '#0F766E',
    fontWeight: '600',
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  staffCountDot: {
    color: '#CBD5E1',
  },
  staffCountText: {
    fontSize: 11.5,
    color: '#64748B',
  },
  contactPersonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  contactPhoneText: {
    fontSize: 12,
    color: '#334155',
    marginTop: 2,
  },
  contactEmailText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  addressText: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 16,
  },
  cityStateText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  invoicePrefixText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
  },
  taxRateText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  /* Full-Fledged Interactive Toggle Switch Styles */
  toggleSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  toggleTrack: {
    width: 36,
    height: 20,
    borderRadius: 10,
    padding: 2,
    justifyContent: 'center',
    position: 'relative',
    ...Platform.select({
      web: {
        transition: 'background-color 0.2s ease',
      },
    }),
  },
  toggleTrackActive: {
    backgroundColor: '#10B981',
  },
  toggleTrackInactive: {
    backgroundColor: '#CBD5E1',
  },
  toggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    position: 'absolute',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
        transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      },
    }),
  },
  toggleThumbActive: {
    left: 18,
  },
  toggleThumbInactive: {
    left: 2,
  },
  toggleLabelText: {
    fontSize: 12,
    fontWeight: '700',
  },
  toggleLabelActive: {
    color: '#059669',
  },
  toggleLabelInactive: {
    color: '#64748B',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    gap: 6,
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  statusBadgeActive: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeInactive: {
    backgroundColor: '#F1F5F9',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotActive: {
    backgroundColor: '#16A34A',
  },
  statusDotInactive: {
    backgroundColor: '#94A3B8',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusTextActive: {
    color: '#15803D',
  },
  statusTextInactive: {
    color: '#64748B',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionViewBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    cursor: 'pointer',
  },
  actionViewBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  actionEditBtn: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    cursor: 'pointer',
  },
  actionEditBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 400,
  },
  emptyAddButton: {
    marginTop: 16,
    backgroundColor: '#0F766E',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  emptyAddButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'column',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
      },
    }),
  },
  modalCardMobile: {
    maxWidth: '96%',
    maxHeight: '94%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FAFCFF',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseButton: {
    padding: 6,
  },
  modalCloseText: {
    fontSize: 18,
    color: '#64748B',
    fontWeight: '700',
  },
  modalBodyScroll: {
    paddingHorizontal: 22,
    paddingVertical: 16,
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  formColFull: {
    width: '100%',
  },
  formColHalf: {
    width: '48%',
    minWidth: 260,
    flex: 1,
  },
  formColThird: {
    width: '31%',
    minWidth: 180,
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
  formInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    outlineStyle: 'none',
  },
  formInputError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  errorMsg: {
    fontSize: 11,
    color: '#DC2626',
    marginTop: 3,
    fontWeight: '600',
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  typeChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    cursor: 'pointer',
  },
  typeChipSelected: {
    backgroundColor: '#0F766E',
  },
  typeChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  typeChipTextSelected: {
    color: '#FFFFFF',
  },
  statusToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusSelectPill: {
    flex: 1,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    cursor: 'pointer',
  },
  statusSelectPillActive: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  statusSelectPillInactive: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  statusSelectText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  statusSelectTextActive: {
    color: '#15803D',
    fontWeight: '700',
  },
  statusSelectTextInactive: {
    color: '#B91C1C',
    fontWeight: '700',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    gap: 12,
  },
  modalCancelButton: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  modalSaveButton: {
    paddingVertical: 9,
    paddingHorizontal: 22,
    borderRadius: 8,
    backgroundColor: '#0F766E',
    cursor: 'pointer',
  },
  modalSaveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  detailModalCard: {
    width: '100%',
    maxWidth: 680,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FAFCFF',
  },
  detailHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailCodeBadge: {
    backgroundColor: '#0F766E',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  detailCodeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  detailSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  detailBody: {
    padding: 22,
  },
  detailGrid: {
    gap: 16,
  },
  detailSectionCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 16,
  },
  detailSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailLabel: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
    maxWidth: '65%',
    textAlign: 'right',
  },
});
