import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import {
  fetchPurchases,
  createPurchaseOrder,
  updatePurchaseStatus,
} from "../../api/purchaseApi";


// ============================================================
// HELPERS
// ============================================================

const formatCurrency = (value) => {
  const num = Number(value) || 0;

  return `₹${num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};


// ------------------------------------------------------------
// Normalize a purchase order coming from backend
// ------------------------------------------------------------

const normalizePurchaseOrder = (po = {}) => {
  /*
   * IMPORTANT:
   *
   * Backend currently returns something like:
   *
   * {
   *   id: "PO-2026-008",
   *   itemsCount: 2,
   *   supplier: "Lupin Generics India",
   *   amount: "₹15,070.00"
   * }
   *
   * There is NO medicine/product/items field.
   *
   * So we keep the original data and safely look for product
   * information if it exists under another possible property.
   */

  const rawItems = Array.isArray(po.items)
    ? po.items
    : Array.isArray(po.products)
      ? po.products
      : Array.isArray(po.orderItems)
        ? po.orderItems
        : [];

  const normalizedItems = rawItems
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const medicineName =
        item.medicineName ||
        item.productName ||
        item.medicine ||
        item.name ||
        item.title ||
        item.itemName ||
        "";

      const quantity =
        item.orderedQuantity ??
        item.quantity ??
        item.qty ??
        item.orderQuantity ??
        null;

      const unitCost =
        item.unitCost ??
        item.unitPrice ??
        item.purchaseCost ??
        item.cost ??
        null;

      return {
        ...item,
        medicineName,
        quantity,
        unitCost,
      };
    })
    .filter(Boolean);

  /*
   * Some frontend-created POs already contain `medicine`
   * directly instead of `items`.
   *
   * Convert that into the same normalized structure.
   */
  if (
    normalizedItems.length === 0 &&
    po.medicine &&
    typeof po.medicine === "string"
  ) {
    normalizedItems.push({
      medicineName: po.medicine,
      quantity: po.itemsCount ?? null,
      unitCost: po.unitPrice ?? null,
    });
  }

  return {
    ...po,

    // Keep a consistent ID
    id: po.id || po.poNumber || po.purchaseNumber || po.purchase_number,

    poNumber:
      po.poNumber ||
      po.purchaseNumber ||
      po.purchase_number ||
      po.id ||
      "N/A",

    // Keep original medicine if available
    medicine:
      po.medicine ||
      po.medicineName ||
      po.productName ||
      po.product ||
      "",

    // Normalized items
    items: normalizedItems,

    // Keep item count
    itemsCount:
      po.itemsCount ??
      (normalizedItems.length > 0 ? normalizedItems.length : 0),

    supplier:
      po.supplier ||
      po.supplierName ||
      "Unknown Supplier",

    branch:
      po.branch ||
      po.branchName ||
      "Main Branch",

    status:
      po.status ||
      po.rawStatus ||
      "Unknown",

    rawStatus:
      po.rawStatus ||
      po.status ||
      "",

    amount:
      po.amount ||
      formatCurrency(po.numericAmount || po.totalAmount || 0),

    numericAmount:
      typeof po.numericAmount === "number"
        ? po.numericAmount
        : Number(
            String(
              po.numericAmount ||
              po.totalAmount ||
              po.amount ||
              "0"
            ).replace(/[^0-9.-]/g, "")
          ) || 0,
  };
};


// ============================================================
// COMPONENT
// ============================================================

const PurchasesScreen = ({
  selectedBranch,
  onNavigate,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");

  const [statusFilter, setStatusFilter] = useState("All");

  const [showCreateModal, setShowCreateModal] = useState(false);

  const [showActionModal, setShowActionModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // ==========================================================
  // CREATE PO FORM
  // ==========================================================

  const [formData, setFormData] = useState({
    supplier: "",
    branch: "",
    medicine: "",
    quantity: "",
    unitCost: "",
    expectedDate: "",
    notes: "",

    isCustomerOrder: false,
    customerName: "",
    customerPhone: "",
    prescriptionRef: "",
  });

  const [taxRate, setTaxRate] = useState("0");

  // ==========================================================
  // LOAD PURCHASES
  // ==========================================================

  const loadPurchasesData = async () => {
    try {
      setLoading(true);

      const rawBranch =
        typeof selectedBranch === "object" &&
        selectedBranch !== null
          ? selectedBranch.id
          : selectedBranch;

      const branchParam =
        rawBranch &&
        rawBranch !== "All Branches" &&
        rawBranch !== "all" &&
        rawBranch !== "No Active Branch"
          ? rawBranch
          : undefined;

      const res = await fetchPurchases({
        branchId: branchParam,
      });

      console.log("========================================");
      console.log("PURCHASE API RESPONSE");
      console.log("========================================");
      console.log(res);

      const backendData =
        res &&
        res.data &&
        Array.isArray(res.data.data)
          ? res.data.data
          : [];

      console.log("BACKEND PURCHASE DATA:", backendData);

      /*
       * Normalize every backend record.
       *
       * This is the important frontend fix.
       */
      const normalizedData = backendData.map(
        normalizePurchaseOrder
      );

      console.log(
        "NORMALIZED PURCHASE DATA:",
        normalizedData
      );

      setOrders(normalizedData);
    } catch (err) {
      console.warn(
        "Failed to fetch purchases from DB:",
        err?.message || err
      );

      setOrders([]);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    loadPurchasesData();
  }, [selectedBranch]);


  // ==========================================================
  // SEARCH + FILTER
  // ==========================================================

  const filteredOrders = useMemo(() => {
    const q = String(searchQuery || "")
      .trim()
      .toLowerCase();

    return orders.filter((po) => {
      // ------------------------------------------
      // Search
      // ------------------------------------------

      const medicineText = [
        po.medicine,
        ...(po.items || []).map(
          (item) => item.medicineName
        ),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !q ||
        String(po.id || "")
          .toLowerCase()
          .includes(q) ||
        String(po.poNumber || "")
          .toLowerCase()
          .includes(q) ||
        String(po.supplier || "")
          .toLowerCase()
          .includes(q) ||
        String(po.branch || "")
          .toLowerCase()
          .includes(q) ||
        String(po.customerName || "")
          .toLowerCase()
          .includes(q) ||
        medicineText.includes(q);

      if (!matchesSearch) {
        return false;
      }

      // ------------------------------------------
      // Status filter
      // ------------------------------------------

      if (
        statusFilter &&
        statusFilter !== "All"
      ) {
        const currentStatus = String(
          po.status || ""
        ).toLowerCase();

        if (
          currentStatus !==
          statusFilter.toLowerCase()
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    orders,
    searchQuery,
    statusFilter,
  ]);


  // ==========================================================
  // TOTAL
  // ==========================================================

  const totalPurchasesSum = useMemo(() => {
    return orders.reduce((sum, po) => {
      const value =
        typeof po.numericAmount === "number"
          ? po.numericAmount
          : parseFloat(
              String(po.amount || "0")
                .replace(/[^0-9.]/g, "")
            ) || 0;

      return sum + value;
    }, 0);
  }, [orders]);


  // ==========================================================
  // STATUS COUNTS
  // ==========================================================

  const statusCounts = useMemo(() => {
    return {
      all: orders.length,

      draft: orders.filter(
        (po) =>
          String(po.status).toLowerCase() ===
          "draft"
      ).length,

      pending: orders.filter(
        (po) =>
          String(po.status).toLowerCase() ===
          "pending"
      ).length,

      approved: orders.filter(
        (po) =>
          String(po.status).toLowerCase() ===
          "approved"
      ).length,

      received: orders.filter(
        (po) =>
          String(po.status).toLowerCase() ===
          "received"
      ).length,
    };
  }, [orders]);


  // ==========================================================
  // CREATE PO
  // ==========================================================

  const handleCreatePO = async (
    isDraft = false
  ) => {
    try {
      if (!formData.supplier.trim()) {
        Alert.alert(
          "Validation",
          "Please enter supplier name."
        );
        return;
      }

      if (!formData.medicine.trim()) {
        Alert.alert(
          "Validation",
          "Please enter medicine/product name."
        );
        return;
      }

      const qtyNum =
        Number(formData.quantity) || 0;

      const unitCostNum =
        Number(formData.unitCost) || 0;

      const taxRateNum =
        Number(taxRate) || 0;

      const subtotalNum =
        qtyNum * unitCostNum;

      const taxAmountNum =
        (subtotalNum * taxRateNum) / 100;

      const grandTotalNum =
        subtotalNum + taxAmountNum;

      const poNum = `PO-${new Date().getFullYear()}-${String(
        orders.length + 1
      ).padStart(3, "0")}`;

      const payload = {
        purchaseNumber: poNum,

        supplierName:
          formData.supplier,

        branchName:
          formData.branch ||
          "Main Branch",

        expectedDate:
          formData.expectedDate ||
          "05 Sep 2026",

        notes:
          formData.notes || "",

        status:
          isDraft
            ? "DRAFT"
            : "PENDING",

        isCustomerOrder:
          formData.isCustomerOrder,

        customerName:
          formData.customerName.trim(),

        customerPhone:
          formData.customerPhone.trim(),

        prescriptionRef:
          formData.prescriptionRef.trim(),

        subtotal:
          subtotalNum,

        taxRate:
          `${taxRateNum}%`,

        taxAmount:
          taxAmountNum,

        totalAmount:
          grandTotalNum,

        items: [
          {
            medicineName:
              formData.medicine,

            brandName:
              formData.medicine,

            orderedQuantity:
              qtyNum,

            unitCost:
              unitCostNum,

            taxRate:
              taxRateNum,

            taxAmount:
              taxAmountNum,

            total:
              grandTotalNum,
          },
        ],
      };


      setIsSubmitting(true);

      const response =
        await createPurchaseOrder(payload);

      console.log(
        "CREATE PO RESPONSE:",
        response
      );

      const created =
        response?.data?.data ||
        response?.data ||
        response ||
        {};


      // --------------------------------------------------------
      // IMPORTANT:
      //
      // Backend may not return the complete item information.
      // Therefore we preserve the medicine from formData locally.
      // --------------------------------------------------------

      const newPO = normalizePurchaseOrder({
        id:
          created?.purchase_number ||
          created?.purchaseNumber ||
          poNum,

        dbId:
          created?.id,

        poNumber:
          created?.purchase_number ||
          created?.purchaseNumber ||
          poNum,

        supplier:
          formData.supplier,

        orderDate:
          new Date().toLocaleDateString(
            "en-GB",
            {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }
          ),

        expectedDate:
          formData.expectedDate ||
          "05 Sep 2026",

        amount:
          formatCurrency(
            grandTotalNum
          ),

        numericAmount:
          grandTotalNum,

        subtotal:
          subtotalNum,

        taxRate:
          `${taxRateNum}%`,

        taxAmount:
          taxAmountNum,

        unitPrice:
          unitCostNum,

        itemsCount:
          qtyNum,

        status:
          isDraft
            ? "Draft"
            : "Pending",

        rawStatus:
          isDraft
            ? "DRAFT"
            : "PENDING",

        branch:
          formData.branch ||
          "Main Branch",

        medicine:
          formData.medicine,

        items: [
          {
            medicineName:
              formData.medicine,

            orderedQuantity:
              qtyNum,

            quantity:
              qtyNum,

            unitCost:
              unitCostNum,
          },
        ],

        isCustomerOrder:
          formData.isCustomerOrder,

        customerName:
          formData.customerName.trim(),

        customerPhone:
          formData.customerPhone.trim(),

        prescriptionRef:
          formData.prescriptionRef.trim(),

        notes:
          formData.notes,

        createdBy:
          "Manager",
      });


      setOrders((prev) => [
        newPO,
        ...prev,
      ]);

      setShowCreateModal(false);

      resetForm();

      Alert.alert(
        "Success",
        isDraft
          ? "Purchase order saved as draft."
          : "Purchase order created successfully."
      );
    } catch (error) {
      console.error(
        "Create purchase order error:",
        error
      );

      Alert.alert(
        "Error",
        error?.message ||
          "Failed to create purchase order."
      );
    } finally {
      setIsSubmitting(false);
    }
  };


  // ==========================================================
  // RESET FORM
  // ==========================================================

  const resetForm = () => {
    setFormData({
      supplier: "",
      branch: "",
      medicine: "",
      quantity: "",
      unitCost: "",
      expectedDate: "",
      notes: "",

      isCustomerOrder: false,
      customerName: "",
      customerPhone: "",
      prescriptionRef: "",
    });

    setTaxRate("0");
  };


  // ==========================================================
  // ACTION MODAL
  // ==========================================================

  const openActionModal = (po) => {
    setSelectedOrder(po);
    setShowActionModal(true);
  };


  // ==========================================================
  // UPDATE PO STATUS
  // ==========================================================

  const handleExecutePoAction = async (
    action
  ) => {
    if (!selectedOrder) {
      return;
    }

    try {
      setIsSubmitting(true);

      const targetDbId =
        selectedOrder.dbId ||
        selectedOrder.id;

      let newStatus = null;

      switch (action) {
        case "approve":
          newStatus = "APPROVED";
          break;

        case "reject":
          newStatus = "REJECTED";
          break;

        case "receive":
          newStatus = "RECEIVED";
          break;

        case "cancel":
          newStatus = "CANCELLED";
          break;

        default:
          break;
      }

      if (!newStatus) {
        return;
      }

      await updatePurchaseStatus(
        targetDbId,
        newStatus
      );

      setOrders((prev) =>
        prev.map((po) => {
          if (
            po.dbId ===
              selectedOrder.dbId ||
            po.id === selectedOrder.id
          ) {
            return {
              ...po,

              status:
                newStatus
                  .charAt(0)
                  .toUpperCase() +
                newStatus
                  .slice(1)
                  .toLowerCase(),

              rawStatus:
                newStatus,
            };
          }

          return po;
        })
      );

      setShowActionModal(false);
      setSelectedOrder(null);

      Alert.alert(
        "Success",
        `Purchase order updated to ${newStatus}.`
      );
    } catch (error) {
      console.error(
        "Update purchase status error:",
        error
      );

      Alert.alert(
        "Error",
        error?.message ||
          "Failed to update purchase order."
      );
    } finally {
      setIsSubmitting(false);
    }
  };


  // ==========================================================
  // PRODUCT DISPLAY
  // ==========================================================

  const renderProductDetails = (
    po,
    compact = false
  ) => {
    /*
     * Priority:
     *
     * 1. po.items
     * 2. po.medicine
     * 3. no product information
     *
     * This prevents the UI from assuming that backend
     * always sends a product field.
     */

    if (
      Array.isArray(po.items) &&
      po.items.length > 0
    ) {
      return (
        <View
          style={
            compact
              ? styles.mobileProductContainer
              : styles.productContainer
          }
        >
          {po.items.map(
            (item, index) => (
              <View
                key={`${po.id}-item-${index}`}
                style={
                  styles.productItem
                }
              >
                <Text
                  style={
                    styles.productName
                  }
                  numberOfLines={2}
                >
                  {item.medicineName ||
                    item.productName ||
                    item.name ||
                    item.title ||
                    "Unknown Product"}
                </Text>

                {item.quantity != null && (
                  <Text
                    style={
                      styles.productMeta
                    }
                  >
                    Qty: {item.quantity}
                  </Text>
                )}
              </View>
            )
          )}
        </View>
      );
    }


    if (po.medicine) {
      return (
        <View
          style={
            compact
              ? styles.mobileProductContainer
              : styles.productContainer
          }
        >
          <Text
            style={styles.productName}
            numberOfLines={2}
          >
            {po.medicine}
          </Text>

          {po.itemsCount != null && (
            <Text
              style={styles.productMeta}
            >
              Qty: {po.itemsCount}
            </Text>
          )}
        </View>
      );
    }


    /*
     * Current backend response reaches here.
     *
     * It contains itemsCount but no product name.
     */

    return (
      <View
        style={
          compact
            ? styles.mobileProductContainer
            : styles.productContainer
        }
      >
        <Text
          style={
            styles.productUnavailable
          }
          numberOfLines={2}
        >
          Product details unavailable
        </Text>

        {po.itemsCount != null && (
          <Text
            style={styles.productMeta}
          >
            {po.itemsCount} item
            {Number(po.itemsCount) === 1
              ? ""
              : "s"}
          </Text>
        )}
      </View>
    );
  };


  // ==========================================================
  // STATUS BADGE
  // ==========================================================

  const renderStatus = (status) => {
    const normalized =
      String(status || "")
        .toLowerCase();

    let background =
      "#F8F5F7";

    let color =
      "#77717A";

    if (
      normalized === "draft"
    ) {
      background = "#F7F0E5";
      color = "#C49752";
    }

    if (
      normalized === "pending"
    ) {
      background = "#E8D5DD";
      color = "#A66D86";
    }

    if (
      normalized === "approved"
    ) {
      background = "#EAF2EE";
      color = "#4F8A72";
    }

    if (
      normalized === "received"
    ) {
      background = "#EAF2EE";
      color = "#4F8A72";
    }

    if (
      normalized === "rejected" ||
      normalized === "cancelled"
    ) {
      background = "#F7EDEE";
      color = "#B85C64";
    }

    return (
      <View
        style={[
          styles.statusBadge,
          {
            backgroundColor:
              background,
          },
        ]}
      >
        <Text
          style={[
            styles.statusText,
            {
              color,
            },
          ]}
        >
          {status || "Unknown"}
        </Text>
      </View>
    );
  };


  // ==========================================================
  // DESKTOP TABLE
  // ==========================================================

  const renderDesktopTable = () => {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
      >
        <View
          style={[
            styles.table,
            {
              minWidth: 1450,
            },
          ]}
        >
          {/* HEADER */}

          <View
            style={styles.tableHeader}
          >
            <Text
              style={[
                styles.thCell,
                { width: 130 },
              ]}
            >
              PO NUMBER
            </Text>

            <Text
              style={[
                styles.thCell,
                { width: 190 },
              ]}
            >
              SUPPLIER
            </Text>

            <Text
              style={[
                styles.thCell,
                { width: 240 },
              ]}
            >
              PRODUCT / MEDICINE
            </Text>

            <Text
              style={[
                styles.thCell,
                { width: 150 },
              ]}
            >
              ORDERED FOR
            </Text>

            <Text
              style={[
                styles.thCell,
                { width: 120 },
              ]}
            >
              ORDER DATE
            </Text>

            <Text
              style={[
                styles.thCell,
                { width: 120 },
              ]}
            >
              EXPECTED
            </Text>

            <Text
              style={[
                styles.thCell,
                { width: 130 },
              ]}
            >
              AMOUNT
            </Text>

            <Text
              style={[
                styles.thCell,
                { width: 80 },
              ]}
            >
              ITEMS
            </Text>

            <Text
              style={[
                styles.thCell,
                { width: 200 },
              ]}
            >
              BRANCH
            </Text>

            <Text
              style={[
                styles.thCell,
                { width: 120 },
              ]}
            >
              STATUS
            </Text>

            <Text
              style={[
                styles.thCell,
                { width: 100 },
              ]}
            >
              ACTION
            </Text>
          </View>


          {/* ROWS */}

          {filteredOrders.map(
            (po, index) => (
              <View
                key={
                  po.dbId ||
                  po.id ||
                  index
                }
                style={[
                  styles.tableRow,
                  index % 2 === 1 &&
                    styles.tableRowAlt,
                ]}
              >
                {/* PO NUMBER */}

                <View
                  style={{
                    width: 130,
                  }}
                >
                  <Text
                    style={
                      styles.tdPrimary
                    }
                    numberOfLines={1}
                  >
                    {po.id}
                  </Text>
                </View>


                {/* SUPPLIER */}

                <View
                  style={{
                    width: 190,
                  }}
                >
                  <Text
                    style={
                      styles.tdPrimary
                    }
                    numberOfLines={2}
                  >
                    {po.supplier}
                  </Text>
                </View>


                {/* PRODUCT */}

                {renderProductDetails(
                  po
                )}


                {/* ORDERED FOR */}

                <View
                  style={{
                    width: 150,
                  }}
                >
                  {po.isCustomerOrder ||
                  po.customerName ? (
                    <>
                      <Text
                        style={
                          styles.tdPrimary
                        }
                        numberOfLines={1}
                      >
                        {po.customerName ||
                          "Customer"}
                      </Text>

                      {po.customerPhone ? (
                        <Text
                          style={
                            styles.tdSecondary
                          }
                        >
                          {
                            po.customerPhone
                          }
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <Text
                      style={
                        styles.tdPrimary
                      }
                    >
                      General Stock
                    </Text>
                  )}
                </View>


                {/* ORDER DATE */}

                <Text
                  style={[
                    styles.tdSecondary,
                    { width: 120 },
                  ]}
                  numberOfLines={1}
                >
                  {po.orderDate ||
                    "-"}
                </Text>


                {/* EXPECTED */}

                <Text
                  style={[
                    styles.tdSecondary,
                    { width: 120 },
                  ]}
                  numberOfLines={1}
                >
                  {po.expectedDate ||
                    "-"}
                </Text>


                {/* AMOUNT */}

                <Text
                  style={[
                    styles.tdPrimary,
                    { width: 130 },
                  ]}
                >
                  {po.amount}
                </Text>


                {/* ITEMS */}

                <Text
                  style={[
                    styles.tdPrimary,
                    {
                      width: 80,
                      textAlign: "center",
                    },
                  ]}
                >
                  {po.itemsCount ??
                    0}
                </Text>


                {/* BRANCH */}

                <Text
                  style={[
                    styles.tdSecondary,
                    { width: 200 },
                  ]}
                  numberOfLines={2}
                >
                  {po.branch ||
                    "-"}
                </Text>


                {/* STATUS */}

                <View
                  style={{
                    width: 120,
                  }}
                >
                  {renderStatus(
                    po.status
                  )}
                </View>


                {/* ACTION */}

                <View
                  style={{
                    width: 100,
                    alignItems:
                      "center",
                  }}
                >
                  <TouchableOpacity
                    style={
                      styles.actionButton
                    }
                    onPress={() =>
                      openActionModal(
                        po
                      )
                    }
                  >
                    <Text
                      style={
                        styles.actionButtonText
                      }
                    >
                      Action
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          )}


          {/* EMPTY */}

          {!loading &&
            filteredOrders.length ===
              0 && (
              <View
                style={
                  styles.emptyState
                }
              >
                <Text
                  style={
                    styles.emptyTitle
                  }
                >
                  No purchase orders found
                </Text>

                <Text
                  style={
                    styles.emptySubtitle
                  }
                >
                  Try changing your search
                  or filters.
                </Text>
              </View>
            )}
        </View>
      </ScrollView>
    );
  };


  // ==========================================================
  // MOBILE CARD
  // ==========================================================

  const renderMobileCards = () => {
    return (
      <View>
        {filteredOrders.map(
          (po, index) => (
            <View
              key={
                po.dbId ||
                po.id ||
                index
              }
              style={
                styles.mobileCard
              }
            >
              {/* TOP */}

              <View
                style={
                  styles.mobileCardTop
                }
              >
                <View
                  style={{
                    flex: 1,
                  }}
                >
                  <Text
                    style={
                      styles.mobilePoNumber
                    }
                  >
                    {po.id}
                  </Text>

                  <Text
                    style={
                      styles.mobileSupplier
                    }
                  >
                    {po.supplier}
                  </Text>
                </View>

                {renderStatus(
                  po.status
                )}
              </View>


              {/* PRODUCT */}

              <View
                style={
                  styles.mobileSection
                }
              >
                <Text
                  style={
                    styles.mobileLabel
                  }
                >
                  PRODUCT / MEDICINE
                </Text>

                {renderProductDetails(
                  po,
                  true
                )}
              </View>


              {/* DATES */}

              <View
                style={
                  styles.mobileInfoRow
                }
              >
                <View
                  style={
                    styles.mobileInfoBlock
                  }
                >
                  <Text
                    style={
                      styles.mobileLabel
                    }
                  >
                    ORDER DATE
                  </Text>

                  <Text
                    style={
                      styles.mobileValue
                    }
                  >
                    {po.orderDate ||
                      "-"}
                  </Text>
                </View>

                <View
                  style={
                    styles.mobileInfoBlock
                  }
                >
                  <Text
                    style={
                      styles.mobileLabel
                    }
                  >
                    EXPECTED
                  </Text>

                  <Text
                    style={
                      styles.mobileValue
                    }
                  >
                    {po.expectedDate ||
                      "-"}
                  </Text>
                </View>
              </View>


              {/* AMOUNT / ITEMS */}

              <View
                style={
                  styles.mobileInfoRow
                }
              >
                <View
                  style={
                    styles.mobileInfoBlock
                  }
                >
                  <Text
                    style={
                      styles.mobileLabel
                    }
                  >
                    AMOUNT
                  </Text>

                  <Text
                    style={
                      styles.mobileAmount
                    }
                  >
                    {po.amount}
                  </Text>
                </View>

                <View
                  style={
                    styles.mobileInfoBlock
                  }
                >
                  <Text
                    style={
                      styles.mobileLabel
                    }
                  >
                    ITEMS
                  </Text>

                  <Text
                    style={
                      styles.mobileValue
                    }
                  >
                    {po.itemsCount ??
                      0}
                  </Text>
                </View>
              </View>


              {/* BRANCH */}

              <View
                style={
                  styles.mobileSection
                }
              >
                <Text
                  style={
                    styles.mobileLabel
                  }
                >
                  BRANCH
                </Text>

                <Text
                  style={
                    styles.mobileValue
                  }
                >
                  {po.branch ||
                    "-"}
                </Text>
              </View>


              {/* ACTION */}

              <TouchableOpacity
                style={
                  styles.mobileActionButton
                }
                onPress={() =>
                  openActionModal(
                    po
                  )
                }
              >
                <Text
                  style={
                    styles.mobileActionButtonText
                  }
                >
                  Manage Purchase Order
                </Text>
              </TouchableOpacity>
            </View>
          )
        )}


        {!loading &&
          filteredOrders.length ===
            0 && (
            <View
              style={
                styles.emptyState
              }
            >
              <Text
                style={
                  styles.emptyTitle
                }
              >
                No purchase orders found
              </Text>

              <Text
                style={
                  styles.emptySubtitle
                }
              >
                Try changing your search
                or filters.
              </Text>
            </View>
          )}
      </View>
    );
  };


  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <View style={styles.container}>
      {/* ======================================================
          HEADER
      ====================================================== */}

      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={isMobile && styles.headerTitleMobile}>
          <Text
            style={
              styles.pageTitle
            }
          >
            Purchase Orders
          </Text>

          <Text
            style={
              styles.pageSubtitle
            }
          >
            Manage purchase orders and
            supplier stock requests
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.createButton, isMobile && styles.createButtonMobile]}
          onPress={() =>
            setShowCreateModal(true)
          }
        >
          <Text
            style={
              styles.createButtonText
            }
          >
            + Create Purchase Order
          </Text>
        </TouchableOpacity>
      </View>


      {/* ======================================================
          SUMMARY
      ====================================================== */}

      <View
        style={[
          styles.summaryContainer,
          isMobile && styles.summaryContainerMobile,
        ]}
      >
        <View
          style={[styles.summaryCard, isMobile && styles.summaryCardMobile]}
        >
          <Text
            style={
              styles.summaryLabel
            }
          >
            TOTAL PURCHASES
          </Text>

          <Text
            style={
              [styles.summaryValue, isMobile && styles.summaryValueMobile]
            }
          >
            {formatCurrency(
              totalPurchasesSum
            )}
          </Text>
        </View>

        <View
          style={[styles.summaryCard, isMobile && styles.summaryCardMobile]}
        >
          <Text
            style={
              styles.summaryLabel
            }
          >
            TOTAL ORDERS
          </Text>

          <Text
            style={
              [styles.summaryValue, isMobile && styles.summaryValueMobile]
            }
          >
            {statusCounts.all}
          </Text>
        </View>

        <View
          style={[styles.summaryCard, isMobile && styles.summaryCardMobile]}
        >
          <Text
            style={
              styles.summaryLabel
            }
          >
            DRAFT
          </Text>

          <Text
            style={
              [styles.summaryValue, isMobile && styles.summaryValueMobile]
            }
          >
            {statusCounts.draft}
          </Text>
        </View>

        <View
          style={[styles.summaryCard, isMobile && styles.summaryCardMobile]}
        >
          <Text
            style={
              styles.summaryLabel
            }
          >
            PENDING
          </Text>

          <Text
            style={
              [styles.summaryValue, isMobile && styles.summaryValueMobile]
            }
          >
            {statusCounts.pending}
          </Text>
        </View>
      </View>


      {/* ======================================================
          FILTERS
      ====================================================== */}

      <View style={[styles.filterContainer, isMobile && styles.filterContainerMobile]}>
        <TextInput
          value={searchQuery}
          onChangeText={
            setSearchQuery
          }
          placeholder="Search PO, supplier, medicine..."
          placeholderTextColor="#77717A"
          style={[styles.searchInput, isMobile && styles.searchInputMobile]}
        />

        <View
          style={
            styles.statusFilters
          }
        >
          {[
            "All",
            "Draft",
            "Pending",
            "Approved",
            "Received",
          ].map((status) => (
            <TouchableOpacity
              key={status}
              onPress={() =>
                setStatusFilter(
                  status
                )
              }
              style={[
                styles.filterButton,
                statusFilter ===
                  status &&
                  styles.filterButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  statusFilter ===
                    status &&
                    styles.filterButtonTextActive,
                ]}
              >
                {status}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>


      {/* ======================================================
          LOADING
      ====================================================== */}

      {loading ? (
        <View
          style={
            styles.loadingContainer
          }
        >
          <ActivityIndicator
            size="large"
          />

          <Text
            style={
              styles.loadingText
            }
          >
            Loading purchase orders...
          </Text>
        </View>
      ) : (
        <View
          style={
            [styles.listContainer, isMobile && styles.listContainerMobile]
          }
        >
          {Platform.OS === "web"
            ? renderDesktopTable()
            : renderMobileCards()}
        </View>
      )}


      {/* ======================================================
          CREATE MODAL
      ====================================================== */}

      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setShowCreateModal(false)
        }
      >
        <View
          style={
            styles.modalOverlay
          }
        >
          <View
            style={
              styles.modalContainer
            }
          >
            <ScrollView>
              <Text
                style={
                  styles.modalTitle
                }
              >
                Create Purchase Order
              </Text>


              <Text
                style={
                  styles.inputLabel
                }
              >
                Supplier
              </Text>

              <TextInput
                value={
                  formData.supplier
                }
                onChangeText={(text) =>
                  setFormData((prev) => ({
                    ...prev,
                    supplier: text,
                  }))
                }
                style={
                  styles.input
                }
                placeholder="Supplier name"
                placeholderTextColor="#77717A"
              />


              <Text
                style={
                  styles.inputLabel
                }
              >
                Branch
              </Text>

              <TextInput
                value={
                  formData.branch
                }
                onChangeText={(text) =>
                  setFormData((prev) => ({
                    ...prev,
                    branch: text,
                  }))
                }
                style={
                  styles.input
                }
                placeholder="Branch"
                placeholderTextColor="#77717A"
              />


              <Text
                style={
                  styles.inputLabel
                }
              >
                Medicine / Product
              </Text>

              <TextInput
                value={
                  formData.medicine
                }
                onChangeText={(text) =>
                  setFormData((prev) => ({
                    ...prev,
                    medicine: text,
                  }))
                }
                style={
                  styles.input
                }
                placeholder="Medicine / product name"
                placeholderTextColor="#77717A"
              />


              <View
                style={
                  styles.formRow
                }
              >
                <View
                  style={
                    styles.formHalf
                  }
                >
                  <Text
                    style={
                      styles.inputLabel
                    }
                  >
                    Quantity
                  </Text>

                  <TextInput
                    value={
                      formData.quantity
                    }
                    onChangeText={(text) =>
                      setFormData(
                        (prev) => ({
                          ...prev,
                          quantity:
                            text,
                        })
                      )
                    }
                    style={
                      styles.input
                    }
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#77717A"
                  />
                </View>

                <View
                  style={
                    styles.formHalf
                  }
                >
                  <Text
                    style={
                      styles.inputLabel
                    }
                  >
                    Unit Cost
                  </Text>

                  <TextInput
                    value={
                      formData.unitCost
                    }
                    onChangeText={(text) =>
                      setFormData(
                        (prev) => ({
                          ...prev,
                          unitCost:
                            text,
                        })
                      )
                    }
                    style={
                      styles.input
                    }
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#77717A"
                  />
                </View>
              </View>


              <Text
                style={
                  styles.inputLabel
                }
              >
                Tax Rate %
              </Text>

              <TextInput
                value={taxRate}
                onChangeText={
                  setTaxRate
                }
                style={
                  styles.input
                }
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#77717A"
              />


              <Text
                style={
                  styles.inputLabel
                }
              >
                Expected Date
              </Text>

              <TextInput
                value={
                  formData.expectedDate
                }
                onChangeText={(text) =>
                  setFormData((prev) => ({
                    ...prev,
                    expectedDate:
                      text,
                  }))
                }
                style={
                  styles.input
                }
                placeholder="05 Sep 2026"
                placeholderTextColor="#77717A"
              />


              <Text
                style={
                  styles.inputLabel
                }
              >
                Notes
              </Text>

              <TextInput
                value={
                  formData.notes
                }
                onChangeText={(text) =>
                  setFormData((prev) => ({
                    ...prev,
                    notes: text,
                  }))
                }
                style={[
                  styles.input,
                  {
                    minHeight: 90,
                    textAlignVertical:
                      "top",
                  },
                ]}
                multiline
                placeholder="Notes"
                placeholderTextColor="#77717A"
              />


              {/* BUTTONS */}

              <View
                style={
                  styles.modalButtonRow
                }
              >
                <TouchableOpacity
                  style={
                    styles.cancelButton
                  }
                  onPress={() => {
                    setShowCreateModal(
                      false
                    );
                    resetForm();
                  }}
                >
                  <Text
                    style={
                      styles.cancelButtonText
                    }
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>


                <TouchableOpacity
                  style={
                    styles.draftButton
                  }
                  disabled={
                    isSubmitting
                  }
                  onPress={() =>
                    handleCreatePO(
                      true
                    )
                  }
                >
                  <Text
                    style={
                      styles.buttonText
                    }
                  >
                    Save Draft
                  </Text>
                </TouchableOpacity>


                <TouchableOpacity
                  style={
                    styles.submitButton
                  }
                  disabled={
                    isSubmitting
                  }
                  onPress={() =>
                    handleCreatePO(
                      false
                    )
                  }
                >
                  <Text
                    style={
                      styles.buttonText
                    }
                  >
                    Create PO
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>


      {/* ======================================================
          ACTION MODAL
      ====================================================== */}

      <Modal
        visible={showActionModal}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setShowActionModal(
            false
          )
        }
      >
        <View
          style={
            styles.modalOverlay
          }
        >
          <View
            style={
              styles.actionModal
            }
          >
            <Text
              style={
                styles.modalTitle
              }
            >
              Purchase Order Action
            </Text>


            {selectedOrder && (
              <>
                <Text
                  style={
                    styles.actionPoNumber
                  }
                >
                  {selectedOrder.id}
                </Text>

                <Text
                  style={
                    styles.actionSupplier
                  }
                >
                  {selectedOrder.supplier}
                </Text>

                <View
                  style={
                    styles.actionProductBox
                  }
                >
                  <Text
                    style={
                      styles.mobileLabel
                    }
                  >
                    PRODUCT
                  </Text>

                  {renderProductDetails(
                    selectedOrder,
                    true
                  )}
                </View>


                <TouchableOpacity
                  style={
                    styles.actionModalButton
                  }
                  onPress={() =>
                    handleExecutePoAction(
                      "approve"
                    )
                  }
                >
                  <Text
                    style={
                      styles.actionModalButtonText
                    }
                  >
                    Approve
                  </Text>
                </TouchableOpacity>


                <TouchableOpacity
                  style={
                    styles.actionModalButton
                  }
                  onPress={() =>
                    handleExecutePoAction(
                      "receive"
                    )
                  }
                >
                  <Text
                    style={
                      styles.actionModalButtonText
                    }
                  >
                    Mark Received
                  </Text>
                </TouchableOpacity>


                <TouchableOpacity
                  style={[
                    styles.actionModalButton,
                    {
                      backgroundColor:
                        "#F7EDEE",
                    },
                  ]}
                  onPress={() =>
                    handleExecutePoAction(
                      "reject"
                    )
                  }
                >
                  <Text
                    style={[
                      styles.actionModalButtonText,
                      {
                        color:
                          "#B85C64",
                      },
                    ]}
                  >
                    Reject
                  </Text>
                </TouchableOpacity>


                <TouchableOpacity
                  style={
                    styles.cancelButton
                  }
                  onPress={() =>
                    setShowActionModal(
                      false
                    )
                  }
                >
                  <Text
                    style={
                      styles.cancelButtonText
                    }
                  >
                    Close
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};


// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F5F7",
  },

  header: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20,
  },
  headerMobile: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: "column",
    alignItems: "stretch",
    gap: 12,
  },
  headerTitleMobile: {
    minWidth: 0,
  },

  pageTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#28242B",
  },

  pageSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#77717A",
  },

  createButton: {
    backgroundColor: "#B9829A",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createButtonMobile: {
    width: "100%",
    alignItems: "center",
  },

  createButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },

  summaryContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    paddingHorizontal: 24,
    paddingBottom: 18,
  },
  summaryContainerMobile: {
    paddingHorizontal: 16,
    gap: 10,
  },

  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 10,
    padding: 16,
    minWidth: 180,
    flex: 1,
  },
  summaryCardMobile: {
    minWidth: "47%",
    maxWidth: "48.5%",
    padding: 12,
  },

  summaryLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#77717A",
    letterSpacing: 0.6,
  },

  summaryValue: {
    marginTop: 7,
    fontSize: 22,
    fontWeight: "800",
    color: "#28242B",
  },
  summaryValueMobile: {
    fontSize: 18,
  },

  filterContainer: {
    paddingHorizontal: 24,
    paddingBottom: 18,
    gap: 12,
  },
  filterContainerMobile: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 10,
  },

  searchInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 13,
    color: "#28242B",
  },
  searchInputMobile: {
    width: "100%",
  },

  statusFilters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  filterButton: {
    borderWidth: 1,
    borderColor: "#E5DFE4",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 7,
  },

  filterButtonActive: {
    backgroundColor: "#B9829A",
    borderColor: "#B9829A",
  },

  filterButtonText: {
    color: "#77717A",
    fontSize: 12,
    fontWeight: "600",
  },

  filterButtonTextActive: {
    color: "#FFFFFF",
  },

  listContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 30,
  },
  listContainerMobile: {
    paddingHorizontal: 12,
    paddingBottom: 20,
    minWidth: 0,
  },

  table: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 10,
    overflow: "hidden",
  },

  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    backgroundColor: "#F8F5F7",
    borderBottomWidth: 1,
    borderBottomColor: "#E5DFE4",
  },

  thCell: {
    paddingHorizontal: 8,
    fontSize: 10,
    fontWeight: "800",
    color: "#77717A",
  },

  tableRow: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 74,
    borderBottomWidth: 1,
    borderBottomColor: "#E5DFE4",
    paddingVertical: 10,
  },

  tableRowAlt: {
    backgroundColor: "#F8F5F7",
  },

  tdPrimary: {
    paddingHorizontal: 8,
    alignSelf: "center",
    fontSize: 12,
    fontWeight: "700",
    color: "#28242B",
  },

  tdSecondary: {
    paddingHorizontal: 8,
    alignSelf: "center",
    fontSize: 11.5,
    color: "#77717A",
  },

  productContainer: {
    width: 240,
    paddingHorizontal: 8,
    justifyContent: "center",
  },

  productItem: {
    marginBottom: 4,
  },

  productName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#28242B",
  },

  productMeta: {
    marginTop: 2,
    fontSize: 10.5,
    color: "#77717A",
  },

  productUnavailable: {
    fontSize: 11.5,
    fontStyle: "italic",
    color: "#77717A",
  },

  statusBadge: {
    alignSelf: "center",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },

  statusText: {
    fontSize: 10.5,
    fontWeight: "700",
  },

  actionButton: {
    backgroundColor: "#E8D5DD",
    borderWidth: 1,
    borderColor: "#E8D5DD",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
  },

  actionButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B9829A",
  },

  emptyState: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#28242B",
  },

  emptySubtitle: {
    marginTop: 5,
    fontSize: 12,
    color: "#77717A",
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: "#77717A",
  },

  // ==========================================================
  // MOBILE
  // ==========================================================

  mobileCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },

  mobileCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },

  mobilePoNumber: {
    fontSize: 15,
    fontWeight: "800",
    color: "#28242B",
  },

  mobileSupplier: {
    marginTop: 4,
    fontSize: 12,
    color: "#77717A",
  },

  mobileSection: {
    marginTop: 16,
  },

  mobileLabel: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#77717A",
    letterSpacing: 0.5,
  },

  mobileValue: {
    marginTop: 4,
    fontSize: 12.5,
    fontWeight: "600",
    color: "#28242B",
  },

  mobileAmount: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "800",
    color: "#28242B",
  },

  mobileProductContainer: {
    marginTop: 5,
  },

  mobileInfoRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 20,
  },

  mobileInfoBlock: {
    flex: 1,
  },

  mobileActionButton: {
    marginTop: 18,
    backgroundColor: "#B9829A",
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
  },

  mobileActionButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },

  // ==========================================================
  // MODALS
  // ==========================================================

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  modalContainer: {
    width: "100%",
    maxWidth: 650,
    maxHeight: "90%",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 22,
  },

  actionModal: {
    width: "100%",
    maxWidth: 430,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 22,
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#28242B",
    marginBottom: 20,
  },

  inputLabel: {
    marginBottom: 6,
    marginTop: 12,
    fontSize: 11,
    fontWeight: "700",
    color: "#77717A",
  },

  input: {
    borderWidth: 1,
    borderColor: "#E5DFE4",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: "#28242B",
    backgroundColor: "#FFFFFF",
  },

  formRow: {
    flexDirection: "row",
    gap: 12,
  },

  formHalf: {
    flex: 1,
  },

  modalButtonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 24,
    flexWrap: "wrap",
  },

  cancelButton: {
    borderWidth: 1,
    borderColor: "#E5DFE4",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: "center",
  },

  cancelButtonText: {
    color: "#77717A",
    fontSize: 12,
    fontWeight: "700",
  },

  draftButton: {
    backgroundColor: "#77717A",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  submitButton: {
    backgroundColor: "#B9829A",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  buttonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },

  actionPoNumber: {
    fontSize: 17,
    fontWeight: "800",
    color: "#28242B",
  },

  actionSupplier: {
    marginTop: 4,
    fontSize: 12,
    color: "#77717A",
  },

  actionProductBox: {
    marginTop: 18,
    padding: 12,
    backgroundColor: "#F8F5F7",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5DFE4",
  },

  actionModalButton: {
    marginTop: 10,
    backgroundColor: "#E8D5DD",
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
  },

  actionModalButtonText: {
    color: "#B9829A",
    fontSize: 12,
    fontWeight: "700",
  },
});


export default PurchasesScreen;