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
} from "react-native";
import { API_URL } from "../../config";
import { supabase, signInWithGoogle } from "../../api/supabaseClient";

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

  useEffect(() => {
    if (authError) {
      setErrorMessage(authError);
    }
  }, [authError]);

  // Sign In States
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Pharmacy Owner Onboarding (Sign Up) States
  const [signUpPharmacyName, setSignUpPharmacyName] = useState("");
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
      // 1. Authenticate with Supabase Auth directly
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password: signInPassword,
        });

      if (authError || !authData.session) {
        setIsLoading(false);
        setErrorMessage(authError?.message || "Invalid email or password.");
        return;
      }

      const token = authData.session.access_token;

      // 2. Fetch authoritative user context from backend
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      setIsLoading(false);

      if (response.ok) {
        const resData = await response.json();
        const user = resData.data?.user || resData.user;
        if (onLoginSuccess) {
          onLoginSuccess(user, token);
        }
        return;
      }

      const errorData = await response.json().catch(() => ({}));
      await supabase.auth.signOut();
      setErrorMessage(
        errorData.error ||
          "Failed to load user workspace. Please ensure your account is active.",
      );
    } catch (err) {
      setIsLoading(false);
      setErrorMessage("Authentication error: " + err.message);
    }
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
      setErrorMessage("Please enter owner / contact person.");
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
            createInitialBranch: false,
          }),
        });

        const data = await response.json().catch(() => ({}));
        setIsLoading(false);

        if (!response.ok || !data.success) {
          setErrorMessage(
            data.error ||
              "Failed to complete pharmacy onboarding. Please try again.",
          );
          return;
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

    try {
      // 1. Call Backend Pharmacy Owner Onboarding endpoint
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
          createInitialBranch: false,
          password: signUpPassword,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        setIsLoading(false);
        setErrorMessage(
          data.error || "Failed to register pharmacy. Please try again.",
        );
        return;
      }

      setSuccessMessage("Pharmacy registered successfully! Signing in...");

      // 2. Authenticate directly via Supabase Auth
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password: signUpPassword,
        });

      if (authError || !authData.session) {
        setIsLoading(false);
        setAuthMode("signin");
        setSignInEmail(email);
        setSignInPassword(signUpPassword);
        setSuccessMessage(
          "Pharmacy registered! Please sign in with your credentials.",
        );
        return;
      }

      const token = authData.session.access_token;

      // 3. Fetch authoritative profile
      const meRes = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      setIsLoading(false);

      if (meRes.ok) {
        const meData = await meRes.json();
        const user = meData.data?.user || meData.user;
        if (onLoginSuccess) {
          onLoginSuccess(user, token);
        }
        return;
      }

      setAuthMode("signin");
      setSignInEmail(email);
      setSignInPassword(signUpPassword);
    } catch (err) {
      setIsLoading(false);
      setErrorMessage("Registration error: " + err.message);
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
              source={require("../../../assets/pharmacy.png")}
              resizeMode="contain"
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
                    backgroundColor: "#ecfdf5",
                    borderWidth: 1,
                    borderColor: "#a7f3d0",
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
                          color: "#065f46",
                          fontWeight: "700",
                          fontSize: 13,
                        }}
                      >
                        Google ID Verified
                      </Text>
                      <Text
                        style={{ color: "#047857", fontSize: 12 }}
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
                        borderColor: "#cbd5e1",
                      }}
                    >
                      <Text
                        style={{
                          color: "#475569",
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
                        placeholderTextColor="#94a3b8"
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
                        placeholderTextColor="#94a3b8"
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
                      New Pharmacy Owner?{" "}
                      <Text style={styles.switchModeHighlight}>
                        Register Your Pharmacy Here
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
                  {/* Section 1: Pharmacy / Business Information */}
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionHeaderTitle}>
                      Pharmacy / Business Information
                    </Text>
                  </View>

                  {/* Pharmacy Name */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>Pharmacy Name *</Text>
                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputPrefixIcon}>🏥</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Al Noor Pharmacy"
                        placeholderTextColor="#94a3b8"
                        value={signUpPharmacyName}
                        onChangeText={(text) => {
                          setSignUpPharmacyName(text);
                          if (errorMessage) setErrorMessage("");
                        }}
                        autoCapitalize="words"
                        editable={!isLoading}
                      />
                    </View>
                  </View>

                  {/* Owner / Contact Person */}
                  <View style={styles.fieldContainer}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text style={styles.label}>Owner / Contact Person *</Text>
                      {googleOnboardingData?.name ? (
                        <Text
                          style={{
                            fontSize: 11,
                            color: "#059669",
                            fontWeight: "600",
                          }}
                        >
                          Prefilled from Google
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputPrefixIcon}>👤</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Mohammed Ali"
                        placeholderTextColor="#94a3b8"
                        value={signUpAdminName}
                        onChangeText={(text) => {
                          setSignUpAdminName(text);
                          if (errorMessage) setErrorMessage("");
                        }}
                        autoCapitalize="words"
                        editable={!isLoading}
                      />
                    </View>
                  </View>

                  {/* Email (Login ID) */}
                  <View style={styles.fieldContainer}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text style={styles.label}>Email (Login ID) *</Text>
                      {googleOnboardingData ? (
                        <Text
                          style={{
                            fontSize: 11,
                            color: "#059669",
                            fontWeight: "600",
                          }}
                        >
                          Google Verified
                        </Text>
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.inputWrapper,
                        googleOnboardingData && { backgroundColor: "#f1f5f9" },
                      ]}
                    >
                      <Text style={styles.inputPrefixIcon}>📧</Text>
                      <TextInput
                        style={[
                          styles.input,
                          googleOnboardingData && { color: "#64748B" },
                        ]}
                        placeholder="admin@pharmacy.com"
                        placeholderTextColor="#94a3b8"
                        value={signUpEmail}
                        onChangeText={(text) => {
                          if (!googleOnboardingData) {
                            setSignUpEmail(text);
                            if (errorMessage) setErrorMessage("");
                          }
                        }}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        editable={!isLoading && !googleOnboardingData}
                      />
                    </View>
                    <Text style={styles.helperText}>
                      {googleOnboardingData
                        ? "This verified Google email will be your account login ID."
                        : "This email will be used as Login ID for the admin."}
                    </Text>
                  </View>

                  {/* Phone / Mobile */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>Phone / Mobile *</Text>
                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputPrefixIcon}>📞</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="+91 98765 43210"
                        placeholderTextColor="#94a3b8"
                        value={signUpPhone}
                        onChangeText={(text) => {
                          setSignUpPhone(text);
                          if (errorMessage) setErrorMessage("");
                        }}
                        keyboardType="phone-pad"
                        editable={!isLoading}
                      />
                    </View>
                  </View>

                  {/* Business Address */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>Business Address *</Text>
                    <View
                      style={[styles.inputWrapper, styles.addressInputWrapper]}
                    >
                      <TextInput
                        style={[styles.input, styles.addressInput]}
                        placeholder="No. 12, Residency Road, Shanthala Nagar"
                        placeholderTextColor="#94a3b8"
                        value={signUpAddress}
                        onChangeText={(text) => {
                          setSignUpAddress(text);
                          if (errorMessage) setErrorMessage("");
                        }}
                        multiline
                        editable={!isLoading}
                      />
                    </View>
                  </View>

                  {/* City, State, Pincode in 3 columns */}
                  <View
                    style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>City *</Text>
                      <View style={styles.inputWrapper}>
                        <TextInput
                          style={styles.input}
                          placeholder="Bangalore"
                          placeholderTextColor="#94a3b8"
                          value={signUpCity}
                          onChangeText={(text) => {
                            setSignUpCity(text);
                            if (errorMessage) setErrorMessage("");
                          }}
                          editable={!isLoading}
                        />
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>State *</Text>
                      <View style={styles.inputWrapper}>
                        <TextInput
                          style={styles.input}
                          placeholder="Karnataka"
                          placeholderTextColor="#94a3b8"
                          value={signUpState}
                          onChangeText={(text) => {
                            setSignUpState(text);
                            if (errorMessage) setErrorMessage("");
                          }}
                          editable={!isLoading}
                        />
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Pincode *</Text>
                      <View style={styles.inputWrapper}>
                        <TextInput
                          style={styles.input}
                          placeholder="560001"
                          placeholderTextColor="#94a3b8"
                          value={signUpPincode}
                          onChangeText={(text) => {
                            setSignUpPincode(text);
                            if (errorMessage) setErrorMessage("");
                          }}
                          keyboardType="number-pad"
                          editable={!isLoading}
                        />
                      </View>
                    </View>
                  </View>

                  {/* Section 2: Additional Information */}
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionHeaderTitle}>
                      Additional Information
                    </Text>
                  </View>

                  {/* GST Number */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>GST Number</Text>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={styles.input}
                        placeholder="29ABCDE1234F1Z5"
                        placeholderTextColor="#94a3b8"
                        value={signUpGstNumber}
                        onChangeText={setSignUpGstNumber}
                        autoCapitalize="characters"
                        editable={!isLoading}
                      />
                    </View>
                  </View>

                  {/* Business Type */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>Business Type</Text>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={styles.input}
                        placeholder="Private Limited"
                        placeholderTextColor="#94a3b8"
                        value={signUpBusinessType}
                        onChangeText={setSignUpBusinessType}
                        editable={!isLoading}
                      />
                    </View>
                  </View>

                  {/* Section 3: Credentials (Hidden during Google Onboarding) */}
                  {!googleOnboardingData && (
                    <>
                      <View style={styles.sectionHeaderRow}>
                        <Text style={styles.sectionHeaderTitle}>
                          Account Credentials
                        </Text>
                      </View>

                      {/* Password */}
                      <View style={styles.fieldContainer}>
                        <Text style={styles.label}>
                          Password (Min 6 characters) *
                        </Text>
                        <View style={styles.inputWrapper}>
                          <Text style={styles.inputPrefixIcon}>🔒</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Create a secure password"
                            placeholderTextColor="#94a3b8"
                            secureTextEntry={!showSignUpPassword}
                            value={signUpPassword}
                            onChangeText={(text) => {
                              setSignUpPassword(text);
                              if (errorMessage) setErrorMessage("");
                            }}
                            autoCapitalize="none"
                            editable={!isLoading}
                          />
                          <Pressable
                            style={styles.eyeButton}
                            onPress={() =>
                              setShowSignUpPassword(!showSignUpPassword)
                            }
                            disabled={isLoading}
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
                          <Text style={styles.inputPrefixIcon}>🔐</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Confirm password"
                            placeholderTextColor="#94a3b8"
                            secureTextEntry={!showSignUpPassword}
                            value={signUpConfirmPassword}
                            onChangeText={(text) => {
                              setSignUpConfirmPassword(text);
                              if (errorMessage) setErrorMessage("");
                            }}
                            autoCapitalize="none"
                            editable={!isLoading}
                            onSubmitEditing={handleSignUp}
                          />
                        </View>
                      </View>
                    </>
                  )}

                  {/* SUBMIT SIGN UP */}
                  <Pressable
                    style={[
                      styles.signInButton,
                      isLoading && styles.disabledButton,
                    ]}
                    onPress={handleSignUp}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.signInText}>
                        {googleOnboardingData
                          ? "Complete Pharmacy Registration →"
                          : "Register Pharmacy & Sign In →"}
                      </Text>
                    )}
                  </Pressable>

                  {/* Switch to Sign In mode link (Hidden during Google Onboarding) */}
                  {!googleOnboardingData && (
                    <Pressable
                      onPress={() => {
                        setAuthMode("signin");
                        setErrorMessage("");
                        setSuccessMessage("");
                      }}
                      style={styles.switchModeRow}
                      accessibilityRole="button"
                    >
                      <Text style={styles.switchModeText}>
                        Already have an account?{" "}
                        <Text style={styles.switchModeHighlight}>
                          Sign In here
                        </Text>
                      </Text>
                    </Pressable>
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
    backgroundColor: "#F4FAF8",
  },
  container: {
    flex: 1,
  },
  desktopContainer: {
    flexDirection: "row",
  },
  leftSection: {
    flex: 1,
    backgroundColor: "#EAF7F3",
    minHeight: 650,
    overflow: "hidden",
    position: "relative",
  },
  desktopLeft: {
    width: "48%",
  },
  pharmacyImage: {
    position: "absolute",
    width: 540,
    height: 480,
    right: -40,
    bottom: 20,
    opacity: 0.28,
    zIndex: 0,
  },
  imageBlend: {
    position: "absolute",
    right: -40,
    bottom: 20,
    width: 540,
    height: 480,
    backgroundColor: "rgba(234, 247, 243, 0.2)",
    zIndex: 1,
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
    backgroundColor: "#D9F0E9",
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
    color: "#0F766E",
  },
  logoSubtitle: {
    marginTop: 2,
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#64748B",
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
    color: "#0F172A",
    letterSpacing: -0.5,
  },
  greenHeading: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: "800",
    color: "#0F766E",
    letterSpacing: -0.5,
  },
  tagline: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: "600",
    color: "#475569",
  },
  description: {
    marginTop: 12,
    maxWidth: 480,
    fontSize: 13,
    lineHeight: 20,
    color: "#64748B",
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
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
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
    color: "#1E293B",
  },
  featureDescription: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 1,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(15, 118, 110, 0.12)",
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
    color: "#0F766E",
  },
  footerText: {
    fontSize: 11,
    color: "#64748B",
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
    borderBottomColor: "#E2E8F0",
  },
  mobileLogoBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#D9F0E9",
    alignItems: "center",
    justifyContent: "center",
  },
  mobileBrandTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F766E",
  },
  mobileBrandSubtitle: {
    fontSize: 11,
    color: "#64748B",
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
    color: "#0F172A",
    letterSpacing: -0.5,
  },
  welcomeSubtext: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
    lineHeight: 18,
  },

  /* Tabs */
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
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
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  tabTextActive: {
    color: "#0F766E",
    fontWeight: "700",
  },

  /* Feedback Banners */
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
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
    color: "#B91C1C",
    fontWeight: "500",
  },
  successContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  successIcon: {
    fontSize: 14,
    color: "#059669",
    fontWeight: "800",
  },
  successText: {
    flex: 1,
    fontSize: 12.5,
    color: "#059669",
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
    borderColor: "#E2E8F0",
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  googleIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  googleGText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#4285F4",
  },
  googleButtonText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#1E293B",
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
    backgroundColor: "#E2E8F0",
  },
  dividerText: {
    fontSize: 11.5,
    color: "#94A3B8",
    fontWeight: "500",
  },

  /* Inputs */
  fieldContainer: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#CBD5E1",
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
    color: "#0F172A",
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
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
  },
  roleChipActive: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  roleChipText: {
    fontSize: 12,
    color: "#475569",
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
    color: "#64748B",
    fontWeight: "500",
  },
  branchChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    gap: 4,
  },
  branchChipActive: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  branchChipIcon: {
    fontSize: 12,
  },
  branchChipText: {
    fontSize: 11.5,
    color: "#475569",
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
    borderColor: "#94A3B8",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  checkMark: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  rememberText: {
    fontSize: 12.5,
    color: "#64748B",
  },
  forgotText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#0F766E",
  },

  signInButton: {
    backgroundColor: "#0F766E",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F766E",
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
    color: "#64748B",
    fontWeight: "500",
  },
  switchModeHighlight: {
    color: "#0F766E",
    fontWeight: "750",
    textDecorationLine: "underline",
  },
  sectionHeaderRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingBottom: 6,
    marginTop: 10,
    marginBottom: 12,
  },
  sectionHeaderTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#0F766E",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  helperText: {
    fontSize: 11,
    color: "#64748B",
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
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  demoNoticeText: {
    fontSize: 12,
    color: "#0F766E",
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
    shadowColor: "#000",
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
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  googleModalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  googleModalClose: {
    padding: 6,
  },
  googleModalSubtitle: {
    fontSize: 12.5,
    color: "#64748B",
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
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  googleAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0F766E",
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
    color: "#0F172A",
  },
  googleAccEmail: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 1,
  },
  googleAccBadge: {
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  googleAccBadgeText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#0369A1",
  },
  googleOwnerAccountItem: {
    borderColor: "#0D9488",
    backgroundColor: "#F0FDFA",
    borderWidth: 1.5,
  },
  googleOwnerAvatarCircle: {
    backgroundColor: "#0D9488",
  },
  googleOwnerBadge: {
    backgroundColor: "#CCFBF1",
  },
  googleOwnerBadgeText: {
    color: "#0F766E",
    fontWeight: "800",
  },
  customGoogleBox: {
    marginTop: 8,
    marginBottom: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
  },
  customGoogleTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 8,
  },
  customGoogleInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  customGoogleInput: {
    flex: 1,
    height: 38,
    fontSize: 13,
    color: "#0F172A",
  },
  ownerCheckboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  ownerCheckboxText: {
    fontSize: 12,
    color: "#334155",
  },
  customGoogleSubmitBtn: {
    backgroundColor: "#0D9488",
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
    backgroundColor: "#F1F5F9",
  },
  googleCancelBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
});
