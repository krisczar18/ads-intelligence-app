// POST /api/clients/link — link or unlink an ad account to a client
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { adAccountId, clientId } = await req.json(); // clientId = null to unlink
  if (!adAccountId) return NextResponse.json({ error: "adAccountId required" }, { status: 400 });

  const { error } = await supabase
    .from("ad_accounts")
    .update({ client_id: clientId ?? null })
    .eq("id", adAccountId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
