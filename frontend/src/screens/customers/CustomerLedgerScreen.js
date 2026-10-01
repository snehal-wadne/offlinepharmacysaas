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
import { LEDGER_AGING_FILTER } from "../../constants/uiConstants";
import {
  fetchCustomers,
  fetchCustomerLedger,
  settleCustomerDue,
} from "../../api/customerApi";
import {
  SkeletonTableRow,
  SkeletonItemCard,
} from "../../components/common/SkeletonLoader";
import PaginationControls from "../../components/common/PaginationControls";
import {
  exportCustomerLedgerStatement,
  exportToCSV,
} from "../../utils/exportUtils";

export default function CustomerLedgerScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isCompact = width < 1100;

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAgingFilter, setSelectedAgingFilter] = useState("All Ledgers");

  // Ledger Accounts State
  const [ledgerAccounts, setLedgerAccounts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

 useEffect(() => {
  let isMounted = true;

  async function loadLedger() {
    try {
      setLoading(true);

      const res = await fetchCustomers();

      console.log("[CustomerLedger] API response:", res);

      // =========================================================
      // BACKEND RESPONSE
      //
      // {
      //   success: true,
      //   data: {
      //     success: true,
      //     count: 16,
      //     data: [...]
      //   }
      // }
      //
      // Therefore customer array = res.data.data
      // =========================================================

      const customers = Array.isArray(res?.data?.data)
        ? res.data.data
        : Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res)
            ? res
            : [];

      console.log(
        "[CustomerLedger] Extracted customers:",
        customers
      );

      console.log(
        "[CustomerLedger] Customer count:",
        customers.length
      );

      if (!isMounted) return;

      const mapped = customers.map((c) => {
        const creditLimit = Number(
          c?.creditLimit ??
          c?.credit_limit ??
          0
        );

        const balance = Number(
          c?.outstandingBalance ??
          c?.outstanding_balance ??
          0
        );

        let creditStatus = "Healthy";

        if (creditLimit > 0 && balance > creditLimit) {
          creditStatus = "Limit Exceeded";
        } else if (balance > 0) {
          creditStatus = "Active Account";
        }

        const utilization =
          creditLimit > 0
            ? Math.round((balance / creditLimit) * 100)
            : 0;

        return {
          // Internal/customer identifiers
          id:
            c?.customerNumber ||
            c?.customer_number ||
            c?.id ||
            "",

          rawId: c?.id || "",

          customerNumber:
            c?.customerNumber ||
            c?.customer_number ||
            "",

          // Customer information
          name: c?.name || "Unknown Customer",

          phone: c?.phone || "",

          branch:
            c?.branchName ||
            c?.branch ||
            "Main Branch",

          city: c?.city || "",

          address: c?.address || "",

          age: c?.age ?? "",

          gender: c?.gender || "",

          category: c?.category || "",

          // Doctor
          doctorName: c?.doctorName || "",

          doctorSpecialty:
            c?.doctorSpecialty ||
            c?.doctor_specialty ||
            "",

          // Prescription
          activeRxNo: c?.activeRxNo || "",

          // Financial values
          creditLimitValue: creditLimit,

          creditLimit: `₹${creditLimit.toLocaleString(
            "en-IN",
            {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }
          )}`,

          balanceRaw: balance,

          currentBalance: `₹${balance.toLocaleString(
            "en-IN",
            {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }
          )}`,

          currentDue: `₹${balance.toLocaleString(
            "en-IN",
            {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }
          )}`,

          // Aging
          agingBucket:
            balance > 0
              ? "1-30 Days"
              : "Current",

          // Credit status
          creditStatus,

          // Utilization
          utilizationPercent: `${Math.min(
            100,
            Math.max(0, utilization)
          )}%`,

          // Backend fields
          loyaltyPoints: Number(
            c?.loyaltyPoints ?? 0
          ),

          totalSpent: Number(
            c?.totalSpent ?? 0
          ),

          outstandingBalance: balance,

          // These fields are not present in current
          // customer-list backend response.
          // Keep them empty instead of fake values.
          lastPaymentDate: "",
          lastPaymentAmount: "₹0.00",
          lastInvoiceNo: "",
          lastInvoiceDate: "",

          // Statement data if backend eventually provides it
          statements: Array.isArray(c?.statements)
            ? c.statements
            : [],
        };
      });

      console.log(
        "[CustomerLedger] MAPPED LEDGER ACCOUNTS:",
        mapped
      );

      console.log(
        "[CustomerLedger] MAPPED COUNT:",
        mapped.length
      );

      setLedgerAccounts(mapped);

      // Reset pagination after loading fresh data
      setCurrentPage(1);
    } catch (err) {
      console.error(
        "[CustomerLedger] Failed to fetch customer accounts:",
        err
      );

      if (isMounted) {
        setLedgerAccounts([]);
      }
    } finally {
      if (isMounted) {
        setLoading(false);
      }
    }
  }

  loadLedger();

  return () => {
    isMounted = false;
  };
}, []);

  // Modal 1: Statement Modal (RX-06, RX-07)
  const [statementModalVisible, setStatementModalVisible] = useState(false);
  const [activeAccount, setActiveAccount] = useState(null);

  // Modal 2: Settle Dues Modal
  const [settleModalVisible, setSettleModalVisible] = useState(false);
  const [settleAccount, setSettleAccount] = useState(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleMode, setSettleMode] = useState("UPI / QR");

  // Filtered Ledgers
  const filteredLedgers = ledgerAccounts.filter((acc) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      acc.name.toLowerCase().includes(query) ||
      acc.phone.toLowerCase().includes(query) ||
      acc.id.toLowerCase().includes(query) ||
      acc.branch.toLowerCase().includes(query);

    const matchesAging =
      selectedAgingFilter === "All Ledgers" ||
      (selectedAgingFilter === "Outstanding Dues"
        ? acc.currentBalance !== "₹0.00"
        : selectedAgingFilter === "Credit Exceeded"
          ? acc.creditStatus === "Limit Exceeded"
          : acc.agingBucket === selectedAgingFilter);

    return matchesSearch && matchesAging;
  });

  const [statementLoading, setStatementLoading] = useState(false);

  const handleOpenStatement = async (acc) => {
    setActiveAccount(acc);
    setStatementModalVisible(true);
    setStatementLoading(true);
    try {
      const res = await fetchCustomerLedger(acc.rawId);
      if (res?.success) {
        const statements = (res.data.entries || []).map((e) => ({
          id: e.id,
          date: new Date(e.entry_date).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
          type:
            e.entry_type === "INVOICE"
              ? "Debit (Invoice)"
              : e.entry_type === "RETURN"
                ? "Credit (Return)"
                : e.entry_type === "ADJUSTMENT"
                  ? Number(e.debit_amount) > 0
                    ? "Debit (Adjustment)"
                    : "Credit (Adjustment)"
                  : "Credit (Payment)",
          refNo: e.reference_type,
          description: e.description || "",
          debit:
            Number(e.debit_amount) > 0
              ? `₹${Number(e.debit_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
              : "-",
          credit:
            Number(e.credit_amount) > 0
              ? `₹${Number(e.credit_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
              : "-",
          runningBalance: `₹${Number(e.balance_after).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
        }));
        setActiveAccount((prev) => (prev ? { ...prev, statements } : prev));
      }
    } catch (err) {
      console.warn("[CustomerLedger] Failed to fetch statement:", err.message);
    } finally {
      setStatementLoading(false);
    }
  };

  const handleOpenSettle = (acc) => {
    if (!acc) return;
    setSettleAccount(acc);
    const balanceStr = String(acc.currentBalance || acc.currentDue || "0");
    const numericBalance = balanceStr.replace(/[^0-9.]/g, "") || "0";
    setSettleAmount(numericBalance);
    setSettleMode("UPI / QR");
    setSettleModalVisible(true);
  };

  const [settling, setSettling] = useState(false);

  const handleProcessSettlement = async () => {
    if (!settleAccount) return;
    const cleanAmountStr = String(settleAmount || "").replace(/[^0-9.]/g, "");
    const paidVal = parseFloat(cleanAmountStr);

    if (isNaN(paidVal) || paidVal <= 0) {
      if (onShowToast)
        onShowToast("⚠️ Please enter a valid settlement amount greater than 0");
      return;
    }

    const methodMap = {
      "UPI / QR": "UPI",
      Cash: "CASH",
      Card: "CARD",
      Cheque: "CHEQUE",
      "Bank Transfer": "BANK_TRANSFER",
    };

    try {
      setSettling(true);
      const res = await settleCustomerDue(settleAccount.rawId, {
        amount: paidVal,
        paymentMethod: methodMap[settleMode] || "CASH",
      });
      if (!res?.success) throw new Error(res?.error || "Failed to record payment");

      const newBalanceVal = Number(res.data.outstandingBalance);
      const limitStr = String(settleAccount.creditLimit || "0").replace(
        /[^0-9.]/g,
        "",
      );
      const limitVal = parseFloat(limitStr) || 1;
      const newUtilPct = Math.min(
        100,
        Math.round((newBalanceVal / limitVal) * 100),
      );

      setLedgerAccounts((prev) =>
        prev.map((acc) =>
          acc.id === settleAccount.id
            ? {
                ...acc,
                balanceRaw: newBalanceVal,
                currentBalance: `₹${newBalanceVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
                currentDue: `₹${newBalanceVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
                lastPaymentDate: new Date().toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                }),
                lastPaymentAmount: `₹${paidVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
                creditStatus:
                  newBalanceVal === 0
                    ? "Healthy"
                    : newUtilPct > 90
                      ? "Limit Exceeded"
                      : "Active Account",
                agingBucket: newBalanceVal === 0 ? "Settled" : acc.agingBucket,
                utilizationPercent: `${newUtilPct}%`,
              }
            : acc,
        ),
      );
      setSettleModalVisible(false);

      if (onShowToast) {
        onShowToast(
          `✓ Processed ₹${paidVal.toLocaleString("en-IN")} payment for ${settleAccount.name} via ${settleMode}! Receipt #${res.data.payment.receipt_number} generated.`,
        );
      }
    } catch (err) {
      if (onShowToast) onShowToast(`⚠️ ${err.message}`);
    } finally {
      setSettling(false);
    }
  };

  const handleExportStatement = (acc) => {
    if (!acc) return;
    const rows = acc.statements || [];
    exportCustomerLedgerStatement(acc, rows);
    if (onShowToast) {
      onShowToast(
        `✓ Opening Ledger Statement for ${acc.name} (${acc.id}) (Print / Save as PDF)...`,
      );
    }
  };

  const handleExportAllLedgers = () => {
    const headers = [
      "Account ID",
      "Customer / Patient Name",
      "Phone",
      "Branch",
      "Credit Limit",
      "Current Outstanding",
      "Aging Bucket",
      "Credit Status",
      "Last Invoice No",
      "Last Invoice Date",
      "Last Payment Amount",
      "Last Payment Date",
    ];
    const rows = filteredLedgers.map((acc) => [
      acc.id || "",
      acc.name || "",
      acc.phone || "",
      acc.branch || "Main Branch",
      acc.creditLimit || "₹10,000.00",
      acc.currentBalance || acc.currentDue || "₹0.00",
      acc.agingBucket || "0-15 Days",
      acc.creditStatus || "Healthy",
      acc.lastInvoiceNo || "",
      acc.lastInvoiceDate || "",
      acc.lastPaymentAmount || "",
      acc.lastPaymentDate || "",
    ]);

    exportToCSV(
      headers,
      rows,
      `customer_master_credit_ledgers_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    if (onShowToast) {
      onShowToast(
        `✓ Exported ${filteredLedgers.length} Master Credit Ledger records as CSV!`,
      );
    }
  };

  const totalOutstanding = ledgerAccounts.reduce(
    (acc, a) => acc + (a.balanceRaw || 0),
    0,
  );
  const overdueCount = ledgerAccounts.filter(
    (a) => (a.balanceRaw || 0) > 0,
  ).length;
  const exceededCount = ledgerAccounts.filter(
    (a) => a.creditStatus === "Limit Exceeded",
  ).length;
  const activeCount = ledgerAccounts.length;

  const dynamicKpis = [
    {
      id: "kpi-1",
      label: "TOTAL OUTSTANDING (RX-06)",
      value: `₹${totalOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      subtext: `${overdueCount} accounts with dues`,
      variant: "red",
    },
    {
      id: "kpi-2",
      label: "ACTIVE CREDIT ACCOUNTS",
      value: `${activeCount}`,
      subtext: "Credit facility active",
      variant: "teal",
    },
    {
      id: "kpi-3",
      label: "OVERDUE DUED ACCOUNTS",
      value: `${overdueCount}`,
      subtext: "Payment collection required",
      variant: "orange",
    },
    {
      id: "kpi-4",
      label: "CREDIT LIMIT EXCEEDED",
      value: `${exceededCount}`,
      subtext: "Dispensing lock recommended",
      variant: "blue",
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
            <Text style={styles.pageTitle}>Credit Ledger</Text>
            <View style={styles.liveTagBadge}>
              <Text style={styles.liveTagText}>LEDGER CONTROL</Text>
            </View>
          </View>
          <Text style={styles.pageSubtitle}>
            Patient credit limits, dues aging buckets, outstanding balances
            (RX-06), and running ledger statements.
          </Text>
        </View>

        <Pressable
          onPress={handleExportAllLedgers}
          style={styles.exportBtnPrimary}
          accessibilityRole="button"
        >
          <Text style={styles.exportBtnTextPrimary}>Export All Ledgers</Text>
        </Pressable>
      </View>

      {/* Top 4 Responsive KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
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

      {/* Ledger Accounts Table Card */}
      <View style={styles.cardContainer}>
        {/* Search & Aging Filter Bar */}
        <View
          style={[styles.filtersBar, isCompact && styles.filtersBarCompact]}
        >
          <View style={[styles.searchBox, isMobile && styles.searchBoxMobile]}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by customer name, phone, patient ID or branch..."
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

          {/* Aging Filter Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterChipScroll}
          >
            <View style={styles.filterChipRow}>
              {LEDGER_AGING_FILTER.map((st) => (
                <Pressable
                  key={st}
                  onPress={() => setSelectedAgingFilter(st)}
                  style={[
                    styles.filterChip,
                    selectedAgingFilter === st && styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedAgingFilter === st && styles.filterChipTextActive,
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
            Credit Accounts ({filteredLedgers.length})
          </Text>
          <Text style={styles.paginationInfo}>
            Showing 1-{filteredLedgers.length} of {ledgerAccounts.length}{" "}
            accounts
          </Text>
        </View>

        {isMobile ? (
          /* Mobile Credit Account Cards */
          <View style={styles.mobileCardList}>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <SkeletonItemCard key={i} />
              ))
            ) : filteredLedgers.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No credit accounts found</Text>
                <Text style={styles.emptySubtitle}>
                  Try changing your search keywords or aging filter selection.
                </Text>
              </View>
            ) : (
              filteredLedgers
                .slice(
                  (currentPage - 1) * itemsPerPage,
                  currentPage * itemsPerPage,
                )
                .map((acc) => {
                  const isOverdue = acc.agingBucket.includes("30+ Days");
                  const isExceeded = acc.creditStatus === "Limit Exceeded";
                  return (
                    <View key={acc.id} style={styles.mobileCreditCard}>
                      <View style={styles.mobileCardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.mobileAccName}>{acc.name}</Text>
                          <Text style={styles.mobileAccSub}>
                            {acc.id} • {acc.phone}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.statusBadgeActive,
                            (isExceeded || isOverdue) &&
                              styles.statusBadgeExceeded,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeTextActive,
                              (isExceeded || isOverdue) &&
                                styles.statusBadgeTextExceeded,
                            ]}
                          >
                            {acc.creditStatus}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.mobileGrid}>
                        <View style={styles.mobileGridCol}>
                          <Text style={styles.mobileLabel}>Current Due</Text>
                          <Text
                            style={[
                              styles.mobileValBold,
                              {
                                color:
                                  (acc.currentBalance || acc.currentDue) !==
                                  "₹0.00"
                                    ? "#B85C64"
                                    : "#4F8A72",
                              },
                            ]}
                          >
                            {acc.currentBalance || acc.currentDue || "₹0.00"}
                          </Text>
                        </View>
                        <View style={styles.mobileGridCol}>
                          <Text style={styles.mobileLabel}>Credit Limit</Text>
                          <Text style={styles.mobileValBold}>
                            {acc.creditLimit}
                          </Text>
                        </View>
                        <View style={styles.mobileGridCol}>
                          <Text style={styles.mobileLabel}>Utilization</Text>
                          <Text
                            style={[
                              styles.mobileValBold,
                              isExceeded
                                ? { color: "#B85C64" }
                                : { color: "#B9829A" },
                            ]}
                          >
                            {acc.utilizationPercent ||
                              (acc.utilizationPct
                                ? `${acc.utilizationPct}%`
                                : "0%")}
                          </Text>
                        </View>
                        <View style={styles.mobileGridCol}>
                          <Text style={styles.mobileLabel}>Aging Bucket</Text>
                          <Text
                            style={[
                              styles.mobileVal,
                              isOverdue
                                ? { color: "#B85C64", fontWeight: "700" }
                                : {},
                            ]}
                          >
                            {acc.agingBucket}
                          </Text>
                        </View>
                        <View style={styles.mobileGridColFull}>
                          <Text style={styles.mobileLabel}>Last Payment</Text>
                          <Text style={styles.mobileVal}>
                            {acc.lastPaymentDate}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.mobileCardFooter}>
                        <Pressable
                          onPress={() => handleOpenSettle(acc)}
                          style={styles.mobileSettleBtn}
                          accessibilityRole="button"
                        >
                          <Text style={styles.mobileSettleBtnText}>
                            + Settle Due
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleOpenStatement(acc)}
                          style={styles.mobileStmtBtn}
                          accessibilityRole="button"
                        >
                          <Text style={styles.mobileStmtBtnText}>
                            Statement
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
            )}
          </View>
        ) : (
          /* Desktop Ledger Table */
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { width: 100 }]}>PATIENT ID</Text>
                <Text style={[styles.thCell, { width: 180 }]}>
                  CUSTOMER NAME
                </Text>
                <Text style={[styles.thCell, { width: 130 }]}>PHONE</Text>
                <Text
                  style={[styles.thCell, { width: 120, textAlign: "right" }]}
                >
                  CREDIT LIMIT
                </Text>
                <Text
                  style={[styles.thCell, { width: 130, textAlign: "right" }]}
                >
                  CURRENT DUE
                </Text>
                <Text
                  style={[styles.thCell, { width: 110, textAlign: "center" }]}
                >
                  UTILIZATION %
                </Text>
                <Text
                  style={[styles.thCell, { width: 130, textAlign: "center" }]}
                >
                  DUES AGING
                </Text>
                <Text style={[styles.thCell, { width: 120 }]}>
                  LAST INVOICE
                </Text>
                <Text style={[styles.thCell, { width: 120 }]}>
                  LAST PAYMENT
                </Text>
                <Text
                  style={[styles.thCell, { width: 110, textAlign: "center" }]}
                >
                  STATUS
                </Text>
                <Text
                  style={[styles.thCell, { width: 160, textAlign: "center" }]}
                >
                  ACTIONS
                </Text>
              </View>

              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonTableRow key={i} columns={11} />
                ))
              ) : filteredLedgers.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>
                    No credit accounts found
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    Try changing your search keywords or aging filter selection.
                  </Text>
                </View>
              ) : (
                filteredLedgers
                  .slice(
                    (currentPage - 1) * itemsPerPage,
                    currentPage * itemsPerPage,
                  )
                  .map((acc, index) => {
                    const isOverdue = acc.agingBucket.includes("30+ Days");
                    const isExceeded = acc.creditStatus === "Limit Exceeded";
                    return (
                      <View
                        key={acc.id}
                        style={[
                          styles.tableRow,
                          index % 2 === 1 && styles.tableRowAlt,
                        ]}
                      >
                        <Text
                          style={[
                            styles.tdCell,
                            styles.patientIdText,
                            { width: 100 },
                          ]}
                        >
                          {acc.id}
                        </Text>

                        <View style={[{ width: 180 }]}>
                          <Text
                            style={[styles.tdCell, styles.patientNameText]}
                            numberOfLines={1}
                          >
                            {acc.name}
                          </Text>
                          <Text style={styles.branchSubtext}>{acc.branch}</Text>
                        </View>

                        <Text
                          style={[
                            styles.tdCell,
                            styles.phoneText,
                            { width: 130 },
                          ]}
                        >
                          {acc.phone}
                        </Text>

                        <Text
                          style={[
                            styles.tdCell,
                            styles.limitText,
                            { width: 120, textAlign: "right" },
                          ]}
                        >
                          {acc.creditLimit}
                        </Text>

                        <Text
                          style={[
                            styles.tdCell,
                            styles.dueText,
                            {
                              width: 130,
                              textAlign: "right",
                              color:
                                (acc.currentBalance || acc.currentDue) !==
                                "₹0.00"
                                  ? "#B85C64"
                                  : "#4F8A72",
                            },
                          ]}
                        >
                          {acc.currentBalance || acc.currentDue || "₹0.00"}
                        </Text>

                        <View style={[{ width: 110, alignItems: "center" }]}>
                          <Text
                            style={[
                              styles.utilText,
                              isExceeded && styles.utilTextExceeded,
                            ]}
                          >
                            {acc.utilizationPercent ||
                              (acc.utilizationPct
                                ? `${acc.utilizationPct}%`
                                : "0%")}
                          </Text>
                        </View>

                        <View style={[{ width: 130, alignItems: "center" }]}>
                          <View
                            style={[
                              styles.agingPill,
                              isOverdue
                                ? styles.agingPillRed
                                : acc.agingBucket === "16-30 Days"
                                  ? styles.agingPillAmber
                                  : styles.agingPillTeal,
                            ]}
                          >
                            <Text
                              style={[
                                styles.agingPillText,
                                isOverdue
                                  ? styles.agingTextRed
                                  : acc.agingBucket === "16-30 Days"
                                    ? styles.agingTextAmber
                                    : styles.agingTextTeal,
                              ]}
                            >
                              {acc.agingBucket}
                            </Text>
                          </View>
                        </View>

                        <View style={[{ width: 120 }]}>
                          <Text style={styles.lastInvText}>
                            {acc.lastInvoiceDate}
                          </Text>
                          <Text style={styles.lastInvNoSubtext}>
                            {acc.lastInvoiceNo}
                          </Text>
                        </View>

                        <View style={[{ width: 120 }]}>
                          <Text style={styles.lastPayText}>
                            {acc.lastPaymentDate}
                          </Text>
                          <Text style={styles.lastPayAmtSubtext}>
                            {acc.lastPaymentAmount}
                          </Text>
                        </View>

                        <View style={[{ width: 110, alignItems: "center" }]}>
                          <View
                            style={[
                              styles.statusBadge,
                              isExceeded || isOverdue
                                ? styles.statusBadgeRed
                                : acc.creditStatus === "Follow-up Due"
                                  ? styles.statusBadgeAmber
                                  : styles.statusBadgeGreen,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                isExceeded || isOverdue
                                  ? styles.statusTextRed
                                  : acc.creditStatus === "Follow-up Due"
                                    ? styles.statusTextAmber
                                    : styles.statusTextGreen,
                              ]}
                            >
                              {acc.creditStatus}
                            </Text>
                          </View>
                        </View>

                        <View
                          style={[styles.actionsCellWrapper, { width: 160 }]}
                        >
                          <Pressable
                            onPress={() => handleOpenSettle(acc)}
                            style={styles.settleBtn}
                          >
                            <Text style={styles.settleBtnText}>Settle Due</Text>
                          </Pressable>

                          <Pressable
                            onPress={() => handleOpenStatement(acc)}
                            style={styles.stmtBtn}
                          >
                            <Text style={styles.stmtBtnText}>Statement</Text>
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
          totalPages={Math.ceil(filteredLedgers.length / itemsPerPage)}
          onPageChange={setCurrentPage}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={setItemsPerPage}
        />
      </View>

      {/* Modal 1: Statement Modal */}
      {activeAccount && (
        <Modal
          visible={statementModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setStatementModalVisible(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setStatementModalVisible(false)}
          >
            <Pressable
              style={[
                styles.modalCardLarge,
                isMobile && styles.modalCardMobile,
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>
                    Patient Ledger Statement (RX-06)
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    {activeAccount.name} ({activeAccount.id}) • Credit Limit:{" "}
                    {activeAccount.creditLimit}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setStatementModalVisible(false)}
                  style={styles.closeBtn}
                >
                  <Text style={styles.closeBtnText}>✕</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.stmtSummaryBox}>
                  <View style={styles.stmtSummaryCol}>
                    <Text style={styles.stmtSummaryLabel}>Credit Limit:</Text>
                    <Text style={styles.stmtSummaryValue}>
                      {activeAccount.creditLimit}
                    </Text>
                  </View>
                  <View style={styles.stmtSummaryCol}>
                    <Text style={styles.stmtSummaryLabel}>
                      Current Balance Due:
                    </Text>
                    <Text
                      style={[styles.stmtSummaryValue, { color: "#B85C64" }]}
                    >
                      {activeAccount.currentBalance}
                    </Text>
                  </View>
                  <View style={styles.stmtSummaryCol}>
                    <Text style={styles.stmtSummaryLabel}>Aging Status:</Text>
                    <Text
                      style={[styles.stmtSummaryValue, { color: "#B9829A" }]}
                    >
                      {activeAccount.agingBucket}
                    </Text>
                  </View>
                </View>

                <Text style={styles.sectionHeading}>
                  Running Ledger History
                </Text>
                {activeAccount.statements &&
                activeAccount.statements.length > 0 ? (
                  <View style={styles.stmtTableWrapper}>
                    <View style={styles.stmtTableHeader}>
                      <Text style={[styles.sThCell, { width: 90 }]}>DATE</Text>
                      <Text style={[styles.sThCell, { width: 110 }]}>TYPE</Text>
                      <Text style={[styles.sThCell, { width: 120 }]}>
                        REF / INV NO
                      </Text>
                      <Text style={[styles.sThCell, { width: 220 }]}>
                        PARTICULARS
                      </Text>
                      <Text
                        style={[
                          styles.sThCell,
                          { width: 90, textAlign: "right" },
                        ]}
                      >
                        DEBIT (₹)
                      </Text>
                      <Text
                        style={[
                          styles.sThCell,
                          { width: 90, textAlign: "right" },
                        ]}
                      >
                        CREDIT (₹)
                      </Text>
                      <Text
                        style={[
                          styles.sThCell,
                          { width: 100, textAlign: "right" },
                        ]}
                      >
                        BALANCE
                      </Text>
                    </View>

                    {activeAccount.statements.map((row) => (
                      <View key={row.id} style={styles.stmtTableRow}>
                        <Text style={[styles.sTdCell, { width: 90 }]}>
                          {row.date}
                        </Text>
                        <Text
                          style={[
                            styles.sTdCell,
                            {
                              width: 110,
                              fontWeight: "700",
                              color: row.type.includes("Debit")
                                ? "#28242B"
                                : "#4F8A72",
                            },
                          ]}
                        >
                          {row.type}
                        </Text>
                        <Text
                          style={[
                            styles.sTdCell,
                            styles.refText,
                            { width: 120 },
                          ]}
                        >
                          {row.refNo}
                        </Text>
                        <Text
                          style={[styles.sTdCell, { width: 220 }]}
                          numberOfLines={1}
                        >
                          {row.description}
                        </Text>
                        <Text
                          style={[
                            styles.sTdCell,
                            {
                              width: 90,
                              textAlign: "right",
                              fontWeight: "700",
                              color: row.debit !== "-" ? "#B85C64" : "#77717A",
                            },
                          ]}
                        >
                          {row.debit}
                        </Text>
                        <Text
                          style={[
                            styles.sTdCell,
                            {
                              width: 90,
                              textAlign: "right",
                              fontWeight: "700",
                              color: row.credit !== "-" ? "#4F8A72" : "#77717A",
                            },
                          ]}
                        >
                          {row.credit}
                        </Text>
                        <Text
                          style={[
                            styles.sTdCell,
                            {
                              width: 100,
                              textAlign: "right",
                              fontWeight: "800",
                              color: "#28242B",
                            },
                          ]}
                        >
                          {row.runningBalance}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.stmtTableWrapper}>
                    <View style={styles.stmtTableHeader}>
                      <Text style={[styles.sThCell, { width: 90 }]}>DATE</Text>
                      <Text style={[styles.sThCell, { width: 110 }]}>TYPE</Text>
                      <Text style={[styles.sThCell, { width: 120 }]}>
                        REF / INV NO
                      </Text>
                      <Text style={[styles.sThCell, { width: 220 }]}>
                        PARTICULARS
                      </Text>
                      <Text
                        style={[
                          styles.sThCell,
                          { width: 90, textAlign: "right" },
                        ]}
                      >
                        DEBIT (₹)
                      </Text>
                      <Text
                        style={[
                          styles.sThCell,
                          { width: 90, textAlign: "right" },
                        ]}
                      >
                        CREDIT (₹)
                      </Text>
                      <Text
                        style={[
                          styles.sThCell,
                          { width: 100, textAlign: "right" },
                        ]}
                      >
                        BALANCE
                      </Text>
                    </View>
                    <View style={styles.stmtTableRow}>
                      <Text style={[styles.sTdCell, { width: 90 }]}>
                        {activeAccount.lastInvoiceDate}
                      </Text>
                      <Text
                        style={[
                          styles.sTdCell,
                          { width: 110, fontWeight: "700", color: "#28242B" },
                        ]}
                      >
                        Debit (Invoice)
                      </Text>
                      <Text
                        style={[styles.sTdCell, styles.refText, { width: 120 }]}
                      >
                        {activeAccount.lastInvoiceNo}
                      </Text>
                      <Text style={[styles.sTdCell, { width: 220 }]}>
                        Prescription Dispensation & Meds
                      </Text>
                      <Text
                        style={[
                          styles.sTdCell,
                          {
                            width: 90,
                            textAlign: "right",
                            fontWeight: "700",
                            color: "#B85C64",
                          },
                        ]}
                      >
                        {activeAccount.currentBalance}
                      </Text>
                      <Text
                        style={[
                          styles.sTdCell,
                          { width: 90, textAlign: "right", color: "#77717A" },
                        ]}
                      >
                        -
                      </Text>
                      <Text
                        style={[
                          styles.sTdCell,
                          { width: 100, textAlign: "right", fontWeight: "800" },
                        ]}
                      >
                        {activeAccount.currentBalance}
                      </Text>
                    </View>
                  </View>
                )}
              </ScrollView>

              <View style={styles.modalFooter}>
                <Pressable
                  onPress={() => handleExportStatement(activeAccount)}
                  style={styles.exportBtnSecondary}
                >
                  <Text style={styles.exportBtnTextSecondary}>
                    Export PDF Statement
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setStatementModalVisible(false)}
                  style={styles.submitModalBtn}
                >
                  <Text style={styles.submitModalBtnText}>Close</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Modal 2: Settle Dues Modal */}
      {settleAccount && (
        <Modal
          visible={settleModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSettleModalVisible(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setSettleModalVisible(false)}
          >
            <Pressable
              style={[styles.modalCard, isMobile && styles.modalCardMobile]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>
                    Settle Patient Dues (RX-06)
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    {settleAccount.name} • Current Outstanding:{" "}
                    {settleAccount.currentBalance}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setSettleModalVisible(false)}
                  style={styles.closeBtn}
                >
                  <Text style={styles.closeBtnText}>✕</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>
                    Settlement Amount (₹) <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    placeholder="Enter amount to pay"
                    placeholderTextColor="#77717A"
                    value={settleAmount}
                    onChangeText={setSettleAmount}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>Payment Mode</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="UPI / QR, Cash, Card, Cheque"
                    placeholderTextColor="#77717A"
                    value={settleMode}
                    onChangeText={setSettleMode}
                  />
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <Pressable
                  onPress={() => setSettleModalVisible(false)}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleProcessSettlement}
                  style={[styles.submitModalBtn, settling && { opacity: 0.6 }]}
                  disabled={settling}
                >
                  <Text style={styles.submitModalBtnText}>
                    {settling ? "Processing..." : "Process Payment"}
                  </Text>
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
  exportBtnPrimary: {
    backgroundColor: "#B9829A",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: "pointer",
  },
  exportBtnTextPrimary: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#FFFFFF",
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
  kpiCol: {
    flex: 1,
    minWidth: 220,
  },
  kpiColMobile: {
    minWidth: "47%",
    maxWidth: "48.5%",
  },
  /* Mobile Credit Card Styles */
  mobileCardList: {
    padding: 12,
    gap: 12,
  },
  mobileCreditCard: {
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
  mobileAccName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#28242B",
  },
  mobileAccSub: {
    fontSize: 12,
    color: "#77717A",
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
  mobileGridColFull: {
    width: "100%",
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
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F8F5F7",
  },
  mobileSettleBtn: {
    flex: 1,
    backgroundColor: "#B9829A",
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  mobileSettleBtnText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  mobileStmtBtn: {
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignItems: "center",
  },
  mobileStmtBtnText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#28242B",
  },
  statusBadgeExceeded: {
    backgroundColor: "#F7EDEE",
  },
  statusBadgeTextExceeded: {
    color: "#B85C64",
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
    minWidth: 1420,
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
  patientIdText: {
    fontWeight: "700",
    color: "#B9829A",
  },
  patientNameText: {
    fontWeight: "700",
    color: "#28242B",
  },
  branchSubtext: {
    fontSize: 11,
    color: "#77717A",
    paddingHorizontal: 6,
    marginTop: 2,
  },
  utilPercentText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#A66D86",
    backgroundColor: "#E8D5DD",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  agingPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  agingPillTeal: {
    backgroundColor: "#E8D5DD",
  },
  agingPillAmber: {
    backgroundColor: "#F7F0E5",
  },
  agingPillRed: {
    backgroundColor: "#F7EDEE",
  },
  agingPillText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  agingTextTeal: {
    color: "#B9829A",
  },
  agingTextAmber: {
    color: "#C49752",
  },
  agingTextRed: {
    color: "#B85C64",
  },
  lastInvText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#28242B",
  },
  lastInvNoSubtext: {
    fontSize: 11,
    color: "#77717A",
  },
  lastPayText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#28242B",
  },
  lastPayAmtSubtext: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4F8A72",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeGreen: {
    backgroundColor: "#EAF2EE",
  },
  statusBadgeAmber: {
    backgroundColor: "#F7F0E5",
  },
  statusBadgeRed: {
    backgroundColor: "#F7EDEE",
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  statusTextGreen: {
    color: "#4F8A72",
  },
  statusTextAmber: {
    color: "#C49752",
  },
  statusTextRed: {
    color: "#B85C64",
  },
  actionsCellWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  settleBtn: {
    backgroundColor: "#B9829A",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    cursor: "pointer",
  },
  settleBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  stmtBtn: {
    backgroundColor: "#E8D5DD",
    borderWidth: 1,
    borderColor: "#E8D5DD",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    cursor: "pointer",
  },
  stmtBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#A66D86",
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
    maxWidth: 520,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    overflow: "hidden",
  },
  modalCardLarge: {
    width: "100%",
    maxWidth: 820,
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
  stmtSummaryBox: {
    flexDirection: "row",
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    justifyContent: "space-around",
  },
  stmtSummaryCol: {
    alignItems: "center",
  },
  stmtSummaryLabel: {
    fontSize: 11.5,
    color: "#77717A",
    fontWeight: "600",
  },
  stmtSummaryValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#28242B",
    marginTop: 3,
  },
  sectionHeading: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#B9829A",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  stmtTableWrapper: {
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    overflow: "hidden",
  },
  stmtTableHeader: {
    flexDirection: "row",
    backgroundColor: "#F8F5F7",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5DFE4",
  },
  sThCell: {
    fontSize: 11,
    fontWeight: "700",
    color: "#77717A",
  },
  stmtTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F8F5F7",
  },
  sTdCell: {
    fontSize: 12.5,
    color: "#28242B",
  },
  refText: {
    fontWeight: "700",
    color: "#B9829A",
  },
});
