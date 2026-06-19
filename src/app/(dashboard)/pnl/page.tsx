"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Loader2, TrendingUp, TrendingDown } from "lucide-react";

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

interface PnLRow {
  day: string;
  total_income: number;
  ad_spend: number;
  opex: number;
  net: number;
}

interface PnLTotals {
  income: number;
  adSpend: number;
  opex: number;
  net: number;
}

interface IncomeStream { id: string; name: string }
interface IncomeEntry {
  id: string; date: string; amount: number; notes: string | null;
  income_stream_id: string;
  income_streams: { name: string } | null;
}
interface Expense {
  id: string; date: string; label: string; amount: number;
  category: string | null; notes: string | null;
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function curr(n: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function presetDates(preset: string): { start: string; end: string } {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  if (preset === "7") {
    const s = new Date(today); s.setDate(s.getDate() - 6);
    return { start: s.toISOString().slice(0, 10), end };
  }
  if (preset === "mtd") {
    return { start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10), end };
  }
  if (preset === "90") {
    const s = new Date(today); s.setDate(s.getDate() - 89);
    return { start: s.toISOString().slice(0, 10), end };
  }
  // 30
  const s = new Date(today); s.setDate(s.getDate() - 29);
  return { start: s.toISOString().slice(0, 10), end };
}

// ──────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────

export default function PnLPage() {
  const [preset, setPreset] = useState("30");
  const [rows, setRows] = useState<PnLRow[]>([]);
  const [totals, setTotals] = useState<PnLTotals>({ income: 0, adSpend: 0, opex: 0, net: 0 });
  const [margin, setMargin] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [streams, setStreams] = useState<IncomeStream[]>([]);
  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // Dialog states
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [streamOpen, setStreamOpen] = useState(false);
  const [incomeForm, setIncomeForm] = useState({ income_stream_id: "", date: "", amount: "", notes: "" });
  const [expenseForm, setExpenseForm] = useState({ date: "", label: "", amount: "", category: "", notes: "" });
  const [streamForm, setStreamForm] = useState({ name: "" });
  const [saving, setSaving] = useState(false);

  const { start, end } = presetDates(preset);

  const loadPnl = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/pnl?preset=${preset}`);
    const json = await res.json();
    setRows(json.rows ?? []);
    setTotals(json.totals ?? { income: 0, adSpend: 0, opex: 0, net: 0 });
    setMargin(json.margin ?? null);
    setLoading(false);
  }, [preset]);

  const loadDetails = useCallback(async () => {
    const [streamsRes, entriesRes, expensesRes] = await Promise.all([
      fetch("/api/income-streams"),
      fetch(`/api/income-entries?start=${start}&end=${end}`),
      fetch(`/api/expenses?start=${start}&end=${end}`),
    ]);
    const [sj, ej, exj] = await Promise.all([streamsRes.json(), entriesRes.json(), expensesRes.json()]);
    setStreams(sj.streams ?? []);
    setEntries(ej.entries ?? []);
    setExpenses(exj.expenses ?? []);
  }, [start, end]);

  useEffect(() => { loadPnl(); loadDetails(); }, [loadPnl, loadDetails]);

  async function addIncome(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    await fetch("/api/income-entries", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...incomeForm, amount: Number(incomeForm.amount) }),
    });
    setSaving(false); setIncomeOpen(false);
    setIncomeForm({ income_stream_id: "", date: "", amount: "", notes: "" });
    loadPnl(); loadDetails();
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    await fetch("/api/expenses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...expenseForm, amount: Number(expenseForm.amount) }),
    });
    setSaving(false); setExpenseOpen(false);
    setExpenseForm({ date: "", label: "", amount: "", category: "", notes: "" });
    loadPnl(); loadDetails();
  }

  async function addStream(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    await fetch("/api/income-streams", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(streamForm),
    });
    setSaving(false); setStreamOpen(false); setStreamForm({ name: "" });
    loadDetails();
  }

  async function deleteEntry(id: string) {
    await fetch("/api/income-entries", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    loadPnl(); loadDetails();
  }

  async function deleteExpense(id: string) {
    await fetch("/api/expenses", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    loadPnl(); loadDetails();
  }

  async function deleteStream(id: string) {
    await fetch("/api/income-streams", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    loadDetails();
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Header title="P&L Dashboard" />
      <div className="flex flex-1 flex-col gap-6 p-6 max-w-6xl">

        {/* Date range tabs */}
        <div className="flex items-center gap-4">
          <Tabs value={preset} onValueChange={setPreset}>
            <TabsList>
              <TabsTrigger value="7">7 days</TabsTrigger>
              <TabsTrigger value="30">30 days</TabsTrigger>
              <TabsTrigger value="mtd">MTD</TabsTrigger>
              <TabsTrigger value="90">90 days</TabsTrigger>
            </TabsList>
          </Tabs>
          <span className="text-xs text-muted-foreground ml-2">{fmtDate(start)} – {fmtDate(end)}</span>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <SummaryCard label="Total income" value={curr(totals.income)} />
          <SummaryCard label="Ad spend" value={curr(totals.adSpend)} negative />
          <SummaryCard label="OpEx" value={curr(totals.opex)} negative />
          <SummaryCard label="Total expenses" value={curr(totals.adSpend + totals.opex)} negative />
          <SummaryCard
            label="Net profit"
            value={curr(totals.net)}
            sub={margin != null ? `${margin.toFixed(1)}% margin` : undefined}
            highlight
            negative={totals.net < 0}
          />
        </div>

        {/* Daily P&L table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Daily breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <p className="px-6 py-8 text-sm text-muted-foreground">
                No data for this period. Log income or expenses below to get started.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Income</TableHead>
                      <TableHead className="text-right">Ad spend</TableHead>
                      <TableHead className="text-right">OpEx</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.day}>
                        <TableCell className="text-sm">{fmtDate(row.day)}</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-600 font-medium">
                          {row.total_income > 0 ? curr(row.total_income) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {row.ad_spend > 0 ? curr(row.ad_spend) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {row.opex > 0 ? curr(row.opex) : "—"}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${row.net >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                          {curr(row.net)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Totals row */}
                    <TableRow className="border-t-2 font-semibold bg-muted/30">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600">{curr(totals.income)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{curr(totals.adSpend)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{curr(totals.opex)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${totals.net >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {curr(totals.net)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Log income + expenses */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Income entries */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm">Income entries</CardTitle>
              <div className="flex gap-2">
                {/* Manage streams */}
                <Dialog open={streamOpen} onOpenChange={setStreamOpen}>
                  <DialogTrigger>
                    <Button variant="ghost" size="sm" className="text-xs gap-1">Manage streams</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-sm">
                    <DialogHeader><DialogTitle>Income Streams</DialogTitle></DialogHeader>
                    <div className="flex flex-col gap-3 py-2">
                      {streams.map((s) => (
                        <div key={s.id} className="flex items-center justify-between text-sm">
                          <span>{s.name}</span>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                            onClick={() => deleteStream(s.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      <form onSubmit={addStream} className="flex gap-2 mt-2">
                        <Input placeholder="New stream name…" value={streamForm.name}
                          onChange={(e) => setStreamForm({ name: e.target.value })} className="h-8 text-sm" />
                        <Button type="submit" size="sm" disabled={saving}>Add</Button>
                      </form>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Add entry */}
                <Dialog open={incomeOpen} onOpenChange={setIncomeOpen}>
                  <DialogTrigger>
                    <Button size="sm" className="gap-1"><Plus className="h-4 w-4" />Add income</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-sm">
                    <DialogHeader><DialogTitle>Log Income</DialogTitle></DialogHeader>
                    <form onSubmit={addIncome} className="flex flex-col gap-4 py-2">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Stream</Label>
                        <Select value={incomeForm.income_stream_id}
                          onValueChange={(v) => setIncomeForm((f) => ({ ...f, income_stream_id: v ?? "" }))}>
                          <SelectTrigger><SelectValue placeholder="Select stream…" /></SelectTrigger>
                          <SelectContent>
                            {streams.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {streams.length === 0 && (
                          <p className="text-xs text-muted-foreground">Add income streams first using "Manage streams".</p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs">Date</Label>
                          <Input type="date" value={incomeForm.date} defaultValue={today}
                            onChange={(e) => setIncomeForm((f) => ({ ...f, date: e.target.value }))} required />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs">Amount (PHP)</Label>
                          <Input type="number" min="0" step="0.01" placeholder="0"
                            value={incomeForm.amount}
                            onChange={(e) => setIncomeForm((f) => ({ ...f, amount: e.target.value }))} required />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Notes (optional)</Label>
                        <Input placeholder="…" value={incomeForm.notes}
                          onChange={(e) => setIncomeForm((f) => ({ ...f, notes: e.target.value }))} />
                      </div>
                      <DialogFooter>
                        <Button type="submit" disabled={saving || !incomeForm.income_stream_id}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Log income"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {entries.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">No income logged for this period.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Stream</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(e.date)}</TableCell>
                        <TableCell className="text-sm">{e.income_streams?.name ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-medium text-emerald-600">
                          {curr(e.amount)}
                        </TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteEntry(e.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Expenses */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm">Operating expenses</CardTitle>
              <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
                <DialogTrigger>
                  <Button size="sm" className="gap-1"><Plus className="h-4 w-4" />Add expense</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-sm">
                  <DialogHeader><DialogTitle>Log Expense</DialogTitle></DialogHeader>
                  <form onSubmit={addExpense} className="flex flex-col gap-4 py-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Date</Label>
                        <Input type="date" value={expenseForm.date} defaultValue={today}
                          onChange={(e) => setExpenseForm((f) => ({ ...f, date: e.target.value }))} required />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Amount (PHP)</Label>
                        <Input type="number" min="0" step="0.01" placeholder="0"
                          value={expenseForm.amount}
                          onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))} required />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Label</Label>
                      <Input placeholder="e.g. Freelancer payment, Software tool…"
                        value={expenseForm.label}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, label: e.target.value }))} required />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Category (optional)</Label>
                      <Input placeholder="e.g. Payroll, SaaS, Ads…"
                        value={expenseForm.category}
                        onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value }))} />
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Log expense"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="p-0">
              {expenses.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">No expenses logged for this period.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((ex) => (
                      <TableRow key={ex.id}>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(ex.date)}</TableCell>
                        <TableCell className="text-sm">
                          <div className="flex flex-col gap-0.5">
                            <span>{ex.label}</span>
                            {ex.category && <span className="text-xs text-muted-foreground">{ex.category}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-medium text-destructive">
                          {curr(ex.amount)}
                        </TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteExpense(ex.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, negative = false, highlight = false,
}: {
  label: string; value: string; sub?: string; negative?: boolean; highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary/30" : ""}>
      <CardContent className="pb-4 pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="mt-1 flex items-baseline gap-1.5">
          {negative ? (
            <TrendingDown className="h-3.5 w-3.5 shrink-0 text-destructive" />
          ) : (
            <TrendingUp className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          )}
          <span className={`text-lg font-semibold tabular-nums ${negative ? "text-destructive" : "text-foreground"}`}>
            {value}
          </span>
        </div>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
