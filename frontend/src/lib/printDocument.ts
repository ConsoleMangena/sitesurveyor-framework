import type { BusinessProfile } from "./businessProfile.ts";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface PrintableLineItem {
  description: string;
  qty: number;
  unit: string | null;
  rate: number;
}

export type DocumentTheme = "modern" | "classic" | "minimal";

export interface PrintableDocument {
  type: "quote" | "invoice";
  id: string;
  status: string;
  client: string;
  project: string | null;
  date: string;
  dueDate?: string | null;
  expiryDate?: string | null;
  items: PrintableLineItem[];
  business: BusinessProfile;
  notes?: string;
  terms?: string;
  theme?: DocumentTheme;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMultiline(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

export function calculateDocumentTotal(items: PrintableLineItem[]) {
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.rate, 0);
  const vat = subtotal * 0.15;
  return { subtotal, vat, total: subtotal + vat };
}

interface ThemeStyles {
  accent: string;
  accentLight: string;
  headerBorder: string;
  tableHeadBg: string;
  tableHeadText: string;
  tableBorder: string;
  totalBg: string;
  totalText: string;
  cardBorder: string;
  fontFamily: string;
}

function getThemeStyles(theme: DocumentTheme): ThemeStyles {
  switch (theme) {
    case "classic":
      return {
        accent: "#1f2937",
        accentLight: "#f3f4f6",
        headerBorder: "#1f2937",
        tableHeadBg: "#f3f4f6",
        tableHeadText: "#111827",
        tableBorder: "#d1d5db",
        totalBg: "#1f2937",
        totalText: "#ffffff",
        cardBorder: "#d1d5db",
        fontFamily:
          'Georgia, "Times New Roman", Times, serif',
      };
    case "minimal":
      return {
        accent: "#000000",
        accentLight: "#ffffff",
        headerBorder: "#000000",
        tableHeadBg: "#ffffff",
        tableHeadText: "#000000",
        tableBorder: "#000000",
        totalBg: "#ffffff",
        totalText: "#000000",
        cardBorder: "#000000",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
      };
    case "modern":
    default:
      return {
        accent: "#2563eb",
        accentLight: "#eff6ff",
        headerBorder: "#2563eb",
        tableHeadBg: "#eff6ff",
        tableHeadText: "#1d4ed8",
        tableBorder: "#bfdbfe",
        totalBg: "#111827",
        totalText: "#ffffff",
        cardBorder: "#dbe3ef",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
      };
  }
}

function generateDocumentHtml(doc: PrintableDocument): string {
  const { subtotal, vat, total } = calculateDocumentTotal(doc.items);
  const title = doc.type === "quote" ? "QUOTATION" : "INVOICE";
  const totalLabel = doc.type === "quote" ? "Total Amount" : "Amount Due";
  const theme = doc.theme ?? "modern";
  const styles = getThemeStyles(theme);
  const business = doc.business;

  const rows = doc.items
    .filter((item) => item.description.trim().length > 0)
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.description)}</td>
          <td class="num">${Number(item.qty) || 0}</td>
          <td>${escapeHtml(item.unit || "—")}</td>
          <td class="num">${formatCurrency(Number(item.rate) || 0)}</td>
          <td class="num">${formatCurrency((Number(item.qty) || 0) * (Number(item.rate) || 0))}</td>
        </tr>`,
    )
    .join("");

  const dateRows = [
    { label: "Issue Date", value: formatDate(doc.date) },
    doc.type === "invoice" && doc.dueDate
      ? { label: "Due Date", value: formatDate(doc.dueDate) }
      : null,
    doc.type === "quote" && doc.expiryDate
      ? { label: "Expires On", value: formatDate(doc.expiryDate) }
      : null,
    { label: "Status", value: doc.status },
  ].filter(Boolean) as { label: string; value: string }[];

  const companyMetaLines = [
    business.address,
    business.taxNumber ? `Tax No: ${business.taxNumber}` : "",
    business.phone,
    business.email,
    business.website,
  ]
    .filter(Boolean)
    .join(" <span class=\"sep\">|</span> ");

  const logoHtml = `<img src="${window.location.origin}/logo.png" alt="" />`;

  const notesHtml = doc.notes
    ? `<div class="notes"><strong>Notes</strong>${formatMultiline(doc.notes)}</div>`
    : "";
  const termsHtml = doc.terms
    ? `<div class="terms"><strong>Terms & Conditions</strong>${formatMultiline(doc.terms)}</div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} ${escapeHtml(doc.id)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4; margin: 0; }
    body {
      margin: 0;
      font-family: ${styles.fontFamily};
      color: #1f2937;
      background: #f1f5f9;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 14mm 12mm;
      background: #fff;
      box-shadow: 0 10px 30px rgba(0,0,0,0.06);
      display: flex;
      flex-direction: column;
    }
    header.top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding-bottom: 16px;
      border-bottom: ${theme === "minimal" ? "2px" : "4px"} solid ${styles.headerBorder};
    }
    .brand { display: flex; align-items: center; gap: 12px; max-width: 60%; }
    .brand img { width: auto; height: ${theme === "minimal" ? "48" : "56"}px; max-width: 140px; object-fit: contain; }
    .brand-block { display: flex; flex-direction: column; }
    .brand-title {
      font-size: ${theme === "classic" ? "24" : "22"}px;
      font-weight: ${theme === "classic" ? "700" : "800"};
      color: #111827;
      letter-spacing: ${theme === "classic" ? "0" : "-0.02em"};
      margin: 0;
    }
    .brand-meta {
      font-size: 10px;
      color: #64748b;
      margin: 5px 0 0;
      line-height: 1.5;
    }
    .brand-meta .sep { margin: 0 6px; color: #cbd5e1; }
    .doc-title { text-align: right; }
    .doc-title h1 {
      margin: 0;
      font-size: ${theme === "classic" ? "26" : "28"}px;
      letter-spacing: ${theme === "minimal" ? "4px" : "2px"};
      color: #111827;
      font-weight: ${theme === "minimal" ? "300" : "800"};
    }
    .doc-title p {
      margin: 6px 0 0;
      color: #64748b;
      font-size: 13px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin: 18px 0;
    }
    .meta-card {
      border: 1px solid ${styles.cardBorder};
      border-radius: ${theme === "minimal" ? "0" : "8px"};
      padding: 10px 12px;
      page-break-inside: avoid;
    }
    .meta-label {
      color: #64748b;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .meta-value {
      font-size: 14px;
      font-weight: 700;
      color: #172033;
      line-height: 1.35;
      overflow-wrap: break-word;
      word-break: break-word;
    }
    .meta-value-muted {
      font-weight: 400;
      color: #4b5563;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; table-layout: fixed; }
    th.desc { width: 46%; }
    th.qty { width: 10%; }
    th.unit { width: 14%; }
    th.rate { width: 14%; }
    th.total { width: 16%; }
    th {
      background: ${styles.tableHeadBg};
      color: ${styles.tableHeadText};
      text-align: left;
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      font-weight: 700;
      padding: 11px 10px;
      border-bottom: 1px solid ${styles.tableBorder};
    }
    td {
      padding: 10px;
      border-bottom: 1px solid ${theme === "minimal" ? "#e5e7eb" : "#e5eaf2"};
      font-size: 12px;
      vertical-align: top;
      overflow-wrap: break-word;
      word-break: break-word;
    }
    tr { page-break-inside: avoid; }
    .num { text-align: right; white-space: nowrap; }
    .totals {
      width: 100%;
      max-width: 300px;
      margin-left: auto;
      margin-top: 18px;
      border: 1px solid ${styles.cardBorder};
      border-radius: ${theme === "minimal" ? "0" : "10px"};
      overflow: hidden;
      page-break-inside: avoid;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 16px;
      border-bottom: 1px solid ${theme === "minimal" ? "#e5e7eb" : "#e5eaf2"};
      font-size: 12px;
    }
    .total-row:last-child {
      border-bottom: none;
      background: ${styles.totalBg};
      color: ${styles.totalText};
      font-size: 14px;
      font-weight: 800;
    }
    .footer {
      margin-top: auto;
      padding-top: 14px;
      border-top: 1px solid ${theme === "minimal" ? "#000" : "#e5eaf2"};
      color: #64748b;
      font-size: 11px;
      display: flex;
      justify-content: space-between;
      gap: 16px;
    }
    .notes, .terms {
      margin-top: 16px;
      padding: 10px 12px;
      background: ${theme === "minimal" ? "#fff" : "#f8fafc"};
      border: 1px solid ${theme === "minimal" ? "#000" : "#e2e8f0"};
      border-radius: ${theme === "minimal" ? "0" : "8px"};
      font-size: 11px;
      color: #475569;
      line-height: 1.5;
      page-break-inside: avoid;
    }
    .notes strong, .terms strong {
      display: block;
      color: #1e293b;
      margin-bottom: 6px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    @media print {
      body { background: #fff; }
      .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 14mm 12mm; box-shadow: none; display: flex; flex-direction: column; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="top">
      <div class="brand">
        ${logoHtml}
        ${business.name ? `
        <div class="brand-block">
          <p class="brand-title">${escapeHtml(business.name)}</p>
          ${companyMetaLines ? `<p class="brand-meta">${companyMetaLines}</p>` : ""}
        </div>` : ""}
      </div>
      <div class="doc-title">
        <h1>${title}</h1>
        <p>${escapeHtml(doc.id)}</p>
      </div>
    </header>

    <section class="meta-grid">
      <div class="meta-card">
        <div class="meta-label">Bill To</div>
        <div class="meta-value">${escapeHtml(doc.client || "—")}</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">Project</div>
        <div class="meta-value">${escapeHtml(doc.project || "—")}</div>
      </div>
      ${dateRows
        .map(
          (row) => `
        <div class="meta-card">
          <div class="meta-label">${escapeHtml(row.label)}</div>
          <div class="meta-value meta-value-muted">${escapeHtml(row.value)}</div>
        </div>`,
        )
        .join("")}
    </section>

    <table>
      <thead>
        <tr>
          <th class="desc">Description</th>
          <th class="qty num">Qty</th>
          <th class="unit">Unit</th>
          <th class="rate num">Rate</th>
          <th class="total num">Total</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="5" style="text-align:center;color:#94a3b8;">No line items</td></tr>`}</tbody>
    </table>

    <section class="totals">
      <div class="total-row"><span>Subtotal</span><strong>${formatCurrency(subtotal)}</strong></div>
      <div class="total-row"><span>VAT (15%)</span><strong>${formatCurrency(vat)}</strong></div>
      <div class="total-row"><span>${totalLabel}</span><strong>${formatCurrency(total)}</strong></div>
    </section>

    ${notesHtml}
    ${termsHtml}

    <footer class="footer">
      ${business.name ? `<span>${escapeHtml(business.name)}</span>` : ""}
      <span>Generated ${new Date().toLocaleDateString("en-GB")}</span>
    </footer>
  </main>
</body>
</html>`;
}

export function printDocument(doc: PrintableDocument): void {
  const iframe = document.createElement("iframe");
  iframe.title = `Print ${doc.type} ${doc.id}`;
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;left:-9999px;top:-9999px;width:210mm;height:297mm;border:0;overflow:hidden;";
  document.body.appendChild(iframe);

  const printWindow = iframe.contentWindow;
  const printDocument = iframe.contentDocument || iframe.contentWindow?.document;
  if (!printDocument) {
    iframe.remove();
    return;
  }

  printDocument.open();
  printDocument.write(generateDocumentHtml(doc));
  printDocument.close();

  const triggerPrint = () => {
    printWindow?.focus();
    printWindow?.print();
    window.setTimeout(() => iframe.remove(), 1000);
  };

  const logo = printDocument.querySelector("img");
  if (logo && !logo.complete) {
    logo.addEventListener("load", triggerPrint, { once: true });
    logo.addEventListener("error", triggerPrint, { once: true });
  } else {
    window.setTimeout(triggerPrint, 100);
  }
}
