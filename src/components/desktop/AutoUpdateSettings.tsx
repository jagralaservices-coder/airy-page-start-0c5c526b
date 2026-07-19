import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Download, RefreshCw, RotateCw, FileText, CheckCircle2, AlertCircle, WifiOff } from 'lucide-react';

type UpdaterState = {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'offline';
  version: string;
  progress: number;
  error: string | null;
  info: { version?: string; releaseNotes?: string } | null;
};

declare global {
  interface Window {
    desktopUpdater?: {
      getVersion: () => Promise<string>;
      getState: () => Promise<UpdaterState>;
      getSettings: () => Promise<{ autoUpdate: boolean }>;
      setSettings: (s: { autoUpdate?: boolean }) => Promise<{ autoUpdate: boolean }>;
      checkForUpdates: () => Promise<{ ok: boolean; version?: string; error?: string }>;
      downloadUpdate: () => Promise<{ ok: boolean; error?: string }>;
      quitAndInstall: () => Promise<{ ok: boolean }>;
      openLogs: () => Promise<string>;
      onState: (cb: (s: UpdaterState) => void) => () => void;
    };
    isDesktopApp?: boolean;
  }
}

export function AutoUpdateSettings() {
  const updater = typeof window !== 'undefined' ? window.desktopUpdater : undefined;
  const [version, setVersion] = useState('');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [state, setState] = useState<UpdaterState>({ status: 'idle', version: '', progress: 0, error: null, info: null });
  const [checking, setChecking] = useState(false);
  const lastDownloadedRef = useState<{ shown: boolean }>({ shown: false })[0];

  useEffect(() => {
    if (!updater) return;
    updater.getVersion().then(setVersion);
    updater.getSettings().then(s => setAutoUpdate(s.autoUpdate !== false));
    updater.getState().then(setState);
    const off = updater.onState((s) => {
      setState(s);
      if (s.status === 'downloaded' && !lastDownloadedRef.shown) {
        lastDownloadedRef.shown = true;
        toast.success(`Update ${s.info?.version ?? ''} ready to install`, {
          duration: 15000,
          action: { label: 'Restart & Install', onClick: () => updater.quitAndInstall() },
        });
      }
      if (s.status === 'error') toast.error(`Update error: ${s.error ?? 'unknown'}`);
    });
    return () => { off?.(); };
  }, [updater, lastDownloadedRef]);

  if (!updater) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Auto Updates</CardTitle>
          <CardDescription>Auto-update is available in the desktop application only.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleCheck = async () => {
    setChecking(true);
    const r = await updater.checkForUpdates();
    setChecking(false);
    if (!r.ok) toast.error(r.error || 'Could not check for updates');
    else if (r.version) toast.info(`Latest version: ${r.version}`);
    else toast.success('You are on the latest version');
  };

  const handleToggle = async (v: boolean) => {
    setAutoUpdate(v);
    await updater.setSettings({ autoUpdate: v });
    toast.success(`Auto-update ${v ? 'enabled' : 'disabled'}`);
  };

  const statusBadge = () => {
    const map: Record<UpdaterState['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
      idle: { label: 'Idle', variant: 'secondary', icon: <RefreshCw className="h-3 w-3" /> },
      checking: { label: 'Checking…', variant: 'secondary', icon: <RefreshCw className="h-3 w-3 animate-spin" /> },
      available: { label: 'Update available', variant: 'default', icon: <Download className="h-3 w-3" /> },
      'not-available': { label: 'Up to date', variant: 'outline', icon: <CheckCircle2 className="h-3 w-3" /> },
      downloading: { label: 'Downloading', variant: 'default', icon: <Download className="h-3 w-3" /> },
      downloaded: { label: 'Ready to install', variant: 'default', icon: <CheckCircle2 className="h-3 w-3" /> },
      error: { label: 'Error', variant: 'destructive', icon: <AlertCircle className="h-3 w-3" /> },
      offline: { label: 'Offline', variant: 'outline', icon: <WifiOff className="h-3 w-3" /> },
    };
    const s = map[state.status];
    return <Badge variant={s.variant} className="gap-1">{s.icon}{s.label}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Auto Updates</CardTitle>
            <CardDescription>Keep the desktop app up to date automatically.</CardDescription>
          </div>
          {statusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">Current Version</div>
            <div className="text-xs text-muted-foreground">v{version || '—'}</div>
          </div>
          {state.info?.version && state.info.version !== version && (
            <Badge variant="default">New: v{state.info.version}</Badge>
          )}
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">Automatic updates</div>
            <div className="text-xs text-muted-foreground">Check and download updates in the background.</div>
          </div>
          <Switch checked={autoUpdate} onCheckedChange={handleToggle} />
        </div>

        {(state.status === 'downloading' || (state.status === 'downloaded' && state.progress > 0)) && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between text-sm">
              <span>{state.status === 'downloaded' ? 'Download complete' : 'Downloading update…'}</span>
              <span className="font-medium">{state.progress}%</span>
            </div>
            <Progress value={state.progress} />
          </div>
        )}

        {state.status === 'error' && state.error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {state.error}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleCheck} disabled={checking || state.status === 'checking' || state.status === 'downloading'} variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
            Check for Updates
          </Button>
          {state.status === 'available' && (
            <Button onClick={() => updater.downloadUpdate()}>
              <Download className="mr-2 h-4 w-4" />
              Download Now
            </Button>
          )}
          {state.status === 'downloaded' && (
            <Button onClick={() => updater.quitAndInstall()}>
              <RotateCw className="mr-2 h-4 w-4" />
              Restart & Install
            </Button>
          )}
          <Button variant="ghost" onClick={() => updater.openLogs()}>
            <FileText className="mr-2 h-4 w-4" />
            View Update Logs
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Updates are delivered via GitHub Releases. Your local data, orders, settings and login session are preserved across updates.
        </p>
      </CardContent>
    </Card>
  );
}

export default AutoUpdateSettings;
