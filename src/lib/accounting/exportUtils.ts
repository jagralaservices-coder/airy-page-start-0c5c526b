// Simple CSV / print export helpers for accounting reports
export function exportCSV(filename: string, rows: Array<Record<string, any>>, headers?: string[]) {
  if (!rows.length) return;
  const cols = headers ?? Object.keys(rows[0]);
  const esc = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function inr(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

export function daysBetween(from: string | Date | null, to: Date = new Date()) {
  if (!from) return 0;
  const d = typeof from === 'string' ? new Date(from) : from;
  return Math.floor((to.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export function agingBucket(days: number): '0-30' | '31-60' | '61-90' | '90+' {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}
