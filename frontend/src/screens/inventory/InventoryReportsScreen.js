import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';

import {
  SkeletonTableRow,
} from '../../components/common/SkeletonLoader';

import PaginationControls from '../../components/common/PaginationControls';
import { fetchInventory } from '../../services/inventoryApi';

// ============================================================
// COLORS
// ============================================================

const COLORS = {
  primary: '#B9829A',
  primaryHover: '#A66D86',
  primaryLight: '#E8D5DD',

  secondary: '#B9829A',
  secondaryLight: '#E8D5DD',

  success: '#4F8A72',
  successLight: '#EAF2EE',

  warning: '#C49752',
  warningLight: '#F7F0E5',

  danger: '#B85C64',
  dangerLight: '#F7EDEE',

  background: '#F8F5F7',
  surface: '#FFFFFF',
  surfaceHover: '#F8F5F7',

  textPrimary: '#28242B',
  textSecondary: '#77717A',
  textMuted: '#77717A',

  border: '#E5DFE4',
};

// ============================================================
// REPORT TYPES
// ============================================================

const REPORT_TYPES = [
  {
    id: 'stock_valuation',
    icon: '📊',
    title: 'Stock Valuation',
    description: 'Current stock value by product and category',
  },
  {
    id: 'low_stock',
    icon: '⚠️',
    title: 'Low Stock Report',
    description: 'Products below minimum stock levels',
  },
  {
    id: 'expiry',
    icon: '📅',
    title: 'Expiry Report',
    description: 'Products expiring within selected period',
  },
  {
    id: 'stock_ageing',
    icon: '⏳',
    title: 'Stock Ageing',
    description: 'Stock age analysis and slow-moving items',
  },
  {
    id: 'stock_movement',
    icon: '🔄',
    title: 'Stock Movement',
    description: 'Detailed movement history for selected period',
  },
  {
    id: 'product_wise',
    icon: '💊',
    title: 'Product-wise Stock',
    description: 'Current stock levels by product',
  },
  {
    id: 'branch_wise',
    icon: '🏢',
    title: 'Branch-wise Stock',
    description: 'Stock distribution across branches',
  },
];

// ============================================================
// FILTER OPTIONS
// ============================================================

const BRANCH_OPTIONS = [
  'All Branches',
  'Main Branch',
  'BR-02',
  'BR-03',
  'BR-04',
  'BR-05',
];

const CATEGORY_OPTIONS = [
  'All Categories',
  'Medicines',
  'Supplements',
  'Equipment',
  'Cosmetics',
];

// ============================================================
// HELPERS
// ============================================================

