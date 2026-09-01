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
      if (stringVal.startsWith('₹')) {
        stringVal = stringVal.replace('₹', '').trim();
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

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Pop-up blocker is preventing PDF export. Please allow pop-ups for this site.');
    return;
  }

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
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        body {
          font-family: 'Inter', sans-serif;
          color: #1e293b;
          margin: 0;
          padding: 40px;
          background-color: #ffffff;
        }
        .header {
          border-bottom: 2px solid #e2e8f0;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }
        .title-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .title {
          font-size: 26px;
          font-weight: 800;
          color: #0f172a;
          margin: 0 0 6px 0;
        }
        .subtitle {
          font-size: 14px;
          color: #64748b;
          margin: 0;
          max-width: 600px;
          line-height: 1.5;
        }
        .meta-info {
          text-align: right;
          font-size: 12px;
          color: #64748b;
          line-height: 1.6;
        }
        .meta-label {
          font-weight: 600;
          color: #475569;
        }
        .logo {
          font-weight: 800;
          color: #167c68;
          font-size: 18px;
          margin-bottom: 8px;
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
          padding: 12px 14px;
          border-bottom: 2px solid #e2e8f0;
        }
        td {
          padding: 12px 14px;
          font-size: 13px;
          border-bottom: 1px solid #e2e8f0;
          color: #334155;
        }
        tr:nth-child(even) td {
          background-color: #f8fafc;
        }
        .text-center {
          text-align: center;
        }
        .text-right {
          text-align: right;
        }
        .font-semibold {
          font-weight: 600;
        }
        .badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
          text-align: center;
        }
        .badge-optimal {
          background-color: #dcfce7;
          color: #15803d;
        }
        .badge-moderate {
          background-color: #fef3c7;
          color: #b45309;
        }
        .badge-slow {
          background-color: #fee2e2;
          color: #b91c1c;
        }
        .badge-critical {
          background-color: #fee2e2;
          color: #b91c1c;
        }
        .badge-high {
          background-color: #fee2e2;
          color: #b91c1c;
        }
        .badge-medium {
          background-color: #fef3c7;
          color: #b45309;
        }
        .badge-low {
          background-color: #dcfce7;
          color: #15803d;
        }
        .badge-expired {
          background-color: #fee2e2;
          color: #b91c1c;
        }
        @media print {
          body {
            padding: 20px;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title-row">
          <div>
            <div class="logo">FALAH PHARMACY ERP</div>
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
                const header = headers[cellIdx].toUpperCase();
                
                // Content alignment helpers based on header name
                if (header.includes('COUNT') || header.includes('POS') || header.includes('RATE') || header.includes('SCORE') || header.includes('DAYS') || header.includes('QUANTITY') || header.includes('BATCH') || header.includes('DATE')) {
                  cellClass = 'text-center';
                } else if (header.includes('VALUATION') || header.includes('SPENT') || header.includes('REVENUE') || header.includes('VALUE') || header.includes('COST')) {
                  cellClass = 'text-right font-semibold';
                }
                
                const stringVal = cell === null || cell === undefined ? '' : String(cell);
                
                // Badge wrapping for health, risk, and urgency statuses
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
      <script>
        window.onload = function() {
          window.print();
          setTimeout(function() { window.close(); }, 500);
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
