"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save } from "lucide-react";
import {
  HOOK_TYPES,
  FORMATS,
  CORE_DESIRES,
  AWARENESS_STAGES,
  type HookType,
  type Format,
  type CoreDesire,
  type AwarenessStage,
} from "@/lib/tagging";

export interface TagData {
  ad_id: string;
  hook_type: HookType | null;
  format: Format | null;
  core_desire: CoreDesire | null;
  awareness_stage: AwarenessStage | null;
  rationale_text: string | null;
  tag_source: "ai" | "manual" | "ai_confirmed" | null;
  confidence_score: number | null;
}

interface TagEditorProps {
  tag: TagData;
  onSaved: (updated: TagData) => void;
}

export function TagEditor({ tag, onSaved }: TagEditorProps) {
  const [form, setForm] = useState<TagData>(tag);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    const wasAi = tag.tag_source === "ai";
    const payload = {
      ...form,
      source: wasAi ? "ai_confirmed" : "manual",
    };

    const res = await fetch("/api/tags", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      onSaved({ ...form, tag_source: payload.source as TagData["tag_source"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  function setField<K extends keyof TagData>(key: K, value: TagData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  const sourceLabel =
    form.tag_source === "ai" ? "AI"
    : form.tag_source === "ai_confirmed" ? "AI (confirmed)"
    : "Manual";

  return (
    <div className="flex flex-col gap-5">
      {form.tag_source && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Source:</span>
          <Badge variant="outline" className="text-xs">{sourceLabel}</Badge>
          {form.confidence_score != null && (
            <span className="text-xs text-muted-foreground">
              {Math.round(form.confidence_score * 100)}% confidence
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <TagSelectField
          label="Hook type"
          value={form.hook_type ?? ""}
          options={HOOK_TYPES as unknown as string[]}
          onChange={(v) => setField("hook_type", v as HookType)}
        />
        <TagSelectField
          label="Format"
          value={form.format ?? ""}
          options={FORMATS as unknown as string[]}
          onChange={(v) => setField("format", v as Format)}
        />
        <TagSelectField
          label="Core desire"
          value={form.core_desire ?? ""}
          options={CORE_DESIRES as unknown as string[]}
          onChange={(v) => setField("core_desire", v as CoreDesire)}
        />
        <TagSelectField
          label="Awareness stage"
          value={form.awareness_stage ?? ""}
          options={AWARENESS_STAGES as unknown as string[]}
          onChange={(v) => setField("awareness_stage", v as AwarenessStage)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Rationale</Label>
        <Textarea
          rows={3}
          className="text-sm resize-none"
          value={form.rationale_text ?? ""}
          onChange={(e) => setField("rationale_text", e.target.value)}
          placeholder="Why this classification?"
        />
      </div>

      <Button size="sm" className="w-fit gap-2" onClick={handleSave} disabled={saving}>
        {saving
          ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
          : saved
          ? "Saved ✓"
          : <><Save className="h-4 w-4" />Save tags</>}
      </Button>
    </div>
  );
}

function TagSelectField({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o} className="text-xs">
              {o.replace(/_/g, " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
