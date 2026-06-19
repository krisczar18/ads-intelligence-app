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
import { RefreshCw, Loader2, ImageOff, ExternalLink } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface AdAccount {
  id: string;
  name: string;
  currency: string;
}

interface AdRow {
  ad_id: string;
  ad_name: string;
  ad_status: string;
  meta_ad_id: string;
  thumbnail_url: string | null;
  primary_text: string | null;
  headline: string | null;
  adset_name: string;
  campaign_name: string;
  spend: number;
  impressions: number;
  link_clicks: number;
  result_count: number;
  cpm: number | null;
  ctr_all: number | null;
  cost_per_result: number | null;
  frequency: number | null;
  hook_rate: number | null;
  hold_rate: number | null;
  days_active: number;
}

const DATE_RANGES = [
  { label: "Last 7 days", value: "7" },
  { label: "Last 14 days", value: "14" },
  { label: "Last 30 days", value: "30" },
];

function pct(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function currency(n: number | null, curr = "PHP"): string {
  if (n == null || n === 0) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: curr,
    maximumFractionDigits: 0,
  }).format(n);
}

function num(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en").format(n);
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "ACTIVE") return "default";
  if (status === "PAUSED") return "secondary";
  return "outline";
}

export default function AdsCommandPage() {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [days, setDays] = useState("7");
  const [ads, setAds] = useState<AdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ad-accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(d.adAccounts ?? []));
  }, []);

  const loadAds = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ days });
    if (selectedAccount !== "all") params.set("adAccountId", selectedAccount);

    const res = await fetch(`/api/ads?${params}`);
    const json = await res.json();

    if (json.error) setError(json.error);
    setAds(json.ads ?? []);
    setLoading(false);
  }, [selectedAccount, days]);

  useEffect(() => { loadAds(); }, [loadAds]);

  async function handleSyncNow() {
    setSyncing(true);
    const body = selectedAccount !== "all" ? { adAccountId: selectedAccount } : {};
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSyncing(false);
    loadAds();
  }

  const currency_code =
    accounts.find((a) => a.id === selectedAccount)?.currency ?? "PHP";

  // Summary stats
  const totalSpend = ads.reduce((s, a) => s + (a.spend ?? 0), 0);
  const totalImpressions = ads.reduce((s, a) => s + (a.impressions ?? 0), 0);
  const totalResults = ads.reduce((s, a) => s + (a.result_count ?? 0), 0);
  const totalClicks = ads.reduce((s, a) => s + (a.link_clicks ?? 0), 0);

  return (
    <>
      <Header title="Ads Command" />
      <div className="flex flex-1 flex-col gap-5 p-6">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          {accounts.length > 0 && (
            <Select value={selectedAccount} onValueChange={(v) => setSelectedAccount(v ?? "all")}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={days} onValueChange={(v) => setDays(v ?? "7")}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            className="ml-auto gap-2"
            disabled={syncing}
            onClick={handleSyncNow}
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sync now
          </Button>
        </div>

        {/* Summary cards */}
        {ads.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SummaryCard label="Total spend" value={currency(totalSpend, currency_code)} />
            <SummaryCard label="Impressions" value={num(totalImpressions)} />
            <SummaryCard label="Results" value={num(totalResults)} />
            <SummaryCard label="Link clicks" value={num(totalClicks)} />
          </div>
        )}

        {/* Table */}
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
                    No ad accounts connected.{" "}
                    <Link href="/settings" className="underline underline-offset-2">
                      Add one in Settings.
                    </Link>
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
                    <Link href="/settings" className="underline underline-offset-2">
                      Connect an ad account
                    </Link>{" "}
                    to get started.
                  </p>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleSyncNow} disabled={syncing}>
                    Sync now
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Ad</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Spend</TableHead>
                      <TableHead className="text-right">Impressions</TableHead>
                      <TableHead className="text-right">CPM</TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                      <TableHead className="text-right">Results</TableHead>
                      <TableHead className="text-right">CPR</TableHead>
                      <TableHead className="text-right">Hook%</TableHead>
                      <TableHead className="text-right">Hold%</TableHead>
                      <TableHead className="text-right">Freq</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ads.map((ad) => (
                      <TableRow key={ad.ad_id}>
                        <TableCell className="pr-0">
                          {ad.thumbnail_url ? (
                            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded">
                              <Image
                                src={ad.thumbnail_url}
                                alt=""
                                fill
                                className="object-cover"
                                sizes="36px"
                              />
                            </div>
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded bg-muted">
                              <ImageOff className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <div className="flex flex-col gap-0.5">
                            <span className="truncate text-sm font-medium" title={ad.ad_name}>
                              {ad.ad_name}
                            </span>
                            <span className="truncate text-xs text-muted-foreground" title={ad.campaign_name}>
                              {ad.campaign_name} › {ad.adset_name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(ad.ad_status)} className="text-xs">
                            {ad.ad_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {currency(ad.spend, currency_code)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {num(ad.impressions)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {currency(ad.cpm, currency_code)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pct(ad.ctr_all)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {num(ad.result_count)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {currency(ad.cost_per_result, currency_code)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pct(ad.hook_rate)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pct(ad.hold_rate)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {ad.frequency?.toFixed(1) ?? "—"}
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
    </>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
