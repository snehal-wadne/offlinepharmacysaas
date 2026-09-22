import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StatusBar,
  StyleSheet,
  Platform,
  Pressable,
} from "react-native";
import AppNavigator from "./src/navigation/AppNavigator";
import SuperAdminLayout from "./src/app/superadmin/_layout";

function isSuperAdminUrl() {
  if (typeof window !== "undefined" && window.location) {
    const path = (window.location.pathname || "").toLowerCase();
    const hash = (window.location.hash || "").toLowerCase();
    return (
      path.startsWith("/superadmin") ||
      hash.startsWith("#/superadmin") ||
      hash.startsWith("#superadmin")
    );
  }
  return false;
}

// Patch history so pushState / replaceState also trigger our listener
function patchHistory(callback) {
  if (typeof window === "undefined") return () => {};
  const origPush = window.history.pushState.bind(window.history);
  const origReplace = window.history.replaceState.bind(window.history);
  window.history.pushState = (...args) => {
    origPush(...args);
    callback();
  };
  window.history.replaceState = (...args) => {
    origReplace(...args);
    callback();
  };
  return () => {
    window.history.pushState = origPush;
    window.history.replaceState = origReplace;
  };
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(
      "PharmaFlow ERP ErrorBoundary caught error:",
      error,
      errorInfo,
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorTitle}>Application Render Error</Text>
          <Text style={styles.errorMessage}>
            {this.state.error?.message || String(this.state.error)}
          </Text>
          <Pressable
            onPress={() => this.setState({ hasError: false, error: null })}
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>Reload Application</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [isSuperAdmin, setIsSuperAdmin] = useState(isSuperAdminUrl);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const updateDocumentTitle = () => {
        const path = window.location.pathname || "/";
        const pageName = path
          .split("/")
          .filter(Boolean)
          .pop()
          ?.replace(/[-_]/g, " ")
          .replace(/\b\w/g, (letter) => letter.toUpperCase());
        document.title = pageName
          ? `PharmaFlow | ${pageName}`
          : "PharmaFlow ERP";
      };

      const handleLocationChange = () => {
        setIsSuperAdmin(isSuperAdminUrl());
        updateDocumentTitle();
      };

      // Listen to back/forward browser navigation
      window.addEventListener("popstate", handleLocationChange);
      updateDocumentTitle();

      // Also patch pushState / replaceState (used by the expo-router shim)
      const unpatch = patchHistory(handleLocationChange);

      return () => {
        window.removeEventListener("popstate", handleLocationChange);
        unpatch();
      };
    }
  }, []);

  return (
    <ErrorBoundary>
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        {isSuperAdmin ? <SuperAdminLayout /> : <AppNavigator />}
      </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    ...Platform.select({
      web: {
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
      },
    }),
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#FEF2F2",
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#991B1B",
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 13,
    color: "#B91C1C",
    textAlign: "center",
    maxWidth: 600,
    marginBottom: 20,
    fontFamily: Platform.select({ web: "monospace", default: "System" }),
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  retryButton: {
    backgroundColor: "#0F766E",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    cursor: "pointer",
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
});
