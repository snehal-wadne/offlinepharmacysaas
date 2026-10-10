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
import { SkeletonTableRow } from "../../components/common/SkeletonLoader";
import PaginationControls from "../../components/common/PaginationControls";
import {
  exportAuditLogReport,
  exportSingleAuditLogPDF,
} from "../../utils/exportUtils";
import { fetchAuditLogs } from "../../api/auditApi";

export default function AuditLogScreen({
  onShowToast,
  onNavigate,
  selectedBranch = "All Branches",
  initialSearchQuery = "",
}) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  // Search & KPI Filter State
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || "");
  const [activeKpiFilter, setActiveKpiFilter] = useState("ALL"); // 'ALL' | 'CRITICAL' | 'STOCK' | 'RX' | 'SECURITY'

  useEffect(() => {
    if (initialSearchQuery) {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  // Audit Logs State
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    let isMounted = true;
    async function loadLiveLogs() {
      try {
        setLoading(true);
        const rawBranch =
          typeof selectedBranch === "object" && selectedBranch !== null
            ? selectedBranch.id
            : selectedBranch;
        const branchParam =
          rawBranch &&
          rawBranch !== "All Branches" &&
          rawBranch !== "all" &&
          rawBranch !== "No Active Branch"
            ? rawBranch
            : undefined;
        const res = await fetchAuditLogs({ branchId: branchParam, limit: 100 });
        const rawLogs = Array.isArray(res?.data?.data)
          ? res.data.data
          : Array.isArray(res?.data)
            ? res.data
            : [];

        if (isMounted) {
          const mapped = rawLogs.map((l) => ({
            id: l.id || `LOG-${Math.random().toString(36).substr(2, 6)}`,
            action: l.action || l.actionType || "SYSTEM_EVENT",
            actionLabel:
              l.actionLabel || l.action?.replace(/_/g, " ") || "System Event",
            actionType: l.actionType || l.entityType || "SYSTEM",
            severity:
              l.severity ||
              (l.action?.includes("DELETE") || l.action?.includes("CANCEL")
                ? "Critical"
                : "Info"),
            entityRef:
              l.entityRef ||
              l.metadata?.receiptNumber ||
              l.metadata?.transferNumber ||
              l.metadata?.invoiceNumber ||
              (l.entityType ? `${l.entityType}: ${l.entityId || ""}` : "System Record"),
            timestamp: l.timestamp || (l.createdAt
              ? new Date(l.createdAt).toLocaleString("en-IN")
              : "Recent"),
            branch: l.branch || l.branchName || "Main Branch",
            branchId: l.branchId || l.metadata?.branchId || null,
            ipAddress: l.ipAddress || "127.0.0.1",
            device: l.device || "Web Browser",
            actor: {
              name: l.actor?.name || l.userName || "Staff User",
              role: l.actor?.role || l.userRole || "Staff",
              email: l.actor?.email || l.userEmail || "",
              phone: l.actor?.phone || l.userPhone || "",
              staffId: l.actor?.staffId || l.userStaffId || "",
              avatarInitials:
                l.actor?.avatarInitials ||
                (l.userName
                  ? l.userName
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()
                  : "SU"),
            },
            reason: l.reason || l.metadata?.reason || "",
            beforeAfterDiff: l.beforeAfterDiff || l.metadata?.diff || [],
            metadata: l.metadata || {},
          }));
          setLogs(mapped);
        }
      } catch (err) {
        console.warn("[AuditLogScreen] Audit API error:", err.message);
        if (isMounted) setLogs([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadLiveLogs();
    return () => {
      isMounted = false;
    };
  }, [selectedBranch]);

  // View Details Modal State
  const [selectedLog, setSelectedLog] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Branch-scoped base logs. selectedBranch is null ("All Branches"), a name, or { id, name }.
  const selectedBranchId =
    typeof selectedBranch === "object" && selectedBranch !== null ? selectedBranch.id : null;
  const selectedBranchName = String(
    typeof selectedBranch === "object" && selectedBranch !== null
      ? selectedBranch.name || ""
      : selectedBranch || "",
  ).toLowerCase();
  const isBranchFiltered =
    Boolean(selectedBranchId) ||
    (selectedBranchName &&
      selectedBranchName !== "all branches" &&
      selectedBranchName !== "all branches & stores");
  const scopedLogs = isBranchFiltered
    ? logs.filter((l) => {
        if (selectedBranchId && l.branchId) return String(l.branchId) === String(selectedBranchId);
        if (!l.branch) return true;
        const b = String(l.branch).toLowerCase();
        return !selectedBranchName || b.includes(selectedBranchName) || selectedBranchName.includes(b);
      })
    : logs;

  // Dynamic KPI Counts
  const totalCount = scopedLogs.length;
  const criticalCount = scopedLogs.filter(
    (l) =>
      l.severity === "Critical" ||
      l.actionType === "PRICE_OVERRIDE" ||
      l.actionType === "BILL_CANCELLED",
  ).length;
  const stockCount = scopedLogs.filter(
    (l) =>
      l.actionType === "STOCK_ADJUSTMENT" || l.actionType === "STOCK_TRANSFER",
  ).length;
  const rxCount = scopedLogs.filter(
    (l) => l.actionType === "RX_APPROVED" || l.severity === "Success",
  ).length;
  const securityCount = scopedLogs.filter(
    (l) => l.actionType === "ROLE_MODIFIED" || l.actionType === "USER_CREATED",
  ).length;

  // Filtered Logs based on Search and Selected Interactive KPI Card
  const filteredLogs = scopedLogs.filter((log) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      String(log.id || "").toLowerCase().includes(q) ||
      String(log.actor?.name || "").toLowerCase().includes(q) ||
      String(log.actor?.role || "").toLowerCase().includes(q) ||
      String(log.actionLabel || "").toLowerCase().includes(q) ||
      String(log.actionType || "").toLowerCase().includes(q) ||
      String(log.entityRef || "").toLowerCase().includes(q) ||
      String(log.reason || "").toLowerCase().includes(q);

    let matchesKpi = true;
    if (activeKpiFilter === "CRITICAL") {
      matchesKpi =
        log.severity === "Critical" ||
        log.actionType === "PRICE_OVERRIDE" ||
        log.actionType === "BILL_CANCELLED";
    } else if (activeKpiFilter === "STOCK") {
      matchesKpi =
        log.actionType === "STOCK_ADJUSTMENT" ||
        log.actionType === "STOCK_TRANSFER";
    } else if (activeKpiFilter === "RX") {
      matchesKpi =
        log.actionType === "RX_APPROVED" || log.severity === "Success";
    } else if (activeKpiFilter === "SECURITY") {
      matchesKpi =
        log.actionType === "ROLE_MODIFIED" || log.actionType === "USER_CREATED";
    }

    return matchesSearch && matchesKpi;
  });

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const handleOpenDetails = (log) => {
    setSelectedLog(log);
    setModalVisible(true);
  };

  const handleExportLogs = (format = "pdf") => {
    exportAuditLogReport(filteredLogs, format, activeKpiFilter);
    if (onShowToast) {
      onShowToast(
        `✓ Exported ${filteredLogs.length} regulatory audit records as ${format.toUpperCase()} report.`,
      );
    }
  };

  const handleExportSingleLog = (log, format = "pdf") => {
    if (!log) return;
    if (format === "csv") {
      exportAuditLogReport([log], "csv", `Event ${log.id}`);
    } else {
      exportSingleAuditLogPDF(log);
    }
    if (onShowToast) {
      onShowToast(
        `✓ Exported audit record ${log.id} (${format.toUpperCase()})`,
      );
    }
  };

  const handleNavigateToSource = (log) => {
    let targetRoute = "dashboard";
    const mod = (log.module || "").toLowerCase();
    const act = (log.actionType || "").toLowerCase();

    if (mod.includes("user") || act.includes("user")) {
      targetRoute = "users";
    } else if (
      mod.includes("role") ||
      act.includes("role") ||
      act.includes("permission")
    ) {
      targetRoute = "roles";
    } else if (mod.includes("branch") || act.includes("branch")) {
      targetRoute = "branches";
    } else if (
      mod.includes("stock") ||
      mod.includes("inventory") ||
      act.includes("stock")
    ) {
      targetRoute = "stock-adjustments";
    } else if (
      mod.includes("sale") ||
      mod.includes("pos") ||
      mod.includes("billing") ||
      act.includes("price")
    ) {
      targetRoute = "new-sale";
    } else if (
      mod.includes("ledger") ||
      mod.includes("khata") ||
      act.includes("credit") ||
      act.includes("due") ||
      act.includes("settle")
    ) {
      targetRoute = "customer-ledger";
    } else if (mod.includes("customer")) {
      targetRoute = "customers-patients";
    } else if (mod.includes("purchase") || mod.includes("receiving")) {
      targetRoute = "purchases";
    }

    if (onNavigate) {
      onNavigate(targetRoute);
    }
    if (onShowToast) {
      onShowToast(
        `✓ Opened source module [${log.module}] for ${log.entityRef}`,
      );
    }
    setModalVisible(false);
  };

  const getActionBadgeStyle = (actionType) => {
    switch (actionType) {
      case "PRICE_OVERRIDE":
        return { bg: "#F7EDEE", border: "#F7EDEE", text: "#B85C64" };
      case "REFUND_ISSUED":
      case "BILL_CANCELLED":
        return { bg: "#F7F0E5", border: "#F7F0E5", text: "#C49752" };
      case "STOCK_ADJUSTMENT":
      case "STOCK_TRANSFER":
        return { bg: "#E8D5DD", border: "#E8D5DD", text: "#B9829A" };
      case "ROLE_MODIFIED":
      case "USER_CREATED":
        return { bg: "#E8D5DD", border: "#E8D5DD", text: "#B9829A" };
      case "RX_APPROVED":
        return { bg: "#EAF2EE", border: "#EAF2EE", text: "#4F8A72" };
      default:
        return { bg: "#F8F5F7", border: "#E5DFE4", text: "#77717A" };
    }
  };

  const getSeverityStyle = (severity) => {
    switch (severity) {
      case "Critical":
        return { bg: "#F7EDEE", text: "#B85C64", dot: "#B85C64" };
      case "Warning":
        return { bg: "#F7F0E5", text: "#C49752", dot: "#C49752" };
      case "Success":
        return { bg: "#EAF2EE", text: "#4F8A72", dot: "#4F8A72" };
      default:
        return { bg: "#E8D5DD", text: "#B9829A", dot: "#B9829A" };
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        isMobile && styles.contentContainerMobile,
      ]}
      showsVerticalScrollIndicator={true}
    >
      {/* 1. Header & Title Banner */}
      <View style={[styles.headerRow, isMobile && styles.headerRowMobile]}>
        <View style={styles.titleWrapper}>
          <Text style={styles.pageTitle}>System & Compliance Audit Log</Text>
          <Text style={styles.pageSubtitle}>
            Immutable regulatory tracking of billing discounts, price overrides,
            stock adjustments, and permission changes.
          </Text>
        </View>

        {/* Export Actions (PDF & CSV) */}
        <View
          style={[
            styles.headerActionBtns,
            isMobile && styles.headerActionBtnsMobile,
          ]}
        >
          <Pressable
            onPress={() => handleExportLogs("csv")}
            style={styles.exportBtnSecondary}
            accessibilityRole="button"
            accessibilityLabel="Export Audit Log CSV"
          >
            <Text style={styles.exportBtnIcon}>📊</Text>
            <Text style={styles.exportBtnTextSecondary}>Export CSV</Text>
          </Pressable>

          <Pressable
            onPress={() => handleExportLogs("pdf")}
            style={styles.exportBtnPrimary}
            accessibilityRole="button"
            accessibilityLabel="Export Audit Log PDF Report"
          >
            <Text style={styles.exportBtnIcon}>📥</Text>
            <Text style={styles.exportBtnTextPrimary}>Export Audit Report</Text>
          </Pressable>
        </View>
      </View>

      {/* Regulatory Compliance Journal Notice Banner */}
      <View style={styles.complianceNoticeBanner}>
        <Text style={styles.complianceNoticeIcon}>🔒</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.complianceNoticeTitle}>
            Regulatory Compliance Journal • Immutable Records
          </Text>
          <Text style={styles.complianceNoticeSubtitle}>
            All regulatory audit entries (price overrides, billing adjustments,
            stock movements, and user roles) are permanently preserved and
            cannot be modified or deleted.
          </Text>
        </View>
      </View>

      {/* 2. Interactive KPI Cards (Acts as clean, visual filter controllers) */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        <View
          style={[
            styles.kpiCardWrapper,
            isMobile && styles.kpiCardWrapperMobile,
            activeKpiFilter === "ALL" && styles.kpiCardActiveRing,
          ]}
        >
          <InventoryStatCard
            label="All Activity"
            value={String(totalCount)}
            subtext="Click to view all events"
            variant="teal"
            style={{ width: "100%", minWidth: "100%", maxWidth: "100%" }}
            onPress={() => setActiveKpiFilter("ALL")}
          />
        </View>

        <View
          style={[
            styles.kpiCardWrapper,
            isMobile && styles.kpiCardWrapperMobile,
            activeKpiFilter === "CRITICAL" && styles.kpiCardActiveRing,
          ]}
        >
          <InventoryStatCard
            label="Critical Events"
            value={String(criticalCount)}
            subtext="Discounts, price & bill edits"
            variant="orange"
            style={{ width: "100%", minWidth: "100%", maxWidth: "100%" }}
            onPress={() => setActiveKpiFilter("CRITICAL")}
          />
        </View>

        <View
          style={[
            styles.kpiCardWrapper,
            isMobile && styles.kpiCardWrapperMobile,
            activeKpiFilter === "STOCK" && styles.kpiCardActiveRing,
          ]}
        >
          <InventoryStatCard
            label="Stock Transfers"
            value={String(stockCount)}
            subtext="Adjustments & store transfers"
            variant="blue"
            style={{ width: "100%", minWidth: "100%", maxWidth: "100%" }}
            onPress={() => setActiveKpiFilter("STOCK")}
          />
        </View>

        <View
          style={[
            styles.kpiCardWrapper,
            isMobile && styles.kpiCardWrapperMobile,
            activeKpiFilter === "RX" && styles.kpiCardActiveRing,
          ]}
        >
          <InventoryStatCard
            label="Rx Validated"
            value={String(rxCount)}
            subtext="Schedule H prescription signs"
            variant="green"
            style={{ width: "100%", minWidth: "100%", maxWidth: "100%" }}
            onPress={() => setActiveKpiFilter("RX")}
          />
        </View>

        <View
          style={[
            styles.kpiCardWrapper,
            isMobile
              ? styles.kpiCardWrapperMobileFull
              : styles.kpiCardWrapperMobile,
            activeKpiFilter === "SECURITY" && styles.kpiCardActiveRing,
          ]}
        >
          <InventoryStatCard
            label="User & Security"
            value={String(securityCount)}
            subtext="Permissions & staff updates"
            variant="amber"
            style={{ width: "100%", minWidth: "100%", maxWidth: "100%" }}
            onPress={() => setActiveKpiFilter("SECURITY")}
          />
        </View>
      </View>

      {/* 3. Clean, Sleek Search Bar (Uncluttered without messy horizontal pills) */}
      <View style={styles.cleanSearchCard}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by Event ID, User Name, Invoice #, Medicine, Batch or justification..."
            placeholderTextColor="#77717A"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <Pressable
              onPress={() => setSearchQuery("")}
              style={styles.clearSearchBtn}
            >
              <Text style={styles.clearSearchText}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Active Filter Notice Pill */}
        {activeKpiFilter !== "ALL" || searchQuery ? (
          <View style={styles.activeFilterPillRow}>
            <Text style={styles.activeFilterPillText}>
              Filtering by:{" "}
              <Text style={{ fontWeight: "800", color: "#B9829A" }}>
                {activeKpiFilter !== "ALL" ? activeKpiFilter : ""}{" "}
                {searchQuery ? `"${searchQuery}"` : ""}
              </Text>{" "}
              ({filteredLogs.length} matches)
            </Text>
            <Pressable
              onPress={() => {
                setActiveKpiFilter("ALL");
                setSearchQuery("");
              }}
              style={styles.resetKpiFilterBtn}
            >
              <Text style={styles.resetKpiFilterBtnText}>Show All ✕</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* 4. Audit Log Records Table */}
      <View style={styles.tableCard}>
        <View style={styles.tableHeaderSection}>
          <View style={styles.tableTitleRow}>
            <Text style={styles.tableTitle}>Event Activity Stream</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>
                {filteredLogs.length}{" "}
                {filteredLogs.length === 1 ? "Record" : "Records"}
              </Text>
            </View>
          </View>
          <Text style={styles.tableSubtitle}>
            Full digital paper trail with before/after state diffs for
            regulatory compliance.
          </Text>
        </View>

        {loading ? (
          <View style={{ padding: 20 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonTableRow key={i} />
            ))}
          </View>
        ) : filteredLogs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No Audit Records Found</Text>
            <Text style={styles.emptySubtitle}>
              No events match the selected filter criteria or search query.
            </Text>
            <Pressable
              onPress={() => {
                setActiveKpiFilter("ALL");
                setSearchQuery("");
              }}
              style={styles.emptyResetBtn}
            >
              <Text style={styles.emptyResetBtnText}>Reset Filter to All</Text>
            </Pressable>
          </View>
        ) : isMobile ? (
          <View style={styles.mobileAuditList}>
            {paginatedLogs.map((log) => {
              const actionBadge = getActionBadgeStyle(log.actionType);
              const sevStyle = getSeverityStyle(log.severity);

              return (
                <View key={log.id} style={styles.mobileAuditCard}>
                  {/* Top: Timestamp, ID, Severity */}
                  <View style={styles.mobileAuditTop}>
                    <View>
                      <Text style={styles.timestampText}>{log.timestamp}</Text>
                      <Text style={styles.relativeTimeText}>
                        {log.id} • {log.relativeTime}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.sevBadge,
                        { backgroundColor: sevStyle.bg },
                      ]}
                    >
                      <View
                        style={[
                          styles.sevDot,
                          { backgroundColor: sevStyle.dot },
                        ]}
                      />
                      <Text style={[styles.sevText, { color: sevStyle.text }]}>
                        {log.severity}
                      </Text>
                    </View>
                  </View>

                  {/* Actor & Action */}
                  <View style={styles.mobileAuditActorRow}>
                    <View style={styles.actorAvatar}>
                      <Text style={styles.actorAvatarText}>
                        {log.actor.avatarInitials}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.actorName}>{log.actor.name}</Text>
                      <Text style={styles.actorRole}>
                        {log.actor.role} • {log.branch}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.actionBadge,
                        {
                          backgroundColor: actionBadge.bg,
                          borderColor: actionBadge.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.actionBadgeText,
                          { color: actionBadge.text },
                        ]}
                      >
                        {log.actionType}
                      </Text>
                    </View>
                  </View>

                  {/* Entity & Details */}
                  <View style={styles.mobileAuditEntityBox}>
                    <Text style={styles.mobileAuditEntityLabel}>
                      Target Entity [{log.module}]:
                    </Text>
                    <Text style={styles.entityRefText}>{log.entityRef}</Text>
                    <Text style={styles.actionSubLabel}>{log.actionLabel}</Text>
                  </View>

                  {/* Actions footer */}
                  <View style={styles.mobileAuditFooter}>
                    <Pressable
                      onPress={() => handleOpenDetails(log)}
                      style={styles.viewDiffBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`View Diff for ${log.id}`}
                    >
                      <Text style={styles.viewDiffBtnText}>View Diff ➔</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => handleNavigateToSource(log)}
                      style={styles.openModuleBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Go to source module ${log.module}`}
                    >
                      <Text style={styles.openModuleBtnText}>
                        Source Module ↗
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              {/* Header Row */}
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.thText, styles.colTimestamp]}>
                  Timestamp & Ref
                </Text>
                <Text style={[styles.thText, styles.colActor]}>
                  Actor / User
                </Text>
                <Text style={[styles.thText, styles.colAction]}>
                  Action Performed
                </Text>
                <Text style={[styles.thText, styles.colEntity]}>
                  Target Entity / Ref
                </Text>
                <Text style={[styles.thText, styles.colBranch]}>
                  Branch Location
                </Text>
                <Text style={[styles.thText, styles.colSeverity]}>
                  Severity
                </Text>
                <Text style={[styles.thText, styles.colDetails]}>Actions</Text>
              </View>

              {/* Body */}
              {paginatedLogs.map((log, index) => {
                const isEven = index % 2 === 0;
                const actionBadge = getActionBadgeStyle(log.actionType);
                const sevStyle = getSeverityStyle(log.severity);

                return (
                  <View
                    key={log.id}
                    style={[styles.tableRow, isEven && styles.tableRowEven]}
                  >
                    {/* Timestamp & ID */}
                    <View style={styles.colTimestamp}>
                      <Text style={styles.timestampText}>{log.timestamp}</Text>
                      <View style={styles.logIdRow}>
                        <Text style={styles.logIdText}>{log.id}</Text>
                        <Text style={styles.relativeTimeText}>
                          • {log.relativeTime}
                        </Text>
                      </View>
                    </View>

                    {/* Actor */}
                    <View style={[styles.colActor, styles.actorCell]}>
                      <View style={styles.actorAvatar}>
                        <Text style={styles.actorAvatarText}>
                          {log.actor.avatarInitials}
                        </Text>
                      </View>
                      <View style={styles.actorInfo}>
                        <Text style={styles.actorName} numberOfLines={1}>
                          {log.actor.name}
                        </Text>
                        <Text style={styles.actorRole}>{log.actor.role}</Text>
                      </View>
                    </View>

                    {/* Action Performed */}
                    <View style={styles.colAction}>
                      <View
                        style={[
                          styles.actionBadge,
                          {
                            backgroundColor: actionBadge.bg,
                            borderColor: actionBadge.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.actionBadgeText,
                            { color: actionBadge.text },
                          ]}
                        >
                          {log.actionType}
                        </Text>
                      </View>
                      <Text style={styles.actionSubLabel}>
                        {log.actionLabel}
                      </Text>
                    </View>

                    {/* Target Entity / Reference */}
                    <View style={styles.colEntity}>
                      <Text style={styles.entityRefText} numberOfLines={2}>
                        {log.entityRef}
                      </Text>
                      <Text style={styles.moduleNameText}>{log.module}</Text>
                    </View>

                    {/* Branch */}
                    <View style={styles.colBranch}>
                      <Text style={styles.branchNameText} numberOfLines={2}>
                        {log.branch}
                      </Text>
                    </View>

                    {/* Severity */}
                    <View style={styles.colSeverity}>
                      <View
                        style={[
                          styles.sevBadge,
                          { backgroundColor: sevStyle.bg },
                        ]}
                      >
                        <View
                          style={[
                            styles.sevDot,
                            { backgroundColor: sevStyle.dot },
                          ]}
                        />
                        <Text
                          style={[styles.sevText, { color: sevStyle.text }]}
                        >
                          {log.severity}
                        </Text>
                      </View>
                    </View>

                    {/* Details Action Buttons */}
                    <View style={[styles.colDetails, styles.actionsRow]}>
                      <Pressable
                        onPress={() => handleOpenDetails(log)}
                        style={styles.viewDiffBtn}
                        accessibilityRole="button"
                        accessibilityLabel={`View Diff for ${log.id}`}
                      >
                        <Text style={styles.viewDiffBtnText}>Diff ➔</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => handleNavigateToSource(log)}
                        style={styles.openModuleBtn}
                        accessibilityRole="button"
                        accessibilityLabel={`Go to source module ${log.module}`}
                      >
                        <Text style={styles.openModuleBtnText}>Source ↗</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}
        {!loading && filteredLogs.length > 0 && (
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={filteredLogs.length}
          />
        )}
      </View>

      {/* 5. AUDIT ENTRY DETAILS MODAL WITH BEFORE / AFTER DIFF */}
      {selectedLog && (
        <Modal
          visible={modalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.detailModalCard,
                isMobile && styles.modalCardMobile,
              ]}
            >
              {/* Header */}
              <View style={styles.detailHeader}>
                <View style={styles.detailHeaderLeft}>
                  <View style={styles.eventBadge}>
                    <Text style={styles.eventBadgeText}>{selectedLog.id}</Text>
                  </View>
                  <View>
                    <Text style={styles.detailTitle}>
                      {selectedLog.actionLabel}
                    </Text>
                    <Text style={styles.detailSubtitle}>
                      {selectedLog.timestamp} • {selectedLog.branch}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => setModalVisible(false)}
                  style={styles.modalCloseBtn}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </Pressable>
              </View>

              {/* Body */}
              <ScrollView style={styles.detailBody}>
                {/* Meta Summary Card */}
                <View style={styles.metaSummaryGrid}>
                  <View style={styles.metaCard}>
                    <Text style={styles.metaLabel}>Actor / User:</Text>
                    <Text style={styles.metaVal}>
                      {selectedLog.actor.name} ({selectedLog.actor.role})
                    </Text>
                    <Text style={styles.metaSubVal}>
                      {selectedLog.actor.email}
                    </Text>
                    {selectedLog.actor.phone ? (
                      <Text style={styles.metaSubVal}>
                        📞 {selectedLog.actor.phone}
                      </Text>
                    ) : null}
                    {selectedLog.actor.staffId ? (
                      <Text style={styles.metaSubVal}>
                        Staff ID: {selectedLog.actor.staffId}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.metaCard}>
                    <Text style={styles.metaLabel}>
                      Network Client & Device:
                    </Text>
                    <Text style={styles.metaVal}>
                      IP: {selectedLog.ipAddress}
                    </Text>
                    <Text style={styles.metaSubVal}>{selectedLog.device}</Text>
                  </View>

                  <View style={styles.metaCard}>
                    <Text style={styles.metaLabel}>Target Reference:</Text>
                    <Text style={styles.metaVal}>{selectedLog.entityRef}</Text>
                    <Text style={styles.metaSubVal}>
                      Module: {selectedLog.module}
                    </Text>
                  </View>
                </View>

                {/* Stated Justification */}
                {selectedLog.reason ? (
                  <View style={styles.reasonCard}>
                    <Text style={styles.reasonTitle}>
                      Stated Justification / Business Reason
                    </Text>
                    <Text style={styles.reasonText}>{selectedLog.reason}</Text>
                  </View>
                ) : null}

                {/* BEFORE VS AFTER DIFF TABLE */}
                <View style={styles.diffSection}>
                  <View style={styles.diffHeaderRow}>
                    <Text style={styles.diffSectionTitle}>
                      Before vs After State Comparison
                    </Text>
                    <View style={styles.diffVerifiedBadge}>
                      <Text style={styles.diffVerifiedText}>
                        Verified Snapshot
                      </Text>
                    </View>
                  </View>

                  {selectedLog.beforeAfterDiff &&
                  selectedLog.beforeAfterDiff.length > 0 ? (
                    <View style={styles.diffTable}>
                      {/* Diff Header */}
                      <View style={styles.diffTableHeader}>
                        <Text style={[styles.diffTh, styles.diffColField]}>
                          Attribute / Field
                        </Text>
                        <Text style={[styles.diffTh, styles.diffColOld]}>
                          Previous Value (Before)
                        </Text>
                        <Text style={[styles.diffTh, styles.diffColNew]}>
                          Updated Value (After)
                        </Text>
                      </View>

                      {/* Diff Rows */}
                      {selectedLog.beforeAfterDiff.map((diff, idx) => (
                        <View key={idx} style={styles.diffTableRow}>
                          <View style={styles.diffColField}>
                            <Text style={styles.diffFieldName}>
                              {diff.fieldName || diff.field}
                            </Text>
                            <Text style={styles.diffFieldKey}>
                              {diff.field}
                            </Text>
                          </View>

                          <View style={styles.diffColOld}>
                            <View style={styles.oldValPill}>
                              <Text style={styles.oldValText}>
                                {diff.oldValue}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.diffColNew}>
                            <View style={styles.newValPill}>
                              <Text style={styles.newValText}>
                                {diff.newValue}
                              </Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.noDiffCard}>
                      <Text style={styles.noDiffText}>
                        No field mutation data recorded for this informational
                        event.
                      </Text>
                    </View>
                  )}
                </View>
              </ScrollView>

              {/* Footer */}
              <View style={styles.modalFooter}>
                <View style={styles.modalFooterNotice}>
                  <Text style={styles.modalFooterNoticeText}>
                    🔒 Immutable Regulatory Entry: This audit event is
                    permanently sealed and cannot be modified or deleted.
                  </Text>
                </View>

                <View style={styles.modalFooterActions}>
                  <View
                    style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}
                  >
                    <Pressable
                      onPress={() => handleExportSingleLog(selectedLog, "pdf")}
                      style={styles.modalExportPdfBtn}
                      accessibilityRole="button"
                    >
                      <Text style={styles.modalExportPdfBtnText}>
                        🖨️ Export PDF
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => handleExportSingleLog(selectedLog, "csv")}
                      style={styles.modalExportCsvBtn}
                      accessibilityRole="button"
                    >
                      <Text style={styles.modalExportCsvBtnText}>
                        📊 Export CSV
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => handleNavigateToSource(selectedLog)}
                      style={styles.openSourceBtn}
                    >
                      <Text style={styles.openSourceBtnText}>
                        Source Module ({selectedLog.module}) ↗
                      </Text>
                    </Pressable>
                  </View>

                  <Pressable
                    onPress={() => setModalVisible(false)}
                    style={styles.modalCloseBtnBottom}
                  >
                    <Text style={styles.modalCloseBtnBottomText}>Close</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F5F7",
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 60,
  },
  contentContainerMobile: {
    padding: 12,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
    flexWrap: "wrap",
    gap: 12,
  },
  headerRowMobile: {
    flexDirection: "column",
    gap: 12,
  },
  headerActionBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerActionBtnsMobile: {
    width: "100%",
    justifyContent: "flex-start",
  },
  titleWrapper: {
    flex: 1,
    minWidth: 260,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#28242B",
    letterSpacing: -0.4,
  },
  pageSubtitle: {
    fontSize: 13,
    color: "#77717A",
    marginTop: 4,
    lineHeight: 18,
  },
  exportBtnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#B9829A",
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
    cursor: "pointer",
    ...Platform.select({
      web: {
        boxShadow: "0 2px 4px rgba(15, 118, 110, 0.2)",
      },
    }),
  },
  exportBtnTextPrimary: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  exportBtnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    gap: 6,
    cursor: "pointer",
  },
  exportBtnTextSecondary: {
    color: "#28242B",
    fontSize: 13,
    fontWeight: "600",
  },
  exportBtnIcon: {
    fontSize: 14,
  },
  complianceNoticeBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAF2EE",
    borderWidth: 1,
    borderColor: "#EAF2EE",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    gap: 10,
  },
  complianceNoticeIcon: {
    fontSize: 18,
  },
  complianceNoticeTitle: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#4F8A72",
  },
  complianceNoticeSubtitle: {
    fontSize: 11.5,
    color: "#4F8A72",
    marginTop: 2,
    lineHeight: 16,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  kpiRowCompact: {
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  kpiCardWrapper: {
    flex: 1,
    minWidth: 160,
    borderRadius: 12,
  },
  kpiCardWrapperMobile: {
    width: "48.5%",
    minWidth: "48.5%",
    maxWidth: "48.5%",
    flexGrow: 0,
    flexShrink: 0,
  },
  kpiCardWrapperMobileFull: {
    width: "100%",
    minWidth: "100%",
    maxWidth: "100%",
    flexGrow: 0,
    flexShrink: 0,
  },
  kpiCardActiveRing: {
    borderWidth: 2,
    borderColor: "#B9829A",
    borderRadius: 12,
  },
  cleanSearchCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: "#28242B",
    outlineStyle: "none",
  },
  clearSearchBtn: {
    padding: 4,
  },
  clearSearchText: {
    fontSize: 14,
    color: "#77717A",
  },
  activeFilterPillRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#E8D5DD",
    borderWidth: 1,
    borderColor: "#E8D5DD",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  activeFilterPillText: {
    fontSize: 12,
    color: "#28242B",
  },
  resetKpiFilterBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "#E8D5DD",
    borderRadius: 4,
    cursor: "pointer",
  },
  resetKpiFilterBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B9829A",
  },
  tableCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5DFE4",
    overflow: "hidden",
  },
  tableHeaderSection: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F8F5F7",
  },
  tableTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tableTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#28242B",
  },
  countBadge: {
    backgroundColor: "#E8D5DD",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8D5DD",
  },
  countBadgeText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#B9829A",
  },
  tableSubtitle: {
    fontSize: 12,
    color: "#77717A",
    marginTop: 2,
  },
  tableWrapper: {
    minWidth: 960,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#F8F5F7",
    borderBottomWidth: 1,
    borderBottomColor: "#E5DFE4",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  thText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#77717A",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  colTimestamp: { width: 170 },
  colActor: { width: 180 },
  colAction: { width: 170 },
  colEntity: { width: 210 },
  colBranch: { width: 180 },
  colSeverity: { width: 110 },
  colDetails: { width: 140 },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F8F5F7",
  },
  tableRowEven: {
    backgroundColor: "#F8F5F7",
  },
  timestampText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#28242B",
  },
  logIdRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  logIdText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B9829A",
  },
  relativeTimeText: {
    fontSize: 11,
    color: "#77717A",
  },
  actorCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actorAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    alignItems: "center",
    justifyContent: "center",
  },
  actorAvatarText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#28242B",
  },
  actorInfo: {
    flex: 1,
  },
  actorName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#28242B",
  },
  actorRole: {
    fontSize: 11,
    color: "#77717A",
  },
  actionBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  actionBadgeText: {
    fontSize: 10.5,
    fontWeight: "800",
  },
  actionSubLabel: {
    fontSize: 11,
    color: "#77717A",
    marginTop: 2,
  },
  entityRefText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#28242B",
  },
  moduleNameText: {
    fontSize: 11,
    color: "#77717A",
    marginTop: 1,
  },
  branchNameText: {
    fontSize: 12,
    color: "#77717A",
  },
  sevBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  sevDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sevText: {
    fontSize: 11,
    fontWeight: "700",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 6,
  },
  viewDiffBtn: {
    backgroundColor: "#E8D5DD",
    borderWidth: 1,
    borderColor: "#E8D5DD",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    cursor: "pointer",
  },
  viewDiffBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B9829A",
  },
  openModuleBtn: {
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    cursor: "pointer",
  },
  openModuleBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#77717A",
  },
  emptyContainer: {
    padding: 36,
    alignItems: "center",
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#28242B",
  },
  emptySubtitle: {
    fontSize: 12,
    color: "#77717A",
    marginTop: 2,
  },
  emptyResetBtn: {
    marginTop: 10,
    backgroundColor: "#B9829A",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    cursor: "pointer",
  },
  emptyResetBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  detailModalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    width: "100%",
    maxWidth: 680,
    maxHeight: "90%",
    overflow: "hidden",
  },
  modalCardMobile: {
    maxWidth: "100%",
  },
  detailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#E5DFE4",
  },
  detailHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  eventBadge: {
    backgroundColor: "#E8D5DD",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E8D5DD",
  },
  eventBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#B9829A",
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#28242B",
  },
  detailSubtitle: {
    fontSize: 11.5,
    color: "#77717A",
  },
  modalCloseBtn: {
    padding: 4,
    cursor: "pointer",
  },
  modalCloseText: {
    fontSize: 16,
    color: "#77717A",
    fontWeight: "bold",
  },
  detailBody: {
    padding: 18,
  },
  metaSummaryGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  metaCard: {
    flex: 1,
    minWidth: 180,
    backgroundColor: "#F8F5F7",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E5DFE4",
  },
  metaLabel: {
    fontSize: 10.5,
    color: "#77717A",
    fontWeight: "700",
  },
  metaVal: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#28242B",
    marginTop: 2,
  },
  metaSubVal: {
    fontSize: 10.5,
    color: "#77717A",
    marginTop: 1,
  },
  reasonCard: {
    backgroundColor: "#E8D5DD",
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: "#B9829A",
  },
  reasonTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#30243D",
  },
  reasonText: {
    fontSize: 12,
    color: "#30243D",
    marginTop: 2,
  },
  diffSection: {
    marginTop: 6,
  },
  diffHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  diffSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#28242B",
  },
  diffVerifiedBadge: {
    backgroundColor: "#EAF2EE",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  diffVerifiedText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#4F8A72",
  },
  diffTable: {
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    overflow: "hidden",
  },
  diffTableHeader: {
    flexDirection: "row",
    backgroundColor: "#F8F5F7",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5DFE4",
  },
  diffTh: {
    fontSize: 11,
    fontWeight: "700",
    color: "#77717A",
  },
  diffTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F8F5F7",
  },
  diffColField: { flex: 1.5 },
  diffColOld: { flex: 1.2 },
  diffColNew: { flex: 1.2 },
  diffFieldName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#28242B",
  },
  diffFieldKey: {
    fontSize: 10,
    color: "#77717A",
  },
  oldValPill: {
    backgroundColor: "#F7EDEE",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  oldValText: {
    fontSize: 11,
    color: "#B85C64",
    fontWeight: "600",
  },
  newValPill: {
    backgroundColor: "#EAF2EE",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  newValText: {
    fontSize: 11,
    color: "#4F8A72",
    fontWeight: "700",
  },
  noDiffCard: {
    backgroundColor: "#F8F5F7",
    borderRadius: 6,
    padding: 14,
    alignItems: "center",
  },
  noDiffText: {
    fontSize: 12,
    color: "#77717A",
  },
  modalFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: "#E5DFE4",
    backgroundColor: "#F8F5F7",
  },
  modalFooterNotice: {
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5DFE4",
    marginBottom: 10,
  },
  modalFooterNoticeText: {
    fontSize: 11,
    color: "#B9829A",
    fontWeight: "700",
  },
  modalFooterActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  modalExportPdfBtn: {
    backgroundColor: "#B9829A",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    cursor: "pointer",
  },
  modalExportPdfBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  modalExportCsvBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    cursor: "pointer",
  },
  modalExportCsvBtnText: {
    color: "#28242B",
    fontWeight: "700",
    fontSize: 12,
  },
  openSourceBtn: {
    backgroundColor: "#F8F5F7",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    cursor: "pointer",
  },
  openSourceBtnText: {
    color: "#28242B",
    fontWeight: "700",
    fontSize: 12,
  },
  modalCloseBtnBottom: {
    backgroundColor: "#E5DFE4",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    cursor: "pointer",
  },
  modalCloseBtnBottomText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#28242B",
  },
  // Mobile Audit Log Cards
  mobileAuditList: {
    padding: 12,
    gap: 12,
  },
  mobileAuditCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 12,
    padding: 14,
    ...Platform.select({
      web: { boxShadow: "0 1px 3px rgba(0,0,0,0.04)" },
      default: { elevation: 1 },
    }),
  },
  mobileAuditTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  mobileAuditActorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F8F5F7",
  },
  mobileAuditEntityBox: {
    backgroundColor: "#F8F5F7",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  mobileAuditEntityLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#77717A",
    marginBottom: 3,
    textTransform: "uppercase",
  },
  mobileAuditFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
});
