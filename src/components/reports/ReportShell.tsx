import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Printer, FileText, FileSpreadsheet, Store, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { DateRange } from 'react-day-picker';
import { PRESET_OPTIONS, Preset, presetToRange, formatRangeLabel } from '@/lib/reports/timeRanges';
import { useReportScope } from '@/lib/reports/scope';
import { ReportPayload, exportCSV, exportExcel, exportPDF, printReport } from '@/lib/reports/exporters';

interface Props {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  preset: Preset;
  setPreset: (p: Preset) => void;
  customRange: DateRange | undefined;
  setCustomRange: (r: DateRange | undefined) => void;
  search?: string;
  setSearch?: (s: string) => void;
  buildPayload: () => ReportPayload;
  rightExtra?: React.ReactNode;
}

export const ReportShell: React.FC<Props> = ({
  title, subtitle, icon, preset, setPreset, customRange, setCustomRange,
  search, setSearch, buildPayload, rightExtra,
}) => {
  const navigate = useNavigate();
  const scope = useReportScope();
  const activeRange = presetToRange(preset, customRange);

  const onExport = (kind: 'csv' | 'excel' | 'pdf' | 'print') => {
    const payload = buildPayload();
    if (kind === 'csv') exportCSV(payload);
    if (kind === 'excel') exportExcel(payload);
    if (kind === 'pdf') exportPDF(payload);
    if (kind === 'print') printReport(payload);
  };

  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="flex items-center justify-between px-4 py-3 gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          {icon && <div className="p-2 bg-primary/10 rounded-lg">{icon}</div>}
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {rightExtra}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-4 w-4" /> Export</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onExport('pdf')}><FileText className="h-4 w-4 mr-2" />PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('excel')}><FileSpreadsheet className="h-4 w-4 mr-2" />Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('csv')}><Download className="h-4 w-4 mr-2" />CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('print')}><Printer className="h-4 w-4 mr-2" />Print</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {scope.isOwner && (
        <div className="mx-4 mb-2 p-2 rounded-lg bg-primary/5 border border-primary/20 flex items-center gap-2 text-xs">
          <Store className="w-3.5 h-3.5 text-primary" />
          <span className="font-medium text-foreground">Scope:</span>
          <span className="text-muted-foreground">{scope.storeName}</span>
        </div>
      )}

      <div className="flex gap-2 px-4 pb-3 items-center flex-wrap">
        {PRESET_OPTIONS.map(p => (
          <button
            key={p.id}
            onClick={() => { setPreset(p.id); if (p.id !== 'custom') setCustomRange(undefined); }}
            className={cn('px-3 py-1.5 rounded-full text-xs font-medium transition-all h-8',
              preset === p.id ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground')}
          >{p.label}</button>
        ))}
        <DatePickerWithRange
          date={customRange}
          setDate={(r) => { setCustomRange(r); if (r?.from) setPreset('custom'); }}
        />
        <span className="text-xs text-muted-foreground ml-1">{formatRangeLabel(activeRange)}</span>
        {setSearch && (
          <div className="relative ml-auto">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
            <Input
              value={search ?? ''}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-8 pl-7 w-40 text-xs"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportShell;
