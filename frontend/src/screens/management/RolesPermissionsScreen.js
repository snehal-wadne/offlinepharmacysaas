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
  PERMISSION_ACTION_COLUMNS,
  DEFAULT_ROLE_PAGE_PERMISSIONS,
} from '../../data/managementMockData';

// 4-state cycle: 'none' -> 'full' -> 'limited' -> 'blocked' -> 'none'
const NEXT_PERMISSION_STATE = {
  none: 'full',
  full: 'limited',
  limited: 'blocked',
  blocked: 'none',
};

export default function RolesPermissionsScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Selected Role (Default: Cashier as shown in the UI reference)
  const [selectedRoleId, setSelectedRoleId] = useState('role-cashier');
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  // Search filter for pages/modules
  const [searchQuery, setSearchQuery] = useState('');

  // Collapsed Module Groups state
  const [collapsedModules, setCollapsedModules] = useState({});

  // Matrix State for all roles
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

  // Cycle permission state for a specific page and action column
  const handleCellClick = (pageId, actionKey) => {
    const currentPagePerms = activeRolePermissions[pageId] || {};
    const currentState = currentPagePerms[actionKey] || 'none';
    const nextState = NEXT_PERMISSION_STATE[currentState] || 'full';

    setMatrixState((prev) => ({
      ...prev,
      [selectedRoleId]: {
        ...prev[selectedRoleId],
        [pageId]: {
          ...currentPagePerms,
          [actionKey]: nextState,
        },
      },
    }));
  };

  // Grant Full Permissions for an entire Module
  const handleGrantFullModule = (moduleObj) => {
    const updated = { ...(matrixState[selectedRoleId] || {}) };
    moduleObj.pages.forEach((page) => {
      const fullRow = {};
      PERMISSION_ACTION_COLUMNS.forEach((col) => {
        fullRow[col.key] = 'full';
      });
      updated[page.pageId] = fullRow;
    });
    setMatrixState((prev) => ({
      ...prev,
      [selectedRoleId]: updated,
    }));
    if (onShowToast) {
      onShowToast(`Granted full access to "${moduleObj.moduleName}" for ${activeRole.name}`);
    }
  };

  // Save changes
  const handleSaveChanges = () => {
    if (onShowToast) {
      onShowToast(`✓ Page permissions for role "${activeRole.name}" successfully saved and active!`);
    }
  };

  // Reset to role template default
  const handleResetDefaults = () => {
    const initialPerms = DEFAULT_ROLE_PAGE_PERMISSIONS[selectedRoleId];
    if (initialPerms) {
      setMatrixState((prev) => ({
        ...prev,
        [selectedRoleId]: JSON.parse(JSON.stringify(initialPerms)),
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

  // Render Checkbox Box Icon based on state
  const renderPermissionCheckbox = (state) => {
    switch (state) {
      case 'full':
        return (
          <View style={styles.boxFull}>
            <Text style={styles.checkIconText}>✓</Text>
          </View>
        );
      case 'limited':
        return (
          <View style={styles.boxLimited}>
            <Text style={styles.dashIconText}>-</Text>
          </View>
        );
      case 'blocked':
        return (
          <View style={styles.boxBlocked}>
            <Text style={styles.blockedIconText}>🚫</Text>
          </View>
        );
      case 'none':
      default:
        return (
          <View style={styles.boxNone}>
            <Text style={styles.noneDashText}>—</Text>
          </View>
        );
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
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>Page Permissions</Text>
        <Text style={styles.pageSubtitle}>
          Control what each role can access and the actions they can perform in the system.
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
            <Text style={styles.roleDropdownBtnText}>{activeRole.name}</Text>
            <Text style={styles.roleDropdownChevron}>▾</Text>
          </Pressable>
        </View>

        {/* Search Input Box */}
        <View style={styles.searchBoxWrapper}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search pages..."
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

      {/* 3. Main Permission Table */}
      <View style={styles.tableCard}>
        <ScrollView horizontal={true} showsHorizontalScrollIndicator={true}>
          <View style={styles.tableWrapper}>
            {/* Table Column Headers */}
            <View style={styles.tableHeaderRow}>
              <View style={[styles.colModule, styles.headerCol]}>
                <Text style={styles.thText}>MODULE / PAGE</Text>
              </View>
              <View style={[styles.colDescription, styles.headerCol]}>
                <Text style={styles.thText}>DESCRIPTION</Text>
              </View>
              {PERMISSION_ACTION_COLUMNS.map((col) => (
                <View key={col.key} style={[styles.colAction, styles.headerCol]}>
                  <Text style={styles.thActionText}>{col.label}</Text>
                </View>
              ))}
            </View>

            {/* Modules & Rows */}
            {filteredModules.length === 0 ? (
              <View style={styles.emptySearchContainer}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyTitle}>No matching pages found</Text>
                <Text style={styles.emptySubtitle}>
                  Try clearing your search query "{searchQuery}"
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
                        <Text style={styles.moduleChevron}>
                          {isCollapsed ? '⌄' : '⌃'}
                        </Text>
                      </View>

                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          handleGrantFullModule(module);
                        }}
                        style={styles.grantModuleBtn}
                      >
                        <Text style={styles.grantModuleBtnText}>
                          Allow All in {module.moduleName}
                        </Text>
                      </Pressable>
                    </Pressable>

                    {/* Module Pages Rows */}
                    {!isCollapsed &&
                      module.pages.map((page, idx) => {
                        const pagePerms = activeRolePermissions[page.pageId] || {};
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
                            <View style={styles.colModule}>
                              <Text style={styles.pageNameText} numberOfLines={1}>
                                {page.pageName}
                              </Text>
                            </View>

                            {/* Description */}
                            <View style={styles.colDescription}>
                              <Text style={styles.descriptionText} numberOfLines={1}>
                                {page.description}
                              </Text>
                            </View>

                            {/* 7 Action Checkboxes */}
                            {PERMISSION_ACTION_COLUMNS.map((col) => {
                              const cellState = pagePerms[col.key] || 'none';
                              return (
                                <Pressable
                                  key={col.key}
                                  onPress={() => handleCellClick(page.pageId, col.key)}
                                  style={[styles.colAction, styles.actionCell]}
                                  accessibilityRole="button"
                                  accessibilityLabel={`${page.pageName} ${col.label}: currently ${cellState}. Tap to toggle.`}
                                >
                                  {renderPermissionCheckbox(cellState)}
                                </Pressable>
                              );
                            })}
                          </View>
                        );
                      })}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>

        {/* 4. Bottom Legend & Save Changes Bar */}
        <View style={styles.tableFooterBar}>
          {/* Legend Area */}
          <View style={styles.legendContainer}>
            <Text style={styles.legendTitle}>LEGEND:</Text>

            {/* Full */}
            <View style={styles.legendItem}>
              <View style={styles.boxFullMini}>
                <Text style={styles.checkIconMini}>✓</Text>
              </View>
              <Text style={styles.legendLabel}>Full Permission</Text>
            </View>

            {/* Limited */}
            <View style={styles.legendItem}>
              <View style={styles.boxLimitedMini}>
                <Text style={styles.dashIconMini}>-</Text>
              </View>
              <Text style={styles.legendLabel}>Limited/Conditional Permission</Text>
            </View>

            {/* Blocked */}
            <View style={styles.legendItem}>
              <View style={styles.boxBlockedMini}>
                <Text style={styles.blockedIconMini}>🚫</Text>
              </View>
              <Text style={styles.legendLabel}>Blocked / Restricted Action</Text>
            </View>

            {/* No action */}
            <View style={styles.legendItem}>
              <Text style={styles.noneDashTextMini}>—</Text>
              <Text style={styles.legendLabel}>No Action Configured</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.footerActionsGroup}>
            <Pressable
              onPress={handleResetDefaults}
              style={styles.resetBtn}
            >
              <Text style={styles.resetBtnText}>Reset Role</Text>
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
            <Text style={styles.roleDropdownHeaderTitle}>Select Role to Configure</Text>
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
    minWidth: 200,
    cursor: 'pointer',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      },
    }),
  },
  roleDropdownBtnText: {
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
    width: 280,
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
  tableWrapper: {
    minWidth: 1040,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 12,
    paddingHorizontal: 16,
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
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  colModule: {
    width: 200,
    paddingRight: 10,
  },
  colDescription: {
    width: 250,
    paddingRight: 10,
  },
  colAction: {
    width: 84,
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
    backgroundColor: '#E6F4EA',
    paddingVertical: 10,
    paddingHorizontal: 16,
    cursor: 'pointer',
  },
  moduleTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moduleIcon: {
    fontSize: 14,
  },
  moduleNameText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F766E',
    letterSpacing: 0.5,
  },
  moduleChevron: {
    fontSize: 12,
    color: '#0F766E',
    fontWeight: '700',
  },
  grantModuleBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    cursor: 'pointer',
  },
  grantModuleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
  },
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
    backgroundColor: '#FFFFFF',
  },
  pageRowEven: {
    backgroundColor: '#FAFCFF',
  },
  pageNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  descriptionText: {
    fontSize: 12,
    color: '#64748B',
  },
  actionCell: {
    paddingVertical: 2,
    cursor: 'pointer',
  },
  /* Checkbox State Badges */
  boxFull: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIconText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '900',
  },
  boxLimited: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashIconText: {
    color: '#D97706',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 14,
  },
  boxBlocked: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockedIconText: {
    fontSize: 11,
  },
  boxNone: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noneDashText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  /* Footer & Legend */
  tableFooterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
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
  boxFullMini: {
    width: 16,
    height: 16,
    borderRadius: 3,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIconMini: {
    color: '#059669',
    fontSize: 9,
    fontWeight: '900',
  },
  boxLimitedMini: {
    width: 16,
    height: 16,
    borderRadius: 3,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashIconMini: {
    color: '#D97706',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 11,
  },
  boxBlockedMini: {
    width: 16,
    height: 16,
    borderRadius: 3,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockedIconMini: {
    fontSize: 8,
  },
  noneDashTextMini: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  legendLabel: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '500',
  },
  footerActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resetBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
  },
  resetBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  saveBtn: {
    backgroundColor: '#0F766E',
    paddingVertical: 9,
    paddingHorizontal: 22,
    borderRadius: 6,
    cursor: 'pointer',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(15, 118, 110, 0.25)',
      },
    }),
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  /* Role Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  roleDropdownModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      web: {
        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
      },
    }),
  },
  roleDropdownHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  roleDropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    cursor: 'pointer',
  },
  roleDropdownOptionSelected: {
    backgroundColor: '#F0FDFA',
  },
  roleOptionTextWrapper: {
    flex: 1,
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
    marginTop: 1,
  },
  roleCheckmark: {
    fontSize: 14,
    color: '#0F766E',
    fontWeight: '900',
    marginLeft: 8,
  },
  emptySearchContainer: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
});
