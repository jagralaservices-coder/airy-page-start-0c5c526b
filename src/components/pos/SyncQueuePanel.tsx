// Phase 2 — Offline-first admin / debug panel.
// Surfaces queue health, conflict log, session id, and organization id.

import { useEffect, useState } from 'react';
import {
  queueStats, listPoisoned, retryPoisoned, discardPoisoned,
} from '@/lib/syncQueue';
import { conflictCount, listConflicts, clearConflicts } from '@/lib/conflicts';
import { syncEngine } from '@/lib/syncEngine';
import { getSessionId } from '@/lib/session';
import { getOrganizationId } from '@/lib/envelope';
import { idb } from '@/lib/idb';
import type { SyncQueueItem, ConflictRow } from '@/lib/idb';

type Stats = Awaited<ReturnType<typeof queueStats>>;

export const SyncQueuePanel = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [poisoned, setPoisoned] = useState<SyncQueueItem[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [conflictsTotal, setConflictsTotal] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastDrain, setLastDrain] = useState<string | null>(null);
  const [lastDrainCount, setLastDrainCount] = useState<number>(0);
  const [drainTotal, setDrainTotal] = useState<number>(0);
  const [pullCount, setPullCount] = useState<number>(0);
  const [idbSkipped, setIdbSkipped] = useState<number>(0);
  const [recentConflicts1h, setRecentConflicts1h] = useState<number>(0);
  const [rtStatus, setRtStatus] = useState<string>('idle');
  const [rtTables, setRtTables] = useState<string[]>([]);
  const [dbVersion, setDbVersion] = useState<number>(0);
  const [legacyPending, setLegacyPending] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setStats(await queueStats());
    setPoisoned(await listPoisoned());
    const recent = await listConflicts(50);
    setConflicts(recent.slice(0, 20));
    setConflictsTotal(await conflictCount());
    const hourAgo = Date.now() - 60 * 60 * 1000;
    setRecentConflicts1h(recent.filter(c => new Date(c.detected_at).getTime() >= hourAgo).length);

    const get = async <T,>(k: string) => (await idb.meta.get(k))?.value as T | undefined;
    setLastSync((await get<string>('last_sync_at')) || null);
    setLastDrain((await get<string>('last_drain_at')) || null);
    setLastDrainCount((await get<number>('last_drain_count')) || 0);
    setDrainTotal((await get<number>('drain_acked_total')) || 0);
    setPullCount((await get<number>('pull_count')) || 0);
    setIdbSkipped((await get<number>('idb_skipped_writes')) || 0);

    setRtStatus((syncEngine as any).realtimeStatus || 'idle');
    setRtTables((syncEngine as any).realtimeTables || []);
    setDbVersion((idb as any).verno || 0);

    let legacyCount = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('pos_failed_sync_queue_') || key.startsWith('pos_deleted_'))) {
          const arr = JSON.parse(localStorage.getItem(key) || '[]');
          if (Array.isArray(arr)) legacyCount += arr.length;
        }
      }
    } catch {}
    setLegacyPending(legacyCount);
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);

  const onDrain = async () => {
    setBusy(true);
    try {
      await syncEngine.drainQueue();
      await syncEngine.sync();
      await refresh();
    } finally { setBusy(false); }
  };

  if (!stats) return null;
  const sessionId = getSessionId();
  const orgId = getOrganizationId();

  // Sync health: green if no poison & no recent conflicts & realtime subscribed
  const health: 'good' | 'warn' | 'bad' =
    stats.poisoned > 0 ? 'bad' :
    (recentConflicts1h > 0 || rtStatus !== 'subscribed' || stats.active > 50) ? 'warn' : 'good';

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Offline Sync · Phase 3</h3>
          <span className={
            'text-[10px] px-2 py-0.5 rounded-full ' +
            (health === 'good' ? 'bg-green-500/15 text-green-700 dark:text-green-400' :
             health === 'warn' ? 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400' :
                                 'bg-destructive/15 text-destructive')
          }>
            {health === 'good' ? 'Healthy' : health === 'warn' ? 'Degraded' : 'Unhealthy'}
          </span>
        </div>
        <button
          onClick={onDrain}
          disabled={busy}
          className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
        >{busy ? 'Syncing…' : 'Sync now'}</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <Stat label="Pending" value={stats.active} tone={stats.active > 50 ? 'warn' : undefined} />
        <Stat label="Poisoned" value={stats.poisoned} tone={stats.poisoned > 0 ? 'danger' : undefined} />
        <Stat label="Conflicts (total)" value={conflictsTotal} tone={conflictsTotal > 0 ? 'warn' : undefined} />
        <Stat label="Conflicts (1h)" value={recentConflicts1h} tone={recentConflicts1h > 0 ? 'warn' : undefined} />
        <Stat label="Last drain" value={lastDrain ? `${new Date(lastDrain).toLocaleTimeString()} (+${lastDrainCount})` : '—'} />
        <Stat label="Last pull" value={lastSync ? new Date(lastSync).toLocaleTimeString() : '—'} />
        <Stat label="Throughput" value={`${drainTotal} acked · ${pullCount} pulls`} />
        <Stat label="IDB writes skipped" value={idbSkipped} />
        <Stat label="Realtime" value={rtStatus} tone={rtStatus !== 'subscribed' ? 'warn' : undefined} />
        <Stat label="RT tables" value={rtTables.length ? rtTables.join(', ') : '—'} mono />
        <Stat label="Oldest pending" value={stats.oldestEnqueuedAt ? new Date(stats.oldestEnqueuedAt).toLocaleTimeString() : '—'} />
        <Stat label="Orphans skipped" value={stats.orphansSkipped} tone={stats.orphansSkipped > 0 ? 'warn' : undefined} />
        <Stat label="Session ID" value={sessionId} mono />
        <Stat label="Org (merchant) ID" value={orgId || '—'} mono />
        <Stat label="DB version" value={`v${dbVersion}`} mono />
      </div>

      {legacyPending > 0 && (
        <Section title={`Legacy pending items (${legacyPending})`} tone="warn">
          <div className="text-muted-foreground text-xs pb-2">
            These are items from the older sync mechanism that are failing to sync and stuck in the queue.
            Clearing them will remove the "Syncing to cloud" banner.
          </div>
          <SmallBtn onClick={() => {
            for (let i = localStorage.length - 1; i >= 0; i--) {
              const key = localStorage.key(i);
              if (key && (key.startsWith('pos_failed_sync_queue_') || key.startsWith('pos_deleted_'))) {
                localStorage.removeItem(key);
              }
            }
            refresh();
            // dispatch storage event to update OfflineIndicator
            window.dispatchEvent(new Event('storage'));
          }} variant="destructive">Clear legacy pending</SmallBtn>
        </Section>
      )}

      {poisoned.length > 0 && (
        <Section title={`Poisoned items (${poisoned.length})`} tone="danger">
          {poisoned.map(p => (
            <Row key={p.id}>
              <div className="min-w-0 flex-1">
                <div className="font-mono truncate">{p.table} · {p.op} · {p.record_id}</div>
                <div className="text-muted-foreground truncate">{p.last_error}</div>
                <div className="text-muted-foreground">attempts: {p.attempts}</div>
              </div>
              <div className="flex gap-1 shrink-0 ml-2">
                <SmallBtn onClick={async () => { await retryPoisoned(p.id!); await refresh(); }}>Retry</SmallBtn>
                <SmallBtn variant="destructive" onClick={async () => { await discardPoisoned(p.id!); await refresh(); }}>Discard</SmallBtn>
              </div>
            </Row>
          ))}
        </Section>
      )}

      {conflicts.length > 0 && (
        <Section title={`Recent conflicts (showing ${conflicts.length} of ${conflictsTotal})`} tone="warn">
          {conflicts.map(c => (
            <Row key={c.id}>
              <div className="min-w-0 flex-1">
                <div className="font-mono truncate">{c.table} · {c.record_id}</div>
                <div className="text-muted-foreground truncate">
                  {c.reason} → kept <b>{c.resolution.replace('kept_', '')}</b>
                </div>
                <div className="text-muted-foreground">
                  v{c.local_version ?? '?'} (local) vs v{c.cloud_version ?? '?'} (cloud) ·{' '}
                  {new Date(c.detected_at).toLocaleString()}
                </div>
              </div>
            </Row>
          ))}
          <div className="pt-1">
            <SmallBtn onClick={async () => { await clearConflicts(); await refresh(); }}>Clear log</SmallBtn>
          </div>
        </Section>
      )}
    </div>
  );
};

