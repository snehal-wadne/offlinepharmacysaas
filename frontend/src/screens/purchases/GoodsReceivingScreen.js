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
import {
  MOCK_GRN_LIST,
  GRN_STATUS_FILTER,
} from "../../data/goodsReceivingMockData";
import {
  fetchGoodsReceipts,
  createGoodsReceipt,
  updateGoodsReceiptStatus,
} from '../../api/purchaseApi';
import { SkeletonTableRow, SkeletonItemCard } from '../../components/common/SkeletonLoader';
import PaginationControls from '../../components/common/PaginationControls';
import { localPersistenceService } from "../../db";
import { syncEngine } from "../../sync";

const GRN_STATUS_BADGES = {
  Verified: { bg: "#DCFCE7", text: "#15803D", dot: "#16A34A" },
  "Pending Inspection": { bg: "#FEF3C7", text: "#B45309", dot: "#F59E0B" },
  Discrepancy: { bg: "#FEE2E2", text: "#B91C1C", dot: "#EF4444" },
};

const SYNC_STATUS_BADGES = {
  PENDING: { bg: "#FEF3C7", text: "#B45309", label: "Local Pending" },
  SYNCED: { bg: "#DCFCE7", text: "#15803D", label: "Synced" },
  FAILED: { bg: "#FEE2E2", text: "#B91C1C", label: "Sync Failed" },
  CONFLICT: { bg: "#FEE2E2", text: "#B91C1C", label: "Conflict" },
};