const formatCurrency = (value) => {
  const number = Number(value ?? 0);

  return `₹${number.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatInteger = (value) => {
  const number = Number(value ?? 0);

  return number.toLocaleString('en-IN');
};

const formatDate = (value) => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const getDaysUntilExpiry = (expiry) => {
  if (!expiry) {
    return null;
  }

  const expiryDate = new Date(expiry);

  if (Number.isNaN(expiryDate.getTime())) {
    return null;
  }

  const now = new Date();

  const difference =
    expiryDate.getTime() - now.getTime();

  return Math.ceil(
    difference / (1000 * 60 * 60 * 24),
  );
};

const getExpiryStatus = (expiry) => {
  const days = getDaysUntilExpiry(expiry);

  if (days === null) {
    return 'Unknown';
  }

  if (days < 0) {
    return 'Expired';
  }

  if (days <= 30) {
    return 'Expiring Soon';
  }

  if (days <= 90) {
    return 'Expiring in 90 Days';
  }

  return 'Safe';
};

// ============================================================
// COMPONENT
// ============================================================

export default function InventoryReportsScreen({
  navigation,
  route,
}) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [selectedReport, setSelectedReport] = useState(
    'stock_valuation',
  );

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [selectedBranch, setSelectedBranch] =
    useState('All Branches');

  const [selectedCategory, setSelectedCategory] =
    useState('All Categories');

  const [quickRange, setQuickRange] =
    useState('this_month');

  const [searchQuery, setSearchQuery] = useState('');
  const [inventorySummary, setInventorySummary] = useState(null);

  // ============================================================
  // BACKEND DATA
  // ============================================================

  const [inventoryData, setInventoryData] = useState([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState('');

  // ============================================================
  // PAGINATION
  // ============================================================

  const [currentPage, setCurrentPage] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useState(10);

  // ============================================================
  // DROPDOWNS
  // ============================================================

  const [showBranchDropdown, setShowBranchDropdown] =
    useState(false);

  const [showCategoryDropdown, setShowCategoryDropdown] =
    useState(false);

  // ============================================================
  // LOAD INVENTORY FROM EXISTING API
  // ============================================================

  const loadInventory = async () => {
    try {
      setLoading(true);
      setError('');

      console.log(
        '[InventoryReports] Fetching inventory...',
      );

      /*
       * Existing API:
       *
       * fetchInventory()
       *
       * inventoryApi.js:
       * GET /inventory
       */

      const response = await fetchInventory();

      console.log(
        '[InventoryReports] API response:',
        response,
      );

      /*
       * Expected backend response:
       *
       * {
       *   success: true,
       *   data: {
       *     items: [...]
       *   }
       * }
       */

      const items = Array.isArray(
        response?.items,
      )
        ? response.items
        : [];

      const summary = response?.summary ?? null;

      setInventorySummary(summary);

      console.log(
        '[InventoryReports] Items:',
        items,
      );

      console.log(
        '[InventoryReports] Item count:',
        items.length,
      );

      /*
       * Convert backend inventory structure into
       * the structure used by this report screen.
       */

      const mappedItems = items.map((item, index) => {
        const stock = Number(
          item?.stock ?? 0,
        );

        const costPrice = Number(
          item?.costPrice ?? 0,
        );

        const mrp = Number(
          item?.mrp ?? 0,
        );

        const valuationCost = Number(
          item?.valuationCost ??
          stock * costPrice,
        );

        const valuationMrp = Number(
          item?.valuationMrp ??
          stock * mrp,
        );

        const expiry =
          item?.expiry ??
          null;

        const backendStatus =
          item?.status;

        let status = backendStatus;

        if (!status) {
          if (stock <= 0) {
            status = 'Out of Stock';
          } else if (stock <= 5) {
            status = 'Low Stock';
          } else {
            status = 'In Stock';
          }
        }

        return {
          /*
           * Identity
           */
          productId:
            item?.productId ||
            `${item?.sku || 'item'}-${index}`,

          /*
           * Product information
           */
          product:
            item?.name ||
            'Unknown Product',

          name:
            item?.name ||
            'Unknown Product',

          sku:
            item?.sku ||
            '—',

          batch:
            item?.batch ||
            '—',

          /*
           * Stock
           */
          stock,

          qty: stock,

          /*
           * Pricing
           */
          costPrice,

          mrp,

          /*
           * Valuation
           */
          valuationCost,

          valuationMrp,

          /*
           * Status
           */
          status,

          /*
           * Expiry
           */
          expiry,

          expiryStatus:
            getExpiryStatus(expiry),

          /*
           * Current inventory API does not
           * provide these fields.
           */
          category:
            item?.category ??
            item?.categoryName ??
            '',

          branch:
            item?.branch ??
            item?.branchName ??
            '',
        };
      });

      console.log(
        '[InventoryReports] Mapped items:',
        mappedItems,
      );

      setInventoryData(mappedItems);
      setCurrentPage(1);
    } catch (err) {
      console.error(
        '[InventoryReports] Failed to fetch inventory:',
        err,
      );

      setInventoryData([]);

      setError(
        err?.message ||
        'Unable to load inventory data',
      );
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // INITIAL LOAD
  // ============================================================

  useEffect(() => {
    loadInventory();
  }, []);

  // ============================================================
  // CURRENT REPORT
  // ============================================================

  const currentReport = useMemo(() => {
    return REPORT_TYPES.find(
      (report) =>
        report.id === selectedReport,
    );
  }, [selectedReport]);

  // ============================================================
  // FILTER DATA
  // ============================================================

  const filteredData = useMemo(() => {
    const query = String(
      searchQuery || '',
    )
      .trim()
      .toLowerCase();

    return inventoryData.filter((item) => {
      // --------------------------------------------------------
      // SEARCH
      // --------------------------------------------------------

      const matchesSearch =
        !query ||
        String(item?.product || '')
          .toLowerCase()
          .includes(query) ||
        String(item?.sku || '')
          .toLowerCase()
          .includes(query) ||
        String(item?.batch || '')
          .toLowerCase()
          .includes(query);

      // --------------------------------------------------------
      // CATEGORY
      // --------------------------------------------------------

      /*
       * The current /inventory response does not provide
       * category information.
       *
       * Therefore category filtering is only applied when
       * category data actually exists.
       */

      const hasCategory =
        Boolean(item?.category);

      const matchesCategory =
        selectedCategory ===
        'All Categories' ||
        !hasCategory ||
        item.category ===
        selectedCategory;

      // --------------------------------------------------------
      // BRANCH
      // --------------------------------------------------------

      /*
       * The current /inventory response does not provide
       * branch information.
       *
       * Therefore branch filtering is only applied when
       * branch data actually exists.
       */

      const hasBranch =
        Boolean(item?.branch);

      const matchesBranch =
        selectedBranch ===
        'All Branches' ||
        !hasBranch ||
        item.branch ===
        selectedBranch;

      // --------------------------------------------------------
      // REPORT-SPECIFIC FILTER
      // --------------------------------------------------------

      let matchesReport = true;

      // LOW STOCK
      if (
        selectedReport ===
        'low_stock'
      ) {
        matchesReport =
          item.status ===
          'Low Stock' ||
          Number(item.stock ?? 0) <= 5;
      }

      // EXPIRY
      if (
        selectedReport ===
        'expiry'
      ) {
        const days =
          getDaysUntilExpiry(
            item.expiry,
          );

        matchesReport =
          days !== null &&
          days <= 90;
      }

      // PRODUCT WISE
      if (
        selectedReport ===
        'product_wise'
      ) {
        matchesReport = true;
      }

      // STOCK AGEING
      if (
        selectedReport ===
        'stock_ageing'
      ) {
        /*
         * No received date / stock age is supplied
         * by the current inventory API.
         */
        matchesReport = true;
      }

      // STOCK MOVEMENT
      if (
        selectedReport ===
        'stock_movement'
      ) {
        /*
         * Movement history requires the separate
         * fetchStockMovements() API.
         */
        matchesReport = true;
      }

      // BRANCH WISE
      if (
        selectedReport ===
        'branch_wise'
      ) {
        matchesReport = true;
      }

      return (
        matchesSearch &&
        matchesCategory &&
        matchesBranch &&
        matchesReport
      );
    });
  }, [
    inventoryData,
    searchQuery,
    selectedCategory,
    selectedBranch,
    selectedReport,
  ]);

  // ============================================================
  // RESET PAGE WHEN FILTER CHANGES
  // ============================================================

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    selectedCategory,
    selectedBranch,
    selectedReport,
  ]);

  // ============================================================
  // PAGINATION
  // ============================================================

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredData.length /
      itemsPerPage,
    ),
  );

  const paginatedData =
    filteredData.slice(
      (currentPage - 1) *
      itemsPerPage,
      currentPage *
      itemsPerPage,
    );

  // ============================================================
  // KPI CALCULATIONS
  // ============================================================

  const totalInventoryValue =
    useMemo(() => {
      return inventoryData.reduce(
        (sum, item) =>
          sum +
          Number(
            item?.valuationCost ?? 0,
          ),
        0,
      );
    }, [inventoryData]);

  const totalProducts = inventorySummary?.totalProducts ?? 0;

  const totalQuantity =
    inventorySummary?.totalUnitsInStock ?? 0;

  const totalMrpValue =
    useMemo(() => {
      return inventoryData.reduce(
        (sum, item) =>
          sum +
          Number(
            item?.mrp ?? 0,
          ),
        0,
      );
    }, [inventoryData]);

  const averageItemValue =
    totalProducts > 0
      ? totalInventoryValue /
      totalProducts
      : 0;

  // ============================================================
  // ADDITIONAL KPI DATA
  // ============================================================

  const lowStockCount =
    inventoryData?.lowStockBatches ?? 0

  const outOfStockCount =
    inventorySummary?.outOfStockBatches ?? 0;

  const expiryCount =
    inventoryData?.nearExpiryBatches


  // ============================================================
  // RENDER STOCK VALUATION TABLE
  // ============================================================

  const renderStockValuationTable =
    () => {
      return (
        <View>
          {/* KPI CARDS */}

          <View
            style={styles.kpiGrid}
          >
            <View
              style={[
                styles.kpiCard,
                {
                  borderLeftColor:
                    COLORS.primary,
                },
              ]}
            >
              <Text
                style={
                  styles.kpiLabel
                }
              >
                Total Inventory Value
              </Text>

              <Text
                style={[
                  styles.kpiValue,
                  {
                    color:
                      COLORS.primary,
                  },
                ]}
              >
                {formatCurrency(
                  totalInventoryValue,
                )}
              </Text>
            </View>

            <View
              style={[
                styles.kpiCard,
                {
                  borderLeftColor:
                    COLORS.secondary,
                },
              ]}
            >
              <Text
                style={
                  styles.kpiLabel
                }
              >
                Total Products
              </Text>

              <Text
                style={[
                  styles.kpiValue,
                  {
                    color:
                      COLORS.secondary,
                  },
                ]}
              >
                {formatInteger(
                  totalProducts,
                )}
              </Text>
            </View>

            <View
              style={[
                styles.kpiCard,
                {
                  borderLeftColor:
                    COLORS.success,
                },
              ]}
            >
              <Text
                style={
                  styles.kpiLabel
                }
              >
                Total Quantity
              </Text>

              <Text
                style={[
                  styles.kpiValue,
                  {
                    color:
                      COLORS.success,
                  },
                ]}
              >
                {formatInteger(
                  totalQuantity,
                )}{' '}
                units
              </Text>
            </View>

            <View
              style={[
                styles.kpiCard,
                {
                  borderLeftColor:
                    COLORS.warning,
                },
              ]}
            >
              <Text
                style={
                  styles.kpiLabel
                }
              >
                Average Item Value
              </Text>

              <Text
                style={[
                  styles.kpiValue,
                  {
                    color:
                      COLORS.warning,
                  },
                ]}
              >
                {formatCurrency(
                  averageItemValue,
                )}
              </Text>
            </View>
          </View>

          {/* EXTRA INVENTORY SUMMARY */}

          <View
            style={
              styles.summaryRow
            }
          >
            <View
              style={
                styles.summaryItem
              }
            >
              <Text
                style={
                  styles.summaryLabel
                }
              >
                Low Stock
              </Text>

              <Text
                style={[
                  styles.summaryValue,
                  {
                    color:
                      COLORS.warning,
                  },
                ]}
              >
                {formatInteger(
                  lowStockCount,
                )}
              </Text>
            </View>

            <View
              style={
                styles.summaryItem
              }
            >
              <Text
                style={
                  styles.summaryLabel
                }
              >
                Out of Stock
              </Text>

              <Text
                style={[
                  styles.summaryValue,
                  {
                    color:
                      COLORS.danger,
                  },
                ]}
              >
                {formatInteger(
                  outOfStockCount,
                )}
              </Text>
            </View>

            <View
              style={
                styles.summaryItem
              }
            >
              <Text
                style={
                  styles.summaryLabel
                }
              >
                Expiring ≤ 90 Days
              </Text>

              <Text
                style={[
                  styles.summaryValue,
                  {
                    color:
                      COLORS.secondary,
                  },
                ]}
              >
                {formatInteger(
                  expiryCount,
                )}
              </Text>
            </View>

            <View
              style={
                styles.summaryItem
              }
            >
              <Text
                style={
                  styles.summaryLabel
                }
              >
                Current MRP Value
              </Text>

              <Text
                style={[
                  styles.summaryValue,
                  {
                    color:
                      COLORS.primary,
                  },
                ]}
              >
                {formatCurrency(
                  totalMrpValue,
                )}
              </Text>
            </View>
          </View>

          {/* ERROR */}

          {error ? (
            <View
              style={
                styles.errorContainer
              }
            >
              <Text
                style={
                  styles.errorText
                }
              >
                {error}
              </Text>

              <TouchableOpacity
                style={
                  styles.retryButton
                }
                onPress={
                  loadInventory
                }
              >
                <Text
                  style={
                    styles.retryButtonText
                  }
                >
                  Retry
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* TABLE */}

          <ScrollView
            horizontal
            style={
              styles.tableContainer
            }
            showsHorizontalScrollIndicator={
              true
            }
          >
            <View>
              {/* TABLE HEADER */}

              <View
                style={
                  styles.tableHeader
                }
              >
                <Text
                  style={[
                    styles.tableCellHeader,
                    styles.cellProduct,
                  ]}
                >
                  Product
                </Text>

                <Text
                  style={[
                    styles.tableCellHeader,
                    styles.cellSku,
                  ]}
                >
                  SKU
                </Text>

                <Text
                  style={[
                    styles.tableCellHeader,
                    styles.cellBatch,
                  ]}
                >
                  Batch
                </Text>

                <Text
                  style={[
                    styles.tableCellHeader,
                    styles.cellQty,
                  ]}
                >
                  Total Qty
                </Text>

                <Text
                  style={[
                    styles.tableCellHeader,
                    styles.cellAmount,
                  ]}
                >
                  Cost Price
                </Text>

                <Text
                  style={[
                    styles.tableCellHeader,
                    styles.cellAmount,
                  ]}
                >
                  Purchase Value
                </Text>

                <Text
                  style={[
                    styles.tableCellHeader,
                    styles.cellAmount,
                  ]}
                >
                  MRP
                </Text>

                <Text
                  style={[
                    styles.tableCellHeader,
                    styles.cellAmount,
                  ]}
                >
                  MRP Value
                </Text>

                <Text
                  style={[
                    styles.tableCellHeader,
                    styles.cellExpiry,
                  ]}
                >
                  Expiry
                </Text>

                <Text
                  style={[
                    styles.tableCellHeader,
                    styles.cellStatus,
                  ]}
                >
                  Status
                </Text>
              </View>

              {/* LOADING */}

              {loading ? (
                Array.from({
                  length: 5,
                }).map(
                  (_, index) => (
                    <SkeletonTableRow
                      key={index}
                      columns={10}
                    />
                  ),
                )
              ) : paginatedData.length ===
                0 ? (
                <View
                  style={
                    styles.emptyContainer
                  }
                >
                  <Text
                    style={
                      styles.emptyIcon
                    }
                  >
                    📦
                  </Text>

                  <Text
                    style={
                      styles.emptyTitle
                    }
                  >
                    No inventory records found
                  </Text>

                  <Text
                    style={
                      styles.emptyText
                    }
                  >
                    {error
                      ? 'Unable to load inventory data.'
                      : 'Try changing your search or filters.'}
                  </Text>
                </View>
              ) : (
                paginatedData.map(
                  (row, index) => {
                    const globalIndex =
                      (currentPage -
                        1) *
                      itemsPerPage +
                      index;

                    return (
                      <View
                        key={
                          row.productId ||
                          `${row.sku}-${row.batch}-${globalIndex}`
                        }
                        style={[
                          styles.tableRow,
                          globalIndex %
                          2 !==
                          0 &&
                          styles.tableRowAlt,
                        ]}
                      >
                        {/* PRODUCT */}

                        <Text
                          style={[
                            styles.tableCell,
                            styles.cellProduct,
                            styles.textBold,
                          ]}
                          numberOfLines={2}
                        >
                          {row.product}
                        </Text>

                        {/* SKU */}

                        <Text
                          style={[
                            styles.tableCell,
                            styles.cellSku,
                          ]}
                        >
                          {row.sku}
                        </Text>

                        {/* BATCH */}

                        <Text
                          style={[
                            styles.tableCell,
                            styles.cellBatch,
                          ]}
                        >
                          {row.batch}
                        </Text>

                        {/* QTY */}

                        <Text
                          style={[
                            styles.tableCell,
                            styles.cellQty,
                          ]}
                        >
                          {formatInteger(
                            row.stock,
                          )}
                        </Text>

                        {/* COST */}

                        <Text
                          style={[
                            styles.tableCell,
                            styles.cellAmount,
                          ]}
                        >
                          {formatCurrency(
                            row.costPrice,
                          )}
                        </Text>

                        {/* PURCHASE VALUE */}

                        <Text
                          style={[
                            styles.tableCell,
                            styles.cellAmount,
                          ]}
                        >
                          {formatCurrency(
                            row.valuationCost,
                          )}
                        </Text>

                        {/* MRP */}

                        <Text
                          style={[
                            styles.tableCell,
                            styles.cellAmount,
                          ]}
                        >
                          {formatCurrency(
                            row.mrp,
                          )}
                        </Text>

                        {/* MRP VALUE */}

                        <Text
                          style={[
                            styles.tableCell,
                            styles.cellAmount,
                          ]}
                        >
                          {formatCurrency(
                            row.valuationMrp,
                          )}
                        </Text>

                        {/* EXPIRY */}

                        <Text
                          style={[
                            styles.tableCell,
                            styles.cellExpiry,
                          ]}
                        >
                          {formatDate(
                            row.expiry,
                          )}
                        </Text>

                        {/* STATUS */}

                        <View
                          style={
                            styles.cellStatus
                          }
                        >
                          <View
                            style={[
                              styles.statusBadge,
                              row.status ===
                              'Low Stock' &&
                              styles.statusBadgeWarning,
                              row.status ===
                              'Out of Stock' &&
                              styles.statusBadgeDanger,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusText,
                                row.status ===
                                'Low Stock' &&
                                styles.statusTextWarning,
                                row.status ===
                                'Out of Stock' &&
                                styles.statusTextDanger,
                              ]}
                            >
                              {row.status ||
                                '—'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  },
                )
              )}
            </View>
          </ScrollView>

          {/* PAGINATION */}

          {!loading &&
            filteredData.length >
            0 && (
              <PaginationControls
                currentPage={
                  currentPage
                }
                totalPages={
                  totalPages
                }
                onPageChange={
                  setCurrentPage
                }
                itemsPerPage={
                  itemsPerPage
                }
                onItemsPerPageChange={(
                  value,
                ) => {
                  setItemsPerPage(
                    value,
                  );
                  setCurrentPage(
                    1,
                  );
                }}
              />
            )}

          {/* RESULT COUNT */}

          {!loading && (
            <Text
              style={
                styles.paginationInfo
              }
            >
              Showing{' '}
              {filteredData.length ===
                0
                ? 0
                : (currentPage -
                  1) *
                itemsPerPage +
                1}
              -
              {Math.min(
                currentPage *
                itemsPerPage,
                filteredData.length,
              )}{' '}
              of{' '}
              {filteredData.length}{' '}
              records
            </Text>
          )}

          <Text
            style={
              styles.footerNote
            }
          >
            Inventory values are calculated
            from the current backend stock
            data.
          </Text>
        </View>
      );
    };

  // ============================================================
  // GENERIC PLACEHOLDER REPORT
  // ============================================================

  const renderPlaceholderReport =
    () => {
      return (
        <View
          style={
            styles.placeholderContainer
          }
        >
          <Text
            style={
              styles.placeholderIcon
            }
          >
            {currentReport?.icon}
          </Text>

          <Text
            style={
              styles.placeholderText
            }
          >
            {currentReport?.title}
          </Text>

          <Text
            style={
              styles.placeholderSubtext
            }
          >
            {currentReport?.description}
          </Text>

          <View
            style={
              styles.placeholderInfo
            }
          >
            <Text
              style={
                styles.placeholderInfoText
              }
            >
              {selectedReport ===
                'low_stock'
                ? `${filteredData.length} low-stock records found.`
                : selectedReport ===
                  'expiry'
                  ? `${filteredData.length} records expiring within 90 days.`
                  : 'The backend data required for this report is not included in the supplied inventory response.'}
            </Text>
          </View>
        </View>
      );
    };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      {/* HEADER */}

      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View
          style={[styles.headerLeft, isMobile && styles.headerLeftMobile]}
        >
          <TouchableOpacity
            onPress={() =>
              navigation?.goBack()
            }
            style={
              styles.backButton
            }
          >
            <Text
              style={
                styles.backIcon
              }
            >
              ←
            </Text>
          </TouchableOpacity>

          <View>
            <Text
              style={
                styles.headerTitle
              }
            >
              Inventory Reports
            </Text>

            <Text
              style={
                styles.headerSubtitle
              }
            >
              Generate and export inventory
              reports
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.exportButtonHeader,
            isMobile && styles.exportButtonHeaderMobile,
          ]}
          onPress={() => {
            console.log(
              '[InventoryReports] Export requested:',
              selectedReport,
            );
          }}
        >
          <Text
            style={
              styles.exportButtonHeaderText
            }
          >
            ⬇ Export
          </Text>
        </TouchableOpacity>
      </View>

      {/* CONTENT */}

      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.contentContainer,
          isMobile && styles.contentContainerMobile,
        ]}
      >
        {/* REPORT TYPE SELECTOR */}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          style={
            styles.reportTypeScroll
          }
          contentContainerStyle={
            styles.reportTypeScrollContent
          }
        >
          {REPORT_TYPES.map(
            (report) => {
              const isSelected =
                selectedReport ===
                report.id;

              return (
                <TouchableOpacity
                  key={
                    report.id
                  }
                  style={[
                    styles.reportCard,
                    isSelected &&
                    styles.reportCardSelected,
                  ]}
                  onPress={() =>
                    setSelectedReport(
                      report.id,
                    )
                  }
                >
                  <Text
                    style={
                      styles.reportCardIcon
                    }
                  >
                    {report.icon}
                  </Text>

                  <Text
                    style={[
                      styles.reportCardTitle,
                      isSelected &&
                      styles.reportCardTitleSelected,
                    ]}
                  >
                    {report.title}
                  </Text>

                  <Text
                    style={
                      styles.reportCardDesc
                    }
                  >
                    {
                      report.description
                    }
                  </Text>
                </TouchableOpacity>
              );
            },
          )}
        </ScrollView>

        {/* FILTERS */}

        <View
          style={[
            styles.card,
            {
              zIndex: 100,
            },
          ]}
        >
          <Text
            style={
              styles.cardTitle
            }
          >
            Filters
          </Text>

          {/* QUICK RANGE */}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={
              false
            }
            style={
              styles.quickRangeScroll
            }
            contentContainerStyle={
              styles.quickRangeScrollContent
            }
          >
            {[
              'today',
              'this_week',
              'this_month',
              'last_month',
              'custom',
            ].map(
              (range) => {
                const isActive =
                  quickRange ===
                  range;

                const labels = {
                  today: 'Today',
                  this_week:
                    'This Week',
                  this_month:
                    'This Month',
                  last_month:
                    'Last Month',
                  custom: 'Custom',
                };

                return (
                  <TouchableOpacity
                    key={range}
                    style={[
                      styles.quickRangeBtn,
                      isActive &&
                      styles.quickRangeBtnActive,
                    ]}
                    onPress={() =>
                      setQuickRange(
                        range,
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.quickRangeText,
                        isActive &&
                        styles.quickRangeTextActive,
                      ]}
                    >
                      {
                        labels[
                        range
                        ]
                      }
                    </Text>
                  </TouchableOpacity>
                );
              },
            )}
          </ScrollView>

          {/* CUSTOM DATE */}

          {quickRange ===
            'custom' && (
              <View
                style={[
                  styles.customDateRow,
                  isMobile && styles.customDateRowMobile,
                ]}
              >
                <View
                  style={
                    styles.customDateInputContainer
                  }
                >
                  <Text
                    style={
                      styles.label
                    }
                  >
                    From Date
                  </Text>

                  <TextInput
                    style={
                      styles.textInput
                    }
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={
                      COLORS.textMuted
                    }
                    value={
                      dateFrom
                    }
                    onChangeText={
                      setDateFrom
                    }
                  />
                </View>

                <View
                  style={
                    styles.customDateInputContainer
                  }
                >
                  <Text
                    style={
                      styles.label
                    }
                  >
                    To Date
                  </Text>

                  <TextInput
                    style={
                      styles.textInput
                    }
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={
                      COLORS.textMuted
                    }
                    value={
                      dateTo
                    }
                    onChangeText={
                      setDateTo
                    }
                  />
                </View>
              </View>
            )}

          {/* DROPDOWNS */}

          <View
            style={[
              styles.dropdownRow,
              isMobile && styles.dropdownRowMobile,
            ]}
          >
            {/* BRANCH */}

            <View
              style={[
                styles.dropdownContainer,
                {
                  zIndex:
                    showBranchDropdown
                      ? 200
                      : 10,
                },
              ]}
            >
              <Text
                style={
                  styles.label
                }
              >
                Branch
              </Text>

              <TouchableOpacity
                style={
                  styles.dropdownTrigger
                }
                onPress={() => {
                  setShowBranchDropdown(
                    !showBranchDropdown,
                  );

                  setShowCategoryDropdown(
                    false,
                  );
                }}
              >
                <Text
                  style={
                    styles.dropdownTriggerText
                  }
                >
                  {
                    selectedBranch
                  }
                </Text>

                <Text
                  style={
                    styles.dropdownIcon
                  }
                >
                  ▾
                </Text>
              </TouchableOpacity>

              {showBranchDropdown && (
                <View
                  style={
                    styles.dropdownMenu
                  }
                >
                  {BRANCH_OPTIONS.map(
                    (option) => (
                      <TouchableOpacity
                        key={
                          option
                        }
                        style={
                          styles.dropdownOption
                        }
                        onPress={() => {
                          setSelectedBranch(
                            option,
                          );

                          setShowBranchDropdown(
                            false,
                          );
                        }}
                      >
                        <Text
                          style={
                            styles.dropdownOptionText
                          }
                        >
                          {
                            option
                          }
                        </Text>
                      </TouchableOpacity>
                    ),
                  )}
                </View>
              )}
            </View>

            {/* CATEGORY */}

            <View
              style={[
                styles.dropdownContainer,
                {
                  zIndex:
                    showCategoryDropdown
                      ? 200
                      : 10,
                  marginRight: 0,
                },
              ]}
            >
              <Text
                style={
                  styles.label
                }
              >
                Category
              </Text>

              <TouchableOpacity
                style={
                  styles.dropdownTrigger
                }
                onPress={() => {
                  setShowCategoryDropdown(
                    !showCategoryDropdown,
                  );

                  setShowBranchDropdown(
                    false,
                  );
                }}
              >
                <Text
                  style={
                    styles.dropdownTriggerText
                  }
                >
                  {
                    selectedCategory
                  }
                </Text>

                <Text
                  style={
                    styles.dropdownIcon
                  }
                >
                  ▾
                </Text>
              </TouchableOpacity>

              {showCategoryDropdown && (
                <View
                  style={
                    styles.dropdownMenu
                  }
                >
                  {CATEGORY_OPTIONS.map(
                    (option) => (
                      <TouchableOpacity
                        key={
                          option
                        }
                        style={
                          styles.dropdownOption
                        }
                        onPress={() => {
                          setSelectedCategory(
                            option,
                          );

                          setShowCategoryDropdown(
                            false,
                          );
                        }}
                      >
                        <Text
                          style={
                            styles.dropdownOptionText
                          }
                        >
                          {
                            option
                          }
                        </Text>
                      </TouchableOpacity>
                    ),
                  )}
                </View>
              )}
            </View>
          </View>

          {/* SEARCH */}

          <View
            style={[
              styles.searchContainer,
              {
                zIndex: 1,
              },
            ]}
          >
            <Text
              style={
                styles.label
              }
            >
              Product Search
            </Text>

            <TextInput
              style={
                styles.textInput
              }
              placeholder="Search product, SKU or batch..."
              placeholderTextColor={
                COLORS.textMuted
              }
              value={
                searchQuery
              }
              onChangeText={
                setSearchQuery
              }
            />
          </View>
        </View>

        {/* PREVIEW */}

        <View
          style={[
            styles.card,
            {
              zIndex: 1,
            },
          ]}
        >
          <View
            style={
              styles.previewHeader
            }
          >
            <View>
              <Text
                style={
                  styles.cardTitle
                }
              >
                Preview —{' '}
                {
                  currentReport?.title
                }
              </Text>

              {!loading && (
                <Text
                  style={
                    styles.previewCount
                  }
                >
                  {filteredData.length}{' '}
                  matching records
                </Text>
              )}
            </View>

            {loading && (
              <ActivityIndicator
                size="small"
                color={
                  COLORS.primary
                }
              />
            )}
          </View>

          {selectedReport ===
            'stock_valuation'
            ? renderStockValuationTable()
            : renderPlaceholderReport()}
        </View>

        {/* EXPORT SECTION */}

        <View
          style={[
            styles.card,
            {
              zIndex: 1,
            },
          ]}
        >
          <Text
            style={
              styles.cardTitle
            }
          >
            Export Report
          </Text>

          <TouchableOpacity
            style={
              styles.exportExcelBtn
            }
            onPress={() =>
              console.log(
                '[InventoryReports] Excel export:',
                selectedReport,
                filteredData,
              )
            }
          >
            <Text
              style={
                styles.exportExcelBtnText
              }
            >
              ⬇ Export as Excel (.xlsx)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={
              styles.exportPdfBtn
            }
            onPress={() =>
              console.log(
                '[InventoryReports] PDF export:',
                selectedReport,
                filteredData,
              )
            }
          >
            <Text
              style={
                styles.exportPdfBtnText
              }
            >
              ⬇ Export as PDF
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={
              styles.scheduleBtn
            }
            onPress={() =>
              console.log(
                '[InventoryReports] Schedule report:',
                selectedReport,
              )
            }
          >
            <Text
              style={
                styles.scheduleBtnText
              }
            >
              📅 Schedule Report
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={{
            height: 40,
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor:
      COLORS.background,
  },

  container: {
    flex: 1,
  },

  contentContainer: {
    padding: 16,
  },
  contentContainerMobile: {
    padding: 12,
  },

  // ==========================================================
  // HEADER
  // ==========================================================

  header: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'center',
    backgroundColor:
      COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor:
      COLORS.border,
    elevation: 4,
    shadowColor: '#28242B',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    zIndex: 10,
  },
  headerMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  headerLeftMobile: {
    width: '100%',
  },

  backButton: {
    marginRight: 16,
    padding: 4,
  },

  backIcon: {
    fontSize: 24,
    color: COLORS.textPrimary,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },

  headerSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  exportButtonHeader: {
    backgroundColor:
      COLORS.secondaryLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  exportButtonHeaderMobile: {
    alignSelf: 'flex-start',
  },

  exportButtonHeaderText: {
    color: COLORS.secondary,
    fontWeight: '600',
    fontSize: 14,
  },

  // ==========================================================
  // REPORT TYPES
  // ==========================================================

  reportTypeScroll: {
    marginBottom: 16,
  },

  reportTypeScrollContent: {
    paddingRight: 16,
  },

  reportCard: {
    width: 160,
    backgroundColor:
      COLORS.surface,
    borderWidth: 1,
    borderColor:
      COLORS.border,
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
  },

  reportCardSelected: {
    borderColor:
      COLORS.primary,
    backgroundColor:
      COLORS.primaryLight,
  },

  reportCardIcon: {
    fontSize: 32,
    marginBottom: 8,
  },

  reportCardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },

  reportCardTitleSelected: {
    color: COLORS.primary,
  },

  reportCardDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },

  // ==========================================================
  // CARD
  // ==========================================================

  card: {
    backgroundColor:
      COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor:
      COLORS.border,
    shadowColor: '#28242B',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },

  previewHeader: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },

  previewCount: {
    fontSize: 12,
    color: COLORS.textMuted,
  },

  // ==========================================================
  // QUICK RANGE
  // ==========================================================

  quickRangeScroll: {
    marginBottom: 16,
  },

  quickRangeScrollContent: {
    paddingRight: 16,
  },

  quickRangeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor:
      COLORS.border,
    marginRight: 8,
    backgroundColor:
      COLORS.surface,
  },

  quickRangeBtnActive: {
    backgroundColor:
      COLORS.primary,
    borderColor:
      COLORS.primary,
  },

  quickRangeText: {
    color:
      COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },

  quickRangeTextActive: {
    color: '#FFF',
  },

  // ==========================================================
  // DATES
  // ==========================================================

  customDateRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  customDateRowMobile: {
    flexDirection: 'column',
    gap: 10,
  },

  customDateInputContainer: {
    flex: 1,
    marginRight: 8,
  },

  label: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
    fontWeight: '500',
  },

  textInput: {
    borderWidth: 1,
    borderColor:
      COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: COLORS.textPrimary,
    backgroundColor:
      COLORS.surface,
  },

  // ==========================================================
  // DROPDOWN
  // ==========================================================

  dropdownRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  dropdownRowMobile: {
    flexDirection: 'column',
    gap: 10,
  },

  dropdownContainer: {
    flex: 1,
    marginRight: 8,
    minWidth: 0,
  },

  dropdownTrigger: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor:
      COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor:
      COLORS.surface,
  },

  dropdownTriggerText: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },

  dropdownIcon: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },

  dropdownMenu: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    backgroundColor:
      COLORS.surface,
    borderWidth: 1,
    borderColor:
      COLORS.border,
    borderRadius: 8,
    elevation: 5,
    shadowColor: '#28242B',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden',
  },

  dropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor:
      COLORS.surfaceHover,
  },

  dropdownOptionText: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },

  searchContainer: {
    marginBottom: 8,
  },

  // ==========================================================
  // KPI
  // ==========================================================

  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },

  kpiCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor:
      COLORS.surfaceHover,
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    justifyContent:
      'space-between',
    minHeight: 75,
  },

  kpiLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },

  kpiValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },

  // ==========================================================
  // SUMMARY
  // ==========================================================

  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },

  summaryItem: {
    flex: 1,
    minWidth: 120,
    backgroundColor:
      COLORS.surfaceHover,
    borderRadius: 8,
    padding: 10,
  },

  summaryLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 3,
  },

  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },

  // ==========================================================
  // TABLE
  // ==========================================================

  tableContainer: {
    borderWidth: 1,
    borderColor:
      COLORS.border,
    borderRadius: 8,
    marginBottom: 12,
  },

  tableHeader: {
    flexDirection: 'row',
    backgroundColor:
      COLORS.surfaceHover,
    borderBottomWidth: 1,
    borderBottomColor:
      COLORS.border,
    paddingVertical: 10,
  },

  tableCellHeader: {
    fontWeight: '600',
    fontSize: 12,
    color: COLORS.textSecondary,
    paddingHorizontal: 12,
  },

  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor:
      COLORS.border,
    paddingVertical: 12,
    backgroundColor:
      COLORS.surface,
    alignItems: 'center',
  },

  tableRowAlt: {
    backgroundColor:
      '#F8F5F7',
  },

  tableCell: {
    fontSize: 13,
    color: COLORS.textPrimary,
    paddingHorizontal: 12,
  },

  textBold: {
    fontWeight: '600',
  },

  cellProduct: {
    width: 220,
  },

  cellSku: {
    width: 110,
  },

  cellBatch: {
    width: 120,
  },

  cellQty: {
    width: 90,
    textAlign: 'right',
  },

  cellAmount: {
    width: 120,
    textAlign: 'right',
  },

  cellExpiry: {
    width: 130,
  },

  cellStatus: {
    width: 125,
  },

  // ==========================================================
  // STATUS
  // ==========================================================

  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor:
      COLORS.successLight,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  statusBadgeWarning: {
    backgroundColor:
      COLORS.warningLight,
  },

  statusBadgeDanger: {
    backgroundColor:
      COLORS.dangerLight,
  },

  statusText: {
    color: COLORS.success,
    fontSize: 11,
    fontWeight: '600',
  },

  statusTextWarning: {
    color: COLORS.warning,
  },

  statusTextDanger: {
    color: COLORS.danger,
  },

  // ==========================================================
  // EMPTY
  // ==========================================================

  emptyContainer: {
    width: 1255,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },

  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },

  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },

  emptyText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  // ==========================================================
  // ERROR
  // ==========================================================

  errorContainer: {
    backgroundColor:
      COLORS.dangerLight,
    borderWidth: 1,
    borderColor:
      '#F7EDEE',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },

  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    marginBottom: 8,
  },

  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor:
      COLORS.danger,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },

  retryButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },

  // ==========================================================
  // PAGINATION
  // ==========================================================

  paginationInfo: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },

  // ==========================================================
  // FOOTER
  // ==========================================================

  footerNote: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },

  // ==========================================================
  // PLACEHOLDER
  // ==========================================================

  placeholderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },

  placeholderIcon: {
    fontSize: 40,
    marginBottom: 12,
  },

  placeholderText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },

  placeholderSubtext: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 450,
  },

  placeholderInfo: {
    marginTop: 16,
    backgroundColor:
      COLORS.secondaryLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },

  placeholderInfoText: {
    fontSize: 12,
    color: COLORS.secondary,
    textAlign: 'center',
  },

  // ==========================================================
  // EXPORT
  // ==========================================================

  exportExcelBtn: {
    backgroundColor:
      COLORS.primary,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },

  exportExcelBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 15,
  },

  exportPdfBtn: {
    backgroundColor:
      COLORS.surface,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor:
      COLORS.secondary,
    marginBottom: 12,
  },

  exportPdfBtnText: {
    color: COLORS.secondary,
    fontWeight: 'bold',
    fontSize: 15,
  },

  scheduleBtn: {
    backgroundColor:
      COLORS.primaryLight,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },

  scheduleBtnText: {
    color: COLORS.primary,
    fontWeight: 'bold',
    fontSize: 15,
  },
});