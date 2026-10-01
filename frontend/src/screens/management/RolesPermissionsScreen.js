import React, { useState, useEffect, useCallback } from "react";
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
} from "react-native";
import { SkeletonTableRow } from "../../components/common/SkeletonLoader";
import {
  fetchRoles,
  fetchPermissions,
  updateRolePermissions,
} from "../../api/RoleApi";

export default function RolesPermissionsScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [roles, setRoles] = useState([]);
  const [permissionDomains, setPermissionDomains] = useState({});
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [collapsedModules, setCollapsedModules] = useState({});

  // Working copy of the active role's granted permission IDs (Set).
  const [assignedPermissionIds, setAssignedPermissionIds] = useState(new Set());
  const [originalPermissionIds, setOriginalPermissionIds] = useState(new Set());

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [rolesRes, permsRes] = await Promise.all([
        fetchRoles(),
        fetchPermissions(),
      ]);

      const rolesList = rolesRes?.success ? rolesRes.data.data : [];
      setRoles(rolesList);
      setPermissionDomains(permsRes?.success ? permsRes.data.data : {});

      if (rolesList.length > 0) {
        const initialRole = rolesList[0];
        setSelectedRoleId(initialRole.id);
        const ids = new Set((initialRole.permissions || []).map((p) => p.id));
        setAssignedPermissionIds(ids);
        setOriginalPermissionIds(ids);
      }
    } catch (err) {
      if (onShowToast) onShowToast("⚠️ Failed to load roles & permissions");
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeRole = roles && roles?.find((r) => r.id === selectedRoleId) || roles[0];

  const handleSelectRole = (role) => {
    setSelectedRoleId(role.id);
    const ids = new Set((role.permissions || []).map((p) => p.id));
    setAssignedPermissionIds(ids);
    setOriginalPermissionIds(ids);
    setRoleDropdownOpen(false);
  };

  const toggleModuleCollapse = (moduleId) => {
    setCollapsedModules((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }));
  };

  const handleTogglePermission = (permissionId) => {
    setAssignedPermissionIds((prev) => {
      const next = new Set(prev);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
  };

  const handleSetDomainPermissions = (domainName, domainPerms, isAllowed) => {
    setAssignedPermissionIds((prev) => {
      const next = new Set(prev);
      domainPerms.forEach((p) => {
        if (isAllowed) next.add(p.id);
        else next.delete(p.id);
      });
      return next;
    });
    if (onShowToast) {
      onShowToast(
        isAllowed
          ? `✓ Allowed all permissions in "${domainName}" for ${activeRole?.name}`
          : `Disallowed all permissions in "${domainName}" for ${activeRole?.name}`,
      );
    }
  };

  const isDirty = (() => {
    if (assignedPermissionIds.size !== originalPermissionIds.size) return true;
    for (const id of assignedPermissionIds) {
      if (!originalPermissionIds.has(id)) return true;
    }
    return false;
  })();

  const handleSaveChanges = async () => {
    if (!activeRole) return;
    try {
      setSaving(true);
      const res = await updateRolePermissions(
        activeRole.id,
        Array.from(assignedPermissionIds),
      );
      if (res?.success) {
        setOriginalPermissionIds(new Set(assignedPermissionIds));
        setRoles((prev) =>
          prev.map((r) =>
            r.id === activeRole.id
              ? { ...r, permissions: res.data, permission_count: res.data.length }
              : r,
          ),
        );
        if (onShowToast) {
          onShowToast(
            `✓ Permissions for role "${activeRole.name}" successfully saved!`,
          );
        }
      } else {
        throw new Error(res?.error || "Failed to save permissions");
      }
    } catch (err) {
      if (onShowToast) onShowToast(`⚠️ ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setAssignedPermissionIds(new Set(originalPermissionIds));
    if (onShowToast) {
      onShowToast(`Reverted unsaved changes for "${activeRole?.name}".`);
    }
  };

  // Filter domains/permissions by search query
  const filteredDomains = Object.entries(permissionDomains)
    .map(([domainName, perms]) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return [domainName, perms];
      const filtered = perms.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q) ||
          domainName.toLowerCase().includes(q),
      );
      return [domainName, filtered];
    })
    .filter(([, perms]) => perms.length > 0);

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
        <Text style={styles.pageTitle}>Role Permissions</Text>
        <Text style={styles.pageSubtitle}>
          Control which system capabilities each role is granted.
        </Text>
      </View>

      {/* 2. Top Controls: Role Selector & Search Box */}
      <View style={styles.controlsBar}>
        <View style={styles.roleSelectorSection}>
          <Text style={styles.roleSelectorLabel}>Select Role</Text>
          <Pressable
            onPress={() => roles.length > 0 && setRoleDropdownOpen(true)}
            style={styles.roleDropdownBtn}
            accessibilityRole="button"
            accessibilityLabel="Select Role"
          >
            <View style={styles.roleBadgeDot} />
            <Text style={styles.roleDropdownBtnText}>
              {activeRole ? activeRole.name : loading ? "Loading..." : "No roles yet"}
            </Text>
            <Text style={styles.roleDropdownChevron}>▾</Text>
          </Pressable>
        </View>

        <View style={styles.searchBoxWrapper}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search permissions or modules..."
            placeholderTextColor="#77717A"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <Pressable
              onPress={() => setSearchQuery("")}
              style={styles.clearSearchBtn}
            >
              <Text style={styles.clearSearchText}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* 3. Main Permission Table / Cards */}
      <View style={styles.tableCard}>
        <View style={styles.tableHeaderRow}>
          <View style={[styles.colPageInfo, styles.headerCol]}>
            <Text style={styles.thText}>PERMISSION</Text>
          </View>
          <View style={[styles.colDescription, styles.headerCol]}>
            <Text style={styles.thText}>DESCRIPTION</Text>
          </View>
          <View style={[styles.colStatus, styles.headerCol]}>
            <Text style={styles.thActionText}>STATUS</Text>
          </View>
          <View style={[styles.colToggle, styles.headerCol]}>
            <Text style={styles.thActionText}>GRANTED</Text>
          </View>
        </View>

        {loading ? (
          <View style={{ padding: 20 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonTableRow key={i} />
            ))}
          </View>
        ) : !activeRole ? (
          <View style={styles.emptySearchContainer}>
            <Text style={styles.emptyIcon}>🛡️</Text>
            <Text style={styles.emptyTitle}>No roles found</Text>
            <Text style={styles.emptySubtitle}>
              Create a role first from the Roles screen.
            </Text>
          </View>
        ) : filteredDomains.length === 0 ? (
          <View style={styles.emptySearchContainer}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyTitle}>No matching permissions found</Text>
            <Text style={styles.emptySubtitle}>
              Try clearing your search query &quot;{searchQuery}&quot;
            </Text>
          </View>
        ) : (
          filteredDomains.map(([domainName, perms]) => {
            const isCollapsed = !!collapsedModules[domainName];

            return (
              <View key={domainName} style={styles.moduleSection}>
                <Pressable
                  onPress={() => toggleModuleCollapse(domainName)}
                  style={styles.moduleHeaderRow}
                >
                  <View style={styles.moduleTitleGroup}>
                    <Text style={styles.moduleNameText}>{domainName}</Text>
                    <Text style={styles.modulePageCount}>
                      ({perms.length} {perms.length === 1 ? "permission" : "permissions"})
                    </Text>
                    <Text style={styles.moduleChevron}>
                      {isCollapsed ? "⌄" : "⌃"}
                    </Text>
                  </View>

                  <View style={styles.moduleActionButtons}>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        handleSetDomainPermissions(domainName, perms, true);
                      }}
                      style={styles.moduleAllowAllBtn}
                    >
                      <Text style={styles.moduleAllowAllText}>✓ Allow All</Text>
                    </Pressable>

                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        handleSetDomainPermissions(domainName, perms, false);
                      }}
                      style={styles.moduleDisallowAllBtn}
                    >
                      <Text style={styles.moduleDisallowAllText}>
                        ✕ Disallow All
                      </Text>
                    </Pressable>
                  </View>
                </Pressable>

                {!isCollapsed &&
                  perms.map((perm, idx) => {
                    const isAllowed = assignedPermissionIds.has(perm.id);
                    const isEven = idx % 2 === 1;

                    return (
                      <View
                        key={perm.id}
                        style={[styles.pageRow, isEven && styles.pageRowEven]}
                      >
                        <View style={styles.colPageInfo}>
                          <Text style={styles.pageNameText} numberOfLines={1}>
                            {perm.name}
                          </Text>
                        </View>

                        <View style={styles.colDescription}>
                          <Text style={styles.descriptionText} numberOfLines={2}>
                            {perm.description}
                          </Text>
                        </View>

                        <View style={styles.colStatus}>
                          <View
                            style={[
                              styles.statusBadge,
                              isAllowed
                                ? styles.statusBadgeAllowed
                                : styles.statusBadgeDenied,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                isAllowed
                                  ? styles.statusTextAllowed
                                  : styles.statusTextDenied,
                              ]}
                            >
                              {isAllowed ? "✓ Allowed" : "✕ Not Allowed"}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.colToggle}>
                          <Pressable
                            onPress={() => handleTogglePermission(perm.id)}
                            style={[
                              styles.toggleSwitchTrack,
                              isAllowed
                                ? styles.toggleTrackAllowed
                                : styles.toggleTrackDenied,
                            ]}
                            accessibilityRole="switch"
                            accessibilityState={{ checked: isAllowed }}
                            accessibilityLabel={`Toggle permission for ${perm.name}. Currently ${isAllowed ? "Allowed" : "Not Allowed"}`}
                          >
                            <View
                              style={[
                                styles.toggleThumb,
                                isAllowed
                                  ? styles.toggleThumbAllowed
                                  : styles.toggleThumbDenied,
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
          <View style={styles.legendContainer}>
            <Text style={styles.legendTitle}>ACCESS KEY:</Text>

            <View style={styles.legendItem}>
              <View style={styles.legendDotAllowed} />
              <Text style={styles.legendLabel}>
                <Text style={{ fontWeight: "700", color: "#B9829A" }}>
                  Allowed
                </Text>
                : Role is granted this capability
              </Text>
            </View>

            <View style={styles.legendItem}>
              <View style={styles.legendDotDenied} />
              <Text style={styles.legendLabel}>
                <Text style={{ fontWeight: "700", color: "#77717A" }}>
                  Not Allowed
                </Text>
                : Capability is restricted for this role
              </Text>
            </View>
          </View>

          <View style={styles.footerActionsGroup}>
            {isDirty && (
              <Pressable onPress={handleResetDefaults} style={styles.resetBtn}>
                <Text style={styles.resetBtnText}>Discard Changes</Text>
              </Pressable>
            )}

            <Pressable
              onPress={handleSaveChanges}
              style={[styles.saveBtn, (!isDirty || saving) && { opacity: 0.6 }]}
              disabled={!isDirty || saving}
            >
              <Text style={styles.saveBtnText}>
                {saving ? "Saving..." : "Save Changes"}
              </Text>
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
            <Text style={styles.roleDropdownHeaderTitle}>
              Select Role to Configure Permissions
            </Text>
            {roles.map((role) => {
              const isSelected = role.id === selectedRoleId;
              return (
                <Pressable
                  key={role.id}
                  onPress={() => handleSelectRole(role)}
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
                      {role.description || `${role.permission_count || 0} permissions granted`}
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
    backgroundColor: "#F8F5F7",
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
    fontWeight: "800",
    color: "#28242B",
    letterSpacing: -0.4,
  },
  pageSubtitle: {
    fontSize: 13,
    color: "#77717A",
    marginTop: 4,
  },
  controlsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
    flexWrap: "wrap",
    gap: 14,
  },
  roleSelectorSection: {
    gap: 6,
  },
  roleSelectorLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#77717A",
  },
  roleDropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minWidth: 220,
    cursor: "pointer",
    ...Platform.select({
      web: {
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      },
    }),
  },
  roleBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#B9829A",
    marginRight: 8,
  },
  roleDropdownBtnText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "700",
    color: "#28242B",
  },
  roleDropdownChevron: {
    fontSize: 12,
    color: "#77717A",
    marginLeft: 10,
  },
  searchBoxWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DFE4",
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
    color: "#28242B",
    outlineStyle: "none",
  },
  clearSearchBtn: {
    padding: 4,
    cursor: "pointer",
  },
  clearSearchText: {
    fontSize: 13,
    color: "#77717A",
  },
  tableCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
      },
    }),
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#F8F5F7",
    borderBottomWidth: 1,
    borderBottomColor: "#E5DFE4",
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  headerCol: {
    justifyContent: "center",
  },
  thText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#77717A",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  thActionText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#77717A",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign: "center",
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
    alignItems: "center",
    justifyContent: "center",
  },
  colToggle: {
    width: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  moduleSection: {
    borderBottomWidth: 1,
    borderBottomColor: "#F8F5F7",
  },
  moduleHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#E8D5DD",
    paddingVertical: 11,
    paddingHorizontal: 20,
    cursor: "pointer",
    borderBottomWidth: 1,
    borderBottomColor: "#E8D5DD",
  },
  moduleTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  moduleNameText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#B9829A",
    letterSpacing: 0.5,
  },
  modulePageCount: {
    fontSize: 11,
    fontWeight: "600",
    color: "#A66D86",
  },
  moduleChevron: {
    fontSize: 12,
    color: "#B9829A",
    fontWeight: "700",
  },
  moduleActionButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  moduleAllowAllBtn: {
    backgroundColor: "#EAF2EE",
    borderWidth: 1,
    borderColor: "#EAF2EE",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    cursor: "pointer",
  },
  moduleAllowAllText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4F8A72",
  },
  moduleDisallowAllBtn: {
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    cursor: "pointer",
  },
  moduleDisallowAllText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#77717A",
  },
  pageRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F8F5F7",
    backgroundColor: "#FFFFFF",
  },
  pageRowEven: {
    backgroundColor: "#F8F5F7",
  },
  pageNameText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#28242B",
  },
  descriptionText: {
    fontSize: 12.5,
    color: "#77717A",
    lineHeight: 18,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadgeAllowed: {
    backgroundColor: "#EAF2EE",
    borderWidth: 1,
    borderColor: "#EAF2EE",
  },
  statusBadgeDenied: {
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  statusTextAllowed: {
    color: "#4F8A72",
  },
  statusTextDenied: {
    color: "#77717A",
  },
  toggleSwitchTrack: {
    width: 48,
    height: 26,
    borderRadius: 14,
    padding: 2,
    justifyContent: "center",
    cursor: "pointer",
    ...Platform.select({
      web: {
        transition: "background-color 0.2s ease-in-out",
      },
    }),
  },
  toggleTrackAllowed: {
    backgroundColor: "#B9829A",
  },
  toggleTrackDenied: {
    backgroundColor: "#E5DFE4",
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      web: {
        transition: "transform 0.2s ease-in-out",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      },
    }),
  },
  toggleThumbAllowed: {
    transform: [{ translateX: 22 }],
  },
  toggleThumbDenied: {
    transform: [{ translateX: 0 }],
  },
  tableFooterBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: "#F8F5F7",
    borderTopWidth: 1,
    borderTopColor: "#E5DFE4",
    flexWrap: "wrap",
    gap: 16,
  },
  legendContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  legendTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#28242B",
    letterSpacing: 0.5,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDotAllowed: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#4F8A72",
  },
  legendDotDenied: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#77717A",
  },
  legendLabel: {
    fontSize: 12,
    color: "#77717A",
  },
  footerActionsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  resetBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    cursor: "pointer",
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#77717A",
  },
  saveBtn: {
    backgroundColor: "#B9829A",
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 8,
    cursor: "pointer",
    ...Platform.select({
      web: {
        boxShadow: "0 2px 4px rgba(15,118,110,0.2)",
      },
    }),
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  emptySearchContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#28242B",
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#77717A",
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  roleDropdownModalCard: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 20,
    shadowColor: "#28242B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  roleDropdownHeaderTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#28242B",
    marginBottom: 14,
  },
  roleDropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#F8F5F7",
    backgroundColor: "#FFFFFF",
    cursor: "pointer",
  },
  roleDropdownOptionSelected: {
    borderColor: "#E8D5DD",
    backgroundColor: "#E8D5DD",
  },
  roleOptionTextWrapper: {
    flex: 1,
    paddingRight: 10,
  },
  roleOptionName: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#28242B",
  },
  roleOptionNameSelected: {
    color: "#B9829A",
  },
  roleOptionDesc: {
    fontSize: 11.5,
    color: "#77717A",
    marginTop: 2,
  },
  roleCheckmark: {
    fontSize: 15,
    fontWeight: "800",
    color: "#B9829A",
  },
});
