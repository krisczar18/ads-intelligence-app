"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, RefreshCw, Trash2, CheckCircle2, XCircle, Loader2, Save } from "lucide-react";

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

interface AdAccount {
  id: string;
  name: string;
  meta_ad_account_id: string;
  currency: string;
  timezone: string;
  is_active: boolean;
}

interface SyncLog {
  id: string;
  status: "running" | "success" | "failed";
  message: string | null;
  ads_synced: number | null;
  started_at: string;
  finished_at: string | null;
}

interface MetricWeights {
  hook_rate: number;
  hold_rate: number;
  ctr: number;
  cpm: number;
  cost_per_result: number;
}

interface LifecycleThresholds {
  winner_score: number;
  potential_score_min: number;
  loser_score: number;
  fatigue_frequency: number;
}

interface ScoringConfig {
  result_event_name: string;
  lookback_days: number;
  min_spend_threshold: number;
  min_result_count: number;
  metric_weights: MetricWeights;
  lifecycle_thresholds: LifecycleThresholds;
}

const DEFAULT_CONFIG: ScoringConfig = {
  result_event_name: "onsite_conversion.messaging_conversation_started_7d",
  lookback_days: 7,
  min_spend_threshold: 500,
  min_result_count: 3,
  metric_weights: { hook_rate: 0.20, hold_rate: 0.20, ctr: 0.15, cpm: 0.15, cost_per_result: 0.30 },
  lifecycle_thresholds: { winner_score: 85, potential_score_min: 65, loser_score: 35, fatigue_frequency: 3.5 },
};