// --- tiny presentational helpers ---

const Stat = ({ label, value, tone, mono }: {
  label: string; value: any; tone?: 'warn' | 'danger'; mono?: boolean;
}) => (
  <div className={
    'rounded border p-2 ' +
    (tone === 'danger' ? 'border-destructive/50 bg-destructive/5' :
     tone === 'warn' ? 'border-yellow-500/50 bg-yellow-500/5' : '')
  }>
    <div className="text-muted-foreground">{label}</div>
    <div className={'font-semibold truncate ' + (mono ? 'font-mono text-[10px]' : '')}>{String(value)}</div>
  </div>
);

const Section = ({ title, tone, children }: { title: string; tone: 'warn' | 'danger'; children: any }) => (
  <div className="space-y-2">
    <div className={'text-xs font-medium ' + (tone === 'danger' ? 'text-destructive' : 'text-yellow-700 dark:text-yellow-400')}>
      {title}
    </div>
    <div className="max-h-48 overflow-auto space-y-1">{children}</div>
  </div>
);

const Row = ({ children }: { children: any }) => (
  <div className="flex items-start justify-between text-xs border rounded p-2">{children}</div>
);

const SmallBtn = ({ children, onClick, variant }: { children: any; onClick: () => void; variant?: 'destructive' }) => (
  <button
    onClick={onClick}
    className={
      'px-2 py-1 rounded text-xs ' +
      (variant === 'destructive'
        ? 'bg-destructive text-destructive-foreground'
        : 'bg-secondary text-secondary-foreground')
    }
  >{children}</button>
);
