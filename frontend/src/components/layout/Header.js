import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Platform,
} from "react-native";
import { API_URL } from "../../config";
import { MOCK_BRANCHES_LIST } from "../../data/managementMockData";

const DEFAULT_BRANCH_OPTIONS = [
  "All Branches",
  ...MOCK_BRANCHES_LIST.filter(
    (b) => b.status === "Active" || b.status === "ACTIVE"
  ).map((b) => b.name),
];

export default function Header({
  currentBranch = "All Branches",
  onBranchChange,
  isMultiBranch = true,
  onTogglePharmacyMode,
  onSetPharmacyMode,
  currentUser,
  onSignOut,
  syncStatus = "online",
  isMobile = false,
  onToggleMobileMenu,
  onNavigate,
  branchRefreshKey = 0,
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [branchOptions, setBranchOptions] = useState(DEFAULT_BRANCH_OPTIONS);

  const fetchBranchesFromDb = async () => {
    try {
      const response = await fetch(`${API_URL}/branches`);
      if (response.ok) {
        const json = await response.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          const activeBranches = json.data.filter(
            (b) => b.status === "ACTIVE" || b.status === "Active" || !b.status
          );
          const dbNames = activeBranches.map((b) => b.name);
          const combined = ["All Branches", ...dbNames.filter((n) => n !== "All Branches")];
          setBranchOptions(combined);
          return;
        }
      }
    } catch (err) {
      console.warn("Could not fetch database branches in Header:", err.message);
    }

    // Fallback: filter MOCK_BRANCHES_LIST for active branches
    const activeMock = MOCK_BRANCHES_LIST.filter(
      (b) => b.status === "Active" || b.status === "ACTIVE"
    ).map((b) => b.name);
    setBranchOptions(["All Branches", ...activeMock]);
  };

  // Dynamic connection monitoring and branch fetching from backend
  useEffect(() => {
    let active = true;

    const checkConnection = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(`${API_URL}/health`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (response.ok && active) {
          setIsOnline(true);
        } else if (active) {
          setIsOnline(false);
        }
      } catch (err) {
        if (active) setIsOnline(false);
      }
    };

    checkConnection();
    fetchBranchesFromDb();
    const interval = setInterval(checkConnection, 10000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [branchRefreshKey]);

  const displayName = currentUser?.display_name || "User";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleSelectBranch = (branch) => {
    if (onBranchChange) {
      onBranchChange(branch);
    }
    setDropdownOpen(false);
  };

  return (
    <View
      style={[styles.headerContainer, isMobile && styles.headerContainerMobile]}
    >
      {/* Left: Mobile Hamburger Button & Branch Info */}
      <View style={styles.leftSection}>
        {isMobile && (
          <Pressable
            onPress={onToggleMobileMenu}
            style={styles.hamburgerButton}
            accessibilityRole="button"
            accessibilityLabel="Open Navigation Menu"
          >
            <Text style={styles.hamburgerIcon}>☰</Text>
          </Pressable>
        )}

        {/* Branch / Store Mode Selector: Single Shop vs Multi-Branch */}
        {!isMobile && (
          <View style={styles.modeSegmentContainer}>
            <Pressable
              onPress={() => {
                if (isMultiBranch) {
                  if (onSetPharmacyMode) onSetPharmacyMode(false);
                  else if (onTogglePharmacyMode) onTogglePharmacyMode();
                }
              }}
              style={[
                styles.modeSegmentBtn,
                !isMultiBranch && styles.modeSegmentBtnActive,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: !isMultiBranch }}
              accessibilityLabel="Select Single Shop Mode"
            >
              <Text
                style={[
                  styles.modeSegmentText,
                  !isMultiBranch && styles.modeSegmentTextActive,
                ]}
              >
                Single Shop
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                if (!isMultiBranch) {
                  if (onSetPharmacyMode) onSetPharmacyMode(true);
                  else if (onTogglePharmacyMode) onTogglePharmacyMode();
                }
              }}
              style={[
                styles.modeSegmentBtn,
                isMultiBranch && styles.modeSegmentBtnActive,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: isMultiBranch }}
              accessibilityLabel="Select Multi-Branch Mode"
            >
              <Text
                style={[
                  styles.modeSegmentText,
                  isMultiBranch && styles.modeSegmentTextActive,
                ]}
              >
                Multi-Branch
              </Text>
            </Pressable>
          </View>
        )}

        {/* If in Multi-Branch mode, display Active Branch Switcher Dropdown */}
        {isMultiBranch ? (
          <View style={styles.branchSelectorRow}>
            {!isMobile && <Text style={styles.branchLabel}>Branch</Text>}
            <View style={styles.branchAnchorContainer}>
              <Pressable
                onPress={() => {
                  if (!dropdownOpen) fetchBranchesFromDb();
                  setDropdownOpen(!dropdownOpen);
                }}
                style={styles.branchButton}
                accessibilityRole="button"
                accessibilityLabel="Select Branch"
              >
                <Text style={styles.branchButtonText} numberOfLines={1}>
                  {currentBranch}
                </Text>
                <Text style={styles.chevron}>▾</Text>
              </Pressable>

              {/* Anchored Dropdown Menu */}
              {dropdownOpen && (
                <>
                  <Pressable
                    style={styles.floatingBackdrop}
                    onPress={() => setDropdownOpen(false)}
                  />
                  <View style={styles.dropdownCardAnchored}>
                    <Text style={styles.dropdownTitle}>
                      Select Active Branch
                    </Text>
                    {branchOptions.map((branch) => {
                      const isSelected = branch === currentBranch;
                      return (
                        <Pressable
                          key={branch}
                          onPress={() => handleSelectBranch(branch)}
                          style={[
                            styles.dropdownItem,
                            isSelected && styles.dropdownItemSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dropdownItemText,
                              isSelected && styles.dropdownItemTextSelected,
                            ]}
                          >
                            {branch}
                          </Text>
                          {isSelected && (
                            <Text style={styles.checkmark}>✓</Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}
            </View>
          </View>
        ) : null}
      </View>

      {/* Middle: Global Search Input */}
      {!isMobile && (
        <View style={styles.headerSearchWrapper}>
          <Text style={styles.headerSearchIcon}>🔍</Text>
          <Text style={styles.headerSearchPlaceholder}>Search (Ctrl+K)</Text>
        </View>
      )}

      {/* Right: Sync Status & User Profile */}
      <View style={styles.rightSection}>
        {/* Subscription Plan Quick Badge */}
        {!isMobile && (
          <Pressable
            onPress={() => onNavigate && onNavigate('subscription-plans')}
            style={styles.headerPlanBadge}
            accessibilityRole="button"
            accessibilityLabel="View SaaS Subscription"
          >
            <Text style={styles.headerPlanIcon}>💳</Text>
            <View>
              <Text style={styles.headerPlanTitle}>Growth ERP (18% GST)</Text>
              <Text style={styles.headerPlanSubtitle}>Active License</Text>
            </View>
          </Pressable>
        )}

        {/* Sync Status Badge */}
        {!isMobile && (
          <View
            style={[styles.syncBadge, !isOnline && styles.syncBadgeOffline]}
          >
            <View
              style={[styles.syncDot, !isOnline && styles.syncDotOffline]}
            />
            <Text
              style={[styles.syncText, !isOnline && styles.syncTextOffline]}
            >
              {isOnline ? "Online" : "Offline"}
            </Text>
          </View>
        )}

        {/* User Profile */}
        <View style={styles.profileContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials || "C"}</Text>
          </View>
          {!isMobile && (
            <View style={styles.userInfoColumn}>
              <Text style={styles.userNameText}>
                {displayName || "Admin Owner"}
              </Text>
              <Text style={styles.userRoleText}>
                {currentUser?.role || "Admin"}
              </Text>
            </View>
          )}

          {onSignOut && (
            <Pressable
              onPress={onSignOut}
              style={styles.signOutButton}
              accessibilityRole="button"
              accessibilityLabel="Sign Out"
            >
              <Text style={styles.signOutText}>Sign Out</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    height: 64,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    zIndex: 10,
  },
  headerContainerMobile: {
    paddingHorizontal: 12,
  },
  hamburgerButton: {
    padding: 8,
    marginRight: 4,
    borderRadius: 6,
    backgroundColor: "#F1F5F9",
  },
  hamburgerIcon: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#0F766E",
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  branchSelectorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  branchLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  branchButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
    gap: 8,
    cursor: "pointer",
    ...Platform.select({
      web: {
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
      },
    }),
  },
  branchButtonText: {
    fontSize: 13.5,
    fontWeight: "600",
    color: "#0F172A",
  },
  chevron: {
    fontSize: 12,
    color: "#64748B",
  },
  modeSegmentContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 3,
  },
  modeSegmentBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    cursor: "pointer",
  },
  modeSegmentBtnActive: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    ...Platform.select({
      web: {
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
      },
    }),
  },
  modeSegmentText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  modeSegmentTextActive: {
    color: "#0F766E",
    fontWeight: "700",
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  syncBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 7,
  },
  syncDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#16A34A",
  },
  syncText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#15803D",
  },
  profileContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  userRole: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
  },
  headerSearchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    width: 240,
    gap: 8,
  },
  headerSearchIcon: {
    fontSize: 12,
    color: "#94A3B8",
  },
  headerSearchPlaceholder: {
    fontSize: 12.5,
    color: "#94A3B8",
  },
  userInfoColumn: {
    flexDirection: "column",
  },
  userNameText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    lineHeight: 16,
  },
  userRoleText: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
  },
  branchAnchorContainer: {
    position: "relative",
    zIndex: 9999,
  },
  floatingBackdrop: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
  },
  dropdownCardAnchored: {
    position: "absolute",
    top: 38,
    left: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 8,
    minWidth: 260,
    zIndex: 9999,
    ...Platform.select({
      web: {
        boxShadow:
          "0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
      },
    }),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.3)",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    paddingTop: 68,
    paddingLeft: 28,
  },
  dropdownCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 8,
    minWidth: 230,
    ...Platform.select({
      web: {
        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
      },
    }),
  },
  dropdownTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 14,
    cursor: "pointer",
  },
  dropdownItemSelected: {
    backgroundColor: "#F0FDFA",
  },
  dropdownItemText: {
    fontSize: 13,
    color: "#334155",
    fontWeight: "500",
  },
  dropdownItemTextSelected: {
    color: "#0F766E",
    fontWeight: "700",
  },
  checkmark: {
    fontSize: 12,
    color: "#0F766E",
    fontWeight: "700",
  },
  syncBadgeOffline: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
  },
  syncDotOffline: {
    backgroundColor: "#EF4444",
  },
  syncTextOffline: {
    color: "#B91C1C",
  },
  signOutButton: {
    marginLeft: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFF",
    cursor: "pointer",
  },
  signOutText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#64748B",
  },
  headerPlanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    cursor: 'pointer',
  },
  headerPlanIcon: {
    fontSize: 14,
  },
  headerPlanTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#6D28D9',
    lineHeight: 14,
  },
  headerPlanSubtitle: {
    fontSize: 9.5,
    color: '#8B5CF6',
    fontWeight: '600',
  },
});
