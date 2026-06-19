import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { fetchAdAccount, MetaApiError } from "@/lib/meta";

export async function POST(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  const body = await req.json();
  const { name, metaAdAccountId, accessToken } = body as {
    name: string;
    metaAdAccountId: string;
    accessToken: string;
  };

  if (!name || !metaAdAccountId || !accessToken) {
    return NextResponse.json({ error: "name, metaAdAccountId, and accessToken are required" }, { status: 400 });
  }

  // Verify token by fetching account info from Meta
  let metaAccount;
  try {
    metaAccount = await fetchAdAccount(metaAdAccountId, accessToken);
  } catch (e) {
    const msg = e instanceof MetaApiError ? e.message : String(e);
    return NextResponse.json({ error: `Meta API verification failed: ${msg}` }, { status: 400 });
  }

  // Encrypt token before storing
  let encryptedToken: string;
  try {
    encryptedToken = await encrypt(accessToken);
  } catch {
    return NextResponse.json({ error: "Token encryption failed — check ENCRYPTION_KEY" }, { status: 500 });
  }

  const { data, error } = await supabase.from("ad_accounts").insert({
    workspace_id: profile.workspace_id,
    name: name.trim(),
    meta_ad_account_id: metaAdAccountId.trim(),
    access_token_encrypted: encryptedToken,
    currency: metaAccount.currency,
    timezone: metaAccount.timezone_name,
    is_active: true,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ adAccount: data });
}

export async function GET() {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ adAccounts: [] });

  const { data, error } = await supabase
    .from("ad_accounts")
    .select("id, name, meta_ad_account_id, currency, timezone, is_active, created_at")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ adAccounts: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("ad_accounts")
    .update({ is_active: false })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
