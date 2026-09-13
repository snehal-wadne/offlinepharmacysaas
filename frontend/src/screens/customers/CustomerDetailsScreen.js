import React, { useState, useMemo } from "react";
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
import {
  MOCK_CUSTOMERS_LIST,
  MOCK_CUSTOMER_DETAILS_DATA,
} from '../../data/customersMockData';
import { SkeletonTableRow, SkeletonItemCard } from '../../components/common/SkeletonLoader';

export default function CustomerDetailsScreen({
  customerId = "CUST-1040",
  onNavigate,
  onShowToast,
  isMultiBranch = true,
}) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isCompact = width < 1100;

  // Active Customer state
  const [selectedCustomerId, setSelectedCustomerId] = useState(customerId);
  const [loading, setLoading] = useState(false);

  // Active Tab: 'purchases' | 'returns' | 'ledger' | 'info'
  const [activeTab, setActiveTab] = useState("purchases");

  // Search in Purchase History
  const [searchInvoice, setSearchInvoice] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Selected invoice for View Modal
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);

  // Customer Data Lookup
  const customerBase = useMemo(() => {
    return (
      MOCK_CUSTOMERS_LIST.find((c) => c.id === selectedCustomerId) ||
      MOCK_CUSTOMERS_LIST[0]
    );
  }, [selectedCustomerId]);

  const customerDetailed = useMemo(() => {
    return (
      MOCK_CUSTOMER_DETAILS_DATA[selectedCustomerId] ||
      MOCK_CUSTOMER_DETAILS_DATA["CUST-1040"]
    );
  }, [selectedCustomerId]);

  const profile = customerDetailed?.profile || customerBase || {};
  const invoices = customerDetailed?.invoices || [];
  const returns = customerDetailed?.returns || [];
  const ledger = customerDetailed?.ledger || [];

  // Filtered invoices by search
  const filteredInvoices = invoices.filter((inv) =>
    (inv.invoiceNo || "").toLowerCase().includes(searchInvoice.toLowerCase()),
  );

  // Pagination calculation
  const totalInvoicesCount = filteredInvoices.length;
  const totalPages = Math.ceil(totalInvoicesCount / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedInvoices = filteredInvoices.slice(
    startIndex,
    startIndex + itemsPerPage,
  );

  const handleViewInvoice = (inv) => {
    setSelectedInvoice(inv);
    setInvoiceModalVisible(true);
  };

  const handleNewSale = () => {
    if (onNavigate) {
      onNavigate("dashboard");
    }
    if (onShowToast) {
      onShowToast(`Starting new sale for ${profile.name} (${profile.id})`);
    }
  };

  const handleBackToCustomers = () => {
    if (onNavigate) {
      onNavigate("customers-patients");
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
      {/* 1. Top Breadcrumb & Actions Bar */}
      <View style={styles.topBar}>
        <Pressable
          onPress={handleBackToCustomers}
          style={styles.backLink}
          accessibilityRole="button"
          accessibilityLabel="Back to Customers"
        >
          <Text style={styles.backLinkIcon}>←</Text>
          <Text style={styles.backLinkText}>Back to Customers</Text>
        </Pressable>
      </View>

      {/* 2. Page Header & New Sale Action */}
      <View style={[styles.headerRow, isMobile && styles.headerRowMobile]}>
        <View style={styles.titleWrapper}>
          <Text style={styles.pageTitle}>Customer Details</Text>
          <Text style={styles.pageSubtitle}>
            View customer profile, purchase history, returns and ledger (if
            enabled).
          </Text>
        </View>

        <Pressable
          onPress={handleNewSale}
          style={styles.newSaleButton}
          accessibilityRole="button"
          accessibilityLabel="Create New Sale"
        >
          <Text style={styles.newSaleIcon}>+</Text>
          <Text style={styles.newSaleText}>New Sale</Text>
        </Pressable>
      </View>

      {/* 3. Customer Profile Header Card */}
      <View style={styles.profileCard}>
        <View
          style={[
            styles.profileCardBody,
            isCompact && styles.profileCardBodyCompact,
          ]}
        >
          {/* Left: Avatar & Contact Info */}
          <View style={styles.profileIdentityRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarIcon}>👤</Text>
            </View>
            <View style={styles.profileDetailsCol}>
              <View style={styles.nameStatusRow}>
                <Text style={styles.customerNameText}>{profile.name}</Text>
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>
                    {profile.status || "Active"}
                  </Text>
                </View>
              </View>
              <View style={styles.contactRow}>
                <Text style={styles.contactItemText}>📞 {profile.phone}</Text>
                <Text style={styles.contactDivider}>•</Text>
                <Text style={styles.contactItemText}>✉ {profile.email}</Text>
              </View>
            </View>
          </View>

          {/* Right: Key Account Statistics */}
          <View
            style={[
              styles.profileStatsRow,
              isMobile && styles.profileStatsRowMobile,
            ]}
          >
            {/* Stat 1: Customer Since */}
            <View style={styles.statBox}>
              <View style={styles.statLabelRow}>
                <Text style={styles.statIcon}>📅</Text>
                <Text style={styles.statLabel}>Customer Since</Text>
              </View>
              <Text style={styles.statValueBold}>
                {profile.customerSince || "15 Feb 2023"}
              </Text>
            </View>

            {/* Stat 2: Total Purchases */}
            <View style={styles.statBox}>
              <View style={styles.statLabelRow}>
                <Text style={styles.statIcon}>🛍️</Text>
                <Text style={styles.statLabel}>Total Purchases</Text>
              </View>
              <Text style={styles.statValueBold}>
                {profile.totalPurchasesCount ||
                  `${profile.totalInvoices || 12} Orders`}
              </Text>
            </View>

            {/* Stat 3: Outstanding Balance */}
            <View style={styles.statBox}>
              <View style={styles.statLabelRow}>
                <Text style={styles.statIconOrange}>⚠️</Text>
                <Text style={styles.statLabelOrange}>Outstanding Balance</Text>
              </View>
              <Text style={styles.statValueOrange}>
                {profile.outstandingBalance || "₹250.00"}
              </Text>
            </View>

            {/* Stat 4: Credit Limit */}
            <View style={styles.statBox}>
              <View style={styles.statLabelRow}>
                <Text style={styles.statIcon}>💳</Text>
                <Text style={styles.statLabel}>Credit Limit</Text>
              </View>
              <Text style={styles.statValueBold}>
                {profile.creditLimit || "₹2,000.00"}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* 4. Horizontal Navigation Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsScrollContent}
        >
          <Pressable
            onPress={() => setActiveTab("purchases")}
            style={[
              styles.tabButton,
              activeTab === "purchases" && styles.tabButtonActive,
            ]}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === "purchases" && styles.tabButtonTextActive,
              ]}
            >
              Purchase History
            </Text>
            {activeTab === "purchases" && (
              <View style={styles.activeTabIndicator} />
            )}
          </Pressable>

          <Pressable
            onPress={() => setActiveTab("returns")}
            style={[
              styles.tabButton,
              activeTab === "returns" && styles.tabButtonActive,
            ]}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === "returns" && styles.tabButtonTextActive,
              ]}
            >
              Returns History
            </Text>
            {activeTab === "returns" && (
              <View style={styles.activeTabIndicator} />
            )}
          </Pressable>

          <Pressable
            onPress={() => setActiveTab("ledger")}
            style={[
              styles.tabButton,
              activeTab === "ledger" && styles.tabButtonActive,
            ]}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === "ledger" && styles.tabButtonTextActive,
              ]}
            >
              Ledger / Outstanding
            </Text>
            {activeTab === "ledger" && (
              <View style={styles.activeTabIndicator} />
            )}
          </Pressable>

          <Pressable
            onPress={() => setActiveTab("info")}
            style={[
              styles.tabButton,
              activeTab === "info" && styles.tabButtonActive,
            ]}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === "info" && styles.tabButtonTextActive,
              ]}
            >
              Customer Info
            </Text>
            {activeTab === "info" && <View style={styles.activeTabIndicator} />}
          </Pressable>
        </ScrollView>
      </View>

      {/* 5. Tab Content: Purchase History */}
      {activeTab === "purchases" && (
        <View
          style={[styles.splitGridRow, isCompact && styles.splitGridRowStacked]}
        >
          {/* Main Card: Invoices Table */}
          <View
            style={[styles.mainTableCol, isCompact && styles.mainTableColFull]}
          >
            <View style={styles.cardContainer}>
              {/* Card Header with Search Input */}
              <View
                style={[
                  styles.cardHeaderRow,
                  isMobile && styles.cardHeaderRowMobile,
                ]}
              >
                <View style={styles.cardTitleBox}>
                  <Text style={styles.cardTitle}>Purchase History</Text>
                  <Text style={styles.cardSubtitle}>
                    All invoices for this customer.
                  </Text>
                </View>

                <View
                  style={[
                    styles.searchBoxWrapper,
                    isMobile && styles.searchBoxWrapperMobile,
                  ]}
                >
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    style={styles.searchTextInput}
                    placeholder="Search by Invoice No."
                    placeholderTextColor="#94A3B8"
                    value={searchInvoice}
                    onChangeText={(t) => {
                      setSearchInvoice(t);
                      setCurrentPage(1);
                    }}
                  />
                  {searchInvoice ? (
                    <Pressable onPress={() => setSearchInvoice("")}>
                      <Text style={styles.clearSearchBtn}>✕</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {/* Table Data / Mobile KPI Cards */}
              {isMobile ? (
                <View style={styles.mobileCardsContainer}>
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <SkeletonItemCard key={i} />
                    ))
                  ) : paginatedInvoices.length === 0 ? (
                      <View style={styles.emptyTableBox}>
                        <Text style={styles.emptyTableText}>
                          No invoices found matching your search.
                        </Text>
                      </View>
                    ) : (
                      paginatedInvoices.map((inv) => (
                        <View key={inv.invoiceNo} style={styles.mobileCustomerCard}>
                          <View style={styles.mobileCardHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.invNoText}>{inv.invoiceNo}</Text>
                              <View style={styles.statusCompletedPill}>
                                <Text style={styles.statusCompletedText}>{inv.status}</Text>
                              </View>
                            </View>
                            <Pressable
                              onPress={() => handleViewInvoice(inv)}
                              style={styles.viewActionBtn}
                              accessibilityRole="button"
                              accessibilityLabel={`View invoice ${inv.invoiceNo}`}
                            >
                              <Text style={styles.viewActionBtnText}>View</Text>
                            </Pressable>
                          </View>
  
                          <Text style={styles.mobileCardDate}>{inv.dateTime}</Text>
  
                          <View style={styles.mobileCardFooter}>
                            <View>
                              <Text style={styles.mobileCardSub}>{inv.items} items</Text>
                              <Text style={styles.mobileCardMethod}>Paid via {inv.paymentMethod}</Text>
                            </View>
                            <Text style={styles.mobileCardAmount}>{inv.amount}</Text>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                    <View style={styles.tableWrapper}>
                      {/* Table Header */}
                      <View style={styles.tableHeader}>
                        <Text style={[styles.thCell, { width: 120 }]}>INVOICE NO.</Text>
                        <Text style={[styles.thCell, { width: 170 }]}>DATE & TIME</Text>
                        <Text style={[styles.thCell, { width: 80, textAlign: 'center' }]}>ITEMS</Text>
                        <Text style={[styles.thCell, { width: 110, textAlign: 'right' }]}>AMOUNT (₹)</Text>
                        <Text style={[styles.thCell, { width: 120, textAlign: 'center' }]}>PAYMENT METHOD</Text>
                        <Text style={[styles.thCell, { width: 110, textAlign: 'center' }]}>STATUS</Text>
                        <Text style={[styles.thCell, { width: 90, textAlign: 'center' }]}>ACTION</Text>
                      </View>
  
                      {/* Table Rows */}
                      {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <SkeletonTableRow key={i} columns={7} />
                        ))
                      ) : paginatedInvoices.length === 0 ? (
                        <View style={styles.emptyTableBox}>
                          <Text style={styles.emptyTableText}>No invoices found matching your search.</Text>
                        </View>
                      ) : (
                        paginatedInvoices.map((inv, idx) => (
                        <View
                          key={inv.invoiceNo}
                          style={[
                            styles.tableRow,
                            idx % 2 === 1 && styles.tableRowAlt,
                          ]}
                        >
                          <Text
                            style={[
                              styles.tdCell,
                              styles.invNoText,
                              { width: 120 },
                            ]}
                          >
                            {inv.invoiceNo}
                          </Text>
                          <Text
                            style={[
                              styles.tdCell,
                              styles.dateText,
                              { width: 170 },
                            ]}
                          >
                            {inv.dateTime}
                          </Text>
                          <Text
                            style={[
                              styles.tdCell,
                              {
                                width: 80,
                                textAlign: "center",
                                fontWeight: "600",
                              },
                            ]}
                          >
                            {inv.items}
                          </Text>
                          <Text
                            style={[
                              styles.tdCell,
                              styles.amountText,
                              { width: 110, textAlign: "right" },
                            ]}
                          >
                            {inv.amount}
                          </Text>
                          <Text
                            style={[
                              styles.tdCell,
                              styles.paymentMethodText,
                              { width: 120, textAlign: "center" },
                            ]}
                          >
                            {inv.paymentMethod}
                          </Text>
                          <View style={[{ width: 110, alignItems: "center" }]}>
                            <View style={styles.statusCompletedPill}>
                              <Text style={styles.statusCompletedText}>
                                {inv.status}
                              </Text>
                            </View>
                          </View>
                          <View style={[{ width: 90, alignItems: "center" }]}>
                            <Pressable
                              onPress={() => handleViewInvoice(inv)}
                              style={styles.viewActionBtn}
                              accessibilityRole="button"
                              accessibilityLabel={`View invoice ${inv.invoiceNo}`}
                            >
                              <Text style={styles.viewActionBtnText}>View</Text>
                            </Pressable>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                </ScrollView>
              )}

              {/* Table Footer with Pagination */}
              <View
                style={[
                  styles.paginationFooter,
                  isMobile && styles.paginationFooterMobile,
                ]}
              >
                <Text style={styles.paginationText}>
                  Showing {totalInvoicesCount === 0 ? 0 : startIndex + 1} to{" "}
                  {Math.min(startIndex + itemsPerPage, totalInvoicesCount)} of{" "}
                  {totalInvoicesCount} invoices
                </Text>

                <View style={styles.paginationControls}>
                  <Pressable
                    onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    style={[
                      styles.pageNavBtn,
                      currentPage === 1 && styles.pageNavBtnDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.pageNavBtnText,
                        currentPage === 1 && styles.pageNavBtnTextDisabled,
                      ]}
                    >
                      ‹
                    </Text>
                  </Pressable>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (pg) => (
                      <Pressable
                        key={pg}
                        onPress={() => setCurrentPage(pg)}
                        style={[
                          styles.pageNumberBtn,
                          currentPage === pg && styles.pageNumberBtnActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.pageNumberText,
                            currentPage === pg && styles.pageNumberTextActive,
                          ]}
                        >
                          {pg}
                        </Text>
                      </Pressable>
                    ),
                  )}

                  <Pressable
                    onPress={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    style={[
                      styles.pageNavBtn,
                      currentPage === totalPages && styles.pageNavBtnDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.pageNavBtnText,
                        currentPage === totalPages &&
                          styles.pageNavBtnTextDisabled,
                      ]}
                    >
                      ›
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          {/* Right Card: Summary Card */}
          <View
            style={[
              styles.sideSummaryCol,
              isCompact && styles.sideSummaryColFull,
            ]}
          >
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardTitle}>Summary</Text>

              <View style={styles.summaryItem}>
                <Text style={styles.summaryItemLabel}>TOTAL INVOICES</Text>
                <Text style={styles.summaryItemValueBold}>
                  {profile.totalInvoices || invoices.length}
                </Text>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryItem}>
                <Text style={styles.summaryItemLabel}>TOTAL SPENT</Text>
                <Text style={styles.summaryItemValueBold}>
                  {profile.totalSpent || "₹2,880.00"}
                </Text>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryItem}>
                <Text style={styles.summaryItemLabel}>TOTAL RETURNS</Text>
                <Text style={styles.summaryItemValueBold}>
                  {profile.totalReturns || "₹210.00"}
                </Text>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryItem}>
                <Text style={styles.summaryItemLabelOrange}>
                  OUTSTANDING BALANCE
                </Text>
                <Text style={styles.summaryItemValueOrange}>
                  {profile.outstandingBalance || "₹250.00"}
                </Text>
              </View>

              <Pressable
                onPress={() => setActiveTab("ledger")}
                style={styles.viewLedgerButton}
                accessibilityRole="button"
                accessibilityLabel="View Ledger"
              >
                <Text style={styles.viewLedgerIcon}>📄</Text>
                <Text style={styles.viewLedgerText}>View Ledger</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* 6. Tab Content: Returns History */}
      {activeTab === "returns" && (
        <View style={styles.cardContainer}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardTitleBox}>
              <Text style={styles.cardTitle}>Returns History</Text>
              <Text style={styles.cardSubtitle}>
                Processed items and refunds returned by this customer.
              </Text>
            </View>
          </View>

          {isMobile ? (
            <View style={styles.mobileCardsContainer}>
              {returns.length === 0 ? (
                <View style={styles.emptyTableBox}>
                  <Text style={styles.emptyTableText}>
                    No return records for this customer.
                  </Text>
                </View>
              ) : (
                returns.map((ret) => (
                  <View key={ret.returnNo} style={styles.mobileCustomerCard}>
                    <View style={styles.mobileCardHeader}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Text style={styles.invNoText}>{ret.returnNo}</Text>
                        <View style={styles.statusCompletedPill}>
                          <Text style={styles.statusCompletedText}>
                            {ret.status}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[styles.mobileCardAmount, { color: "#DC2626" }]}
                      >
                        {ret.refundAmount}
                      </Text>
                    </View>

                    <Text style={styles.mobileCardDate}>
                      {ret.dateTime} • Ref: {ret.originalInvoice}
                    </Text>

                    <Text style={styles.mobileCardReasonText}>
                      Items: {ret.items}
                    </Text>
                    <Text style={styles.mobileCardReasonSub}>
                      Reason: {ret.reason}
                    </Text>

                    <View style={styles.mobileCardFooter}>
                      <Text style={styles.mobileCardMethod}>
                        Refund Method: {ret.refundMethod}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={styles.tableWrapper}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.thCell, { width: 120 }]}>
                    RETURN NO.
                  </Text>
                  <Text style={[styles.thCell, { width: 170 }]}>
                    DATE & TIME
                  </Text>
                  <Text style={[styles.thCell, { width: 120 }]}>
                    ORIGINAL INVOICE
                  </Text>
                  <Text style={[styles.thCell, { width: 220 }]}>
                    ITEMS RETURNED
                  </Text>
                  <Text
                    style={[styles.thCell, { width: 110, textAlign: "right" }]}
                  >
                    REFUND AMOUNT
                  </Text>
                  <Text style={[styles.thCell, { width: 160 }]}>
                    REFUND METHOD
                  </Text>
                  <Text
                    style={[styles.thCell, { width: 110, textAlign: "center" }]}
                  >
                    STATUS
                  </Text>
                  <Text style={[styles.thCell, { width: 240 }]}>REASON</Text>
                </View>

                {returns.length === 0 ? (
                  <View style={styles.emptyTableBox}>
                    <Text style={styles.emptyTableText}>
                      No return records for this customer.
                    </Text>
                  </View>
                ) : (
                  returns.map((ret, idx) => (
                    <View
                      key={ret.returnNo}
                      style={[
                        styles.tableRow,
                        idx % 2 === 1 && styles.tableRowAlt,
                      ]}
                    >
                      <Text
                        style={[
                          styles.tdCell,
                          styles.invNoText,
                          { width: 120 },
                        ]}
                      >
                        {ret.returnNo}
                      </Text>
                      <Text
                        style={[styles.tdCell, styles.dateText, { width: 170 }]}
                      >
                        {ret.dateTime}
                      </Text>
                      <Text
                        style={[
                          styles.tdCell,
                          { width: 120, color: "#0F766E", fontWeight: "600" },
                        ]}
                      >
                        {ret.originalInvoice}
                      </Text>
                      <Text
                        style={[styles.tdCell, { width: 220 }]}
                        numberOfLines={1}
                      >
                        {ret.items}
                      </Text>
                      <Text
                        style={[
                          styles.tdCell,
                          {
                            width: 110,
                            textAlign: "right",
                            fontWeight: "700",
                            color: "#DC2626",
                          },
                        ]}
                      >
                        {ret.refundAmount}
                      </Text>
                      <Text style={[styles.tdCell, { width: 160 }]}>
                        {ret.refundMethod}
                      </Text>
                      <View style={[{ width: 110, alignItems: "center" }]}>
                        <View style={styles.statusCompletedPill}>
                          <Text style={styles.statusCompletedText}>
                            {ret.status}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[
                          styles.tdCell,
                          { width: 240, color: "#64748B" },
                        ]}
                        numberOfLines={1}
                      >
                        {ret.reason}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          )}
        </View>
      )}

      {/* 7. Tab Content: Ledger / Outstanding */}
      {activeTab === "ledger" && (
        <View style={styles.cardContainer}>
          <View
            style={[
              styles.cardHeaderRow,
              isMobile && styles.cardHeaderRowMobile,
            ]}
          >
            <View style={styles.cardTitleBox}>
              <Text style={styles.cardTitle}>Customer Financial Ledger</Text>
              <Text style={styles.cardSubtitle}>
                Current Balance:{" "}
                <Text style={{ color: "#D97706", fontWeight: "700" }}>
                  {profile.outstandingBalance || "₹250.00"}
                </Text>{" "}
                • Credit Limit: {profile.creditLimit || "₹2,000.00"}
              </Text>
            </View>

            <Pressable
              onPress={() =>
                onShowToast &&
                onShowToast(`Recording payment for ${profile.name}`)
              }
              style={styles.recordPaymentBtn}
            >
              <Text style={styles.recordPaymentBtnText}>+ Record Payment</Text>
            </Pressable>
          </View>

          {isMobile ? (
            <View style={styles.mobileCardsContainer}>
              {ledger.map((entry) => (
                <View key={entry.id} style={styles.mobileCustomerCard}>
                  <View style={styles.mobileCardHeader}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Text style={styles.invNoText}>{entry.refNo}</Text>
                      <View style={styles.statusCompletedPill}>
                        <Text style={styles.statusCompletedText}>
                          {entry.type}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[styles.mobileCardAmount, { color: "#0F172A" }]}
                    >
                      Bal: {entry.balance}
                    </Text>
                  </View>

                  <Text style={styles.mobileCardDate}>{entry.dateTime}</Text>
                  <Text style={styles.mobileCardReasonText}>
                    {entry.description}
                  </Text>

                  <View style={styles.mobileLedgerValuesRow}>
                    <View style={styles.mobileLedgerValBlock}>
                      <Text style={styles.mobileLedgerValLabel}>DEBIT (+)</Text>
                      <Text
                        style={[
                          styles.mobileLedgerValText,
                          {
                            color:
                              entry.debit !== "₹0.00" ? "#DC2626" : "#64748B",
                          },
                        ]}
                      >
                        {entry.debit}
                      </Text>
                    </View>
                    <View style={styles.mobileLedgerValBlock}>
                      <Text style={styles.mobileLedgerValLabel}>
                        CREDIT (-)
                      </Text>
                      <Text
                        style={[
                          styles.mobileLedgerValText,
                          {
                            color:
                              entry.credit !== "₹0.00" ? "#16A34A" : "#64748B",
                          },
                        ]}
                      >
                        {entry.credit}
                      </Text>
                    </View>
                    <View style={styles.mobileLedgerValBlock}>
                      <Text style={styles.mobileLedgerValLabel}>BALANCE</Text>
                      <Text
                        style={[
                          styles.mobileLedgerValText,
                          { fontWeight: "800", color: "#0F172A" },
                        ]}
                      >
                        {entry.balance}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={styles.tableWrapper}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.thCell, { width: 160 }]}>
                    DATE & TIME
                  </Text>
                  <Text style={[styles.thCell, { width: 140 }]}>TYPE</Text>
                  <Text style={[styles.thCell, { width: 120 }]}>REF NO.</Text>
                  <Text style={[styles.thCell, { width: 280 }]}>
                    DESCRIPTION
                  </Text>
                  <Text
                    style={[styles.thCell, { width: 110, textAlign: "right" }]}
                  >
                    DEBIT (+)
                  </Text>
                  <Text
                    style={[styles.thCell, { width: 110, textAlign: "right" }]}
                  >
                    CREDIT (-)
                  </Text>
                  <Text
                    style={[styles.thCell, { width: 120, textAlign: "right" }]}
                  >
                    BALANCE
                  </Text>
                </View>

                {ledger.map((entry, idx) => (
                  <View
                    key={entry.id}
                    style={[
                      styles.tableRow,
                      idx % 2 === 1 && styles.tableRowAlt,
                    ]}
                  >
                    <Text
                      style={[styles.tdCell, styles.dateText, { width: 160 }]}
                    >
                      {entry.dateTime}
                    </Text>
                    <Text
                      style={[styles.tdCell, { width: 140, fontWeight: "600" }]}
                    >
                      {entry.type}
                    </Text>
                    <Text
                      style={[styles.tdCell, styles.invNoText, { width: 120 }]}
                    >
                      {entry.refNo}
                    </Text>
                    <Text
                      style={[styles.tdCell, { width: 280 }]}
                      numberOfLines={1}
                    >
                      {entry.description}
                    </Text>
                    <Text
                      style={[
                        styles.tdCell,
                        {
                          width: 110,
                          textAlign: "right",
                          color:
                            entry.debit !== "₹0.00" ? "#DC2626" : "#64748B",
                          fontWeight: "600",
                        },
                      ]}
                    >
                      {entry.debit}
                    </Text>
                    <Text
                      style={[
                        styles.tdCell,
                        {
                          width: 110,
                          textAlign: "right",
                          color:
                            entry.credit !== "₹0.00" ? "#16A34A" : "#64748B",
                          fontWeight: "600",
                        },
                      ]}
                    >
                      {entry.credit}
                    </Text>
                    <Text
                      style={[
                        styles.tdCell,
                        {
                          width: 120,
                          textAlign: "right",
                          fontWeight: "700",
                          color: "#0F172A",
                        },
                      ]}
                    >
                      {entry.balance}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      )}

      {/* 8. Tab Content: Customer Info */}
      {activeTab === "info" && (
        <View style={styles.cardContainer}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardTitleBox}>
              <Text style={styles.cardTitle}>
                Complete Customer Information
              </Text>
              <Text style={styles.cardSubtitle}>
                Demographics, prescriber information, and credit settings.
              </Text>
            </View>
          </View>

          <View style={styles.infoGridContainer}>
            <View style={styles.infoSection}>
              <Text style={styles.infoSectionHeading}>
                1. Contact & Demographics
              </Text>
              <View style={styles.infoGrid}>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Full Name</Text>
                  <Text style={styles.infoValue}>{profile.name}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Phone Number</Text>
                  <Text style={styles.infoValue}>{profile.phone}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Email Address</Text>
                  <Text style={styles.infoValue}>{profile.email}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Age & Gender</Text>
                  <Text style={styles.infoValue}>
                    {profile.age || 32} Yrs / {profile.gender || "Female"}
                  </Text>
                </View>
                <View style={styles.infoItemFull}>
                  <Text style={styles.infoLabel}>
                    Billing & Shipping Address
                  </Text>
                  <Text style={styles.infoValue}>
                    {profile.address ||
                      "B-404, Green Palms, Andheri West, Mumbai, MH - 400053"}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.infoSection}>
              <Text style={styles.infoSectionHeading}>
                2. Prescriber & Medical Reference (RX-02 & RX-03)
              </Text>
              <View style={styles.infoGrid}>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Attending Doctor</Text>
                  <Text style={styles.infoValue}>
                    {profile.doctorName || "Dr. Farooq Siddiqui"}
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Doctor Specialization</Text>
                  <Text style={styles.infoValue}>
                    {profile.doctorSpecialization || "General Physician"}
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Hospital / Clinic</Text>
                  <Text style={styles.infoValue}>
                    {profile.hospitalClinic || "Lifecare Clinic Mumbai"}
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Active Rx Ref No.</Text>
                  <Text
                    style={[
                      styles.infoValue,
                      { color: "#0F766E", fontWeight: "700" },
                    ]}
                  >
                    {profile.activeRxNo || "Rx-2026-1025"}
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Chronic Conditions</Text>
                  <Text style={styles.infoValue}>
                    {profile.chronicConditions || "None"}
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Reported Drug Allergies</Text>
                  <Text style={[styles.infoValue, { color: "#DC2626" }]}>
                    {profile.allergies || "Sulfa Drugs"}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.infoSection}>
              <Text style={styles.infoSectionHeading}>
                3. Account & Credit Terms
              </Text>
              <View style={styles.infoGrid}>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Customer Status</Text>
                  <Text
                    style={[
                      styles.infoValue,
                      { color: "#16A34A", fontWeight: "700" },
                    ]}
                  >
                    {profile.status || "Active"}
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Credit Facility</Text>
                  <Text style={styles.infoValue}>
                    {profile.creditAllowed !== false ? "Enabled" : "Disabled"}
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Assigned Credit Limit</Text>
                  <Text style={[styles.infoValue, { fontWeight: "700" }]}>
                    {profile.creditLimit || "₹2,000.00"}
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Current Outstanding Dues</Text>
                  <Text
                    style={[
                      styles.infoValue,
                      { color: "#D97706", fontWeight: "700" },
                    ]}
                  >
                    {profile.outstandingBalance || "₹250.00"}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Invoice Details Modal */}
      {selectedInvoice && (
        <Modal
          visible={invoiceModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setInvoiceModalVisible(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setInvoiceModalVisible(false)}
          >
            <Pressable
              style={[styles.modalCard, isMobile && styles.modalCardMobile]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>
                    Invoice {selectedInvoice.invoiceNo}
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    {selectedInvoice.dateTime} • Paid via{" "}
                    {selectedInvoice.paymentMethod}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setInvoiceModalVisible(false)}
                  style={styles.closeModalBtn}
                >
                  <Text style={styles.closeModalBtnText}>✕</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.modalBody}>
                <Text style={styles.modalSectionTitle}>
                  Dispensed Items & Prescriptions
                </Text>
                {selectedInvoice.itemsList &&
                selectedInvoice.itemsList.length > 0 ? (
                  selectedInvoice.itemsList.map((item, idx) => (
                    <View key={idx} style={styles.modalItemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalItemName}>{item.name}</Text>
                        <Text style={styles.modalItemQty}>Qty: {item.qty}</Text>
                      </View>
                      <Text style={styles.modalItemPrice}>{item.price}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.modalItemQty}>
                    No itemized detail available for older archive.
                  </Text>
                )}

                <View style={styles.modalTotalRow}>
                  <Text style={styles.modalTotalLabel}>Total Amount</Text>
                  <Text style={styles.modalTotalValue}>
                    {selectedInvoice.amount}
                  </Text>
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <Pressable
                  onPress={() => {
                    setInvoiceModalVisible(false);
                    if (onShowToast)
                      onShowToast(
                        `Printing receipt for ${selectedInvoice.invoiceNo}`,
                      );
                  }}
                  style={styles.printReceiptBtn}
                >
                  <Text style={styles.printReceiptBtnText}>
                    🖨️ Print Receipt
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setInvoiceModalVisible(false)}
                  style={styles.closeBtnPrimary}
                >
                  <Text style={styles.closeBtnPrimaryText}>Close</Text>
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
    backgroundColor: "#F8FAFC",
  },
  contentContainer: {
    paddingHorizontal: 28,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 20,
  },
  contentContainerMobile: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 16,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
  },
  backLinkIcon: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F766E",
  },
  backLinkText: {
    fontSize: 13.5,
    fontWeight: "600",
    color: "#0F766E",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  headerRowMobile: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  titleWrapper: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.4,
  },
  pageSubtitle: {
    fontSize: 13.5,
    fontWeight: "500",
    color: "#64748B",
    marginTop: 4,
  },
  newSaleButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F766E",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    gap: 6,
    cursor: "pointer",
    ...Platform.select({
      web: {
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
      },
    }),
  },
  newSaleIcon: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  newSaleText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "700",
  },
  profileCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 20,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
      },
    }),
  },
  profileCardBody: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 20,
  },
  profileCardBodyCompact: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  profileIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarIcon: {
    fontSize: 24,
  },
  profileDetailsCol: {
    gap: 4,
  },
  nameStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  customerNameText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  activeBadge: {
    backgroundColor: "#D1FAE5",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  contactItemText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748B",
  },
  contactDivider: {
    fontSize: 12,
    color: "#CBD5E1",
  },
  profileStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    flexWrap: "wrap",
  },
  profileStatsRowMobile: {
    justifyContent: "space-between",
    gap: 12,
  },
  statBox: {
    minWidth: 110,
  },
  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 3,
  },
  statIcon: {
    fontSize: 11,
  },
  statIconOrange: {
    fontSize: 11,
  },
  statLabel: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#64748B",
  },
  statLabelOrange: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#D97706",
  },
  statValueBold: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  statValueOrange: {
    fontSize: 14.5,
    fontWeight: "800",
    color: "#D97706",
  },
  tabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  tabsScrollContent: {
    flexDirection: "row",
    gap: 28,
  },
  tabButton: {
    paddingVertical: 10,
    position: "relative",
    cursor: "pointer",
  },
  tabButtonActive: {},
  tabButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  tabButtonTextActive: {
    color: "#0F766E",
    fontWeight: "700",
  },
  activeTabIndicator: {
    position: "absolute",
    bottom: -1,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: "#0F766E",
    borderRadius: 2,
  },
  splitGridRow: {
    flexDirection: "row",
    gap: 20,
    alignItems: "flex-start",
  },
  splitGridRowStacked: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  mainTableCol: {
    flex: 3,
  },
  mainTableColFull: {
    width: "100%",
  },
  sideSummaryCol: {
    flex: 1.1,
    minWidth: 260,
  },
  sideSummaryColFull: {
    width: "100%",
  },
  cardContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
      },
    }),
  },
  cardHeaderRow: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  cardHeaderRowMobile: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  cardTitleBox: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15.5,
    fontWeight: "700",
    color: "#0F172A",
  },
  cardSubtitle: {
    fontSize: 12.5,
    color: "#64748B",
    marginTop: 2,
  },
  searchBoxWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
    width: 220,
  },
  searchBoxWrapperMobile: {
    width: "100%",
  },
  searchIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  searchTextInput: {
    flex: 1,
    fontSize: 12.5,
    color: "#0F172A",
    outlineStyle: "none",
  },
  clearSearchBtn: {
    fontSize: 12,
    color: "#94A3B8",
    padding: 2,
  },
  tableWrapper: {
    minWidth: 800,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  thCell: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    paddingHorizontal: 6,
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  tableRowAlt: {
    backgroundColor: "#FBFDFF",
  },
  tdCell: {
    fontSize: 13,
    color: "#334155",
    paddingHorizontal: 6,
  },
  invNoText: {
    fontWeight: "700",
    color: "#0F172A",
  },
  dateText: {
    color: "#64748B",
    fontSize: 12.5,
  },
  amountText: {
    fontWeight: "700",
    color: "#0F172A",
  },
  paymentMethodText: {
    fontWeight: "500",
    color: "#475569",
  },
  statusCompletedPill: {
    backgroundColor: "#D1FAE5",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  statusCompletedText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#047857",
  },
  viewActionBtn: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    cursor: "pointer",
  },
  viewActionBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  emptyTableBox: {
    padding: 30,
    alignItems: "center",
  },
  emptyTableText: {
    color: "#94A3B8",
    fontSize: 13,
  },
  paginationFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
  },
  paginationFooterMobile: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  paginationText: {
    fontSize: 12.5,
    color: "#64748B",
    fontWeight: "500",
  },
  paginationControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pageNavBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    cursor: "pointer",
  },
  pageNavBtnDisabled: {
    opacity: 0.4,
    cursor: "default",
  },
  pageNavBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
  },
  pageNavBtnTextDisabled: {
    color: "#94A3B8",
  },
  pageNumberBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    cursor: "pointer",
  },
  pageNumberBtnActive: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  pageNumberText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  pageNumberTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 20,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
      },
    }),
  },
  summaryCardTitle: {
    fontSize: 15.5,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 16,
  },
  summaryItem: {
    paddingVertical: 8,
  },
  summaryItemLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  summaryItemLabelOrange: {
    fontSize: 11,
    fontWeight: "700",
    color: "#D97706",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  summaryItemValueBold: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  summaryItemValueOrange: {
    fontSize: 18,
    fontWeight: "800",
    color: "#D97706",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },
  viewLedgerButton: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingVertical: 9,
    backgroundColor: "#FFFFFF",
    cursor: "pointer",
  },
  viewLedgerIcon: {
    fontSize: 14,
  },
  viewLedgerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
  },
  recordPaymentBtn: {
    backgroundColor: "#0F766E",
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 6,
    cursor: "pointer",
  },
  recordPaymentBtnText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "700",
  },
  infoGridContainer: {
    padding: 20,
    gap: 20,
  },
  infoSection: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingBottom: 16,
  },
  infoSectionHeading: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#0F766E",
    marginBottom: 12,
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  infoItem: {
    width: "47%",
    minWidth: 200,
  },
  infoItemFull: {
    width: "100%",
  },
  infoLabel: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#94A3B8",
    marginBottom: 3,
    textTransform: "uppercase",
  },
  infoValue: {
    fontSize: 13.5,
    fontWeight: "600",
    color: "#0F172A",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    width: "100%",
    maxWidth: 520,
    maxHeight: "80%",
    overflow: "hidden",
  },
  modalCardMobile: {
    maxWidth: "100%",
  },
  modalHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  closeModalBtn: {
    padding: 6,
  },
  closeModalBtnText: {
    fontSize: 16,
    color: "#64748B",
    fontWeight: "700",
  },
  modalBody: {
    padding: 16,
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 12,
  },
  modalItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  modalItemName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
  },
  modalItemQty: {
    fontSize: 12,
    color: "#64748B",
  },
  modalItemPrice: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: "#E2E8F0",
  },
  modalTotalLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalTotalValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F766E",
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    backgroundColor: "#FAFAFA",
  },
  printReceiptBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  printReceiptBtnText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#334155",
  },
  closeBtnPrimary: {
    backgroundColor: "#0F766E",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  closeBtnPrimaryText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "700",
  },
  // Mobile KPI Card Styles
  mobileCardsContainer: {
    padding: 12,
    gap: 12,
  },
  mobileCustomerCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 14,
    ...Platform.select({
      web: { boxShadow: "0 1px 3px rgba(0,0,0,0.04)" },
      default: { elevation: 1 },
    }),
  },
  mobileCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  mobileCardDate: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 8,
  },
  mobileCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 8,
    marginTop: 6,
  },
  mobileCardSub: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#0F172A",
  },
  mobileCardMethod: {
    fontSize: 11.5,
    color: "#64748B",
    marginTop: 2,
  },
  mobileCardAmount: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F766E",
  },
  mobileCardReasonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 4,
  },
  mobileCardReasonSub: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 4,
  },
  mobileLedgerValuesRow: {
    flexDirection: "row",
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    padding: 10,
    justifyContent: "space-between",
    marginTop: 8,
  },
  mobileLedgerValBlock: {
    alignItems: "center",
    flex: 1,
  },
  mobileLedgerValLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  mobileLedgerValText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
