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

// 8. Isolated Dedicated Supplier Portal
import SupplierPortalScreen from "../screens/supplier/SupplierPortalScreen";

const ROUTE_PERMISSIONS = {
  "tax-settings": "tax-settings:view",
  "subscription-plans": "subscription:view",
  roles: "roles:manage",
  "roles-permissions": "permissions:manage",
  "page-permissions": "permissions:manage",
  users: "users:manage",
  "audit-log": "audit:view",
};

const ERP_ROUTE_KEYS = new Set([
  "dashboard",
  "sales",
  "new-sale",
  "pos-billing",
  "cash-register",
  "cashier",
  "held-bills",
  "sales-returns",
  "returns",
  "stock-adjustments",
  "stock-transfer",
  "stock-status",
  "inventory",
  "low-stock-expiry",
  "current-stock",
  "purchases",
  "goods-receiving",
  "suppliers",
  "customers",
  "customers-patients",
  "add-customer",
  "customer-details",
  "customer-ledger",
  "customer-payments",
  "branches",
  "users",
  "roles",
  "roles-permissions",
  "page-permissions",
  "audit-log",
  "inventory-reports",
  "purchase-reports",
  "expiry-reports",
  "tax-settings",
  "subscription-plans",
]);

const ERP_ROUTE_PATHS = {
  dashboard: "/dashboard",
  sales: "/sales",
  "new-sale": "/sales/new-sale",
  "pos-billing": "/sales/pos-billing",
  "held-bills": "/sales/held-bills",
  "sales-returns": "/sales/returns",
  returns: "/sales/returns",
  "cash-register": "/cashier/cash-register",
  cashier: "/cashier",
  inventory: "/inventory",
  "stock-adjustments": "/inventory/stock-adjustments",
  "stock-transfer": "/inventory/stock-transfer",
  "stock-status": "/inventory/stock-status",
  "low-stock-expiry": "/inventory/low-stock-expiry",
  "current-stock": "/inventory/current-stock",
  purchases: "/purchases",
  "goods-receiving": "/purchases/goods-receiving",
  suppliers: "/purchases/suppliers",
  customers: "/customers",
  "customers-patients": "/customers/patients",
  "add-customer": "/customers/add",
  "customer-details": "/customers/details",
  "customer-ledger": "/customers/ledger",
  "customer-payments": "/customers/payments",
  branches: "/management/branches",
  users: "/management/users",
  roles: "/management/roles",
  "roles-permissions": "/management/roles-permissions",
  "page-permissions": "/management/page-permissions",
  "audit-log": "/management/audit-log",
  "inventory-reports": "/reports/inventory",
  "purchase-reports": "/reports/purchases",
  "expiry-reports": "/reports/expiry",
  "tax-settings": "/settings/tax",
  "subscription-plans": "/settings/subscription-plans",
};

const ERP_PATH_ROUTES = Object.entries(ERP_ROUTE_PATHS).reduce(
  (routes, [routeKey, path]) => {
    routes[path] = routeKey;
    return routes;
  },
  {},
);

function getRouteFromLocation() {
  if (typeof window === "undefined") return "dashboard";
  if (window.location.pathname.startsWith("/superadmin")) return "dashboard";

  const path = `/${window.location.pathname.replace(/^\/+|\/+$/g, "")}`;
  if (ERP_PATH_ROUTES[path]) return ERP_PATH_ROUTES[path];

  const routeKey = path.split("/")[1];
  return ERP_ROUTE_KEYS.has(routeKey) ? routeKey : "dashboard";
}

function updateErpLocation(routeKey, payload) {
  if (typeof window === "undefined" || !window.history) return;
  if (window.location.pathname.startsWith("/superadmin")) return;

  const params = payload
    ? new URLSearchParams({ customerId: String(payload) })
    : "";
  const query = params.toString();
  const url = `${ERP_ROUTE_PATHS[routeKey] || `/${routeKey}`}${
    query ? `?${query}` : ""
  }`;
  window.history.pushState({ routeKey, payload }, "", url);
}

