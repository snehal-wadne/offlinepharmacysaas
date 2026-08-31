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
} from "react-native";
import {
  Cloud,
  Eye,
  EyeOff,
  Headphones,
  LockKeyhole,
  Package,
  Pill,
  ShieldCheck,
  TrendingUp,
  User,
  Zap,
} from "lucide-react-native";
import { API_URL } from "../../config";

export default function LoginScreen({ onLoginSuccess }) {
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  
  // API Integration States
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const features = [
    {
      icon: TrendingUp,
      title: "Grow Your Business",
      description: "Real-time insights and reports",
    },
    {
      icon: Package,
      title: "Manage Inventory",
      description: "Track stock, batches & expiry",
    },
    {
      icon: Zap,
      title: "Fast Billing",
      description: "Quick checkout & invoice",
    },
    {
      icon: Cloud,
      title: "Offline First",
      description: "Work offline, sync when online",
    },
  ];

  const handleSignIn = async () => {
    // Clear previous errors
    setErrorMessage("");

    // Validation checks
    if (!emailOrPhone.trim()) {
      setErrorMessage("Please enter your email or phone number.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    setIsLoading(true);

    try {
      // POST login request to node Express API
      const response = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          emailOrPhone: emailOrPhone.trim(),
          password: password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed. Please check credentials.");
      }

      // Success flow: Pass user information up to AppNavigator
      if (onLoginSuccess) {
        onLoginSuccess(data.user);
      }
    } catch (err) {
      console.error("Login API request failed:", err);
      setErrorMessage(
        err.message === "Failed to fetch"
          ? "Cannot connect to the server. Please verify the backend is running."
          : err.message
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View
        style={[
          styles.container,
          isDesktop && styles.desktopContainer,
        ]}
      >
        {/* ================================================= */}
        {/* LEFT SIDE */}
        {/* ================================================= */}
        <View
          style={[
            styles.leftSection,
            isDesktop && styles.desktopLeft,
          ]}
        >
          {/* ORIGINAL PHARMACY IMAGE */}
          <Image
            source={require("../../../assets/pharmacy.png")}
            resizeMode="contain"
            style={styles.pharmacyImage}
          />

          {/* IMAGE BLENDING LAYER */}
          <View style={styles.imageBlend} />

          {/* LEFT CONTENT */}
          <View style={styles.leftContent}>
            {/* LOGO */}
            <View style={styles.logoRow}>
              <View style={styles.logoBox}>
                <Pill size={25} color="#167c68" />
              </View>
              <View>
                <Text style={styles.logoTitle}>FALAH</Text>
                <Text style={styles.logoSubtitle}>PHARMACY</Text>
              </View>
            </View>

            {/* MAIN CONTENT */}
            <View style={styles.mainContent}>
              <Text style={styles.mainHeading}>Pharmacy Billing</Text>
              <Text style={styles.greenHeading}>& Management</Text>
              <Text style={styles.tagline}>Simple. Smart. Reliable.</Text>
              <Text style={styles.description}>
                Manage your pharmacy sales, inventory, purchases, customers and
                reports from one powerful platform.
              </Text>

              {/* FEATURES */}
              <View style={styles.featuresContainer}>
                {features.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <View key={feature.title} style={styles.featureRow}>
                      <View style={styles.featureIconBox}>
                        <Icon size={21} color="#167c68" />
                      </View>
                      <View style={styles.featureText}>
                        <Text style={styles.featureTitle}>{feature.title}</Text>
                        <Text style={styles.featureDescription}>
                          {feature.description}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* FOOTER */}
            <View style={styles.footer}>
              <View style={styles.footerItem}>
                <View style={styles.footerTitleRow}>
                  <Headphones size={15} color="#167c68" />
                  <Text style={styles.footerTitle}>Need Help?</Text>
                </View>
                <Text style={styles.footerText}>
                  Contact support@falahpharmacy.com
                </Text>
              </View>

              <View style={styles.footerItemRight}>
                <View style={styles.footerTitleRow}>
                  <ShieldCheck size={15} color="#167c68" />
                  <Text style={styles.footerTitle}>Secure & Trusted</Text>
                </View>
                <Text style={styles.footerText}>
                  Your data is safe with us
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ================================================= */}
        {/* RIGHT SIDE */}
        {/* ================================================= */}
        <View
          style={[
            styles.rightSection,
            isDesktop && styles.desktopRight,
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.rightScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.loginCard}>
              {/* HEADING */}
              <View style={styles.headingContainer}>
                <Text style={styles.welcomeText}>Welcome Back!</Text>
                <Text style={styles.welcomeSubtext}>
                  Sign in to continue to your account
                </Text>
              </View>

              {/* ERROR MESSAGE DISPLAY */}
              {errorMessage ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              {/* EMAIL / PHONE */}
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>Email / Phone Number</Text>
                <View style={styles.inputWrapper}>
                  <User size={19} color="#94a3b8" />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter email or phone number"
                    placeholderTextColor="#94a3b8"
                    value={emailOrPhone}
                    onChangeText={(text) => {
                      setEmailOrPhone(text);
                      if (errorMessage) setErrorMessage("");
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isLoading}
                  />
                </View>
              </View>

              {/* PASSWORD */}
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.inputWrapper}>
                  <LockKeyhole size={19} color="#94a3b8" />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your password"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      if (errorMessage) setErrorMessage("");
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isLoading}
                    onSubmitEditing={handleSignIn}
                  />
                  <Pressable
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                  >
                    {showPassword ? (
                      <EyeOff size={19} color="#64748b" />
                    ) : (
                      <Eye size={19} color="#64748b" />
                    )}
                  </Pressable>
                </View>
              </View>

              {/* REMEMBER + FORGOT */}
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

                <Pressable disabled={isLoading}>
                  <Text style={styles.forgotText}>Forgot Password?</Text>
                </Pressable>
              </View>

              {/* SIGN IN */}
              <Pressable
                style={[styles.signInButton, isLoading && styles.disabledButton]}
                onPress={handleSignIn}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.signInText}>Sign In</Text>
                )}
              </Pressable>

              {/* OR */}
              <View style={styles.orContainer}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>OR</Text>
                <View style={styles.orLine} />
              </View>

              {/* GOOGLE */}
              <Pressable style={styles.googleButton} disabled={isLoading}>
                <Text style={styles.googleG}>G</Text>
                <Text style={styles.googleText}>Sign in with Google</Text>
              </Pressable>

              {/* SIGN UP */}
              <View style={styles.signupContainer}>
                <Text style={styles.signupText}>Don't have an account? </Text>
                <Pressable disabled={isLoading}>
                  <Text style={styles.signupLink}>Sign up</Text>
                </Pressable>
              </View>
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
    backgroundColor: "#f4faf8",
  },
  container: {
    flex: 1,
  },
  desktopContainer: {
    flexDirection: "row",
  },
  leftSection: {
    flex: 1,
    backgroundColor: "#eaf7f3",
    minHeight: 600,
    overflow: "hidden",
    position: "relative",
  },
  desktopLeft: {
    width: "52%",
  },
  pharmacyImage: {
    position: "absolute",
    width: 560,
    height: 500,
    right: -45,
    bottom: 20,
    opacity: 0.3,
    zIndex: 0,
  },
  imageBlend: {
    position: "absolute",
    right: -45,
    bottom: 20,
    width: 560,
    height: 500,
    backgroundColor: "rgba(234, 247, 243, 0.18)",
    zIndex: 1,
  },
  leftContent: {
    flex: 1,
    paddingHorizontal: 32,
    paddingVertical: 30,
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
    borderRadius: 16,
    backgroundColor: "#d9f0e9",
    alignItems: "center",
    justifyContent: "center",
  },
  logoTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#1f6f62",
  },
  logoSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 2.5,
    color: "#475569",
  },
  mainContent: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: 20,
  },
  mainHeading: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: "700",
    color: "#1e293b",
  },
  greenHeading: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: "700",
    color: "#167c68",
  },
  tagline: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: "600",
    color: "#475569",
  },
  description: {
    marginTop: 12,
    maxWidth: 500,
    fontSize: 14,
    lineHeight: 23,
    color: "#475569",
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
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#c7e4dc",
    backgroundColor: "rgba(255,255,255,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e293b",
  },
  featureDescription: {
    marginTop: 2,
    fontSize: 12,
    color: "#64748b",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 15,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#c7e4dc",
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
    gap: 4,
  },
  footerTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#167c68",
  },
  footerText: {
    marginTop: 4,
    fontSize: 11,
    color: "#475569",
  },
  rightSection: {
    flex: 1,
    backgroundColor: "#f7fbfa",
  },
  desktopRight: {
    width: "48%",
    justifyContent: "center",
  },
  rightScroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 30,
  },
  loginCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    paddingHorizontal: 36,
    paddingVertical: 32,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 6,
  },
  headingContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  welcomeText: {
    fontSize: 30,
    fontWeight: "700",
    color: "#1e293b",
  },
  welcomeSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: "#64748b",
  },
  errorContainer: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 13,
    fontWeight: "600",
  },
  fieldContainer: {
    marginTop: 20,
  },
  label: {
    marginBottom: 8,
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },
  inputWrapper: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: "#ffffff",
  },
  input: {
    flex: 1,
    marginLeft: 10,
    paddingVertical: 0,
    fontSize: 14,
    color: "#1e293b",
  },
  eyeButton: {
    padding: 4,
  },
  rememberRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rememberButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkbox: {
    width: 17,
    height: 17,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: "#167c68",
    borderColor: "#167c68",
  },
  checkMark: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
  },
  rememberText: {
    fontSize: 13,
    color: "#475569",
  },
  forgotText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#167c68",
  },
  signInButton: {
    marginTop: 20,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#167c68",
    alignItems: "center",
    justifyContent: "center",
  },
  disabledButton: {
    backgroundColor: "#8cc3b7",
  },
  signInText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
  },
  orContainer: {
    marginVertical: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#e2e8f0",
  },
  orText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#64748b",
  },
  googleButton: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
  },
  googleG: {
    fontSize: 20,
    fontWeight: "700",
    color: "#4285F4",
  },
  googleText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#334155",
  },
  signupContainer: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  signupText: {
    fontSize: 13,
    color: "#64748b",
  },
  signupLink: {
    fontSize: 13,
    fontWeight: "600",
    color: "#167c68",
  },
});
