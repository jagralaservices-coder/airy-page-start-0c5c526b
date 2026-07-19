import { DateRange } from 'react-day-picker';
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfYear, endOfYear, subDays, subWeeks, subMonths, subYears, format
} from 'date-fns';

export type Preset =
  | 'today' | 'yesterday' | 'this_week' | 'last_week'
  | 'this_month' | 'last_month' | 'this_year' | 'custom';

export const PRESET_OPTIONS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'This Week' },
  { id: 'last_week', label: 'Last Week' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'this_year', label: 'This Year' },
  { id: 'custom', label: 'Custom' },
];

export const presetToRange = (preset: Preset, custom?: DateRange): DateRange => {
  const now = new Date();
  switch (preset) {
    case 'today': return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday': { const d = subDays(now, 1); return { from: startOfDay(d), to: endOfDay(d) }; }
    case 'this_week': return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'last_week': { const d = subWeeks(now, 1); return { from: startOfWeek(d, { weekStartsOn: 1 }), to: endOfWeek(d, { weekStartsOn: 1 }) }; }
    case 'this_month': return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'last_month': { const d = subMonths(now, 1); return { from: startOfMonth(d), to: endOfMonth(d) }; }
    case 'this_year': return { from: startOfYear(now), to: endOfYear(now) };
    case 'custom': return custom?.from ? { from: startOfDay(custom.from), to: endOfDay(custom.to ?? custom.from) } : { from: startOfDay(now), to: endOfDay(now) };
  }
};

export const previousPeriod = (range: DateRange): DateRange => {
  if (!range.from || !range.to) return range;
  const span = range.to.getTime() - range.from.getTime();
  const to = new Date(range.from.getTime() - 1);
  const from = new Date(to.getTime() - span);
  return { from, to };
};

export const formatRangeLabel = (range: DateRange) => {
  if (!range.from) return '';
  const f = format(range.from, 'dd MMM yyyy');
  const t = range.to ? format(range.to, 'dd MMM yyyy') : f;
  return f === t ? f : `${f} – ${t}`;
};
