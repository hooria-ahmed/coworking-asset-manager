// Small display helpers shared by the Dashboard and Reports screens (Misbah).
import api from '../../api/client';

export const CURRENCY = 'Rs';

// 'YYYY-MM-DD' (or a DATETIME string) -> '21 Oct 2026'
export function fmtDate(value) {
  if (!value) return '';
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const fmtMoney = (n) => `${CURRENCY} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Today in the browser's time zone, as 'YYYY-MM-DD'.
export function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Downloads a report file from GET /api/reports/export (FR-RP-05).
export async function downloadReport({ type, format, from, to }) {
  const query = new URLSearchParams({ type, format, ...(type !== 'assets' ? { from, to } : {}) });
  const blob = await api.get(`/reports/export?${query}`);
  const names = { usage: 'usage-report', maintenance: 'maintenance-report', ai: 'ai-activity-report' };
  const name = type === 'assets' ? `asset-register_${todayISO()}` : `${names[type] || type}_${from}_to_${to}`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
