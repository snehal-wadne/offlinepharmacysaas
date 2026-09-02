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
  Platform,
} from "react-native";
import { API_URL } from "../../config";

export default function LoginScreen({ onLoginSuccess }) {
  const [emailOrPhone, setEmailOrPhone] = useState("admin@flora.edu.in");
  const [password, setPassword] = useState("admin123");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // API Integration States
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

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

  const handleSignIn = async () => {
    setErrorMessage("");

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
      // Try backend if running, otherwise fall back to instant mock login
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          emailOrPhone: emailOrPhone.trim(),
          password: password,
        }),
        signal: controller.signal,
      }).catch(() => null);

      clearTimeout(timeoutId);

      if (response && response.ok) {
        const data = await response.json();
        if (onLoginSuccess) {
          onLoginSuccess(data.user);
        }
        return;
      }
    } catch (err) {
      // Fall through to mock login
    } finally {
      setIsLoading(false);
    }

    // Default Instant Offline / Mock Login Success
    if (onLoginSuccess) {
      onLoginSuccess({
        id: "USR-102",
        display_name: "Pooja Deshmukh",
        name: "Pooja Deshmukh",
        email: emailOrPhone.trim() || "pooja.d@flora.edu.in",
        role: "Administrator",
        branch: "Main Campus Hospital Pharmacy",
      });
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
                <Text style={styles.logoIconText}>💊</Text>
              </View>
              <View>
                <Text style={styles.logoTitle}>FLORA INSTITUTE</Text>
                <Text style={styles.logoSubtitle}>PHARMACY BILLING & ERP</Text>
              </View>
            </View>

            {/* MAIN CONTENT */}
            <View style={styles.mainContent}>
              <Text style={styles.mainHeading}>Pharmacy Billing</Text>
              <Text style={styles.greenHeading}>& Management</Text>
              <Text style={styles.tagline}>Simple. Smart. Reliable.</Text>
              <Text style={styles.description}>
                Manage your pharmacy sales, inventory, purchases, branch users, and
                reports across Flora Institute of Technology.
              </Text>

              {/* FEATURES */}
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

            {/* FOOTER */}
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
                  <Text style={styles.footerTitle}>Secure & Trusted</Text>
                </View>
                <Text style={styles.footerText}>
                  FIT Institutional Cloud
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
                  Sign in to access your pharmacy workspace
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
                  <Text style={styles.inputPrefixIcon}>👤</Text>
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
                  <Text style={styles.inputPrefixIcon}>🔒</Text>
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
                    <Text style={styles.eyeIcon}>{showPassword ? "🙈" : "👁️"}</Text>
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
                  <Text style={styles.signInText}>Sign In / Launch ERP →</Text>
                )}
              </Pressable>

              {/* DEMO BADGE */}
              <View style={styles.demoNotice}>
                <Text style={styles.demoNoticeText}>
                  💡 Demo credentials loaded. Click <b>Sign In</b> to enter.
                </Text>
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
    borderRadius: 12,
    backgroundColor: "#d9f0e9",
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
    fontSize: 38,
    lineHeight: 44,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.5,
  },
  greenHeading: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: "800",
    color: "#0F766E",
    letterSpacing: -0.5,
  },
  tagline: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "600",
    color: "#475569",
  },
  description: {
    marginTop: 12,
    maxWidth: 500,
    fontSize: 13.5,
    lineHeight: 22,
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
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#c7e4dc",
    backgroundColor: "rgba(255,255,255,0.72)",
    alignItems: "center",
    justifyContent: "center",
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
    color: "#0F172A",
  },
  featureDescription: {
    marginTop: 1,
    fontSize: 12,
    color: "#64748B",
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
    gap: 6,
  },
  footerIcon: {
    fontSize: 13,
  },
  footerTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F766E",
  },
  footerText: {
    marginTop: 3,
    fontSize: 11,
    color: "#64748B",
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
    maxWidth: 480,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    paddingHorizontal: 32,
    paddingVertical: 32,
    ...Platform.select({
      web: {
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08)",
      },
    }),
  },
  headingContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  welcomeText: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0F172A",
  },
  welcomeSubtext: {
    marginTop: 6,
    fontSize: 13.5,
    color: "#64748B",
  },
  errorContainer: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 12.5,
    fontWeight: "600",
  },
  fieldContainer: {
    marginTop: 16,
  },
  label: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
  },
  inputWrapper: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#ffffff",
  },
  inputPrefixIcon: {
    fontSize: 15,
    marginRight: 6,
  },
  input: {
    flex: 1,
    fontSize: 13.5,
    color: "#0F172A",
    outlineStyle: "none",
  },
  eyeButton: {
    padding: 4,
    cursor: "pointer",
  },
  eyeIcon: {
    fontSize: 14,
  },
  rememberRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rememberButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
  },
  checkbox: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  checkMark: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
  },
  rememberText: {
    fontSize: 12.5,
    color: "#475569",
  },
  forgotText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#0F766E",
  },
  signInButton: {
    marginTop: 20,
    height: 46,
    borderRadius: 10,
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  disabledButton: {
    backgroundColor: "#8cc3b7",
  },
  signInText: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#ffffff",
  },
  demoNotice: {
    marginTop: 16,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#99F6E4",
    alignItems: "center",
  },
  demoNoticeText: {
    fontSize: 12,
    color: "#0F766E",
  },
});
