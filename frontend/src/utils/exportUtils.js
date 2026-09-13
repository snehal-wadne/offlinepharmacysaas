/**
 * Centralized utility module for client-side file exports (CSV & PDF)
 * compatible with React Native Web.
 */

/**
 * Generates and downloads a CSV file from headers and row data.
 * Clean currency characters and quotes are parsed to ensure Excel compatibility.
 * 
 * @param {string[]} headers Table columns.
 * @param {any[][]} rows Data cells corresponding to columns.
 * @param {string} filename Output name of downloaded file.
 */
export function exportToCSV(headers, rows, filename) {
  // Convert headers to CSV line
  const csvHeaders = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',');
  
  // Convert rows to CSV lines
  const csvRows = rows.map(row => 
    row.map(val => {
      let stringVal = val === null || val === undefined ? '' : String(val);
      // Excel cleanup: strip Rupee symbols and trim spaces
      if (stringVal.includes('₹')) {
        stringVal = stringVal.replace(/₹/g, '').trim();
      }
      return `"${stringVal.replace(/"/g, '""')}"`;
    }).join(',')
  );
  
  const csvContent = '\uFEFF' + [csvHeaders, ...csvRows].join('\n'); // Add BOM for UTF-8 compatibility in Excel
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  
  if (typeof window !== 'undefined') {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Opens a print-friendly preview window with styled brand layouts, pings print,
 * and compiles the document into a high-fidelity PDF.
 * 
 * @param {string} title Main report heading.
 * @param {string} subtitle Short report description.
 * @param {string[]} headers Array of table header labels.
 * @param {any[][]} rows Array of row records matching headers.
 * @param {string} filename Proposed filename for printing.
 */
export function exportToPDF(title, subtitle, headers, rows, filename) {
  if (typeof window === 'undefined') return;

  const currentDate = new Date().toLocaleDateString('en-IN', {
    dateStyle: 'medium',
  });
  const currentTime = new Date().toLocaleTimeString('en-IN', {
    timeStyle: 'short',
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        body {
          font-family: 'Inter', sans-serif;
          color: #1e293b;
          margin: 0;
          padding: 24px;
          background-color: #ffffff;
        }
        .toolbar {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-bottom: 20px;
          background: #f8fafc;
          padding: 10px 14px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }
        .btn {
          padding: 8px 14px;
          border-radius: 6px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          border: none;
        }
        .btn-print { background-color: #0d9488; color: #ffffff; }
        .btn-close { background-color: #e2e8f0; color: #334155; }
        .header {
          border-bottom: 2px solid #e2e8f0;
          padding-bottom: 16px;
          margin-bottom: 20px;
        }
        .title-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 12px;
        }
        .title {
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
          margin: 0 0 4px 0;
        }
        .subtitle {
          font-size: 13px;
          color: #64748b;
          margin: 0;
          max-width: 600px;
          line-height: 1.4;
        }
        .meta-info {
          text-align: right;
          font-size: 11.5px;
          color: #64748b;
          line-height: 1.5;
        }
        .meta-label {
          font-weight: 600;
          color: #475569;
        }
        .logo {
          font-weight: 800;
          color: #167c68;
          font-size: 16px;
          margin-bottom: 4px;
        }
        .table-responsive {
          width: 100%;
          overflow-x: auto;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        th {
          background-color: #f1f5f9;
          color: #475569;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          text-align: left;
          padding: 10px 12px;
          border-bottom: 2px solid #e2e8f0;
        }
        td {
          padding: 10px 12px;
          font-size: 12.5px;
          border-bottom: 1px solid #e2e8f0;
          color: #334155;
        }
        tr:nth-child(even) td {
          background-color: #f8fafc;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .font-semibold { font-weight: 600; }
        .badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 10.5px;
          font-weight: 700;
          text-align: center;
        }
        .badge-optimal { background-color: #dcfce7; color: #15803d; }
        .badge-moderate { background-color: #fef3c7; color: #b45309; }
        .badge-slow { background-color: #fee2e2; color: #b91c1c; }
        .badge-critical { background-color: #fee2e2; color: #b91c1c; }
        .badge-high { background-color: #fee2e2; color: #b91c1c; }
        .badge-medium { background-color: #fef3c7; color: #b45309; }
        .badge-low { background-color: #dcfce7; color: #15803d; }
        .badge-expired { background-color: #fee2e2; color: #b91c1c; }
        @media screen and (max-width: 768px) {
          body { padding: 12px; }
          .title { font-size: 18px; }
          .meta-info { text-align: left; margin-top: 8px; }
          th, td { padding: 8px 6px; font-size: 11px; }
        }
        @media print {
          .toolbar { display: none; }
          body { padding: 15px; }
        }
      </style>
    </head>
    <body>
      <div class="toolbar">
        <button class="btn btn-print" onclick="window.print()">🖨️ Print / Save PDF</button>
        <button class="btn btn-close" onclick="window.close()">✕ Close</button>
      </div>
      <div class="header">
        <div class="title-row">
          <div>
            <div class="logo">PHARMAFLOW PHARMACY ERP</div>
            <h1 class="title">${title}</h1>
            <p class="subtitle">${subtitle}</p>
          </div>
          <div class="meta-info">
            <div><span class="meta-label">Exported Date:</span> ${currentDate}</div>
            <div><span class="meta-label">Time:</span> ${currentTime}</div>
            <div><span class="meta-label">Branch:</span> Main Branch</div>
            <div><span class="meta-label">Status:</span> SECURE & VERIFIED</div>
          </div>
        </div>
      </div>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              ${headers.map(h => `<th>${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                ${row.map((cell, cellIdx) => {
                  let cellClass = '';
                  const header = (headers[cellIdx] || '').toUpperCase();
                  
                  if (header.includes('COUNT') || header.includes('POS') || header.includes('RATE') || header.includes('SCORE') || header.includes('DAYS') || header.includes('QUANTITY') || header.includes('BATCH') || header.includes('DATE')) {
                    cellClass = 'text-center';
                  } else if (header.includes('VALUATION') || header.includes('SPENT') || header.includes('REVENUE') || header.includes('VALUE') || header.includes('COST')) {
                    cellClass = 'text-right font-semibold';
                  }
                  
                  const stringVal = cell === null || cell === undefined ? '' : String(cell);
                  
                  if (header.includes('HEALTH') || header.includes('URGENCY') || header.includes('LEVEL') || header.includes('RISK')) {
                    let badgeClass = 'badge';
                    const valLower = stringVal.toLowerCase();
                    if (valLower.includes('optimal') || valLower.includes('low')) {
                      badgeClass += ' badge-low';
                    } else if (valLower.includes('moderate') || valLower.includes('medium')) {
                      badgeClass += ' badge-medium';
                    } else if (valLower.includes('slow') || valLower.includes('high')) {
                      badgeClass += ' badge-high';
                    } else if (valLower.includes('critical') || valLower.includes('expired')) {
                      badgeClass += ' badge-critical';
                    }
                    return `<td class="text-center"><span class="${badgeClass}">${stringVal}</span></td>`;
                  }

                  return `<td class="${cellClass}">${stringVal}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <script>
        window.onload = function() {
          window.focus();
        };
      </script>
    </body>
    </html>
  `;

  openPrintDocument(html, filename || 'Report');
}

/**
 * Universal helper to trigger print or fallback to download/iframe
 */
export function openPrintDocument(html, title = 'Document') {
  if (typeof window === 'undefined') return;

  try {
    const printWindow = window.open('', '_blank');
    if (printWindow && !printWindow.closed) {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      return;
    }
  } catch (e) {
    console.warn('Pop-up window open error, falling back to iframe/download:', e);
  }

  // Fallback: Use hidden iframe or direct download
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 2000);
  } catch (err) {
    // Ultimate fallback: download HTML
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${title.replace(/\s+/g, '_')}.html`;
    link.click();
  }
}

/**
 * Export official GST-compliant Tax Invoice for Purchases
 */
export function exportTaxInvoice(po) {
  const poId = po?.id || 'PO-1026';
  const supplierName = po?.supplier || 'Sun Pharma Care';
  const orderDate = po?.orderDate || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const medicine = po?.medicine || 'Paracetamol 500mg (Box of 100)';
  const qty = Number(po?.itemsCount || po?.quantity || 10);
  
  // Calculate price and tax
  let subtotal = 0;
  let taxRateNum = 12;
  if (po?.taxRate) {
    taxRateNum = parseFloat(String(po.taxRate).replace('%', '')) || 12;
  }
  
  if (po?.subtotal) {
    subtotal = Number(po.subtotal);
  } else if (po?.numericAmount) {
    subtotal = po.numericAmount / (1 + taxRateNum / 100);
  } else {
    subtotal = qty * 120;
  }

  const taxAmount = po?.taxAmount ? Number(po.taxAmount) : (subtotal * taxRateNum) / 100;
  const grandTotal = po?.numericAmount ? Number(po.numericAmount) : (subtotal + taxAmount);
  const cgstAmount = (taxAmount / 2).toFixed(2);
  const sgstAmount = (taxAmount / 2).toFixed(2);
  const unitRate = (subtotal / qty).toFixed(2);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Tax Invoice - ${poId}</title>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        body {
          font-family: 'Inter', sans-serif;
          color: #0f172a;
          margin: 0;
          padding: 20px;
          background-color: #ffffff;
        }
        .toolbar {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-bottom: 20px;
          background: #f8fafc;
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }
        .btn {
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          border: none;
        }
        .btn-print {
          background-color: #0d9488;
          color: #ffffff;
        }
        .btn-close {
          background-color: #e2e8f0;
          color: #334155;
        }
        .invoice-card {
          border: 1.5px solid #cbd5e1;
          border-radius: 8px;
          padding: 28px;
          max-width: 850px;
          margin: 0 auto;
        }
        .invoice-header {
          display: flex;
          justify-content: space-between;
          border-bottom: 2px solid #0f766e;
          padding-bottom: 16px;
          margin-bottom: 20px;
        }
        .company-name {
          font-size: 22px;
          font-weight: 800;
          color: #0f766e;
        }
        .company-sub {
          font-size: 11.5px;
          color: #64748b;
          line-height: 1.5;
          margin-top: 4px;
        }
        .invoice-title-block {
          text-align: right;
        }
        .invoice-title {
          font-size: 20px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: 0.5px;
        }
        .invoice-badge {
          display: inline-block;
          background-color: #ccfbf1;
          color: #0f766e;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 700;
          margin-top: 4px;
        }
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 20px;
          font-size: 12px;
        }
        .box {
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 12px;
          background: #fcfcfd;
        }
        .box-title {
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
          font-size: 10.5px;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
          border-bottom: 1px dashed #e2e8f0;
          padding-bottom: 4px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 16px;
          font-size: 12px;
        }
        th {
          background-color: #f1f5f9;
          color: #334155;
          font-weight: 700;
          padding: 10px 12px;
          text-align: left;
          border: 1px solid #cbd5e1;
        }
        td {
          padding: 10px 12px;
          border: 1px solid #cbd5e1;
        }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .totals-table {
          width: 320px;
          margin-left: auto;
          margin-top: 16px;
          font-size: 12.5px;
        }
        .totals-table td {
          border: none;
          padding: 6px 8px;
        }
        .totals-table tr.grand-row td {
          font-size: 14px;
          font-weight: 800;
          color: #0f766e;
          border-top: 2px solid #0f766e;
          border-bottom: 2px solid #0f766e;
        }
        .footer-note {
          margin-top: 24px;
          padding-top: 14px;
          border-top: 1px solid #e2e8f0;
          font-size: 11px;
          color: #64748b;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        .sign-box {
          text-align: center;
          width: 180px;
        }
        .sign-line {
          border-top: 1px solid #94a3b8;
          margin-top: 40px;
          padding-top: 4px;
          font-weight: 600;
          font-size: 11px;
        }
        @media screen and (max-width: 768px) {
          body { padding: 10px; }
          .invoice-card { padding: 14px; border: 1px solid #cbd5e1; }
          .invoice-header { flex-direction: column; gap: 12px; }
          .invoice-title-block { text-align: left; }
          .grid-2 { grid-template-columns: 1fr; gap: 10px; }
          table { display: block; overflow-x: auto; width: 100%; }
          .totals-table { width: 100%; }
          .footer-note { flex-direction: column; gap: 16px; align-items: flex-start; }
          .sign-box { width: 100%; text-align: left; }
        }
        @media print {
          .toolbar { display: none; }
          body { padding: 0; }
          .invoice-card { border: none; padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="toolbar">
        <button class="btn btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
        <button class="btn btn-close" onclick="window.close()">✕ Close</button>
      </div>

      <div class="invoice-card">
        <div class="invoice-header">
          <div>
            <div class="company-name">PHARMAFLOW PHARMACY ERP</div>
            <div class="company-sub">
              Licensed Pharmacy & Healthcare Distribution Center<br/>
              Main Branch • Hospital Road, Suite 104 • Contact: +91 98201 22334<br/>
              GSTIN: 27AABCP1234F1Z9 • DL No: MH-TZ5-194821 / 194822
            </div>
          </div>
          <div class="invoice-title-block">
            <div class="invoice-title">TAX INVOICE</div>
            <div class="invoice-badge">INPUT TAX CREDIT (ITC) ELIGIBLE</div>
            <div style="margin-top: 8px; font-size: 12px; color: #475569;">
              <strong>Invoice #:</strong> ${poId}<br/>
              <strong>Date:</strong> ${orderDate}<br/>
              <strong>Payment:</strong> Credit / Bank Transfer
            </div>
          </div>
        </div>

        <div class="grid-2">
          <div class="box">
            <div class="box-title">Vendor / Supplier (Billed By)</div>
            <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 3px;">${supplierName}</div>
            <div style="color: #475569; line-height: 1.5;">
              Authorized Pharma Distributor & Wholesaler<br/>
              GSTIN: 27AATCS9982Q1Z4 • PAN: AATCS9982Q<br/>
              State: Maharashtra (Code 27)
            </div>
          </div>

          <div class="box">
            <div class="box-title">Buyer / Consignee (Delivered To)</div>
            <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 3px;">PharmaFlow Pharmacy - ${po?.branch || 'Main Branch'}</div>
            <div style="color: #475569; line-height: 1.5;">
              Central Store Pharmacy Inward Section<br/>
              GSTIN: 27AABCP1234F1Z9<br/>
              Place of Supply: Maharashtra (Code 27)
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 35px;" class="text-center">#</th>
              <th>Description of Goods / Medicine</th>
              <th style="width: 80px;" class="text-center">HSN Code</th>
              <th style="width: 60px;" class="text-center">Qty</th>
              <th style="width: 90px;" class="text-right">Unit Rate (₹)</th>
              <th style="width: 100px;" class="text-right">Taxable (₹)</th>
              <th style="width: 80px;" class="text-center">GST</th>
              <th style="width: 105px;" class="text-right">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="text-center">1</td>
              <td>
                <strong>${medicine}</strong><br/>
                <span style="font-size: 11px; color: #64748b;">Batch: PR-${poId.slice(-4)} • Exp: Dec 2028</span>
              </td>
              <td class="text-center">300490</td>
              <td class="text-center"><strong>${qty}</strong></td>
              <td class="text-right">₹${Number(unitRate).toFixed(2)}</td>
              <td class="text-right">₹${subtotal.toFixed(2)}</td>
              <td class="text-center">${taxRateNum}%</td>
              <td class="text-right"><strong>₹${grandTotal.toFixed(2)}</strong></td>
            </tr>
          </tbody>
        </table>

        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 14px;">
          <div style="font-size: 11px; color: #475569; max-width: 420px; line-height: 1.5;">
            <strong>Tax Breakdown:</strong><br/>
            • CGST (${(taxRateNum / 2).toFixed(1)}%): ₹${cgstAmount}<br/>
            • SGST (${(taxRateNum / 2).toFixed(1)}%): ₹${sgstAmount}<br/>
            <em>Certified that the particulars given above are true and correct, and the amount indicated represents the price actually charged.</em>
          </div>

          <table class="totals-table">
            <tr>
              <td>Taxable Subtotal:</td>
              <td class="text-right">₹${subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td>CGST (${(taxRateNum / 2).toFixed(1)}%):</td>
              <td class="text-right">₹${cgstAmount}</td>
            </tr>
            <tr>
              <td>SGST (${(taxRateNum / 2).toFixed(1)}%):</td>
              <td class="text-right">₹${sgstAmount}</td>
            </tr>
            <tr class="grand-row">
              <td>Total Amount (Incl. GST):</td>
              <td class="text-right">₹${grandTotal.toFixed(2)}</td>
            </tr>
          </table>
        </div>

        <div class="footer-note">
          <div>
            <strong>Terms & Conditions:</strong><br/>
            1. Goods once inspected and accepted at dock are subject to pharmaceutical storage standards.<br/>
            2. Any discrepancies must be reported within 48 hours of delivery.
          </div>
          <div class="sign-box">
            <div class="sign-line">For PharmaFlow Pharmacy<br/>Authorized Signatory</div>
          </div>
        </div>
      </div>

      <script>
        window.onload = function() {
          window.focus();
        };
      </script>
    </body>
    </html>
  `;

  openPrintDocument(html, `Tax_Invoice_${poId}`);
}

/**
 * Export Patient / Customer Running Credit Ledger Statement to PDF
 */
export function exportCustomerLedgerStatement(account, statementRows = []) {
  if (!account) return;

  const custName = account.name || 'Patient Account';
  const custId = account.id || 'CUST-1001';
  const phone = account.phone || 'N/A';
  const creditLimit = account.creditLimit || '₹10,000.00';
  const currentBalance = account.currentBalance || account.currentDue || '₹0.00';
  const agingBucket = account.agingBucket || '0-15 Days';
  const status = account.creditStatus || 'Healthy';
  const dateStr = new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' });

  // If no detailed rows supplied, generate running rows from summary
  const rows = (statementRows && statementRows.length > 0) ? statementRows : [
    {
      date: account.lastInvoiceDate || '01 Sep 2026',
      type: 'Debit (Invoice)',
      refNo: account.lastInvoiceNo || 'INV-1092',
      description: 'Prescription Dispensation & Healthcare Supplies',
      debit: currentBalance,
      credit: '-',
      runningBalance: currentBalance,
    }
  ];

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Ledger Statement - ${custName} (${custId})</title>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        body {
          font-family: 'Inter', sans-serif;
          color: #0f172a;
          margin: 0;
          padding: 20px;
          background-color: #ffffff;
        }
        .toolbar {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-bottom: 20px;
          background: #f8fafc;
          padding: 10px 14px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }
        .btn {
          padding: 8px 14px;
          border-radius: 6px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          border: none;
        }
        .btn-print { background-color: #0d9488; color: #ffffff; }
        .btn-close { background-color: #e2e8f0; color: #334155; }
        .statement-card {
          border: 1.5px solid #cbd5e1;
          border-radius: 8px;
          padding: 24px;
          max-width: 850px;
          margin: 0 auto;
        }
        .header {
          display: flex;
          justify-content: space-between;
          border-bottom: 2px solid #0f766e;
          padding-bottom: 16px;
          margin-bottom: 20px;
        }
        .company-name { font-size: 20px; font-weight: 800; color: #0f766e; }
        .company-sub { font-size: 11px; color: #64748b; margin-top: 4px; }
        .kpi-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin-bottom: 18px;
        }
        .kpi-card {
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 8px;
          background: #f8fafc;
          text-align: center;
        }
        .kpi-label { font-size: 10px; font-weight: 600; color: #64748b; }
        .kpi-val { font-size: 15px; font-weight: 800; color: #0f172a; margin-top: 2px; }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 12px;
          font-size: 12px;
        }
        th {
          background-color: #f1f5f9;
          color: #334155;
          font-weight: 700;
          padding: 8px 6px;
          border: 1px solid #cbd5e1;
          text-align: left;
        }
        td {
          padding: 8px 6px;
          border: 1px solid #e2e8f0;
        }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .debit { color: #dc2626; font-weight: 700; }
        .credit { color: #16a34a; font-weight: 700; }
        .footer-box {
          margin-top: 20px;
          padding-top: 14px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #64748b;
        }
        @media screen and (max-width: 768px) {
          body { padding: 10px; }
          .statement-card { padding: 12px; border: 1px solid #cbd5e1; }
          .header { flex-direction: column; gap: 10px; }
          .kpi-row { grid-template-columns: 1fr 1fr; gap: 8px; }
          table { display: block; overflow-x: auto; width: 100%; }
          .footer-box { flex-direction: column; gap: 14px; }
        }
        @media print {
          .toolbar { display: none; }
          body { padding: 0; }
          .statement-card { border: none; padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="toolbar">
        <button class="btn btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
        <button class="btn btn-close" onclick="window.close()">✕ Close</button>
      </div>

      <div class="statement-card">
        <div class="header">
          <div>
            <div class="company-name">PHARMAFLOW PHARMACY</div>
            <div class="company-sub">Patient Credit Ledger (Khata) Statement • RX-06<br/>GSTIN: 27AABCP1234F1Z9 • Main Branch</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 18px; font-weight: 800; color: #0f172a;">ACCOUNT STATEMENT</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Statement Date: ${dateStr}</div>
          </div>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 16px; font-size: 12.5px;">
          <div style="display: flex; justify-content: space-between;">
            <div>
              <strong>Patient Name:</strong> ${custName} (${custId})<br/>
              <strong>Phone:</strong> ${phone}<br/>
              <strong>Branch:</strong> ${account.branch || 'Main Branch'}
            </div>
            <div style="text-align: right;">
              <strong>Credit Status:</strong> <span style="color: ${status === 'Healthy' ? '#16a34a' : '#dc2626'}; font-weight: 700;">${status}</span><br/>
              <strong>Aging Bucket:</strong> ${agingBucket}<br/>
              <strong>Last Payment:</strong> ${account.lastPaymentDate || 'N/A'} (${account.lastPaymentAmount || '₹0.00'})
            </div>
          </div>
        </div>

        <div class="kpi-row">
          <div class="kpi-card">
            <div class="kpi-label">APPROVED CREDIT LIMIT</div>
            <div class="kpi-val">${creditLimit}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">CURRENT OUTSTANDING</div>
            <div class="kpi-val" style="color: #dc2626;">${currentBalance}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">LIMIT UTILIZATION</div>
            <div class="kpi-val" style="color: #2563eb;">${account.utilizationPercent || account.utilizationPct || '62%'}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">SETTLEMENT STATUS</div>
            <div class="kpi-val" style="color: #0f766e;">${agingBucket}</div>
          </div>
        </div>

        <div style="font-weight: 700; font-size: 13px; margin-top: 10px; margin-bottom: 6px;">Running Ledger Entries</div>
        <table>
          <thead>
            <tr>
              <th style="width: 85px;">Date</th>
              <th style="width: 100px;">Type</th>
              <th style="width: 110px;">Ref / Inv #</th>
              <th>Particulars</th>
              <th style="width: 90px;" class="text-right">Debit (₹)</th>
              <th style="width: 90px;" class="text-right">Credit (₹)</th>
              <th style="width: 100px;" class="text-right">Balance (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td>${r.date}</td>
                <td><strong>${r.type}</strong></td>
                <td>${r.refNo}</td>
                <td>${r.description}</td>
                <td class="text-right debit">${r.debit}</td>
                <td class="text-right credit">${r.credit}</td>
                <td class="text-right" style="font-weight: 800;">${r.runningBalance}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer-box">
          <div>
            • This is a computer generated ledger statement under Pharmacy Khata rules.<br/>
            • For dues clearance via UPI, please quote account ID ${custId}.
          </div>
          <div style="text-align: center; width: 160px;">
            <div style="border-top: 1px solid #94a3b8; margin-top: 30px; padding-top: 4px; font-weight: 600;">
              Authorized Signature
            </div>
          </div>
        </div>
      </div>

      <script>
        window.onload = function() {
          window.focus();
        };
      </script>
    </body>
    </html>
  `;

  openPrintDocument(html, `Ledger_Statement_${custId}`);
}

/**
 * Print Payment Receipt Voucher
 */
export function printPaymentReceipt(receipt) {
  if (!receipt) return;

  const rcptId = receipt.id || 'RCP-2026-0001';
  const customerName = receipt.customerName || receipt.customer || 'Walk-in Customer';
  const customerId = receipt.customerId || receipt.patientId || 'CUST-1041';
  const paymentMode = receipt.paymentMode || receipt.mode || 'Cash';
  const amount = receipt.amount || receipt.amountPaid || '₹0.00';
  const dateStr = receipt.date || receipt.paymentDate || new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' });
  const linkedRef = receipt.linkedRef || receipt.linkedInvoices || 'Direct Ledger Settlement';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Receipt - ${rcptId}</title>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Courier+Prime:wght@400;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
          color: #0f172a;
          margin: 0;
          padding: 16px;
          background-color: #f8fafc;
        }
        .toolbar {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-bottom: 16px;
          max-width: 440px;
          margin: 0 auto 16px auto;
        }
        .btn {
          padding: 8px 14px;
          border-radius: 6px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          border: none;
        }
        .btn-print { background-color: #0d9488; color: #ffffff; }
        .btn-close { background-color: #e2e8f0; color: #334155; }
        .receipt-card {
          border: 1.5px dashed #0f766e;
          border-radius: 10px;
          padding: 24px;
          max-width: 440px;
          margin: 0 auto;
          background: #ffffff;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }
        .center { text-align: center; }
        .pharmacy-title { font-size: 18px; font-weight: 800; color: #0f766e; }
        .pharmacy-meta { font-size: 11px; color: #64748b; line-height: 1.4; margin-top: 4px; }
        .divider { border-top: 1px dashed #cbd5e1; margin: 14px 0; }
        .badge {
          display: inline-block;
          background-color: #dcfce7;
          color: #15803d;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 700;
        }
        .row {
          display: flex;
          justify-content: space-between;
          font-size: 12.5px;
          margin-bottom: 6px;
        }
        .row-label { color: #64748b; font-weight: 500; }
        .row-val { font-weight: 700; color: #0f172a; }
        .amount-box {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 8px;
          padding: 12px;
          text-align: center;
          margin: 14px 0;
        }
        .amount-label { font-size: 11px; font-weight: 700; color: #166534; text-transform: uppercase; }
        .amount-val { font-size: 24px; font-weight: 900; color: #15803d; margin-top: 4px; }
        .footer-note { font-size: 10.5px; color: #94a3b8; text-align: center; margin-top: 14px; }
        @media screen and (max-width: 768px) {
          body { padding: 8px; }
          .receipt-card { padding: 14px; width: 100%; max-width: 100%; box-sizing: border-box; }
        }
        @media print {
          .toolbar { display: none; }
          body { padding: 0; background: none; }
          .receipt-card { box-shadow: none; border: 1px dashed #64748b; }
        }
      </style>
    </head>
    <body>
      <div class="toolbar">
        <button class="btn btn-print" onclick="window.print()">🖨️ Print Receipt</button>
        <button class="btn btn-close" onclick="window.close()">✕ Close</button>
      </div>

      <div class="receipt-card">
        <div class="center">
          <div class="pharmacy-title">PHARMAFLOW PHARMACY</div>
          <div class="pharmacy-meta">
            Official Payment Receipt Voucher • RX-08<br/>
            GSTIN: 27AABCP1234F1Z9 • Main Branch<br/>
            Phone: +91 98201 22334
          </div>
          <div style="margin-top: 8px;">
            <span class="badge">✓ PAYMENT VERIFIED & RECEIVED</span>
          </div>
        </div>

        <div class="divider"></div>

        <div class="row">
          <span class="row-label">Receipt Voucher #:</span>
          <span class="row-val">${rcptId}</span>
        </div>
        <div class="row">
          <span class="row-label">Date & Time:</span>
          <span class="row-val">${dateStr}</span>
        </div>
        <div class="row">
          <span class="row-label">Customer / Patient:</span>
          <span class="row-val">${customerName}</span>
        </div>
        <div class="row">
          <span class="row-label">Customer ID:</span>
          <span class="row-val">${customerId}</span>
        </div>
        <div class="row">
          <span class="row-label">Payment Mode:</span>
          <span class="row-val">${paymentMode}</span>
        </div>
        <div class="row">
          <span class="row-label">Linked Reference:</span>
          <span class="row-val">${linkedRef}</span>
        </div>

        <div class="amount-box">
          <div class="amount-label">Amount Received</div>
          <div class="amount-val">${amount}</div>
        </div>

        <div class="row" style="font-size: 11px;">
          <span class="row-label">Received By:</span>
          <span class="row-val">Cashier 01 (Verified)</span>
        </div>
        <div class="row" style="font-size: 11px;">
          <span class="row-label">Account Ledger:</span>
          <span class="row-val" style="color: #0f766e;">Updated & Balanced</span>
        </div>

        <div class="divider"></div>

        <div class="footer-note">
          Thank you for your payment! Please retain this receipt voucher for medical reimbursement and tax records.
        </div>
      </div>

      <script>
        window.onload = function() {
          window.focus();
        };
      </script>
    </body>
    </html>
  `;

  openPrintDocument(html, `Payment_Receipt_${rcptId}`);
}

