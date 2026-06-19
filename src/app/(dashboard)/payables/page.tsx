"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, CheckCircle2, RotateCcw, RefreshCw, Loader2 } from "lucide-react";

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

interface Payable {
  id: string;
  date: string;
  description: string;
  paid_by: string | null;
  amount: number;
  status: "open" | "paid";
  is_recurring: boolean;
  paid_at: string | null;
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function curr(n: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency", currency: "PHP", maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ──────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────

export default function PayablesPage() {
  const [payables, setPayables] = useState<Payable[]>([]);
  const [statusFilter, setStatusFilter] = useState("open");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    description: "",
    paid_by: "",
    amount: "",
    is_recurring: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/payables?status=${statusFilter}`);
    const json = await res.json();
    setPayables(json.payables ?? []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/payables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    });
    setSaving(false);
    setDialogOpen(false);
    setForm({ date: new Date().toISOString().slice(0, 10), description: "", paid_by: "", amount: "", is_recurring: false });
    load();
  }

  async function handleMark(id: string, newStatus: "paid" | "open") {
    setMarkingId(id);
    await fetch("/api/payables", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus }),
    });
    setMarkingId(null);
    load();
  }

  // Summary: total owed, breakdown by person
  const allOpen = useMemo(async () => {
    const res = await fetch("/api/payables?status=open");
    const json = await res.json();
    return (json.payables ?? []) as Payable[];
  }, []);

  const [openPayables, setOpenPayables] = useState<Payable[]>([]);
  useEffect(() => {
    allOpen.then(setOpenPayables);
  }, [allOpen]);

  const totalOwed = openPayables.reduce((s, p) => s + p.amount, 0);

  const byPerson = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of openPayables) {
      const name = p.paid_by ?? "Unassigned";
      map.set(name, (map.get(name) ?? 0) + p.amount);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [openPayables]);

  return (
    <>
      <Header title="Accounts Payable" />
      <div className="flex flex-1 flex-col gap-6 p-6 max-w-5xl">

        {/* Summary */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="sm:col-span-1">
            <CardContent className="pb-4 pt-4">
              <p className="text-xs text-muted-foreground">Total owed (open)</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{curr(totalOwed)}</p>
            </CardContent>
          </Card>
          {byPerson.map(([name, amount]) => (
            <Card key={name}>
              <CardContent className="pb-4 pt-4">
                <p className="text-xs text-muted-foreground">{name}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{curr(amount)}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-4">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList>
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="paid">Paid</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={load} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add payable
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Add Payable</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAdd} className="flex flex-col gap-4 py-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Date</Label>
                      <Input type="date" value={form.date}
                        onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Amount (PHP)</Label>
                      <Input type="number" min="0" step="0.01" placeholder="0"
                        value={form.amount}
                        onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Description</Label>
                    <Input placeholder="e.g. Media buyer payout — June"
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Paid by (team member)</Label>
                    <Input placeholder="e.g. Juan, Maria…"
                      value={form.paid_by}
                      onChange={(e) => setForm((f) => ({ ...f, paid_by: e.target.value }))} />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={form.is_recurring}
                      onChange={(e) => setForm((f) => ({ ...f, is_recurring: e.target.checked }))}
                    />
                    Recurring
                  </label>
                  <DialogFooter>
                    <Button type="submit" disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add payable"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Payables table */}
        <Card className="flex-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {loading ? "Loading…" : `${payables.length} ${statusFilter} item${payables.length !== 1 ? "s" : ""}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : payables.length === 0 ? (
              <p className="px-6 py-8 text-sm text-muted-foreground">
                {statusFilter === "open" ? "No open payables. Add one above." : "No paid items yet."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Paid by</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Flags</TableHead>
                      {statusFilter === "paid" && <TableHead>Paid on</TableHead>}
                      <TableHead className="w-[110px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payables.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">{fmtDate(p.date)}</TableCell>
                        <TableCell className="text-sm font-medium max-w-[220px]">
                          <span className="line-clamp-2">{p.description}</span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {p.paid_by ?? <span className="italic text-muted-foreground/60">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {curr(p.amount)}
                        </TableCell>
                        <TableCell>
                          {p.is_recurring && (
                            <Badge variant="secondary" className="text-xs">Recurring</Badge>
                          )}
                        </TableCell>
                        {statusFilter === "paid" && (
                          <TableCell className="text-xs text-muted-foreground">
                            {p.paid_at ? fmtDate(p.paid_at.slice(0, 10)) : "—"}
                          </TableCell>
                        )}
                        <TableCell>
                          {p.status === "open" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1.5 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                              disabled={markingId === p.id}
                              onClick={() => handleMark(p.id, "paid")}
                            >
                              {markingId === p.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <CheckCircle2 className="h-3 w-3" />}
                              Mark paid
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1.5 text-xs text-muted-foreground"
                              disabled={markingId === p.id}
                              onClick={() => handleMark(p.id, "open")}
                            >
                              {markingId === p.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <RotateCcw className="h-3 w-3" />}
                              Reopen
                            </Button>
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
    </>
  );
}
