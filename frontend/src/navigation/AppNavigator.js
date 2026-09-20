import React, { useState, useEffect } from "react";
import { setAuthSession, clearAuthSession } from "../api/apiClient";
import {
  supabase,
  getSession,
  signOut as supabaseSignOut,
} from "../api/supabaseClient";
import { API_URL } from "../config";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
} from "react-native";
import Sidebar from "../components/layout/Sidebar";
import Header from "../components/layout/Header";
import LoginScreen from "../screens/auth/LoginScreen";
import { PosProvider } from "../context/PosContext";
import { OfflineSyncProvider } from "../offline/OfflineSyncContext";
import { syncEngine } from "../sync";

// 0. Sales & Cashier Screens (Sales / POS Billing, Cash Register)
import SalesScreen from "../screens/sales/SalesScreen";
import CashRegisterScreen from "../screens/cashier/CashRegisterScreen";
import HeldBillsScreen from "../screens/cashier/HeldBillsScreen";
import SalesReturnsScreen from "../screens/cashier/SalesReturnsScreen";

// 1. Master Dashboard
import InventoryDashboard from "../screens/inventory/InventoryDashboard";

// 2. Inventory Screens (3 Pages: Stock Adjustments, Stock Transfer, Stock Status)
import StockAdjustmentsScreen from "../screens/inventory/StockAdjustmentsScreen";
import StockTransferScreen from "../screens/inventory/StockTransferScreen";
import StockStatusScreen from "../screens/inventory/StockStatusScreen";

// 3. Purchases Screens (3 Pages: Purchases, Goods Receiving, Suppliers)
import PurchasesScreen from "../screens/purchases/PurchasesScreen";
import GoodsReceivingScreen from "../screens/purchases/GoodsReceivingScreen";
import SuppliersScreen from "../screens/purchases/SuppliersScreen";

// 4. Customers Screens (4 Pages: Customers / Patients, Customer Details, Customer Ledger / Credit, Customer Payments)
import CustomersPatientsScreen from "../screens/customers/CustomersPatientsScreen";
import CustomerDetailsScreen from "../screens/customers/CustomerDetailsScreen";
import CustomerLedgerScreen from "../screens/customers/CustomerLedgerScreen";
import CustomerPaymentsScreen from "../screens/customers/CustomerPaymentsScreen";

// 5. Management Screens (4 Pages: Branches, Users, Roles, Audit Log) + Settings (Page Permissions)
import BranchesScreen from "../screens/management/BranchesScreen";
import UsersScreen from "../screens/management/UsersScreen";
import RolesScreen from "../screens/management/RolesScreen";
import RolesPermissionsScreen from "../screens/management/RolesPermissionsScreen";
import AuditLogScreen from "../screens/management/AuditLogScreen";

// 6. Reports Screens (3 Pages: Inventory Reports, Purchase Reports, Expiry Reports)
import InventoryReportsScreen from "../screens/reports/InventoryReportsScreen";
import PurchaseReportsScreen from "../screens/reports/PurchaseReportsScreen";
import ExpiryReportsScreen from "../screens/reports/ExpiryReportsScreen";

// 7. Settings & Compliance Screens (Tax / GST & SaaS Subscriptions with 18% GST)
import TaxGstSettingsScreen from "../screens/settings/TaxGstSettingsScreen";
import SubscriptionPlansScreen from "../screens/settings/SubscriptionPlansScreen";

const ROUTE_PERMISSIONS = {
  "tax-settings": "tax-settings:view",
  "subscription-plans": "subscription:view",
  roles: "roles:manage",
  "roles-permissions": "permissions:manage",
  "page-permissions": "permissions:manage",
  users: "users:manage",
  "audit-log": "audit:view",
};

