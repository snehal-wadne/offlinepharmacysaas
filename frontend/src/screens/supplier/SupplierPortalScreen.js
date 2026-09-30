import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  Modal,
} from "react-native";
import { API_URL } from "../../config";

export default function SupplierPortalScreen({ currentUser, onSignOut }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Active view tab: 'requests' | 'analytics' | 'catalog' | 'profile'
  const [activeTab, setActiveTab] = useState("requests");

  // Filter & Search states
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Data states
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [stats, setStats] = useState({
    totalRequests: 0,
    pendingRequests: 0,
    urgentAlerts: 0,
    inTransit: 0,
    delivered: 0,
    branchesCount: 0,
  });
  const [supplierProfile, setSupplierProfile] = useState(null);
  const [catalogItems, setCatalogItems] = useState([]);
  const [toastMessage, setToastMessage] = useState("");

  // Action Modal State (for updating status with optional notes)
  const [selectedNotif, setSelectedNotif] = useState(null);
  const [actionTargetStatus, setActionTargetStatus] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 4000);
  };

  const getAuthToken = () => {
    if (currentUser?.token) return currentUser.token;
    if (typeof window !== "undefined") {
      return (
        window.localStorage?.getItem("authToken") ||
        window.sessionStorage?.getItem("authToken")
      );
    }
    return null;
  };

  const loadPortalData = useCallback(async () => {
    try {
      const token = getAuthToken();
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // 1. Fetch Dashboard Stats & Profile
      const dashPromise = fetch(`${API_URL}/api/suppliers/portal/dashboard`, {
        headers,
      }).then((r) => (r.ok ? r.json() : null));

      // 2. Fetch Reorder Notifications
      const notifUrl = `${API_URL}/api/suppliers/portal/notifications?status=${statusFilter}&search=${encodeURIComponent(
        searchQuery,
      )}`;
      const notifPromise = fetch(notifUrl, { headers }).then((r) =>
        r.ok ? r.json() : null,
      );

      // 3. Fetch Catalog
      const catPromise = fetch(`${API_URL}/api/suppliers/portal/catalog`, {
        headers,
      }).then((r) => (r.ok ? r.json() : null));

      const [dashData, notifData, catData] = await Promise.all([
        dashPromise,
        notifPromise,
        catPromise,
      ]);

      if (dashData?.success) {
        setStats(dashData.stats || {});
        if (dashData.supplier) {
          setSupplierProfile(dashData.supplier);
        }
      }

      if (notifData?.success && Array.isArray(notifData.data)) {
        setNotifications(notifData.data);
      }

      if (catData?.success && Array.isArray(catData.data)) {
        setCatalogItems(catData.data);
      }
    } catch (err) {
      console.warn("Error loading supplier portal data:", err.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    loadPortalData();
  }, [loadPortalData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadPortalData();
  };

  // Status Change Handler
  const handleUpdateStatus = async (notif, targetStatus, customNotes = "") => {
    try {
      setIsSubmittingAction(true);
      const token = getAuthToken();
      const response = await fetch(
        `${API_URL}/api/suppliers/portal/notifications/${notif.id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            status: targetStatus,
            notes: customNotes || actionNotes || undefined,
          }),
        },
      );

      const result = await response.json();
      setIsSubmittingAction(false);
      setSelectedNotif(null);
      setActionNotes("");

      if (response.ok && result.success) {
        const statusLabel =
          targetStatus === "ACKNOWLEDGED"
            ? "Order Acknowledged & Preparing"
            : targetStatus === "IN_TRANSIT"
            ? "Order Dispatched / In Transit"
            : targetStatus === "DELIVERED"
            ? "Marked Delivered to Branch"
            : targetStatus;
        showToast(`✓ ${notif.medicineName}: ${statusLabel}`);
        loadPortalData();
      } else {
        showToast(`❌ Failed: ${result.error || "Could not update status"}`);
      }
    } catch (err) {
      setIsSubmittingAction(false);
      showToast(`❌ Error: ${err.message}`);
    }
  };

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case "SENT":
        return { bg: "#FEF3C7", text: "#92400E", border: "#FCD34D", label: "🟡 New Request" };
      case "ACKNOWLEDGED":
        return { bg: "#EFF6FF", text: "#1E40AF", border: "#BFDBFE", label: "🔵 Acknowledged / In Prep" };
      case "IN_TRANSIT":
        return { bg: "#F0FDF4", text: "#166534", border: "#BBF7D0", label: "🚚 Dispatched / In Transit" };
      case "DELIVERED":
        return { bg: "#ECFDF5", text: "#065F46", border: "#A7F3D0", label: "✅ Delivered & Stocked" };
      default:
        return { bg: "#F3F4F6", text: "#374151", border: "#E5E7EB", label: status };
    }
  };

  const companyDisplayName =
    supplierProfile?.name ||
    currentUser?.supplierName ||
    currentUser?.companyName ||
    "Authorized Medicine Supplier";

  return (
    <View style={styles.container}>
      {/* Toast Notification */}
      {Boolean(toastMessage) && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      {/* TOP SUPPLIER HEADER BAR */}
      <View style={styles.headerBar}>
        <View style={styles.headerLeft}>
          <View style={styles.supplierLogoBox}>
            <Text style={styles.supplierLogoIcon}>🚚</Text>
          </View>
          <View>
            <View style={styles.companyTitleRow}>
              <Text style={styles.companyNameText}>{companyDisplayName}</Text>
              <View style={styles.supplierRoleBadge}>
                <Text style={styles.supplierRoleText}>VERIFIED DISTRIBUTOR</Text>
              </View>
            </View>
            <Text style={styles.companySubText}>
              B2B Pharmacy Replenishment & Supply Order Portal
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <Pressable
            style={styles.refreshButton}
            onPress={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color="#0F766E" />
            ) : (
              <Text style={styles.refreshButtonText}>🔄 Refresh Alerts</Text>
            )}
          </Pressable>

          <View style={styles.userProfilePill}>
            <Text style={styles.userProfileAvatar}>👤</Text>
            <View>
              <Text style={styles.userProfileName}>
                {currentUser?.name || supplierProfile?.contactPerson || "Supplier Agent"}
              </Text>
              <Text style={styles.userProfileEmail}>
                {currentUser?.email || supplierProfile?.email || "supplier@portal"}
              </Text>
            </View>
          </View>

          <Pressable
            style={styles.signOutButton}
            onPress={() => {
              if (onSignOut) onSignOut();
              else if (typeof window !== "undefined") {
                window.localStorage?.removeItem("authToken");
                window.location.reload();
              }
            }}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>
      </View>

      {/* METRIC KPI BANNER CARDS */}
      <View style={styles.metricsBanner}>
        <View style={[styles.kpiCard, styles.kpiCardPending]}>
          <View style={styles.kpiTopRow}>
            <Text style={styles.kpiIcon}>🔔</Text>
            <Text style={styles.kpiValue}>{stats.pendingRequests || 0}</Text>
          </View>
          <Text style={styles.kpiLabel}>Pending Replenishment Requests</Text>
          <Text style={styles.kpiSub}>Awaiting supplier dispatch</Text>
        </View>

        <View style={[styles.kpiCard, styles.kpiCardUrgent]}>
          <View style={styles.kpiTopRow}>
            <Text style={styles.kpiIcon}>🚨</Text>
            <Text style={[styles.kpiValue, { color: "#DC2626" }]}>
              {stats.urgentAlerts || 0}
            </Text>
          </View>
          <Text style={styles.kpiLabel}>Critical Stock Depletions</Text>
          <Text style={styles.kpiSub}>High-priority urgent orders</Text>
        </View>

        <View style={[styles.kpiCard, styles.kpiCardTransit]}>
          <View style={styles.kpiTopRow}>
            <Text style={styles.kpiIcon}>🚚</Text>
            <Text style={[styles.kpiValue, { color: "#2563EB" }]}>
              {stats.inTransit || 0}
            </Text>
          </View>
          <Text style={styles.kpiLabel}>Dispatched In-Transit</Text>
          <Text style={styles.kpiSub}>Orders on the way to branches</Text>
        </View>

        <View style={[styles.kpiCard, styles.kpiCardBranches]}>
          <View style={styles.kpiTopRow}>
            <Text style={styles.kpiIcon}>🏥</Text>
            <Text style={[styles.kpiValue, { color: "#0F766E" }]}>
              {stats.branchesCount || 0}
            </Text>
          </View>
          <Text style={styles.kpiLabel}>Active Requesting Branches</Text>
          <Text style={styles.kpiSub}>Independent pharmacy stores</Text>
        </View>
      </View>

      {/* NAVIGATION TABS */}
      <View style={styles.tabsRow}>
        <Pressable
          style={[
            styles.tabButton,
            activeTab === "requests" && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab("requests")}
        >
          <Text
            style={[
              styles.tabButtonText,
              activeTab === "requests" && styles.tabButtonTextActive,
            ]}
          >
            📋 Branch Reorder Alerts & Orders
          </Text>
          {stats.pendingRequests > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{stats.pendingRequests}</Text>
            </View>
          )}
        </Pressable>

        <Pressable
          style={[
            styles.tabButton,
            activeTab === "catalog" && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab("catalog")}
        >
          <Text
            style={[
              styles.tabButtonText,
              activeTab === "catalog" && styles.tabButtonTextActive,
            ]}
          >
            📦 Supplied Medicines Catalog ({catalogItems.length})
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.tabButton,
            activeTab === "profile" && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab("profile")}
        >
          <Text
            style={[
              styles.tabButtonText,
              activeTab === "profile" && styles.tabButtonTextActive,
            ]}
          >
            🏢 Distributor Credentials & Terms
          </Text>
        </Pressable>
      </View>

      {/* MAIN CONTENT AREA */}
      <ScrollView
        style={styles.mainContent}
        contentContainerStyle={styles.contentContainer}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0F766E" />
            <Text style={styles.loadingText}>
              Loading live supplier alerts and reorders...
            </Text>
          </View>
        ) : activeTab === "requests" ? (
          /* TAB 1: REORDER REQUESTS LIST */
          <View>
            {/* Filter and Search Bar */}
            <View style={styles.filterBar}>
              <View style={styles.searchBox}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by medicine, branch name, or SKU..."
                  placeholderTextColor="#94A3B8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {Boolean(searchQuery) && (
                  <Pressable onPress={() => setSearchQuery("")}>
                    <Text style={styles.clearSearch}>✕</Text>
                  </Pressable>
                )}
              </View>

              <View style={styles.filterPillsRow}>
                {[
                  { id: "ALL", label: "All Requests" },
                  { id: "SENT", label: "🟡 New (Sent)" },
                  { id: "ACKNOWLEDGED", label: "🔵 Acknowledged" },
                  { id: "IN_TRANSIT", label: "🚚 In Transit" },
                  { id: "DELIVERED", label: "✅ Delivered" },
                ].map((f) => (
                  <Pressable
                    key={f.id}
                    style={[
                      styles.filterPill,
                      statusFilter === f.id && styles.filterPillActive,
                    ]}
                    onPress={() => setStatusFilter(f.id)}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        statusFilter === f.id && styles.filterPillTextActive,
                      ]}
                    >
                      {f.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Notifications List */}
            {notifications.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🎉</Text>
                <Text style={styles.emptyTitle}>All Caught Up!</Text>
                <Text style={styles.emptySubtitle}>
                  No pending reorder alerts found for this filter. Pharmacy
                  branches will notify you automatically when stock runs low.
                </Text>
              </View>
            ) : (
              <View style={styles.notificationGrid}>
                {notifications.map((item) => {
                  const badge = getStatusBadgeStyle(item.status);
                  const isUrgent = item.priority === "URGENT";

                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.notifCard,
                        isUrgent && styles.notifCardUrgentBorder,
                      ]}
                    >
                      {/* Card Header */}
                      <View style={styles.notifCardHeader}>
                        <View style={styles.branchPill}>
                          <Text style={styles.branchPillIcon}>🏥</Text>
                          <Text style={styles.branchPillText}>
                            {item.branchName || "Main Branch"}
                          </Text>
                          {Boolean(item.branchCity) && (
                            <Text style={styles.branchPillCity}>
                              • {item.branchCity}
                            </Text>
                          )}
                        </View>

                        <View style={styles.headerBadgesRow}>
                          {isUrgent && (
                            <View style={styles.urgentPill}>
                              <Text style={styles.urgentPillText}>
                                🔴 CRITICAL URGENT
                              </Text>
                            </View>
                          )}
                          <View
                            style={[
                              styles.statusBadge,
                              {
                                backgroundColor: badge.bg,
                                borderColor: badge.border,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                { color: badge.text },
                              ]}
                            >
                              {badge.label}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Card Body */}
                      <View style={styles.notifCardBody}>
                        <View style={styles.medicineInfoCol}>
                          <Text style={styles.medicineName}>
                            {item.medicineName}
                          </Text>
                          <Text style={styles.skuText}>
                            SKU: {item.sku} • Priority: {item.priority}
                          </Text>
                        </View>

                        <View style={styles.stockQtyStatsRow}>
                          <View style={styles.stockStatBox}>
                            <Text style={styles.stockStatLabel}>
                              Branch Stock Remaining
                            </Text>
                            <Text
                              style={[
                                styles.stockStatValue,
                                item.currentStock <= 5 && { color: "#DC2626" },
                              ]}
                            >
                              {item.currentStock} units
                            </Text>
                          </View>

                          <View style={styles.reorderStatBox}>
                            <Text style={styles.reorderStatLabel}>
                              Requested Reorder Qty
                            </Text>
                            <Text style={styles.reorderStatValue}>
                              {item.reorderQuantity} units
                            </Text>
                          </View>
                        </View>

                        {/* Order Message */}
                        {Boolean(item.message) && (
                          <View style={styles.messageBox}>
                            <Text style={styles.messageLabel}>
                              Note from Branch Pharmacist:
                            </Text>
                            <Text style={styles.messageText}>
                              {item.message}
                            </Text>
                          </View>
                        )}

                        <Text style={styles.timestampText}>
                          Alert Received:{" "}
                          {item.createdAt
                            ? new Date(item.createdAt).toLocaleString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "Recently"}
                        </Text>
                      </View>

                      {/* Supplier Action Bar */}
                      <View style={styles.notifActionBar}>
                        {item.status === "SENT" && (
                          <Pressable
                            style={[styles.actionBtn, styles.btnAcknowledge]}
                            onPress={() =>
                              handleUpdateStatus(item, "ACKNOWLEDGED")
                            }
                          >
                            <Text style={styles.btnAcknowledgeText}>
                              ✓ Acknowledge & Prepare Order
                            </Text>
                          </Pressable>
                        )}

                        {item.status === "ACKNOWLEDGED" && (
                          <Pressable
                            style={[styles.actionBtn, styles.btnDispatch]}
                            onPress={() => {
                              setSelectedNotif(item);
                              setActionTargetStatus("IN_TRANSIT");
                            }}
                          >
                            <Text style={styles.btnDispatchText}>
                              🚚 Dispatch Order / Mark In-Transit
                            </Text>
                          </Pressable>
                        )}

                        {item.status === "IN_TRANSIT" && (
                          <Pressable
                            style={[styles.actionBtn, styles.btnDelivered]}
                            onPress={() =>
                              handleUpdateStatus(item, "DELIVERED")
                            }
                          >
                            <Text style={styles.btnDeliveredText}>
                              ✅ Confirm Delivered to Pharmacy
                            </Text>
                          </Pressable>
                        )}

                        {item.status === "DELIVERED" && (
                          <View style={styles.deliveredCompleteBadge}>
                            <Text style={styles.deliveredCompleteText}>
                              ✓ Replenishment Complete & Received at Branch
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : activeTab === "catalog" ? (
          /* TAB 2: MEDICINE CATALOG */
          <View style={styles.tabContentCard}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardHeaderTitle}>
                  Supplied Medicines Catalog
                </Text>
                <Text style={styles.cardHeaderSub}>
                  Medicines and consumables configured for your supply network
                </Text>
              </View>
            </View>

            {catalogItems.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📦</Text>
                <Text style={styles.emptyTitle}>No Catalog Items</Text>
                <Text style={styles.emptySubtitle}>
                  Products linked to your distributor account will appear here.
                </Text>
              </View>
            ) : (
              <View style={styles.catalogTable}>
                <View style={styles.catalogTableHeader}>
                  <Text style={[styles.catalogTh, { flex: 2 }]}>
                    Medicine Name
                  </Text>
                  <Text style={[styles.catalogTh, { flex: 1 }]}>SKU</Text>
                  <Text style={[styles.catalogTh, { flex: 1.5 }]}>
                    Category
                  </Text>
                  <Text style={[styles.catalogTh, { flex: 1 }]}>Unit Price</Text>
                  <Text style={[styles.catalogTh, { flex: 1 }]}>MRP</Text>
                  <Text style={[styles.catalogTh, { flex: 1 }]}>
                    Stock on Hand
                  </Text>
                </View>

                {catalogItems.map((prod, idx) => (
                  <View
                    key={prod.id || idx}
                    style={[
                      styles.catalogTableRow,
                      idx % 2 === 1 && styles.catalogTableRowAlt,
                    ]}
                  >
                    <View style={{ flex: 2 }}>
                      <Text style={styles.prodName}>{prod.name}</Text>
                      {Boolean(prod.genericName) && (
                        <Text style={styles.prodGeneric}>
                          {prod.genericName}
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.prodSku, { flex: 1 }]}>
                      {prod.sku || "N/A"}
                    </Text>
                    <Text style={[styles.prodCat, { flex: 1.5 }]}>
                      {prod.category || "General"}
                    </Text>
                    <Text style={[styles.prodPrice, { flex: 1 }]}>
                      ₹{Number(prod.unitPrice || 0).toFixed(2)}
                    </Text>
                    <Text style={[styles.prodMrp, { flex: 1 }]}>
                      ₹{Number(prod.mrp || 0).toFixed(2)}
                    </Text>
                    <Text style={[styles.prodStock, { flex: 1 }]}>
                      {prod.currentStock || 0} units
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : (
          /* TAB 3: DISTRIBUTOR PROFILE */
          <View style={styles.tabContentCard}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardHeaderTitle}>
                  Distributor Registration & Terms
                </Text>
                <Text style={styles.cardHeaderSub}>
                  Official B2B supplier identity registered in the pharmacy network
                </Text>
              </View>
            </View>

            <View style={styles.profileGrid}>
              <View style={styles.profileItem}>
                <Text style={styles.profileItemLabel}>Company Name</Text>
                <Text style={styles.profileItemVal}>
                  {supplierProfile?.name || companyDisplayName}
                </Text>
              </View>

              <View style={styles.profileItem}>
                <Text style={styles.profileItemLabel}>
                  Contact Person / Representative
                </Text>
                <Text style={styles.profileItemVal}>
                  {supplierProfile?.contactPerson || currentUser?.name || "N/A"}
                </Text>
              </View>

              <View style={styles.profileItem}>
                <Text style={styles.profileItemLabel}>Registered Email</Text>
                <Text style={styles.profileItemVal}>
                  {supplierProfile?.email || currentUser?.email || "N/A"}
                </Text>
              </View>

              <View style={styles.profileItem}>
                <Text style={styles.profileItemLabel}>Mobile / Phone</Text>
                <Text style={styles.profileItemVal}>
                  {supplierProfile?.phone || "N/A"}
                </Text>
              </View>

              <View style={styles.profileItem}>
                <Text style={styles.profileItemLabel}>City & Region</Text>
                <Text style={styles.profileItemVal}>
                  {supplierProfile?.city || "Mumbai, Maharashtra"}
                </Text>
              </View>

              <View style={styles.profileItem}>
                <Text style={styles.profileItemLabel}>GSTIN / Tax ID</Text>
                <Text style={styles.profileItemVal}>
                  {supplierProfile?.gstin || "27AABCS1429B1Z1"}
                </Text>
              </View>

              <View style={styles.profileItem}>
                <Text style={styles.profileItemLabel}>Product Category</Text>
                <Text style={styles.profileItemVal}>
                  {supplierProfile?.category || "Medicines & Injections"}
                </Text>
              </View>

              <View style={styles.profileItem}>
                <Text style={styles.profileItemLabel}>Payment Terms</Text>
                <Text style={styles.profileItemVal}>
                  Net 30 Days (Direct Bank Transfer)
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* DISPATCH NOTES MODAL */}
      {selectedNotif && (
        <Modal
          transparent
          animationType="fade"
          visible={Boolean(selectedNotif)}
          onRequestClose={() => setSelectedNotif(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  🚚 Dispatch Reorder to {selectedNotif.branchName}
                </Text>
                <Pressable onPress={() => setSelectedNotif(null)}>
                  <Text style={styles.modalCloseText}>✕</Text>
                </Pressable>
              </View>

              <View style={styles.modalBody}>
                <Text style={styles.modalMedicine}>
                  Medicine: {selectedNotif.medicineName}
                </Text>
                <Text style={styles.modalQty}>
                  Quantity to Dispatch: {selectedNotif.reorderQuantity} units
                </Text>

                <Text style={styles.modalInputLabel}>
                  Dispatch Note / Batch & Courier Reference:
                </Text>
                <TextInput
                  style={styles.modalTextInput}
                  placeholder="e.g. Dispatched via Express Logistics. Batch BTH-409, expected tomorrow."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={3}
                  value={actionNotes}
                  onChangeText={setActionNotes}
                />
              </View>

              <View style={styles.modalFooter}>
                <Pressable
                  style={styles.modalCancelBtn}
                  onPress={() => setSelectedNotif(null)}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </Pressable>

                <Pressable
                  style={styles.modalConfirmBtn}
                  onPress={() =>
                    handleUpdateStatus(selectedNotif, actionTargetStatus)
                  }
                  disabled={isSubmittingAction}
                >
                  {isSubmittingAction ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalConfirmBtnText}>
                      Confirm Dispatch
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    minHeight: "100%",
  },
  toast: {
    position: "absolute",
    top: 20,
    right: 20,
    zIndex: 9999,
    backgroundColor: "#064E3B",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  toastText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  headerBar: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingHorizontal: 24,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  supplierLogoBox: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    justifyContent: "center",
    alignItems: "center",
  },
  supplierLogoIcon: {
    fontSize: 24,
  },
  companyTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  companyNameText: {
    fontSize: 19,
    fontWeight: "800",
    color: "#0F172A",
  },
  supplierRoleBadge: {
    backgroundColor: "#0F766E",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  supplierRoleText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  companySubText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    cursor: "pointer",
  },
  refreshButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F766E",
  },
  userProfilePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  userProfileAvatar: {
    fontSize: 16,
  },
  userProfileName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E293B",
  },
  userProfileEmail: {
    fontSize: 11,
    color: "#64748B",
  },
  signOutButton: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    cursor: "pointer",
  },
  signOutText: {
    color: "#B91C1C",
    fontWeight: "700",
    fontSize: 13,
  },
  metricsBanner: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  kpiCard: {
    flex: 1,
    minWidth: 200,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  kpiCardPending: {
    borderLeftWidth: 4,
    borderLeftColor: "#F59E0B",
  },
  kpiCardUrgent: {
    borderLeftWidth: 4,
    borderLeftColor: "#EF4444",
  },
  kpiCardTransit: {
    borderLeftWidth: 4,
    borderLeftColor: "#3B82F6",
  },
  kpiCardBranches: {
    borderLeftWidth: 4,
    borderLeftColor: "#0F766E",
  },
  kpiTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  kpiIcon: {
    fontSize: 22,
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
  },
  kpiLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  kpiSub: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
  },
  tabsRow: {
    flexDirection: "row",
    paddingHorizontal: 24,
    marginTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    gap: 8,
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
    cursor: "pointer",
  },
  tabButtonActive: {
    borderBottomColor: "#0F766E",
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  tabButtonTextActive: {
    color: "#0F766E",
    fontWeight: "800",
  },
  tabBadge: {
    backgroundColor: "#EF4444",
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  mainContent: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
  },
  loadingContainer: {
    padding: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    color: "#64748B",
    fontSize: 14,
  },
  filterBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  searchBox: {
    flex: 1,
    minWidth: 260,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: "#1E293B",
  },
  clearSearch: {
    fontSize: 14,
    color: "#94A3B8",
    padding: 4,
  },
  filterPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    cursor: "pointer",
  },
  filterPillActive: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  filterPillTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  notificationGrid: {
    gap: 14,
  },
  notifCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  notifCardUrgentBorder: {
    borderLeftWidth: 5,
    borderLeftColor: "#EF4444",
  },
  notifCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    flexWrap: "wrap",
    gap: 8,
  },
  branchPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 6,
  },
  branchPillIcon: {
    fontSize: 14,
  },
  branchPillText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F766E",
  },
  branchPillCity: {
    fontSize: 12,
    color: "#64748B",
  },
  headerBadgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  urgentPill: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  urgentPillText: {
    color: "#DC2626",
    fontWeight: "800",
    fontSize: 11,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  notifCardBody: {
    paddingVertical: 6,
  },
  medicineInfoCol: {
    marginBottom: 10,
  },
  medicineName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  skuText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  stockQtyStatsRow: {
    flexDirection: "row",
    gap: 16,
    marginVertical: 8,
    flexWrap: "wrap",
  },
  stockStatBox: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 160,
  },
  stockStatLabel: {
    fontSize: 11,
    color: "#92400E",
    fontWeight: "600",
  },
  stockStatValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#B45309",
    marginTop: 2,
  },
  reorderStatBox: {
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#99F6E4",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 160,
  },
  reorderStatLabel: {
    fontSize: 11,
    color: "#0F766E",
    fontWeight: "600",
  },
  reorderStatValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0D9488",
    marginTop: 2,
  },
  messageBox: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 10,
    marginVertical: 8,
  },
  messageLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 2,
  },
  messageText: {
    fontSize: 12,
    color: "#334155",
    lineHeight: 18,
  },
  timestampText: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 4,
  },
  notifActionBar: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
  },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 6,
    cursor: "pointer",
  },
  btnAcknowledge: {
    backgroundColor: "#0F766E",
  },
  btnAcknowledgeText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  btnDispatch: {
    backgroundColor: "#2563EB",
  },
  btnDispatchText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  btnDelivered: {
    backgroundColor: "#059669",
  },
  btnDeliveredText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  deliveredCompleteBadge: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#86EFAC",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  deliveredCompleteText: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyState: {
    padding: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    maxWidth: 420,
    lineHeight: 20,
  },
  tabContentCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 20,
  },
  cardHeader: {
    marginBottom: 18,
  },
  cardHeaderTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  cardHeaderSub: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  catalogTable: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    overflow: "hidden",
  },
  catalogTableHeader: {
    flexDirection: "row",
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  catalogTh: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  catalogTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  catalogTableRowAlt: {
    backgroundColor: "#FBFDFF",
  },
  prodName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  prodGeneric: {
    fontSize: 11,
    color: "#64748B",
  },
  prodSku: {
    fontSize: 12,
    color: "#475569",
    fontFamily: Platform.select({ web: "monospace", default: "System" }),
  },
  prodCat: {
    fontSize: 12,
    color: "#64748B",
  },
  prodPrice: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
  },
  prodMrp: {
    fontSize: 13,
    fontWeight: "600",
    color: "#059669",
  },
  prodStock: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F766E",
  },
  profileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  profileItem: {
    flex: 1,
    minWidth: 260,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 14,
  },
  profileItemLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  profileItemVal: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 24,
    width: "100%",
    maxWidth: 520,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  modalCloseText: {
    fontSize: 18,
    color: "#94A3B8",
    cursor: "pointer",
  },
  modalBody: {
    marginBottom: 20,
  },
  modalMedicine: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  modalQty: {
    fontSize: 14,
    color: "#0F766E",
    fontWeight: "700",
    marginBottom: 14,
  },
  modalInputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
  },
  modalTextInput: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    cursor: "pointer",
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  modalConfirmBtn: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 6,
    cursor: "pointer",
  },
  modalConfirmBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
