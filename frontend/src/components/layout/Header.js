import { useEffect, useRef, useState } from "react";

import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import { apiGet } from "../../api/apiClient";
import { useOfflineSync } from "../../offline/OfflineSyncContext";

const DEFAULT_BRANCH_OPTIONS = [{ id: null, name: "All Branches" }];

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
  const offlineSync = useOfflineSync();
  const isOnline = offlineSync?.isOnline ?? true;
  const pendingCount = offlineSync?.pendingCount ?? 0;
  const isSyncing = offlineSync?.isSyncing ?? false;
  const syncNow = offlineSync?.syncNow;

  const [dropdownOpen, setDropdownOpen] = useState(false);

  const isAdminOrOwner = Boolean(
    currentUser?.isOwner ||
      currentUser?.isPlatformSuperadmin ||
      currentUser?.is_platform_superadmin ||
      (currentUser?.role || "").toUpperCase() === "OWNER" ||
      (currentUser?.role || "").toUpperCase() === "ADMIN" ||
      (currentUser?.role || "").toUpperCase() === "SUPERADMIN" ||
      (currentUser?.role || "").toLowerCase().includes("admin") ||
      (currentUser?.role || "").toLowerCase().includes("owner")
  );

  const [branchOptions, setBranchOptions] = useState(
    isAdminOrOwner ? DEFAULT_BRANCH_OPTIONS : []
  );

  const displayBranch =
    typeof currentBranch === "object" && currentBranch !== null
      ? currentBranch.name ||
        currentBranch.branchCode ||
        (isAdminOrOwner ? "All Branches & Stores" : "My Branch")
      : String(
          currentBranch ||
            (isAdminOrOwner ? "All Branches & Stores" : "My Branch")
        );

  const fetchBranchesFromDb = async () => {
    try {
      const result = await apiGet("/api/branches");

      if (result.success) {
        const json = result.data;

        const branchList = Array.isArray(json)
          ? json
          : json?.data && Array.isArray(json.data)
            ? json.data
            : [];

        const activeBranches = branchList.filter(
          (b) =>
            b.status === "ACTIVE" ||
            b.status === "Active" ||
            !b.status
        );

        const branchObjs = activeBranches.map((b) => ({
          id: b.id,
          name: b.name,
          branchCode: b.branch_code || b.branchCode,
          adminName: b.admin_name || b.contact_person || "",
        }));

        let combined;

        if (isAdminOrOwner) {
          combined = [
            { id: null, name: "All Branches & Stores" },
            ...branchObjs,
          ];
        } else {
          // Non-admin branch staff MUST ONLY see their assigned branch!
          // NEVER show "All Branches" and never show other branches!
          combined = branchObjs;
        }

        setBranchOptions(combined);

        // Auto-select assigned branch for non-admins if currently "All Branches" or empty
        if (!isAdminOrOwner && combined.length > 0) {
          const isInvalid =
            !currentBranch ||
            currentBranch === "All Branches" ||
            currentBranch === "All Branches & Stores" ||
            (typeof currentBranch === "object" &&
              (!currentBranch.id ||
                currentBranch.name === "All Branches" ||
                currentBranch.name === "All Branches & Stores"));

          if (isInvalid && onBranchChange) {
            onBranchChange(combined[0]);
          }
        }

        return;
      }
    } catch (err) {
      console.warn(
        "Could not fetch database branches in Header:",
        err.message
      );
    }

    setBranchOptions(
      isAdminOrOwner ? DEFAULT_BRANCH_OPTIONS : []
    );
  };

  // --- Global Search (products & customers) ---
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState({
    products: [],
    customers: [],
  });
  const [isSearching, setIsSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchDebounceRef = useRef(null);

  const runSearch = async (query) => {
    setIsSearching(true);

    try {
      const [productsRes, customersRes] = await Promise.all([
        apiGet(
          `/api/cashier/products?search=${encodeURIComponent(query)}`
        ),
        apiGet(
          `/api/customers?search=${encodeURIComponent(query)}`
        ),
      ]);

      const products =
        productsRes.success &&
        Array.isArray(productsRes.data?.data)
          ? productsRes.data.data.slice(0, 5)
          : [];

      const customers =
        customersRes.success &&
        Array.isArray(customersRes.data?.data)
          ? customersRes.data.data.slice(0, 5)
          : [];

      setSearchResults({ products, customers });
    } catch (err) {
      console.warn("Global search failed:", err.message);
      setSearchResults({
        products: [],
        customers: [],
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchChange = (text) => {
    setSearchQuery(text);
    setSearchOpen(true);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    const trimmed = text.trim();

    if (trimmed.length < 2) {
      setSearchResults({
        products: [],
        customers: [],
      });
      setIsSearching(false);
      return;
    }

    searchDebounceRef.current = setTimeout(
      () => runSearch(trimmed),
      350
    );
  };

  const closeSearch = () => {
    setSearchOpen(false);
  };

  const handleSelectProduct = (product) => {
    closeSearch();
    setSearchQuery("");
    setSearchResults({
      products: [],
      customers: [],
    });

    if (onNavigate) {
      onNavigate("stock-status", product.name);
    }
  };

  const handleSelectCustomer = (customer) => {
    closeSearch();
    setSearchQuery("");
    setSearchResults({
      products: [],
      customers: [],
    });

    if (onNavigate) {
      onNavigate("customer-details", customer.id);
    }
  };

  const hasSearchResults =
    searchResults.products.length > 0 ||
    searchResults.customers.length > 0;

  // Branch fetching from backend
  useEffect(() => {
    fetchBranchesFromDb();
  }, [branchRefreshKey]);

  const displayName = currentUser?.name || "User";

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
      style={[
        styles.headerContainer,
        isMobile && styles.headerContainerMobile,
      ]}
    >
      {/* Left: Mobile Hamburger Button & Branch Info */}
      <View
        style={[
          styles.leftSection,
          isMobile && styles.leftSectionMobile,
        ]}
      >
        {isMobile && (
          <Pressable
            onPress={onToggleMobileMenu}
            style={styles.hamburgerButton}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open Navigation Menu"
          >
            <Text style={styles.hamburgerIcon}>☰</Text>
          </Pressable>
        )}

        {/* Active Branch Switcher Dropdown */}
        <View
          style={[
            styles.branchSelectorRow,
            isMobile && styles.branchSelectorRowMobile,
          ]}
        >
          {!isMobile && (
            <Text style={styles.branchLabel}>
              {isMultiBranch ? "Store / Branch" : "Single Store"}
            </Text>
          )}

          <View style={styles.branchAnchorContainer}>
            {!isMultiBranch ? (
              /* Single Store: Solid Non-Clickable Badge */
              <View
                style={[
                  styles.branchButton,
                  {
                    backgroundColor: "#FFFFFF",
                    borderColor: "#E5DFE4",
                    borderWidth: 1,
                    cursor: "default",
                    paddingHorizontal: 12,
                  },
                  isMobile && styles.branchButtonMobile,
                ]}
              >
                <Text style={styles.branchStoreIcon}>🏪</Text>

                <Text
                  style={[
                    styles.branchButtonText,
                    {
                      color: "#28242B",
                      fontWeight: "700",
                    },
                    isMobile && styles.branchButtonTextMobile,
                  ]}
                  numberOfLines={1}
                >
                  {currentUser?.organisationName ||
                    displayBranch ||
                    "Main Store"}
                </Text>

                <View
                  style={{
                    marginLeft: 6,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                    backgroundColor: "#F2ECF0",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "800",
                      color: "#744458",
                    }}
                  >
                    DIRECT
                  </Text>
                </View>
              </View>
            ) : (
              /* Multi-Branch Chain: Branch Switcher Dropdown */
              <>
                <Pressable
                  onPress={() => {
                    if (!dropdownOpen) {
                      fetchBranchesFromDb();
                    }

                    setDropdownOpen(!dropdownOpen);
                  }}
                  style={[
                    styles.branchButton,
                    isMobile && styles.branchButtonMobile,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Select Branch"
                >
                  <Text style={styles.branchStoreIcon}>📍</Text>

                  <Text
                    style={[
                      styles.branchButtonText,
                      isMobile &&
                        styles.branchButtonTextMobile,
                    ]}
                    numberOfLines={1}
                  >
                    {displayBranch}
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
                        {isAdminOrOwner
                          ? "Select Active Store Branch"
                          : "Your Assigned Store Branch"}
                      </Text>

                      {branchOptions.length === 0 ? (
                        <Text
                          style={{
                            padding: 12,
                            color: "#64748B",
                            fontSize: 13,
                            textAlign: "center",
                          }}
                        >
                          No active branch assigned. Please contact
                          your store administrator.
                        </Text>
                      ) : (
                        branchOptions.map((branch) => {
                          const branchName =
                            typeof branch === "object" &&
                            branch !== null
                              ? branch.name ||
                                branch.branchCode ||
                                "Branch"
                              : String(branch);

                          const isSelected =
                            branchName === displayBranch;

                          return (
                            <Pressable
                              key={branch.id || branchName}
                              onPress={() =>
                                handleSelectBranch(branch)
                              }
                              style={[
                                styles.dropdownItem,
                                isSelected &&
                                  styles.dropdownItemSelected,
                              ]}
                            >
                              <View style={{ flex: 1 }}>
                                <Text
                                  style={[
                                    styles.dropdownItemText,
                                    isSelected &&
                                      styles.dropdownItemTextSelected,
                                  ]}
                                >
                                  📍 {branchName}
                                </Text>

                                {branch.adminName ? (
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      color: "#77717A",
                                      marginTop: 1,
                                      paddingLeft: 18,
                                    }}
                                  >
                                    Admin: {branch.adminName}
                                  </Text>
                                ) : null}
                              </View>

                              {isSelected && (
                                <Text style={styles.checkmark}>
                                  ✓
                                </Text>
                              )}
                            </Pressable>
                          );
                        })
                      )}
                    </View>
                  </>
                )}
              </>
            )}
          </View>
        </View>
      </View>

      {/* Middle: Global Search Input */}
      {!isMobile && (
        <View style={styles.headerSearchAnchor}>
          <View style={styles.headerSearchWrapper}>
            <Text style={styles.headerSearchIcon}>🔍</Text>

            <TextInput
              style={styles.headerSearchInput}
              placeholder="Search products, customers..."
              placeholderTextColor="#77717A"
              value={searchQuery}
              onChangeText={handleSearchChange}
              onFocus={() => setSearchOpen(true)}
              accessibilityLabel="Global search"
            />

            {isSearching && (
              <ActivityIndicator
                size="small"
                color="#B9829A"
              />
            )}
          </View>

          {searchOpen && searchQuery.trim().length >= 2 && (
            <>
              <Pressable
                style={styles.floatingBackdrop}
                onPress={closeSearch}
              />

              <View style={styles.searchResultsDropdown}>
                {!isSearching && !hasSearchResults && (
                  <Text style={styles.searchNoResults}>
                    No matches for "{searchQuery.trim()}"
                  </Text>
                )}

                {searchResults.customers.length > 0 && (
                  <>
                    <Text style={styles.searchSectionTitle}>
                      Customers
                    </Text>

                    {searchResults.customers.map((customer) => (
                      <Pressable
                        key={`customer-${customer.id}`}
                        style={styles.searchResultItem}
                        onPress={() =>
                          handleSelectCustomer(customer)
                        }
                      >
                        <Text style={styles.searchResultIcon}>
                          🧑
                        </Text>

                        <View style={{ flex: 1 }}>
                          <Text
                            style={styles.searchResultTitle}
                            numberOfLines={1}
                          >
                            {customer.fullName ||
                              customer.full_name ||
                              customer.name}
                          </Text>

                          <Text
                            style={styles.searchResultSubtitle}
                            numberOfLines={1}
                          >
                            {customer.phone ||
                              customer.email ||
                              ""}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </>
                )}

                {searchResults.products.length > 0 && (
                  <>
                    <Text style={styles.searchSectionTitle}>
                      Products
                    </Text>

                    {searchResults.products.map((product) => (
                      <Pressable
                        key={`product-${product.id}`}
                        style={styles.searchResultItem}
                        onPress={() =>
                          handleSelectProduct(product)
                        }
                      >
                        <Text style={styles.searchResultIcon}>
                          💊
                        </Text>

                        <View style={{ flex: 1 }}>
                          <Text
                            style={styles.searchResultTitle}
                            numberOfLines={1}
                          >
                            {product.name}
                          </Text>

                          <Text
                            style={styles.searchResultSubtitle}
                            numberOfLines={1}
                          >
                            Stock: {product.stock} • MRP ₹
                            {product.mrp}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </>
                )}
              </View>
            </>
          )}
        </View>
      )}

      {/* Right: Sync Status & User Profile */}
      <View
        style={[
          styles.rightSection,
          isMobile && styles.rightSectionMobile,
        ]}
      >
        {/* Subscription Plan Quick Badge */}
        {!isMobile && (
          <Pressable
            onPress={() =>
              onNavigate &&
              onNavigate("subscription-plans")
            }
            style={styles.headerPlanBadge}
            accessibilityRole="button"
            accessibilityLabel="View SaaS Subscription"
          >
            <Text style={styles.headerPlanIcon}>💳</Text>

            <View>
              <Text style={styles.headerPlanTitle}>
                Growth ERP (18% GST)
              </Text>

              <Text style={styles.headerPlanSubtitle}>
                Active License
              </Text>
            </View>
          </Pressable>
        )}

        {/* Sync Status Badge (Desktop & Mobile) */}
        <Pressable
          onPress={() => {
            if (!isSyncing && syncNow) {
              syncNow();
            }
          }}
          style={[
            styles.syncBadge,
            isMobile && styles.syncBadgeMobile,
            isSyncing
              ? styles.syncBadgeSyncing
              : !isOnline
                ? styles.syncBadgeOffline
                : styles.syncBadge,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Sync status and trigger"
        >
          <View
            style={[
              styles.syncDot,
              isSyncing
                ? styles.syncDotSyncing
                : !isOnline
                  ? styles.syncDotOffline
                  : styles.syncDot,
            ]}
          />

          <Text
            style={[
              styles.syncText,
              isMobile && styles.syncTextMobile,
              isSyncing
                ? styles.syncTextSyncing
                : !isOnline
                  ? styles.syncTextOffline
                  : styles.syncText,
            ]}
            numberOfLines={1}
          >
            {isSyncing
              ? "Syncing..."
              : !isOnline
                ? isMobile
                  ? pendingCount > 0
                    ? `Offline (${pendingCount})`
                    : "Offline"
                  : pendingCount > 0
                    ? `Offline (${pendingCount})`
                    : "Offline"
                : isMobile
                  ? "Online"
                  : "Online • Synced"}
          </Text>
        </Pressable>

        {/* Quick Settings Icon */}
        <Pressable
          onPress={() => {
            console.log("SETTINGS BUTTON CLICKED");

            if (onNavigate) {
              onNavigate("tax-settings");
            }
          }}
          style={[
            styles.quickSettingsButton,
            isMobile && styles.quickSettingsButtonMobile,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Text
            style={[
              styles.quickSettingsIcon,
              isMobile && { fontSize: 13 },
            ]}
          >
            ⚙️
          </Text>
        </Pressable>

        {/* User Profile */}
        <View
          style={[
            styles.profileContainer,
            isMobile && styles.profileContainerMobile,
          ]}
        >
          <View
            style={[
              styles.avatar,
              isMobile && styles.avatarMobile,
              (currentUser?.isOwner ||
                (currentUser?.role || "").toUpperCase() ===
                  "OWNER") && {
                backgroundColor: "#A66D86",
              },
            ]}
          >
            <Text
              style={[
                styles.avatarText,
                isMobile && styles.avatarTextMobile,
              ]}
            >
              {currentUser?.isOwner ||
              (currentUser?.role || "").toUpperCase() ===
                "OWNER"
                ? "👑"
                : initials || "C"}
            </Text>
          </View>

          {!isMobile && (
            <View style={styles.userInfoColumn}>
              <Text style={styles.userNameText}>
                {displayName || "Admin Owner"}
              </Text>

              <Text
                style={[
                  styles.userRoleText,
                  (currentUser?.isOwner ||
                    (currentUser?.role || "").toUpperCase() ===
                      "OWNER") && {
                    color: "#B9829A",
                    fontWeight: "800",
                  },
                ]}
              >
                {currentUser?.isOwner ||
                (currentUser?.role || "").toUpperCase() ===
                  "OWNER"
                  ? "👑 Pharmacy Owner"
                  : currentUser?.roleName ||
                    currentUser?.role ||
                    "Admin"}
              </Text>
            </View>
          )}

          {onSignOut && (
            <Pressable
              onPress={onSignOut}
              style={[
                styles.signOutButton,
                isMobile && styles.signOutButtonMobile,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Sign Out"
            >
              <Text
                style={[
                  styles.signOutText,
                  isMobile && styles.signOutTextMobile,
                ]}
              >
                {isMobile ? "🚪" : "Sign Out"}
              </Text>
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
    borderBottomColor: "#E5DFE4",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    zIndex: 10,
  },

  headerContainerMobile: {
    paddingHorizontal: 8,
    height: 56,
    minWidth: 0,
  },

  hamburgerButton: {
    padding: 6,
    marginRight: 2,
    borderRadius: 6,
    backgroundColor: "#F8F5F7",
  },

  hamburgerIcon: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#B9829A",
  },

  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  leftSectionMobile: {
    gap: 6,
    minWidth: 0,
    flexShrink: 1,
  },

  branchSelectorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  branchSelectorRowMobile: {
    gap: 6,
    minWidth: 0,
  },

  branchLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#77717A",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  branchButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DFE4",
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

  branchButtonMobile: {
    paddingVertical: 4,
    paddingHorizontal: 7,
    maxWidth: 110,
    gap: 4,
  },

  branchButtonText: {
    fontSize: 13.5,
    fontWeight: "600",
    color: "#28242B",
  },

  branchButtonTextMobile: {
    fontSize: 11.5,
    maxWidth: 62,
  },

  chevron: {
    fontSize: 12,
    color: "#77717A",
  },

  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },

  rightSectionMobile: {
    gap: 6,
    flexShrink: 0,
  },

  syncBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAF2EE",
    borderWidth: 1,
    borderColor: "#EAF2EE",
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 7,
  },

  syncDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#4F8A72",
  },

  syncText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#4F8A72",
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
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    alignItems: "center",
    justifyContent: "center",
  },

  avatarText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#28242B",
  },

  userRole: {
    fontSize: 13,
    fontWeight: "600",
    color: "#28242B",
  },

  headerSearchAnchor: {
    position: "relative",
    zIndex: 9999,
  },

  headerSearchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    width: 280,
    gap: 8,
  },

  headerSearchIcon: {
    fontSize: 12,
    color: "#77717A",
  },

  headerSearchInput: {
    flex: 1,
    fontSize: 12.5,
    color: "#28242B",
    padding: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      },
    }),
  },

  searchResultsDropdown: {
    position: "absolute",
    top: 40,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    paddingVertical: 6,
    maxHeight: 360,
    overflow: "hidden",
    zIndex: 9999,
    ...Platform.select({
      web: {
        boxShadow:
          "0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
      },
    }),
  },

  searchSectionTitle: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#77717A",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 4,
  },

  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    cursor: "pointer",
  },

  searchResultIcon: {
    fontSize: 15,
  },

  searchResultTitle: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#28242B",
  },

  searchResultSubtitle: {
    fontSize: 11,
    color: "#77717A",
    marginTop: 1,
  },

  searchNoResults: {
    fontSize: 12,
    color: "#77717A",
    paddingVertical: 12,
    paddingHorizontal: 14,
    textAlign: "center",
  },

  userInfoColumn: {
    flexDirection: "column",
  },

  userNameText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#28242B",
    lineHeight: 16,
  },

  userRoleText: {
    fontSize: 11,
    color: "#77717A",
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
    borderColor: "#E5DFE4",
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
    borderColor: "#E5DFE4",
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
    color: "#77717A",
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
    backgroundColor: "#E8D5DD",
  },

  dropdownItemText: {
    fontSize: 13,
    color: "#28242B",
    fontWeight: "500",
  },

  dropdownItemTextSelected: {
    color: "#B9829A",
    fontWeight: "700",
  },

  checkmark: {
    fontSize: 12,
    color: "#B9829A",
    fontWeight: "700",
  },

  syncBadgeOffline: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
    borderWidth: 1,
  },

  syncDotOffline: {
    backgroundColor: "#DC2626",
  },

  syncTextOffline: {
    color: "#B91C1C",
    fontWeight: "700",
  },

  syncBadgePending: {
    backgroundColor: "#F7F0E5",
    borderColor: "#F7F0E5",
  },

  syncDotPending: {
    backgroundColor: "#C49752",
  },

  syncTextPending: {
    color: "#C49752",
  },

  syncBadgeSyncing: {
    backgroundColor: "#E8D5DD",
    borderColor: "#E8D5DD",
  },

  syncDotSyncing: {
    backgroundColor: "#B9829A",
  },

  syncTextSyncing: {
    color: "#A66D86",
  },

  syncBadgeMobile: {
    paddingVertical: 3,
    paddingHorizontal: 6,
    gap: 4,
    borderRadius: 12,
  },

  syncTextMobile: {
    fontSize: 10.5,
    fontWeight: "700",
  },

  profileContainerMobile: {
    gap: 4,
  },

  avatarMobile: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },

  avatarTextMobile: {
    fontSize: 10,
  },

  quickSettingsButtonMobile: {
    padding: 5,
    borderRadius: 6,
  },

  signOutButton: {
    marginLeft: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    backgroundColor: "#FFF",
    cursor: "pointer",
  },

  signOutButtonMobile: {
    marginLeft: 2,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
  },

  signOutText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#77717A",
  },

  signOutTextMobile: {
    fontSize: 12,
  },

  headerPlanBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#E8D5DD",
    borderWidth: 1,
    borderColor: "#E8D5DD",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    cursor: "pointer",
  },

  headerPlanIcon: {
    fontSize: 14,
  },

  headerPlanTitle: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#A66D86",
    lineHeight: 14,
  },

  headerPlanSubtitle: {
    fontSize: 9.5,
    color: "#B9829A",
    fontWeight: "600",
  },

  branchStoreIcon: {
    fontSize: 13,
  },

  modeTogglePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    cursor: "pointer",
    borderWidth: 1,
  },

  modeTogglePillMulti: {
    backgroundColor: "#E8D5DD",
    borderColor: "#E8D5DD",
  },

  modeTogglePillSingle: {
    backgroundColor: "#E8D5DD",
    borderColor: "#E8D5DD",
  },

  modeToggleIcon: {
    fontSize: 12,
  },

  modeToggleText: {
    fontSize: 12,
    fontWeight: "700",
  },

  modeToggleTextMulti: {
    color: "#B9829A",
  },

  modeToggleTextSingle: {
    color: "#A66D86",
  },

  dropdownDivider: {
    height: 1,
    backgroundColor: "#F8F5F7",
    marginVertical: 6,
  },

  dropdownModeSection: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  dropdownModeSectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#77717A",
    letterSpacing: 0.5,
    marginBottom: 4,
    paddingHorizontal: 6,
  },

  dropdownModeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
    cursor: "pointer",
  },

  dropdownModeBtnActive: {
    backgroundColor: "#E8D5DD",
  },

  dropdownModeBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#28242B",
  },

  dropdownModeBtnTextActive: {
    color: "#B9829A",
    fontWeight: "750",
  },

  quickSettingsButton: {
    padding: 7,
    borderRadius: 8,
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    cursor: "pointer",
    alignItems: "center",
    justifyContent: "center",
  },

  quickSettingsIcon: {
    fontSize: 15,
  },
});