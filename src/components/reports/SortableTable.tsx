import React, { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  numeric?: boolean;
  render?: (row: T) => React.ReactNode;
  sortAccessor?: (row: T) => string | number;
}

interface Props<T> {
  data: T[];
  columns: Column<T>[];
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  emptyText?: string;
  onRowClick?: (row: T) => void;
  search?: string;
}

export function SortableTable<T extends Record<string, any>>({
  data, columns, defaultSort, emptyText = 'No data', onRowClick, search,
}: Props<T>) {
  const [sort, setSort] = useState(defaultSort ?? { key: String(columns[0].key), dir: 'desc' as const });

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(r => columns.some(c => String((r as any)[c.key] ?? '').toLowerCase().includes(q)));
  }, [data, columns, search]);

  const sorted = useMemo(() => {
    const col = columns.find(c => String(c.key) === sort.key);
    if (!col) return filtered;
    const acc = col.sortAccessor ?? ((r: T) => (r as any)[col.key]);
    return [...filtered].sort((a, b) => {
      const va = acc(a); const vb = acc(b);
      if (va == null) return 1; if (vb == null) return -1;
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sort, columns]);

  const toggle = (key: string) => {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map(c => (
              <TableHead
                key={String(c.key)}
                className={cn('cursor-pointer select-none', c.numeric && 'text-right')}
                onClick={() => toggle(String(c.key))}
              >
                <span className="inline-flex items-center gap-1">
                  {c.header}
                  {sort.key === String(c.key)
                    ? (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
                    : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">{emptyText}</TableCell></TableRow>
          ) : sorted.map((row, idx) => (
            <TableRow
              key={idx}
              className={onRowClick ? 'cursor-pointer hover:bg-accent/40' : ''}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map(c => (
                <TableCell key={String(c.key)} className={cn(c.numeric && 'text-right tabular-nums')}>
                  {c.render ? c.render(row) : (row as any)[c.key]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default SortableTable;