function updateBrowserRoute(routeKey, replace = false) {
  if (
    typeof window === "undefined" ||
    !ERP_ROUTE_KEYS.has(routeKey) ||
    window.location.pathname.startsWith("/superadmin")
  ) {
    return;
  }

  const nextPath = ERP_ROUTE_PATHS[routeKey] || `/${routeKey}`;
  if (window.location.pathname !== nextPath) {
    const method = replace ? "replaceState" : "pushState";
    window.history[method]({}, "", nextPath);
  }
}

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
  const [currentRoute, setCurrentRoute] = useState(getRouteFromLocation);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [branchRefreshKey, setBranchRefreshKey] = useState(0);

  const handleBranchesUpdated = (createdBranch) => {
    setBranchRefreshKey((prev) => prev + 1);
    if (createdBranch && createdBranch.name) {
      setSelectedBranch(createdBranch);
      if (typeof syncEngine?.setActiveBranch === "function") {
        syncEngine.setActiveBranch(createdBranch.id || createdBranch.name);
      }
      showToast(`Switched active branch to newly added branch: ${createdBranch.name}`);
    }
  };

  // 3-state Auth Lifecycle: 'INITIALIZING' | 'AUTHENTICATED' | 'UNAUTHENTICATED' | 'AUTHENTICATED_INCOMPLETE_ONBOARDING'
  const [authStatus, setAuthStatus] = useState("INITIALIZING");
  const [currentUser, setCurrentUser] = useState(null);
  const [googleOnboardingData, setGoogleOnboardingData] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleBrowserNavigation = () => {
      setCurrentRoute(getRouteFromLocation());
    };

    window.addEventListener("popstate", handleBrowserNavigation);
    updateBrowserRoute(currentRoute, true);

    return () => {
      window.removeEventListener("popstate", handleBrowserNavigation);
    };
  }, []);

  const restoreAuthSession = async (session) => {
    if (!session?.access_token) {
      setCurrentUser(null);
      setGoogleOnboardingData(null);
      setAuthStatus("UNAUTHENTICATED");
      return;
    }

    let authIntent = null;
    let urlPharmacyMode = null;
    if (typeof window !== "undefined") {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        authIntent =
          urlParams.get("auth_intent") ||
          window.sessionStorage?.getItem("pharmaflow_auth_intent");
        urlPharmacyMode =
          urlParams.get("pharmacy_mode") ||
          window.sessionStorage?.getItem("pharmaflow_pharmacy_mode");
      } catch (e) {}
    }

    try {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const fetchTimeout = controller ? setTimeout(() => controller.abort(), 4000) : null;

      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        signal: controller?.signal,
      });
      if (fetchTimeout) clearTimeout(fetchTimeout);

      if (response.status === 403) {
        const errJson = await response.json().catch(() => ({}));
        if (errJson.code === "ACCOUNT_DEACTIVATED") {
          await supabase.auth.signOut().catch(() => {});
          await clearAuthSession();
          setCurrentUser(null);
          setGoogleOnboardingData(null);
          setAuthStatus("UNAUTHENTICATED");
          setAuthError(errJson.message || "Your account has been deactivated. Please contact your pharmacy administrator.");
          return;
        }
      }

      if (response.ok) {
        const resData = await response.json();
        const user = resData.data?.user || resData.user;

        // Platform Super Admin Guard: Divert directly to Super Admin Razorpay portal
        if (
          user?.isPlatformSuperadmin ||
          user?.is_platform_superadmin ||
          user?.role === "SUPERADMIN" ||
          user?.email === "superadmin@pharmaflow.com"
        ) {
          if (typeof window !== "undefined") {
            window.location.href = "/superadmin/razorpay-payment";
          }
          return;
        }

        const userWithToken = user
          ? { ...user, token: session.access_token }
          : null;
        setCurrentUser(userWithToken);
        setGoogleOnboardingData(null);
        setAuthError("");
        setAuthSession({ organisationId: user?.organisationId, token: session.access_token });
        if (typeof window !== "undefined" && userWithToken) {
          window.localStorage?.setItem("cachedAuthUser", JSON.stringify(userWithToken));
        }

        // Synchronize pharmacyMode authoritatively from user/org record
        const userMode =
          user?.pharmacyMode ||
          (typeof window !== "undefined"
            ? window.localStorage?.getItem("pharmacyMode")
            : null) ||
          "single";
        const isMulti = userMode === "multi";
        setIsMultiBranch(isMulti);
        if (typeof window !== "undefined") {
          window.localStorage?.setItem("pharmacyMode", isMulti ? "multi" : "single");
        }

        if (user?.role === "SUPPLIER") {
          setCurrentRoute("supplier-portal");
          setSelectedBranch(null);
          setAuthStatus("AUTHENTICATED");
          return;
        }

        const isAdmin = Boolean(
          user?.isOwner ||
          user?.isPlatformSuperadmin ||
          user?.is_platform_superadmin ||
          (user?.role || "").toUpperCase() === "OWNER" ||
          (user?.role || "").toUpperCase() === "ADMIN" ||
          (user?.role || "").toUpperCase() === "SUPERADMIN" ||
          (user?.role || "").toLowerCase().includes("admin") ||
          (user?.role || "").toLowerCase().includes("owner")
        );

        if (user && user.hasBranch === false && isMulti) {
          setCurrentRoute("branches");
          updateBrowserRoute("branches", true);
          setSelectedBranch(null);
        } else if (user) {
          if (!isMulti) {
            // Single store: pin directly to their store
            setSelectedBranch(
              user.branch || (user.branchId ? { id: user.branchId, name: user.branchName || "Main Store" } : { id: "main", name: user.organisationName || "Main Store" }),
            );
          } else if (isAdmin) {
            // Admin can see all branches and defaults to "All Branches"
            setSelectedBranch(null);
          } else {
            // Non-admin branch staff member MUST be pinned to their own branch
            const assignedBranch =
              user.branch ||
              (user.branchId
                ? {
                    id: user.branchId,
                    name: user.branchName || "Assigned Branch",
                  }
                : null);
            setSelectedBranch(assignedBranch);
            if (assignedBranch && typeof syncEngine?.setActiveBranch === "function") {
              syncEngine.setActiveBranch(assignedBranch.id || assignedBranch.name);
            }
          }
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

      // If user not found in PostgreSQL (401 / 404):
      // Automatically onboard them immediately using Google OAuth profile and redirect straight to dashboard!
      const gName =
        session.user?.user_metadata?.full_name ||
        session.user?.user_metadata?.name ||
        "Pharmacy Owner";
      const gEmail = session.user?.email || "";
      let chosenMode = "single";
      let chosenPharmacyName = "";
      if (typeof window !== "undefined") {
        chosenMode =
          urlPharmacyMode ||
          window.sessionStorage?.getItem("pharmaflow_pharmacy_mode") ||
          window.localStorage?.getItem("pharmacyMode") ||
          "single";
        chosenPharmacyName =
          window.sessionStorage?.getItem("pharmaflow_pharmacy_name") || "";
      }

      try {
        const onboardRes = await fetch(`${API_URL}/api/auth/google-onboard`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: session.access_token,
            adminName: gName,
            name: gName,
            email: gEmail,
            pharmacyName: chosenPharmacyName || `${gName}'s Pharmacy`,
            pharmacyMode: chosenMode,
            branchName: chosenMode === "multi" ? "Main Branch" : "Main Store",
            createInitialBranch: true,
          }),
        });

        const obData = await onboardRes.json().catch(() => ({}));
        if (onboardRes.ok && obData.success && obData.user) {
          const newUser = obData.user;
          const userWithToken = { ...newUser, token: session.access_token };
          setCurrentUser(userWithToken);
          setGoogleOnboardingData(null);
          setAuthError("");
          setAuthSession({ organisationId: newUser.organisationId, token: session.access_token });

          const isNewMulti = newUser.pharmacyMode === "multi" || chosenMode === "multi";
          setIsMultiBranch(isNewMulti);
          if (typeof window !== "undefined") {
            window.localStorage?.setItem("pharmacyMode", isNewMulti ? "multi" : "single");
          }

          if (isNewMulti) {
            setSelectedBranch(null); // All Branches for multi-branch admin
          } else {
            setSelectedBranch(
              newUser.branch || { id: newUser.branchId || "main", name: newUser.branchName || "Main Store" }
            );
          }

          setCurrentRoute("dashboard");
          updateBrowserRoute("dashboard", true);
          setAuthStatus("AUTHENTICATED");
          showToast(`Welcome, ${newUser.name}! Your pharmacy workspace is ready.`);

          if (typeof window !== "undefined") {
            try {
              window.sessionStorage?.removeItem("pharmaflow_auth_intent");
              window.sessionStorage?.removeItem("pharmaflow_pharmacy_name");
              if (window.history && window.location.search) {
                window.history.replaceState({}, document.title, window.location.pathname);
              }
            } catch (e) {}
          }
          return;
        }
      } catch (onboardErr) {
        console.warn("Auto Google onboard error:", onboardErr.message);
      }

      // Fallback only if auto-onboarding network request failed
      if (authIntent === "signup") {
        setGoogleOnboardingData({
          token: session.access_token,
          email: session.user?.email || "",
          name: gName,
        });
        setAuthStatus("AUTHENTICATED_INCOMPLETE_ONBOARDING");
        return;
      }

      // Check if we have an offline cached session before signing out
      if (typeof window !== "undefined") {
        try {
          const cachedStr = window.localStorage?.getItem("cachedAuthUser");
          if (cachedStr) {
            const cachedUser = JSON.parse(cachedStr);
            if (cachedUser && cachedUser.id) {
              setCurrentUser({ ...cachedUser, isOffline: true });
              setAuthStatus("AUTHENTICATED");
              return;
            }
          }
        } catch (cacheErr) {}
      }

      await supabase.auth.signOut();
      await clearAuthSession();
      setCurrentUser(null);
      setGoogleOnboardingData(null);
      setAuthStatus("UNAUTHENTICATED");

      if (authIntent === "login") {
        setAuthError(
          "Could not initialize pharmacy account for this Google ID. Please try again.",
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
      if (typeof window !== "undefined") {
        try {
          const cachedStr = window.localStorage?.getItem("cachedAuthUser");
          if (cachedStr) {
            const cachedUser = JSON.parse(cachedStr);
            if (cachedUser && cachedUser.id) {
              setCurrentUser({ ...cachedUser, isOffline: true });
              setAuthStatus("AUTHENTICATED");
              return;
            }
          }
        } catch (cacheErr) {}
      }
      setAuthStatus("UNAUTHENTICATED");
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Safety timeout: If Supabase getSession or network is slow/unresponsive,
    // don't leave the user stuck on "Loading workspace..." or blank screen!
    const initTimeout = setTimeout(() => {
      if (isMounted) {
        setAuthStatus((prev) => {
          if (prev === "INITIALIZING") {
            const localToken =
              typeof window !== "undefined"
                ? window.localStorage?.getItem("authToken")
                : null;
            if (localToken) {
              restoreAuthSession({ access_token: localToken });
              return prev;
            }
            return "UNAUTHENTICATED";
          }
          return prev;
        });
      }
    }, 2000);

    // 1. Initial check on mount
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (isMounted) {
          const localToken =
            typeof window !== "undefined"
              ? window.localStorage?.getItem("authToken")
              : null;
          const effectiveSession =
            data?.session ||
            (localToken ? { access_token: localToken } : null);
          restoreAuthSession(effectiveSession);
        }
      })
      .catch((err) => {
        console.warn("Supabase getSession failed:", err);
        if (isMounted) {
          const localToken =
            typeof window !== "undefined"
              ? window.localStorage?.getItem("authToken")
              : null;
          if (localToken) {
            restoreAuthSession({ access_token: localToken });
          } else {
            setAuthStatus("UNAUTHENTICATED");
          }
        }
      });

    // 2. Real-time auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        restoreAuthSession(session);
      } else if (event === "SIGNED_OUT") {
        setCurrentUser(null);
        setAuthStatus("UNAUTHENTICATED");
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(initTimeout);
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleBrowserNavigation = () => {
      const routeKey = getRouteFromLocation();
      const customerId =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("customerId")
          : null;
      setCurrentRoute(routeKey);
      setSelectedCustomerId(customerId);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("popstate", handleBrowserNavigation);
      if (window.location.pathname === "/" || window.location.pathname === "") {
        window.history.replaceState(
          { routeKey: "dashboard" },
          "",
          "/dashboard",
        );
      }
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("popstate", handleBrowserNavigation);
      }
    };
  }, []);

  // Pharmacy Architecture Mode: Multi-Branch (true) vs Single-Shop (false)
  const [isMultiBranch, setIsMultiBranch] = useState(() => {
    if (typeof window !== "undefined") {
      const mode = window.localStorage?.getItem("pharmacyMode");
      if (mode === "single") return false;
      if (mode === "multi") return true;
    }
    return true;
  });

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage("");
    }, 4000);
  };

  const handleNavigate = (routeKey, payload) => {
    // Admin-only route guard
    const ADMIN_ONLY_ROUTES = new Set([
      "tax-settings",
      "subscription-plans",
      "roles",
      "roles-permissions",
      "page-permissions",
      "audit-log",
    ]);

    const roleName = (currentUser?.role || "").toLowerCase();
    const accessLevel = (currentUser?.accessLevel || "").toLowerCase();
    const isUserAdmin =
      !currentUser ||
      Boolean(currentUser?.isOwner) ||
      Boolean(currentUser?.isPlatformSuperadmin) ||
      Boolean(currentUser?.is_platform_superadmin) ||
      roleName.includes("owner") ||
      roleName.includes("admin") ||
      accessLevel.includes("owner") ||
      accessLevel.includes("admin");

    if (ADMIN_ONLY_ROUTES.has(routeKey) && currentUser && !isUserAdmin) {
      showToast("Access restricted: Pharmacy Admin / Owner privileges required.");
      return;
    }

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

    // Single-store isolation: branches and stock-transfer cannot be accessed in Single Shop mode
    if (!isMultiBranch && (routeKey === "branches" || routeKey === "stock-transfer")) {
      showToast("Branch management and stock transfers are only available in Multi-Branch mode.");
      setCurrentRoute("dashboard");
      updateBrowserRoute("dashboard", true);
      setMobileMenuOpen(false);
      return;
    }

    const isSingleShopMode = !isMultiBranch;

    if (
      !isSingleShopMode &&
      currentUser?.hasBranch === false &&
      (branchRequiredRoutes.includes(routeKey) || routeKey !== "branches")
    ) {
      showToast("Please create your initial pharmacy branch first.");
      setCurrentRoute("branches");
      updateBrowserRoute("branches", true);
      setMobileMenuOpen(false);
      return;
    }

    updateErpLocation(routeKey, payload);
    setSelectedCustomerId(payload || null);
    setCurrentRoute(routeKey);
    updateBrowserRoute(routeKey);
    setMobileMenuOpen(false);
  };

  const handleTogglePharmacyMode = () => {
    handleSetPharmacyMode(!isMultiBranch);
  };

  const handleSetPharmacyMode = (multi) => {
    if (multi === isMultiBranch) return;
    setIsMultiBranch(multi);
    if (typeof window !== "undefined") {
      window.localStorage?.setItem("pharmacyMode", multi ? "multi" : "single");
    }
    if (!multi && currentRoute === "stock-transfer") {
      setCurrentRoute("stock-adjustments");
      updateBrowserRoute("stock-adjustments", true);
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
    if (
      currentUser?.isPlatformSuperadmin ||
      currentUser?.is_platform_superadmin ||
      currentUser?.role === "SUPERADMIN" ||
      currentUser?.email === "superadmin@pharmaflow.com"
    ) {
      if (typeof window !== "undefined") {
        window.location.href = "/superadmin/razorpay-payment";
      }
      return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color="#A66D86" />
          <Text style={{ marginTop: 12, fontSize: 14, color: "#77717A" }}>
            Redirecting to Super Admin Razorpay Portal...
          </Text>
        </View>
      );
    }

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
            selectedCustomerId={selectedCustomerId}
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
            currentUser={currentUser}
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
            currentUser={currentUser}
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
            initialSearchQuery={selectedCustomerId}
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
            currentUser={currentUser}
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
          backgroundColor: "#EAF2EE",
        }}
      >
        <ActivityIndicator size="large" color="#B9829A" />
        <Text
          style={{
            marginTop: 14,
            color: "#77717A",
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          Loading workspace...
        </Text>
      </View>
    );
  }

  // Auth Guard: If Super Admin is logged in, redirect directly to Razorpay portal
  if (
    currentUser?.isPlatformSuperadmin ||
    currentUser?.is_platform_superadmin ||
    currentUser?.role === "SUPERADMIN" ||
    currentUser?.email === "superadmin@pharmaflow.com"
  ) {
    if (typeof window !== "undefined") {
      window.location.href = "/superadmin/razorpay-payment";
    }
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#28242B",
        }}
      >
        <ActivityIndicator size="large" color="#A66D86" />
        <Text
          style={{
            marginTop: 14,
            color: "#77717A",
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          Redirecting to Super Admin Razorpay Portal...
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
          if (
            user?.isPlatformSuperadmin ||
            user?.is_platform_superadmin ||
            user?.role === "SUPERADMIN" ||
            user?.email === "superadmin@pharmaflow.com"
          ) {
            if (typeof window !== "undefined") {
              window.location.href = "/superadmin/razorpay-payment";
            }
            return;
          }
          const activeToken = token || user?.token;
          setAuthSession({ organisationId: user?.organisationId, token: activeToken });
          if (typeof window !== "undefined") {
            if (activeToken) window.localStorage?.setItem("authToken", activeToken);
            if (user?.organisationId) window.localStorage?.setItem("organisationId", user.organisationId);
          }
          setCurrentUser(
            user ? { ...user, token: activeToken } : null,
          );
          setGoogleOnboardingData(null);
          setAuthError("");
          setAuthStatus("AUTHENTICATED");
          const userMode =
            user?.pharmacyMode ||
            (typeof window !== "undefined"
              ? window.localStorage?.getItem("pharmacyMode")
              : null) ||
            "single";
          const isUserMulti = userMode === "multi";
          setIsMultiBranch(isUserMulti);
          if (typeof window !== "undefined") {
            window.localStorage?.setItem("pharmacyMode", isUserMulti ? "multi" : "single");
          }

          const isUserAdmin = Boolean(
            user?.isOwner ||
            user?.isPlatformSuperadmin ||
            user?.is_platform_superadmin ||
            (user?.role || "").toUpperCase() === "OWNER" ||
            (user?.role || "").toUpperCase() === "ADMIN" ||
            (user?.role || "").toUpperCase() === "SUPERADMIN" ||
            (user?.role || "").toLowerCase().includes("admin") ||
            (user?.role || "").toLowerCase().includes("owner")
          );

          const isSingleShopMode = !isUserMulti;

          if (user?.role === "SUPPLIER") {
            setCurrentRoute("supplier-portal");
            setSelectedBranch(null);
          } else if (user && user.hasBranch === false && !isSingleShopMode) {
            setCurrentRoute("branches");
            updateBrowserRoute("branches", true);
            setSelectedBranch(null);
          } else if (isSingleShopMode) {
            setSelectedBranch(
              user?.branch || { id: user?.branchId || "main", name: "Main Store" },
            );
            setCurrentRoute("dashboard");
            updateBrowserRoute("dashboard", true);
          } else if (isUserAdmin) {
            // Admin defaults to All Branches
            setSelectedBranch(null);
            setCurrentRoute("dashboard");
            updateBrowserRoute("dashboard", true);
          } else {
            // Non-admin branch staff member: Pin strictly to assigned branch!
            const assignedBranch =
              user.branch ||
              (user.branchId
                ? {
                    id: user.branchId,
                    name: user.branchName || "My Branch",
                  }
                : null);
            setSelectedBranch(assignedBranch);
            if (assignedBranch && typeof syncEngine?.setActiveBranch === "function") {
              syncEngine.setActiveBranch(assignedBranch.id || assignedBranch.name);
            }
            setCurrentRoute("dashboard");
            updateBrowserRoute("dashboard", true);
          }
          showToast(`Welcome back, ${user.display_name || user.name}!`);
        }}
      />
    );
  }

  // Auth Guard: SUPPLIER PORTAL (Dedicated isolated portal for medicine suppliers)
  if (currentUser?.role === "SUPPLIER") {
    return (
      <View
        style={[
          styles.appContainer,
          isMobile && styles.appContainerMobile,
        ]}
      >
        <SupplierPortalScreen
          currentUser={currentUser}
          onSignOut={handleSignOut}
        />
      </View>
    );
  }

  // Auth Guard: ZERO-BRANCH ONBOARDING GUARD (Part 2 & Part 3)
  // When currentUser.hasBranch === false, DO NOT MOUNT PosProvider, OfflineSyncProvider, Sidebar, Header, or workspace!
  // Render Branch Management ONLY for multi-branch mode. Single-shop users go straight to workspace.
  const isSingleShopUser =
    !isMultiBranch ||
    (typeof window !== "undefined" &&
      window.localStorage?.getItem("pharmacyMode") === "single");

  if (currentUser && currentUser.hasBranch === false && !isSingleShopUser) {
    return (
      <View
        style={[
          styles.appContainer,
          isMobile && styles.appContainerMobile,
        ]}
      >
        <View style={styles.mainWrapper}>
          {/* Dedicated Onboarding Header */}
          <View
            style={[
              styles.onboardingHeader,
              isMobile && styles.onboardingHeaderMobile,
            ]}
          >
            <View
              style={[
                styles.onboardingBrandRow,
                isMobile && styles.onboardingBrandRowMobile,
              ]}
            >
              <View style={styles.onboardingIconCircle}>
                <Text style={styles.onboardingIconText}>Rx</Text>
              </View>
              <View style={isMobile && styles.onboardingBrandTextMobile}>
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
        <View
          style={[
            styles.appContainer,
            isMobile && styles.appContainerMobile,
          ]}
        >
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
    backgroundColor: "#F8F5F7",
    ...Platform.select({
      web: {
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
      },
    }),
  },
  appContainerMobile: {
    width: "100%",
    minWidth: 0,
    flexDirection: "column",
  },
  mainWrapper: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: "#F8F5F7",
    height: "100%",
    minWidth: 0,
  },
  toastBanner: {
    backgroundColor: "#E8D5DD",
    borderBottomWidth: 1,
    borderBottomColor: "#E8D5DD",
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
    backgroundColor: "#B9829A",
  },
  toastText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#B9829A",
  },
  screenContainer: {
    flex: 1,
    backgroundColor: "#F8F5F7",
    minWidth: 0,
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
    shadowColor: "#28242B",
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
    borderBottomColor: "#A66D86",
    backgroundColor: "#B9829A",
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
    backgroundColor: "#A66D86",
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
    backgroundColor: "#B9829A",
    borderBottomWidth: 1,
    borderBottomColor: "#A66D86",
  },
  onboardingHeaderMobile: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    flexWrap: "wrap",
  },
  onboardingBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  onboardingBrandRowMobile: {
    minWidth: 0,
    gap: 8,
    flex: 1,
  },
  onboardingBrandTextMobile: {
    minWidth: 0,
    flexShrink: 1,
  },
  onboardingIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#A66D86",
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
    color: "#E8D5DD",
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
