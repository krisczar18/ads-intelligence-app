"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Loader2, ImageOff, Trophy, Lightbulb } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { TagEditor, type TagData } from "@/components/ads/TagEditor";
import type { LifecycleStage } from "@/lib/scoring";

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

interface AdAccount { id: string; name: string; currency: string }

interface AdRow {
  ad_id: string; ad_name: string; ad_status: string; meta_ad_id: string;
  thumbnail_url: string | null; primary_text: string | null; headline: string | null;
  adset_name: string; campaign_name: string;
  spend: number; impressions: number; link_clicks: number; result_count: number;
  cpm: number | null; ctr_all: number | null; cost_per_result: number | null;
  frequency: number | null; hook_rate: number | null; hold_rate: number | null;
  days_active: number; score: number | null; lifecycle_stage: LifecycleStage | null;
  hook_type: string | null; format: string | null; core_desire: string | null;
  awareness_stage: string | null; tag_source: string | null;
  confidence_score: number | null; rationale_text: string | null;
}

interface LifecycleSummary {
  counts: Record<LifecycleStage, number>;
  stage: string;
  recommendation: string;
}

interface WinningPattern {
  hook_type: string; format: string; core_desire: string; awareness_stage: string;
  winner_count: number;
}

interface CreativeMix { novel: number; predict: number; label: string; rationale: string }

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

const DATE_RANGES = [
  { label: "Last 7 days", value: "7" },
  { label: "Last 14 days", value: "14" },
  { label: "Last 30 days", value: "30" },
];

const STAGE_COLORS: Record<string, string> = {
  Winner:   "bg-emerald-500/15 text-emerald-700 border-emerald-200",
  Potential:"bg-blue-500/15 text-blue-700 border-blue-200",
  Fatigue:  "bg-amber-500/15 text-amber-700 border-amber-200",
  Loser:    "bg-red-500/15 text-red-700 border-red-200",
  Unproven: "bg-zinc-500/15 text-zinc-600 border-zinc-200",
  New:      "bg-violet-500/15 text-violet-700 border-violet-200",
};

// ──────────────────────────────────────────────────────────────
// Formatters
// ──────────────────────────────────────────────────────────────

function pct(n: number | null) { return n == null ? "—" : `${(n * 100).toFixed(1)}%`; }
function curr(n: number | null, code = "PHP") {
  if (n == null || n === 0) return "—";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: code, maximumFractionDigits: 0 }).format(n);
}
function num(n: number | null | bigint) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en").format(Number(n));
}
function label(s: string | null) { return s ? s.replace(/_/g, " ") : "—"; }

