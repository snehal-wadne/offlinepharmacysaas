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
  ROLES_KPIS,
  MOCK_ROLES_LIST,
  MOCK_USERS_LIST,
} from '../../data/managementMockData';

export default function RolesScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('All'); // 'All' | 'System' | 'Custom'

  // Roles State
  const [roles, setRoles] = useState(MOCK_ROLES_LIST);

  // Add / Edit Role Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeRoleId, setActiveRoleId] = useState(null);

  // Form State for Add / Edit
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    isSystem: false,
    badgeColor: '#0F766E',
    clearanceLevel: 'Standard POS',
    cloneFromRoleId: 'role-pharmacist',
  });
  const [formErrors, setFormErrors] = useState({});

  // View Assigned Staff Modal State
  const [staffModalVisible, setStaffModalVisible] = useState(false);
  const [selectedRoleForStaff, setSelectedRoleForStaff] = useState(null);

  // Filtered Roles
  const filteredRoles = roles.filter((role) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      role.name.toLowerCase().includes(q) ||
      role.code.toLowerCase().includes(q) ||
      role.description.toLowerCase().includes(q);

    const matchesType =
      selectedTypeFilter === 'All' ||
      (selectedTypeFilter === 'System' && role.isSystem) ||
      (selectedTypeFilter === 'Custom' && !role.isSystem);

    return matchesSearch && matchesType;
  });

  const handleOpenAddModal = () => {
    setIsEditing(false);
    setActiveRoleId(null);
    setFormData({
      name: '',
      code: '',
      description: '',
      isSystem: false,
      badgeColor: '#0F766E',
      clearanceLevel: 'Clinical Dispensing',
      cloneFromRoleId: 'role-pharmacist',
    });
    setFormErrors({});
    setModalVisible(true);
  };

  const handleOpenEditModal = (role) => {
    setIsEditing(true);
    setActiveRoleId(role.id);
    setFormData({
      name: role.name,
      code: role.code,
      description: role.description,
      isSystem: role.isSystem,
      badgeColor: role.badgeColor || '#0F766E',
      clearanceLevel: role.clearanceLevel || 'Standard POS',
      cloneFromRoleId: '',
    });
    setFormErrors({});
    setModalVisible(true);
  };

  const handleSaveRole = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Role title is required';
    if (!formData.code.trim()) errors.code = 'Role code identifier is required';
    if (!formData.description.trim()) errors.description = 'Description is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    if (isEditing) {
      setRoles((prev) =>
        prev.map((r) =>
          r.id === activeRoleId
            ? {
                ...r,
                name: formData.name.trim(),
                code: formData.code.trim().toUpperCase(),
                description: formData.description.trim(),
                badgeColor: formData.badgeColor,
                clearanceLevel: formData.clearanceLevel,
              }
            : r
        )
      );
      if (onShowToast) {
        onShowToast(`✓ Role "${formData.name}" updated successfully.`);
      }
    } else {
      const newRole = {
        id: `role-custom-${Date.now()}`,
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        description: formData.description.trim(),
        userCount: 0,
        isSystem: false,
        badgeColor: formData.badgeColor,
        clearanceLevel: formData.clearanceLevel,
        assignedUsersList: [],
        permissions: {},
      };
      setRoles((prev) => [...prev, newRole]);
      if (onShowToast) {
        onShowToast(`✓ Custom role "${formData.name}" created successfully.`);
      }
    }

    setModalVisible(false);
  };

  const handleOpenStaffModal = (role) => {
    // Look up staff assigned to this role from MOCK_USERS_LIST or role.assignedUsersList
    const assignedStaff = MOCK_USERS_LIST.filter(
      (u) => u.roleId === role.id || u.role === role.name
    );
    setSelectedRoleForStaff({
      ...role,
      assignedStaffList: assignedStaff.length > 0 ? assignedStaff : (role.assignedUsersList || []),
    });
    setStaffModalVisible(true);
  };

  const handleConfigurePermissions = (roleId) => {
    if (onNavigate) {
      onNavigate('page-permissions');
    }
    if (onShowToast) {
      onShowToast(`Opening Permissions Matrix for role configuration...`);
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
      {/* 1. Header Row */}
      <View style={[styles.headerRow, isMobile && styles.headerRowMobile]}>
        <View>
          <Text style={styles.pageTitle}>User Roles & Access Levels</Text>
          <Text style={styles.pageSubtitle}>
            Define security clearance profiles, manage permissions, and assign staff roles across branches.
          </Text>
        </View>

        <View style={styles.headerActionsGroup}>
          <Pressable
            onPress={() => onNavigate && onNavigate('page-permissions')}
            style={styles.permissionsMatrixBtn}
            accessibilityRole="button"
            accessibilityLabel="Configure Permissions Matrix"
          >
            <Text style={styles.permissionsMatrixBtnText}>🛡️ Permissions Matrix →</Text>
          </Pressable>

          <Pressable
            onPress={handleOpenAddModal}
            style={styles.createRoleBtn}
            accessibilityRole="button"
            accessibilityLabel="Create New Role"
          >
            <Text style={styles.createRoleBtnText}>+ Create New Role</Text>
          </Pressable>
        </View>
      </View>

      {/* 2. Top Summary KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {ROLES_KPIS.map((kpi) => (
          <InventoryStatCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            subtext={kpi.subtext}
            variant={kpi.variant}
            isCompact={isCompact}
          />
        ))}
      </View>

      {/* 3. Search and Type Filter Bar */}
      <View style={styles.filtersBar}>
        {/* Search Box */}
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search roles by title, code or description..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <Pressable
              onPress={() => setSearchQuery('')}
              style={styles.clearSearchBtn}
            >
              <Text style={styles.clearSearchText}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Role Type Filter Tabs */}
        <View style={styles.typeFilterTabs}>
          {['All', 'System', 'Custom'].map((type) => {
            const isSelected = selectedTypeFilter === type;
            return (
              <Pressable
                key={type}
                onPress={() => setSelectedTypeFilter(type)}
                style={[
                  styles.filterTabPill,
                  isSelected && styles.filterTabPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterTabPillText,
                    isSelected && styles.filterTabPillTextActive,
                  ]}
                >
                  {type === 'All' ? 'All Roles' : `${type} Roles`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 4. Roles Grid Cards */}
      <View style={styles.rolesGrid}>
        {filteredRoles.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyIcon}>🛡️</Text>
            <Text style={styles.emptyTitle}>No roles match your search</Text>
            <Text style={styles.emptySubtitle}>
              Try adjusting your search terms or filter selection.
            </Text>
          </View>
        ) : (
          filteredRoles.map((role) => {
            const assignedCount = role.userCount || 0;
            return (
              <View key={role.id} style={styles.roleCard}>
                {/* Top Role Header */}
                <View style={styles.roleCardTop}>
                  <View style={styles.roleTitleGroup}>
                    <View
                      style={[
                        styles.roleColorDot,
                        { backgroundColor: role.badgeColor || '#0F766E' },
                      ]}
                    />
                    <Text style={styles.roleNameText}>{role.name}</Text>
                    <View style={styles.roleCodeBadge}>
                      <Text style={styles.roleCodeText}>{role.code}</Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.typeBadge,
                      role.isSystem
                        ? styles.typeBadgeSystem
                        : styles.typeBadgeCustom,
                    ]}
                  >
                    <Text
                      style={[
                        styles.typeBadgeText,
                        role.isSystem
                          ? styles.typeBadgeTextSystem
                          : styles.typeBadgeTextCustom,
                      ]}
                    >
                      {role.isSystem ? 'System Default' : 'Custom'}
                    </Text>
                  </View>
                </View>

                {/* Role Description */}
                <Text style={styles.roleDescriptionText} numberOfLines={2}>
                  {role.description}
                </Text>

                {/* Role Metadata Badges */}
                <View style={styles.roleMetaRow}>
                  {/* Clearance Level */}
                  <View style={styles.metaPill}>
                    <Text style={styles.metaLabel}>Clearance: </Text>
                    <Text style={styles.metaValue}>
                      {role.clearanceLevel || 'Standard'}
                    </Text>
                  </View>

                  {/* Assigned Staff Count */}
                  <Pressable
                    onPress={() => handleOpenStaffModal(role)}
                    style={styles.assignedStaffPill}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${assignedCount} assigned staff`}
                  >
                    <Text style={styles.assignedStaffIcon}>👥</Text>
                    <Text style={styles.assignedStaffText}>
                      {assignedCount} Staff Assigned
                    </Text>
                  </Pressable>
                </View>

                {/* Card Actions Footer */}
                <View style={styles.roleCardFooter}>
                  <Pressable
                    onPress={() => handleOpenStaffModal(role)}
                    style={styles.actionBtnOutline}
                  >
                    <Text style={styles.actionBtnOutlineText}>View Staff</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleOpenEditModal(role)}
                    style={styles.actionBtnOutline}
                  >
                    <Text style={styles.actionBtnOutlineText}>Edit</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleConfigurePermissions(role.id)}
                    style={styles.actionBtnPrimary}
                  >
                    <Text style={styles.actionBtnPrimaryText}>Permissions ⚙️</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* 5. Add / Edit Role Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setModalVisible(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {isEditing ? 'Edit User Role' : 'Create Custom Role'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {isEditing
                    ? `Update security profile settings for ${formData.name}`
                    : 'Define a new operational role and clone baseline permissions.'}
                </Text>
              </View>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={styles.closeModalBtn}
              >
                <Text style={styles.closeModalText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Role Title */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>
                  Role Title <Text style={styles.reqStar}>*</Text>
                </Text>
                <TextInput
                  style={[
                    styles.formInput,
                    formErrors.name && styles.formInputError,
                  ]}
                  placeholder="e.g. Clinical Senior Dispenser"
                  placeholderTextColor="#94A3B8"
                  value={formData.name}
                  onChangeText={(val) =>
                    setFormData((p) => ({ ...p, name: val }))
                  }
                />
                {formErrors.name ? (
                  <Text style={styles.formErrorText}>{formErrors.name}</Text>
                ) : null}
              </View>

              {/* Code Identifier & Clearance Level */}
              <View style={styles.formRow}>
                <View style={[styles.formGroup, styles.formCol]}>
                  <Text style={styles.formLabel}>
                    Code Identifier <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={[
                      styles.formInput,
                      formErrors.code && styles.formInputError,
                    ]}
                    placeholder="e.g. CLINICAL_LEAD"
                    placeholderTextColor="#94A3B8"
                    value={formData.code}
                    onChangeText={(val) =>
                      setFormData((p) => ({ ...p, code: val.toUpperCase() }))
                    }
                  />
                  {formErrors.code ? (
                    <Text style={styles.formErrorText}>{formErrors.code}</Text>
                  ) : null}
                </View>

                <View style={[styles.formGroup, styles.formCol]}>
                  <Text style={styles.formLabel}>Clearance Level</Text>
                  <View style={styles.clearanceSelector}>
                    {['Clinical Dispensing', 'Standard POS', 'Management', 'Audit'].map(
                      (lvl) => {
                        const isSel = formData.clearanceLevel === lvl;
                        return (
                          <Pressable
                            key={lvl}
                            onPress={() =>
                              setFormData((p) => ({ ...p, clearanceLevel: lvl }))
                            }
                            style={[
                              styles.clearanceChip,
                              isSel && styles.clearanceChipSelected,
                            ]}
                          >
                            <Text
                              style={[
                                styles.clearanceChipText,
                                isSel && styles.clearanceChipTextSelected,
                              ]}
                            >
                              {lvl}
                            </Text>
                          </Pressable>
                        );
                      }
                    )}
                  </View>
                </View>
              </View>

              {/* Role Accent Color */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Role Accent Color</Text>
                <View style={styles.colorPaletteRow}>
                  {[
                    '#0F766E',
                    '#2563EB',
                    '#7C3AED',
                    '#D97706',
                    '#0284C7',
                    '#DC2626',
                    '#475569',
                  ].map((color) => {
                    const isPicked = formData.badgeColor === color;
                    return (
                      <Pressable
                        key={color}
                        onPress={() =>
                          setFormData((p) => ({ ...p, badgeColor: color }))
                        }
                        style={[
                          styles.colorSwatch,
                          { backgroundColor: color },
                          isPicked && styles.colorSwatchPicked,
                        ]}
                      >
                        {isPicked && <Text style={styles.colorCheck}>✓</Text>}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Description */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>
                  Role Functional Scope & Description{' '}
                  <Text style={styles.reqStar}>*</Text>
                </Text>
                <TextInput
                  style={[
                    styles.formInput,
                    styles.formTextArea,
                    formErrors.description && styles.formInputError,
                  ]}
                  placeholder="Describe what staff with this role are responsible for..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={3}
                  value={formData.description}
                  onChangeText={(val) =>
                    setFormData((p) => ({ ...p, description: val }))
                  }
                />
                {formErrors.description ? (
                  <Text style={styles.formErrorText}>
                    {formErrors.description}
                  </Text>
                ) : null}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>

              <Pressable onPress={handleSaveRole} style={styles.saveRoleBtn}>
                <Text style={styles.saveRoleBtnText}>
                  {isEditing ? 'Save Changes' : 'Create Role'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 6. View Assigned Staff Modal */}
      <Modal
        visible={staffModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStaffModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setStaffModalVisible(false)}
        >
          <Pressable
            style={[styles.modalCard, styles.staffModalCard]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  Assigned Staff: {selectedRoleForStaff?.name}
                </Text>
                <Text style={styles.modalSubtitle}>
                  Active employees holding this clearance profile in Flora Institute.
                </Text>
              </View>
              <Pressable
                onPress={() => setStaffModalVisible(false)}
                style={styles.closeModalBtn}
              >
                <Text style={styles.closeModalText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              {selectedRoleForStaff?.assignedStaffList &&
              selectedRoleForStaff.assignedStaffList.length > 0 ? (
                selectedRoleForStaff.assignedStaffList.map((staff, idx) => (
                  <View key={staff.id || idx} style={styles.staffListItem}>
                    <View style={styles.staffAvatar}>
                      <Text style={styles.staffAvatarText}>
                        {staff.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)}
                      </Text>
                    </View>
                    <View style={styles.staffInfoCol}>
                      <Text style={styles.staffNameText}>{staff.name}</Text>
                      <Text style={styles.staffBranchText}>
                        🏛️ {staff.branch || staff.primaryBranch}
                      </Text>
                      <Text style={styles.staffEmailText}>{staff.email}</Text>
                    </View>
                    <View style={styles.staffActivePill}>
                      <Text style={styles.staffActiveText}>Active</Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.noStaffBox}>
                  <Text style={styles.noStaffIcon}>👥</Text>
                  <Text style={styles.noStaffText}>
                    No staff currently assigned to this role.
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                onPress={() => {
                  setStaffModalVisible(false);
                  if (onNavigate) onNavigate('users');
                }}
                style={styles.manageUsersRedirectBtn}
              >
                <Text style={styles.manageUsersRedirectText}>
                  Manage Users in Users Screen →
                </Text>
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
    gap: 16,
    flexWrap: 'wrap',
  },
  headerRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
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
  },
  headerActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  permissionsMatrixBtn: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    cursor: 'pointer',
  },
  permissionsMatrixBtnText: {
    color: '#0F766E',
    fontSize: 12.5,
    fontWeight: '700',
  },
  createRoleBtn: {
    backgroundColor: '#0F766E',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    cursor: 'pointer',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(15, 118, 110, 0.2)',
      },
    }),
  },
  createRoleBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
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
  /* Filters Bar */
  filtersBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 14,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    width: 320,
    height: 40,
  },
  searchIcon: {
    fontSize: 13,
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
    fontSize: 13,
    color: '#94A3B8',
  },
  typeFilterTabs: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    padding: 3,
    borderRadius: 8,
    gap: 4,
  },
  filterTabPill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    cursor: 'pointer',
  },
  filterTabPillActive: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
      },
    }),
  },
  filterTabPillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  filterTabPillTextActive: {
    color: '#0F766E',
    fontWeight: '700',
  },
  /* Roles Grid */
  rolesGrid: {
    gap: 16,
  },
  roleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      },
    }),
  },
  roleCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 10,
  },
  roleTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  roleColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  roleNameText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  roleCodeBadge: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  roleCodeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
  },
  typeBadge: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  typeBadgeSystem: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  typeBadgeCustom: {
    backgroundColor: '#FAF5FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  typeBadgeTextSystem: {
    color: '#2563EB',
  },
  typeBadgeTextCustom: {
    color: '#7C3AED',
  },
  roleDescriptionText: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 14,
  },
  roleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  metaLabel: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  assignedStaffPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    gap: 6,
    cursor: 'pointer',
  },
  assignedStaffIcon: {
    fontSize: 12,
  },
  assignedStaffText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#15803D',
  },
  roleCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 14,
    gap: 10,
    flexWrap: 'wrap',
  },
  actionBtnOutline: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    cursor: 'pointer',
  },
  actionBtnOutlineText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  actionBtnPrimary: {
    backgroundColor: '#0F766E',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    cursor: 'pointer',
  },
  actionBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  /* Empty State */
  emptyStateContainer: {
    backgroundColor: '#FFFFFF',
    padding: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 3,
  },
  /* Modals */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
      },
    }),
  },
  staffModalCard: {
    maxWidth: 620,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
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
  closeModalBtn: {
    padding: 4,
    cursor: 'pointer',
  },
  closeModalText: {
    fontSize: 16,
    color: '#64748B',
  },
  modalBody: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 16,
  },
  formRow: {
    flexDirection: 'row',
    gap: 14,
  },
  formCol: {
    flex: 1,
  },
  formLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  reqStar: {
    color: '#EF4444',
  },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0F172A',
    outlineStyle: 'none',
  },
  formInputError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  formErrorText: {
    fontSize: 11.5,
    color: '#EF4444',
    marginTop: 4,
  },
  formTextArea: {
    height: 70,
    textAlignVertical: 'top',
  },
  clearanceSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  clearanceChip: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    cursor: 'pointer',
  },
  clearanceChipSelected: {
    backgroundColor: '#0F766E',
  },
  clearanceChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  clearanceChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  colorPaletteRow: {
    flexDirection: 'row',
    gap: 10,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  colorSwatchPicked: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    ...Platform.select({
      web: {
        outline: '2px solid #0F766E',
      },
    }),
  },
  colorCheck: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    gap: 10,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
  },
  cancelBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  saveRoleBtn: {
    backgroundColor: '#0F766E',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 6,
    cursor: 'pointer',
  },
  saveRoleBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  /* Staff List in Modal */
  staffListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  staffAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
  },
  staffInfoCol: {
    flex: 1,
  },
  staffNameText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  staffBranchText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  staffEmailText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  staffActivePill: {
    backgroundColor: '#DCFCE7',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  staffActiveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  noStaffBox: {
    padding: 30,
    alignItems: 'center',
  },
  noStaffIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  noStaffText: {
    fontSize: 13,
    color: '#64748B',
  },
  manageUsersRedirectBtn: {
    backgroundColor: '#0F766E',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    cursor: 'pointer',
  },
  manageUsersRedirectText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
