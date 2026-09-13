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
import {
  MOCK_ROLES_LIST,
  PAGE_PERMISSION_MODULES,
  DEFAULT_ROLE_PAGE_PERMISSIONS,
} from '../../data/managementMockData';
import { SkeletonTableRow } from '../../components/common/SkeletonLoader';

export default function RolesPermissionsScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Selected Role (Default: Cashier as standard initial selection)
  const [selectedRoleId, setSelectedRoleId] = useState('role-cashier');
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  // Search filter for pages/modules
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // Collapsed Module Groups state
  const [collapsedModules, setCollapsedModules] = useState({});

  // Matrix State for all roles: roleId -> { [pageId]: boolean }
  const [matrixState, setMatrixState] = useState(DEFAULT_ROLE_PAGE_PERMISSIONS);

  // Roles list
  const [roles, setRoles] = useState(MOCK_ROLES_LIST);

  // Active Role Lookup
  const activeRole = roles.find((r) => r.id === selectedRoleId) || roles[0];
  const activeRolePermissions = matrixState[selectedRoleId] || {};

  // Toggle Module Accordion Collapse
  const toggleModuleCollapse = (moduleId) => {
    setCollapsedModules((prev) => ({
      ...prev,
      [moduleId]: !prev[moduleId],
    }));
  };

  // Single Toggle: Allowed (true) <-> Not Allowed (false)
  const handleTogglePagePermission = (pageId) => {
    const currentVal = !!activeRolePermissions[pageId];
    const newVal = !currentVal;

    setMatrixState((prev) => ({
      ...prev,
      [selectedRoleId]: {
        ...prev[selectedRoleId],
        [pageId]: newVal,
      },
    }));
  };

  // Bulk Set Permissions for an entire Module (all true or all false)
  const handleSetModulePermissions = (moduleObj, isAllowed) => {
    const updated = { ...(matrixState[selectedRoleId] || {}) };
    moduleObj.pages.forEach((page) => {
      updated[page.pageId] = isAllowed;
    });

    setMatrixState((prev) => ({
      ...prev,
      [selectedRoleId]: updated,
    }));

    if (onShowToast) {
      onShowToast(
        isAllowed
          ? `✓ Allowed all pages in "${moduleObj.moduleName}" for ${activeRole.name}`
          : `Disallowed all pages in "${moduleObj.moduleName}" for ${activeRole.name}`
      );
    }
  };

  // Save changes
  const handleSaveChanges = () => {
    if (onShowToast) {
      onShowToast(`✓ Page permissions for role "${activeRole.name}" successfully saved and active!`);
      // TODO: Persist to backend when API endpoint is available
    }
  };

  // Reset to role template default
  const handleResetDefaults = () => {
    const initialPerms = DEFAULT_ROLE_PAGE_PERMISSIONS[selectedRoleId];
    if (initialPerms) {
      setMatrixState((prev) => ({
        ...prev,
        [selectedRoleId]: { ...initialPerms },
      }));
      if (onShowToast) {
        onShowToast(`Reset "${activeRole.name}" permissions to system template defaults.`);
      }
    }
  };

  // Filter modules and pages by search query
  const filteredModules = PAGE_PERMISSION_MODULES.map((module) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return module;

    const filteredPages = module.pages.filter(
      (p) =>
        p.pageName.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        module.moduleName.toLowerCase().includes(q)
    );

    return {
      ...module,
      pages: filteredPages,
    };
  }).filter((m) => m.pages.length > 0);

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
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>Page Permissions</Text>
        <Text style={styles.pageSubtitle}>
          Control which pages each role is allowed or not allowed to access.
        </Text>
      </View>

      {/* 2. Top Controls: Role Selector & Search Box */}
      <View style={styles.controlsBar}>
        {/* Role Selector */}
        <View style={styles.roleSelectorSection}>
          <Text style={styles.roleSelectorLabel}>Select Role</Text>
          <Pressable
            onPress={() => setRoleDropdownOpen(true)}
            style={styles.roleDropdownBtn}
            accessibilityRole="button"
            accessibilityLabel="Select Role"
          >
            <View style={styles.roleBadgeDot} />
            <Text style={styles.roleDropdownBtnText}>{activeRole.name}</Text>
            <Text style={styles.roleDropdownChevron}>▾</Text>
          </Pressable>
        </View>

        {/* Search Input Box */}
        <View style={styles.searchBoxWrapper}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search modules or pages..."
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
      </View>

      {/* 3. Main Permission Table / Cards */}
      <View style={styles.tableCard}>
        {/* Table Column Headers */}
        <View style={styles.tableHeaderRow}>
          <View style={[styles.colPageInfo, styles.headerCol]}>
            <Text style={styles.thText}>PAGE / RESOURCE</Text>
          </View>
          <View style={[styles.colDescription, styles.headerCol]}>
            <Text style={styles.thText}>DESCRIPTION</Text>
          </View>
          <View style={[styles.colStatus, styles.headerCol]}>
            <Text style={styles.thActionText}>STATUS</Text>
          </View>
          <View style={[styles.colToggle, styles.headerCol]}>
            <Text style={styles.thActionText}>ALLOW ACCESS</Text>
          </View>
        </View>

        {/* Modules & Rows */}
        {loading ? (
          <View style={{ padding: 20 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonTableRow key={i} />
            ))}
          </View>
        ) : filteredModules.length === 0 ? (
          <View style={styles.emptySearchContainer}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyTitle}>No matching pages found</Text>
            <Text style={styles.emptySubtitle}>
              Try clearing your search query &quot;{searchQuery}&quot;
            </Text>
          </View>
        ) : (
          filteredModules.map((module) => {
            const isCollapsed = !!collapsedModules[module.moduleId];

            return (
              <View key={module.moduleId} style={styles.moduleSection}>
                {/* Module Accordion Header */}
                <Pressable
                  onPress={() => toggleModuleCollapse(module.moduleId)}
                  style={styles.moduleHeaderRow}
                >
                  <View style={styles.moduleTitleGroup}>
                    <Text style={styles.moduleIcon}>{module.icon}</Text>
                    <Text style={styles.moduleNameText}>
                      {module.moduleName}
                    </Text>
                    <Text style={styles.modulePageCount}>
                      ({module.pages.length} {module.pages.length === 1 ? 'page' : 'pages'})
                    </Text>
                    <Text style={styles.moduleChevron}>
                      {isCollapsed ? '⌄' : '⌃'}
                    </Text>
                  </View>

                  {/* Bulk Quick Action Buttons */}
                  <View style={styles.moduleActionButtons}>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        handleSetModulePermissions(module, true);
                      }}
                      style={styles.moduleAllowAllBtn}
                    >
                      <Text style={styles.moduleAllowAllText}>✓ Allow All</Text>
                    </Pressable>

                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        handleSetModulePermissions(module, false);
                      }}
                      style={styles.moduleDisallowAllBtn}
                    >
                      <Text style={styles.moduleDisallowAllText}>✕ Disallow All</Text>
                    </Pressable>
                  </View>
                </Pressable>

                {/* Module Pages Rows */}
                {!isCollapsed &&
                  module.pages.map((page, idx) => {
                    const isAllowed = !!activeRolePermissions[page.pageId];
                    const isEven = idx % 2 === 1;

                    return (
                      <View
                        key={page.pageId}
                        style={[
                          styles.pageRow,
                          isEven && styles.pageRowEven,
                        ]}
                      >
                        {/* Page Name */}
                        <View style={styles.colPageInfo}>
                          <Text style={styles.pageNameText} numberOfLines={1}>
                            {page.pageName}
                          </Text>
                        </View>

                        {/* Description */}
                        <View style={styles.colDescription}>
                          <Text style={styles.descriptionText} numberOfLines={2}>
                            {page.description}
                          </Text>
                        </View>

                        {/* Status Badge */}
                        <View style={styles.colStatus}>
                          <View
                            style={[
                              styles.statusBadge,
                              isAllowed ? styles.statusBadgeAllowed : styles.statusBadgeDenied,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                isAllowed ? styles.statusTextAllowed : styles.statusTextDenied,
                              ]}
                            >
                              {isAllowed ? '✓ Allowed' : '✕ Not Allowed'}
                            </Text>
                          </View>
                        </View>

                        {/* Single Interactive Toggle Button */}
                        <View style={styles.colToggle}>
                          <Pressable
                            onPress={() => handleTogglePagePermission(page.pageId)}
                            style={[
                              styles.toggleSwitchTrack,
                              isAllowed ? styles.toggleTrackAllowed : styles.toggleTrackDenied,
                            ]}
                            accessibilityRole="switch"
                            accessibilityState={{ checked: isAllowed }}
                            accessibilityLabel={`Toggle permission for ${page.pageName}. Currently ${isAllowed ? 'Allowed' : 'Not Allowed'}`}
                          >
                            <View
                              style={[
                                styles.toggleThumb,
                                isAllowed ? styles.toggleThumbAllowed : styles.toggleThumbDenied,
                              ]}
                            />
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
              </View>
            );
          })
        )}

        {/* 4. Bottom Legend & Save Changes Bar */}
        <View style={styles.tableFooterBar}>
          {/* Legend Area */}
          <View style={styles.legendContainer}>
            <Text style={styles.legendTitle}>ACCESS KEY:</Text>

            {/* Allowed */}
            <View style={styles.legendItem}>
              <View style={styles.legendDotAllowed} />
              <Text style={styles.legendLabel}>
                <Text style={{ fontWeight: '700', color: '#0F766E' }}>Allowed</Text>: User role has access to view & use this page
              </Text>
            </View>

            {/* Not Allowed */}
            <View style={styles.legendItem}>
              <View style={styles.legendDotDenied} />
              <Text style={styles.legendLabel}>
                <Text style={{ fontWeight: '700', color: '#64748B' }}>Not Allowed</Text>: Page is restricted and hidden for this role
              </Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.footerActionsGroup}>
            <Pressable
              onPress={handleResetDefaults}
              style={styles.resetBtn}
            >
              <Text style={styles.resetBtnText}>Reset Role Defaults</Text>
            </Pressable>

            <Pressable
              onPress={handleSaveChanges}
              style={styles.saveBtn}
            >
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* 5. Role Selection Dropdown Modal */}
      <Modal
        visible={roleDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRoleDropdownOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setRoleDropdownOpen(false)}
        >
          <View style={styles.roleDropdownModalCard}>
            <Text style={styles.roleDropdownHeaderTitle}>Select Role to Configure Permissions</Text>
            {roles.map((role) => {
              const isSelected = role.id === selectedRoleId;
              return (
                <Pressable
                  key={role.id}
                  onPress={() => {
                    setSelectedRoleId(role.id);
                    setRoleDropdownOpen(false);
                  }}
                  style={[
                    styles.roleDropdownOption,
                    isSelected && styles.roleDropdownOptionSelected,
                  ]}
                >
                  <View style={styles.roleOptionTextWrapper}>
                    <Text
                      style={[
                        styles.roleOptionName,
                        isSelected && styles.roleOptionNameSelected,
                      ]}
                    >
                      {role.name}
                    </Text>
                    <Text style={styles.roleOptionDesc} numberOfLines={1}>
                      {role.description}
                    </Text>
                  </View>
                  {isSelected && <Text style={styles.roleCheckmark}>✓</Text>}
                </Pressable>
              );
            })}
          </View>
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
    marginBottom: 16,
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
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    flexWrap: 'wrap',
    gap: 14,
  },
  roleSelectorSection: {
    gap: 6,
  },
  roleSelectorLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  roleDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minWidth: 220,
    cursor: 'pointer',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      },
    }),
  },
  roleBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0F766E',
    marginRight: 8,
  },
  roleDropdownBtnText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  roleDropdownChevron: {
    fontSize: 12,
    color: '#64748B',
    marginLeft: 10,
  },
  searchBoxWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    width: 300,
    height: 42,
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
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
      },
    }),
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  headerCol: {
    justifyContent: 'center',
  },
  thText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  thActionText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  colPageInfo: {
    flex: 1.5,
    paddingRight: 12,
  },
  colDescription: {
    flex: 2.2,
    paddingRight: 12,
  },
  colStatus: {
    width: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colToggle: {
    width: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleSection: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  moduleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDFA',
    paddingVertical: 11,
    paddingHorizontal: 20,
    cursor: 'pointer',
    borderBottomWidth: 1,
    borderBottomColor: '#CCFBF1',
  },
  moduleTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moduleIcon: {
    fontSize: 15,
  },
  moduleNameText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F766E',
    letterSpacing: 0.5,
  },
  modulePageCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#14B8A6',
  },
  moduleChevron: {
    fontSize: 12,
    color: '#0F766E',
    fontWeight: '700',
  },
  moduleActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moduleAllowAllBtn: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    cursor: 'pointer',
  },
  moduleAllowAllText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  moduleDisallowAllBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    cursor: 'pointer',
  },
  moduleDisallowAllText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  pageRowEven: {
    backgroundColor: '#FAFCFF',
  },
  pageNameText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  descriptionText: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 18,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeAllowed: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  statusBadgeDenied: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  statusTextAllowed: {
    color: '#059669',
  },
  statusTextDenied: {
    color: '#64748B',
  },
  /* Toggle Switch Styles */
  toggleSwitchTrack: {
    width: 48,
    height: 26,
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
    cursor: 'pointer',
    ...Platform.select({
      web: {
        transition: 'background-color 0.2s ease-in-out',
      },
    }),
  },
  toggleTrackAllowed: {
    backgroundColor: '#0F766E',
  },
  toggleTrackDenied: {
    backgroundColor: '#CBD5E1',
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      web: {
        transition: 'transform 0.2s ease-in-out',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      },
    }),
  },
  toggleThumbAllowed: {
    transform: [{ translateX: 22 }],
  },
  toggleThumbDenied: {
    transform: [{ translateX: 0 }],
  },
  /* Footer & Legend */
  tableFooterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#FAFCFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexWrap: 'wrap',
    gap: 16,
  },
  legendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  legendTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.5,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDotAllowed: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  legendDotDenied: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#94A3B8',
  },
  legendLabel: {
    fontSize: 12,
    color: '#475569',
  },
  footerActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resetBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    cursor: 'pointer',
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  saveBtn: {
    backgroundColor: '#0F766E',
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 8,
    cursor: 'pointer',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(15,118,110,0.2)',
      },
    }),
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  /* Empty State */
  emptySearchContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
  /* Modal Overlay */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  roleDropdownModalCard: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  roleDropdownHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
  },
  roleDropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
  },
  roleDropdownOptionSelected: {
    borderColor: '#99F6E4',
    backgroundColor: '#F0FDFA',
  },
  roleOptionTextWrapper: {
    flex: 1,
    paddingRight: 10,
  },
  roleOptionName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  roleOptionNameSelected: {
    color: '#0F766E',
  },
  roleOptionDesc: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  roleCheckmark: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F766E',
  },
});
