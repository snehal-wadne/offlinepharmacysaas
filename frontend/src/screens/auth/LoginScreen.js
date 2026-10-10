import React, { useState, useEffect } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  ActivityIndicator,
  Platform,
} from "react-native";
import { API_URL } from "../../config";
import { supabase, signInWithGoogle } from "../../api/supabaseClient";
import {
  saveOfflineCredential,
  verifyOfflineLogin,
  hasOfflineCredential,
  createOfflineSignup,
} from "../../offline/offlineAuth";

export default function LoginScreen({
  onLoginSuccess,
  googleOnboardingData,
  onCancelGoogleOnboarding,
  authError,
  onClearAuthError,
}) {
  // Mode: 'signin' | 'signup'
  const [authMode, setAuthMode] = useState(
    googleOnboardingData ? "signup" : "signin",
  );

  // Architecture Mode: 'single' | 'multi'
  const [pharmacyMode, setPharmacyMode] = useState(() => {
    if (typeof window !== "undefined") {
      return window.localStorage?.getItem("pharmacyMode") || "single";
    }
    return "single";
  });

  useEffect(() => {
    if (authError) {
      setErrorMessage(authError);
    }
  }, [authError]);

  // Sign In States
  const [signInEmail, setSignInEmail] = useState(() => {
    if (typeof window !== "undefined") {
      return window.localStorage?.getItem("lastLoginEmail") || "";
    }
    return "";
  });
  const [signInPassword, setSignInPassword] = useState("");
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Onboarding role toggle: 'PHARMACY' | 'SUPPLIER'
  const [signUpRoleType, setSignUpRoleType] = useState("PHARMACY");

  // Supplier-specific signup fields
  const [supplierCompanyName, setSupplierCompanyName] = useState("");
  const [supplierContactPerson, setSupplierContactPerson] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierCity, setSupplierCity] = useState("");
  const [supplierGstin, setSupplierGstin] = useState("");
  const [supplierCategory, setSupplierCategory] = useState(
    "Medicines & Injections",
  );
  const [supplierPassword, setSupplierPassword] = useState("");
  const [supplierConfirmPassword, setSupplierConfirmPassword] = useState("");
  const [showSupplierPassword, setShowSupplierPassword] = useState(false);

  // Staff-specific signup fields
  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPhone, setStaffPhone] = useState("");
  const [staffRoleTitle, setStaffRoleTitle] = useState("Pharmacist");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffConfirmPassword, setStaffConfirmPassword] = useState("");
  const [showStaffPassword, setShowStaffPassword] = useState(false);
  const [staffPharmacyCode, setStaffPharmacyCode] = useState("");
  const [staffPharmacyName, setStaffPharmacyName] = useState("");
  const [staffBranches, setStaffBranches] = useState([]);
  const [staffBranchId, setStaffBranchId] = useState("");
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);

  // Pharmacy Owner Onboarding (Sign Up) States
  const [signUpPharmacyName, setSignUpPharmacyName] = useState("");
  const [signUpBranchName, setSignUpBranchName] = useState(() => {
    if (typeof window !== "undefined") {
      const mode = window.localStorage?.getItem("pharmacyMode") || "single";
      return mode === "single" ? "Single Store" : "Main Branch";
    }
    return "Main Branch";
  });
  const [signUpAdminName, setSignUpAdminName] = useState(
    googleOnboardingData?.name || "",
  );
  const [signUpEmail, setSignUpEmail] = useState(
    googleOnboardingData?.email || "",
  );
  const [signUpPhone, setSignUpPhone] = useState("");
  const [signUpAddress, setSignUpAddress] = useState("");
  const [signUpCity, setSignUpCity] = useState("");
  const [signUpState, setSignUpState] = useState("");
  const [signUpPincode, setSignUpPincode] = useState("");
  const [signUpGstNumber, setSignUpGstNumber] = useState("");
  const [signUpBusinessType, setSignUpBusinessType] =
    useState("Private Limited");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState("");
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);

  // Sync Google Onboarding details if passed as prop
  useEffect(() => {
    if (googleOnboardingData) {
      setAuthMode("signup");
      if (googleOnboardingData.name) {
        setSignUpAdminName(googleOnboardingData.name);
      }
      if (googleOnboardingData.email) {
        setSignUpEmail(googleOnboardingData.email);
      }
    }
  }, [googleOnboardingData]);

  // UI Feedback States
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const { width } = useWindowDimensions();
  const isDesktop = width >= 860;

  const features = [
    {
      icon: "📈",
      title: "Grow Your Business",
      description: "Real-time insights and reports",
    },
    {
      icon: "📦",
      title: "Manage Inventory",
      description: "Track stock, batches & expiry",
    },
    {
      icon: "⚡",
      title: "Fast Billing",
      description: "Quick checkout & invoice",
    },
    {
      icon: "☁️",
      title: "Offline First",
      description: "Work offline, sync when online",
    },
  ];

  const isValidEmail = (email) => {
    if (!email) return false;
    const trimmed = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(trimmed);
  };

  // Google OAuth Initiator via Supabase
  const handleGoogleAuth = async (overrideMode) => {
    setErrorMessage("");
    setIsLoading(true);
    try {
      const mode = overrideMode || (authMode === "signin" ? "login" : "signup");
      if (typeof window !== "undefined") {
        window.sessionStorage?.setItem("pharmaflow_pharmacy_mode", pharmacyMode || "single");
        if (ownerPharmacyName) {
          window.sessionStorage?.setItem("pharmaflow_pharmacy_name", ownerPharmacyName.trim());
        }
      }
      const { error } = await signInWithGoogle({ mode });
      if (error) {
        setErrorMessage(error.message || "Failed to initiate Google sign-in.");
        setIsLoading(false);
      }
    } catch (err) {
      setIsLoading(false);
      setErrorMessage(err.message || "Google sign-in failed.");
    }
  };

  // Sign In Handler (Authentic Supabase Auth + Authoritative Backend /api/auth/me)
  const handleSignIn = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    const email = signInEmail.trim().toLowerCase();
    if (!email) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    if (!isValidEmail(email)) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    if (!signInPassword) {
      setErrorMessage("Password is required.");
      return;
    }

    setIsLoading(true);

    try {
      let token = null;
      let authUser = null;

      // 1. Primary: Authoritative Backend Authentication
      const isSuperAdminEmail = email === "superadmin@pharmaflow.com";
      const loginUrl = isSuperAdminEmail
        ? `${API_URL}/api/superadmin/auth/login`
        : `${API_URL}/api/auth/login`;

      let backendNetworkFailed = false;

      try {
        const backendRes = await fetch(loginUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: signInPassword }),
        });

        const bData = await backendRes.json().catch(() => ({}));
        if (backendRes.ok && bData.success && bData.token) {
          token = bData.token;
          authUser = bData.user;
        } else if (bData.code === "ACCOUNT_DEACTIVATED" || backendRes.status === 403) {
          setIsLoading(false);
          setErrorMessage(
            bData.error ||
              "Your account has been deactivated. Please contact your pharmacy administrator.",
          );
          return;
        } else if (backendRes.status === 400 || backendRes.status === 401) {
          setIsLoading(false);
          setErrorMessage("Invalid email or password. Please check your credentials.");
          return;
        }
      } catch (netErr) {
        backendNetworkFailed = true;
        console.warn("Backend login network error, trying Supabase fallback:", netErr?.message);
      }

      // 2. Fallback only if backend was unreachable
      if (!token) {
        try {
          const { data: authData, error: authError } =
            await supabase.auth.signInWithPassword({
              email,
              password: signInPassword,
            });

          if (!authError && authData?.session) {
            token = authData.session.access_token;
          }
        } catch (supaErr) {
          console.warn("Direct Supabase login warning:", supaErr.message);
        }
      }

      // Offline: verify email AND password against the locally stored hash
      if (!token && backendNetworkFailed) {
        const offline = await verifyOfflineLogin(email, signInPassword).catch(() => null);
        if (offline) {
          token = offline.token || "offline_token";
          authUser = offline.user;
        } else if (hasOfflineCredential(email)) {
          setIsLoading(false);
          setErrorMessage("Invalid email or password. Please check your credentials.");
          return;
        }
      }

      if (!token) {
        setIsLoading(false);
        if (backendNetworkFailed) {
          setErrorMessage(
            "You're offline and this device has no saved login for this account. Connect to the internet and sign in once to enable offline sign-in."
          );
        } else {
          setErrorMessage("Invalid email or password. Please check your credentials.");
        }
        return;
      }

      // 3. Fetch authoritative user context from backend if not already retrieved
      if (!authUser) {
        try {
          const response = await fetch(`${API_URL}/api/auth/me`, {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          });

          if (response.ok) {
            const resData = await response.json();
            authUser = resData.data?.user || resData.user;
          }
        } catch (meErr) {
          // If offline, use cached user
          if (typeof window !== "undefined") {
            try {
              const cached = JSON.parse(window.localStorage?.getItem("cachedAuthUser") || "null");
              if (cached && cached.email?.toLowerCase() === email.toLowerCase()) {
                authUser = { ...cached, isOffline: true };
              }
            } catch (e) {}
          }
        }
      }

      setIsLoading(false);

      const isSuperAdmin =
        authUser?.isPlatformSuperadmin === true ||
        authUser?.role === "SUPERADMIN" ||
        email === "superadmin@pharmaflow.com";

      // Super Admin Portal Routing: Go directly to Razorpay Payments page
      if (isSuperAdmin) {
        setSuccessMessage("Super Administrator verified. Opening Razorpay Payments portal...");
        if (typeof window !== "undefined") {
          window.localStorage?.setItem("superadminToken", token);
          window.localStorage?.setItem("authToken", token);
          window.location.href = "/superadmin/razorpay-payment";
        }
        return;
      }

      // Regular Pharmacy ERP Routing / Supplier Portal Routing
      if (authUser) {
        if (typeof window !== "undefined") {
          window.localStorage?.setItem("authToken", token);
          window.localStorage?.setItem("cachedAuthUser", JSON.stringify({ ...authUser, token }));
          if (authUser.organisationId) {
            window.localStorage?.setItem("organisationId", authUser.organisationId);
          }
          if (!authUser.isOffline) {
            await saveOfflineCredential(email, signInPassword, authUser, token).catch(() => {});
          }
          if (rememberMe) {
            window.localStorage?.setItem("lastLoginEmail", email);
          }
        }
        if (authUser.role === "SUPPLIER") {
          setSuccessMessage(
            `Welcome, ${authUser.companyName || authUser.name || "Supplier Partner"}! Opening Supplier Portal...`,
          );
        } else {
          setSuccessMessage(
            `Welcome back, ${authUser.name || "Dr. Rajesh Sharma"}! Opening Inventory Dashboard...`,
          );
        }
        if (typeof window !== "undefined") {
          window.localStorage?.setItem("pharmacyMode", pharmacyMode);
        }
        if (onLoginSuccess) {
          onLoginSuccess(authUser, token);
        }
        return;
      }

      await supabase.auth.signOut().catch(() => {});
      setErrorMessage(
        "Failed to load user workspace. Please ensure your account is active.",
      );
    } catch (err) {
      setIsLoading(false);
      const isNetworkError =
        err?.message &&
        (err.message.toLowerCase().includes("failed to fetch") ||
          err.message.toLowerCase().includes("networkerror"));
      if (isNetworkError) {
        setErrorMessage(
          "Unable to connect to backend server. Please verify that the backend API is running on http://localhost:5000."
        );
      } else {
        setErrorMessage("Authentication error: " + (err?.message || "Unknown error"));
      }
    }
  };

  // If a sign-up failed because we're offline, save it locally and let the user in.
  // It is sent to the server automatically once the device is back online.
  const finishOfflineSignup = async (err, payload, message) => {
    const msg = (err?.message || "").toLowerCase();
    const isNetworkError =
      msg.includes("failed to fetch") ||
      msg.includes("networkerror") ||
      msg.includes("network request failed") ||
      (typeof navigator !== "undefined" && navigator.onLine === false);
    if (!isNetworkError) return false;
    try {
      const { user, token } = await createOfflineSignup(payload);
      if (typeof window !== "undefined") {
        window.localStorage?.setItem("authToken", token);
        window.localStorage?.setItem("cachedAuthUser", JSON.stringify({ ...user, token }));
        window.localStorage?.setItem("organisationId", user.organisationId);
        window.localStorage?.setItem("lastLoginEmail", user.email);
        window.localStorage?.setItem("pharmacyMode", pharmacyMode);
      }
      setSuccessMessage(`${message}. It will be registered online automatically when you reconnect.`);
      if (onLoginSuccess) onLoginSuccess(user, token);
    } catch (e) {
      setErrorMessage(e?.message || "Could not create the account offline.");
    }
    return true;
  };

  // Sign Up Handler (Pharmacy Owner Onboarding)
  const handleSignUp = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    const pharmacyName = signUpPharmacyName.trim();
    const adminName = (googleOnboardingData?.name || signUpAdminName).trim();
    const email = (googleOnboardingData?.email || signUpEmail)
      .trim()
      .toLowerCase();
    const phone = signUpPhone.trim();
    const address = signUpAddress.trim();
    const city = signUpCity.trim();
    const state = signUpState.trim();
    const pincode = signUpPincode.trim();
    const gstNumber = signUpGstNumber.trim();
    const businessType = signUpBusinessType.trim() || "Private Limited";

    if (!pharmacyName || pharmacyName.length < 2) {
      setErrorMessage("Please enter pharmacy name.");
      return;
    }

    if (!adminName || adminName.length < 2) {
      setErrorMessage("Please enter Admin Name / Pharmacist in-charge.");
      return;
    }

    if (!email || !isValidEmail(email)) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    if (!phone) {
      setErrorMessage("Please enter phone / mobile number.");
      return;
    }

    if (!address) {
      setErrorMessage("Please enter business address.");
      return;
    }

    if (!city) {
      setErrorMessage("Please enter city.");
      return;
    }

    if (!state) {
      setErrorMessage("Please enter state.");
      return;
    }

    if (!pincode) {
      setErrorMessage("Please enter pincode.");
      return;
    }

    const initialBranchName = (
      signUpBranchName.trim() ||
      (pharmacyMode === "single" ? "Single Store" : "Main Branch")
    ).trim();

    // Google OAuth Onboarding Branch
    if (googleOnboardingData) {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_URL}/api/auth/google-onboard`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${googleOnboardingData.token}`,
          },
          body: JSON.stringify({
            token: googleOnboardingData.token,
            pharmacyName,
            adminName,
            name: adminName,
            ownerName: adminName,
            email,
            phone,
            address,
            city,
            state,
            pincode,
            gstNumber,
            businessType,
            createInitialBranch: true,
            branchName: initialBranchName,
          }),
        });

        const data = await response.json().catch(() => ({}));
        setIsLoading(false);

        if (!response.ok || !data.success) {
          setErrorMessage(
            data.error ||
              "Invalid email or password. Please check your credentials.",
          );
          return;
        }

        if (typeof window !== "undefined") {
          window.localStorage?.setItem("pharmacyMode", pharmacyMode);
        }

        setSuccessMessage(
          "Pharmacy registered successfully! Entering workspace...",
        );
        if (onLoginSuccess) {
          onLoginSuccess(data.user, data.token || googleOnboardingData.token);
        }
      } catch (err) {
        setIsLoading(false);
        setErrorMessage("Onboarding error: " + err.message);
      }
      return;
    }

    // Email/Password Registration Branch
    if (!signUpPassword || signUpPassword.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    if (signUpPassword !== signUpConfirmPassword) {
      setErrorMessage("Passwords do not match. Please re-enter your password.");
      return;
    }

    setIsLoading(true);

    const ownerPayload = {
      pharmacyName,
      adminName,
      name: adminName,
      ownerName: adminName,
      email,
      phone,
      address,
      city,
      state,
      pincode,
      gstNumber,
      businessType,
      createInitialBranch: true,
      branchName: initialBranchName,
      pharmacyMode,
      password: signUpPassword,
    };

    try {
      // 1. Call Backend Pharmacy Owner Onboarding endpoint
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ownerPayload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        setIsLoading(false);
        setErrorMessage(
          data.error || "Failed to register pharmacy store. Please check your credentials.",
        );
        return;
      }

      if (typeof window !== "undefined") {
        window.localStorage?.setItem("pharmacyMode", pharmacyMode);
        window.localStorage?.setItem("lastLoginEmail", email);
      }

      setSuccessMessage(
        pharmacyMode === "single"
          ? "Single shop direct inventory registered successfully! Signing in..."
          : "Pharmacy registered successfully! Signing in...",
      );

      let token = data.token;
      let loggedInUser = data.user;

      if (!token) {
        // Fallback to client-side Supabase Auth
        try {
          const { data: authData, error: authError } =
            await supabase.auth.signInWithPassword({
              email,
              password: signUpPassword,
            });
          if (!authError && authData?.session?.access_token) {
            token = authData.session.access_token;
          }
        } catch (supaErr) {}
      }

      if (token) {
        if (typeof window !== "undefined") {
          window.localStorage?.setItem("authToken", token);
        }

        try {
          const meRes = await fetch(`${API_URL}/api/auth/me`, {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          });
          if (meRes.ok) {
            const meData = await meRes.json();
            loggedInUser = meData.data?.user || meData.user || loggedInUser;
          }
        } catch (meErr) {}

        setIsLoading(false);
        if (onLoginSuccess && loggedInUser) {
          onLoginSuccess(loggedInUser, token);
          return;
        }
      }

      setIsLoading(false);
      setAuthMode("signin");
      setSignInEmail(email);
      setSignInPassword(signUpPassword);
      setSuccessMessage(
        "Pharmacy registered successfully! Please sign in with your credentials.",
      );
    } catch (err) {
      setIsLoading(false);
      if (await finishOfflineSignup(err, ownerPayload, "Pharmacy account saved offline")) return;
      setErrorMessage("Registration error: " + err.message);
    }
  };

  const handleOwnerSignUp = handleSignUp;

  // Supplier / Distributor Registration Handler
  const handleSupplierSignUp = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    const companyName = supplierCompanyName.trim();
    const contactPerson = supplierContactPerson.trim();
    const email = supplierEmail.trim().toLowerCase();
    const phone = supplierPhone.trim();
    const city = supplierCity.trim();
    const gstin = supplierGstin.trim();
    const category = supplierCategory.trim() || "Medicines & Injections";

    if (!companyName || companyName.length < 2) {
      setErrorMessage("Please enter supplier company / distributor name.");
      return;
    }

    if (!email || !isValidEmail(email)) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    if (!phone) {
      setErrorMessage("Please enter mobile / phone number.");
      return;
    }

    if (!supplierPassword || supplierPassword.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    if (supplierPassword !== supplierConfirmPassword) {
      setErrorMessage("Passwords do not match. Please re-enter your password.");
      return;
    }

    setIsLoading(true);

    const supplierPayload = {
      accountType: "SUPPLIER",
      role: "SUPPLIER",
      companyName,
      contactPerson: contactPerson || companyName,
      email,
      phone,
      city: city || "Mumbai",
      gstin: gstin || null,
      category,
      password: supplierPassword,
    };

    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(supplierPayload),
      });

      const data = await response.json().catch(() => ({}));
      setIsLoading(false);

      if (!response.ok || !data.success) {
        setErrorMessage(data.error || "Failed to register supplier account.");
        return;
      }

      if (typeof window !== "undefined") {
        if (data.token) {
          window.localStorage?.setItem("authToken", data.token);
        }
        if (data.user?.organisationId) {
          window.localStorage?.setItem("organisationId", data.user.organisationId);
        }
        window.localStorage?.setItem("lastLoginEmail", email);
      }

      setSuccessMessage(
        "Supplier account registered successfully! Entering Supplier Portal...",
      );
      if (onLoginSuccess && data.user) {
        onLoginSuccess(data.user, data.token);
      }
    } catch (err) {
      setIsLoading(false);
      if (await finishOfflineSignup(err, supplierPayload, "Supplier account saved offline")) return;
      setErrorMessage("Supplier registration error: " + (err?.message || "Unknown error"));
    }
  };

  // Look up the branches of the pharmacy a staff member is joining (by pharmacy code)
  const handleLoadStaffBranches = async () => {
    const code = staffPharmacyCode.trim();
    setErrorMessage("");
    setStaffBranches([]);
    setStaffBranchId("");
    setStaffPharmacyName("");
    if (!code) {
      setErrorMessage("Please enter your pharmacy code.");
      return;
    }
    setIsLoadingBranches(true);
    try {
      const res = await fetch(
        `${API_URL}/api/auth/pharmacy-branches?code=${encodeURIComponent(code)}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Could not find that pharmacy.");
      } else {
        setStaffPharmacyName(data.pharmacyName || "");
        setStaffBranches(data.branches || []);
        if ((data.branches || []).length === 1) setStaffBranchId(data.branches[0].id);
        if (!(data.branches || []).length) {
          setErrorMessage("This pharmacy has no active branch yet. Ask your administrator to add one.");
        }
      }
    } catch (e) {
      setErrorMessage(
        "Can't load branches while offline. Connect to the internet to choose your branch.",
      );
    }
    setIsLoadingBranches(false);
  };

  // Staff Member Registration Handler
  const handleStaffSignUp = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    const name = staffName.trim();
    const email = staffEmail.trim().toLowerCase();
    const phone = staffPhone.trim();
    const roleTitle = staffRoleTitle.trim() || "Pharmacist";

    if (!name || name.length < 2) {
      setErrorMessage("Please enter your full name.");
      return;
    }
    if (!email || !isValidEmail(email)) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    if (!phone) {
      setErrorMessage("Please enter your mobile / phone number.");
      return;
    }
    if (!staffPharmacyCode.trim()) {
      setErrorMessage("Please enter your pharmacy code.");
      return;
    }
    if (staffBranches.length > 0 && !staffBranchId) {
      setErrorMessage("Please select the branch you work at.");
      return;
    }
    if (!staffPassword || staffPassword.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }
    if (staffPassword !== staffConfirmPassword) {
      setErrorMessage("Passwords do not match. Please re-enter your password.");
      return;
    }

    setIsLoading(true);

    const staffPayload = {
      accountType: "STAFF",
      role: "STAFF",
      name,
      email,
      phone,
      staffRole: roleTitle,
      pharmacyCode: staffPharmacyCode.trim(),
      branchId: staffBranchId || undefined,
      password: staffPassword,
    };

    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(staffPayload),
      });

      const data = await response.json().catch(() => ({}));
      setIsLoading(false);

      if (!response.ok || !data.success) {
        setErrorMessage(data.error || "Failed to register staff account.");
        return;
      }

      if (typeof window !== "undefined") {
        if (data.token) {
          window.localStorage?.setItem("authToken", data.token);
        }
        if (data.user?.organisationId) {
          window.localStorage?.setItem("organisationId", data.user.organisationId);
        }
        window.localStorage?.setItem("lastLoginEmail", email);
      }

      setSuccessMessage(
        "Staff account registered successfully! Signing in...",
      );
      if (onLoginSuccess && data.user) {
        onLoginSuccess(data.user, data.token);
      }
    } catch (err) {
      setIsLoading(false);
      if (await finishOfflineSignup(err, staffPayload, "Staff account saved offline")) return;
      setErrorMessage("Staff registration error: " + (err?.message || "Unknown error"));
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.container, isDesktop && styles.desktopContainer]}>
        {/* ================================================= */}
        {/* LEFT BRANDING SECTION (Hidden on small mobile) */}
        {/* ================================================= */}
        {isDesktop && (
          <View style={[styles.leftSection, styles.desktopLeft]}>
            <Image
              source={require("../../../assets/login-hero.jpg")}
              resizeMode="cover"
              style={styles.pharmacyImage}
            />
            <View style={styles.imageBlend} />

            <View style={styles.leftContent}>
              <View style={styles.logoRow}>
                <View style={styles.logoBox}>
                  <Text style={styles.logoIconText}>💊</Text>
                </View>
                <View>
                  <Text style={styles.logoTitle}>FLORA INSTITUTE</Text>
                  <Text style={styles.logoSubtitle}>
                    PHARMACY BILLING & ERP
                  </Text>
                </View>
              </View>

              <View style={styles.mainContent}>
                <Text style={styles.mainHeading}>Pharmacy Billing</Text>
                <Text style={styles.greenHeading}>& Management</Text>
                <Text style={styles.tagline}>Simple. Smart. Reliable.</Text>
                <Text style={styles.description}>
                  Manage multi-branch inventory, batch expiries, rapid POS
                  checkout, purchases, and real-time compliance with Google
                  security.
                </Text>

                <View style={styles.featuresContainer}>
                  {features.map((feature) => (
                    <View key={feature.title} style={styles.featureRow}>
                      <View style={styles.featureIconBox}>
                        <Text style={styles.featureEmoji}>{feature.icon}</Text>
                      </View>
                      <View style={styles.featureText}>
                        <Text style={styles.featureTitle}>{feature.title}</Text>
                        <Text style={styles.featureDescription}>
                          {feature.description}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.footer}>
                <View style={styles.footerItem}>
                  <View style={styles.footerTitleRow}>
                    <Text style={styles.footerIcon}>🎧</Text>
                    <Text style={styles.footerTitle}>Need Help?</Text>
                  </View>
                  <Text style={styles.footerText}>
                    Contact pharmacy.support@flora.edu.in
                  </Text>
                </View>
                <View style={styles.footerItemRight}>
                  <View style={styles.footerTitleRow}>
                    <Text style={styles.footerIcon}>🛡️</Text>
                    <Text style={styles.footerTitle}>Google Verified</Text>
                  </View>
                  <Text style={styles.footerText}>FIT Institutional Cloud</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ================================================= */}
        {/* RIGHT INTERACTIVE FORM SECTION */}
        {/* ================================================= */}
        <View style={[styles.rightSection, isDesktop && styles.desktopRight]}>
          <ScrollView
            contentContainerStyle={styles.rightScroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Mobile Header Branding */}
            {!isDesktop && (
              <View style={styles.mobileHeaderBar}>
                <View style={styles.mobileLogoBox}>
                  <Text style={{ fontSize: 20 }}>💊</Text>
                </View>
                <View>
                  <Text style={styles.mobileBrandTitle}>PharmaFlow ERP</Text>
                  <Text style={styles.mobileBrandSubtitle}>
                    Flora Institute of Technology
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.loginCard}>
              {/* HEADING & TAB TOGGLE */}
              <View style={styles.headingContainer}>
                <Text style={styles.welcomeText}>
                  {googleOnboardingData
                    ? "Complete Pharmacy Registration"
                    : authMode === "signin"
                      ? "Welcome Back!"
                      : "Create Account"}
                </Text>
                <Text style={styles.welcomeSubtext}>
                  {googleOnboardingData
                    ? `Complete your pharmacy setup for ${googleOnboardingData.email}`
                    : authMode === "signin"
                      ? "Sign in with your Google or verified pharmacy credentials"
                      : "Register your Gmail ID to access the pharmacy workspace"}
                </Text>
              </View>

              {/* GOOGLE ONBOARDING VERIFIED BANNER vs AUTH MODE TABS */}
              {googleOnboardingData ? (
                <View
                  style={{
                    backgroundColor: "#EAF2EE",
                    borderWidth: 1,
                    borderColor: "#EAF2EE",
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      flex: 1,
                    }}
                  >
                    <Text style={{ fontSize: 18 }}>✓</Text>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: "#4F8A72",
                          fontWeight: "700",
                          fontSize: 13,
                        }}
                      >
                        Google ID Verified
                      </Text>
                      <Text
                        style={{ color: "#4F8A72", fontSize: 12 }}
                        numberOfLines={1}
                      >
                        {googleOnboardingData.email}
                      </Text>
                    </View>
                  </View>
                  {onCancelGoogleOnboarding && (
                    <Pressable
                      onPress={onCancelGoogleOnboarding}
                      style={{
                        paddingVertical: 4,
                        paddingHorizontal: 10,
                        borderRadius: 6,
                        backgroundColor: "#ffffff",
                        borderWidth: 1,
                        borderColor: "#E5DFE4",
                      }}
                    >
                      <Text
                        style={{
                          color: "#77717A",
                          fontSize: 12,
                          fontWeight: "600",
                        }}
                      >
                        Cancel
                      </Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                <View style={styles.tabContainer}>
                  <Pressable
                    style={[
                      styles.tabButton,
                      authMode === "signin" && styles.tabButtonActive,
                    ]}
                    onPress={() => {
                      setAuthMode("signin");
                      setErrorMessage("");
                      setSuccessMessage("");
                      if (onClearAuthError) onClearAuthError();
                    }}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        authMode === "signin" && styles.tabTextActive,
                      ]}
                    >
                      Sign In
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.tabButton,
                      authMode === "signup" && styles.tabButtonActive,
                    ]}
                    onPress={() => {
                      setAuthMode("signup");
                      setErrorMessage("");
                      setSuccessMessage("");
                      if (onClearAuthError) onClearAuthError();
                    }}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        authMode === "signup" && styles.tabTextActive,
                      ]}
                    >
                      Sign Up
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* MESSAGES */}
              {errorMessage ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorIcon}>⚠️</Text>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              {successMessage ? (
                <View style={styles.successContainer}>
                  <Text style={styles.successIcon}>✓</Text>
                  <Text style={styles.successText}>{successMessage}</Text>
                </View>
              ) : null}

              {/* PHARMACY ARCHITECTURE TOGGLE: SINGLE SHOP vs MULTI-BRANCH */}
              {!googleOnboardingData && (
                <View
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: "#E5DFE4",
                    padding: 10,
                    marginBottom: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "800",
                      color: "#77717A",
                      letterSpacing: 0.5,
                      marginBottom: 8,
                      textTransform: "uppercase",
                    }}
                  >
                    Select Store Architecture
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable
                      onPress={() => {
                        setPharmacyMode("single");
                        if (typeof window !== "undefined") {
                          window.localStorage?.setItem("pharmacyMode", "single");
                        }
                      }}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        paddingHorizontal: 8,
                        borderRadius: 8,
                        borderWidth: 1.5,
                        borderColor:
                          pharmacyMode === "single" ? "#B9829A" : "#E5DFE4",
                        backgroundColor:
                          pharmacyMode === "single" ? "#FBF7F9" : "#FFFFFF",
                        alignItems: "center",
                        cursor: "pointer",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "800",
                          color:
                            pharmacyMode === "single" ? "#744458" : "#28242B",
                        }}
                      >
                        🏬 Single Shop
                      </Text>
                      <Text
                        style={{
                          fontSize: 10.5,
                          color: "#77717A",
                          marginTop: 2,
                          textAlign: "center",
                        }}
                      >
                        Direct Inventory & Billing
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        setPharmacyMode("multi");
                        if (typeof window !== "undefined") {
                          window.localStorage?.setItem("pharmacyMode", "multi");
                        }
                      }}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        paddingHorizontal: 8,
                        borderRadius: 8,
                        borderWidth: 1.5,
                        borderColor:
                          pharmacyMode === "multi" ? "#B9829A" : "#E5DFE4",
                        backgroundColor:
                          pharmacyMode === "multi" ? "#FBF7F9" : "#FFFFFF",
                        alignItems: "center",
                        cursor: "pointer",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "800",
                          color:
                            pharmacyMode === "multi" ? "#744458" : "#28242B",
                        }}
                      >
                        🏢 Multi-Branch Chain
                      </Text>
                      <Text
                        style={{
                          fontSize: 10.5,
                          color: "#77717A",
                          marginTop: 2,
                          textAlign: "center",
                        }}
                      >
                        Multi-branch distribution
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* GOOGLE SIGN IN BUTTON (Hidden during Google Onboarding) */}
              {!googleOnboardingData && (
                <>
                  <Pressable
                    style={styles.googleButton}
                    onPress={() =>
                      handleGoogleAuth(
                        authMode === "signin" ? "login" : "signup",
                      )
                    }
                    disabled={isLoading}
                  >
                    <View style={styles.googleIconCircle}>
                      <Text style={styles.googleGText}>G</Text>
                    </View>
                    <Text style={styles.googleButtonText}>
                      {authMode === "signin"
                        ? "Continue with Google ID"
                        : "Sign up with Google ID"}
                    </Text>
                  </Pressable>

                  <View style={styles.dividerRow}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>
                      or continue with email & password
                    </Text>
                    <View style={styles.dividerLine} />
                  </View>
                </>
              )}

              {/* ========================================= */}
              {/* FORM: SIGN IN MODE */}
              {/* ========================================= */}
              {authMode === "signin" && (
                <View>
                  {/* Email Field */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>Email Address</Text>
                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputPrefixIcon}>📧</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. owner@pharmacy.com"
                        placeholderTextColor="#77717A"
                        value={signInEmail}
                        onChangeText={(text) => {
                          setSignInEmail(text);
                          if (errorMessage) setErrorMessage("");
                        }}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        editable={!isLoading}
                      />
                    </View>
                  </View>

                  {/* Password Field */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>Password</Text>
                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputPrefixIcon}>🔒</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter your password"
                        placeholderTextColor="#77717A"
                        secureTextEntry={!showSignInPassword}
                        value={signInPassword}
                        onChangeText={(text) => {
                          setSignInPassword(text);
                          if (errorMessage) setErrorMessage("");
                        }}
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!isLoading}
                        onSubmitEditing={handleSignIn}
                      />
                      <Pressable
                        style={styles.eyeButton}
                        onPress={() =>
                          setShowSignInPassword(!showSignInPassword)
                        }
                        disabled={isLoading}
                      >
                        <Text style={styles.eyeIcon}>
                          {showSignInPassword ? "🙈" : "👁️"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Remember Me */}
                  <View style={styles.rememberRow}>
                    <Pressable
                      style={styles.rememberButton}
                      onPress={() => setRememberMe(!rememberMe)}
                      disabled={isLoading}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          rememberMe && styles.checkboxSelected,
                        ]}
                      >
                        {rememberMe && <Text style={styles.checkMark}>✓</Text>}
                      </View>
                      <Text style={styles.rememberText}>Remember me</Text>
                    </Pressable>
                  </View>

                  {/* Default Store Admin Credentials Note */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: "#E8D5DD",
                      borderWidth: 1,
                      borderColor: "#E8D5DD",
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      marginBottom: 14,
                      gap: 8,
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>🔑</Text>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 11.5,
                          color: "#B9829A",
                          fontWeight: "700",
                        }}
                      >
                        Store Admin Login Credentials:
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: "#28242B",
                          marginTop: 2,
                        }}
                      >
                        Email:{" "}
                        <Text style={{ fontWeight: "700" }}>
                          admin@falahpharmacy.com
                        </Text>{" "}
                        | Password:{" "}
                        <Text style={{ fontWeight: "700" }}>password123</Text>
                      </Text>
                    </View>
                  </View>

                  {/* SUBMIT SIGN IN */}
                  <Pressable
                    style={[
                      styles.signInButton,
                      isLoading && styles.disabledButton,
                    ]}
                    onPress={handleSignIn}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.signInText}>
                        Sign In to Pharmacy Workspace →
                      </Text>
                    )}
                  </Pressable>

                  {/* Switch to Sign Up mode link */}
                  <Pressable
                    onPress={() => {
                      setAuthMode("signup");
                      setErrorMessage("");
                      setSuccessMessage("");
                    }}
                    style={styles.switchModeRow}
                    accessibilityRole="button"
                  >
                    <Text style={styles.switchModeText}>
                      {pharmacyMode === "single"
                        ? "New Single Shop Owner? "
                        : "New Pharmacy Owner? "}
                      <Text style={styles.switchModeHighlight}>
                        {pharmacyMode === "single"
                          ? "Register Single Shop Direct Inventory Here"
                          : "Register Your Pharmacy Here"}
                      </Text>
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* ========================================= */}
              {/* FORM: SIGN UP MODE (Owner Onboarding) */}
              {/* ========================================= */}
              {authMode === "signup" && (
                <View>
                  {!googleOnboardingData && (
                    <View style={styles.signUpTypeContainer}>
                      <Pressable
                        style={[
                          styles.signUpTypeButton,
                          signUpRoleType === "PHARMACY" &&
                            styles.signUpTypeButtonActive,
                        ]}
                        onPress={() => {
                          setSignUpRoleType("PHARMACY");
                          setErrorMessage("");
                        }}
                      >
                        <Text style={styles.signUpTypeIcon}>
                          {pharmacyMode === "single" ? "🏬" : "🏥"}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.signUpTypeTitle,
                              signUpRoleType === "PHARMACY" &&
                                styles.signUpTypeTitleActive,
                            ]}
                          >
                            {pharmacyMode === "single"
                              ? "Single Shop Owner"
                              : "Pharmacy Admin"}
                          </Text>
                          <Text style={styles.signUpTypeSub}>
                            {pharmacyMode === "single"
                              ? "Direct inventory & billing"
                              : "Store owner setup"}
                          </Text>
                        </View>
                      </Pressable>

                      <Pressable
                        style={[
                          styles.signUpTypeButton,
                          signUpRoleType === "STAFF" &&
                            styles.signUpTypeButtonActive,
                        ]}
                        onPress={() => {
                          setSignUpRoleType("STAFF");
                          setErrorMessage("");
                        }}
                      >
                        <Text style={styles.signUpTypeIcon}>👤</Text>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.signUpTypeTitle,
                              signUpRoleType === "STAFF" &&
                                styles.signUpTypeTitleActive,
                            ]}
                          >
                            Pharmacy Staff
                          </Text>
                          <Text style={styles.signUpTypeSub}>
                            Pharmacist & staff
                          </Text>
                        </View>
                      </Pressable>

                      <Pressable
                        style={[
                          styles.signUpTypeButton,
                          signUpRoleType === "SUPPLIER" &&
                            styles.signUpTypeButtonActive,
                        ]}
                        onPress={() => {
                          setSignUpRoleType("SUPPLIER");
                          setErrorMessage("");
                        }}
                      >
                        <Text style={styles.signUpTypeIcon}>🚚</Text>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.signUpTypeTitle,
                              signUpRoleType === "SUPPLIER" &&
                                styles.signUpTypeTitleActive,
                            ]}
                          >
                            Medicine Supplier
                          </Text>
                          <Text style={styles.signUpTypeSub}>
                            Vendor distributor
                          </Text>
                        </View>
                      </Pressable>
                    </View>
                  )}

                  {signUpRoleType === "SUPPLIER" && !googleOnboardingData ? (
                    <View>
                      {/* Section Header */}
                      <View style={styles.sectionHeaderRow}>
                        <Text style={styles.sectionHeaderTitle}>
                          Supplier & Distributor Registration
                        </Text>
                      </View>

                      {/* Company Name */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>
                          Distributor / Company Name *
                        </Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>🚚</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="e.g. Apex Pharma Distributor"
                            placeholderTextColor="#77717A"
                            value={supplierCompanyName}
                            onChangeText={setSupplierCompanyName}
                            autoCapitalize="words"
                            editable={!isLoading}
                          />
                        </View>
                      </View>

                      {/* Contact Person */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>
                          Contact Person / Representative *
                        </Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>👤</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="e.g. Vikram Patel"
                            placeholderTextColor="#77717A"
                            value={supplierContactPerson}
                            onChangeText={setSupplierContactPerson}
                            autoCapitalize="words"
                            editable={!isLoading}
                          />
                        </View>
                      </View>

                      {/* Email */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>
                          Official Email (Login ID) *
                        </Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>📧</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="orders@apexpharma.com"
                            placeholderTextColor="#77717A"
                            value={supplierEmail}
                            onChangeText={setSupplierEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            editable={!isLoading}
                          />
                        </View>
                      </View>

                      {/* Phone */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Mobile / Phone Number *</Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>📱</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="+91 98765 43210"
                            placeholderTextColor="#77717A"
                            value={supplierPhone}
                            onChangeText={setSupplierPhone}
                            keyboardType="phone-pad"
                            editable={!isLoading}
                          />
                        </View>
                      </View>

                      {/* City */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>City / Region</Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>📍</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="e.g. Mumbai, Maharashtra"
                            placeholderTextColor="#77717A"
                            value={supplierCity}
                            onChangeText={setSupplierCity}
                            editable={!isLoading}
                          />
                        </View>
                      </View>

                      {/* GSTIN */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>GSTIN / Tax ID</Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>📜</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="27AABCS1429B1Z1"
                            placeholderTextColor="#77717A"
                            value={supplierGstin}
                            onChangeText={setSupplierGstin}
                            autoCapitalize="characters"
                            editable={!isLoading}
                          />
                        </View>
                      </View>

                      {/* Category */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Primary Supply Category</Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>📦</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Medicines & Injections"
                            placeholderTextColor="#77717A"
                            value={supplierCategory}
                            onChangeText={setSupplierCategory}
                            editable={!isLoading}
                          />
                        </View>
                      </View>

                      {/* Password */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Set Password *</Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>🔒</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="At least 6 characters"
                            placeholderTextColor="#77717A"
                            secureTextEntry={!showSupplierPassword}
                            value={supplierPassword}
                            onChangeText={setSupplierPassword}
                            editable={!isLoading}
                          />
                          <Pressable
                            style={styles.eyeButton}
                            onPress={() =>
                              setShowSupplierPassword(!showSupplierPassword)
                            }
                          >
                            <Text style={styles.eyeIcon}>
                              {showSupplierPassword ? "🙈" : "👁️"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      {/* Confirm Password */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Confirm Password *</Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>🔒</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Confirm your password"
                            placeholderTextColor="#77717A"
                            secureTextEntry={!showSupplierPassword}
                            value={supplierConfirmPassword}
                            onChangeText={setSupplierConfirmPassword}
                            editable={!isLoading}
                          />
                        </View>
                      </View>

                      {/* Submit Supplier */}
                      <Pressable
                        style={[
                          styles.signInButton,
                          { backgroundColor: "#B9829A" },
                          isLoading && styles.disabledButton,
                        ]}
                        onPress={handleSupplierSignUp}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={styles.signInText}>
                            Register Supplier Account →
                          </Text>
                        )}
                      </Pressable>

                      {/* Switch to Sign In link */}
                      <Pressable
                        onPress={() => {
                          setAuthMode("signin");
                          setErrorMessage("");
                        }}
                        style={styles.switchModeRow}
                      >
                        <Text style={styles.switchModeText}>
                          Already have a supplier account?{" "}
                          <Text style={styles.switchModeHighlight}>
                            Sign In here
                          </Text>
                        </Text>
                      </Pressable>
                    </View>
                  ) : signUpRoleType === "STAFF" && !googleOnboardingData ? (
                    <View>
                      {/* Section Header */}
                      <View style={styles.sectionHeaderRow}>
                        <Text style={styles.sectionHeaderTitle}>
                          Pharmacy Staff & Pharmacist Sign Up
                        </Text>
                      </View>

                      {/* Pharmacy code -> branch picker */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Pharmacy Code *</Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>🏥</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Code given by your pharmacy admin"
                            placeholderTextColor="#77717A"
                            value={staffPharmacyCode}
                            onChangeText={(t) => {
                              setStaffPharmacyCode(t);
                              setStaffBranches([]);
                              setStaffBranchId("");
                              setStaffPharmacyName("");
                            }}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            editable={!isLoading}
                            onSubmitEditing={handleLoadStaffBranches}
                          />
                          <Pressable
                            style={styles.eyeButton}
                            onPress={handleLoadStaffBranches}
                            disabled={isLoadingBranches}
                          >
                            <Text style={[styles.eyeIcon, { fontSize: 12, fontWeight: "700" }]}>
                              {isLoadingBranches ? "..." : "Find"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      {staffBranches.length > 0 && (
                        <View style={styles.fieldContainer}>
                          <Text style={styles.label}>
                            Select Your Branch * {staffPharmacyName ? `(${staffPharmacyName})` : ""}
                          </Text>
                          <View style={{ flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                            {staffBranches.map((b) => {
                              const selected = staffBranchId === b.id;
                              return (
                                <Pressable
                                  key={b.id}
                                  onPress={() => {
                                    setStaffBranchId(b.id);
                                    if (errorMessage) setErrorMessage("");
                                  }}
                                  style={{
                                    paddingVertical: 8,
                                    paddingHorizontal: 12,
                                    borderRadius: 8,
                                    borderWidth: 1.5,
                                    borderColor: selected ? "#A66D86" : "#E5DFE4",
                                    backgroundColor: selected ? "#E8D5DD" : "#FFFFFF",
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 12,
                                      fontWeight: "700",
                                      color: selected ? "#A66D86" : "#77717A",
                                    }}
                                  >
                                    {b.name}{b.city ? ` · ${b.city}` : ""}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      )}

                      {/* Full Name */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Full Name *</Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>👤</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="e.g. Rahul Sharma"
                            placeholderTextColor="#77717A"
                            value={staffName}
                            onChangeText={setStaffName}
                            autoCapitalize="words"
                            editable={!isLoading}
                          />
                        </View>
                      </View>

                      {/* Email */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Official Email (Login ID) *</Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>📧</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="rahul.staff@pharmacy.com"
                            placeholderTextColor="#77717A"
                            value={staffEmail}
                            onChangeText={setStaffEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            editable={!isLoading}
                          />
                        </View>
                      </View>

                      {/* Phone */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Mobile / Phone Number *</Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>📱</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="+91 98765 43210"
                            placeholderTextColor="#77717A"
                            value={staffPhone}
                            onChangeText={setStaffPhone}
                            keyboardType="phone-pad"
                            editable={!isLoading}
                          />
                        </View>
                      </View>

                      {/* Staff Role Designation */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Designation / Role *</Text>
                        <View
                          style={{
                            flexDirection: "row",
                            gap: 8,
                            marginTop: 4,
                            flexWrap: "wrap",
                          }}
                        >
                          {[
                            "Pharmacist",
                            "Cashier",
                            "Manager",
                            "Specialist",
                            "Sales Associate",
                          ].map((role) => {
                            const isSelected =
                              staffRoleTitle === role ||
                              (role === "Specialist" &&
                                staffRoleTitle === "Inventory Specialist");
                            return (
                              <Pressable
                                key={role}
                                onPress={() => {
                                  setStaffRoleTitle(role);
                                  if (errorMessage) setErrorMessage("");
                                }}
                                style={{
                                  paddingVertical: 8,
                                  paddingHorizontal: 12,
                                  borderRadius: 8,
                                  borderWidth: 1.5,
                                  borderColor: isSelected ? "#A66D86" : "#E5DFE4",
                                  backgroundColor: isSelected
                                    ? "#E8D5DD"
                                    : "#FFFFFF",
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 12,
                                    fontWeight: "700",
                                    color: isSelected ? "#A66D86" : "#77717A",
                                  }}
                                >
                                  {role}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      {/* Password */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Create Password *</Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>🔒</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Minimum 6 characters"
                            placeholderTextColor="#77717A"
                            secureTextEntry={!showStaffPassword}
                            value={staffPassword}
                            onChangeText={setStaffPassword}
                            editable={!isLoading}
                          />
                          <Pressable
                            style={styles.eyeButton}
                            onPress={() =>
                              setShowStaffPassword(!showStaffPassword)
                            }
                          >
                            <Text style={styles.eyeIcon}>
                              {showStaffPassword ? "🙈" : "👁️"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      {/* Confirm Password */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Confirm Password *</Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>🔒</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Confirm your password"
                            placeholderTextColor="#77717A"
                            secureTextEntry={!showStaffPassword}
                            value={staffConfirmPassword}
                            onChangeText={setStaffConfirmPassword}
                            editable={!isLoading}
                          />
                        </View>
                      </View>

                      {/* Submit Staff */}
                      <Pressable
                        style={[
                          styles.signInButton,
                          { backgroundColor: "#B9829A" },
                          isLoading && styles.disabledButton,
                        ]}
                        onPress={handleStaffSignUp}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={styles.signInText}>
                            Register Staff Account →
                          </Text>
                        )}
                      </Pressable>

                      {/* Switch to Sign In link */}
                      <Pressable
                        onPress={() => {
                          setAuthMode("signin");
                          setErrorMessage("");
                        }}
                        style={styles.switchModeRow}
                      >
                        <Text style={styles.switchModeText}>
                          Already have a staff account?{" "}
                          <Text style={styles.switchModeHighlight}>
                            Sign In here
                          </Text>
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View>
                      {/* Section Header */}
                      <View style={styles.sectionHeaderRow}>
                        <Text style={styles.sectionHeaderTitle}>
                          {pharmacyMode === "single"
                            ? "🏬 Single Shop Direct Inventory Registration"
                            : "🏥 Pharmacy Admin & Chain Registration"}
                        </Text>
                      </View>

                      {/* Architecture Mode Notification Banner */}
                      <View
                        style={{
                          backgroundColor: "#FBF7F9",
                          borderWidth: 1.5,
                          borderColor: "#E8D5DD",
                          borderRadius: 10,
                          padding: 12,
                          marginBottom: 16,
                          flexDirection: "row",
                          gap: 10,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ fontSize: 20 }}>
                          {pharmacyMode === "single" ? "🏬" : "🏢"}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontSize: 12.5,
                              fontWeight: "700",
                              color: "#744458",
                            }}
                          >
                            {pharmacyMode === "single"
                              ? "Single Store Direct Inventory Mode Enabled"
                              : "Multi-Branch Distribution Architecture"}
                          </Text>
                          <Text
                            style={{
                              fontSize: 11,
                              color: "#77717A",
                              marginTop: 2,
                              lineHeight: 16,
                            }}
                          >
                            {pharmacyMode === "single"
                              ? "Your standalone store will have direct inventory management, automated FEFO batches, customer billing, and local reports with zero branch transfer complexity."
                              : "Multi-branch store architecture allows inter-branch stock transfers, central warehouse receiving, and aggregated sales analytics."}
                          </Text>
                        </View>
                      </View>

                      {/* Pharmacy / Shop Name */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>
                          {pharmacyMode === "single"
                            ? "Single Shop / Pharmacy Name *"
                            : "Pharmacy Chain / Brand Name *"}
                        </Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>🏬</Text>
                          <TextInput
                            style={styles.input}
                            placeholder={
                              pharmacyMode === "single"
                                ? "e.g. Apex Chemist & Druggist"
                                : "e.g. Metro Care Pharmacy Network"
                            }
                            placeholderTextColor="#77717A"
                            value={signUpPharmacyName}
                            onChangeText={setSignUpPharmacyName}
                            autoCapitalize="words"
                            editable={!isLoading}
                          />
                        </View>
                      </View>

                      {/* Admin Name */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>
                          Admin Name (Store Admin / Owner) *
                        </Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>👤</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="e.g. Dr. Snehal Wadne"
                            placeholderTextColor="#77717A"
                            value={signUpAdminName}
                            onChangeText={setSignUpAdminName}
                            autoCapitalize="words"
                            editable={!isLoading}
                          />
                        </View>
                      </View>

                      {/* Store / Branch Name */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>
                          {pharmacyMode === "single"
                            ? "Store / Branch Name *"
                            : "New Branch Name (Primary Store) *"}
                        </Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>🏢</Text>
                          <TextInput
                            style={styles.input}
                            placeholder={
                              pharmacyMode === "single"
                                ? "e.g. Single Store Direct"
                                : "e.g. Main Branch"
                            }
                            placeholderTextColor="#77717A"
                            value={signUpBranchName}
                            onChangeText={setSignUpBranchName}
                            autoCapitalize="words"
                            editable={!isLoading}
                          />
                        </View>
                      </View>

                      {/* Email Address */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>
                          Official Email (Store Login ID) *
                        </Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>📧</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="e.g. owner@singleshop.com"
                            placeholderTextColor="#77717A"
                            value={signUpEmail}
                            onChangeText={setSignUpEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            editable={!isLoading}
                          />
                        </View>
                      </View>

                      {/* Phone Number */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>
                          Mobile / Phone Number *
                        </Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>📱</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="+91 98765 43210"
                            placeholderTextColor="#77717A"
                            value={signUpPhone}
                            onChangeText={setSignUpPhone}
                            keyboardType="phone-pad"
                            editable={!isLoading}
                          />
                        </View>
                      </View>

                      {/* Shop Address */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>
                          Store / Shop Address *
                        </Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>📍</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Shop No. 4, Station Road, Opp. Hospital"
                            placeholderTextColor="#77717A"
                            value={signUpAddress}
                            onChangeText={setSignUpAddress}
                            editable={!isLoading}
                          />
                        </View>
                      </View>

                      {/* City & State (Two Columns) */}
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <View style={[styles.fieldContainer, { flex: 1 }]}>
                          <Text style={styles.label}>City *</Text>
                          <View style={styles.inputWrapper}>
                            <TextInput
                              style={styles.input}
                              placeholder="e.g. Mumbai"
                              placeholderTextColor="#77717A"
                              value={signUpCity}
                              onChangeText={setSignUpCity}
                              editable={!isLoading}
                            />
                          </View>
                        </View>
                        <View style={[styles.fieldContainer, { flex: 1 }]}>
                          <Text style={styles.label}>State *</Text>
                          <View style={styles.inputWrapper}>
                            <TextInput
                              style={styles.input}
                              placeholder="e.g. Maharashtra"
                              placeholderTextColor="#77717A"
                              value={signUpState}
                              onChangeText={setSignUpState}
                              editable={!isLoading}
                            />
                          </View>
                        </View>
                      </View>

                      {/* Pincode & GSTIN (Two Columns) */}
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <View style={[styles.fieldContainer, { flex: 1 }]}>
                          <Text style={styles.label}>Pincode *</Text>
                          <View style={styles.inputWrapper}>
                            <TextInput
                              style={styles.input}
                              placeholder="400001"
                              placeholderTextColor="#77717A"
                              value={signUpPincode}
                              onChangeText={setSignUpPincode}
                              keyboardType="numeric"
                              editable={!isLoading}
                            />
                          </View>
                        </View>
                        <View style={[styles.fieldContainer, { flex: 1 }]}>
                          <Text style={styles.label}>GSTIN / Drug Lic. (Opt)</Text>
                          <View style={styles.inputWrapper}>
                            <TextInput
                              style={styles.input}
                              placeholder="27AAAAA0000A1Z5"
                              placeholderTextColor="#77717A"
                              value={signUpGstNumber}
                              onChangeText={setSignUpGstNumber}
                              autoCapitalize="characters"
                              editable={!isLoading}
                            />
                          </View>
                        </View>
                      </View>

                      {/* Password */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Create Password *</Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>🔒</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Minimum 6 characters"
                            placeholderTextColor="#77717A"
                            secureTextEntry={!showSignUpPassword}
                            value={signUpPassword}
                            onChangeText={setSignUpPassword}
                            editable={!isLoading}
                          />
                          <Pressable
                            style={styles.eyeButton}
                            onPress={() =>
                              setShowSignUpPassword(!showSignUpPassword)
                            }
                          >
                            <Text style={styles.eyeIcon}>
                              {showSignUpPassword ? "🙈" : "👁️"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      {/* Confirm Password */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Confirm Password *</Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>🔒</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Confirm your password"
                            placeholderTextColor="#77717A"
                            secureTextEntry={!showSignUpPassword}
                            value={signUpConfirmPassword}
                            onChangeText={setSignUpConfirmPassword}
                            editable={!isLoading}
                          />
                        </View>
                      </View>

                      {/* Submit Single Shop / Owner Registration */}
                      <Pressable
                        style={[
                          styles.signInButton,
                          { backgroundColor: "#B9829A", marginTop: 8 },
                          isLoading && styles.disabledButton,
                        ]}
                        onPress={handleSignUp}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={styles.signInText}>
                            {pharmacyMode === "single"
                              ? "Register Single Shop Direct Inventory →"
                              : "Register Pharmacy Network →"}
                          </Text>
                        )}
                      </Pressable>

                      {/* Google Sign-In Alternative */}
                      <View style={[styles.dividerRow, { marginVertical: 14 }]}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>or register with Google</Text>
                        <View style={styles.dividerLine} />
                      </View>

                      <Pressable
                        style={[
                          styles.googleButton,
                          {
                            width: "100%",
                            paddingVertical: 12,
                            borderRadius: 10,
                            borderWidth: 1.5,
                            borderColor: "#E5DFE4",
                            backgroundColor: "#FFFFFF",
                          },
                          isLoading && styles.disabledButton,
                        ]}
                        onPress={() => handleGoogleAuth("signup")}
                        disabled={isLoading}
                      >
                        <View style={styles.googleIconCircle}>
                          <Text style={styles.googleGText}>G</Text>
                        </View>
                        <Text style={[styles.googleButtonText, { fontSize: 13 }]}>
                          1-Click Sign Up with Google ID
                        </Text>
                      </Pressable>

                      {/* Switch to Sign In link */}
                      <Pressable
                        onPress={() => {
                          setAuthMode("signin");
                          setErrorMessage("");
                          setSuccessMessage("");
                        }}
                        style={[styles.switchModeRow, { marginTop: 14 }]}
                      >
                        <Text style={styles.switchModeText}>
                          Already have a store account?{" "}
                          <Text style={styles.switchModeHighlight}>
                            Sign In to Pharmacy Workspace
                          </Text>
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F8F5F7",
  },
  container: {
    flex: 1,
  },
  desktopContainer: {
    flexDirection: "row",
  },
  leftSection: {
    flex: 1,
    backgroundColor: "#30243D",
    minHeight: 650,
    overflow: "hidden",
    position: "relative",
  },
  desktopLeft: {
    width: "48%",
  },
  pharmacyImage: {
    position: "absolute",
    width: 300,
    height: 533,
    right: -20,
    bottom: 24,
    opacity: 0.82,
    zIndex: 0,
    borderRadius: 20,
  },
  imageBlend: {
    position: "absolute",
    right: -20,
    bottom: 24,
    width: 300,
    height: 533,
    backgroundColor: "rgba(48, 36, 61, 0.3)",
    zIndex: 1,
    borderRadius: 20,
  },
  leftContent: {
    flex: 1,
    paddingHorizontal: 36,
    paddingVertical: 32,
    zIndex: 2,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#3D2E4D",
    alignItems: "center",
    justifyContent: "center",
  },
  logoIconText: {
    fontSize: 22,
  },
  logoTitle: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: "#FFFFFF",
  },
  logoSubtitle: {
    marginTop: 2,
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#D9D2DE",
  },
  mainContent: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: 20,
  },
  mainHeading: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  greenHeading: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: "800",
    color: "#B9829A",
    letterSpacing: -0.5,
  },
  tagline: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: "600",
    color: "#D9D2DE",
  },
  description: {
    marginTop: 12,
    maxWidth: 480,
    fontSize: 13,
    lineHeight: 20,
    color: "#D9D2DE",
  },
  featuresContainer: {
    marginTop: 24,
    gap: 12,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#3D2E4D",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(229, 223, 228, 0.2)",
  },
  featureEmoji: {
    fontSize: 18,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  featureDescription: {
    fontSize: 12,
    color: "#D9D2DE",
    marginTop: 1,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(229, 223, 228, 0.24)",
  },
  footerItem: {
    flex: 1,
  },
  footerItemRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  footerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerIcon: {
    fontSize: 14,
  },
  footerTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#B9829A",
  },
  footerText: {
    fontSize: 11,
    color: "#D9D2DE",
    marginTop: 2,
  },

  /* Right Section */
  rightSection: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
  },
  desktopRight: {
    width: "52%",
  },
  rightScroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 18,
    paddingBottom: 40,
  },
  mobileHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5DFE4",
  },
  mobileLogoBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#EAF2EE",
    alignItems: "center",
    justifyContent: "center",
  },
  mobileBrandTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#B9829A",
  },
  mobileBrandSubtitle: {
    fontSize: 11,
    color: "#77717A",
  },
  loginCard: {
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  headingContainer: {
    marginBottom: 18,
  },
  welcomeText: {
    fontSize: 26,
    fontWeight: "800",
    color: "#28242B",
    letterSpacing: -0.5,
  },
  welcomeSubtext: {
    fontSize: 13,
    color: "#77717A",
    marginTop: 4,
    lineHeight: 18,
  },

  /* Tabs */
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#F8F5F7",
    borderRadius: 8,
    padding: 4,
    marginBottom: 18,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 6,
  },
  tabButtonActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#28242B",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#77717A",
  },
  tabTextActive: {
    color: "#B9829A",
    fontWeight: "700",
  },

  /* Feedback Banners */
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F7EDEE",
    borderWidth: 1,
    borderColor: "#F7EDEE",
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  errorIcon: {
    fontSize: 14,
  },
  errorText: {
    flex: 1,
    fontSize: 12.5,
    color: "#B85C64",
    fontWeight: "500",
  },
  successContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EAF2EE",
    borderWidth: 1,
    borderColor: "#EAF2EE",
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  successIcon: {
    fontSize: 14,
    color: "#4F8A72",
    fontWeight: "800",
  },
  successText: {
    flex: 1,
    fontSize: 12.5,
    color: "#4F8A72",
    fontWeight: "600",
  },

  /* Google Button */
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E5DFE4",
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
    shadowColor: "#28242B",
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  googleIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F8F5F7",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5DFE4",
  },
  googleGText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#4285F4",
  },
  googleButtonText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#28242B",
  },

  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E5DFE4",
  },
  dividerText: {
    fontSize: 11.5,
    color: "#77717A",
    fontWeight: "500",
  },

  /* Inputs */
  fieldContainer: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#28242B",
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    height: 42,
  },
  inputPrefixIcon: {
    fontSize: 15,
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: "100%",
    fontSize: 13.5,
    color: "#28242B",
  },
  eyeButton: {
    padding: 6,
  },
  eyeIcon: {
    fontSize: 16,
  },

  roleChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  roleChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    backgroundColor: "#F8F5F7",
  },
  roleChipActive: {
    backgroundColor: "#B9829A",
    borderColor: "#B9829A",
  },
  roleChipText: {
    fontSize: 12,
    color: "#77717A",
    fontWeight: "600",
  },
  roleChipTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },

  branchHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  branchSubLabel: {
    fontSize: 11,
    color: "#77717A",
    fontWeight: "500",
  },
  branchChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    backgroundColor: "#F8F5F7",
    gap: 4,
  },
  branchChipActive: {
    backgroundColor: "#B9829A",
    borderColor: "#B9829A",
  },
  branchChipIcon: {
    fontSize: 12,
  },
  branchChipText: {
    fontSize: 11.5,
    color: "#77717A",
    fontWeight: "600",
  },
  branchChipTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },

  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  rememberButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#77717A",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: "#B9829A",
    borderColor: "#B9829A",
  },
  checkMark: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  rememberText: {
    fontSize: 12.5,
    color: "#77717A",
  },
  forgotText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#B9829A",
  },

  signInButton: {
    backgroundColor: "#B9829A",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#B9829A",
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 2,
  },
  disabledButton: {
    opacity: 0.65,
  },
  signInText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  switchModeRow: {
    marginTop: 14,
    alignItems: "center",
    paddingVertical: 6,
    cursor: "pointer",
  },
  switchModeText: {
    fontSize: 13,
    color: "#77717A",
    fontWeight: "500",
  },
  switchModeHighlight: {
    color: "#B9829A",
    fontWeight: "750",
    textDecorationLine: "underline",
  },
  sectionHeaderRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#E5DFE4",
    paddingBottom: 6,
    marginTop: 10,
    marginBottom: 12,
  },
  sectionHeaderTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#B9829A",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  helperText: {
    fontSize: 11,
    color: "#77717A",
    marginTop: 4,
    marginLeft: 2,
    marginBottom: 6,
  },
  addressInputWrapper: {
    height: 68,
    alignItems: "flex-start",
    paddingVertical: 6,
  },
  addressInput: {
    height: 56,
    textAlignVertical: "top",
  },

  demoNotice: {
    marginTop: 18,
    backgroundColor: "#E8D5DD",
    borderWidth: 1,
    borderColor: "#E8D5DD",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  demoNoticeText: {
    fontSize: 12,
    color: "#B9829A",
    textAlign: "center",
  },

  /* Google Modal */
  googleModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  googleModalBox: {
    maxWidth: 440,
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#28242B",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  googleModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  googleModalLogoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  googleGSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F8F5F7",
    alignItems: "center",
    justifyContent: "center",
  },
  googleModalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#28242B",
  },
  googleModalClose: {
    padding: 6,
  },
  googleModalSubtitle: {
    fontSize: 12.5,
    color: "#77717A",
    marginBottom: 16,
  },
  googleAccountsList: {
    gap: 8,
    marginBottom: 16,
  },
  googleAccountItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    backgroundColor: "#F8F5F7",
  },
  googleAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#B9829A",
    alignItems: "center",
    justifyContent: "center",
  },
  googleAvatarInitial: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
  googleAccName: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#28242B",
  },
  googleAccEmail: {
    fontSize: 12,
    color: "#77717A",
    marginTop: 1,
  },
  googleAccBadge: {
    backgroundColor: "#E8D5DD",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  googleAccBadgeText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#A66D86",
  },
  googleOwnerAccountItem: {
    borderColor: "#A66D86",
    backgroundColor: "#E8D5DD",
    borderWidth: 1.5,
  },
  googleOwnerAvatarCircle: {
    backgroundColor: "#A66D86",
  },
  googleOwnerBadge: {
    backgroundColor: "#E8D5DD",
  },
  googleOwnerBadgeText: {
    color: "#B9829A",
    fontWeight: "800",
  },
  customGoogleBox: {
    marginTop: 8,
    marginBottom: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    backgroundColor: "#F8F5F7",
  },
  customGoogleTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#28242B",
    marginBottom: 8,
  },
  customGoogleInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  customGoogleInput: {
    flex: 1,
    height: 38,
    fontSize: 13,
    color: "#28242B",
  },
  ownerCheckboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  ownerCheckboxText: {
    fontSize: 12,
    color: "#28242B",
  },
  customGoogleSubmitBtn: {
    backgroundColor: "#A66D86",
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: "center",
  },
  customGoogleSubmitText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "700",
  },
  googleCancelBtn: {
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "#F8F5F7",
  },
  googleCancelBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#77717A",
  },
  quickLoginBox: {
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  quickLoginTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#77717A",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  quickLoginButtonsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  quickRolePill: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    cursor: "pointer",
  },
  quickRoleText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#28242B",
  },
  quickRoleSupplier: {
    backgroundColor: "#E8D5DD",
    borderColor: "#B9829A",
  },
  quickRoleSupplierText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#B9829A",
  },
  signUpTypeContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  signUpTypeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8F5F7",
    borderWidth: 1.5,
    borderColor: "#E5DFE4",
    borderRadius: 10,
    padding: 12,
    gap: 10,
    cursor: "pointer",
  },
  signUpTypeButtonActive: {
    backgroundColor: "#E8D5DD",
    borderColor: "#B9829A",
  },
  signUpTypeIcon: {
    fontSize: 22,
  },
  signUpTypeTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#77717A",
  },
  signUpTypeTitleActive: {
    color: "#B9829A",
    fontWeight: "800",
  },
  signUpTypeSub: {
    fontSize: 10,
    color: "#77717A",
    marginTop: 1,
  },
});
