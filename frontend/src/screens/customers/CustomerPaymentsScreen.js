import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from "react-native";
import InventoryStatCard from "../../components/inventory/InventoryStatCard";
import { PAYMENT_MODE_FILTER } from "../../constants/uiConstants";
import {
  SkeletonTableRow,
  SkeletonItemCard,
} from "../../components/common/SkeletonLoader";
import PaginationControls from "../../components/common/PaginationControls";
import { localPersistenceService } from "../../db";
import { syncEngine } from "../../sync";
import { printPaymentReceipt } from "../../utils/exportUtils";
import { settleCustomerDue, fetchCustomers } from "../../api/customerApi";

const PAYMENT_MODE_BADGES = {
  "UPI / QR": { bg: "#E8D5DD", text: "#A66D86" },
  Cash: { bg: "#F7F0E5", text: "#C49752" },
  "Debit/Credit Card": { bg: "#E8D5DD", text: "#A66D86" },
  "Net Banking": { bg: "#E8D5DD", text: "#A66D86" },
  Cheque: { bg: "#EAF2EE", text: "#4F8A72" },
};

const MODE_BADGES = PAYMENT_MODE_BADGES;

export default function CustomerPaymentsScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isCompact = width < 1100;

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModeFilter, setSelectedModeFilter] = useState("All Modes");

  // Payments List State (Dexie-backed)
  const [payments, setPayments] = useState([]);
  const [availableCustomers, setAvailableCustomers] = useState([]);

  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Modal 1: Record Payment Modal
  const [recordModalVisible, setRecordModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    customerId: "",
    customerName: "Rajesh Verma",
    phone: "+91 98201 44521",
    amount: "2000",
    paymentMode: "Cash",
    transactionRef: "",
    linkedRef: "Ledger Dues",
  });
  const [formErrors, setFormErrors] = useState({});

  // Modal 2: Receipt Voucher Modal
  const [voucherModalVisible, setVoucherModalVisible] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  // Load offline and server data on mount and sync events
  const loadOfflineData = async () => {
    try {
      let combinedReceipts = [];
      if (typeof localPersistenceService?.getPaymentReceipts === "function") {
        const persistedReceipts =
          await localPersistenceService.getPaymentReceipts();
        if (persistedReceipts && persistedReceipts.length > 0) {
          combinedReceipts = persistedReceipts;
        }
      }
      if (typeof window !== "undefined") {
        try {
          const raw = window.localStorage?.getItem("cached_customer_receipts");
          if (raw) {
            const cached = JSON.parse(raw);
            if (Array.isArray(cached) && cached.length > 0) {
              const existingIds = new Set(combinedReceipts.map((r) => r.id));
              const missing = cached.filter((c) => !existingIds.has(c.id));
              combinedReceipts = [...combinedReceipts, ...missing];
            }
          }
        } catch (e) {}
      }
      if (combinedReceipts.length > 0) {
        setPayments(combinedReceipts);
      }

      // Load customers (Dexie + Online)
      let custs = [];
      if (typeof localPersistenceService?.getCustomersForPos === "function") {
        const localCusts = await localPersistenceService.getCustomersForPos();
        if (localCusts && localCusts.length > 0) {
          custs = localCusts;
        }
      }
      try {
        const apiRes = await fetchCustomers();
        const serverCusts =
          apiRes?.data?.data ||
          apiRes?.data?.items ||
          (Array.isArray(apiRes?.data) ? apiRes.data : []);
        if (Array.isArray(serverCusts) && serverCusts.length > 0) {
          const mapped = serverCusts.map((c) => ({
            customerId: String(c.id || c.customerId),
            name: c.name || c.full_name || "Customer",
            phone: c.phone || "",
            outstandingBalance: Number(c.outstandingBalance || 0),
          }));
          const existingIds = new Set(custs.map((c) => c.customerId));
          custs = [
            ...custs,
            ...mapped.filter((m) => !existingIds.has(m.customerId)),
          ];
        }
      } catch (e) {}

      if (custs.length > 0) {
        setAvailableCustomers(custs);
      }
    } catch (err) {
      console.warn(
        "[CustomerPayments] Error loading payment records:",
        err,
      );
    }
  };

  useEffect(() => {
    let isMounted = true;
    loadOfflineData();

    const subscribeFn =
      typeof syncEngine?.onStateChange === "function"
        ? syncEngine.onStateChange.bind(syncEngine)
        : typeof syncEngine?.subscribe === "function"
          ? syncEngine.subscribe.bind(syncEngine)
          : null;

    const unsubscribe = subscribeFn
      ? subscribeFn(() => {
          if (isMounted) loadOfflineData();
        })
      : () => {};

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Filtered Receipts
  const filteredPayments = payments.filter((pay) => {
    const query = searchQuery.toLowerCase();
    const id = pay.id || "";
    const name = pay.customerName || "";
    const phone = pay.phone || "";
    const ref = pay.transactionRef || "";
    const linked = pay.linkedRef || pay.linkedInvoices || "";

    const matchesSearch =
      id.toLowerCase().includes(query) ||
      name.toLowerCase().includes(query) ||
      phone.toLowerCase().includes(query) ||
      ref.toLowerCase().includes(query) ||
      linked.toLowerCase().includes(query);

    const matchesMode =
      selectedModeFilter === "All Modes" ||
      pay.paymentMode === selectedModeFilter;

    return matchesSearch && matchesMode;
  });

  const handleOpenRecordModal = () => {
    const defaultCust = availableCustomers[0];
    setFormData({
      customerId: defaultCust?.customerId || "",
      customerName: defaultCust?.name || "Walk-in Customer",
      phone: defaultCust?.phone || "",
      amount:
        defaultCust && Number(defaultCust.outstandingBalance) > 0
          ? String(defaultCust.outstandingBalance)
          : "500",
      paymentMode: "Cash",
      transactionRef: `REF-${Date.now().toString().slice(-6)}`,
      linkedRef: "Ledger Dues",
    });
    setFormErrors({});
    setRecordModalVisible(true);
  };

  const handleSelectCustomer = (cust) => {
    setFormData((prev) => ({
      ...prev,
      customerId: cust.customerId,
      customerName: cust.name,
      phone: cust.phone || "",
      amount:
        Number(cust.outstandingBalance) > 0
          ? String(cust.outstandingBalance)
          : prev.amount,
    }));
  };

  const handleSavePayment = async () => {
    const errors = {};
    if (!formData.customerName.trim())
      errors.customerName = "Customer Name is required";
    if (
      !formData.amount.trim() ||
      isNaN(formData.amount) ||
      Number(formData.amount) <= 0
    ) {
      errors.amount = "Valid payment amount is required";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const amountNum = Number(formData.amount);
    try {
      let resolvedCustomerId = formData.customerId;
      if (!resolvedCustomerId && availableCustomers.length > 0) {
        const matched = availableCustomers.find(
          (c) =>
            (c.name &&
              c.name.toLowerCase() ===
                formData.customerName.trim().toLowerCase()) ||
            (c.phone && formData.phone && c.phone === formData.phone.trim()),
        );
        if (matched) resolvedCustomerId = matched.customerId || matched.id;
      }

      const receiptId = `REC-${Date.now().toString().slice(-6)}`;
      const newReceipt = {
        id: receiptId,
        date: new Date().toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        customerId: resolvedCustomerId || "WALK-IN",
        customerName: formData.customerName.trim(),
        phone: formData.phone.trim() || "—",
        amount: `₹${amountNum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        amountRaw: amountNum,
        paymentMode: formData.paymentMode,
        transactionRef:
          formData.transactionRef ||
          `REF-${Date.now().toString().slice(-6)}`,
        linkedRef: formData.linkedRef || "Ledger Dues",
        receivedBy: "Pharmacist",
        branch: "Main Branch",
        status: "Completed",
        syncStatus: "SYNCED",
      };

      // 1. Settle online if customer ID exists
      if (resolvedCustomerId && resolvedCustomerId !== "WALK-IN") {
        try {
          await settleCustomerDue(resolvedCustomerId, {
            amount: amountNum,
            paymentMethod: formData.paymentMode,
            notes:
              formData.linkedRef ||
              formData.transactionRef ||
              "Payment Receipt",
          });
        } catch (apiErr) {
          console.warn(
            "[CustomerPayments] Online settle notice:",
            apiErr?.message,
          );
          newReceipt.syncStatus = "PENDING";
        }
      }

      // 2. Persist to Dexie
      try {
        if (
          typeof localPersistenceService?.recordLocalCustomerPayment ===
          "function"
        ) {
          await localPersistenceService.recordLocalCustomerPayment({
            customerId: resolvedCustomerId || "WALK-IN",
            customerName: formData.customerName.trim(),
            customerPhone: formData.phone.trim(),
            amount: amountNum,
            paymentMethod: formData.paymentMode,
            receiptNumber: receiptId,
            reference: formData.transactionRef || undefined,
            notes: formData.linkedRef || undefined,
          });
        }
      } catch (dexieErr) {
        console.warn(
          "[CustomerPayments] Dexie record notice:",
          dexieErr?.message,
        );
      }

      // 3. Immediately prepend receipt to state and localStorage cache
      setPayments((prev) => {
        const updated = [newReceipt, ...prev.filter((p) => p.id !== receiptId)];
        try {
          if (typeof window !== "undefined") {
            window.localStorage?.setItem(
              "cached_customer_receipts",
              JSON.stringify(updated.slice(0, 100)),
            );
          }
        } catch (e) {}
        return updated;
      });

      setRecordModalVisible(false);

      if (onShowToast) {
        onShowToast(
          `✓ Successfully saved payment receipt #${receiptId} of ₹${amountNum.toFixed(2)} for ${formData.customerName}!`,
        );
      }

      if (typeof syncEngine?.sync === "function") {
        syncEngine.sync().catch(() => {});
      }
    } catch (err) {
      console.error("Failed to record customer payment:", err);
      setFormErrors({
        submit: "Failed to record payment: " + (err.message || err),
      });
    }
  };

  const handleViewVoucher = (receipt) => {
    setSelectedReceipt(receipt);
    setVoucherModalVisible(true);
  };

  const handlePrintReceipt = (receipt) => {
    if (!receipt) return;
    printPaymentReceipt(receipt);
    if (onShowToast) {
      onShowToast(
        `✓ Opening Receipt Voucher #${receipt.id} (Print / Save as PDF)...`,
      );
    }
  };

  const totalReceived = payments.reduce((acc, p) => {
    const val =
      typeof p.amount === "number"
        ? p.amount
        : parseFloat(String(p.amount || "").replace(/[^0-9.]/g, "")) || 0;
    return acc + val;
  }, 0);
  const upiCount = payments.filter(
    (p) => p.paymentMode === "UPI / QR" || p.paymentMode === "UPI",
  ).length;
  const cashCount = payments.filter((p) => p.paymentMode === "Cash").length;
  const pendingSyncCount = payments.filter(
    (p) => p.syncStatus === "PENDING",
  ).length;

  const dynamicKpis = [
    {
      id: "kpi-1",
      label: "TOTAL COLLECTIONS",
      value: `₹${totalReceived.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      subtext: `${payments.length} receipts recorded`,
      variant: "teal",
    },
    {
      id: "kpi-2",
      label: "UPI / DIGITAL PAYMENTS",
      value: `${upiCount}`,
      subtext: "Instant settlement",
      variant: "blue",
    },
    {
      id: "kpi-3",
      label: "CASH RECEIVED",
      value: `${cashCount}`,
      subtext: "Cash register counter",
      variant: "amber",
    },
    {
      id: "kpi-4",
      label: "PENDING SYNC",
      value: `${pendingSyncCount}`,
      subtext:
        pendingSyncCount > 0
          ? "Queued for cloud sync"
          : "Fully synced to cloud",
      variant: pendingSyncCount > 0 ? "orange" : "green",
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        isMobile && styles.contentContainerMobile,
      ]}
      showsVerticalScrollIndicator={true}
    >
      {/* Header Row */}
      <View style={[styles.headerRow, isMobile && styles.headerRowMobile]}>
        <View style={styles.headerTitleBox}>
          <View style={styles.titleBadgeRow}>
            <Text style={styles.pageTitle}>Payment Receipts</Text>
            <View style={styles.liveTagBadge}>
              <Text style={styles.liveTagText}>CASH & COLLECTIONS</Text>
            </View>
          </View>
          <Text style={styles.pageSubtitle}>
            Record customer payment vouchers, credit settlements, digital
            transaction references, and payment receipts.
          </Text>
        </View>

        <Pressable
          onPress={handleOpenRecordModal}
          style={styles.recordPayBtn}
          accessibilityRole="button"
          accessibilityLabel="+ Record Payment"
        >
          <Text style={styles.recordPayIcon}>+</Text>
          <Text style={styles.recordPayText}>Record Payment</Text>
        </Pressable>
      </View>

      {/* Top 4 Responsive KPI Cards */}
      <View
        style={[
          styles.kpiRow,
          isCompact && styles.kpiRowCompact,
          isMobile && styles.kpiRowMobile,
        ]}
      >
        {dynamicKpis.map((kpi) => (
          <View
            key={kpi.id}
            style={[styles.kpiCol, isMobile && styles.kpiColMobile]}
          >
            <InventoryStatCard
              label={kpi.label}
              value={kpi.value}
              subtext={kpi.subtext}
              variant={kpi.variant}
              onPress={() => onShowToast && onShowToast(`Filter: ${kpi.label}`)}
            />
          </View>
        ))}
      </View>

      {/* Receipts Table Card */}
      <View style={styles.cardContainer}>
        {/* Search & Mode Filter Bar */}
        <View
          style={[styles.filtersBar, isCompact && styles.filtersBarCompact]}
        >
          <View style={[styles.searchBox, isMobile && styles.searchBoxMobile]}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search receipt no, customer name, transaction UTR or linked invoice..."
              placeholderTextColor="#77717A"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <Pressable
                onPress={() => setSearchQuery("")}
                style={styles.clearBtn}
              >
                <Text style={styles.clearBtnText}>✕</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Payment Mode Filter Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterChipScroll}
          >
            <View style={styles.filterChipRow}>
              {PAYMENT_MODE_FILTER.map((st) => (
                <Pressable
                  key={st}
                  onPress={() => setSelectedModeFilter(st)}
                  style={[
                    styles.filterChip,
                    selectedModeFilter === st && styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedModeFilter === st && styles.filterChipTextActive,
                    ]}
                  >
                    {st}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Directory Subheader */}
        <View style={styles.tableSubheader}>
          <Text style={styles.sectionTitle}>
            Receipt Vouchers ({filteredPayments.length})
          </Text>
          <Text style={styles.paginationInfo}>
            Showing 1-{filteredPayments.length} of {payments.length} receipts
          </Text>
        </View>

        {isMobile ? (
          /* Mobile Payment Receipt Cards */
          <View style={styles.mobileCardList}>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <SkeletonItemCard key={i} />
              ))
            ) : filteredPayments.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No payment receipts found</Text>
                <Text style={styles.emptySubtitle}>
                  Try changing your search terms or payment mode selection.
                </Text>
              </View>
            ) : (
              filteredPayments
                .slice(
                  (currentPage - 1) * itemsPerPage,
                  currentPage * itemsPerPage,
                )
                .map((rcpt) => {
                  const modeStyle =
                    MODE_BADGES[rcpt.paymentMode] || MODE_BADGES.Cash;
                  const displayAmount =
                    rcpt.amount || rcpt.amountPaid || "₹0.00";
                  const displayDate = rcpt.date || rcpt.paymentDate || "";
                  const displayLinked =
                    rcpt.linkedRef || rcpt.linkedInvoices || "Direct Payment";

                  return (
                    <View key={rcpt.id} style={styles.mobileReceiptCard}>
                      <View style={styles.mobileCardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.mobileRcptId}>{rcpt.id}</Text>
                          <Text style={styles.mobileRcptCust}>
                            {rcpt.customerName}
                          </Text>
                        </View>
                        <View
                          style={
                            rcpt.syncStatus === "PENDING"
                              ? styles.statusBadgePending
                              : styles.statusBadgeCompleted
                          }
                        >
                          <Text
                            style={
                              rcpt.syncStatus === "PENDING"
                                ? styles.statusBadgeTextPending
                                : styles.statusBadgeTextCompleted
                            }
                          >
                            {rcpt.syncStatus === "PENDING"
                              ? "Pending Sync"
                              : rcpt.status || "Completed"}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.mobileGrid}>
                        <View style={styles.mobileGridCol}>
                          <Text style={styles.mobileLabel}>Amount Paid</Text>
                          <Text
                            style={[
                              styles.mobileValBold,
                              { color: "#B9829A", fontSize: 14 },
                            ]}
                          >
                            {displayAmount}
                          </Text>
                        </View>
                        <View style={styles.mobileGridCol}>
                          <Text style={styles.mobileLabel}>Payment Mode</Text>
                          <View
                            style={[
                              styles.modeBadge,
                              { backgroundColor: modeStyle.bg, marginTop: 3 },
                            ]}
                          >
                            <Text
                              style={[
                                styles.modeBadgeText,
                                { color: modeStyle.text },
                              ]}
                            >
                              {rcpt.paymentMode}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.mobileGridCol}>
                          <Text style={styles.mobileLabel}>Date & Time</Text>
                          <Text style={styles.mobileVal}>{displayDate}</Text>
                        </View>
                        <View style={styles.mobileGridCol}>
                          <Text style={styles.mobileLabel}>Linked Invoice</Text>
                          <Text
                            style={[styles.mobileValBold, { color: "#28242B" }]}
                          >
                            {displayLinked}
                          </Text>
                        </View>
                        <View style={styles.mobileGridCol}>
                          <Text style={styles.mobileLabel}>Ref / UTR No</Text>
                          <Text style={styles.mobileVal}>
                            {rcpt.transactionRef}
                          </Text>
                        </View>
                        <View style={styles.mobileGridCol}>
                          <Text style={styles.mobileLabel}>
                            Cashier / Staff
                          </Text>
                          <Text style={styles.mobileVal}>
                            {rcpt.receivedBy}
                          </Text>
                        </View>
                      </View>

                      <View
                        style={[
                          styles.mobileCardFooter,
                          { flexDirection: "row", gap: 8 },
                        ]}
                      >
                        <Pressable
                          onPress={() => handleViewVoucher(rcpt)}
                          style={[
                            styles.mobilePrintBtn,
                            {
                              flex: 1,
                              backgroundColor: "#E8D5DD",
                              borderColor: "#E8D5DD",
                            },
                          ]}
                          accessibilityRole="button"
                        >
                          <Text
                            style={[
                              styles.mobilePrintBtnText,
                              { color: "#A66D86", fontWeight: "700" },
                            ]}
                          >
                            📄 View Voucher
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handlePrintReceipt(rcpt)}
                          style={[styles.mobilePrintBtn, { flex: 1 }]}
                          accessibilityRole="button"
                        >
                          <Text style={styles.mobilePrintBtnText}>
                            🖨 Print
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
            )}
          </View>
        ) : (
          /* Desktop Receipts Table */
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { width: 130 }]}>RECEIPT NO</Text>
                <Text style={[styles.thCell, { width: 140 }]}>DATE & TIME</Text>
                <Text style={[styles.thCell, { width: 180 }]}>
                  CUSTOMER NAME
                </Text>
                <Text style={[styles.thCell, { width: 190 }]}>
                  LINKED REF / INVOICE
                </Text>
                <Text
                  style={[styles.thCell, { width: 130, textAlign: "center" }]}
                >
                  PAYMENT MODE
                </Text>
                <Text style={[styles.thCell, { width: 170 }]}>
                  TRANSACTION / UTR REF
                </Text>
                <Text
                  style={[styles.thCell, { width: 110, textAlign: "right" }]}
                >
                  AMOUNT PAID
                </Text>
                <Text style={[styles.thCell, { width: 140 }]}>RECEIVED BY</Text>
                <Text
                  style={[styles.thCell, { width: 90, textAlign: "center" }]}
                >
                  STATUS
                </Text>
                <Text
                  style={[styles.thCell, { width: 130, textAlign: "center" }]}
                >
                  ACTIONS
                </Text>
              </View>

              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonTableRow key={i} columns={10} />
                ))
              ) : filteredPayments.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>
                    No payment receipts found
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    Try changing your search terms or payment mode selection.
                  </Text>
                </View>
              ) : (
                filteredPayments
                  .slice(
                    (currentPage - 1) * itemsPerPage,
                    currentPage * itemsPerPage,
                  )
                  .map((rcpt, index) => {
                    const modeStyle =
                      MODE_BADGES[rcpt.paymentMode] || MODE_BADGES.Cash;
                    const displayAmount =
                      rcpt.amount || rcpt.amountPaid || "₹0.00";
                    const displayDate = rcpt.date || rcpt.paymentDate || "";
                    const displayLinked =
                      rcpt.linkedRef || rcpt.linkedInvoices || "Direct Payment";

                    return (
                      <View
                        key={rcpt.id}
                        style={[
                          styles.tableRow,
                          index % 2 === 1 && styles.tableRowAlt,
                        ]}
                      >
                        <Text
                          style={[
                            styles.tdCell,
                            styles.receiptNoText,
                            { width: 130 },
                          ]}
                        >
                          {rcpt.id}
                        </Text>
                        <Text style={[styles.tdCell, { width: 140 }]}>
                          {displayDate}
                        </Text>
                        <View style={[{ width: 180 }]}>
                          <Text
                            style={[styles.tdCell, styles.customerNameText]}
                            numberOfLines={1}
                          >
                            {rcpt.customerName}
                          </Text>
                          <Text style={styles.customerIdSubtext}>
                            {rcpt.customerId}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.tdCell,
                            { width: 190, color: "#28242B", fontWeight: "500" },
                          ]}
                        >
                          {displayLinked}
                        </Text>

                        {/* Payment Mode Badge */}
                        <View style={[styles.modeCellWrapper, { width: 130 }]}>
                          <View
                            style={[
                              styles.modeBadge,
                              { backgroundColor: modeStyle.bg },
                            ]}
                          >
                            <Text
                              style={[
                                styles.modeBadgeText,
                                { color: modeStyle.text },
                              ]}
                            >
                              {rcpt.paymentMode}
                            </Text>
                          </View>
                        </View>

                        <Text
                          style={[
                            styles.tdCell,
                            styles.utrText,
                            { width: 170 },
                          ]}
                        >
                          {rcpt.transactionRef}
                        </Text>

                        <Text
                          style={[
                            styles.tdCell,
                            styles.paidAmountText,
                            { width: 110, textAlign: "right" },
                          ]}
                        >
                          {displayAmount}
                        </Text>

                        <Text style={[styles.tdCell, { width: 140 }]}>
                          {rcpt.receivedBy}
                        </Text>

                        {/* Status */}
                        <View style={[styles.statusCellWrapper, { width: 90 }]}>
                          <View
                            style={
                              rcpt.syncStatus === "PENDING"
                                ? styles.statusBadgePending
                                : styles.statusBadgeCompleted
                            }
                          >
                            <Text
                              style={
                                rcpt.syncStatus === "PENDING"
                                  ? styles.statusBadgeTextPending
                                  : styles.statusBadgeTextCompleted
                              }
                            >
                              {rcpt.syncStatus === "PENDING"
                                ? "Pending"
                                : rcpt.status || "Completed"}
                            </Text>
                          </View>
                        </View>

                        {/* Actions */}
                        <View
                          style={[styles.actionsCellWrapper, { width: 140 }]}
                        >
                          <Pressable
                            onPress={() => handleViewVoucher(rcpt)}
                            style={styles.voucherBtn}
                            accessibilityRole="button"
                            accessibilityLabel="View Voucher"
                          >
                            <Text style={styles.voucherBtnText}>Voucher</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handlePrintReceipt(rcpt)}
                            style={styles.printBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Print Receipt"
                          >
                            <Text style={styles.printBtnText}>Print</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })
              )}
            </View>
          </ScrollView>
        )}

        <PaginationControls
          currentPage={currentPage}
          totalPages={Math.ceil(filteredPayments.length / itemsPerPage)}
          onPageChange={setCurrentPage}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={setItemsPerPage}
        />
      </View>

      {/* Modal 1: Record Customer Payment Modal */}
      <Modal
        visible={recordModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRecordModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setRecordModalVisible(false)}
        >
          <Pressable
            style={[styles.modalCard, isMobile && styles.modalCardMobile]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Record Payment Receipt</Text>
                <Text style={styles.modalSubtitle}>
                  Log direct payments, POS receipts, or credit account
                  settlements.
                </Text>
              </View>
              <Pressable
                onPress={() => setRecordModalVisible(false)}
                style={styles.closeBtn}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              {availableCustomers && availableCustomers.length > 0 && (
                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>
                    Select Customer (Offline Records)
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginVertical: 4 }}
                  >
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      {availableCustomers.slice(0, 10).map((c) => {
                        const isSelected = formData.customerId === c.customerId;
                        return (
                          <Pressable
                            key={c.customerId}
                            onPress={() => handleSelectCustomer(c)}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 6,
                              backgroundColor: isSelected
                                ? "#B9829A"
                                : "#F8F5F7",
                              borderWidth: 1,
                              borderColor: isSelected ? "#B9829A" : "#E5DFE4",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: "600",
                                color: isSelected ? "#FFFFFF" : "#28242B",
                              }}
                            >
                              {c.name}{" "}
                              {Number(c.outstandingBalance) > 0
                                ? `(Due: ₹${c.outstandingBalance})`
                                : ""}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>
                  Customer Name <Text style={styles.reqStar}>*</Text>
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    formErrors.customerName && styles.inputError,
                  ]}
                  placeholder="e.g. Rajesh Verma"
                  placeholderTextColor="#77717A"
                  value={formData.customerName}
                  onChangeText={(t) =>
                    setFormData((p) => ({ ...p, customerName: t }))
                  }
                />
                {formErrors.customerName && (
                  <Text style={styles.errorText}>
                    {formErrors.customerName}
                  </Text>
                )}
              </View>

              <View style={[styles.formRow, isMobile && styles.formRowMobile]}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Phone Number</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="+91 98XXX XXXXX"
                    placeholderTextColor="#77717A"
                    value={formData.phone}
                    onChangeText={(t) =>
                      setFormData((p) => ({ ...p, phone: t }))
                    }
                  />
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Amount Paid (₹) <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={[
                      styles.modalInput,
                      formErrors.amount && styles.inputError,
                    ]}
                    keyboardType="numeric"
                    placeholder="e.g. 2000"
                    placeholderTextColor="#77717A"
                    value={formData.amount}
                    onChangeText={(t) =>
                      setFormData((p) => ({ ...p, amount: t }))
                    }
                  />
                  {formErrors.amount && (
                    <Text style={styles.errorText}>{formErrors.amount}</Text>
                  )}
                </View>
              </View>

              <View style={[styles.formRow, isMobile && styles.formRowMobile]}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Payment Mode</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="UPI / QR, Cash, Card"
                    placeholderTextColor="#77717A"
                    value={formData.paymentMode}
                    onChangeText={(t) =>
                      setFormData((p) => ({ ...p, paymentMode: t }))
                    }
                  />
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>Transaction / UTR Ref</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g., UPI/6829103847"
                    placeholderTextColor="#77717A"
                    value={formData.transactionRef}
                    onChangeText={(t) =>
                      setFormData((p) => ({ ...p, transactionRef: t }))
                    }
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>
                  Linked Invoice / Ledger Settlement Ref
                </Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., INV-2026-8942 / Ledger Balance"
                  placeholderTextColor="#77717A"
                  value={formData.linkedRef}
                  onChangeText={(t) =>
                    setFormData((p) => ({ ...p, linkedRef: t }))
                  }
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                onPress={() => setRecordModalVisible(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSavePayment}
                style={styles.submitModalBtn}
              >
                <Text style={styles.submitModalBtnText}>
                  Save & Issue Receipt
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal 2: Payment Receipt Voucher Modal */}
      {selectedReceipt && (
        <Modal
          visible={voucherModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setVoucherModalVisible(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setVoucherModalVisible(false)}
          >
            <Pressable
              style={[styles.modalCard, isMobile && styles.modalCardMobile]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Payment Receipt Voucher</Text>
                  <Text style={styles.modalSubtitle}>
                    {selectedReceipt.id} • PharmaFlow Billing System
                  </Text>
                </View>
                <Pressable
                  onPress={() => setVoucherModalVisible(false)}
                  style={styles.closeBtn}
                >
                  <Text style={styles.closeBtnText}>✕</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.voucherBox}>
                  <Text style={styles.vouchBrand}>PHARMAFLOW PHARMACY ERP</Text>
                  <Text style={styles.vouchSub}>Official Payment Receipt</Text>

                  {/* Top Voucher Summary Badges */}
                  <View style={styles.voucherTopKpiRow}>
                    <View style={styles.voucherKpiPill}>
                      <Text style={styles.voucherKpiPillLabel}>
                        AMOUNT PAID
                      </Text>
                      <Text style={styles.voucherKpiPillVal}>
                        {selectedReceipt.amount}
                      </Text>
                    </View>
                    <View style={styles.voucherKpiPill}>
                      <Text style={styles.voucherKpiPillLabel}>
                        PAYMENT MODE
                      </Text>
                      <Text style={styles.voucherKpiPillVal}>
                        {selectedReceipt.paymentMode}
                      </Text>
                    </View>
                    <View style={styles.voucherKpiPill}>
                      <Text style={styles.voucherKpiPillLabel}>STATUS</Text>
                      <Text
                        style={[styles.voucherKpiPillVal, { color: "#4F8A72" }]}
                      >
                        ✓ Completed
                      </Text>
                    </View>
                  </View>

                  <View style={styles.vouchDivider} />

                  <View style={styles.vouchRow}>
                    <Text style={styles.vouchLabel}>Receipt No:</Text>
                    <Text style={styles.vouchValueBold}>
                      {selectedReceipt.id}
                    </Text>
                  </View>

                  <View style={styles.vouchRow}>
                    <Text style={styles.vouchLabel}>Date & Time:</Text>
                    <Text style={styles.vouchValue}>
                      {selectedReceipt.date}
                    </Text>
                  </View>

                  <View style={styles.vouchRow}>
                    <Text style={styles.vouchLabel}>Customer Name:</Text>
                    <Text style={styles.vouchValueBold}>
                      {selectedReceipt.customerName}
                    </Text>
                  </View>

                  <View style={styles.vouchRow}>
                    <Text style={styles.vouchLabel}>Phone Number:</Text>
                    <Text style={styles.vouchValue}>
                      {selectedReceipt.phone}
                    </Text>
                  </View>

                  <View style={styles.vouchRow}>
                    <Text style={styles.vouchLabel}>Payment Method:</Text>
                    <Text style={styles.vouchValue}>
                      {selectedReceipt.paymentMode}
                    </Text>
                  </View>

                  <View style={styles.vouchRow}>
                    <Text style={styles.vouchLabel}>UTR / Ref No:</Text>
                    <Text style={styles.vouchValue}>
                      {selectedReceipt.transactionRef}
                    </Text>
                  </View>

                  <View style={styles.vouchRow}>
                    <Text style={styles.vouchLabel}>Linked Reference:</Text>
                    <Text style={styles.vouchValue}>
                      {selectedReceipt.linkedRef}
                    </Text>
                  </View>

                  <View style={styles.vouchDivider} />

                  <View style={styles.vouchRowBig}>
                    <Text style={styles.vouchTotalLabel}>AMOUNT RECEIVED:</Text>
                    <Text style={styles.vouchTotalValue}>
                      {selectedReceipt.amount}
                    </Text>
                  </View>
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <Pressable
                  onPress={() => handlePrintReceipt(selectedReceipt)}
                  style={styles.exportBtnSecondary}
                >
                  <Text style={styles.exportBtnTextSecondary}>
                    Print Receipt
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setVoucherModalVisible(false)}
                  style={styles.submitModalBtn}
                >
                  <Text style={styles.submitModalBtnText}>Close</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 24,
  },
  contentContainerMobile: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
  },
  headerRowMobile: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  headerTitleBox: {
    flex: 1,
  },
  titleBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#28242B",
    letterSpacing: -0.4,
  },
  liveTagBadge: {
    backgroundColor: "#E8D5DD",
    borderWidth: 1,
    borderColor: "#E8D5DD",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  liveTagText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#B9829A",
    letterSpacing: 0.5,
  },
  pageSubtitle: {
    fontSize: 13.5,
    fontWeight: "500",
    color: "#77717A",
    marginTop: 4,
  },
  recordPayBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#B9829A",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: "pointer",
  },
  recordPayIcon: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    marginRight: 6,
  },
  recordPayText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "700",
  },
  exportBtnSecondary: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    cursor: "pointer",
  },
  exportBtnTextSecondary: {
    fontSize: 13,
    fontWeight: "600",
    color: "#28242B",
  },
  kpiRow: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },
  kpiRowCompact: {
    gap: 12,
  },
  kpiRowMobile: {
    gap: 10,
    justifyContent: "space-between",
  },
  kpiCol: {
    flex: 1,
    minWidth: 220,
  },
  kpiColMobile: {
    width: "48.5%",
    minWidth: "48.5%",
    maxWidth: "48.5%",
    flex: 0,
    flexGrow: 0,
  },
  /* Mobile Receipt Card Styles */
  mobileCardList: {
    padding: 12,
    gap: 12,
  },
  mobileReceiptCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    padding: 14,
  },
  mobileCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F8F5F7",
    gap: 8,
  },
  mobileRcptId: {
    fontSize: 15,
    fontWeight: "800",
    color: "#B9829A",
  },
  mobileRcptCust: {
    fontSize: 13,
    fontWeight: "700",
    color: "#28242B",
    marginTop: 2,
  },
  mobileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingVertical: 10,
    gap: 10,
  },
  mobileGridCol: {
    width: "47%",
  },
  mobileLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#77717A",
    textTransform: "uppercase",
  },
  mobileVal: {
    fontSize: 12.5,
    color: "#28242B",
    marginTop: 1,
  },
  mobileValBold: {
    fontSize: 13,
    fontWeight: "700",
    color: "#28242B",
    marginTop: 1,
  },
  mobileCardFooter: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F8F5F7",
  },
  mobilePrintBtn: {
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  mobilePrintBtnText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#28242B",
  },
  cardContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow:
          "0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)",
      },
      default: {
        elevation: 1,
      },
    }),
  },
  filtersBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#F8F5F7",
    borderBottomWidth: 1,
    borderBottomColor: "#F8F5F7",
    gap: 12,
  },
  filtersBarCompact: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
  },
  searchBoxMobile: {
    width: "100%",
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: "#28242B",
    outlineStyle: "none",
  },
  clearBtn: {
    padding: 4,
  },
  clearBtnText: {
    fontSize: 12,
    color: "#77717A",
  },
  filterChipScroll: {
    maxHeight: 44,
  },
  filterChipRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    cursor: "pointer",
  },
  filterChipActive: {
    backgroundColor: "#B9829A",
    borderColor: "#B9829A",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#77717A",
  },
  filterChipTextActive: {
    fontWeight: "700",
    color: "#FFFFFF",
  },
  tableSubheader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F8F5F7",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#28242B",
  },
  paginationInfo: {
    fontSize: 12.5,
    fontWeight: "500",
    color: "#77717A",
  },
  tableWrapper: {
    minWidth: 1460,
    paddingHorizontal: 8,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5DFE4",
    backgroundColor: "#F8F5F7",
  },
  thCell: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#77717A",
    paddingHorizontal: 6,
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F8F5F7",
  },
  tableRowAlt: {
    backgroundColor: "#F8F5F7",
  },
  tdCell: {
    fontSize: 13,
    color: "#28242B",
    paddingHorizontal: 6,
  },
  receiptIdText: {
    fontWeight: "700",
    color: "#B9829A",
  },
  custNameText: {
    fontWeight: "700",
    color: "#28242B",
  },
  phoneSubtext: {
    fontSize: 11,
    color: "#77717A",
    paddingHorizontal: 6,
  },
  linkedRefText: {
    color: "#A66D86",
    fontWeight: "500",
  },
  modeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  modeBadgeText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  utrText: {
    fontWeight: "600",
    color: "#77717A",
  },
  paidAmountText: {
    fontWeight: "800",
    color: "#4F8A72",
  },
  statusBadgeCompleted: {
    backgroundColor: "#EAF2EE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeTextCompleted: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#4F8A72",
  },
  statusBadgePending: {
    backgroundColor: "#F7F0E5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeTextPending: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#C49752",
  },
  actionsCellWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  voucherBtn: {
    backgroundColor: "#E8D5DD",
    borderWidth: 1,
    borderColor: "#E8D5DD",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    cursor: "pointer",
  },
  voucherBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#A66D86",
  },
  printBtn: {
    backgroundColor: "#B9829A",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    cursor: "pointer",
  },
  printBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#28242B",
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#77717A",
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 540,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    overflow: "hidden",
  },
  modalCardMobile: {
    maxWidth: "100%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F8F5F7",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#28242B",
  },
  modalSubtitle: {
    fontSize: 12.5,
    color: "#77717A",
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 14,
    color: "#77717A",
    fontWeight: "700",
  },
  modalBody: {
    padding: 22,
    maxHeight: 520,
  },
  formGroup: {
    marginBottom: 14,
  },
  formRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 14,
  },
  formRowMobile: {
    flexDirection: "column",
    gap: 10,
  },
  formFieldHalf: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#28242B",
    marginBottom: 6,
  },
  reqStar: {
    color: "#B85C64",
  },
  modalInput: {
    height: 40,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    fontSize: 13,
    color: "#28242B",
    outlineStyle: "none",
  },
  inputError: {
    borderColor: "#B85C64",
    backgroundColor: "#F7EDEE",
  },
  errorText: {
    fontSize: 11,
    color: "#B85C64",
    marginTop: 3,
    fontWeight: "500",
  },
  modalFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#F8F5F7",
    backgroundColor: "#F8F5F7",
  },
  cancelBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 6,
    cursor: "pointer",
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#77717A",
  },
  submitModalBtn: {
    backgroundColor: "#B9829A",
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 8,
    cursor: "pointer",
  },
  submitModalBtnText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  voucherBox: {
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 10,
    padding: 20,
  },
  vouchBrand: {
    fontSize: 15,
    fontWeight: "800",
    color: "#B9829A",
    textAlign: "center",
  },
  vouchSub: {
    fontSize: 12,
    color: "#77717A",
    textAlign: "center",
    marginTop: 2,
  },
  voucherTopKpiRow: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 12,
  },
  voucherKpiPill: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  voucherKpiPillLabel: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#77717A",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  voucherKpiPillVal: {
    fontSize: 13,
    fontWeight: "800",
    color: "#28242B",
  },
  vouchDivider: {
    height: 1,
    backgroundColor: "#E5DFE4",
    marginVertical: 14,
  },
  vouchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  vouchLabel: {
    fontSize: 12.5,
    color: "#77717A",
  },
  vouchValue: {
    fontSize: 13,
    color: "#28242B",
  },
  vouchValueBold: {
    fontSize: 13,
    fontWeight: "700",
    color: "#28242B",
  },
  vouchRowBig: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 6,
  },
  vouchTotalLabel: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#28242B",
  },
  vouchTotalValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#4F8A72",
  },
});
