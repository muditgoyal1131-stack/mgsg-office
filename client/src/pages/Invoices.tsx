import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  getInvoices, getReceivables, exportInvoices,
  createInvoice, updateInvoice, recordPayment, cancelInvoice, deleteInvoice,
  getTasks, getBillingEntities, getClients,
  getInvoiceSettings, updateInvoiceSettings,
} from '../api';
import ProfitCentreAccess from './ProfitCentreAccess';
import { useAuth } from '../contexts/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'PARTIALLY_PAID' | 'OVERDUE' | 'CANCELLED';
type TaxType = 'CGST_SGST' | 'IGST' | 'NONE';
type GSTType = 'REGISTERED' | 'B2C' | 'EXPORT';

interface ClientInfo { id: number; clientCode: string; clientName: string; }
interface TaskInfo { id: number; taskId: string; taskName: string; status: string; billedAmount?: number; clientId?: number; client?: ClientInfo; }

interface ClientGstin {
  id: number; label?: string; gstin?: string;
  gstType: GSTType; address?: string; city?: string;
  state?: string; stateCode?: string; isPrimary?: boolean;
}

interface BillingEntityFull {
  id: number; name: string;
  gstin?: string; pan?: string; address?: string; city?: string;
  state?: string; stateCode?: string; email?: string; phone?: string;
  bankName?: string; bankAccount?: string; bankIfsc?: string; bankBranch?: string;
}

interface LineItem {
  id?: number; slNo: number; description: string; hsnSac?: string;
  quantity: number; rate: number; unit?: string; amount: number;
}

interface ProfitCentreInfo { id: number; name: string; }

interface Invoice {
  id: number; invoiceNumber: string; status: InvoiceStatus;
  amount: number; taxType: TaxType;
  cgstRate?: number; sgstRate?: number; igstRate?: number;
  cgstAmount?: number; sgstAmount?: number; igstAmount?: number;
  totalAmount?: number;
  paymentAmount?: number; paymentDate?: string; paymentNotes?: string;
  invoiceDate: string; dueDate?: string; notes?: string; hsnSacCode?: string;
  template: number;
  task: TaskInfo; client?: ClientInfo;
  billingEntity?: BillingEntityFull;
  clientGstin?: ClientGstin; clientGstinId?: number;
  lineItems?: LineItem[];
  profitCentre?: ProfitCentreInfo;
  createdAt: string;
}

interface Receivable {
  id: number; invoiceNumber: string; amount: number; paymentAmount?: number;
  invoiceDate: string; dueDate?: string; client?: ClientInfo; task?: TaskInfo;
  daysOverdue: number; ageingBucket: string;
}

interface InvoiceSettings { id: number; prefix: string; suffix: string; startNumber: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtD = (d?: string) => (d ? format(new Date(d), 'dd-MMM-yyyy') : '—');
const today = () => format(new Date(), 'yyyy-MM-dd');

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: 'Draft', SENT: 'Sent', PAID: 'Paid',
  PARTIALLY_PAID: 'Partially Paid', OVERDUE: 'Overdue', CANCELLED: 'Cancelled',
};
const STATUS_CLASS: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600', SENT: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700', PARTIALLY_PAID: 'bg-yellow-100 text-yellow-700',
  OVERDUE: 'bg-red-100 text-red-700', CANCELLED: 'bg-gray-100 text-gray-400 line-through',
};

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function numToWords(n: number): string {
  if (n === 0) return 'Zero';
  const chunks = (v: number): string => {
    if (v === 0) return '';
    if (v < 20) return ONES[v] + ' ';
    if (v < 100) return TENS[Math.floor(v / 10)] + (v % 10 ? ' ' + ONES[v % 10] : '') + ' ';
    return ONES[Math.floor(v / 100)] + ' Hundred ' + chunks(v % 100);
  };
  const inr = Math.floor(n);
  const paise = Math.round((n - inr) * 100);
  let words = '';
  if (inr >= 10000000) { words += chunks(Math.floor(inr / 10000000)) + 'Crore '; }
  if (inr >= 100000) { words += chunks(Math.floor((inr % 10000000) / 100000)) + 'Lakh '; }
  if (inr >= 1000) { words += chunks(Math.floor((inr % 100000) / 1000)) + 'Thousand '; }
  words += chunks(inr % 1000);
  words = words.trim();
  if (paise > 0) words += ' and ' + chunks(paise).trim() + ' Paise';
  return 'INR ' + words + ' Only';
}

function autoTaxType(be?: BillingEntityFull, cg?: ClientGstin): TaxType {
  if (!cg || !be) return 'NONE';
  if (cg.gstType === 'EXPORT') return 'NONE';
  if (!cg.stateCode || !be.stateCode) return 'NONE';
  return cg.stateCode === be.stateCode ? 'CGST_SGST' : 'IGST';
}

// ── Summary Card ──────────────────────────────────────────────────────────────

const SummaryCard: React.FC<{ label: string; value: string; sub?: string; color?: string }> = ({
  label, value, sub, color = 'text-gray-800',
}) => (
  <div className="card p-4">
    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
  </div>
);

const StatusBadge: React.FC<{ status: InvoiceStatus }> = ({ status }) => (
  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_CLASS[status]}`}>
    {STATUS_LABEL[status]}
  </span>
);

// ── Standalone PDF Generator ──────────────────────────────────────────────────

async function generateAndDownloadPDF(invoice: Invoice, template: number = 1): Promise<void> {
  const html = buildGSTHTML({ ...invoice, template }, template);
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:-9999px;top:0;width:794px;background:#fff;';
  container.innerHTML = html;
  document.body.appendChild(container);
  await new Promise((r) => setTimeout(r, 300));
  try {
    const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
    const imgData = canvas.toDataURL('image/jpeg', 0.97);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgH  = (canvas.height * pageW) / canvas.width;
    if (imgH <= pageH) {
      pdf.addImage(imgData, 'JPEG', 0, 0, pageW, imgH);
    } else {
      const ratio = canvas.width / pageW;
      let sliceY = 0;
      while (sliceY < canvas.height) {
        const sliceH = Math.min(pageH * ratio, canvas.height - sliceY);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width; sliceCanvas.height = sliceH;
        sliceCanvas.getContext('2d')!.drawImage(canvas, 0, sliceY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        if (sliceY > 0) pdf.addPage();
        pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.97), 'JPEG', 0, 0, pageW, sliceH / ratio);
        sliceY += sliceH;
      }
    }
    pdf.save(`Invoice_${invoice.invoiceNumber}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

