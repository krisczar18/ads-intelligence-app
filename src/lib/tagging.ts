// AI auto-tagging: sends ad creative content to Claude and returns structured tags.
// Called after sync for any ad that doesn't already have a tag row.

import Anthropic from "@anthropic-ai/sdk";
import { SupabaseClient } from "@supabase/supabase-js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const HOOK_TYPES = [
  "problem_callout",
  "curiosity",
  "social_proof",
  "fear_based",
  "ugc_testimonial",
  "unconventional_belief",
  "direct_offer",
  "before_after",
  "authority",
  "scarcity_urgency",
] as const;

export const FORMATS = [
  "static_image",
  "ugc_video",
  "presenter_video",
  "carousel",
  "meme_style",
  "slideshow",
  "animated_graphic",
] as const;

export const CORE_DESIRES = [
  "relief",
  "convenience",
  "savings",
  "status",
  "security",
  "connection",
  "achievement",
  "transformation",
] as const;

export const AWARENESS_STAGES = [
  "unaware",
  "problem_aware",
  "solution_aware",
  "product_aware",
  "most_aware",
] as const;

export type HookType = typeof HOOK_TYPES[number];
export type Format = typeof FORMATS[number];
export type CoreDesire = typeof CORE_DESIRES[number];
export type AwarenessStage = typeof AWARENESS_STAGES[number];

export interface AdTagData {
  hook_type: HookType;
  format: Format;
  core_desire: CoreDesire;
  awareness_stage: AwarenessStage;
  rationale: string;
  confidence_score: number;
}

const SYSTEM_PROMPT = `You are an expert direct-response ad analyst specializing in COD (cash-on-delivery) Facebook ads for the Philippine market.

Your job is to analyze ad creative content and classify it using a structured taxonomy.

Always respond with valid JSON only — no markdown, no explanation outside the JSON.`;

function buildUserPrompt(ad: {
  name: string;
  primaryText: string | null;
  headline: string | null;
  hasThumbnail: boolean;
}): string {
  return `Analyze this Facebook ad and classify it:

Ad name: ${ad.name}
Primary text: ${ad.primaryText ?? "(none)"}
Headline: ${ad.headline ?? "(none)"}
${ad.hasThumbnail ? "Creative: [thumbnail image attached]" : "Creative: no image available — classify based on text only"}

Classify using ONLY values from these enums:

hook_type: ${HOOK_TYPES.join(" | ")}
format: ${FORMATS.join(" | ")}
core_desire: ${CORE_DESIRES.join(" | ")}
awareness_stage: ${AWARENESS_STAGES.join(" | ")}

Respond with this exact JSON structure:
{
  "hook_type": "...",
  "format": "...",
  "core_desire": "...",
  "awareness_stage": "...",
  "rationale": "1-2 sentence explanation of your classification",
  "confidence_score": 0.0
}

confidence_score should be 0.0–1.0 reflecting how certain you are given the available information.`;
}

async function tagSingleAd(ad: {
  name: string;
  primaryText: string | null;
  headline: string | null;
  thumbnailUrl: string | null;
}): Promise<AdTagData | null> {
  const messages: Anthropic.MessageParam[] = [];

  if (ad.thumbnailUrl) {
    try {
      // Fetch thumbnail and send as base64 image content
      const imgRes = await fetch(ad.thumbnailUrl);
      if (imgRes.ok) {
        const buffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const mimeType = (imgRes.headers.get("content-type") ?? "image/jpeg") as
          | "image/jpeg"
          | "image/png"
          | "image/gif"
          | "image/webp";

        messages.push({
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType, data: base64 },
            },
            {
              type: "text",
              text: buildUserPrompt({ ...ad, hasThumbnail: true }),
            },
          ],
        });
      } else {
        throw new Error("thumbnail fetch failed");
      }
    } catch {
      // Fall back to text-only if image fetch fails
      messages.push({
        role: "user",
        content: buildUserPrompt({ ...ad, hasThumbnail: false }),
      });
    }
  } else {
    messages.push({
      role: "user",
      content: buildUserPrompt({ ...ad, hasThumbnail: false }),
    });
  }

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages,
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const parsed = JSON.parse(text) as AdTagData;
    // Validate enum values
    if (!HOOK_TYPES.includes(parsed.hook_type)) return null;
    if (!FORMATS.includes(parsed.format)) return null;
    if (!CORE_DESIRES.includes(parsed.core_desire)) return null;
    if (!AWARENESS_STAGES.includes(parsed.awareness_stage)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface TaggingResult {
  tagged: number;
  skipped: number;
  errors: string[];
}

// Tag all ads in an ad account that don't yet have a tag row.
export async function tagUntaggedAds(
  supabase: SupabaseClient,
  adAccountDbId: string,
  limit = 50 // cap per run to control API cost
): Promise<TaggingResult> {
  const result: TaggingResult = { tagged: 0, skipped: 0, errors: [] };

  // Find ads in this account that have no ad_tags row
  const { data: untagged, error } = await supabase.rpc("get_untagged_ads", {
    p_ad_account_id: adAccountDbId,
    p_limit: limit,
  });

  if (error) {
    result.errors.push(`Could not fetch untagged ads: ${error.message}`);
    return result;
  }

  if (!untagged?.length) return result;

  for (const ad of untagged as Array<{
    id: string;
    name: string;
    primary_text: string | null;
    headline: string | null;
    creative_thumbnail_url: string | null;
  }>) {
    // Skip ads with no text at all — nothing useful to classify
    if (!ad.primary_text && !ad.headline) {
      result.skipped++;
      continue;
    }

    try {
      const tags = await tagSingleAd({
        name: ad.name,
        primaryText: ad.primary_text,
        headline: ad.headline,
        thumbnailUrl: ad.creative_thumbnail_url,
      });

      if (!tags) {
        result.errors.push(`Tagging parse failed for ad ${ad.id}`);
        continue;
      }

      const { error: upsertErr } = await supabase.from("ad_tags").upsert(
        {
          ad_id: ad.id,
          hook_type: tags.hook_type,
          format: tags.format,
          core_desire: tags.core_desire,
          awareness_stage: tags.awareness_stage,
          source: "ai",
          confidence_score: tags.confidence_score,
          rationale_text: tags.rationale,
        },
        { onConflict: "ad_id" }
      );

      if (upsertErr) {
        result.errors.push(`Tag upsert failed for ad ${ad.id}: ${upsertErr.message}`);
      } else {
        result.tagged++;
      }
    } catch (e) {
      result.errors.push(`Tag error for ad ${ad.id}: ${String(e)}`);
    }
  }

  return result;
}
