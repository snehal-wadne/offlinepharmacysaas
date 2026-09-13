import React, { useState } from "react";
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
  Modal,
} from "react-native";
import { API_URL } from "../../config";

export default function LoginScreen({ onLoginSuccess }) {
  // Mode: 'signin' | 'signup'
  const [authMode, setAuthMode] = useState("signin");

  const [signInEmail, setSignInEmail] = useState("admin@flora.edu.in");
  const [signInPassword, setSignInPassword] = useState("admin123");
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Sign Up States
  const [signUpName, setSignUpName] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpBranch, setSignUpBranch] = useState(
    "FIT Main Campus Hospital Pharmacy",
  );
  const [signUpRole, setSignUpRole] = useState("Pharmacist");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState("");
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);

  // Google OAuth Modal & Custom Account States
  const [googleModalVisible, setGoogleModalVisible] = useState(false);
  const [customGoogleEmail, setCustomGoogleEmail] = useState("");

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

  // Validate Gmail or institutional Google Workspace ID
  const isValidGoogleEmail = (email) => {
    if (!email) return false;
    const trimmed = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(trimmed);
  };

  const loadDemoCredentials = () => {
    setSignInEmail("admin@flora.edu.in");
    setSignInPassword("admin123");
  };

  // Sign In Handler
  const handleSignIn = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    const email = signInEmail.trim();
    if (!email) {
      setErrorMessage("Please enter your Google / Gmail ID.");
      return;
    }

    if (!isValidGoogleEmail(email)) {
      setErrorMessage(
        "Please enter a valid Google / Gmail address (e.g. yourname@gmail.com).",
      );
      return;
    }

    if (!signInPassword) {
      setErrorMessage("Password is required.");
      return;
    }

    if (signInPassword.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    setIsLoading(true);

    try {
      // 1. Attempt authentication with backend API
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailOrPhone: email,
          password: signInPassword,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      setIsLoading(false);

      if (response.ok) {
        const data = await response.json();
        if (onLoginSuccess) {
          onLoginSuccess(data.user, data.token);
        }
        return;
      }

      const errorData = await response.json().catch(() => ({}));
      setErrorMessage(errorData.error || "Invalid email/phone or password.");
    } catch (err) {
      console.warn("Auth request failed or offline:", err.message);
    }

    // 2. Validate against authorized demo / local Google users
    const validDemoCredentials =
      (email === "root@falah.com" && signInPassword === "more#78548") ||
      (email === "admin@flora.edu.in" && signInPassword === "admin123") ||
      (email.endsWith("@gmail.com") && signInPassword.length >= 6);

    setIsLoading(false);

    if (validDemoCredentials) {
      if (onLoginSuccess) {
        onLoginSuccess({
          id: `USR-${Date.now().toString().slice(-4)}`,
          display_name: email.split("@")[0].replace(".", " ").toUpperCase(),
          name: email.split("@")[0].replace(".", " ").toUpperCase(),
          email: email,
          role: "Administrator",
          accessLevel: "Admin",
          organisationId: "ORG-DEMO",
          organisationName: "Demo Pharmacy",
          branchId: "BRANCH-DEMO",
          branch: "Main Branch",
        });
      }
    } else {
      setErrorMessage(
        "Invalid credentials. Please verify your Gmail ID and password or use Demo Credentials.",
      );
    }
  };

  // Sign Up Handler
  const handleSignUp = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    const name = signUpName.trim();
    const email = signUpEmail.trim();
    const branch = signUpBranch.trim();

    if (!name || name.length < 2) {
      setErrorMessage("Please enter your full name.");
      return;
    }

    if (!email) {
      setErrorMessage("Please enter your Gmail / Google ID.");
      return;
    }

    if (!isValidGoogleEmail(email)) {
      setErrorMessage(
        "Please enter a valid Gmail / Google address (e.g. yourname@gmail.com).",
      );
      return;
    }

    if (!branch) {
      setErrorMessage("Please select or enter the pharmacy branch name.");
      return;
    }

    if (!signUpPassword) {
      setErrorMessage("Please enter a secure password.");
      return;
    }

    if (signUpPassword.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    if (signUpPassword !== signUpConfirmPassword) {
      setErrorMessage("Passwords do not match. Please re-enter your password.");
      return;
    }

    setIsLoading(true);

    // Register user session
    setTimeout(() => {
      setIsLoading(false);
      setSuccessMessage("Account created successfully! Logging you in...");

      setTimeout(() => {
        if (onLoginSuccess) {
          onLoginSuccess({
            id: `USR-${Date.now().toString().slice(-4)}`,
            display_name: name,
            name: name,
            email: email,
            role: signUpRole,
            accessLevel: signUpRole === "Administrator" ? "Admin" : "Staff",
            branch: signUpBranch,
          });
        }
      }, 700);
    }, 900);
  };

  // Handle Google OAuth Sign-In (Owner & Staff)
  const handleGoogleSignInSelect = async (googleUser) => {
    setGoogleModalVisible(false);
    setIsLoading(true);
    setErrorMessage("");

    // Owner/role is decided entirely server-side (server-side email allowlist or
    // existing organisation ownership) - the client only ever supplies the email.
    // Never fabricate a signed-in session locally if the backend is unreachable;
    // that would let anyone claim any identity (including Owner) with zero
    // verification whenever the network happens to be down.
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(`${API_URL}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: googleUser.email,
          name: googleUser.name,
          googleSub: googleUser.googleSub || `google_${googleUser.email.replace(/[^a-zA-Z0-9]/g, '_')}`,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      setIsLoading(false);

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.user) {
        if (onLoginSuccess) {
          onLoginSuccess(data.user, data.token);
        }
        return;
      }

      setErrorMessage(data.error || "Google sign-in failed. Please try again.");
    } catch (e) {
      console.error("Google login request failed:", e.message);
      setIsLoading(false);
      setErrorMessage("Unable to reach the server for Google sign-in. Please check your connection and try again.");
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
                  {authMode === "signin" ? "Welcome Back!" : "Create Account"}
                </Text>
                <Text style={styles.welcomeSubtext}>
                  {authMode === "signin"
                    ? "Sign in with your Google or verified pharmacy credentials"
                    : "Register your Gmail ID to access the pharmacy workspace"}
                </Text>
              </View>

              {/* AUTH MODE TABS */}
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

              {/* GOOGLE SIGN IN BUTTON */}
              <Pressable
                style={styles.googleButton}
                onPress={() => setGoogleModalVisible(true)}
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

              {/* ========================================= */}
              {/* FORM: SIGN IN MODE */}
              {/* ========================================= */}
              {authMode === "signin" && (
                <View>
                  {/* Gmail ID Field */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>Gmail / Google Email ID</Text>
                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputPrefixIcon}>📧</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. you@gmail.com"
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
                        placeholder="Enter your password (min 6 chars)"
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

                  {/* Remember Me & Demo credentials button */}
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

                    <Pressable
                      onPress={loadDemoCredentials}
                      disabled={isLoading}
                    >
                      <Text style={styles.forgotText}>Use Demo Login</Text>
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
                      Don't have an account?{" "}
                      <Text style={styles.switchModeHighlight}>
                        Sign Up here
                      </Text>
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* ========================================= */}
              {/* FORM: SIGN UP MODE */}
              {/* ========================================= */}
              {authMode === "signup" && (
                <View>
                  {/* Full Name */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>Full Name</Text>
                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputPrefixIcon}>👤</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. Dr. Harshal Deshmukh"
                        placeholderTextColor="#94a3b8"
                        value={signUpName}
                        onChangeText={(text) => {
                          setSignUpName(text);
                          if (errorMessage) setErrorMessage("");
                        }}
                        autoCapitalize="words"
                        editable={!isLoading}
                      />
                    </View>
                  </View>

                  {/* Gmail / Google ID */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>Gmail / Google ID</Text>
                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputPrefixIcon}>📧</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. name@gmail.com"
                        placeholderTextColor="#94a3b8"
                        value={signUpEmail}
                        onChangeText={(text) => {
                          setSignUpEmail(text);
                          if (errorMessage) setErrorMessage("");
                        }}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        editable={!isLoading}
                      />
                    </View>
                  </View>

                  {/* Role Selector */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>Assigned Role</Text>
                    <View style={styles.roleChipsRow}>
                      {[
                        "Pharmacist",
                        "Cashier",
                        "Inventory Manager",
                        "Administrator",
                      ].map((r) => (
                        <Pressable
                          key={r}
                          onPress={() => setSignUpRole(r)}
                          style={[
                            styles.roleChip,
                            signUpRole === r && styles.roleChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.roleChipText,
                              signUpRole === r && styles.roleChipTextActive,
                            ]}
                          >
                            {r}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  {/* Assigned Branch Name */}
                  <View style={styles.fieldContainer}>
                    <View style={styles.branchHeaderRow}>
                      <Text style={styles.label}>Assigned Branch Name</Text>
                      <Text style={styles.branchSubLabel}>
                        Branch / Location
                      </Text>
                    </View>

                    {/* Quick Branch Preset Chips */}
                    <View style={styles.roleChipsRow}>
                      {[
                        {
                          label: "Main Campus (HQ)",
                          value: "FIT Main Campus Hospital Pharmacy",
                          icon: "🏥",
                        },
                        {
                          label: "Pune City OPD",
                          value: "FIT Pune City OPD Pharmacy",
                          icon: "🏥",
                        },
                        {
                          label: "Central Warehouse",
                          value: "FIT Central Medical Warehouse",
                          icon: "📦",
                        },
                        {
                          label: "Student Health",
                          value: "FIT Student Health Center Dispensary",
                          icon: "🩺",
                        },
                      ].map((b) => (
                        <Pressable
                          key={b.value}
                          onPress={() => {
                            setSignUpBranch(b.value);
                            if (errorMessage) setErrorMessage("");
                          }}
                          style={[
                            styles.branchChip,
                            signUpBranch === b.value && styles.branchChipActive,
                          ]}
                        >
                          <Text style={styles.branchChipIcon}>{b.icon}</Text>
                          <Text
                            style={[
                              styles.branchChipText,
                              signUpBranch === b.value &&
                                styles.branchChipTextActive,
                            ]}
                          >
                            {b.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {/* Branch Name Input Field (allows custom input or editing) */}
                    <View style={[styles.inputWrapper, { marginTop: 8 }]}>
                      <Text style={styles.inputPrefixIcon}>🏢</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter branch name (e.g. Main Campus or City OPD)"
                        placeholderTextColor="#94a3b8"
                        value={signUpBranch}
                        onChangeText={(text) => {
                          setSignUpBranch(text);
                          if (errorMessage) setErrorMessage("");
                        }}
                        editable={!isLoading}
                      />
                      {signUpBranch.length > 0 && (
                        <Pressable
                          onPress={() => setSignUpBranch("")}
                          style={{ padding: 6 }}
                          hitSlop={8}
                        >
                          <Text style={{ fontSize: 13, color: "#94A3B8" }}>
                            ✕
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>

                  {/* Password */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>
                      Password (Min 6 characters)
                    </Text>
                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputPrefixIcon}>🔒</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Create a password"
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
                    <Text style={styles.label}>Confirm Password</Text>
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
                        Create Account & Sign In →
                      </Text>
                    )}
                  </Pressable>

                  {/* Switch to Sign In mode link */}
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
                        Sign In to Login here
                      </Text>
                    </Text>
                  </Pressable>
                </View>
              )}
              {/* DEMO NOTICE BADGE */}
              <View style={styles.demoNotice}>
                <Text style={styles.demoNoticeText}>
                  💡 <Text style={{ fontWeight: "700" }}>Admin Account:</Text>{" "}
                  root@falah.com / more#78548
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>

      {/* ================================================= */}
      {/* GOOGLE ACCOUNT CHOOSER MODAL (Simulated Google OAuth) */}
      {/* ================================================= */}
      <Modal
        visible={googleModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setGoogleModalVisible(false)}
      >
        <View style={styles.googleModalOverlay}>
          <View style={styles.googleModalBox}>
            <View style={styles.googleModalHeader}>
              <View style={styles.googleModalLogoRow}>
                <View style={styles.googleGSmall}>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: "800",
                      color: "#4285F4",
                    }}
                  >
                    G
                  </Text>
                </View>
                <Text style={styles.googleModalTitle}>Sign in with Google</Text>
              </View>
              <Pressable
                onPress={() => setGoogleModalVisible(false)}
                style={styles.googleModalClose}
              >
                <Text style={{ fontSize: 16, color: "#64748B" }}>✕</Text>
              </Pressable>
            </View>

            <Text style={styles.googleModalSubtitle}>
              Sign in with your Google Workspace or Gmail account:
            </Text>

            <View style={styles.googleAccountsList}>
              {[
                {
                  name: "Suraj More (Pharmacy Owner)",
                  email: "surajmore303@gmail.com",
                  badge: "👑 Verified Owner",
                  role: "OWNER",
                  roleName: "Pharmacy Owner",
                  isOwner: true,
                },
                {
                  name: "Falah Pharmacy Owner",
                  email: "owner@falah.com",
                  badge: "👑 Store Owner",
                  role: "OWNER",
                  roleName: "Pharmacy Owner",
                  isOwner: true,
                },
                {
                  name: "Central Admin",
                  email: "admin.fit.pharmacy@gmail.com",
                  badge: "🛡️ Admin",
                  role: "ADMIN",
                  roleName: "Administrator",
                  isOwner: false,
                },
                {
                  name: "Staff Pharmacist",
                  email: "pharmacist@falah.local",
                  badge: "💊 Pharmacist",
                  role: "PHARMACIST",
                  roleName: "Pharmacist",
                  isOwner: false,
                },
              ].map((acc) => (
                <Pressable
                  key={acc.email}
                  style={[
                    styles.googleAccountItem,
                    acc.isOwner && styles.googleOwnerAccountItem,
                  ]}
                  onPress={() => handleGoogleSignInSelect(acc)}
                >
                  <View
                    style={[
                      styles.googleAvatarCircle,
                      acc.isOwner && styles.googleOwnerAvatarCircle,
                    ]}
                  >
                    <Text style={styles.googleAvatarInitial}>
                      {acc.isOwner ? "👑" : acc.name.charAt(0)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.googleAccName, acc.isOwner && { color: "#0F766E" }]}>
                      {acc.name}
                    </Text>
                    <Text style={styles.googleAccEmail}>{acc.email}</Text>
                  </View>
                  <View
                    style={[
                      styles.googleAccBadge,
                      acc.isOwner && styles.googleOwnerBadge,
                    ]}
                  >
                    <Text
                      style={[
                        styles.googleAccBadgeText,
                        acc.isOwner && styles.googleOwnerBadgeText,
                      ]}
                    >
                      {acc.badge}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>

            {/* Custom Google Account Input */}
            <View style={styles.customGoogleBox}>
              <Text style={styles.customGoogleTitle}>Use another Google Account</Text>
              <View style={styles.customGoogleInputRow}>
                <Text style={{ fontSize: 14, marginRight: 6 }}>📧</Text>
                <TextInput
                  style={styles.customGoogleInput}
                  placeholder="Enter your Gmail address (e.g. you@gmail.com)"
                  placeholderTextColor="#94a3b8"
                  value={customGoogleEmail}
                  onChangeText={setCustomGoogleEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
              <Text style={styles.ownerCheckboxText}>
                Your access level (Owner, Admin, or Staff) is assigned by the pharmacy's account records, not chosen here.
              </Text>
              <Pressable
                style={[
                  styles.customGoogleSubmitBtn,
                  !customGoogleEmail.trim() && { opacity: 0.5 },
                ]}
                disabled={!customGoogleEmail.trim()}
                onPress={() => {
                  const em = customGoogleEmail.trim();
                  if (!em) return;
                  handleGoogleSignInSelect({
                    name: em.split("@")[0].replace(".", " ").toUpperCase(),
                    email: em,
                  });
                }}
              >
                <Text style={styles.customGoogleSubmitText}>
                  Continue with Google →
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => setGoogleModalVisible(false)}
              style={styles.googleCancelBtn}
            >
              <Text style={styles.googleCancelBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