const hasPermission = (user, permission) => {
  if (!permission) return true;
  if (!user) return false;
  const roleName = (user.role || "").toLowerCase();
  const accessLevel = (user.accessLevel || "").toLowerCase();
  if (
    user.isOwner ||
    user.is_platform_superadmin ||
    roleName.includes("owner") ||
    roleName.includes("admin") ||
    accessLevel.includes("owner") ||
    accessLevel.includes("admin")
  ) {
    return true;
  }
  if (Array.isArray(user.permissions)) {
    return user.permissions.includes(permission);
  }
  if (user.permissions && typeof user.permissions === "object") {
    return Boolean(user.permissions[permission]);
  }
  return true;
};

export default function AppNavigator() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Active Route State (Default: 'dashboard')
  const [currentRoute, setCurrentRoute] = useState("dashboard");
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [branchRefreshKey, setBranchRefreshKey] = useState(0);

  const handleBranchesUpdated = () => {
    setBranchRefreshKey((prev) => prev + 1);
  };

  // 3-state Auth Lifecycle: 'INITIALIZING' | 'AUTHENTICATED' | 'UNAUTHENTICATED' | 'AUTHENTICATED_INCOMPLETE_ONBOARDING'
  const [authStatus, setAuthStatus] = useState("INITIALIZING");
  const [currentUser, setCurrentUser] = useState(null);
  const [googleOnboardingData, setGoogleOnboardingData] = useState(null);

  const resolveBranchContext = (user) => {
    if (!user || user.hasBranch === false) return null;
    if (user.branch && typeof user.branch === "object" && user.branch.id) {
      return {
        id: user.branch.id,
        name: user.branch.name || user.branch.branchCode || "Main Branch",
      };
    }
    if (user.branchId) {
      return {
        id: user.branchId,
        name: user.branchName || user.branch || "Main Branch",
      };
    }
    if (user.branch && typeof user.branch === "object" && user.branch.name) {
      return { id: null, name: user.branch.name };
    }
    if (typeof user.branch === "string" && user.branch.trim()) {
      return { id: null, name: user.branch.trim() };
    }
    if (
      user.branchName &&
      typeof user.branchName === "string" &&
      user.branchName.trim()
    ) {
      return { id: null, name: user.branchName.trim() };
    }
    return null;
  };

  const restoreAuthSession = async (session) => {
    if (!session?.access_token) {
      setCurrentUser(null);
      setGoogleOnboardingData(null);
      setAuthStatus("UNAUTHENTICATED");
      return;
    }

    let authIntent = null;
    if (typeof window !== "undefined") {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        authIntent =
          urlParams.get("auth_intent") ||
          window.sessionStorage?.getItem("pharmaflow_auth_intent");
      } catch (e) {}
    }

    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const resData = await response.json();
        const user = resData.data?.user || resData.user;
        const userWithToken = user
          ? { ...user, token: session.access_token }
          : null;
        setCurrentUser(userWithToken);
        setGoogleOnboardingData(null);
        setAuthError("");
        setAuthSession({ organisationId: user?.organisationId });

        if (user && user.hasBranch === false) {
          setCurrentRoute("branches");
          setSelectedBranch(null);
        } else if (user) {
          setSelectedBranch(resolveBranchContext(user));
        }

        setAuthStatus("AUTHENTICATED");

        // Clean up auth_intent
        if (typeof window !== "undefined") {
          try {
            window.sessionStorage?.removeItem("pharmaflow_auth_intent");
            if (window.history && window.location.search) {
              window.history.replaceState(
                {},
                document.title,
                window.location.pathname,
              );
            }
          } catch (e) {}
        }
        return;
      }

      // If user not found in PostgreSQL (401 / 404)
      if (authIntent === "signup") {
        // User authenticated via Supabase Google OAuth, but needs to complete pharmacy onboarding form
        setGoogleOnboardingData({
          token: session.access_token,
          email: session.user?.email || "",
          name:
            session.user?.user_metadata?.full_name ||
            session.user?.user_metadata?.name ||
            "",
        });
        setAuthStatus("AUTHENTICATED_INCOMPLETE_ONBOARDING");
        return;
      }

      // User attempted Google login, but no PostgreSQL account exists
      await supabase.auth.signOut();
      await clearAuthSession();
      setCurrentUser(null);
      setGoogleOnboardingData(null);
      setAuthStatus("UNAUTHENTICATED");

      if (authIntent === "login") {
        setAuthError(
          "No PharmaFlow account found for this Google ID. Please register your pharmacy using Sign Up.",
        );
      }

      if (typeof window !== "undefined") {
        try {
          window.sessionStorage?.removeItem("pharmaflow_auth_intent");
          if (window.history && window.location.search) {
            window.history.replaceState(
              {},
              document.title,
              window.location.pathname,
            );
          }
        } catch (e) {}
      }
    } catch (e) {
      console.warn("Session restore error:", e.message);
      setAuthStatus("UNAUTHENTICATED");
    }
  };

  useEffect(() => {
    // 1. Initial check on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      restoreAuthSession(session);
    });

    // 2. Real-time auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        restoreAuthSession(session);
      } else if (event === "SIGNED_OUT") {
        setCurrentUser(null);
        setAuthStatus("UNAUTHENTICATED");
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Pharmacy Architecture Mode: Multi-Branch (true) vs Single-Shop (false)
  const [isMultiBranch, setIsMultiBranch] = useState(true);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage("");
    }, 4000);
  };

  const handleNavigate = (routeKey, payload) => {
    // Check permission before allowing navigation
    const requiredPermission = ROUTE_PERMISSIONS[routeKey];
    if (requiredPermission && !hasPermission(currentUser, requiredPermission)) {
      showToast("Access denied: You do not have permission to view this page.");
      return;
    }

    // Users without a branch must stay on Branch Management
    const branchRequiredRoutes = [
      "new-sale",
      "sales",
      "pos-billing",
      "cash-register",
      "held-bills",
      "sales-returns",
      "returns",
      "inventory",
      "stock-status",
      "stock-adjustments",
      "stock-transfer",
      "purchases",
      "goods-receiving",
      "suppliers",
      "customers",
      "customers-patients",
      "customer-details",
      "customer-ledger",
      "customer-payments",
      "inventory-reports",
      "purchase-reports",
      "expiry-reports",
    ];

    if (
      currentUser?.hasBranch === false &&
      (branchRequiredRoutes.includes(routeKey) || routeKey !== "branches")
    ) {
      showToast("Please create your initial pharmacy branch first.");
      setCurrentRoute("branches");
      setMobileMenuOpen(false);
      return;
    }

    if (payload) {
      setSelectedCustomerId(payload);
    }

    setCurrentRoute(routeKey);
    setMobileMenuOpen(false);
  };

  const handleTogglePharmacyMode = () => {
    handleSetPharmacyMode(!isMultiBranch);
  };

  const handleSetPharmacyMode = (multi) => {
    if (multi === isMultiBranch) return;
    setIsMultiBranch(multi);
    if (!multi && currentRoute === "stock-transfer") {
      setCurrentRoute("stock-adjustments");
    }
    showToast(
      multi
        ? "Switched to Multi-Branch Mode (Branch Switcher & Transfer Enabled)"
        : "Switched to Single-Shop Mode (Streamlined for 1 Pharmacy Store)",
    );
  };

  const handleSignOut = async () => {
    try {
      await supabaseSignOut();
    } catch (error) {
      console.warn("Supabase sign out warning:", error);
    }

    setCurrentUser(null);
    setAuthStatus("UNAUTHENTICATED");
    await clearAuthSession();
    showToast("Signed out successfully.");
  };

  // Render Active Screen Component
  const renderScreen = () => {
    if (currentUser && currentUser.hasBranch === false) {
      return (
        <BranchesScreen
          onNavigate={handleNavigate}
          onShowToast={showToast}
          isMultiBranch={isMultiBranch}
          currentUser={currentUser}
          isStandaloneOnboarding={true}
          onBranchesUpdated={async () => {
            handleBranchesUpdated();
            const {
              data: { session },
            } = await supabase.auth.getSession();
            if (session) {
              await restoreAuthSession(session);
            }
          }}
        />
      );
    }

    switch (currentRoute) {
      case "dashboard":
        return (
          <InventoryDashboard
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            selectedBranch={selectedBranch}
          />
        );
      case "sales":
      case "new-sale":
      case "pos-billing":
        return (
          <SalesScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            selectedBranch={selectedBranch}
          />
        );
      case "cash-register":
      case "cashier":
        return (
          <CashRegisterScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            selectedBranch={selectedBranch}
            currentUser={currentUser}
          />
        );
      case "held-bills":
        return (
          <HeldBillsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            selectedBranch={selectedBranch}
          />
        );
      case "sales-returns":
      case "returns":
        return (
          <SalesReturnsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            selectedBranch={selectedBranch}
          />
        );
      case "stock-adjustments":
        return (
          <StockAdjustmentsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            selectedBranch={selectedBranch}
          />
        );
      case "stock-transfer":
        return (
          <StockTransferScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            selectedBranch={selectedBranch}
          />
        );
      case "inventory":
      case "stock-status":
      case "low-stock-expiry":
      case "current-stock":
        return (
          <StockStatusScreen
            initialSearchQuery={selectedCustomerId}
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            selectedBranch={selectedBranch}
          />
        );
      case "purchases":
        return (
          <PurchasesScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            selectedBranch={selectedBranch}
          />
        );
      case "goods-receiving":
        return (
          <GoodsReceivingScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            selectedBranch={selectedBranch}
          />
        );
      case "suppliers":
        return (
          <SuppliersScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            selectedBranch={selectedBranch}
          />
        );
      case "customers-patients":
      case "customers":
      case "add-customer":
        return (
          <CustomersPatientsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            selectedBranch={selectedBranch}
          />
        );
      case "customer-details":
        return (
          <CustomerDetailsScreen
            customerId={selectedCustomerId}
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            selectedBranch={selectedBranch}
          />
        );
      case "customer-ledger":
        return (
          <CustomerLedgerScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            selectedBranch={selectedBranch}
          />
        );
      case "customer-payments":
        return (
          <CustomerPaymentsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            selectedBranch={selectedBranch}
          />
        );
      case "branches":
        return (
          <BranchesScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            onBranchesUpdated={async () => {
              handleBranchesUpdated();
              const {
                data: { session },
              } = await supabase.auth.getSession();
              if (session) {
                await restoreAuthSession(session);
              }
            }}
          />
        );
      case "users":
        return (
          <UsersScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            selectedBranch={selectedBranch}
          />
        );
      case "roles":
        return (
          <RolesScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case "roles-permissions":
      case "page-permissions":
        return (
          <RolesPermissionsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case "audit-log":
        return (
          <AuditLogScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            selectedBranch={selectedBranch}
          />
        );
      case "inventory-reports":
        return (
          <InventoryReportsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            selectedBranch={selectedBranch}
          />
        );
      case "purchase-reports":
        return (
          <PurchaseReportsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            selectedBranch={selectedBranch}
          />
        );
      case "expiry-reports":
        return (
          <ExpiryReportsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            selectedBranch={selectedBranch}
          />
        );
      case "tax-settings":
        return (
          <TaxGstSettingsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            currentUser={currentUser}
          />
        );
      case "subscription-plans":
        return (
          <SubscriptionPlansScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      default:
        return (
          <InventoryDashboard
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            selectedBranch={selectedBranch}
          />
        );
    }
  };

  // Auth Guard: Render loading screen during initialization
  if (authStatus === "INITIALIZING") {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#F4FAF8",
        }}
      >
        <ActivityIndicator size="large" color="#0F766E" />
        <Text
          style={{
            marginTop: 14,
            color: "#64748B",
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          Loading workspace...
        </Text>
      </View>
    );
  }

  // Auth Guard: If incomplete onboarding or unauthenticated
  if (
    authStatus === "AUTHENTICATED_INCOMPLETE_ONBOARDING" ||
    authStatus === "UNAUTHENTICATED" ||
    !currentUser
  ) {
    return (
      <LoginScreen
        googleOnboardingData={
          authStatus === "AUTHENTICATED_INCOMPLETE_ONBOARDING"
            ? googleOnboardingData
            : null
        }
        authError={authError}
        onClearAuthError={() => setAuthError("")}
        onCancelGoogleOnboarding={async () => {
          await supabase.auth.signOut();
          await clearAuthSession();
          setGoogleOnboardingData(null);
          setCurrentUser(null);
          setAuthStatus("UNAUTHENTICATED");
          setAuthError("");
        }}
        onLoginSuccess={(user, token) => {
          setAuthSession({ organisationId: user?.organisationId });
          setCurrentUser(
            user ? { ...user, token: token || user?.token } : null,
          );
          setGoogleOnboardingData(null);
          setAuthError("");
          setAuthStatus("AUTHENTICATED");
          if (user && user.hasBranch === false) {
            setCurrentRoute("branches");
            setSelectedBranch(null);
          } else {
            setSelectedBranch(resolveBranchContext(user));
          }
          showToast(`Welcome back, ${user.display_name || user.name}!`);
        }}
      />
    );
  }

  // Auth Guard: ZERO-BRANCH ONBOARDING GUARD (Part 2 & Part 3)
  // When currentUser.hasBranch === false, DO NOT MOUNT PosProvider, OfflineSyncProvider, Sidebar, Header, or workspace!
  // Render Branch Management ONLY.
  if (currentUser && currentUser.hasBranch === false) {
    return (
      <View style={styles.appContainer}>
        <View style={styles.mainWrapper}>
          {/* Dedicated Onboarding Header */}
          <View style={styles.onboardingHeader}>
            <View style={styles.onboardingBrandRow}>
              <View style={styles.onboardingIconCircle}>
                <Text style={styles.onboardingIconText}>Rx</Text>
              </View>
              <View>
                <Text style={styles.onboardingTitle}>
                  {currentUser.organisationName ||
                    currentUser.name ||
                    "PharmaFlow ERP"}
                </Text>
                <Text style={styles.onboardingSubtitle}>
                  Initial Setup — Create Your Pharmacy's First Branch
                </Text>
              </View>
            </View>
            <Pressable
              onPress={handleSignOut}
              style={styles.onboardingSignOutBtn}
            >
              <Text style={styles.onboardingSignOutText}>Sign Out</Text>
            </Pressable>
          </View>

          {/* Toast Notification */}
          {toastMessage ? (
            <View style={styles.toastBanner}>
              <View style={styles.toastDot} />
              <Text style={styles.toastText}>{toastMessage}</Text>
            </View>
          ) : null}

          {/* Standalone Branch Management */}
          <View style={styles.screenContainer}>
            <BranchesScreen
              onNavigate={handleNavigate}
              onShowToast={showToast}
              isMultiBranch={isMultiBranch}
              currentUser={currentUser}
              isStandaloneOnboarding={true}
              onBranchesUpdated={async () => {
                handleBranchesUpdated();
                const {
                  data: { session },
                } = await supabase.auth.getSession();
                if (session) {
                  await restoreAuthSession(session);
                }
              }}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <OfflineSyncProvider>
      <PosProvider currentUser={currentUser} selectedBranch={selectedBranch}>
        <View style={styles.appContainer}>
          {/* 1. Fixed Left Sidebar for Desktop */}
          {!isMobile && (
            <Sidebar
              activeItem={currentRoute}
              onNavigate={handleNavigate}
              isMultiBranch={isMultiBranch}
              currentUser={currentUser}
            />
          )}

          {/* Mobile Drawer Navigation Modal (Positioned on Left) */}
          {isMobile && (
            <Modal
              visible={mobileMenuOpen}
              animationType="fade"
              transparent={true}
              onRequestClose={() => setMobileMenuOpen(false)}
            >
              <View style={styles.mobileDrawerOverlay}>
                <View style={styles.mobileDrawerContent}>
                  <View style={styles.mobileDrawerHeader}>
                    <View style={styles.drawerBrandRow}>
                      <View style={styles.drawerBrandIcon}>
                        <Text style={styles.drawerBrandIconText}>Rx</Text>
                      </View>
                      <Text style={styles.mobileDrawerTitle}>
                        PharmaFlow ERP
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setMobileMenuOpen(false)}
                      style={styles.mobileCloseButton}
                      accessibilityRole="button"
                      accessibilityLabel="Close navigation menu"
                    >
                      <Text style={styles.mobileCloseText}>✕</Text>
                    </Pressable>
                  </View>
                  <Sidebar
                    activeItem={currentRoute}
                    onNavigate={handleNavigate}
                    isMultiBranch={isMultiBranch}
                    isMobile={true}
                    currentUser={currentUser}
                  />
                </View>
                <Pressable
                  style={styles.mobileDrawerBackdrop}
                  onPress={() => setMobileMenuOpen(false)}
                  accessibilityLabel="Dismiss menu"
                />
              </View>
            </Modal>
          )}

          {/* 2. Main Application Wrapper */}
          <View style={styles.mainWrapper}>
            {/* Top Header with Multi/Single Branch Mode */}
            <Header
              currentBranch={selectedBranch}
              onBranchChange={(b) => {
                const branchObj =
                  typeof b === "string" ? { id: null, name: b } : b;
                setSelectedBranch(branchObj);
                if (typeof syncEngine?.setActiveBranch === "function") {
                  syncEngine.setActiveBranch(branchObj?.id || branchObj?.name);
                }
                showToast(`Switched active branch to ${branchObj?.name || b}`);
              }}
              isMultiBranch={isMultiBranch}
              onTogglePharmacyMode={handleTogglePharmacyMode}
              onSetPharmacyMode={handleSetPharmacyMode}
              currentUser={currentUser}
              onSignOut={handleSignOut}
              syncStatus="online"
              isMobile={isMobile}
              onToggleMobileMenu={() => setMobileMenuOpen(true)}
              onNavigate={handleNavigate}
              branchRefreshKey={branchRefreshKey}
            />

            {/* Global Action Feedback Toast */}
            {toastMessage ? (
              <View style={styles.toastBanner}>
                <View style={styles.toastDot} />
                <Text style={styles.toastText}>{toastMessage}</Text>
              </View>
            ) : null}

            {/* Dynamic Screen View */}
            <View style={styles.screenContainer}>{renderScreen()}</View>
          </View>
        </View>
      </PosProvider>
    </OfflineSyncProvider>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#F8FAFC",
    ...Platform.select({
      web: {
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
      },
    }),
  },
  mainWrapper: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: "#F8FAFC",
    height: "100%",
  },
  toastBanner: {
    backgroundColor: "#F0FDFA",
    borderBottomWidth: 1,
    borderBottomColor: "#99F6E4",
    paddingVertical: 9,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    ...Platform.select({
      web: {
        transition: "opacity 0.2s ease-in-out",
      },
    }),
  },
  toastDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#0F766E",
  },
  toastText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F766E",
  },
  screenContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  mobileDrawerOverlay: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(15, 23, 42, 0.5)",
  },
  mobileDrawerBackdrop: {
    flex: 1,
  },
  mobileDrawerContent: {
    width: 290,
    maxWidth: "82%",
    backgroundColor: "#FFFFFF",
    height: "100%",
    flexDirection: "column",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  mobileDrawerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#0D9488",
    backgroundColor: "#0F766E",
  },
  drawerBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  drawerBrandIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#14B8A6",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerBrandIconText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  mobileDrawerTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  mobileCloseButton: {
    padding: 6,
  },
  mobileCloseText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  onboardingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: "#0F766E",
    borderBottomWidth: 1,
    borderBottomColor: "#0D9488",
  },
  onboardingBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  onboardingIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#14B8A6",
    alignItems: "center",
    justifyContent: "center",
  },
  onboardingIconText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  onboardingTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  onboardingSubtitle: {
    color: "#CCFBF1",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  onboardingSignOutBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  onboardingSignOutText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
});
