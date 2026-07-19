// Unified export utilities: CSV, Excel (xlsx), PDF (via print), Print.
// All four formats accept the same {title, kpis, sections} payload.

export interface ReportSection {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

export interface ReportPayload {
  title: string;
  subtitle?: string;
  dateRange?: string;
  storeName?: string;
  kpis?: { label: string; value: string | number }[];
  sections: ReportSection[];
}

const escapeCSV = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export const exportCSV = (payload: ReportPayload) => {
  const lines: string[] = [];
  lines.push(escapeCSV(payload.title));
  if (payload.subtitle) lines.push(escapeCSV(payload.subtitle));
  if (payload.dateRange) lines.push(escapeCSV(`Period: ${payload.dateRange}`));
  if (payload.storeName) lines.push(escapeCSV(`Store: ${payload.storeName}`));
  lines.push('');
  if (payload.kpis?.length) {
    lines.push(['Metric', 'Value'].map(escapeCSV).join(','));
    payload.kpis.forEach(k => lines.push([k.label, k.value].map(escapeCSV).join(',')));
    lines.push('');
  }
  payload.sections.forEach(sec => {
    lines.push(escapeCSV(sec.title));
    lines.push(sec.headers.map(escapeCSV).join(','));
    sec.rows.forEach(r => lines.push(r.map(escapeCSV).join(',')));
    lines.push('');
  });
  const csv = '\ufeff' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${payload.title.replace(/\s+/g, '_')}_${Date.now()}.csv`;
  a.click();
};

export const exportExcel = async (payload: ReportPayload) => {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  // Summary sheet
  const summary: any[][] = [
    [payload.title],
    payload.subtitle ? [payload.subtitle] : [],
    payload.dateRange ? [`Period: ${payload.dateRange}`] : [],
    payload.storeName ? [`Store: ${payload.storeName}`] : [],
    [],
  ];
  if (payload.kpis?.length) {
    summary.push(['Metric', 'Value']);
    payload.kpis.forEach(k => summary.push([k.label, k.value]));
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');
  payload.sections.forEach(sec => {
    const aoa: any[][] = [[sec.title], [], sec.headers, ...sec.rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, sec.title.slice(0, 28));
  });
  XLSX.writeFile(wb, `${payload.title.replace(/\s+/g, '_')}_${Date.now()}.xlsx`);
};

const buildHTML = (payload: ReportPayload): string => `
<!DOCTYPE html><html><head><meta charset="utf-8"><title>${payload.title}</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:24px;color:#0f172a}
h1{margin:0 0 4px;font-size:22px}
h2{margin:18px 0 6px;font-size:15px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
.meta{color:#64748b;font-size:12px;margin-bottom:14px}
table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px}
th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}
th{background:#f1f5f9;font-weight:600}
td.num,th.num{text-align:right}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:10px 0 18px}
.kpi{border:1px solid #cbd5e1;border-radius:8px;padding:10px;background:#f8fafc}
.kpi .l{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
.kpi .v{font-size:16px;font-weight:700;margin-top:2px}
@media print{body{margin:12mm}}
</style></head><body>
<h1>${payload.title}</h1>
${payload.subtitle ? `<div class="meta">${payload.subtitle}</div>` : ''}
<div class="meta">${[payload.storeName, payload.dateRange, `Generated ${new Date().toLocaleString()}`].filter(Boolean).join(' • ')}</div>
${payload.kpis?.length ? `<div class="kpis">${payload.kpis.map(k => `<div class="kpi"><div class="l">${k.label}</div><div class="v">${k.value}</div></div>`).join('')}</div>` : ''}
${payload.sections.map(sec => `
  <h2>${sec.title}</h2>
  <table><thead><tr>${sec.headers.map((h, i) => `<th class="${i > 0 ? 'num' : ''}">${h}</th>`).join('')}</tr></thead>
  <tbody>${sec.rows.length === 0 ? `<tr><td colspan="${sec.headers.length}" style="text-align:center;color:#94a3b8">No data</td></tr>` :
    sec.rows.map(r => `<tr>${r.map((c, i) => `<td class="${i > 0 && typeof c === 'number' ? 'num' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>
`).join('')}
</body></html>`;

export const printReport = (payload: ReportPayload) => {
  const w = window.open('', '_blank', 'width=1024,height=768');
  if (!w) return;
  w.document.write(buildHTML(payload));
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 250);
};

export const exportPDF = (payload: ReportPayload) => {
  // Browsers' "Save as PDF" via print dialog is the universal route.
  printReport(payload);
};
