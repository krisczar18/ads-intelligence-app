"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Loader2, Users, Link2, Unlink } from "lucide-react";

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

interface AdAccountRef {
  id: string;
  name: string;
  meta_ad_account_id: string;
  currency: string;
  is_active: boolean;
}

interface Client {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
  ad_accounts: AdAccountRef[];
}

interface AdAccount {
  id: string;
  name: string;
  meta_ad_account_id: string;
  currency: string;
  is_active: boolean;
}

// ──────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [allAccounts, setAllAccounts] = useState<AdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(false);
  const [form, setForm] = useState({ name: "", notes: "" });
  const [editNotes, setEditNotes] = useState("");
  const [linkAccountId, setLinkAccountId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [clientsRes, accsRes] = await Promise.all([
      fetch("/api/clients"),
      fetch("/api/ad-accounts"),
    ]);
    const [cj, aj] = await Promise.all([clientsRes.json(), accsRes.json()]);
    setClients(cj.clients ?? []);
    setAllAccounts(aj.adAccounts ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh selected client when clients list updates
  useEffect(() => {
    if (selectedClient) {
      const updated = clients.find((c) => c.id === selectedClient.id);
      if (updated) {
        setSelectedClient(updated);
        setEditNotes(updated.notes ?? "");
      }
    }
  }, [clients, selectedClient]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setDialogOpen(false);
    setForm({ name: "", notes: "" });
    load();
  }

  async function handleSaveNotes() {
    if (!selectedClient) return;
    setSaving(true);
    await fetch("/api/clients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selectedClient.id, name: selectedClient.name, notes: editNotes }),
    });
    setSaving(false);
    load();
  }

  async function handleDelete(id: string) {
    await fetch("/api/clients", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (selectedClient?.id === id) setSelectedClient(null);
    load();
  }

  async function handleLink() {
    if (!selectedClient || !linkAccountId) return;
    setLinking(true);
    await fetch("/api/clients/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adAccountId: linkAccountId, clientId: selectedClient.id }),
    });
    setLinkAccountId("");
    setLinking(false);
    load();
  }

  async function handleUnlink(adAccountId: string) {
    setLinking(true);
    await fetch("/api/clients/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adAccountId, clientId: null }),
    });
    setLinking(false);
    load();
  }

  // Accounts not yet linked to any client (or linked to this client)
  const availableAccounts = allAccounts.filter(
    (a) => !clients.some((c) => c.id !== selectedClient?.id && c.ad_accounts.some((aa) => aa.id === a.id))
  );

  const unlinkedAccounts = availableAccounts.filter(
    (a) => !selectedClient?.ad_accounts.some((aa) => aa.id === a.id)
  );

  function fmtDate(s: string) {
    return new Date(s).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <>
      <Header title="Clients" />
      <div className="flex flex-1 flex-col gap-6 p-6 max-w-4xl">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `${clients.length} client${clients.length !== 1 ? "s" : ""}`}
          </p>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Add client
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader><DialogTitle>Add Client</DialogTitle></DialogHeader>
              <form onSubmit={handleAdd} className="flex flex-col gap-4 py-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Brand / client name</Label>
                  <Input placeholder="e.g. Juan's Furniture"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Notes (optional)</Label>
                  <Textarea rows={3} placeholder="Any notes about this client…"
                    className="resize-none text-sm"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add client"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Client list */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No clients yet. Add one above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {clients.map((client) => (
              <Card
                key={client.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => { setSelectedClient(client); setEditNotes(client.notes ?? ""); }}
              >
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <h3 className="truncate font-semibold text-sm">{client.name}</h3>
                      <p className="text-xs text-muted-foreground">Added {fmtDate(client.created_at)}</p>
                    </div>
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleDelete(client.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {client.notes && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{client.notes}</p>
                  )}

                  {client.ad_accounts.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {client.ad_accounts.map((acc) => (
                        <Badge key={acc.id} variant="secondary" className="text-xs gap-1">
                          <Link2 className="h-2.5 w-2.5" />
                          {acc.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No ad accounts linked</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Client detail sheet */}
      <Sheet open={!!selectedClient} onOpenChange={(open) => { if (!open) setSelectedClient(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedClient && (
            <>
              <SheetHeader className="mb-5">
                <SheetTitle>{selectedClient.name}</SheetTitle>
              </SheetHeader>

              {/* Notes */}
              <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Notes</Label>
                  <Textarea
                    rows={4}
                    className="resize-none text-sm"
                    placeholder="Notes about this client…"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                  />
                </div>
                <Button size="sm" className="w-fit" onClick={handleSaveNotes} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save notes
                </Button>
              </div>

              {/* Linked ad accounts */}
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium">Linked Ad Accounts</p>

                {selectedClient.ad_accounts.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {selectedClient.ad_accounts.map((acc) => (
                      <div key={acc.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-sm font-medium truncate">{acc.name}</span>
                          <span className="text-xs text-muted-foreground font-mono">{acc.meta_ad_account_id}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={acc.is_active ? "default" : "secondary"} className="text-xs">
                            {acc.is_active ? "Active" : "Inactive"}
                          </Badge>
                          <Button
                            size="icon" variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="Unlink"
                            disabled={linking}
                            onClick={() => handleUnlink(acc.id)}
                          >
                            <Unlink className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No ad accounts linked yet.</p>
                )}

                {/* Link an account */}
                {unlinkedAccounts.length > 0 && (
                  <div className="flex gap-2 mt-1">
                    <Select value={linkAccountId} onValueChange={(v) => setLinkAccountId(v ?? "")}>
                      <SelectTrigger className="flex-1 text-sm">
                        <SelectValue placeholder="Link an account…" />
                      </SelectTrigger>
                      <SelectContent>
                        {unlinkedAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" disabled={!linkAccountId || linking} onClick={handleLink} className="gap-1.5">
                      {linking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                      Link
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
