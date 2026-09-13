import React, { useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
} from "react-native";
import { saveInventoryEntry } from "../../api/inventoryApi";
import { exportToCSV } from "../../utils/exportUtils";

const CSV_SAMPLE_HEADERS = [
  "medicineName",
  "brandName",
  "genericName",
  "strength",
  "packSize",
  "manufacturer",
  "supplierName",
  "sku",
  "batchNo",
  "expiryDate",
  "quantity",
  "amount",
  "shelfLocation",
];

const CSV_SAMPLE_ROWS = [
  [
    "Paracetamol 500mg",
    "Calpol",
    "Paracetamol",
    "500mg",
    "15 Tablets",
    "GSK",
    "GSK Pharma Distributors",
    "SKU-CAL-500",
    "BAT-9801",
    "2027-12-31",
    "150",
    "32.50",
    "A1-S2",
  ],
  [
    "Amoxicillin 250mg",
    "Mox 250",
    "Amoxicillin",
    "250mg",
    "10 Capsules",
    "Sun Pharma",
    "Sun Care Ltd",
    "SKU-MOX-250",
    "BAT-9802",
    "2028-06-30",
    "80",
    "65.00",
    "B2-S1",
  ],
  [
    "Azithromycin 500mg",
    "Azee 500",
    "Azithromycin",
    "500mg",
    "3 Tablets",
    "Cipla",
    "Cipla Distributors",
    "SKU-AZI-500",
    "BAT-9803",
    "2027-09-30",
    "45",
    "115.00",
    "C1-S4",
  ],
  [
    "Metformin 500mg",
    "Glycomet",
    "Metformin",
    "500mg",
    "20 Tablets",
    "USV Pvt Ltd",
    "Allied Healthcare",
    "SKU-GLY-500",
    "BAT-9804",
    "2028-01-15",
    "200",
    "48.00",
    "A3-S1",
  ],
];