// ── GST Print Templates ───────────────────────────────────────────────────────

function buildGSTHTML(inv: Invoice, template: number): string {
  const be = inv.billingEntity;
  const cg = inv.clientGstin;
  const taxable = Number(inv.amount);
  const total = Number(inv.totalAmount ?? inv.amount);
  const taxLabel = inv.taxType === 'CGST_SGST' ? 'CGST + SGST' : inv.taxType === 'IGST' ? 'IGST' : 'No Tax';

  // Use line items if present, else a single line from task
  const lines: LineItem[] = inv.lineItems?.length
    ? inv.lineItems
    : [{ slNo: 1, description: inv.task?.taskName ?? '', hsnSac: inv.hsnSacCode, quantity: 1, rate: taxable, amount: taxable }];

  const lineRows = lines.map(li => `
    <tr>
      <td class="td center">${li.slNo}</td>
      <td class="td">${li.description}${li.hsnSac ? `<br/><small>HSN/SAC: ${li.hsnSac}</small>` : ''}</td>
      <td class="td center">${li.quantity}</td>
      <td class="td center">${li.unit ?? ''}</td>
      <td class="td right">${fmt(li.rate)}</td>
      <td class="td right bold">${fmt(li.amount)}</td>
    </tr>`).join('');

  const taxRows = inv.taxType === 'CGST_SGST' ? `
    <tr>
      <td colspan="5" class="td right">Output CGST @ ${inv.cgstRate ?? 9}%</td>
      <td class="td right bold">${fmt(Number(inv.cgstAmount ?? 0))}</td>
    </tr>
    <tr>
      <td colspan="5" class="td right">Output SGST/UTGST @ ${inv.sgstRate ?? 9}%</td>
      <td class="td right bold">${fmt(Number(inv.sgstAmount ?? 0))}</td>
    </tr>` : inv.taxType === 'IGST' ? `
    <tr>
      <td colspan="5" class="td right">Output IGST @ ${inv.igstRate ?? 18}%</td>
      <td class="td right bold">${fmt(Number(inv.igstAmount ?? 0))}</td>
    </tr>` : '';

  const taxSummaryRows = inv.taxType === 'CGST_SGST' ? `
    <tr>
      <td class="td">${lines[0]?.hsnSac ?? inv.hsnSacCode ?? ''}</td>
      <td class="td right">${fmt(taxable)}</td>
      <td class="td center">${inv.cgstRate ?? 9}%</td>
      <td class="td right">${fmt(Number(inv.cgstAmount ?? 0))}</td>
      <td class="td center">${inv.sgstRate ?? 9}%</td>
      <td class="td right">${fmt(Number(inv.sgstAmount ?? 0))}</td>
      <td class="td right">${fmt(Number(inv.cgstAmount ?? 0) + Number(inv.sgstAmount ?? 0))}</td>
    </tr>` : inv.taxType === 'IGST' ? `
    <tr>
      <td class="td">${lines[0]?.hsnSac ?? inv.hsnSacCode ?? ''}</td>
      <td class="td right">${fmt(taxable)}</td>
      <td class="td center" colspan="2">—</td>
      <td class="td center">${inv.igstRate ?? 18}%</td>
      <td class="td right">${fmt(Number(inv.igstAmount ?? 0))}</td>
      <td class="td right">${fmt(Number(inv.igstAmount ?? 0))}</td>
    </tr>` : '';

  const taxSummaryTotal = inv.taxType === 'CGST_SGST' ? `
    <tr class="total-row">
      <td class="td bold">Total</td>
      <td class="td right bold">${fmt(taxable)}</td>
      <td class="td"></td>
      <td class="td right bold">${fmt(Number(inv.cgstAmount ?? 0))}</td>
      <td class="td"></td>
      <td class="td right bold">${fmt(Number(inv.sgstAmount ?? 0))}</td>
      <td class="td right bold">${fmt(Number(inv.cgstAmount ?? 0) + Number(inv.sgstAmount ?? 0))}</td>
    </tr>` : inv.taxType === 'IGST' ? `
    <tr class="total-row">
      <td class="td bold">Total</td>
      <td class="td right bold">${fmt(taxable)}</td>
      <td class="td" colspan="2"></td>
      <td class="td"></td>
      <td class="td right bold">${fmt(Number(inv.igstAmount ?? 0))}</td>
      <td class="td right bold">${fmt(Number(inv.igstAmount ?? 0))}</td>
    </tr>` : '';

  const taxAmt = total - taxable;
  const taxAmtWords = taxAmt > 0 ? `<p class="small"><strong>Tax Amount (in words):</strong> ${numToWords(taxAmt)}</p>` : '';

  // Template color schemes
  const palette = template === 2
    ? { headerBg: '#1e3a5f', headerText: '#fff', accentBorder: '#1e3a5f', accentBg: '#eef2f7' }
    : template === 3
    ? { headerBg: '#f5f5f5', headerText: '#222', accentBorder: '#888', accentBg: '#fafafa' }
    : { headerBg: '#fff', headerText: '#000', accentBorder: '#000', accentBg: '#fff' };

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Tax Invoice ${inv.invoiceNumber}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 20px; }
  h1 { text-align: center; font-size: 16px; font-weight: bold; margin-bottom: 8px; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; }
  .outer { border: 1px solid #555; }
  .td { border: 1px solid #ccc; padding: 4px 6px; vertical-align: top; }
  .th { border: 1px solid #888; padding: 4px 6px; background: #f0f0f0; font-weight: bold; text-align: center; }
  .bold { font-weight: bold; }
  .center { text-align: center; }
  .right { text-align: right; }
  .header-top { background: ${palette.headerBg}; color: ${palette.headerText}; }
  .total-row td { font-weight: bold; background: #f7f7f7; }
  .section-head { font-weight: bold; font-size: 10px; text-transform: uppercase; color: #555; }
  .small { font-size: 10px; margin-top: 4px; }
  .summary-table { margin-top: 8px; }
  .bank-section { margin-top: 10px; border-top: 1px solid #ccc; padding-top: 8px; display: flex; justify-content: space-between; }
  .sign-box { text-align: right; min-width: 180px; border-left: 1px solid #ccc; padding-left: 16px; }
  @media print { body { padding: 10px; } }
</style>
</head>
<body>
<h1>Tax Invoice</h1>

<!-- Header: Supplier + Invoice Details -->
<table class="outer">
  <tr>
    <td class="td" style="width:55%;vertical-align:top;">
      <strong style="font-size:13px;">${be?.name ?? 'N/A'}</strong><br/>
      ${be?.address ? be.address + '<br/>' : ''}
      ${be?.city ? be.city + (be.state ? ', ' + be.state : '') + '<br/>' : ''}
      ${be?.gstin ? `GSTIN/UIN: <strong>${be.gstin}</strong><br/>` : ''}
      ${be?.stateCode ? `State: ${be.state ?? ''}, Code: ${be.stateCode}<br/>` : ''}
      ${be?.email ? `E-Mail: ${be.email}<br/>` : ''}
      ${be?.phone ? `Phone: ${be.phone}` : ''}
    </td>
    <td class="td" style="width:45%;vertical-align:top;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="width:50%;padding:2px 4px;font-weight:bold;">Invoice No.</td>
          <td style="width:50%;padding:2px 4px;font-weight:bold;">Dated</td>
        </tr>
        <tr>
          <td style="padding:2px 4px;font-size:13px;font-weight:bold;">${inv.invoiceNumber}</td>
          <td style="padding:2px 4px;">${fmtD(inv.invoiceDate)}</td>
        </tr>
        <tr><td style="padding:2px 4px;">Delivery Note</td><td style="padding:2px 4px;">Mode/Terms of Payment</td></tr>
        <tr><td style="padding:2px 4px;">&nbsp;</td><td style="padding:2px 4px;">&nbsp;</td></tr>
        <tr><td style="padding:2px 4px;">Reference No. &amp; Date.</td><td style="padding:2px 4px;">Other References</td></tr>
        <tr><td style="padding:2px 4px;">&nbsp;</td><td style="padding:2px 4px;">&nbsp;</td></tr>
      </table>
    </td>
  </tr>
  <!-- Buyer section -->
  <tr>
    <td class="td" style="vertical-align:top;">
      <div class="section-head">Buyer (Bill to)</div>
      <strong style="font-size:12px;">${inv.client?.clientName ?? 'N/A'}</strong><br/>
      ${cg?.address ? cg.address + '<br/>' : ''}
      ${cg?.city ? cg.city + (cg.state ? ', ' + cg.state : '') + '<br/>' : ''}
      ${cg?.gstin ? `GSTIN/UIN: <strong>${cg.gstin}</strong><br/>` : cg ? `Type: ${cg.gstType}<br/>` : ''}
      ${cg?.stateCode ? `State: ${cg.state ?? ''}, Code: ${cg.stateCode}` : ''}
    </td>
    <td class="td" style="vertical-align:top;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:2px 4px;">Buyer's Order No.</td><td style="padding:2px 4px;">Dated</td></tr>
        <tr><td style="padding:2px 4px;">&nbsp;</td><td style="padding:2px 4px;">&nbsp;</td></tr>
        <tr><td style="padding:2px 4px;">Dispatch Doc No.</td><td style="padding:2px 4px;">Delivery Note Date</td></tr>
        <tr><td style="padding:2px 4px;">&nbsp;</td><td style="padding:2px 4px;">&nbsp;</td></tr>
        <tr><td style="padding:2px 4px;">Dispatched through</td><td style="padding:2px 4px;">Destination</td></tr>
        <tr><td style="padding:2px 4px;" colspan="2">Terms of Delivery</td></tr>
      </table>
    </td>
  </tr>
</table>

<!-- Line Items -->
<table style="margin-top:4px;" class="outer">
  <thead>
    <tr>
      <th class="th" style="width:4%">Sl<br/>No.</th>
      <th class="th">Particulars</th>
      <th class="th" style="width:8%">Quantity</th>
      <th class="th" style="width:6%">Unit</th>
      <th class="th" style="width:10%">Rate</th>
      <th class="th" style="width:12%">Amount</th>
    </tr>
  </thead>
  <tbody>
    ${lineRows}
    ${taxRows}
    <tr>
      <td class="td right bold" colspan="5">Total</td>
      <td class="td right bold" style="font-size:13px;">&#x20B9; ${Number(total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
    </tr>
  </tbody>
</table>

<p class="small" style="margin-top:6px;"><strong>Amount Chargeable (in words)</strong> <span style="float:right;">E. &amp; O.E</span></p>
<p style="font-weight:bold;font-size:12px;margin-top:2px;">${numToWords(total)}</p>

${inv.taxType !== 'NONE' ? `
<!-- Tax Summary -->
<table class="summary-table outer" style="margin-top:6px;">
  <thead>
    <tr>
      <th class="th">HSN/SAC</th>
      <th class="th">Taxable Value</th>
      ${inv.taxType === 'CGST_SGST' ? `<th class="th">CGST Rate</th><th class="th">CGST Amt</th><th class="th">SGST/UTGST Rate</th><th class="th">SGST Amt</th>` : `<th class="th" colspan="2">CGST</th><th class="th">IGST Rate</th><th class="th">IGST Amt</th>`}
      <th class="th">Total Tax</th>
    </tr>
  </thead>
  <tbody>
    ${taxSummaryRows}
    ${taxSummaryTotal}
  </tbody>
</table>
${taxAmtWords}` : ''}

<!-- Bank + Signatory -->
<div class="bank-section">
  <div>
    ${be?.pan ? `<p><strong>Company's PAN:</strong> ${be.pan}</p>` : ''}
    ${be?.bankName ? `<br/><p class="section-head">Company's Bank Details</p>
    <p>Bank Name : <strong>${be.bankName}</strong></p>
    <p>A/c No. : <strong>${be.bankAccount ?? ''}</strong></p>
    <p>Branch &amp; IFS Code: ${be.bankBranch ?? ''} &amp; ${be.bankIfsc ?? ''}</p>` : ''}
    ${inv.notes ? `<p class="small" style="margin-top:8px;"><em>${inv.notes}</em></p>` : ''}
  </div>
  <div class="sign-box">
    <p>for <strong>${be?.name ?? ''}</strong></p>
    <br/><br/><br/>
    <p>Authorised Signatory</p>
  </div>
</div>
<p class="small" style="text-align:center;margin-top:12px;color:#888;">This is a Computer Generated Invoice</p>
</body>
</html>`;
}

// ── GST Preview Modal ─────────────────────────────────────────────────────────

interface GSTPreviewProps { invoice: Invoice; onClose: () => void; }

const GSTPreviewModal: React.FC<GSTPreviewProps> = ({ invoice, onClose }) => {
  const [tmpl, setTmpl]         = useState(invoice.template ?? 1);
  const [pdfLoading, setPdfLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const renderDivRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => buildGSTHTML({ ...invoice, template: tmpl }, tmpl), [invoice, tmpl]);

  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) { doc.open(); doc.write(html); doc.close(); }
    }
  }, [html]);

  const doPrint = () => {
    const win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  const downloadPDF = async () => {
    setPdfLoading(true);
    try {
      // Inject the invoice HTML into a hidden off-screen div
      const container = renderDivRef.current!;
      container.innerHTML = html;
      // A4 width in px at 96dpi ≈ 794px
      container.style.width = '794px';
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.background = '#fff';
      document.body.appendChild(container);

      // Wait a tick for fonts/layout
      await new Promise((r) => setTimeout(r, 300));

      const canvas = await html2canvas(container, {
        scale: 2,           // 2× for crisp text
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      document.body.removeChild(container);
      container.innerHTML = '';

      const imgData = canvas.toDataURL('image/jpeg', 0.97);
      const pdf     = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW   = pdf.internal.pageSize.getWidth();
      const pageH   = pdf.internal.pageSize.getHeight();

      // Scale canvas to fill A4 width, paginate if taller
      const imgW    = pageW;
      const imgH    = (canvas.height * pageW) / canvas.width;
      let  posY     = 0;

      if (imgH <= pageH) {
        pdf.addImage(imgData, 'JPEG', 0, 0, imgW, imgH);
      } else {
        // Multi-page: slice the image into A4-sized strips
        const ratio = canvas.width / pageW;
        let   sliceY = 0;
        while (sliceY < canvas.height) {
          const sliceH = Math.min(pageH * ratio, canvas.height - sliceY);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width  = canvas.width;
          sliceCanvas.height = sliceH;
          const ctx = sliceCanvas.getContext('2d')!;
          ctx.drawImage(canvas, 0, sliceY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.97);
          if (sliceY > 0) pdf.addPage();
          pdf.addImage(sliceData, 'JPEG', 0, posY, imgW, sliceH / ratio);
          sliceY += sliceH;
        }
      }

      pdf.save(`Invoice_${invoice.invoiceNumber}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('PDF generation failed. Please use the Print button instead.');
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex flex-col items-center justify-center z-50 p-4">
      {/* Hidden render target — must stay in DOM structure but off-screen */}
      <div ref={renderDivRef} style={{ position: 'absolute', left: '-9999px', top: 0, background: '#fff' }} />
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-3 border-b flex-shrink-0 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-gray-800">Invoice Preview — {invoice.invoiceNumber}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-500">Template:</span>
            {[1, 2, 3].map(t => (
              <button key={t} onClick={() => setTmpl(t)}
                className={`px-3 py-1 rounded text-sm font-medium border ${tmpl === t ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                {t === 1 ? 'Classic' : t === 2 ? 'Modern' : 'Minimal'}
              </button>
            ))}
            <button
              onClick={downloadPDF}
              disabled={pdfLoading}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-medium px-4 py-1.5 rounded transition-colors"
            >
              {pdfLoading
                ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> Generating…</>
                : <>📥 Download PDF</>}
            </button>
            <button onClick={doPrint} className="btn-primary text-sm px-4 py-1.5">🖨 Print</button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <iframe ref={iframeRef} className="w-full h-full border-0" title="Invoice Preview" />
        </div>
      </div>
    </div>
  );
};

// ── Create / Edit Invoice Modal ───────────────────────────────────────────────

interface CreateModalProps {
  tasks: TaskInfo[];
  billingEntities: BillingEntityFull[];
  onClose: () => void;
  onCreated: () => void;
  defaultTaskId?: number;
}

const CreateModal: React.FC<CreateModalProps> = ({ tasks, billingEntities, onClose, onCreated, defaultTaskId }) => {
  const [taskId, setTaskId] = useState<string>(defaultTaskId ? String(defaultTaskId) : '');
  const [billingEntityId, setBillingEntityId] = useState<string>('');
  const [clientGstinId, setClientGstinId] = useState<string>('');
  const [clientGstins, setClientGstins] = useState<ClientGstin[]>([]);
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [dueDate, setDueDate] = useState('');
  const [taxType, setTaxType] = useState<TaxType>('NONE');
  const [hsnSacCode, setHsnSacCode] = useState('');
  const [notes, setNotes] = useState('');
  const [template, setTemplate] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Line items
  const [lineItems, setLineItems] = useState<Omit<LineItem, 'id'>[]>([
    { slNo: 1, description: '', hsnSac: '', quantity: 1, rate: 0, unit: '', amount: 0 }
  ]);

  const selectedTask = tasks.find(t => String(t.id) === taskId);
  const selectedBE = billingEntities.find(b => String(b.id) === billingEntityId);
  const selectedCG = clientGstins.find(g => String(g.id) === clientGstinId);

  // Load client GSTINs when task changes
  useEffect(() => {
    if (!selectedTask?.clientId) { setClientGstins([]); return; }
    fetch(`/api/clients/${selectedTask.clientId}/gstins`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }).then(r => r.json()).then(setClientGstins).catch(() => {});
  }, [selectedTask]);

  // Auto-detect tax type
  useEffect(() => {
    setTaxType(autoTaxType(selectedBE, selectedCG));
  }, [selectedBE, selectedCG]);

  // Pre-fill description from task
  useEffect(() => {
    if (selectedTask && lineItems[0].description === '') {
      setLineItems([{ slNo: 1, description: selectedTask.taskName, hsnSac: hsnSacCode, quantity: 1, rate: Number(selectedTask.billedAmount ?? 0), unit: '', amount: Number(selectedTask.billedAmount ?? 0) }]);
    }
  }, [selectedTask]);

  const updateLine = (idx: number, field: keyof Omit<LineItem, 'id'>, val: string | number) => {
    setLineItems(prev => {
      const updated = [...prev];
      (updated[idx] as any)[field] = val;
      if (field === 'quantity' || field === 'rate') {
        updated[idx].amount = parseFloat((Number(updated[idx].quantity) * Number(updated[idx].rate)).toFixed(2));
      }
      return updated;
    });
  };

  const addLine = () => setLineItems(prev => [...prev, { slNo: prev.length + 1, description: '', hsnSac: '', quantity: 1, rate: 0, unit: '', amount: 0 }]);
  const removeLine = (idx: number) => setLineItems(prev => prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, slNo: i + 1 })));

  const taxableAmount = lineItems.reduce((s, l) => s + l.amount, 0);
  const cgst = taxType === 'CGST_SGST' ? taxableAmount * 0.09 : 0;
  const sgst = taxType === 'CGST_SGST' ? taxableAmount * 0.09 : 0;
  const igst = taxType === 'IGST' ? taxableAmount * 0.18 : 0;
  const totalAmount = taxableAmount + cgst + sgst + igst;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskId || !invoiceDate) { setError('Task and Invoice Date are required.'); return; }
    if (lineItems.some(l => !l.description)) { setError('All line items must have a description.'); return; }
    setSaving(true); setError('');
    try {
      await createInvoice({
        taskId: Number(taskId),
        amount: taxableAmount,
        invoiceDate,
        dueDate: dueDate || undefined,
        billingEntityId: billingEntityId ? Number(billingEntityId) : undefined,
        clientGstinId: clientGstinId ? Number(clientGstinId) : undefined,
        taxType,
        hsnSacCode: hsnSacCode || undefined,
        template,
        notes: notes || undefined,
        lineItems: lineItems.map(li => ({ ...li, hsnSac: li.hsnSac || hsnSacCode || undefined })),
      });
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create invoice.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">New GST Invoice</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 text-sm">{error}</div>}

          {/* Row 1: Task + Billing Entity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Task *</label>
              <select className="input-field" value={taskId} onChange={e => setTaskId(e.target.value)} required>
                <option value="">— Select Task —</option>
                {tasks.map(t => (
                  <option key={t.id} value={t.id}>{t.taskId} — {t.taskName}{t.client ? ` (${t.client.clientName})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Billing Entity (Our Company)</label>
              <select className="input-field" value={billingEntityId} onChange={e => setBillingEntityId(e.target.value)}>
                <option value="">— Select —</option>
                {billingEntities.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Client GSTIN + Tax Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Client GSTIN / Address</label>
              <select className="input-field" value={clientGstinId} onChange={e => setClientGstinId(e.target.value)} disabled={!selectedTask}>
                <option value="">— Select —</option>
                {clientGstins.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.label ? `${g.label}: ` : ''}{g.gstType === 'REGISTERED' ? g.gstin : g.gstType} {g.isPrimary ? '★' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Tax Type (auto-detected)</label>
              <select className="input-field" value={taxType} onChange={e => setTaxType(e.target.value as TaxType)}>
                <option value="NONE">No Tax (Export / Zero-rated)</option>
                <option value="CGST_SGST">CGST + SGST (Intrastate, 9%+9%)</option>
                <option value="IGST">IGST (Interstate, 18%)</option>
              </select>
            </div>
          </div>

          {/* Row 3: Dates + HSN/SAC */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Invoice Date *</label>
              <input type="date" className="input-field" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} required />
            </div>
            <div>
              <label className="label">Due Date</label>
              <input type="date" className="input-field" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className="label">HSN/SAC Code</label>
              <input type="text" className="input-field" value={hsnSacCode} onChange={e => setHsnSacCode(e.target.value)} placeholder="e.g. 9982" />
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Line Items</label>
              <button type="button" onClick={addLine} className="text-xs px-2 py-1 border border-blue-300 text-blue-600 rounded hover:bg-blue-50">+ Add Line</button>
            </div>
            <div className="overflow-x-auto border border-gray-200 rounded">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-2 py-1.5 text-left font-medium text-gray-600 w-6">#</th>
                    <th className="px-2 py-1.5 text-left font-medium text-gray-600">Description *</th>
                    <th className="px-2 py-1.5 text-left font-medium text-gray-600 w-20">HSN/SAC</th>
                    <th className="px-2 py-1.5 text-left font-medium text-gray-600 w-16">Qty</th>
                    <th className="px-2 py-1.5 text-left font-medium text-gray-600 w-16">Unit</th>
                    <th className="px-2 py-1.5 text-left font-medium text-gray-600 w-24">Rate (₹)</th>
                    <th className="px-2 py-1.5 text-right font-medium text-gray-600 w-24">Amount</th>
                    <th className="w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li, idx) => (
                    <tr key={idx} className="border-t border-gray-100">
                      <td className="px-2 py-1 text-gray-400">{li.slNo}</td>
                      <td className="px-2 py-1">
                        <input className="w-full border-0 outline-none text-xs" value={li.description} onChange={e => updateLine(idx, 'description', e.target.value)} required placeholder="Service description…" />
                      </td>
                      <td className="px-2 py-1">
                        <input className="w-full border-0 outline-none text-xs" value={li.hsnSac ?? ''} onChange={e => updateLine(idx, 'hsnSac', e.target.value)} placeholder={hsnSacCode} />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" className="w-full border-0 outline-none text-xs" value={li.quantity} min={0} step="0.001" onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)} />
                      </td>
                      <td className="px-2 py-1">
                        <input className="w-full border-0 outline-none text-xs" value={li.unit ?? ''} onChange={e => updateLine(idx, 'unit', e.target.value)} />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" className="w-full border-0 outline-none text-xs" value={li.rate} min={0} step="0.01" onChange={e => updateLine(idx, 'rate', parseFloat(e.target.value) || 0)} />
                      </td>
                      <td className="px-2 py-1 text-right font-medium">{fmt(li.amount)}</td>
                      <td className="px-2 py-1">
                        {lineItems.length > 1 && (
                          <button type="button" onClick={() => removeLine(idx)} className="text-red-400 hover:text-red-600 text-sm leading-none">×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tax Summary */}
          <div className="bg-gray-50 rounded p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Taxable Amount</span><span className="font-medium">{fmt(taxableAmount)}</span></div>
            {taxType === 'CGST_SGST' && <>
              <div className="flex justify-between text-gray-500"><span>CGST @ 9%</span><span>{fmt(cgst)}</span></div>
              <div className="flex justify-between text-gray-500"><span>SGST/UTGST @ 9%</span><span>{fmt(sgst)}</span></div>
            </>}
            {taxType === 'IGST' && <div className="flex justify-between text-gray-500"><span>IGST @ 18%</span><span>{fmt(igst)}</span></div>}
            <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-1"><span>Total</span><span className="text-blue-700">{fmt(totalAmount)}</span></div>
          </div>

          {/* Template + Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Invoice Template</label>
              <div className="flex gap-2">
                {[1, 2, 3].map(t => (
                  <button key={t} type="button" onClick={() => setTemplate(t)}
                    className={`flex-1 py-1.5 rounded text-sm border font-medium ${template === t ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    {t === 1 ? 'Classic' : t === 2 ? 'Modern' : 'Minimal'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="input-field" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Invoice'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Payment Modal ─────────────────────────────────────────────────────────────

const PaymentModal: React.FC<{ invoice: Invoice; onClose: () => void; onSaved: () => void }> = ({ invoice, onClose, onSaved }) => {
  const total = Number(invoice.totalAmount ?? invoice.amount);
  const outstanding = total - Number(invoice.paymentAmount ?? 0);
  const [paymentAmount, setPaymentAmount] = useState(String(outstanding > 0 ? outstanding : total));
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentNotes, setPaymentNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await recordPayment(invoice.id, { paymentAmount: parseFloat(paymentAmount), paymentDate, paymentNotes: paymentNotes || undefined });
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to record payment.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Record Payment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <div className="px-6 py-3 bg-gray-50 border-b text-sm text-gray-600">
          <strong>{invoice.invoiceNumber}</strong> &nbsp;|&nbsp; Total: <strong>{fmt(total)}</strong> &nbsp;|&nbsp; Paid: <strong>{fmt(Number(invoice.paymentAmount ?? 0))}</strong> &nbsp;|&nbsp; Outstanding: <strong className="text-red-600">{fmt(outstanding)}</strong>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 text-sm">{error}</div>}
          <div><label className="label">Payment Amount (₹) *</label>
            <input type="number" step="0.01" min="0.01" className="input-field" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} required />
          </div>
          <div><label className="label">Payment Date *</label>
            <input type="date" className="input-field" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required />
          </div>
          <div><label className="label">Payment Notes</label>
            <textarea className="input-field" rows={2} value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="e.g. NEFT / Cheque number…" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Record Payment'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Invoice Settings Modal ────────────────────────────────────────────────────

const SettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [settings, setSettings] = useState<InvoiceSettings>({ id: 1, prefix: '', suffix: '', startNumber: 1 });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    getInvoiceSettings().then(r => setSettings(r.data)).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true); setMsg('');
    try {
      await updateInvoiceSettings(settings);
      setMsg('Saved successfully.');
    } catch { setMsg('Failed to save.'); }
    finally { setSaving(false); }
  };

  const preview = `${settings.prefix}${settings.startNumber}${settings.suffix}`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Invoice Numbering Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
            <strong>Preview:</strong> Next invoice will be numbered <strong>{preview}</strong>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Prefix</label>
              <input className="input-field" value={settings.prefix} onChange={e => setSettings(s => ({ ...s, prefix: e.target.value }))} placeholder="e.g. 2025-26/" />
            </div>
            <div><label className="label">Starting Number</label>
              <input type="number" className="input-field" min={1} value={settings.startNumber} onChange={e => setSettings(s => ({ ...s, startNumber: parseInt(e.target.value) || 1 }))} />
            </div>
            <div><label className="label">Suffix</label>
              <input className="input-field" value={settings.suffix} onChange={e => setSettings(s => ({ ...s, suffix: e.target.value }))} placeholder="e.g. /A" />
            </div>
          </div>
          <p className="text-xs text-gray-500">Example: prefix "2026-27/M" + number 30 + no suffix → <strong>2026-27/M30</strong></p>
          {msg && <p className={`text-sm ${msg.includes('success') ? 'text-green-600' : 'text-red-600'}`}>{msg}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Close</button>
            <button onClick={handleSave} className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Invoices Tab ──────────────────────────────────────────────────────────────

const InvoicesTab: React.FC<{ tasks: TaskInfo[]; billingEntities: BillingEntityFull[]; isAdmin: boolean; defaultTaskId?: number }> = ({ tasks, billingEntities, isAdmin, defaultTaskId }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(!!defaultTaskId);
  const [paymentTarget, setPaymentTarget] = useState<Invoice | null>(null);
  const [printTarget, setPrintTarget] = useState<Invoice | null>(null);
  const [pdfDownloading, setPdfDownloading] = useState<number | null>(null);

  const handleQuickPDF = async (inv: Invoice) => {
    setPdfDownloading(inv.id);
    try { await generateAndDownloadPDF(inv, inv.template ?? 1); }
    catch { alert('PDF failed. Try the Print preview instead.'); }
    finally { setPdfDownloading(null); }
  };
  const [showSettings, setShowSettings] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getInvoices(statusFilter ? { status: statusFilter } : {});
      setInvoices(res.data);
    } catch { setInvoices([]); } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleCancel = async (inv: Invoice) => {
    if (!window.confirm(`Cancel invoice ${inv.invoiceNumber}?`)) return;
    try { await cancelInvoice(inv.id); load(); } catch (err: any) { alert(err?.response?.data?.message || 'Failed.'); }
  };
  const handleDelete = async (inv: Invoice) => {
    if (!window.confirm(`Delete DRAFT invoice ${inv.invoiceNumber}? This cannot be undone.`)) return;
    try { await deleteInvoice(inv.id); load(); } catch (err: any) { alert(err?.response?.data?.message || 'Failed.'); }
  };
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportInvoices();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url;
      a.download = `invoices-${format(new Date(), 'yyyy-MM-dd')}.xlsx`; a.click();
      window.URL.revokeObjectURL(url);
    } catch { alert('Export failed.'); } finally { setExporting(false); }
  };

  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.totalAmount ?? i.amount), 0);
  const totalCollected = invoices.filter(i => i.status === 'PAID' || i.status === 'PARTIALLY_PAID').reduce((s, i) => s + Number(i.paymentAmount ?? 0), 0);
  const outstanding = invoices.filter(i => ['SENT', 'OVERDUE', 'PARTIALLY_PAID'].includes(i.status)).reduce((s, i) => s + (Number(i.totalAmount ?? i.amount) - Number(i.paymentAmount ?? 0)), 0);
  const overdueCount = invoices.filter(i => i.status === 'OVERDUE').length;

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Total Invoiced" value={fmt(totalInvoiced)} />
        <SummaryCard label="Total Collected" value={fmt(totalCollected)} color="text-green-700" />
        <SummaryCard label="Outstanding" value={fmt(outstanding)} color="text-orange-600" />
        <SummaryCard label="Overdue" value={String(overdueCount)} color={overdueCount > 0 ? 'text-red-600' : 'text-gray-800'} sub={overdueCount > 0 ? 'Needs attention' : 'None overdue'} />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select className="input-field w-44" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {(['DRAFT','SENT','PAID','PARTIALLY_PAID','OVERDUE','CANCELLED'] as InvoiceStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          {isAdmin && <button onClick={() => setShowSettings(true)} className="btn-secondary text-sm">⚙ Numbering</button>}
          <button onClick={handleExport} className="btn-secondary text-sm" disabled={exporting}>{exporting ? 'Exporting…' : '↓ Export'}</button>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">+ New Invoice</button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="table-header">Invoice #</th>
              <th className="table-header">Profit Centre</th>
              <th className="table-header">Client</th>
              <th className="table-header">Task</th>
              <th className="table-header text-right">Taxable</th>
              <th className="table-header text-right">Total (w/ Tax)</th>
              <th className="table-header">Tax</th>
              <th className="table-header">Date</th>
              <th className="table-header">Status</th>
              <th className="table-header text-right">Paid</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} className="table-cell text-center text-gray-400 py-10">Loading…</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={11} className="table-cell text-center text-gray-400 py-10">No invoices found.</td></tr>
            ) : invoices.map(inv => (
              <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="table-cell font-mono font-medium text-blue-700">{inv.invoiceNumber}</td>
                <td className="table-cell">
                  <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                    {inv.profitCentre?.name ?? 'Default'}
                  </span>
                </td>
                <td className="table-cell text-gray-700">{inv.client?.clientName ?? '—'}</td>
                <td className="table-cell text-gray-700 max-w-[150px] truncate">
                  <span className="text-xs text-gray-400 block">{inv.task?.taskId}</span>{inv.task?.taskName}
                </td>
                <td className="table-cell text-right">{fmt(Number(inv.amount))}</td>
                <td className="table-cell text-right font-medium">{fmt(Number(inv.totalAmount ?? inv.amount))}</td>
                <td className="table-cell text-xs text-gray-500">
                  {inv.taxType === 'CGST_SGST' ? 'CGST+SGST' : inv.taxType === 'IGST' ? 'IGST' : '—'}
                </td>
                <td className="table-cell text-gray-600">{fmtD(inv.invoiceDate)}</td>
                <td className="table-cell"><StatusBadge status={inv.status} /></td>
                <td className="table-cell text-right">
                  {(inv.paymentAmount ?? 0) > 0 ? <span className="text-green-600 font-medium">{fmt(inv.paymentAmount!)}</span> : <span className="text-gray-400">—</span>}
                </td>
                <td className="table-cell">
                  <div className="flex items-center gap-1 flex-wrap">
                    {['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.status) && (
                      <button onClick={() => setPaymentTarget(inv)} className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 font-medium">Pay</button>
                    )}
                    {isAdmin && ['DRAFT', 'SENT'].includes(inv.status) && (
                      <button onClick={() => handleCancel(inv)} className="text-xs px-2 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200 font-medium">Cancel</button>
                    )}
                    {isAdmin && inv.status === 'DRAFT' && (
                      <button onClick={() => handleDelete(inv)} className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 font-medium">Delete</button>
                    )}
                    <button onClick={() => setPrintTarget(inv)} className="text-xs px-2 py-0.5 rounded bg-gray-50 text-gray-600 border border-gray-200 font-medium">🖨 Print</button>
                    <button
                      onClick={() => handleQuickPDF(inv)}
                      disabled={pdfDownloading === inv.id}
                      className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 font-medium disabled:opacity-50"
                    >
                      {pdfDownloading === inv.id ? '…' : '📥 PDF'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateModal tasks={tasks} billingEntities={billingEntities} defaultTaskId={defaultTaskId} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
      {paymentTarget && <PaymentModal invoice={paymentTarget} onClose={() => setPaymentTarget(null)} onSaved={() => { setPaymentTarget(null); load(); }} />}
      {printTarget && <GSTPreviewModal invoice={printTarget} onClose={() => setPrintTarget(null)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
};

// ── Receivables Tab ───────────────────────────────────────────────────────────

interface ReceivablesSummary { totalOutstanding: number; bucket0to30: number; bucket31to60: number; bucket61to90: number; bucket90plus: number; }

const ReceivablesTab: React.FC = () => {
  const [data, setData] = useState<{ summary: ReceivablesSummary; items: Receivable[] }>({
    summary: { totalOutstanding: 0, bucket0to30: 0, bucket31to60: 0, bucket61to90: 0, bucket90plus: 0 }, items: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getReceivables().then(res => {
      const raw = res.data;
      const items: Receivable[] = Array.isArray(raw) ? raw : (raw?.invoices ?? []);
      const s: ReceivablesSummary = { totalOutstanding: 0, bucket0to30: 0, bucket31to60: 0, bucket61to90: 0, bucket90plus: 0 };
      items.forEach((r: Receivable) => {
        const rem = Number(r.amount) - Number(r.paymentAmount ?? 0);
        s.totalOutstanding += rem;
        const b = r.ageingBucket ?? '';
        if (b.toLowerCase() === 'current' || b.startsWith('0')) s.bucket0to30 += rem;
        else if (b.startsWith('31')) s.bucket31to60 += rem;
        else if (b.startsWith('61')) s.bucket61to90 += rem;
        else if (b.startsWith('90') || b.includes('+')) s.bucket90plus += rem;
      });
      setData({ summary: s, items });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const { summary, items } = data;

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <SummaryCard label="Total Outstanding" value={fmt(summary.totalOutstanding)} color="text-red-600" />
        <div className="card p-4 border-l-4 border-green-400"><p className="text-xs text-gray-500 uppercase tracking-wide mb-1">0–30 Days (Current)</p><p className="text-xl font-bold text-green-700">{fmt(summary.bucket0to30)}</p></div>
        <div className="card p-4 border-l-4 border-yellow-400"><p className="text-xs text-gray-500 uppercase tracking-wide mb-1">31–60 Days</p><p className="text-xl font-bold text-yellow-700">{fmt(summary.bucket31to60)}</p></div>
        <div className="card p-4 border-l-4 border-orange-400"><p className="text-xs text-gray-500 uppercase tracking-wide mb-1">61–90 Days</p><p className="text-xl font-bold text-orange-700">{fmt(summary.bucket61to90)}</p></div>
        <div className="card p-4 border-l-4 border-red-500"><p className="text-xs text-gray-500 uppercase tracking-wide mb-1">90+ Days</p><p className="text-xl font-bold text-red-700">{fmt(summary.bucket90plus)}</p></div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="table-header">Invoice #</th>
              <th className="table-header">Client</th>
              <th className="table-header text-right">Outstanding</th>
              <th className="table-header">Invoice Date</th>
              <th className="table-header">Due Date</th>
              <th className="table-header">Ageing</th>
              <th className="table-header text-right">Days Overdue</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="table-cell text-center text-gray-400 py-10">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="table-cell text-center text-gray-400 py-10">No outstanding receivables.</td></tr>
            ) : items.map(r => {
              const outstanding = Number(r.amount) - Number(r.paymentAmount ?? 0);
              const bucket = r.ageingBucket ?? '';
              const bucketClass = bucket.toLowerCase() === 'current' || bucket.startsWith('0')
                ? 'bg-green-100 text-green-700'
                : bucket.startsWith('31') ? 'bg-yellow-100 text-yellow-700'
                : bucket.startsWith('61') ? 'bg-orange-100 text-orange-700'
                : 'bg-red-100 text-red-700';
              return (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="table-cell font-mono text-blue-700">{r.invoiceNumber}</td>
                  <td className="table-cell">{r.client?.clientName ?? '—'}</td>
                  <td className="table-cell text-right font-semibold text-red-600">{fmt(outstanding)}</td>
                  <td className="table-cell text-gray-600">{fmtD(r.invoiceDate)}</td>
                  <td className="table-cell text-gray-600">{r.dueDate ? fmtD(r.dueDate) : '—'}</td>
                  <td className="table-cell"><span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${bucketClass}`}>{bucket}</span></td>
                  <td className="table-cell text-right">{r.daysOverdue > 0 ? <span className="text-red-600 font-medium">{r.daysOverdue}d</span> : <span className="text-green-600">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const Invoices: React.FC = () => {
  const { isAdmin, isHR } = useAuth();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'invoices' | 'receivables' | 'profit-centres'>('invoices');
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [billingEntities, setBillingEntities] = useState<BillingEntityFull[]>([]);
  const [loading, setLoading] = useState(true);

  // Check if opened from task "Create Invoice" button
  const params = new URLSearchParams(location.search);
  const defaultTaskId = params.get('taskId') ? Number(params.get('taskId')) : undefined;

  useEffect(() => {
    Promise.all([getTasks(), getBillingEntities()]).then(([tRes, beRes]) => {
      setTasks(tRes.data.filter((t: TaskInfo) => t.status === 'OPEN' || t.status === 'CLOSED'));
      setBillingEntities(beRes.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const tabs = [
    { id: 'invoices' as const, label: '🧾 Invoices' },
    { id: 'receivables' as const, label: '📊 Receivables' },
    { id: 'profit-centres' as const, label: '🏦 Profit Centres' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Invoicing</h1>
      </div>

      <div className="flex border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'profit-centres' ? (
        <ProfitCentreAccess />
      ) : loading ? (
        <div className="text-center py-20 text-gray-400">Loading…</div>
      ) : (
        <>
          {activeTab === 'invoices' && <InvoicesTab tasks={tasks} billingEntities={billingEntities} isAdmin={isAdmin} defaultTaskId={defaultTaskId} />}
          {activeTab === 'receivables' && <ReceivablesTab />}
        </>
      )}
    </div>
  );
};

export default Invoices;