export default function GoodsReceivingScreen({ onShowToast, onNavigate }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const isMobile = width < 768;

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All Statuses");
  const [grnList, setGrnList] = useState(MOCK_GRN_LIST);
  const [availableProducts, setAvailableProducts] = useState([]);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [statusModalGrn, setStatusModalGrn] = useState(null);

  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const loadGRNs = async () => {
    try {
      let localRecords = [];
      if (
        typeof localPersistenceService?.getLocalPurchaseReceipts === "function"
      ) {
        localRecords = await localPersistenceService.getLocalPurchaseReceipts();
      }

      let serverRecords = [];
      try {
        const response = await fetchGoodsReceipts();
        if (response && response.data && response.data.length > 0) {
          serverRecords = response.data.map((grn) => ({
            realId: grn.id,
            id: grn.receiptNumber || grn.receipt_number || grn.id,
            poReference: grn.purchaseNumber || grn.poReference || "PO-1026",
            supplier: grn.supplierName || grn.supplier || "Sun Pharma Care",
            receivedDate:
              grn.receivedDate || grn.received_date || "29 Aug 2026",
            receivedBy: grn.receivedBy || "Manager",
            itemsCount: grn.itemsCount || 4,
            packagesCount: grn.packageCount || grn.package_count || 8,
            invoiceNo:
              grn.supplierInvoiceNumber ||
              grn.supplier_invoice_number ||
              "INV-SP-9012",
            status:
              grn.status === "VERIFIED"
                ? "Verified"
                : grn.status === "DISCREPANCY"
                  ? "Discrepancy"
                  : "Pending Inspection",
            branch: grn.branchName || grn.branch || "Main Branch",
            syncStatus: "SYNCED",
          }));
        }
      } catch (err) {
        // Server unreachable or offline
      }

      // Merge local and server records without overwriting pending local transactions
      const combined = [...localRecords];
      const existingIds = new Set(localRecords.map((r) => r.id || r.realId));
      for (const s of serverRecords) {
        if (!existingIds.has(s.id) && !existingIds.has(s.realId)) {
          combined.push(s);
          existingIds.add(s.id);
        }
      }

      if (combined.length > 0) {
        setGrnList(combined);
      } else {
        setGrnList(MOCK_GRN_LIST);
      }
    } catch (err) {
      console.warn("[GoodsReceivingScreen] Error loading GRN list:", err);
      setGrnList(MOCK_GRN_LIST);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    loadGRNs();

    async function loadProducts() {
      try {
        if (typeof localPersistenceService?.getCatalogForPos === "function") {
          const prods = await localPersistenceService.getCatalogForPos();
          if (isMounted && prods && prods.length > 0) {
            setAvailableProducts(prods);
          }
        }
      } catch (err) {}
    }
    loadProducts();

    const subscribeFn =
      typeof syncEngine?.onStateChange === "function"
        ? syncEngine.onStateChange.bind(syncEngine)
        : typeof syncEngine?.subscribe === "function"
          ? syncEngine.subscribe.bind(syncEngine)
          : null;

    const unsubscribe = subscribeFn
      ? subscribeFn(() => {
          if (isMounted) loadGRNs();
        })
      : null;

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const [modalVisible, setModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    poReference: "PO-1026",
    supplier: "Sun Pharma Care",
    invoiceNo: "INV-SP-9012",
    packagesCount: "8",
    branch: "Main Branch",
    notes: "",
  });
  const [formErrors, setFormErrors] = useState({});

  // Dynamic KPI Card counts derived from grnList
  const totalReceived = grnList.length;
  const pendingCount = grnList.filter(
    (g) =>
      g.status === "Pending Inspection" || g.status === "PENDING_INSPECTION",
  ).length;
  const verifiedCount = grnList.filter(
    (g) => g.status === "Verified" || g.status === "VERIFIED",
  ).length;
  const discrepancyCount = grnList.filter(
    (g) => g.status === "Discrepancy" || g.status === "DISCREPANCY",
  ).length;

  const dynamicKpis = [
    {
      id: "received",
      label: "SHIPMENTS RECEIVED",
      value: String(totalReceived),
      subtext: "This fiscal month",
      variant: "teal",
      filterKey: "All Statuses",
    },
    {
      id: "pending",
      label: "PENDING INSPECTION",
      value: String(pendingCount),
      subtext: "Awaiting QC check",
      variant: "amber",
      filterKey: "Pending Inspection",
    },
    {
      id: "verified",
      label: "FULLY VERIFIED",
      value: String(verifiedCount),
      subtext: "Added to inventory",
      variant: "emerald",
      filterKey: "Verified",
    },
    {
      id: "discrepancy",
      label: "DISCREPANCIES",
      value: String(discrepancyCount),
      subtext: "Requires resolution",
      variant: "rose",
      filterKey: "Discrepancy",
    },
  ];

  const filteredGRNs = grnList.filter((grn) => {
    const matchesSearch =
      grn.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      grn.poReference.toLowerCase().includes(searchQuery.toLowerCase()) ||
      grn.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      grn.invoiceNo.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      selectedStatus === "All Statuses" || grn.status === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  const [items, setItems] = useState([
    {
      productId: "",
      productName: "Paracetamol 500mg",
      batchNumber: `BAT-${Math.floor(1000 + Math.random() * 9000)}`,
      expiryDate: "2028-12-31",
      quantity: "10",
      costPrice: "100",
      mrp: "130",
    },
  ]);

  const handleOpenModal = () => {
    const firstProd = availableProducts[0];
    setFormData({
      poReference: "PO-1026",
      supplier: "Sun Pharma Care",
      invoiceNo: `INV-SP-${Math.floor(1000 + Math.random() * 9000)}`,
      packagesCount: "8",
      branch: "Main Branch",
      notes: "",
    });
    setItems([
      {
        productId: firstProd ? firstProd.productId || firstProd.id : "",
        productName: firstProd ? firstProd.name : "Paracetamol 500mg",
        batchNumber: `BAT-${Math.floor(1000 + Math.random() * 9000)}`,
        expiryDate: "2028-12-31",
        quantity: "10",
        costPrice: "100",
        mrp: "130",
      },
    ]);
    setFormErrors({});
    setModalVisible(true);
  };

  const handleAddItem = () => {
    const nextProd =
      availableProducts[items.length % (availableProducts.length || 1)];
    setItems((prev) => [
      ...prev,
      {
        productId: nextProd ? nextProd.productId || nextProd.id : "",
        productName: nextProd ? nextProd.name : "",
        batchNumber: `BAT-${Math.floor(1000 + Math.random() * 9000)}`,
        expiryDate: "2028-12-31",
        quantity: "10",
        costPrice: "100",
        mrp: "130",
      },
    ]);
  };

  const handleRemoveItem = (index) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        if (field === "productId") {
          const selected = availableProducts.find(
            (p) => (p.productId || p.id) === value,
          );
          return {
            ...it,
            productId: value,
            productName: selected ? selected.name : it.productName,
          };
        }
        return { ...it, [field]: value };
      }),
    );
  };

  const handleReceiveShipment = async () => {
    const errors = {};
    if (!formData.poReference.trim())
      errors.poReference = "PO Reference is required";
    if (!formData.supplier.trim()) errors.supplier = "Supplier is required";
    if (!formData.invoiceNo.trim()) errors.invoiceNo = "Invoice No is required";

    if (!items || items.length === 0) {
      errors.items = "At least one line item is required";
    }

    const validatedItems = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const qtyNum = Number(it.quantity);
      if (!it.productName?.trim() && !it.productId?.trim()) {
        errors[`item_${i}_product`] = "Product is required";
      }
      if (!it.batchNumber?.trim()) {
        errors[`item_${i}_batch`] = "Batch number is required";
      }
      if (isNaN(qtyNum) || qtyNum <= 0) {
        errors[`item_${i}_qty`] = "Valid quantity (>0) is required";
      }

      let resolvedPid = it.productId;
      if (!resolvedPid && availableProducts.length > 0) {
        const found = availableProducts.find(
          (p) => p.name?.toLowerCase() === it.productName?.trim().toLowerCase(),
        );
        if (found) resolvedPid = found.productId || found.id;
      }
      if (!resolvedPid) {
        resolvedPid = `prod-rec-${Date.now()}-${i}`;
      }

      validatedItems.push({
        productId: resolvedPid,
        productName: it.productName?.trim() || "Received Item",
        batchNumber: it.batchNumber.trim(),
        expiryDate: it.expiryDate?.trim() || "2028-12-31",
        quantity: qtyNum,
        costPrice: Number(it.costPrice) || 100,
        mrp: Number(it.mrp) || 130,
        sellingPrice: Number(it.mrp) || 130,
      });
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      if (typeof localPersistenceService?.receiveLocalPurchase === "function") {
        await localPersistenceService.receiveLocalPurchase({
          purchaseNumber: formData.poReference.trim(),
          supplierInvoiceNumber: formData.invoiceNo.trim(),
          supplierName: formData.supplier.trim(),
          packageCount: Number(formData.packagesCount || 1),
          notes: formData.notes.trim(),
          items: validatedItems,
        });

        await loadGRNs();
        setModalVisible(false);

        if (onShowToast) {
          onShowToast(
            `✓ Received Goods Note logged locally (${validatedItems.length} items)!`,
          );
        }

        // Opportunistic sync
        if (typeof syncEngine?.sync === "function") {
          syncEngine.sync().catch(() => {});
        }
      } else {
        // Fallback for mock mode
        const generatedId = `GRN-2026-0${90 + grnList.length}`;
        const newGRN = {
          realId: generatedId,
          id: generatedId,
          poReference: formData.poReference,
          supplier: formData.supplier,
          receivedDate: new Date().toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
          receivedBy: "Manager (HP)",
          itemsCount: validatedItems.length,
          packagesCount: Number(formData.packagesCount || 8),
          invoiceNo: formData.invoiceNo,
          status: "Verified",
          branch: formData.branch || "Main Branch",
        };
        setGrnList((prev) => [newGRN, ...prev]);
        setModalVisible(false);

        if (onShowToast) {
          onShowToast(
            `✓ Logged Goods Received Note ${newGRN.id} for ${newGRN.poReference}!`,
          );
        }
      }
    } catch (err) {
      console.error(
        "[GoodsReceivingScreen] Error committing purchase receipt:",
        err,
      );
      if (onShowToast) {
        onShowToast(
          `Error saving receipt: ${err.message || "Local persistence failure"}`,
        );
      }
    }
  };

  const handleStatusChange = async (grnItem, newStatus) => {
    setActiveMenuId(null);
    const targetId = grnItem.realId || grnItem.id;

    try {
      await updateGoodsReceiptStatus(targetId, newStatus);
    } catch (err) {
      console.warn(
        "[GoodsReceivingScreen] Status update in backend failed, updated local state:",
        err.message,
      );
    }

    setGrnList((prev) =>
      prev.map((item) =>
        item.id === grnItem.id ? { ...item, status: newStatus } : item,
      ),
    );

    if (onShowToast) {
      onShowToast(`✓ Updated shipment ${grnItem.id} status to ${newStatus}`);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={true}
    >
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.pageTitle}>Goods Receiving</Text>
          <Text style={styles.pageSubtitle}>
            Verify incoming medicine shipments against POs and log Goods
            Received Notes (GRN).
          </Text>
        </View>
        <Pressable
          onPress={handleOpenModal}
          style={styles.receiveButton}
          accessibilityRole="button"
          accessibilityLabel="Receive Shipment"
        >
          <Text style={styles.receiveText}>+ Receive Shipment</Text>
        </Pressable>
      </View>

      {/* Top 4 Dynamic KPI Cards */}
      <View style={[styles.kpiRow, isCompact && styles.kpiRowCompact]}>
        {dynamicKpis.map((kpi) => (
          <InventoryStatCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            subtext={kpi.subtext}
            variant={kpi.variant}
            onPress={() => setSelectedStatus(kpi.filterKey)}
          />
        ))}
      </View>

      {/* Main GRN Table Card */}
      <View style={styles.cardContainer}>
        {/* Filters Bar */}
        <View
          style={[styles.filtersBar, isCompact && styles.filtersBarCompact]}
        >
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search GRN, PO reference, supplier, invoice..."
              placeholderTextColor="#94A3B8"
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

          {/* Status Filter Chips */}
          <View style={styles.filterChipRow}>
            {GRN_STATUS_FILTER.map((st) => (
              <Pressable
                key={st}
                onPress={() => setSelectedStatus(st)}
                style={[
                  styles.filterChip,
                  selectedStatus === st && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedStatus === st && styles.filterChipTextActive,
                  ]}
                >
                  {st}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* GRN Content (Mobile Cards vs Desktop Table) */}
        {isMobile ? (
          <View style={styles.mobileCardsList}>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <SkeletonItemCard key={i} />)
            ) : filteredGRNs.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>
                  No goods received records found
                </Text>
                <Text style={styles.emptySubtitle}>
                  Try changing your search or status filter.
                </Text>
              </View>
            ) : (
              filteredGRNs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((grn) => {
                const badge =
                  GRN_STATUS_BADGES[grn.status] || GRN_STATUS_BADGES.Verified;
                const isMenuOpen = activeMenuId === grn.id;

                return (
                  <View
                    key={grn.id}
                    style={styles.mobileGrnCard}
                  >
                    {/* Header Row: ID + Status + Action menu */}
                    <View style={styles.mobileCardTopRow}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <Text style={styles.grnId}>{grn.id}</Text>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: badge.bg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              { color: badge.text },
                            ]}
                          >
                            {grn.status}
                          </Text>
                        </View>
                        {grn.syncStatus && grn.syncStatus !== "SYNCED" && (
                          <View
                            style={[
                              styles.statusBadge,
                              {
                                backgroundColor: "#FEF3C7",
                                paddingVertical: 1,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                { color: "#B45309", fontSize: 10 },
                              ]}
                            >
                              {grn.syncStatus}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.actionWrapper}>
                        <Pressable
                          onPress={() => setStatusModalGrn(grn)}
                          style={styles.threeDotsBtn}
                          accessibilityRole="button"
                          accessibilityLabel="Action menu"
                        >
                          <Text style={styles.threeDotsText}>⋮</Text>
                        </Pressable>
                      </View>
                    </View>

                    {/* Supplier Name */}
                    <Text style={styles.mobileSupplierName}>
                      {grn.supplier}
                    </Text>

                    {/* Key-Value Details Grid */}
                    <View style={styles.mobileDetailsGrid}>
                      <View style={styles.mobileDetailItem}>
                        <Text style={styles.mobileDetailLabel}>PO REF</Text>
                        <Text style={styles.poRef}>{grn.poReference}</Text>
                      </View>
                      <View style={styles.mobileDetailItem}>
                        <Text style={styles.mobileDetailLabel}>INVOICE NO</Text>
                        <Text style={styles.mobileDetailVal}>
                          {grn.invoiceNo}
                        </Text>
                      </View>
                      <View style={styles.mobileDetailItem}>
                        <Text style={styles.mobileDetailLabel}>
                          RECEIVED DATE
                        </Text>
                        <Text style={styles.mobileDetailVal}>
                          {grn.receivedDate}
                        </Text>
                      </View>
                      <View style={styles.mobileDetailItem}>
                        <Text style={styles.mobileDetailLabel}>
                          ITEMS / PACKAGES
                        </Text>
                        <Text style={styles.mobileDetailVal}>
                          {grn.itemsCount} items ({grn.packagesCount} pkgs)
                        </Text>
                      </View>
                    </View>

                    {/* Footer */}
                    <View style={styles.mobileCardFooter}>
                      <Text style={styles.mobileReceivedByText}>
                        👤 Received by:{" "}
                        <Text style={{ fontWeight: "600", color: "#0F172A" }}>
                          {grn.receivedBy}
                        </Text>
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              {/* Table Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { width: 130 }]}>GRN NUMBER</Text>
                <Text style={[styles.thCell, { width: 100 }]}>PO REF</Text>
                <Text style={[styles.thCell, { width: 160 }]}>SUPPLIER</Text>
                <Text style={[styles.thCell, { width: 120 }]}>
                  RECEIVED DATE
                </Text>
                <Text style={[styles.thCell, { width: 120 }]}>RECEIVED BY</Text>
                <Text
                  style={[styles.thCell, { width: 70, textAlign: "center" }]}
                >
                  ITEMS
                </Text>
                <Text
                  style={[styles.thCell, { width: 90, textAlign: "center" }]}
                >
                  PACKAGES
                </Text>
                <Text style={[styles.thCell, { width: 120 }]}>INVOICE NO</Text>
                <Text
                  style={[styles.thCell, { width: 140, textAlign: "center" }]}
                >
                  STATUS
                </Text>
                <Text
                  style={[styles.thCell, { width: 60, textAlign: "center" }]}
                >
                  ACTION
                </Text>
              </View>

              {/* Table Rows */}
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonTableRow key={i} columns={10} />
                ))
              ) : filteredGRNs.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>
                    No goods received records found
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    Try changing your search or status filter.
                  </Text>
                </View>
              ) : (
                filteredGRNs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((grn, index) => {
                  const badge =
                    GRN_STATUS_BADGES[grn.status] || GRN_STATUS_BADGES.Verified;
                  const isMenuOpen = activeMenuId === grn.id;

                  return (
                    <View
                      key={grn.id}
                      style={[
                        styles.tableRow,
                        index % 2 === 1 && styles.tableRowAlt,
                        { zIndex: isMenuOpen ? 999 : 1 },
                      ]}
                    >
                      <Text
                        style={[styles.tdCell, styles.grnId, { width: 130 }]}
                      >
                        {grn.id}
                      </Text>
                      <Text
                        style={[styles.tdCell, styles.poRef, { width: 100 }]}
                      >
                        {grn.poReference}
                      </Text>
                      <Text
                        style={[
                          styles.tdCell,
                          styles.supplierText,
                          { width: 160 },
                        ]}
                        numberOfLines={1}
                      >
                        {grn.supplier}
                      </Text>
                      <Text style={[styles.tdCell, { width: 120 }]}>
                        {grn.receivedDate}
                      </Text>
                      <Text style={[styles.tdCell, { width: 120 }]}>
                        {grn.receivedBy}
                      </Text>
                      <Text
                        style={[
                          styles.tdCell,
                          { width: 70, textAlign: "center", fontWeight: "600" },
                        ]}
                      >
                        {grn.itemsCount}
                      </Text>
                      <Text
                        style={[
                          styles.tdCell,
                          { width: 90, textAlign: "center" },
                        ]}
                      >
                        {grn.packagesCount}
                      </Text>
                      <Text style={[styles.tdCell, { width: 120 }]}>
                        {grn.invoiceNo}
                      </Text>

                      {/* Status Badge */}
                      <View
                        style={[styles.statusWrapper, { width: 140, gap: 4 }]}
                      >
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: badge.bg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              { color: badge.text },
                            ]}
                          >
                            {grn.status}
                          </Text>
                        </View>
                        {grn.syncStatus && grn.syncStatus !== "SYNCED" && (
                          <View
                            style={[
                              styles.statusBadge,
                              {
                                backgroundColor: "#FEF3C7",
                                paddingVertical: 1,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                { color: "#B45309", fontSize: 10 },
                              ]}
                            >
                              {grn.syncStatus}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* 3-Dots Action Column */}
                      <View style={[styles.actionWrapper, { width: 60 }]}>
                        <Pressable
                          onPress={() =>
                            setActiveMenuId((prev) =>
                              prev === grn.id ? null : grn.id,
                            )
                          }
                          style={styles.threeDotsBtn}
                          accessibilityRole="button"
                          accessibilityLabel="Action menu"
                        >
                          <Text style={styles.threeDotsText}>⋮</Text>
                        </Pressable>

                        {/* Dropdown Menu */}
                        {isMenuOpen && (
                          <>
                            {Platform.OS === 'web' && (
                              <Pressable
                                style={{
                                  position: 'fixed',
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  zIndex: 998,
                                }}
                                onPress={() => setActiveMenuId(null)}
                              />
                            )}
                            <View style={styles.menuPopover}>
                              <Text style={styles.menuHeaderTitle}>
                                Update Status
                              </Text>

                            <Pressable
                              style={styles.menuItem}
                              onPress={() =>
                                handleStatusChange(grn, "Verified")
                              }
                            >
                              <View
                                style={[
                                  styles.menuDot,
                                  {
                                    backgroundColor:
                                      GRN_STATUS_BADGES["Verified"].dot,
                                  },
                                ]}
                              />
                              <Text
                                style={[
                                  styles.menuItemText,
                                  grn.status === "Verified" &&
                                    styles.menuItemTextActive,
                                ]}
                              >
                                Verified
                              </Text>
                            </Pressable>

                            <Pressable
                              style={styles.menuItem}
                              onPress={() =>
                                handleStatusChange(grn, "Pending Inspection")
                              }
                            >
                              <View
                                style={[
                                  styles.menuDot,
                                  {
                                    backgroundColor:
                                      GRN_STATUS_BADGES["Pending Inspection"]
                                        .dot,
                                  },
                                ]}
                              />
                              <Text
                                style={[
                                  styles.menuItemText,
                                  grn.status === "Pending Inspection" &&
                                    styles.menuItemTextActive,
                                ]}
                              >
                                Pending Inspection
                              </Text>
                            </Pressable>

                            <Pressable
                              style={styles.menuItem}
                              onPress={() =>
                                handleStatusChange(grn, "Discrepancy")
                              }
                            >
                              <View
                                style={[
                                  styles.menuDot,
                                  {
                                    backgroundColor:
                                      GRN_STATUS_BADGES["Discrepancy"].dot,
                                  },
                                ]}
                              />
                              <Text
                                style={[
                                  styles.menuItemText,
                                  grn.status === "Discrepancy" &&
                                    styles.menuItemTextActive,
                                ]}
                              >
                                Discrepancy
                              </Text>
                            </Pressable>
                          </View>
                        </>
                      )}
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
          totalPages={Math.ceil(filteredGRNs.length / itemsPerPage)}
          onPageChange={setCurrentPage}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={setItemsPerPage}
        />
      </View>

      {/* Receive Shipment Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setModalVisible(false)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Receive Goods Shipment</Text>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={styles.closeBtn}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.formRow}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    PO Reference <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formData.poReference}
                    onChangeText={(t) =>
                      setFormData((p) => ({ ...p, poReference: t }))
                    }
                  />
                  {formErrors.poReference && (
                    <Text style={styles.errorText}>
                      {formErrors.poReference}
                    </Text>
                  )}
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Supplier <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formData.supplier}
                    onChangeText={(t) =>
                      setFormData((p) => ({ ...p, supplier: t }))
                    }
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Supplier Invoice No. <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formData.invoiceNo}
                    onChangeText={(t) =>
                      setFormData((p) => ({ ...p, invoiceNo: t }))
                    }
                  />
                  {formErrors.invoiceNo && (
                    <Text style={styles.errorText}>{formErrors.invoiceNo}</Text>
                  )}
                </View>

                <View style={styles.formFieldHalf}>
                  <Text style={styles.fieldLabel}>
                    Packages / Cartons Count
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    value={formData.packagesCount}
                    onChangeText={(t) =>
                      setFormData((p) => ({ ...p, packagesCount: t }))
                    }
                  />
                </View>
              </View>

              {/* Received Line Items Section */}
              <View style={styles.itemsSection}>
                <View style={styles.itemsSectionHeader}>
                  <Text style={styles.itemsSectionTitle}>
                    Received Line Items ({items.length})
                  </Text>
                  <Pressable onPress={handleAddItem} style={styles.addItemBtn}>
                    <Text style={styles.addItemBtnText}>+ Add Medicine</Text>
                  </Pressable>
                </View>
                {formErrors.items && (
                  <Text style={[styles.errorText, { marginBottom: 8 }]}>
                    {formErrors.items}
                  </Text>
                )}

                {items.map((item, idx) => (
                  <View key={idx} style={styles.itemRowCard}>
                    <View style={styles.itemRowHeader}>
                      <Text style={styles.itemRowNumber}>Item #{idx + 1}</Text>
                      {items.length > 1 && (
                        <Pressable
                          onPress={() => handleRemoveItem(idx)}
                          style={styles.removeItemBtn}
                        >
                          <Text style={styles.removeItemText}>✕ Remove</Text>
                        </Pressable>
                      )}
                    </View>

                    {/* Product Selection */}
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>
                        Medicine / Product <Text style={styles.reqStar}>*</Text>
                      </Text>
                      <TextInput
                        style={styles.modalInput}
                        value={item.productName}
                        placeholder="Type medicine name or select below..."
                        placeholderTextColor="#94A3B8"
                        onChangeText={(t) =>
                          handleItemChange(idx, "productName", t)
                        }
                      />
                      {availableProducts.length > 0 && (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={styles.quickProdChips}
                        >
                          {availableProducts.slice(0, 6).map((p) => (
                            <Pressable
                              key={p.productId || p.id}
                              onPress={() => {
                                handleItemChange(
                                  idx,
                                  "productId",
                                  p.productId || p.id,
                                );
                                handleItemChange(idx, "productName", p.name);
                              }}
                              style={[
                                styles.quickProdChip,
                                (item.productId === (p.productId || p.id) ||
                                  item.productName === p.name) &&
                                  styles.quickProdChipActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.quickProdChipText,
                                  (item.productId === (p.productId || p.id) ||
                                    item.productName === p.name) &&
                                    styles.quickProdChipTextActive,
                                ]}
                              >
                                {p.name}
                              </Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      )}
                      {formErrors[`item_${idx}_product`] && (
                        <Text style={styles.errorText}>
                          {formErrors[`item_${idx}_product`]}
                        </Text>
                      )}
                    </View>

                    {/* Batch Number & Expiry Date */}
                    <View style={styles.formRow}>
                      <View style={styles.formFieldHalf}>
                        <Text style={styles.fieldLabel}>
                          Batch Number <Text style={styles.reqStar}>*</Text>
                        </Text>
                        <TextInput
                          style={styles.modalInput}
                          value={item.batchNumber}
                          placeholder="BAT-1001"
                          placeholderTextColor="#94A3B8"
                          onChangeText={(t) =>
                            handleItemChange(idx, "batchNumber", t)
                          }
                        />
                        {formErrors[`item_${idx}_batch`] && (
                          <Text style={styles.errorText}>
                            {formErrors[`item_${idx}_batch`]}
                          </Text>
                        )}
                      </View>
                      <View style={styles.formFieldHalf}>
                        <Text style={styles.fieldLabel}>
                          Expiry Date (YYYY-MM-DD)
                        </Text>
                        <TextInput
                          style={styles.modalInput}
                          value={item.expiryDate}
                          placeholder="2028-12-31"
                          placeholderTextColor="#94A3B8"
                          onChangeText={(t) =>
                            handleItemChange(idx, "expiryDate", t)
                          }
                        />
                      </View>
                    </View>

                    {/* Quantity, Cost Price, MRP */}
                    <View style={styles.formRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>
                          Quantity <Text style={styles.reqStar}>*</Text>
                        </Text>
                        <TextInput
                          style={styles.modalInput}
                          keyboardType="numeric"
                          value={item.quantity}
                          onChangeText={(t) =>
                            handleItemChange(idx, "quantity", t)
                          }
                        />
                        {formErrors[`item_${idx}_qty`] && (
                          <Text style={styles.errorText}>
                            {formErrors[`item_${idx}_qty`]}
                          </Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>Cost Price (₹)</Text>
                        <TextInput
                          style={styles.modalInput}
                          keyboardType="numeric"
                          value={item.costPrice}
                          onChangeText={(t) =>
                            handleItemChange(idx, "costPrice", t)
                          }
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>MRP (₹)</Text>
                        <TextInput
                          style={styles.modalInput}
                          keyboardType="numeric"
                          value={item.mrp}
                          onChangeText={(t) => handleItemChange(idx, "mrp", t)}
                        />
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  Receiving Inspection Notes
                </Text>
                <TextInput
                  style={[styles.modalInput, styles.textArea]}
                  multiline
                  numberOfLines={3}
                  placeholder="Note package seal conditions, temperature logs..."
                  placeholderTextColor="#94A3B8"
                  value={formData.notes}
                  onChangeText={(t) => setFormData((p) => ({ ...p, notes: t }))}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleReceiveShipment}
                style={styles.submitModalButton}
              >
                <Text style={styles.submitModalButtonText}>
                  Confirm & Add to Stock
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Mobile Action Sheet / Status Update Modal */}
      <Modal
        visible={!!statusModalGrn}
        transparent
        animationType="fade"
        onRequestClose={() => setStatusModalGrn(null)}
      >
        <Pressable
          style={styles.actionSheetBackdrop}
          onPress={() => setStatusModalGrn(null)}
        >
          <Pressable
            style={styles.actionSheetCard}
            onPress={(e) => e.stopPropagation?.()}
          >
            <View style={styles.actionSheetHeader}>
              <View>
                <Text style={styles.actionSheetTitle}>Update Status</Text>
                <Text style={styles.actionSheetSub}>
                  {statusModalGrn?.id} • {statusModalGrn?.supplier}
                </Text>
              </View>
              <Pressable
                onPress={() => setStatusModalGrn(null)}
                style={styles.actionSheetCloseBtn}
              >
                <Text style={styles.actionSheetCloseText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.actionSheetBody}>
              {["Verified", "Pending Inspection", "Discrepancy"].map((statusOption) => {
                const badgeConfig = GRN_STATUS_BADGES[statusOption] || GRN_STATUS_BADGES.Verified;
                const isSelected = statusModalGrn?.status === statusOption;

                return (
                  <Pressable
                    key={statusOption}
                    style={[
                      styles.actionSheetOption,
                      isSelected && styles.actionSheetOptionSelected,
                    ]}
                    onPress={() => {
                      const target = statusModalGrn;
                      setStatusModalGrn(null);
                      handleStatusChange(target, statusOption);
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View
                        style={[
                          styles.actionSheetOptionDot,
                          { backgroundColor: badgeConfig.dot },
                        ]}
                      />
                      <Text
                        style={[
                          styles.actionSheetOptionText,
                          isSelected && styles.actionSheetOptionTextSelected,
                        ]}
                      >
                        {statusOption}
                      </Text>
                    </View>
                    {isSelected && (
                      <Text style={{ color: "#0F766E", fontWeight: "700", fontSize: 14 }}>
                        ✓
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
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
  receiveButton: {
    backgroundColor: "#0F766E",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    cursor: "pointer",
  },
  receiveText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "700",
  },
  kpiRow: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },
  kpiRowCompact: {
    gap: 12,
  },
  cardContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "visible",
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
    backgroundColor: "#FAFAFA",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
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
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: "#0F172A",
    outlineStyle: "none",
  },
  clearBtn: {
    padding: 4,
  },
  clearBtnText: {
    fontSize: 12,
    color: "#94A3B8",
  },
  filterChipRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    cursor: "pointer",
  },
  filterChipActive: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748B",
  },
  filterChipTextActive: {
    fontWeight: "700",
    color: "#FFFFFF",
  },
  tableWrapper: {
    minWidth: 1100,
    paddingHorizontal: 8,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  thCell: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#64748B",
    paddingHorizontal: 6,
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    position: "relative",
  },
  tableRowAlt: {
    backgroundColor: "#F8FAFC",
  },
  tdCell: {
    fontSize: 13,
    color: "#334155",
    paddingHorizontal: 6,
  },
  grnId: {
    fontWeight: "700",
    color: "#0F766E",
  },
  poRef: {
    fontWeight: "600",
    color: "#2563EB",
  },
  supplierText: {
    fontWeight: "600",
    color: "#0F172A",
  },
  statusWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  actionWrapper: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  threeDotsBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    cursor: "pointer",
  },
  threeDotsText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#64748B",
  },
  menuPopover: {
    position: "absolute",
    right: 0,
    top: 36,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    zIndex: 1000,
    width: 170,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    ...Platform.select({
      web: {
        boxShadow:
          "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
      },
    }),
  },
  menuHeaderTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    paddingHorizontal: 12,
    paddingVertical: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
    cursor: "pointer",
  },
  menuDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  menuItemText: {
    fontSize: 12.5,
    fontWeight: "500",
    color: "#334155",
  },
  menuItemTextActive: {
    fontWeight: "700",
    color: "#0F172A",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 680,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow:
          "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
      },
    }),
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 14,
    color: "#94A3B8",
    fontWeight: "700",
  },
  modalBody: {
    padding: 22,
    maxHeight: 520,
  },
  formRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 14,
  },
  formFieldHalf: {
    flex: 1,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 6,
  },
  reqStar: {
    color: "#DC2626",
  },
  modalInput: {
    height: 40,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    fontSize: 13,
    color: "#0F172A",
    outlineStyle: "none",
  },
  errorText: {
    fontSize: 11,
    color: "#DC2626",
    marginTop: 3,
    fontWeight: "500",
  },
  textArea: {
    height: 70,
    paddingTop: 8,
  },
  itemsSection: {
    marginVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 14,
  },
  itemsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  itemsSectionTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#0F172A",
  },
  addItemBtn: {
    backgroundColor: "#0F766E",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    cursor: "pointer",
  },
  addItemBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  itemRowCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: 12,
  },
  itemRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  itemRowNumber: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  removeItemBtn: {
    padding: 4,
    cursor: "pointer",
  },
  removeItemText: {
    color: "#DC2626",
    fontSize: 11.5,
    fontWeight: "600",
  },
  productSelectRow: {
    gap: 6,
  },
  quickProdChips: {
    flexDirection: "row",
    marginTop: 4,
  },
  quickProdChip: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    cursor: "pointer",
  },
  quickProdChipActive: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  quickProdChipText: {
    fontSize: 11,
    color: "#334155",
  },
  quickProdChipTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  modalFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    backgroundColor: "#FAFAFA",
  },
  cancelButton: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 6,
    cursor: "pointer",
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  submitModalButton: {
    backgroundColor: "#0F766E",
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 8,
    cursor: "pointer",
  },
  submitModalButtonText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  // Mobile GRN KPI Cards
  mobileCardsList: {
    padding: 12,
    gap: 12,
  },
  mobileGrnCard: {
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
  mobileCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  menuPopoverMobile: {
    right: 0,
    top: 30,
    width: 170,
  },
  mobileSupplierName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 12,
  },
  mobileDetailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  mobileDetailItem: {
    minWidth: "46%",
    flex: 1,
  },
  mobileDetailLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  mobileDetailVal: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#334155",
  },
  mobileCardFooter: {
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 8,
  },
  mobileReceivedByText: {
    fontSize: 11.5,
    color: "#64748B",
  },
  actionSheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "flex-end",
    alignItems: "center",
    zIndex: 99999,
  },
  actionSheetCard: {
    width: "100%",
    maxWidth: 500,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    ...Platform.select({
      web: {
        boxShadow: "0 -10px 25px -5px rgba(0, 0, 0, 0.2)",
      },
      default: {
        elevation: 20,
      },
    }),
  },
  actionSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingBottom: 14,
    marginBottom: 12,
  },
  actionSheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  actionSheetSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    fontWeight: "500",
  },
  actionSheetCloseBtn: {
    padding: 6,
    backgroundColor: "#F1F5F9",
    borderRadius: 20,
  },
  actionSheetCloseText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "700",
  },
  actionSheetBody: {
    gap: 8,
  },
  actionSheetOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  actionSheetOptionSelected: {
    backgroundColor: "#F0FDFA",
    borderColor: "#0F766E",
  },
  actionSheetOptionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  actionSheetOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },
  actionSheetOptionTextSelected: {
    color: "#0F766E",
    fontWeight: "700",
  },
});
