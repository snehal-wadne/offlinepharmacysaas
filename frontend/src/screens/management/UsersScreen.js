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
  MOCK_USERS_LIST,
  USER_ROLES_FILTER,
  MOCK_BRANCHES_LIST,
  BRANCH_FILTER_OPTIONS,
  MOCK_ROLES_LIST,
} from '../../data/managementMockData';
import { SkeletonTableRow } from '../../components/common/SkeletonLoader';
import PaginationControls from '../../components/common/PaginationControls';

export default function UsersScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('All Roles');
  const [selectedBranch, setSelectedBranch] = useState('All Branches');
  const [selectedStatus, setSelectedStatus] = useState('All'); // 'All' | 'Active' | 'Inactive'

  // Users State
  const [users, setUsers] = useState(MOCK_USERS_LIST);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Add / Invite / Edit Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeUserId, setActiveUserId] = useState(null);

  // View Details Modal State
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    employeeId: '',
    role: 'Pharmacist',
    primaryBranch: 'FIT Main Campus Hospital Pharmacy',
    assignedBranches: ['FIT Main Campus Hospital Pharmacy'],
    status: 'Active',
    regNumber: '',
    shift: 'General Shift (09:00 - 18:00)',
    accessPin: '',
    sendInviteEmail: true,
  });
  const [formErrors, setFormErrors] = useState({});

  // Dynamic KPIs calculated from user state
  const totalUsersCount = users.length;
  const activeUsersCount = users.filter((u) => u.status === 'Active').length;
  const inactiveUsersCount = totalUsersCount - activeUsersCount;
  const licensedPharmacistsCount = users.filter(
    (u) => u.role.toLowerCase().includes('pharmacist')
  ).length;
  const cashierBillingCount = users.filter((u) =>
    u.role.toLowerCase().includes('cashier') || u.role.toLowerCase().includes('billing')
  ).length;
  const adminManagersCount = users.filter(
    (u) =>
      u.role.toLowerCase().includes('admin') ||
      u.role.toLowerCase().includes('manager')
  ).length;

  // Filtered Users List
  const filteredUsers = users.filter((user) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      user.name.toLowerCase().includes(q) ||
      user.email.toLowerCase().includes(q) ||
      user.employeeId.toLowerCase().includes(q) ||
      user.phone.toLowerCase().includes(q) ||
      (user.regNumber && user.regNumber.toLowerCase().includes(q)) ||
      user.role.toLowerCase().includes(q);

    const matchesRole =
      selectedRole === 'All Roles' || user.role === selectedRole;

    const matchesBranch =
      selectedBranch === 'All Branches' ||
      user.primaryBranch === selectedBranch ||
      (user.assignedBranches && user.assignedBranches.includes(selectedBranch)) ||
      (user.assignedBranches && user.assignedBranches.includes('All Branches'));

    const matchesStatus =
      selectedStatus === 'All' || user.status === selectedStatus;

    return matchesSearch && matchesRole && matchesBranch && matchesStatus;
  });

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedRole !== 'All Roles' ||
    selectedBranch !== 'All Branches' ||
    selectedStatus !== 'All';

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedRole('All Roles');
    setSelectedBranch('All Branches');
    setSelectedStatus('All');
  };

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Open Modal for Add / Invite
  const handleOpenAddModal = () => {
    setIsEditing(false);
    setActiveUserId(null);
    const nextEmpNum = 60 + users.length + 1;
    setFormData({
      name: '',
      email: '',
      phone: '',
      employeeId: `FIT-EMP-0${nextEmpNum}`,
      role: 'Pharmacist',
      primaryBranch: 'FIT Main Campus Hospital Pharmacy',
      assignedBranches: ['FIT Main Campus Hospital Pharmacy'],
      status: 'Active',
      regNumber: '',
      shift: 'General Shift (09:00 - 18:00)',
      accessPin: '4892',
      sendInviteEmail: true,
    });
    setFormErrors({});
    setModalVisible(true);
  };

  // Open Modal for Edit
  const handleOpenEditModal = (user) => {
    setIsEditing(true);
    setActiveUserId(user.id);
    setFormData({
      name: user.name,
      email: user.email,
      phone: user.phone,
      employeeId: user.employeeId,
      role: user.role,
      primaryBranch: user.primaryBranch || 'FIT Main Campus Hospital Pharmacy',
      assignedBranches: user.assignedBranches || [user.primaryBranch || 'FIT Main Campus Hospital Pharmacy'],
      status: user.status,
      regNumber: user.regNumber || '',
      shift: user.shift || 'General Shift (09:00 - 18:00)',
      accessPin: '••••',
      sendInviteEmail: false,
    });
    setFormErrors({});
    setModalVisible(true);
  };

  // View User Profile Details Modal
  const handleOpenDetailModal = (user) => {
    setSelectedUser(user);
    setDetailModalVisible(true);
  };

  // Save User (Add or Edit)
  const handleSaveUser = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Full name is required';
    if (!formData.email.trim()) {
      errors.email = 'Email address is required';
    } else if (!formData.email.includes('@')) {
      errors.email = 'Please enter a valid institutional email';
    }
    if (!formData.phone.trim()) errors.phone = 'Phone number is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    if (isEditing) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === activeUserId
            ? {
                ...u,
                name: formData.name.trim(),
                email: formData.email.trim(),
                phone: formData.phone.trim(),
                role: formData.role,
                primaryBranch: formData.primaryBranch,
                assignedBranches:
                  formData.assignedBranches.length > 0
                    ? formData.assignedBranches
                    : [formData.primaryBranch],
                status: formData.status,
                regNumber: formData.regNumber.trim(),
                shift: formData.shift,
              }
            : u
        )
      );
      if (selectedUser && selectedUser.id === activeUserId) {
        setSelectedUser((prev) => ({
          ...prev,
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          role: formData.role,
          primaryBranch: formData.primaryBranch,
          assignedBranches: formData.assignedBranches,
          status: formData.status,
          regNumber: formData.regNumber.trim(),
          shift: formData.shift,
        }));
      }
      if (onShowToast) {
        onShowToast(`✓ Updated profile for "${formData.name.trim()}"`);
      }
    } else {
      const names = formData.name.trim().split(' ');
      const initials =
        names.length > 1
          ? `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase()
          : formData.name.slice(0, 2).toUpperCase();

      const newUser = {
        id: `USR-1${15 + users.length}`,
        employeeId: formData.employeeId.trim() || `FIT-EMP-0${60 + users.length}`,
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        role: formData.role,
        assignedBranches:
          formData.assignedBranches.length > 0
            ? formData.assignedBranches
            : [formData.primaryBranch],
        primaryBranch: formData.primaryBranch,
        status: formData.status,
        avatarInitials: initials || 'ST',
        joinedDate: 'Just now',
        lastActive: 'Invited (Pending Activation)',
        regNumber: formData.regNumber.trim() || (formData.role.includes('Pharmacist') ? 'PCI-MH-PENDING' : 'N/A'),
        accessLevel:
          formData.role === 'Administrator'
            ? 'Admin'
            : formData.role === 'Chief Pharmacist'
            ? 'High'
            : formData.role === 'Store Manager'
            ? 'Medium-High'
            : 'Standard',
        shift: formData.shift,
      };

      setUsers((prev) => [newUser, ...prev]);
      if (onShowToast) {
        onShowToast(
          `✓ Invited ${newUser.name} (${newUser.role}) to Flora Institute of Technology!`
        );
      }
    }

    setModalVisible(false);
  };

  // Toggle user Active / Inactive status
  const handleToggleStatus = (user) => {
    const nextStatus = user.status === 'Active' ? 'Inactive' : 'Active';
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, status: nextStatus } : u))
    );
    if (selectedUser && selectedUser.id === user.id) {
      setSelectedUser((prev) => ({ ...prev, status: nextStatus }));
    }
    if (onShowToast) {
      onShowToast(
        `Staff member "${user.name}" marked as ${nextStatus}`
      );
    }
  };

  // Resend invitation / access PIN action
  const handleResendInvite = (user) => {
    if (onShowToast) {
      onShowToast(`✓ Access credentials & invitation link resent to ${user.email}`);
    }
  };

  // Export Roster simulation
  const handleExportRoster = () => {
    if (onShowToast) {
      onShowToast(`✓ Exported FIT Staff Directory (${filteredUsers.length} users) to CSV`);
    }
  };

  // Toggle branch selection in multi-branch checkbox
  const handleToggleBranchAssignment = (branchName) => {
    let updated = [...formData.assignedBranches];
    if (updated.includes(branchName)) {
      if (updated.length > 1) {
        updated = updated.filter((b) => b !== branchName);
      }
    } else {
      updated.push(branchName);
    }
    setFormData({
      ...formData,
      assignedBranches: updated,
      primaryBranch: updated.includes(formData.primaryBranch)
        ? formData.primaryBranch
        : updated[0] || branchName,
    });
  };

  // Role Badge Color Mapper
  const getRoleBadgeStyle = (role) => {
    switch (role) {
      case 'Administrator':
        return { bg: '#F0FDFA', border: '#99F6E4', text: '#0F766E' };
      case 'Chief Pharmacist':
        return { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' };
      case 'Pharmacist':
        return { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D' };
      case 'Store Manager':
        return { bg: '#FFFBEB', border: '#FDE68A', text: '#B45309' };
      case 'Billing / Cashier':
        return { bg: '#FAF5FF', border: '#E9D5FF', text: '#7E22CE' };
      case 'Inventory Clerk':
        return { bg: '#F8FAFC', border: '#E2E8F0', text: '#475569' };
      case 'Auditor / Compliance':
        return { bg: '#F1F5F9', border: '#CBD5E1', text: '#334155' };
      default:
        return { bg: '#F1F5F9', border: '#E2E8F0', text: '#475569' };
    }
  };

  // Lookup role permission summary
  const getRolePermissionsSummary = (roleName) => {
    const roleObj = MOCK_ROLES_LIST.find((r) => r.name === roleName);
    if (!roleObj) return [];
    return Object.entries(roleObj.permissions)
      .filter(([_, allowed]) => allowed)
      .map(([k]) =>
        k
          .replace(/^(pos_|inv_|pur_|cust_|rep_|mgmt_)/, '')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase())
      )
      .slice(0, 8);
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
          <Text style={styles.pageTitle}>User & Staff Management</Text>
          <Text style={styles.pageSubtitle}>
            Manage registered pharmacists, cashiers, store managers, role assignments, and branch authorizations across Flora Institute of Technology.
          </Text>
        </View>

        <View style={styles.headerActionGroup}>
          <Pressable
            onPress={handleExportRoster}
            style={styles.exportButton}
            accessibilityRole="button"
            accessibilityLabel="Export Staff Directory"
          >
            <Text style={styles.exportButtonText}>📥 Export Directory</Text>
          </Pressable>

          <Pressable
            onPress={handleOpenAddModal}
            style={styles.addUserButton}
            accessibilityRole="button"
            accessibilityLabel="Invite Staff Member"
          >
            <Text style={styles.addUserButtonIcon}>+</Text>
            <Text style={styles.addUserButtonText}>Invite Staff Member</Text>
          </Pressable>
        </View>
      </View>

      {/* 2. Top KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        <InventoryStatCard
          label="Total Staff Users"
          value={String(totalUsersCount)}
          subtext={`${activeUsersCount} Active / ${inactiveUsersCount} Inactive`}
          variant="teal"
          onPress={() => setSelectedStatus('All')}
        />
        <InventoryStatCard
          label="Registered Pharmacists"
          value={`${licensedPharmacistsCount} Licensed`}
          subtext="Prescription approval & dispensing"
          variant="blue"
          onPress={() => setSelectedRole('Pharmacist')}
        />
        <InventoryStatCard
          label="Billing & Cashiers"
          value={`${cashierBillingCount} Staff`}
          subtext="POS counter & receipt sales"
          variant="amber"
          onPress={() => setSelectedRole('Billing / Cashier')}
        />
        <InventoryStatCard
          label="Supervisory Admins"
          value={`${adminManagersCount} Admins`}
          subtext="Multi-branch management & controls"
          variant="orange"
          onPress={() => setSelectedRole('Administrator')}
        />
      </View>

      {/* 3. Search and Multi-Filter Card */}
      <View style={styles.filterCard}>
        {/* Search Bar */}
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by staff name, employee ID, email, phone, or PCI license..."
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

        {/* Roles Filter Bar */}
        <View style={styles.filterSection}>
          <Text style={styles.filterGroupLabel}>FILTER BY ROLE:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterPillsScroll}
          >
            {USER_ROLES_FILTER.map((role) => {
              const isSelected = selectedRole === role;
              return (
                <Pressable
                  key={role}
                  onPress={() => setSelectedRole(role)}
                  style={[
                    styles.filterPill,
                    isSelected && styles.filterPillSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      isSelected && styles.filterPillTextSelected,
                    ]}
                  >
                    {role}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Branch Filter & Status Quick Toggle Row */}
        <View style={styles.filterBottomRow}>
          {/* Branch Filter Tabs */}
          <View style={styles.branchFilterSection}>
            <Text style={styles.filterGroupLabel}>ASSIGNED FACILITY / BRANCH:</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterPillsScroll}
            >
              {BRANCH_FILTER_OPTIONS.map((branch) => {
                const isSelected = selectedBranch === branch;
                return (
                  <Pressable
                    key={branch}
                    onPress={() => setSelectedBranch(branch)}
                    style={[
                      styles.branchFilterPill,
                      isSelected && styles.branchFilterPillSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.branchFilterPillText,
                        isSelected && styles.branchFilterPillTextSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {branch}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Status Quick Toggle */}
          <View style={styles.statusFilterSection}>
            <Text style={styles.filterGroupLabel}>STATUS:</Text>
            <View style={styles.statusToggleGroup}>
              {['All', 'Active', 'Inactive'].map((status) => {
                const isSelected = selectedStatus === status;
                return (
                  <Pressable
                    key={status}
                    onPress={() => setSelectedStatus(status)}
                    style={[
                      styles.statusTogglePill,
                      isSelected && styles.statusTogglePillSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusTogglePillText,
                        isSelected && styles.statusTogglePillTextSelected,
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

        {/* Active Filter Indicator & Reset */}
        {hasActiveFilters && (
          <View style={styles.activeFilterNoticeRow}>
            <Text style={styles.activeFilterNoticeText}>
              Showing results for:{' '}
              <Text style={styles.activeFilterHighlight}>
                {[
                  searchQuery ? `"${searchQuery}"` : null,
                  selectedRole !== 'All Roles' ? selectedRole : null,
                  selectedBranch !== 'All Branches' ? selectedBranch : null,
                  selectedStatus !== 'All' ? `${selectedStatus} status` : null,
                ]
                  .filter(Boolean)
                  .join(' • ')}
              </Text>
            </Text>
            <Pressable onPress={handleResetFilters} style={styles.resetFilterBtn}>
              <Text style={styles.resetFilterBtnText}>Reset Filters ✕</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* 4. Users Table Card */}
      <View style={styles.tableCard}>
        <View style={styles.tableHeaderSection}>
          <View style={styles.tableTitleRow}>
            <Text style={styles.tableTitle}>Staff & User Accounts</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>
                {filteredUsers.length} {filteredUsers.length === 1 ? 'User' : 'Users'}
              </Text>
            </View>
          </View>
          <Text style={styles.tableSubtitle}>
            Pharmacist licenses, branch accessibility, security permissions, and direct credential management.
          </Text>
        </View>

        {loading ? (
          <View style={{ padding: 20 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonTableRow key={i} />
            ))}
          </View>
        ) : filteredUsers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No Staff Members Found</Text>
            <Text style={styles.emptySubtitle}>
              No users match your active search filters or query criteria.
            </Text>
            {hasActiveFilters ? (
              <Pressable
                onPress={handleResetFilters}
                style={styles.emptyResetButton}
              >
                <Text style={styles.emptyResetButtonText}>Clear All Filters</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={handleOpenAddModal}
                style={styles.emptyAddButton}
              >
                <Text style={styles.emptyAddButtonText}>+ Invite First Staff Member</Text>
              </Pressable>
            )}
          </View>
        ) : isMobile ? (
          <View style={styles.mobileStaffList}>
            {paginatedUsers.map((user) => {
              const isActive = user.status === 'Active';
              const roleBadge = getRoleBadgeStyle(user.role);

              return (
                <View key={user.id} style={styles.mobileStaffCard}>
                  {/* Top Row: Avatar + Name + Status Toggle */}
                  <View style={styles.mobileStaffTopRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <View style={[styles.avatarCircle, { backgroundColor: roleBadge.text }]}>
                        <Text style={styles.avatarText}>{user.avatarInitials}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.userNameText} numberOfLines={1}>{user.name}</Text>
                        <Text style={styles.userJoinedText}>{user.lastActive || `Joined: ${user.joinedDate}`}</Text>
                      </View>
                    </View>

                    <Pressable
                      onPress={() => handleToggleStatus(user)}
                      style={styles.toggleSwitchRow}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: isActive }}
                      accessibilityLabel={`User status: ${user.status}`}
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
                        {user.status}
                      </Text>
                    </Pressable>
                  </View>

                  {/* Badges row */}
                  <View style={styles.mobileStaffBadgesRow}>
                    <View style={[styles.roleBadge, { backgroundColor: roleBadge.bg, borderColor: roleBadge.border }]}>
                      <Text style={[styles.roleBadgeText, { color: roleBadge.text }]}>{user.role}</Text>
                    </View>
                    <View style={styles.empIdBadge}>
                      <Text style={styles.empIdText}>{user.employeeId}</Text>
                    </View>
                    {user.regNumber && user.regNumber !== 'N/A' && (
                      <View style={styles.regNoPill}>
                        <Text style={styles.regNoText} numberOfLines={1}>{user.regNumber}</Text>
                      </View>
                    )}
                  </View>

                  {/* Branch & Contact Info */}
                  <View style={styles.mobileStaffInfoBox}>
                    <Text style={styles.mobileStaffInfoLabel}>BRANCH ASSIGNMENT</Text>
                    <Text style={styles.branchNameText}>{user.primaryBranch}</Text>
                    <Text style={[styles.contactEmail, { marginTop: 4 }]}>✉ {user.email}</Text>
                    <Text style={styles.contactPhone}>📞 {user.phone}</Text>
                  </View>

                  {/* Actions footer */}
                  <View style={styles.mobileStaffFooter}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable
                        onPress={() => handleOpenDetailModal(user)}
                        style={styles.actionViewBtn}
                        accessibilityRole="button"
                        accessibilityLabel="View Profile"
                      >
                        <Text style={styles.actionViewBtnText}>View</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => handleOpenEditModal(user)}
                        style={styles.actionEditBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Edit User"
                      >
                        <Text style={styles.actionEditBtnText}>Edit</Text>
                      </Pressable>
                    </View>

                    {user.status !== 'Active' && (
                      <Pressable
                        onPress={() => handleResendInvite(user)}
                        style={styles.actionInviteBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Resend Invite"
                      >
                        <Text style={styles.actionInviteBtnText}>Invite</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              {/* Table Header Row */}
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.thText, styles.colUser]}>Staff Member</Text>
                <Text style={[styles.thText, styles.colEmpId]}>Staff ID & License</Text>
                <Text style={[styles.thText, styles.colRole]}>Assigned Role</Text>
                <Text style={[styles.thText, styles.colBranch]}>Branch Assignment</Text>
                <Text style={[styles.thText, styles.colContact]}>Contact Details</Text>
                <Text style={[styles.thText, styles.colStatus]}>Status</Text>
                <Text style={[styles.thText, styles.colActions]}>Actions</Text>
              </View>

              {/* Table Body */}
              {paginatedUsers.map((user, index) => {
                const isActive = user.status === 'Active';
                const isEven = index % 2 === 0;
                const roleBadge = getRoleBadgeStyle(user.role);

                return (
                  <View
                    key={user.id}
                    style={[styles.tableRow, isEven && styles.tableRowEven]}
                  >
                    {/* 1. User Avatar, Name & Joined */}
                    <View style={[styles.colUser, styles.userCell]}>
                      <View
                        style={[
                          styles.avatarCircle,
                          { backgroundColor: roleBadge.text },
                        ]}
                      >
                        <Text style={styles.avatarText}>{user.avatarInitials}</Text>
                      </View>
                      <View style={styles.userInfo}>
                        <Text style={styles.userNameText} numberOfLines={1}>
                          {user.name}
                        </Text>
                        <Text style={styles.userJoinedText}>
                          {user.lastActive || `Joined: ${user.joinedDate}`}
                        </Text>
                      </View>
                    </View>

                    {/* 2. Employee ID & Council Registration */}
                    <View style={styles.colEmpId}>
                      <View style={styles.empIdBadge}>
                        <Text style={styles.empIdText}>{user.employeeId}</Text>
                      </View>
                      {user.regNumber && user.regNumber !== 'N/A' && (
                        <View style={styles.regNoPill}>
                          <Text style={styles.regNoText} numberOfLines={1}>
                            {user.regNumber}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* 3. Role Badge */}
                    <View style={styles.colRole}>
                      <View
                        style={[
                          styles.roleBadge,
                          {
                            backgroundColor: roleBadge.bg,
                            borderColor: roleBadge.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.roleBadgeText,
                            { color: roleBadge.text },
                          ]}
                        >
                          {user.role}
                        </Text>
                      </View>
                      <Text style={styles.accessLevelText}>
                        {user.accessLevel || 'Standard'}
                      </Text>
                    </View>

                    {/* 4. Branch Assignment */}
                    <View style={styles.colBranch}>
                      <Text style={styles.branchNameText} numberOfLines={2}>
                        {user.primaryBranch}
                      </Text>
                      {user.assignedBranches && user.assignedBranches.length > 1 && (
                        <View style={styles.multiBranchBadge}>
                          <Text style={styles.multiBranchBadgeText}>
                            +{user.assignedBranches.length - 1} extra branch
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* 5. Contact Details */}
                    <View style={styles.colContact}>
                      <Text style={styles.contactEmail} numberOfLines={1}>
                        {user.email}
                      </Text>
                      <Text style={styles.contactPhone}>{user.phone}</Text>
                    </View>

                    {/* 6. Active / Inactive Status Toggle Switch */}
                    <View style={styles.colStatus}>
                      <Pressable
                        onPress={() => handleToggleStatus(user)}
                        style={styles.toggleSwitchRow}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: isActive }}
                        accessibilityLabel={`User status: ${user.status}. Tap to switch.`}
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
                          {user.status}
                        </Text>
                      </Pressable>
                    </View>

                    {/* 7. Action Buttons (View, Edit, and conditional Resend Invite for pending members only) */}
                    <View style={[styles.colActions, styles.actionsRow]}>
                      <Pressable
                        onPress={() => handleOpenDetailModal(user)}
                        style={styles.actionViewBtn}
                        accessibilityRole="button"
                        accessibilityLabel="View Profile"
                      >
                        <Text style={styles.actionViewBtnText}>View</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => handleOpenEditModal(user)}
                        style={styles.actionEditBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Edit User"
                      >
                        <Text style={styles.actionEditBtnText}>Edit</Text>
                      </Pressable>

                      {/* Invite / Resend Invite option: Only shown if user is NOT an active member yet (e.g. Inactive or Pending Activation) */}
                      {user.status !== 'Active' && (
                        <Pressable
                          onPress={() => handleResendInvite(user)}
                          style={styles.actionInviteBtn}
                          accessibilityRole="button"
                          accessibilityLabel="Resend Invite / Key"
                        >
                          <Text style={styles.actionInviteBtnText}>Invite</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}
        {!loading && filteredUsers.length > 0 && (
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={filteredUsers.length}
          />
        )}
      </View>

      {/* 5. Add / Invite User Modal */}
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
                  {isEditing ? 'Edit Staff Profile' : 'Invite New Staff Member'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {isEditing
                    ? `Update credentials, branch assignments, and role permissions for ${formData.name || 'User'}`
                    : 'Send onboarding email and assign POS role in Flora Institute of Technology'}
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
                {/* 1. Full Name */}
                <View style={styles.formColHalf}>
                  <Text style={styles.fieldLabel}>
                    Full Name <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={[
                      styles.formInput,
                      formErrors.name && styles.formInputError,
                    ]}
                    placeholder="e.g. Dr. Rajesh Kumar"
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

                {/* 2. Staff / Employee ID */}
                <View style={styles.formColHalf}>
                  <Text style={styles.fieldLabel}>Employee / Staff ID</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. FIT-EMP-055"
                    value={formData.employeeId}
                    onChangeText={(text) =>
                      setFormData({ ...formData, employeeId: text })
                    }
                  />
                </View>

                {/* 3. Institutional Email */}
                <View style={styles.formColHalf}>
                  <Text style={styles.fieldLabel}>
                    Institutional Email <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={[
                      styles.formInput,
                      formErrors.email && styles.formInputError,
                    ]}
                    placeholder="name@flora.edu.in"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={formData.email}
                    onChangeText={(text) => {
                      setFormData({ ...formData, email: text });
                      if (formErrors.email) setFormErrors({ ...formErrors, email: null });
                    }}
                  />
                  {formErrors.email ? (
                    <Text style={styles.errorMsg}>{formErrors.email}</Text>
                  ) : null}
                </View>

                {/* 4. Phone Number */}
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
                    keyboardType="phone-pad"
                    value={formData.phone}
                    onChangeText={(text) => {
                      setFormData({ ...formData, phone: text });
                      if (formErrors.phone) setFormErrors({ ...formErrors, phone: null });
                    }}
                  />
                  {formErrors.phone ? (
                    <Text style={styles.errorMsg}>{formErrors.phone}</Text>
                  ) : null}
                </View>

                {/* 5. Role Selector */}
                <View style={styles.formColFull}>
                  <Text style={styles.fieldLabel}>
                    Select Role & Access Clearance <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <View style={styles.roleSelectionGrid}>
                    {[
                      'Administrator',
                      'Chief Pharmacist',
                      'Pharmacist',
                      'Store Manager',
                      'Billing / Cashier',
                      'Inventory Clerk',
                      'Auditor / Compliance',
                    ].map((r) => {
                      const isSelected = formData.role === r;
                      return (
                        <Pressable
                          key={r}
                          onPress={() => setFormData({ ...formData, role: r })}
                          style={[
                            styles.roleChip,
                            isSelected && styles.roleChipSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.roleChipText,
                              isSelected && styles.roleChipTextSelected,
                            ]}
                          >
                            {r}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* 6. Primary Branch Assignment */}
                <View style={styles.formColFull}>
                  <Text style={styles.fieldLabel}>
                    Primary Branch Dispensing Facility
                  </Text>
                  <View style={styles.branchSelectGrid}>
                    {MOCK_BRANCHES_LIST.map((b) => {
                      const isSelected = formData.primaryBranch === b.name;
                      return (
                        <Pressable
                          key={b.id}
                          onPress={() => {
                            const newAssigned = formData.assignedBranches.includes(b.name)
                              ? formData.assignedBranches
                              : [...formData.assignedBranches, b.name];
                            setFormData({
                              ...formData,
                              primaryBranch: b.name,
                              assignedBranches: newAssigned,
                            });
                          }}
                          style={[
                            styles.branchSelectCard,
                            isSelected && styles.branchSelectCardSelected,
                          ]}
                        >
                          <View style={styles.branchCardHeaderRow}>
                            <Text
                              style={[
                                styles.branchSelectName,
                                isSelected && styles.branchSelectNameSelected,
                              ]}
                              numberOfLines={1}
                            >
                              {b.name}
                            </Text>
                            {isSelected && (
                              <View style={styles.primaryCheckDot}>
                                <Text style={styles.primaryCheckDotText}>✓</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.branchSelectCode}>
                            {b.code} • {b.type}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* 7. Multi-Branch Access Authorizations */}
                <View style={styles.formColFull}>
                  <Text style={styles.fieldLabel}>
                    Multi-Branch Access Clearance (Check all that apply)
                  </Text>
                  <View style={styles.multiBranchGrid}>
                    {MOCK_BRANCHES_LIST.map((b) => {
                      const isChecked = formData.assignedBranches.includes(b.name);
                      return (
                        <Pressable
                          key={b.id}
                          onPress={() => handleToggleBranchAssignment(b.name)}
                          style={[
                            styles.multiBranchCheckChip,
                            isChecked && styles.multiBranchCheckChipSelected,
                          ]}
                        >
                          <Text style={styles.multiBranchCheckIcon}>
                            {isChecked ? '☑' : '☐'}
                          </Text>
                          <Text
                            style={[
                              styles.multiBranchCheckText,
                              isChecked && styles.multiBranchCheckTextSelected,
                            ]}
                            numberOfLines={1}
                          >
                            {b.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* 8. Pharmacy Council Reg No. & Working Shift */}
                <View style={styles.formColHalf}>
                  <Text style={styles.fieldLabel}>
                    Pharmacy Council Reg No. (PCI / State Board)
                  </Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. PCI-MH-94821"
                    value={formData.regNumber}
                    onChangeText={(text) =>
                      setFormData({ ...formData, regNumber: text })
                    }
                  />
                </View>

                <View style={styles.formColHalf}>
                  <Text style={styles.fieldLabel}>Working Shift / Schedule</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. General Shift (09:00 - 18:00)"
                    value={formData.shift}
                    onChangeText={(text) =>
                      setFormData({ ...formData, shift: text })
                    }
                  />
                </View>

                {/* 9. Status Selector & Security PIN */}
                <View style={styles.formColHalf}>
                  <Text style={styles.fieldLabel}>Account Status</Text>
                  <Pressable
                    onPress={() =>
                      setFormData({
                        ...formData,
                        status: formData.status === 'Active' ? 'Inactive' : 'Active',
                      })
                    }
                    style={styles.modalToggleCard}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: formData.status === 'Active' }}
                  >
                    <View
                      style={[
                        styles.toggleTrack,
                        formData.status === 'Active'
                          ? styles.toggleTrackActive
                          : styles.toggleTrackInactive,
                      ]}
                    >
                      <View
                        style={[
                          styles.toggleThumb,
                          formData.status === 'Active'
                            ? styles.toggleThumbActive
                            : styles.toggleThumbInactive,
                        ]}
                      />
                    </View>
                    <View style={styles.modalToggleTextCol}>
                      <Text
                        style={[
                          styles.modalToggleMainText,
                          formData.status === 'Active' && styles.statusLabelActive,
                        ]}
                      >
                        {formData.status === 'Active'
                          ? 'Active Account'
                          : 'Inactive (Disabled)'}
                      </Text>
                      <Text style={styles.modalToggleSubText}>
                        {formData.status === 'Active'
                          ? 'Allowed to log in & bill'
                          : 'Access suspended'}
                      </Text>
                    </View>
                  </Pressable>
                </View>

                <View style={styles.formColHalf}>
                  <Text style={styles.fieldLabel}>Quick POS Access PIN</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="4-digit PIN (e.g. 4892)"
                    secureTextEntry={false}
                    maxLength={6}
                    value={formData.accessPin}
                    onChangeText={(text) =>
                      setFormData({ ...formData, accessPin: text })
                    }
                  />
                </View>

                {/* 10. Send Invite Toggle Switch */}
                {!isEditing && (
                  <View style={styles.formColFull}>
                    <Pressable
                      onPress={() =>
                        setFormData({
                          ...formData,
                          sendInviteEmail: !formData.sendInviteEmail,
                        })
                      }
                      style={styles.inviteToggleBox}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: formData.sendInviteEmail }}
                    >
                      <View
                        style={[
                          styles.toggleTrack,
                          formData.sendInviteEmail
                            ? styles.toggleTrackActive
                            : styles.toggleTrackInactive,
                        ]}
                      >
                        <View
                          style={[
                            styles.toggleThumb,
                            formData.sendInviteEmail
                              ? styles.toggleThumbActive
                              : styles.toggleThumbInactive,
                          ]}
                        />
                      </View>
                      <View style={styles.inviteToggleTextWrapper}>
                        <Text style={styles.inviteToggleTitle}>
                          Send institutional welcome & invitation email
                        </Text>
                        <Text style={styles.inviteToggleSubtitle}>
                          Includes single sign-on link and initial POS PIN setup instructions.
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                )}
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
                onPress={handleSaveUser}
                style={styles.modalSaveButton}
              >
                <Text style={styles.modalSaveText}>
                  {isEditing ? 'Save Changes' : 'Send Invitation'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 6. VIEW USER PROFILE DETAILS MODAL */}
      {selectedUser && (
        <Modal
          visible={detailModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setDetailModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.detailModalCard, isMobile && styles.modalCardMobile]}>
              {/* Profile Header */}
              <View style={styles.detailHeader}>
                <View style={styles.detailHeaderLeft}>
                  <View
                    style={[
                      styles.detailAvatarCircle,
                      {
                        backgroundColor: getRoleBadgeStyle(selectedUser.role).text,
                      },
                    ]}
                  >
                    <Text style={styles.detailAvatarText}>
                      {selectedUser.avatarInitials}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.detailTitle}>{selectedUser.name}</Text>
                    <View style={styles.detailSubtitleRow}>
                      <View
                        style={[
                          styles.roleBadge,
                          {
                            backgroundColor: getRoleBadgeStyle(selectedUser.role).bg,
                            borderColor: getRoleBadgeStyle(selectedUser.role).border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.roleBadgeText,
                            { color: getRoleBadgeStyle(selectedUser.role).text },
                          ]}
                        >
                          {selectedUser.role}
                        </Text>
                      </View>
                      <Text style={styles.detailEmpIdText}>
                        {selectedUser.employeeId}
                      </Text>
                      <View
                        style={[
                          styles.statusBadge,
                          selectedUser.status === 'Active'
                            ? styles.statusBadgeActive
                            : styles.statusBadgeInactive,
                        ]}
                      >
                        <View
                          style={[
                            styles.statusDot,
                            selectedUser.status === 'Active'
                              ? styles.statusDotActive
                              : styles.statusDotInactive,
                          ]}
                        />
                        <Text
                          style={[
                            styles.statusText,
                            selectedUser.status === 'Active'
                              ? styles.statusTextActive
                              : styles.statusTextInactive,
                          ]}
                        >
                          {selectedUser.status}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                <Pressable
                  onPress={() => setDetailModalVisible(false)}
                  style={styles.modalCloseButton}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </Pressable>
              </View>

              {/* Profile Body */}
              <ScrollView style={styles.detailBodyScroll}>
                <View style={styles.detailGrid}>
                  {/* Card 1: Contact & Employment Information */}
                  <View style={styles.detailSectionCard}>
                    <Text style={styles.detailSectionTitle}>Contact & Staff Profile</Text>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Email Address:</Text>
                      <Text style={styles.detailValue}>{selectedUser.email}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Phone Number:</Text>
                      <Text style={styles.detailValue}>{selectedUser.phone}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Joined Date:</Text>
                      <Text style={styles.detailValue}>{selectedUser.joinedDate}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Last Active:</Text>
                      <Text style={styles.detailValue}>{selectedUser.lastActive || 'Active today'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Shift / Timings:</Text>
                      <Text style={styles.detailValue}>
                        {selectedUser.shift || 'General Shift (09:00 - 18:00)'}
                      </Text>
                    </View>
                  </View>

                  {/* Card 2: Branch & Facility Assignments */}
                  <View style={styles.detailSectionCard}>
                    <Text style={styles.detailSectionTitle}>Branch Dispensing Authorizations</Text>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Primary Branch:</Text>
                      <Text style={styles.detailValueHighlight}>
                        {selectedUser.primaryBranch}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>All Authorized Facilities:</Text>
                      <Text style={styles.detailValue}>
                        {(selectedUser.assignedBranches || [selectedUser.primaryBranch]).join(', ')}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Clearance Scope:</Text>
                      <Text style={styles.detailValue}>
                        {selectedUser.assignedBranches && selectedUser.assignedBranches.includes('All Branches')
                          ? 'Campus-Wide Master Access'
                          : 'Specific Assigned Pharmacy Outlets'}
                      </Text>
                    </View>
                  </View>

                  {/* Card 3: Clinical & Regulatory Credentials */}
                  <View style={styles.detailSectionCard}>
                    <Text style={styles.detailSectionTitle}>Clinical & Regulatory Registration</Text>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Council Reg No:</Text>
                      <Text style={styles.detailValue}>
                        {selectedUser.regNumber || 'Not Applicable'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Rx Approval Authority:</Text>
                      <Text style={styles.detailValue}>
                        {selectedUser.role.includes('Pharmacist')
                          ? 'Authorized (Schedule H / H1 / X)'
                          : 'Read-Only Dispensing'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Audit Trail Logging:</Text>
                      <Text style={styles.detailValue}>Enabled (All Actions Logged)</Text>
                    </View>
                  </View>

                  {/* Card 4: Granted Role Permissions */}
                  <View style={styles.detailSectionCard}>
                    <Text style={styles.detailSectionTitle}>
                      Role Permissions Overview ({selectedUser.role})
                    </Text>
                    <View style={styles.permissionTagsRow}>
                      {getRolePermissionsSummary(selectedUser.role).map((perm, idx) => (
                        <View key={idx} style={styles.permissionTagPill}>
                          <Text style={styles.permissionTagCheck}>✓</Text>
                          <Text style={styles.permissionTagText}>{perm}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              </ScrollView>

              {/* Profile Footer */}
              <View style={styles.modalFooter}>
                <Pressable
                  onPress={() => handleToggleStatus(selectedUser)}
                  style={[
                    styles.modalStatusToggleBtn,
                    selectedUser.status === 'Active'
                      ? styles.modalStatusToggleBtnInactive
                      : styles.modalStatusToggleBtnActive,
                  ]}
                >
                  <Text style={styles.modalStatusToggleBtnText}>
                    {selectedUser.status === 'Active'
                      ? 'Deactivate User'
                      : 'Activate User'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setDetailModalVisible(false);
                    handleOpenEditModal(selectedUser);
                  }}
                  style={styles.modalSaveButton}
                >
                  <Text style={styles.modalSaveText}>Edit Staff Profile</Text>
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
  headerActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  exportButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    cursor: 'pointer',
  },
  exportButtonText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  addUserButton: {
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
  addUserButtonIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  addUserButtonText: {
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
    cursor: 'pointer',
  },
  clearSearchText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  filterSection: {
    gap: 6,
  },
  filterGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  filterPillsScroll: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  filterPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    cursor: 'pointer',
  },
  filterPillSelected: {
    backgroundColor: '#0F766E',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterPillTextSelected: {
    color: '#FFFFFF',
  },
  filterBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 14,
  },
  branchFilterSection: {
    flex: 1,
    minWidth: 280,
    gap: 6,
  },
  branchFilterPill: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    cursor: 'pointer',
  },
  branchFilterPillSelected: {
    backgroundColor: '#F0FDFA',
    borderColor: '#0F766E',
  },
  branchFilterPillText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  branchFilterPillTextSelected: {
    color: '#0F766E',
    fontWeight: '700',
  },
  statusFilterSection: {
    gap: 6,
  },
  statusToggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    padding: 3,
    borderRadius: 8,
  },
  statusTogglePill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    cursor: 'pointer',
  },
  statusTogglePillSelected: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
      },
    }),
  },
  statusTogglePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  statusTogglePillTextSelected: {
    color: '#0F766E',
    fontWeight: '700',
  },
  activeFilterNoticeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    flexWrap: 'wrap',
    gap: 8,
  },
  activeFilterNoticeText: {
    fontSize: 12,
    color: '#64748B',
  },
  activeFilterHighlight: {
    color: '#0F766E',
    fontWeight: '700',
  },
  resetFilterBtn: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    cursor: 'pointer',
  },
  resetFilterBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#B91C1C',
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
    minWidth: 960,
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
  colUser: { width: 230 },
  colEmpId: { width: 140 },
  colRole: { width: 160 },
  colBranch: { width: 210 },
  colContact: { width: 200 },
  colStatus: { width: 110 },
  colActions: { width: 150 },
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
  userCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  userInfo: {
    flex: 1,
  },
  userNameText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  userJoinedText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  empIdBadge: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  empIdText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  regNoPill: {
    marginTop: 3,
    alignSelf: 'flex-start',
  },
  regNoText: {
    fontSize: 11,
    color: '#0F766E',
    fontWeight: '600',
  },
  roleBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  roleBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  accessLevelText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  branchNameText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
    lineHeight: 16,
  },
  multiBranchBadge: {
    backgroundColor: '#EFF6FF',
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginTop: 3,
    alignSelf: 'flex-start',
  },
  multiBranchBadgeText: {
    fontSize: 10.5,
    color: '#2563EB',
    fontWeight: '600',
  },
  contactEmail: {
    fontSize: 12.5,
    color: '#334155',
    fontWeight: '500',
  },
  contactPhone: {
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
  modalToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 10,
    gap: 12,
    cursor: 'pointer',
  },
  modalToggleTextCol: {
    flex: 1,
  },
  modalToggleMainText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  modalToggleSubText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  statusLabelActive: {
    color: '#059669',
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
    gap: 6,
  },
  actionViewBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 5,
    paddingHorizontal: 8,
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
    paddingHorizontal: 8,
    borderRadius: 6,
    cursor: 'pointer',
  },
  actionEditBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
  },
  actionInviteBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    cursor: 'pointer',
  },
  actionInviteBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
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
  emptyResetButton: {
    marginTop: 16,
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    cursor: 'pointer',
  },
  emptyResetButtonText: {
    color: '#0F766E',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyAddButton: {
    marginTop: 16,
    backgroundColor: '#0F766E',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: 'pointer',
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
    cursor: 'pointer',
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
  roleSelectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    cursor: 'pointer',
  },
  roleChipSelected: {
    backgroundColor: '#0F766E',
  },
  roleChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  roleChipTextSelected: {
    color: '#FFFFFF',
  },
  branchSelectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  branchSelectCard: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    width: '48%',
    minWidth: 220,
    flex: 1,
    cursor: 'pointer',
  },
  branchSelectCardSelected: {
    borderColor: '#0F766E',
    backgroundColor: '#F0FDFA',
  },
  branchCardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  branchSelectName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    flex: 1,
  },
  branchSelectNameSelected: {
    color: '#0F766E',
  },
  primaryCheckDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  primaryCheckDotText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  branchSelectCode: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  multiBranchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  multiBranchCheckChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    cursor: 'pointer',
    maxWidth: '48%',
    minWidth: 200,
  },
  multiBranchCheckChipSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  multiBranchCheckIcon: {
    fontSize: 13,
    color: '#2563EB',
  },
  multiBranchCheckText: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '500',
    flex: 1,
  },
  multiBranchCheckTextSelected: {
    color: '#1D4ED8',
    fontWeight: '600',
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
  inviteToggleBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    padding: 12,
    borderRadius: 8,
    gap: 10,
    cursor: 'pointer',
  },
  inviteToggleCheckbox: {
    fontSize: 16,
    color: '#0F766E',
  },
  inviteToggleTextWrapper: {
    flex: 1,
  },
  inviteToggleTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F766E',
  },
  inviteToggleSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
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
    flex: 1,
  },
  detailAvatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailAvatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  detailTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  detailSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  detailEmpIdText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  detailBodyScroll: {
    paddingHorizontal: 22,
    paddingVertical: 16,
  },
  detailGrid: {
    gap: 14,
  },
  detailSectionCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 14,
    gap: 8,
  },
  detailSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 6,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    minWidth: 140,
  },
  detailValue: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
    textAlign: 'right',
  },
  detailValueHighlight: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F766E',
    flex: 1,
    textAlign: 'right',
  },
  permissionTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  permissionTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 4,
  },
  permissionTagCheck: {
    fontSize: 10,
    color: '#16A34A',
    fontWeight: '800',
  },
  permissionTagText: {
    fontSize: 11.5,
    color: '#334155',
    fontWeight: '600',
  },
  modalStatusToggleBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    cursor: 'pointer',
  },
  modalStatusToggleBtnInactive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  modalStatusToggleBtnActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  modalStatusToggleBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  // Mobile Staff Member KPI Cards
  mobileStaffList: {
    padding: 12,
    gap: 12,
  },
  mobileStaffCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
      default: { elevation: 1 },
    }),
  },
  mobileStaffTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  mobileStaffBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  mobileStaffInfoBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  mobileStaffInfoLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  mobileStaffFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
});