export default function BulkImportModal({
  visible,
  onClose,
  onImportComplete,
  onShowToast,
  selectedBranch = "Main Branch",
}) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [parsedRows, setParsedRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  // 1. Download Sample CSV Template
  const handleDownloadTemplate = () => {
    try {
      exportToCSV(CSV_SAMPLE_HEADERS, CSV_SAMPLE_ROWS, "pharmacy_catalog_import_template.csv");
      if (onShowToast) {
        onShowToast("✓ Downloaded CSV import template!");
      }
    } catch (err) {
      if (onShowToast) onShowToast(`⚠️ Failed to download template: ${err.message}`);
    }
  };

  // 2. Trigger File Picker
  const handlePickFile = () => {
    if (Platform.OS === "web") {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
        fileInputRef.current.click();
      }
    } else {
      if (onShowToast) onShowToast("File upload available in Web / Browser mode");
    }
  };

  // 3. Robust CSV Line Parser (handles quotes and commas)
  const parseCSVLine = (line) => {
    const values = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        values.push(cur.trim().replace(/^"|"$/g, ""));
        cur = "";
      } else {
        cur += ch;
      }
    }
    values.push(cur.trim().replace(/^"|"$/g, ""));
    return values;
  };

  // 4. Handle File Change Event
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        if (!text || typeof text !== "string") {
          throw new Error("Empty or invalid file content");
        }

        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        if (lines.length < 2) {
          throw new Error("CSV must contain at least a header row and 1 data row");
        }

        const headers = parseCSVLine(lines[0]).map((h) =>
          h.toLowerCase().replace(/[^a-z0-9]/g, "")
        );

        const rows = [];
        for (let i = 1; i < lines.length; i++) {
          const vals = parseCSVLine(lines[i]);
          if (vals.length === 0 || (vals.length === 1 && !vals[0])) continue;

          const rowObj = {};
          headers.forEach((h, hIdx) => {
            rowObj[h] = vals[hIdx] || "";
          });

          // Standardize column keys
          const medName =
            rowObj.medicinename ||
            rowObj.medicine ||
            rowObj.productname ||
            rowObj.product ||
            rowObj.brandname ||
            "";
          const brandName = rowObj.brandname || rowObj.brand || medName;
          const genericName = rowObj.genericname || rowObj.generic || medName;
          const sku = rowObj.sku || `SKU-${Date.now().toString().slice(-4)}-${i}`;
          const batchNo = rowObj.batchno || rowObj.batch || `BAT-${Math.floor(1000 + Math.random() * 9000)}`;
          const expiryDate = rowObj.expirydate || rowObj.expiry || "2027-12-31";
          const qty = parseInt(rowObj.quantity || rowObj.qty || "0", 10);
          const amt = parseFloat(rowObj.amount || rowObj.price || rowObj.mrp || "0") || 0;
          const strength = rowObj.strength || "500mg";
          const packSize = rowObj.packsize || rowObj.pack || "10 Tablets";
          const manufacturer = rowObj.manufacturer || "Generic Pharma";
          const supplierName = rowObj.suppliername || rowObj.supplier || "Direct Supply";
          const shelfLocation = rowObj.shelflocation || rowObj.shelf || "Shelf-A1";

          const errors = [];
          if (!medName) errors.push("Missing Medicine Name");
          if (isNaN(qty) || qty < 0) errors.push("Invalid Quantity");
          if (isNaN(amt) || amt < 0) errors.push("Invalid MRP");

          rows.push({
            index: i,
            medicineName: medName,
            brandName,
            genericName,
            strength,
            packSize,
            manufacturer,
            supplierName,
            sku,
            batchNo,
            expiryDate,
            quantity: isNaN(qty) ? 0 : qty,
            amount: amt,
            shelfLocation,
            branchId: selectedBranch === "All Branches" ? "Main Branch" : selectedBranch,
            isValid: errors.length === 0,
            errorMessage: errors.join(", "),
          });
        }

        setParsedRows(rows);
        if (onShowToast) {
          const validCount = rows.filter((r) => r.isValid).length;
          onShowToast(`Parsed ${rows.length} rows (${validCount} valid).`);
        }
      } catch (err) {
        console.error("CSV parse error:", err);
        if (onShowToast) onShowToast(`⚠️ Failed to parse CSV: ${err.message}`);
      }
    };

    reader.readAsText(file);
  };

  // 5. Commit Valid Records to Inventory API
  const handleExecuteImport = async () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      if (onShowToast) onShowToast("⚠️ No valid rows to import.");
      return;
    }

    setImporting(true);
    let successCount = 0;

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      try {
        await saveInventoryEntry({
          medicineName: row.medicineName,
          brandName: row.brandName,
          genericName: row.genericName,
          strength: row.strength,
          packSize: row.packSize,
          manufacturer: row.manufacturer,
          supplierName: row.supplierName,
          sku: row.sku,
          batchNo: row.batchNo,
          expiryDate: row.expiryDate,
          quantity: row.quantity,
          amount: row.amount,
          shelfLocation: row.shelfLocation,
          branchId: row.branchId,
        });
        successCount++;
      } catch (err) {
        console.warn(`Failed to import row ${row.index}:`, err.message);
      }
      setImportProgress(Math.round(((i + 1) / validRows.length) * 100));
    }

    setImporting(false);
    if (onShowToast) {
      onShowToast(`✓ Successfully imported ${successCount} products into inventory!`);
    }

    if (onImportComplete) {
      onImportComplete(successCount);
    }
    handleClose();
  };

  const handleClose = () => {
    setFileName("");
    setParsedRows([]);
    setImporting(false);
    setImportProgress(0);
    onClose();
  };

  const validRowsCount = parsedRows.filter((r) => r.isValid).length;
  const invalidRowsCount = parsedRows.filter((r) => !r.isValid).length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, isMobile && styles.modalCardMobile]}>
          {/* Header */}
          <View style={styles.headerBar}>
            <View style={styles.headerTitleGroup}>
              <Text style={styles.headerIcon}>📥</Text>
              <View>
                <Text style={styles.headerTitle}>Bulk Catalog & Inventory CSV Import</Text>
                <Text style={styles.headerSubtitle}>
                  Import medicines, batches, and starting stock levels in bulk (PRD-10, DAT-01)
                </Text>
              </View>
            </View>
            <Pressable onPress={handleClose} style={styles.closeBtn} accessibilityLabel="Close modal">
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* Hidden File Input for Web */}
          {Platform.OS === "web" && (
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
          )}

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={true}>
            {/* Step 1: Download Template & Instructions */}
            <View style={styles.stepCard}>
              <View style={styles.stepHeader}>
                <View style={styles.stepNumberBadge}>
                  <Text style={styles.stepNumberText}>1</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>Download Standard CSV Template</Text>
                  <Text style={styles.stepDescription}>
                    Use our pre-formatted spreadsheet template with predefined medicine, batch, and pricing headers.
                  </Text>
                </View>
                <Pressable onPress={handleDownloadTemplate} style={styles.templateBtn}>
                  <Text style={styles.templateBtnIcon}>📄</Text>
                  <Text style={styles.templateBtnText}>Download Template</Text>
                </Pressable>
              </View>
            </View>

            {/* Step 2: Upload CSV File */}
            <View style={styles.stepCard}>
              <View style={styles.stepHeader}>
                <View style={styles.stepNumberBadge}>
                  <Text style={styles.stepNumberText}>2</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>Select CSV File to Upload</Text>
                  <Text style={styles.stepDescription}>
                    {fileName
                      ? `Selected: ${fileName} (${parsedRows.length} rows detected)`
                      : "Choose a .csv file from your computer or mobile device."}
                  </Text>
                </View>
                <Pressable onPress={handlePickFile} style={styles.browseBtn}>
                  <Text style={styles.browseBtnIcon}>📁</Text>
                  <Text style={styles.browseBtnText}>{fileName ? "Change File" : "Browse File"}</Text>
                </Pressable>
              </View>
            </View>

            {/* Step 3: Verification & Preview Table */}
            {parsedRows.length > 0 && (
              <View style={styles.previewContainer}>
                {/* Summary Chips */}
                <View style={styles.statsRow}>
                  <View style={[styles.statChip, { backgroundColor: "#F1F5F9" }]}>
                    <Text style={styles.statChipLabel}>TOTAL ROWS</Text>
                    <Text style={[styles.statChipValue, { color: "#1E293B" }]}>
                      {parsedRows.length}
                    </Text>
                  </View>
                  <View style={[styles.statChip, { backgroundColor: "#DCFCE7" }]}>
                    <Text style={styles.statChipLabel}>READY TO IMPORT</Text>
                    <Text style={[styles.statChipValue, { color: "#15803D" }]}>
                      {validRowsCount}
                    </Text>
                  </View>
                  {invalidRowsCount > 0 && (
                    <View style={[styles.statChip, { backgroundColor: "#FEE2E2" }]}>
                      <Text style={styles.statChipLabel}>ERRORS / SKIPPED</Text>
                      <Text style={[styles.statChipValue, { color: "#B91C1C" }]}>
                        {invalidRowsCount}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Preview Table Header */}
                <Text style={styles.previewTitle}>Previewing Data Records (First 15 Rows)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.tableScroll}>
                  <View>
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.thCell, { width: 50 }]}>#</Text>
                      <Text style={[styles.thCell, { width: 180 }]}>MEDICINE NAME</Text>
                      <Text style={[styles.thCell, { width: 100 }]}>BATCH NO</Text>
                      <Text style={[styles.thCell, { width: 110 }]}>EXPIRY</Text>
                      <Text style={[styles.thCell, { width: 80, textAlign: "right" }]}>QTY</Text>
                      <Text style={[styles.thCell, { width: 90, textAlign: "right" }]}>MRP (₹)</Text>
                      <Text style={[styles.thCell, { width: 140, textAlign: "center" }]}>STATUS</Text>
                    </View>

                    {parsedRows.slice(0, 15).map((row, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.tableDataRow,
                          idx % 2 === 1 && styles.tableDataRowAlt,
                          !row.isValid && styles.tableDataRowError,
                        ]}
                      >
                        <Text style={[styles.tdCell, { width: 50 }]}>{row.index}</Text>
                        <Text style={[styles.tdCell, { width: 180, fontWeight: "600" }]} numberOfLines={1}>
                          {row.medicineName || "—"}
                        </Text>
                        <Text style={[styles.tdCell, { width: 100 }]}>{row.batchNo}</Text>
                        <Text style={[styles.tdCell, { width: 110 }]}>{row.expiryDate}</Text>
                        <Text style={[styles.tdCell, { width: 80, textAlign: "right", fontWeight: "700" }]}>
                          {row.quantity}
                        </Text>
                        <Text style={[styles.tdCell, { width: 90, textAlign: "right" }]}>
                          ₹{row.amount.toFixed(2)}
                        </Text>
                        <View style={[styles.tdStatusWrap, { width: 140 }]}>
                          <View
                            style={[
                              styles.statusBadge,
                              { backgroundColor: row.isValid ? "#DCFCE7" : "#FEE2E2" },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                { color: row.isValid ? "#15803D" : "#B91C1C" },
                              ]}
                            >
                              {row.isValid ? "Valid" : row.errorMessage}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Progress Bar while importing */}
            {importing && (
              <View style={styles.progressBox}>
                <View style={styles.progressHeader}>
                  <ActivityIndicator size="small" color="#0F766E" />
                  <Text style={styles.progressText}>
                    Importing records to database... {importProgress}%
                  </Text>
                </View>
                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: `${importProgress}%` }]} />
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footerBar}>
            <Pressable onPress={handleClose} style={styles.cancelBtn} disabled={importing}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={handleExecuteImport}
              style={[
                styles.commitBtn,
                (validRowsCount === 0 || importing) && styles.commitBtnDisabled,
              ]}
              disabled={validRowsCount === 0 || importing}
            >
              <Text style={styles.commitBtnText}>
                {importing
                  ? "Importing Records..."
                  : `Commit Import (${validRowsCount} Items)`}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 900,
    maxHeight: "90%",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    display: "flex",
    flexDirection: "column",
  },
  modalCardMobile: {
    maxHeight: "95%",
    borderRadius: 8,
  },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  headerTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  headerIcon: {
    fontSize: 24,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 6,
  },
  closeBtnText: {
    fontSize: 18,
    color: "#64748B",
    fontWeight: "700",
  },
  modalBody: {
    padding: 20,
    flex: 1,
  },
  stepCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    marginBottom: 16,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
  },
  stepNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#0F766E",
    justifyContent: "center",
    alignItems: "center",
  },
  stepNumberText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  stepDescription: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  templateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#99F6E4",
  },
  templateBtnIcon: {
    fontSize: 14,
  },
  templateBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F766E",
  },
  browseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#0F766E",
  },
  browseBtnIcon: {
    fontSize: 14,
  },
  browseBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  previewContainer: {
    marginTop: 8,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  statChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    minWidth: 100,
  },
  statChipLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.5,
  },
  statChipValue: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 10,
  },
  tableScroll: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#CBD5E1",
  },
  thCell: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 0.5,
  },
  tableDataRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  tableDataRowAlt: {
    backgroundColor: "#F8FAFC",
  },
  tableDataRowError: {
    backgroundColor: "#FFF1F2",
  },
  tdCell: {
    fontSize: 12,
    color: "#1E293B",
  },
  tdStatusWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  progressBox: {
    marginTop: 10,
    padding: 12,
    backgroundColor: "#F0FDFA",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CCFBF1",
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0F766E",
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: "#E2E8F0",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#0F766E",
    borderRadius: 3,
  },
  footerBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    minHeight: 40,
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  commitBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: "#0F766E",
    minHeight: 40,
    justifyContent: "center",
  },
  commitBtnDisabled: {
    opacity: 0.5,
  },
  commitBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
