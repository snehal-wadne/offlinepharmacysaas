import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Animated } from "react-native";
import { connectivityService } from "../../sync/connectivityService";

export default function GlobalNetworkBanner() {
  const [isOnline, setIsOnline] = useState(() => {
    return typeof navigator !== "undefined" ? navigator.onLine : true;
  });
  const [justReconnected, setJustReconnected] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const reconnectedTimerRef = useRef(null);

  useEffect(() => {
    // 1. Initial status check
    const initialStatus =
      typeof navigator !== "undefined" ? navigator.onLine : true;
    setIsOnline(initialStatus);

    // 2. Browser native online/offline event handlers (0ms immediate reaction)
    const handleNativeOnline = () => {
      connectivityService.checkConnectivityNow(true).then((online) => {
        setIsOnline(online);
        if (online) {
          triggerReconnectedBanner();
        }
      });
    };

    const handleNativeOffline = () => {
      setIsOnline(false);
      setJustReconnected(false);
      connectivityService.handleNetworkFailure();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleNativeOnline);
      window.addEventListener("offline", handleNativeOffline);
    }

    // 3. Subscribe to connectivityService updates
    const unsubscribe = connectivityService.onConnectivityChange((status) => {
      setIsOnline((prev) => {
        if (!prev && status) {
          triggerReconnectedBanner();
        }
        return status;
      });
    });

    // 4. Periodic background health probe (every 6 seconds) to catch router/proxy disconnects
    const pollInterval = setInterval(() => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setIsOnline(false);
        return;
      }
      connectivityService.checkConnectivityNow().catch(() => {});
    }, 6000);

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleNativeOnline);
        window.removeEventListener("offline", handleNativeOffline);
      }
      unsubscribe();
      clearInterval(pollInterval);
      if (reconnectedTimerRef.current) {
        clearTimeout(reconnectedTimerRef.current);
      }
    };
  }, []);

  const triggerReconnectedBanner = () => {
    setJustReconnected(true);
    if (reconnectedTimerRef.current) {
      clearTimeout(reconnectedTimerRef.current);
    }
    reconnectedTimerRef.current = setTimeout(() => {
      setJustReconnected(false);
    }, 4000);
  };

  const handleManualCheck = async () => {
    setIsChecking(true);
    try {
      const online = await connectivityService.checkConnectivityNow(true);
      setIsOnline(online);
      if (online) {
        triggerReconnectedBanner();
      }
    } finally {
      setIsChecking(false);
    }
  };

  // If online and not recently reconnected, don't render anything
  if (isOnline && !justReconnected) {
    return null;
  }

  // Green Reconnected Banner
  if (justReconnected && isOnline) {
    return (
      <View style={[styles.banner, styles.bannerOnline]}>
        <View style={styles.contentRow}>
          <View style={[styles.statusDot, styles.dotOnline]} />
          <Text style={styles.onlineText}>
            <Text style={styles.boldText}>Back Online:</Text> Internet connection restored. Synchronizing offline data...
          </Text>
        </View>
      </View>
    );
  }

  // Red/Amber Offline Banner
  return (
    <View style={[styles.banner, styles.bannerOffline]}>
      <View style={styles.contentRow}>
        <View style={[styles.statusDot, styles.dotOffline]} />
        <View style={styles.textContainer}>
          <Text style={styles.offlineTitle}>
            <Text style={styles.boldText}>OFFLINE MODE:</Text> No internet connection detected.
          </Text>
          <Text style={styles.offlineSubtitle}>
            System is running in authoritative offline mode. All billing & inventory entries are saved locally and will auto-sync when back online.
          </Text>
        </View>
      </View>

      <Pressable
        onPress={handleManualCheck}
        style={styles.retryButton}
        disabled={isChecking}
        accessibilityRole="button"
        accessibilityLabel="Check connection status"
      >
        <Text style={styles.retryButtonText}>
          {isChecking ? "Checking..." : "Check Status"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: "100%",
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 99999,
    ...Platform.select({
      web: {
        position: "sticky",
        top: 0,
        boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
      },
    }),
  },
  bannerOffline: {
    backgroundColor: "#991B1B", // Strong, clear Red for high visibility
    borderBottomWidth: 1,
    borderBottomColor: "#7F1D1D",
  },
  bannerOnline: {
    backgroundColor: "#166534", // Green banner
    borderBottomWidth: 1,
    borderBottomColor: "#14532D",
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  dotOffline: {
    backgroundColor: "#FCA5A5",
  },
  dotOnline: {
    backgroundColor: "#86EFAC",
  },
  textContainer: {
    flex: 1,
  },
  boldText: {
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  offlineTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  offlineSubtitle: {
    color: "#FECACA",
    fontSize: 11,
    marginTop: 2,
    fontWeight: "500",
  },
  onlineText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  retryButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.4)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    cursor: "pointer",
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
});
