/**
 * Subscription Invoice PDF Renderer
 *
 * Renders a subscription_invoices row into a GST tax invoice PDF buffer.
 */

const PDFDocument = require("pdfkit");

function formatCurrency(amount) {
  return `Rs. ${Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * @param {object} invoice A row from subscription_invoices
 * @returns {Promise<Buffer>}
 */
function renderInvoicePdf(invoice) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc
      .fontSize(20)
      .fillColor("#047857")
      .text(invoice.seller_legal_name || "PharmaFlow Technologies", { align: "left" })
      .fontSize(10)
      .fillColor("#334155")
      .text(invoice.seller_address || "-")
      .text(`State: ${invoice.seller_state || "-"}`)
      .text(`GSTIN: ${invoice.seller_gstin || "-"}`)
      .moveDown(1.2);

    doc
      .fontSize(16)
      .fillColor("#0F172A")
      .text("TAX INVOICE", { align: "right" })
      .fontSize(10)
      .fillColor("#334155")
      .text(`Invoice No: ${invoice.invoice_number}`, { align: "right" })
      .text(`Issue Date: ${formatDate(invoice.issued_at)}`, { align: "right" })
      .text(`Status: ${invoice.status}`, { align: "right" })
      .moveDown(1);

    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .strokeColor("#E2E8F0")
      .stroke()
      .moveDown(0.8);

    doc
      .fontSize(11)
      .fillColor("#0F172A")
      .text("Billed To", { underline: false })
      .fontSize(10)
      .fillColor("#334155")
      .text(invoice.buyer_legal_name || "-")
      .text(invoice.buyer_address || "-")
      .text(`State: ${invoice.buyer_state || "-"}`)
      .text(`GSTIN: ${invoice.buyer_gstin || "Unregistered"}`)
      .moveDown(1);

    doc
      .text(
        `Billing Period: ${formatDate(invoice.billing_period_start)} - ${formatDate(invoice.billing_period_end)}`,
      )
      .text(`SAC Code: ${invoice.sac_code || "998313"}`)
      .moveDown(1);

    const tableTop = doc.y;
    doc.font("Helvetica-Bold").fontSize(10);
    doc.text("Description", 50, tableTop);
    doc.text("Amount", 450, tableTop, { width: 95, align: "right" });
    doc
      .moveTo(50, tableTop + 16)
      .lineTo(545, tableTop + 16)
      .strokeColor("#E2E8F0")
      .stroke();

    doc.font("Helvetica").fontSize(10);
    let rowY = tableTop + 24;
    doc.text("PharmaFlow SaaS Subscription Fee", 50, rowY);
    doc.text(formatCurrency(invoice.taxable_amount), 450, rowY, { width: 95, align: "right" });
    rowY += 20;

    if (invoice.is_interstate) {
      doc.text(`IGST (${invoice.gst_rate}%)`, 50, rowY);
      doc.text(formatCurrency(invoice.igst_amount), 450, rowY, { width: 95, align: "right" });
      rowY += 20;
    } else {
      doc.text(`CGST (${(invoice.gst_rate || 0) / 2}%)`, 50, rowY);
      doc.text(formatCurrency(invoice.cgst_amount), 450, rowY, { width: 95, align: "right" });
      rowY += 20;
      doc.text(`SGST (${(invoice.gst_rate || 0) / 2}%)`, 50, rowY);
      doc.text(formatCurrency(invoice.sgst_amount), 450, rowY, { width: 95, align: "right" });
      rowY += 20;
    }

    doc
      .moveTo(50, rowY)
      .lineTo(545, rowY)
      .strokeColor("#E2E8F0")
      .stroke();
    rowY += 8;

    doc.font("Helvetica-Bold").fontSize(11);
    doc.text("Total Amount", 50, rowY);
    doc.text(formatCurrency(invoice.total_amount), 450, rowY, { width: 95, align: "right" });

    doc
      .moveDown(4)
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#94A3B8")
      .text(
        "This is a system-generated invoice for platform subscription fees and does not require a physical signature.",
        50,
        undefined,
        { width: 495, align: "center" },
      );

    doc.end();
  });
}

module.exports = { renderInvoicePdf };