// ──────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [config, setConfig] = useState<ScoringConfig>(DEFAULT_CONFIG);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [form, setForm] = useState({ name: "", metaAdAccountId: "", accessToken: "" });

  async function loadData() {
    const [accRes, logRes, cfgRes] = await Promise.all([
      fetch("/api/ad-accounts"),
      fetch("/api/sync-logs"),
      fetch("/api/scoring-config"),
    ]);
    const [accJson, logJson, cfgJson] = await Promise.all([
      accRes.json(), logRes.json(), cfgRes.json(),
    ]);
    setAccounts(accJson.adAccounts ?? []);
    setSyncLogs(logJson.syncLogs ?? []);
    if (cfgJson.config) setConfig(cfgJson.config);
    setLoading(false);
    setConfigLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);

    const res = await fetch("/api/ad-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();

    if (!res.ok) {
      setFormError(json.error ?? "Something went wrong");
      setFormLoading(false);
      return;
    }
    setDialogOpen(false);
    setForm({ name: "", metaAdAccountId: "", accessToken: "" });
    setFormLoading(false);
    loadData();
  }

  async function handleSync(adAccountId: string) {
    setSyncingId(adAccountId);
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adAccountId }),
    });
    setSyncingId(null);
    loadData();
  }

  async function handleDeactivate(id: string) {
    await fetch("/api/ad-accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadData();
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setConfigSaving(true);
    await fetch("/api/scoring-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setConfigSaving(false);
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 2500);
  }

  // Normalize weights so they always sum to 1
  function setWeight(key: keyof MetricWeights, raw: number) {
    const clamped = Math.max(0.05, Math.min(0.95, raw));
    setConfig((c) => ({ ...c, metric_weights: { ...c.metric_weights, [key]: +clamped.toFixed(2) } }));
  }

  function fmt(date: string) {
    return new Date(date).toLocaleString();
  }

  const totalWeight = Object.values(config.metric_weights).reduce((s, v) => s + v, 0);

  return (
    <>
      <Header title="Settings" />
      <div className="flex flex-1 flex-col gap-6 p-6 max-w-5xl">

        {/* ── Ad Accounts ─────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Ad Accounts</CardTitle>
              <CardDescription className="mt-1">
                Connect Meta ad accounts with a System User access token.
              </CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add account
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Ad Account</DialogTitle>
                  <DialogDescription>
                    Paste your Meta Ad Account ID (numbers only, no &quot;act_&quot; prefix) and a
                    long-lived System User access token. The token is encrypted before storage.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddAccount} className="flex flex-col gap-4 py-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="acc-name">Account name</Label>
                    <Input id="acc-name" placeholder="My Brand" value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="acc-id">Meta Ad Account ID</Label>
                    <Input id="acc-id" placeholder="123456789" value={form.metaAdAccountId}
                      onChange={(e) => setForm((f) => ({ ...f, metaAdAccountId: e.target.value }))} required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="acc-token">Access token</Label>
                    <Input id="acc-token" type="password" placeholder="EAAxxxxxx..."
                      value={form.accessToken}
                      onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))} required />
                  </div>
                  {formError && (
                    <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>
                  )}
                  <DialogFooter>
                    <Button type="submit" disabled={formLoading}>
                      {formLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying…</> : "Connect account"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No ad accounts connected yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Account ID</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Timezone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((acc) => (
                    <TableRow key={acc.id}>
                      <TableCell className="font-medium">{acc.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{acc.meta_ad_account_id}</TableCell>
                      <TableCell>{acc.currency}</TableCell>
                      <TableCell className="text-xs">{acc.timezone}</TableCell>
                      <TableCell>
                        <Badge variant={acc.is_active ? "default" : "secondary"}>
                          {acc.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Sync now"
                            disabled={syncingId === acc.id} onClick={() => handleSync(acc.id)}>
                            {syncingId === acc.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <RefreshCw className="h-3.5 w-3.5" />}
                          </Button>
                          <Button size="icon" variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            title="Deactivate" onClick={() => handleDeactivate(acc.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ── Scoring Config ───────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scoring Configuration</CardTitle>
            <CardDescription>
              Tune how ads are scored and classified. Changes take effect on the next sync.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {configLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <form onSubmit={handleSaveConfig} className="flex flex-col gap-7">

                {/* Result event */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="event-name">Result event name</Label>
                  <Input id="event-name" className="font-mono text-sm"
                    value={config.result_event_name}
                    onChange={(e) => setConfig((c) => ({ ...c, result_event_name: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">
                    The Meta action type you care about (e.g. <code>onsite_conversion.messaging_conversation_started_7d</code>, <code>purchase</code>, <code>lead</code>).
                  </p>
                </div>

                {/* Lookback / thresholds row */}
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
                  <NumberField label="Lookback days" min={3} max={30}
                    value={config.lookback_days}
                    onChange={(v) => setConfig((c) => ({ ...c, lookback_days: v }))} />
                  <NumberField label="Min spend (PHP)" min={0} max={99999}
                    value={config.min_spend_threshold}
                    onChange={(v) => setConfig((c) => ({ ...c, min_spend_threshold: v }))} />
                  <NumberField label="Min results" min={1} max={100}
                    value={config.min_result_count}
                    onChange={(v) => setConfig((c) => ({ ...c, min_result_count: v }))} />
                  <NumberField label="Fatigue freq ≥" min={1} max={10} step={0.1}
                    value={config.lifecycle_thresholds.fatigue_frequency}
                    onChange={(v) => setConfig((c) => ({
                      ...c,
                      lifecycle_thresholds: { ...c.lifecycle_thresholds, fatigue_frequency: v },
                    }))} />
                </div>

                {/* Score thresholds */}
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-medium">Score thresholds</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <SliderField label="Winner score ≥" min={50} max={100}
                      value={config.lifecycle_thresholds.winner_score}
                      color="emerald"
                      onChange={(v) => setConfig((c) => ({
                        ...c, lifecycle_thresholds: { ...c.lifecycle_thresholds, winner_score: v },
                      }))} />
                    <SliderField label="Potential score ≥" min={30} max={90}
                      value={config.lifecycle_thresholds.potential_score_min}
                      color="blue"
                      onChange={(v) => setConfig((c) => ({
                        ...c, lifecycle_thresholds: { ...c.lifecycle_thresholds, potential_score_min: v },
                      }))} />
                    <SliderField label="Loser score ≤" min={5} max={60}
                      value={config.lifecycle_thresholds.loser_score}
                      color="red"
                      onChange={(v) => setConfig((c) => ({
                        ...c, lifecycle_thresholds: { ...c.lifecycle_thresholds, loser_score: v },
                      }))} />
                  </div>
                </div>

                {/* Metric weights */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Metric weights</p>
                    <span className={`text-xs ${Math.abs(totalWeight - 1) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>
                      Total: {(totalWeight * 100).toFixed(0)}% {Math.abs(totalWeight - 1) > 0.01 && "(should sum to 100%)"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {(Object.entries(config.metric_weights) as [keyof MetricWeights, number][]).map(([key, val]) => (
                      <SliderField key={key}
                        label={WEIGHT_LABELS[key]}
                        min={0.05} max={0.95} step={0.05}
                        value={val}
                        color="zinc"
                        displayPct
                        onChange={(v) => setWeight(key, v)} />
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button type="submit" size="sm" disabled={configSaving} className="gap-2">
                    {configSaving
                      ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
                      : <><Save className="h-4 w-4" />Save config</>}
                  </Button>
                  {configSaved && (
                    <span className="flex items-center gap-1 text-sm text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> Saved
                    </span>
                  )}
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* ── Sync Logs ────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sync Logs</CardTitle>
            <CardDescription>Last 20 sync operations.</CardDescription>
          </CardHeader>
          <CardContent>
            {syncLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sync logs yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Finished</TableHead>
                    <TableHead>Ads synced</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        {log.status === "success" ? (
                          <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Success
                          </span>
                        ) : log.status === "failed" ? (
                          <span className="flex items-center gap-1 text-destructive text-xs font-medium">
                            <XCircle className="h-3.5 w-3.5" /> Failed
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground text-xs font-medium">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmt(log.started_at)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.finished_at ? fmt(log.finished_at) : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{log.ads_synced ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                        {log.message ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────

const WEIGHT_LABELS: Record<keyof MetricWeights, string> = {
  hook_rate: "Hook rate",
  hold_rate: "Hold rate",
  ctr: "CTR",
  cpm: "CPM (inverted)",
  cost_per_result: "Cost per result (inverted)",
};

function NumberField({
  label, value, min, max, step = 1, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type="number" min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-8 text-sm" />
    </div>
  );
}

function SliderField({
  label, value, min, max, step = 1, color, displayPct = false, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  color: string;
  displayPct?: boolean;
  onChange: (v: number) => void;
}) {
  const display = displayPct
    ? `${Math.round(value * 100)}%`
    : String(value);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">{display}</span>
      </div>
      <Slider
        min={min} max={max} step={step}
        value={[value]}
        onValueChange={(vals) => onChange(Array.isArray(vals) ? vals[0] : vals)}
        className={`accent-${color}-500`}
      />
    </div>
  );
}