// ──────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: LifecycleStage | null }) {
  if (!stage) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${STAGE_COLORS[stage] ?? ""}`}>
      {stage}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 85 ? "bg-emerald-500" : score >= 65 ? "bg-blue-500" : score >= 35 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="w-6 text-right text-xs tabular-nums font-medium">{score}</span>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pb-4 pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────

export default function AdsCommandPage() {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [days, setDays] = useState("7");
  const [ads, setAds] = useState<AdRow[]>([]);
  const [summary, setSummary] = useState<LifecycleSummary | null>(null);
  const [pattern, setPattern] = useState<WinningPattern | null>(null);
  const [creativeMix, setCreativeMix] = useState<CreativeMix | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAd, setSelectedAd] = useState<AdRow | null>(null);

  useEffect(() => {
    fetch("/api/ad-accounts").then((r) => r.json()).then((d) => setAccounts(d.adAccounts ?? []));
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ days });
    if (selectedAccount !== "all") params.set("adAccountId", selectedAccount);
    const acctParam = selectedAccount !== "all" ? `?adAccountId=${selectedAccount}` : "";

    const [adsRes, summaryRes, patternRes] = await Promise.all([
      fetch(`/api/ads?${params}`),
      fetch(`/api/lifecycle-summary${acctParam}`),
      fetch(`/api/winning-pattern${acctParam}`),
    ]);

    const [adsJson, summaryJson, patternJson] = await Promise.all([
      adsRes.json(), summaryRes.json(), patternRes.json(),
    ]);

    if (adsJson.error) setError(adsJson.error);
    setAds(adsJson.ads ?? []);
    setSummary(summaryJson.counts ? summaryJson : null);
    setPattern(patternJson.pattern ?? null);
    setCreativeMix(patternJson.creativeMix ?? null);
    setLoading(false);
  }, [selectedAccount, days]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function handleSyncNow() {
    setSyncing(true);
    const body = selectedAccount !== "all" ? { adAccountId: selectedAccount } : {};
    await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSyncing(false);
    loadAll();
  }

  function handleTagSaved(updated: TagData) {
    setAds((prev) => prev.map((a) =>
      a.ad_id === updated.ad_id
        ? {
            ...a,
            hook_type: updated.hook_type,
            format: updated.format,
            core_desire: updated.core_desire,
            awareness_stage: updated.awareness_stage,
            rationale_text: updated.rationale_text,
            tag_source: updated.tag_source,
          }
        : a
    ));
    if (selectedAd?.ad_id === updated.ad_id) {
      setSelectedAd((prev) => prev ? { ...prev, ...updated, tag_source: updated.tag_source } : null);
    }
  }

  const currCode = accounts.find((a) => a.id === selectedAccount)?.currency ?? "PHP";
  const totalSpend = ads.reduce((s, a) => s + (a.spend ?? 0), 0);
  const totalImpressions = ads.reduce((s, a) => s + (a.impressions ?? 0), 0);
  const totalResults = ads.reduce((s, a) => s + (a.result_count ?? 0), 0);

  return (
    <>
      <Header title="Ads Command" />
      <div className="flex flex-1 flex-col gap-5 p-6">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          {accounts.length > 0 && (
            <Select value={selectedAccount} onValueChange={(v) => setSelectedAccount(v ?? "all")}>
              <SelectTrigger className="w-48"><SelectValue placeholder="All accounts" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={days} onValueChange={(v) => setDays(v ?? "7")}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DATE_RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="ml-auto gap-2" disabled={syncing} onClick={handleSyncNow}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync now
          </Button>
        </div>

        {/* Summary cards */}
        {ads.length > 0 && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard label="Total spend" value={curr(totalSpend, currCode)} />
            <SummaryCard label="Impressions" value={num(totalImpressions)} />
            <SummaryCard label="Results" value={num(totalResults)} />
            <SummaryCard label="Ads tracked" value={num(ads.length)} />
          </div>
        )}

        {/* Lifecycle stage banner */}
        {summary && (
          <Card>
            <CardContent className="flex flex-col gap-2 pt-4 pb-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold">Stage: {summary.stage}</span>
                {(["Winner","Potential","Fatigue","Loser","Unproven","New"] as LifecycleStage[]).map((s) =>
                  summary.counts[s] > 0 && (
                    <span key={s} className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${STAGE_COLORS[s]}`}>
                      {s} <strong>{summary.counts[s]}</strong>
                    </span>
                  )
                )}
              </div>
              <p className="text-sm text-muted-foreground">{summary.recommendation}</p>
            </CardContent>
          </Card>
        )}

        {/* Winning Pattern + Creative Mix row */}
        {(pattern || creativeMix) && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Winning Pattern */}
            {pattern && (
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Trophy className="h-4 w-4 text-emerald-500" />
                    Winning Pattern
                    <span className="ml-auto text-xs font-normal text-muted-foreground">
                      drawn from {pattern.winner_count} winner{pattern.winner_count !== 1 ? "s" : ""}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 pb-4">
                  <PatternField label="Hook" value={label(pattern.hook_type)} />
                  <PatternField label="Format" value={label(pattern.format)} />
                  <PatternField label="Core desire" value={label(pattern.core_desire)} />
                  <PatternField label="Awareness" value={label(pattern.awareness_stage)} />
                </CardContent>
              </Card>
            )}

            {/* Recommended Creative Mix */}
            {creativeMix && (
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    Recommended Creative Mix
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 pb-4">
                  <div className="flex gap-2">
                    <MixBar label="Novel" pct={creativeMix.novel} color="bg-violet-500" />
                    <MixBar label="Predict" pct={creativeMix.predict} color="bg-emerald-500" />
                  </div>
                  <p className="text-xs text-muted-foreground">{creativeMix.rationale}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Ads table */}
        <Card className="flex-1">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {loading ? "Loading…" : `${ads.length} ads`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {error ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <p className="text-sm text-destructive">{error}</p>
                {accounts.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    <Link href="/settings" className="underline underline-offset-2">Add an ad account in Settings.</Link>
                  </p>
                )}
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : ads.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <p className="text-sm text-muted-foreground">No ads found for this period.</p>
                {accounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    <Link href="/settings" className="underline underline-offset-2">Connect an ad account</Link> to get started.
                  </p>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleSyncNow} disabled={syncing}>Sync now</Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Ad</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="text-right">Spend</TableHead>
                      <TableHead className="text-right">CPM</TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                      <TableHead className="text-right">Results</TableHead>
                      <TableHead className="text-right">CPR</TableHead>
                      <TableHead className="text-right">Hook%</TableHead>
                      <TableHead className="text-right">Freq</TableHead>
                      <TableHead>Tags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ads.map((ad) => (
                      <TableRow
                        key={ad.ad_id}
                        className="cursor-pointer"
                        onClick={() => setSelectedAd(ad)}
                      >
                        <TableCell className="pr-0">
                          {ad.thumbnail_url ? (
                            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded">
                              <Image src={ad.thumbnail_url} alt="" fill className="object-cover" sizes="36px" />
                            </div>
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded bg-muted">
                              <ImageOff className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[180px]">
                          <div className="flex flex-col gap-0.5">
                            <span className="truncate text-sm font-medium" title={ad.ad_name}>{ad.ad_name}</span>
                            <span className="truncate text-xs text-muted-foreground">{ad.campaign_name}</span>
                          </div>
                        </TableCell>
                        <TableCell><StageBadge stage={ad.lifecycle_stage} /></TableCell>
                        <TableCell className="text-right">
                          {ad.score != null ? <ScoreBar score={ad.score} /> : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{curr(ad.spend, currCode)}</TableCell>
                        <TableCell className="text-right tabular-nums">{curr(ad.cpm, currCode)}</TableCell>
                        <TableCell className="text-right tabular-nums">{pct(ad.ctr_all)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{num(ad.result_count)}</TableCell>
                        <TableCell className="text-right tabular-nums">{curr(ad.cost_per_result, currCode)}</TableCell>
                        <TableCell className="text-right tabular-nums">{pct(ad.hook_rate)}</TableCell>
                        <TableCell className="text-right tabular-nums">{ad.frequency?.toFixed(1) ?? "—"}</TableCell>
                        <TableCell>
                          {ad.hook_type ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs text-muted-foreground">{label(ad.hook_type)}</span>
                              <span className="text-xs text-muted-foreground">{label(ad.format)}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">untagged</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ad detail sheet */}
      <Sheet open={!!selectedAd} onOpenChange={(open) => { if (!open) setSelectedAd(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedAd && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle className="pr-6 text-base leading-tight">{selectedAd.ad_name}</SheetTitle>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <StageBadge stage={selectedAd.lifecycle_stage} />
                  {selectedAd.score != null && (
                    <Badge variant="outline" className="text-xs">Score: {selectedAd.score}</Badge>
                  )}
                </div>
              </SheetHeader>

              {selectedAd.thumbnail_url && (
                <div className="relative mb-4 h-48 w-full overflow-hidden rounded-lg bg-muted">
                  <Image src={selectedAd.thumbnail_url} alt="" fill className="object-contain" sizes="480px" />
                </div>
              )}

              <Tabs defaultValue="metrics">
                <TabsList className="mb-4 w-full">
                  <TabsTrigger value="metrics" className="flex-1">Metrics</TabsTrigger>
                  <TabsTrigger value="tags" className="flex-1">Tags</TabsTrigger>
                  <TabsTrigger value="creative" className="flex-1">Creative</TabsTrigger>
                </TabsList>

                <TabsContent value="metrics">
                  <div className="grid grid-cols-2 gap-3">
                    <MetricCell label="Spend" value={curr(selectedAd.spend, currCode)} />
                    <MetricCell label="Impressions" value={num(selectedAd.impressions)} />
                    <MetricCell label="Results" value={num(selectedAd.result_count)} />
                    <MetricCell label="Cost per result" value={curr(selectedAd.cost_per_result, currCode)} />
                    <MetricCell label="CPM" value={curr(selectedAd.cpm, currCode)} />
                    <MetricCell label="CTR" value={pct(selectedAd.ctr_all)} />
                    <MetricCell label="Hook rate" value={pct(selectedAd.hook_rate)} />
                    <MetricCell label="Hold rate" value={pct(selectedAd.hold_rate)} />
                    <MetricCell label="Frequency" value={selectedAd.frequency?.toFixed(2) ?? "—"} />
                    <MetricCell label="Days active" value={num(selectedAd.days_active)} />
                  </div>
                </TabsContent>

                <TabsContent value="tags">
                  <TagEditor
                    tag={{
                      ad_id: selectedAd.ad_id,
                      hook_type: selectedAd.hook_type as TagData["hook_type"],
                      format: selectedAd.format as TagData["format"],
                      core_desire: selectedAd.core_desire as TagData["core_desire"],
                      awareness_stage: selectedAd.awareness_stage as TagData["awareness_stage"],
                      rationale_text: selectedAd.rationale_text,
                      tag_source: selectedAd.tag_source as TagData["tag_source"],
                      confidence_score: selectedAd.confidence_score,
                    }}
                    onSaved={handleTagSaved}
                  />
                </TabsContent>

                <TabsContent value="creative">
                  <div className="flex flex-col gap-3">
                    {selectedAd.primary_text && (
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Primary text</p>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{selectedAd.primary_text}</p>
                      </div>
                    )}
                    {selectedAd.headline && (
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Headline</p>
                        <p className="text-sm font-medium">{selectedAd.headline}</p>
                      </div>
                    )}
                    {!selectedAd.primary_text && !selectedAd.headline && (
                      <p className="text-sm text-muted-foreground">No creative text available.</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function PatternField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium capitalize">{value}</span>
    </div>
  );
}

function MixBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
