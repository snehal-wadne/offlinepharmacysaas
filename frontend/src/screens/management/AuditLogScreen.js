import React, { useState } from 'react';
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
} from 'react-native';
import InventoryStatCard from '../../components/inventory/InventoryStatCard';
import {
  AUDIT_KPIS,
  MOCK_AUDIT_LOGS,
  AUDIT_ACTION_TYPES,
  AUDIT_SEVERITY_LEVELS,
  MOCK_BRANCHES_LIST,
} from '../../data/managementMockData';

export default function AuditLogScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAction, setSelectedAction] = useState('All Actions');
  const [selectedSeverity, setSelectedSeverity] = useState('All Severities');
  const [selectedBranch, setSelectedBranch] = useState('All Branches');

  // Audit Logs State
  const [logs, setLogs] = useState(MOCK_AUDIT_LOGS);

  // View Details Modal State
  const [selectedLog, setSelectedLog] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Filtered Logs
  const filteredLogs = logs.filter((log) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      log.id.toLowerCase().includes(q) ||
      log.actor.name.toLowerCase().includes(q) ||
      log.actor.role.toLowerCase().includes(q) ||
      log.actionLabel.toLowerCase().includes(q) ||
      log.entityRef.toLowerCase().includes(q) ||
      (log.reason && log.reason.toLowerCase().includes(q));

    const matchesAction =
      selectedAction === 'All Actions' || log.actionType === selectedAction;

    const matchesSeverity =
      selectedSeverity === 'All Severities' ||
      log.severity === selectedSeverity;

    const matchesBranch =
      selectedBranch === 'All Branches' || log.branch === selectedBranch;

    return matchesSearch && matchesAction && matchesSeverity && matchesBranch;
  });

  const handleOpenDetails = (log) => {
    setSelectedLog(log);
    setModalVisible(true);
  };

  const handleExportLogs = () => {
    if (onShowToast) {
      onShowToast(
        `✓ Exported ${filteredLogs.length} audit records as signed CSV / Excel report.`
      );
    }
  };

  const getActionBadgeStyle = (actionType) => {
    switch (actionType) {
      case 'PRICE_OVERRIDE':
        return { bg: '#FEF2F2', border: '#FECACA', text: '#DC2626' };
      case 'REFUND_ISSUED':
      case 'BILL_CANCELLED':
        return { bg: '#FFF7ED', border: '#FFEDD5', text: '#EA580C' };
      case 'STOCK_ADJUSTMENT':
      case 'STOCK_TRANSFER':
        return { bg: '#EFF6FF', border: '#BFDBFE', text: '#2563EB' };
      case 'ROLE_MODIFIED':
      case 'USER_CREATED':
        return { bg: '#F5F3FF', border: '#DDD6FE', text: '#7C3AED' };
      case 'RX_APPROVED':
        return { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D' };
      default:
        return { bg: '#F1F5F9', border: '#E2E8F0', text: '#475569' };
    }
  };

  const getSeverityStyle = (severity) => {
    switch (severity) {
      case 'Critical':
        return { bg: '#FEF2F2', text: '#DC2626', dot: '#DC2626' };
      case 'Warning':
        return { bg: '#FFFBEB', text: '#D97706', dot: '#D97706' };
      case 'Success':
        return { bg: '#F0FDF4', text: '#16A34A', dot: '#16A34A' };
      default:
        return { bg: '#F0FDFA', text: '#0F766E', dot: '#0F766E' };
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
      <View style={styles.headerRow}>
        <View style={styles.titleWrapper}>
          <Text style={styles.pageTitle}>System & Compliance Audit Log</Text>
          <Text style={styles.pageSubtitle}>
            Immutable regulatory tracking of billing discounts, price overrides, stock write-offs, user appointments, and Schedule H prescription validations.
          </Text>
        </View>
        <Pressable
          onPress={handleExportLogs}
          style={styles.exportBtn}
          accessibilityRole="button"
          accessibilityLabel="Export Audit Log"
        >
          <Text style={styles.exportBtnIcon}>📥</Text>
          <Text style={styles.exportBtnText}>Export Audit Report</Text>
        </Pressable>
      </View>

      {/* 2. Top KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {AUDIT_KPIS.map((kpi) => (
          <InventoryStatCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            subtext={kpi.subtext}
            variant={kpi.variant}
          />
        ))}
      </View>

      {/* 3. Search and Filter Bar */}
      <View style={styles.filterCard}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by Event ID, Actor, Invoice, Medicine, Batch or justification reason..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
              <Text style={styles.clearSearchText}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Action Type Filters */}
        <View style={styles.filterControls}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.actionTabsContainer}
          >
            {AUDIT_ACTION_TYPES.map((action) => {
              const isSelected = selectedAction === action;
              return (
                <Pressable
                  key={action}
                  onPress={() => setSelectedAction(action)}
                  style={[
                    styles.actionTab,
                    isSelected && styles.actionTabSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.actionTabText,
                      isSelected && styles.actionTabTextSelected,
                    ]}
                  >
                    {action.replace('_', ' ')}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Severity Quick Filter */}
          <View style={styles.severityToggleGroup}>
            {AUDIT_SEVERITY_LEVELS.map((sev) => {
              const isSelected = selectedSeverity === sev;
              return (
                <Pressable
                  key={sev}
                  onPress={() => setSelectedSeverity(sev)}
                  style={[
                    styles.sevPill,
                    isSelected && styles.sevPillSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.sevPillText,
                      isSelected && styles.sevPillTextSelected,
                    ]}
                  >
                    {sev}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* 4. Audit Log Records Table */}
      <View style={styles.tableCard}>
        <View style={styles.tableHeaderSection}>
          <View style={styles.tableTitleRow}>
            <Text style={styles.tableTitle}>Event Activity Stream</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>
                {filteredLogs.length} {filteredLogs.length === 1 ? 'Record' : 'Records'}
              </Text>
            </View>
          </View>
          <Text style={styles.tableSubtitle}>
            Full digital paper trail with before/after state diffs for regulatory compliance.
          </Text>
        </View>

        {filteredLogs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No Audit Records Found</Text>
            <Text style={styles.emptySubtitle}>
              No events match the selected filters or search terms.
            </Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              {/* Header Row */}
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.thText, styles.colTimestamp]}>Timestamp & Ref</Text>
                <Text style={[styles.thText, styles.colActor]}>Actor / User</Text>
                <Text style={[styles.thText, styles.colAction]}>Action Performed</Text>
                <Text style={[styles.thText, styles.colEntity]}>Target Entity / Ref</Text>
                <Text style={[styles.thText, styles.colBranch]}>Branch Location</Text>
                <Text style={[styles.thText, styles.colSeverity]}>Severity</Text>
                <Text style={[styles.thText, styles.colDetails]}>Details</Text>
              </View>

              {/* Body */}
              {filteredLogs.map((log, index) => {
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
                        <Text style={styles.relativeTimeText}>• {log.relativeTime}</Text>
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
                      <Text style={styles.actionSubLabel}>{log.actionLabel}</Text>
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

                    {/* Details Action */}
                    <View style={styles.colDetails}>
                      <Pressable
                        onPress={() => handleOpenDetails(log)}
                        style={styles.viewDiffBtn}
                        accessibilityRole="button"
                        accessibilityLabel={`View Diff for ${log.id}`}
                      >
                        <Text style={styles.viewDiffBtnText}>View Diff ➔</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
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
            <View style={[styles.detailModalCard, isMobile && styles.modalCardMobile]}>
              {/* Header */}
              <View style={styles.detailHeader}>
                <View style={styles.detailHeaderLeft}>
                  <View style={styles.eventBadge}>
                    <Text style={styles.eventBadgeText}>{selectedLog.id}</Text>
                  </View>
                  <View>
                    <Text style={styles.detailTitle}>{selectedLog.actionLabel}</Text>
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
                    <Text style={styles.metaVal}>{selectedLog.actor.name} ({selectedLog.actor.role})</Text>
                    <Text style={styles.metaSubVal}>{selectedLog.actor.email}</Text>
                  </View>

                  <View style={styles.metaCard}>
                    <Text style={styles.metaLabel}>Network Client & Device:</Text>
                    <Text style={styles.metaVal}>IP: {selectedLog.ipAddress}</Text>
                    <Text style={styles.metaSubVal}>{selectedLog.device}</Text>
                  </View>

                  <View style={styles.metaCard}>
                    <Text style={styles.metaLabel}>Target Reference:</Text>
                    <Text style={styles.metaVal}>{selectedLog.entityRef}</Text>
                    <Text style={styles.metaSubVal}>Module: {selectedLog.module}</Text>
                  </View>
                </View>

                {/* Stated Justification */}
                {selectedLog.reason ? (
                  <View style={styles.reasonCard}>
                    <Text style={styles.reasonTitle}>Stated Justification / Business Reason</Text>
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
                      <Text style={styles.diffVerifiedText}>Verified Snapshot</Text>
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
                            <Text style={styles.diffFieldKey}>{diff.field}</Text>
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
                        No field mutation data recorded for this informational event.
                      </Text>
                    </View>
                  )}
                </View>
              </ScrollView>

              {/* Footer */}
              <View style={styles.modalFooter}>
                <Pressable
                  onPress={() => setModalVisible(false)}
                  style={styles.modalCloseBtnBottom}
                >
                  <Text style={styles.modalCloseBtnBottomText}>Close Audit Window</Text>
                </Pressable>
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
    backgroundColor: '#F8FAFC',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 12,
  },
  titleWrapper: {
    flex: 1,
    minWidth: 260,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 18,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    gap: 8,
    cursor: 'pointer',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(15, 118, 110, 0.2)',
      },
    }),
  },
  exportBtnIcon: {
    fontSize: 14,
  },
  exportBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  kpiRowCompact: {
    flexWrap: 'wrap',
  },
  filterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 20,
    gap: 14,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    color: '#0F172A',
    outlineStyle: 'none',
  },
  clearSearchBtn: {
    padding: 4,
  },
  clearSearchText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  filterControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionTabsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  actionTab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    cursor: 'pointer',
  },
  actionTabSelected: {
    backgroundColor: '#0F766E',
  },
  actionTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  actionTabTextSelected: {
    color: '#FFFFFF',
  },
  severityToggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    padding: 3,
    borderRadius: 8,
  },
  sevPill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    cursor: 'pointer',
  },
  sevPillSelected: {
    backgroundColor: '#FFFFFF',
  },
  sevPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  sevPillTextSelected: {
    color: '#0F766E',
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  tableHeaderSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tableTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  countBadge: {
    backgroundColor: '#F0FDFA',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  countBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F766E',
  },
  tableSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 2,
  },
  tableWrapper: {
    minWidth: 960,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  thText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  colTimestamp: { width: 170 },
  colActor: { width: 180 },
  colAction: { width: 170 },
  colEntity: { width: 210 },
  colBranch: { width: 180 },
  colSeverity: { width: 110 },
  colDetails: { width: 110 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableRowEven: {
    backgroundColor: '#FAFCFF',
  },
  timestampText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  logIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  logIdText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
  },
  relativeTimeText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  actorCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actorAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actorAvatarText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  actorInfo: {
    flex: 1,
  },
  actorName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  actorRole: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  actionBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  actionBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  actionSubLabel: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 3,
  },
  entityRefText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
    lineHeight: 16,
  },
  moduleNameText: {
    fontSize: 11,
    color: '#0F766E',
    fontWeight: '500',
    marginTop: 2,
  },
  branchNameText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 15,
  },
  sevBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 5,
    alignSelf: 'flex-start',
  },
  sevDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sevText: {
    fontSize: 11,
    fontWeight: '700',
  },
  viewDiffBtn: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    cursor: 'pointer',
  },
  viewDiffBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F766E',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  detailModalCard: {
    width: '100%',
    maxWidth: 760,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
  },
  modalCardMobile: {
    maxWidth: '96%',
    maxHeight: '94%',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FAFCFF',
  },
  detailHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  eventBadge: {
    backgroundColor: '#0F766E',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  eventBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  detailSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalCloseText: {
    fontSize: 18,
    color: '#64748B',
    fontWeight: '700',
  },
  detailBody: {
    padding: 22,
  },
  metaSummaryGrid: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  metaCard: {
    flex: 1,
    minWidth: 200,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  metaVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 3,
  },
  metaSubVal: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  reasonCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 18,
  },
  reasonTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
    textTransform: 'uppercase',
  },
  reasonText: {
    fontSize: 13,
    color: '#78350F',
    marginTop: 4,
    lineHeight: 18,
    fontWeight: '500',
  },
  diffSection: {
    marginTop: 6,
  },
  diffHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  diffSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  diffVerifiedBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  diffVerifiedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  diffTable: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  diffTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  diffTh: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  diffColField: { width: '34%' },
  diffColOld: { width: '33%' },
  diffColNew: { width: '33%' },
  diffTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  diffFieldName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  diffFieldKey: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  oldValPill: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  oldValText: {
    fontSize: 12,
    color: '#B91C1C',
    fontWeight: '600',
  },
  newValPill: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  newValText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '700',
  },
  noDiffCard: {
    padding: 20,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    alignItems: 'center',
  },
  noDiffText: {
    fontSize: 12.5,
    color: '#64748B',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  modalCloseBtnBottom: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#0F766E',
    cursor: 'pointer',
  },
  modalCloseBtnBottomText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
