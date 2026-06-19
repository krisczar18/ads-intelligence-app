import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("workspace_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const preset = searchParams.get("preset") ?? "30";
  const customStart = searchParams.get("start");
  const customEnd = searchParams.get("end");

  const today = new Date();
  let dateStart: string;
  let dateEnd = today.toISOString().slice(0, 10);

  if (customStart && customEnd) {
    dateStart = customStart;
    dateEnd = customEnd;
  } else if (preset === "mtd") {
    dateStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  } else if (preset === "90") {
    const d = new Date(today); d.setDate(d.getDate() - 89);
    dateStart = d.toISOString().slice(0, 10);
  } else if (preset === "7") {
    const d = new Date(today); d.setDate(d.getDate() - 6);
    dateStart = d.toISOString().slice(0, 10);
  } else {
    // default 30
    const d = new Date(today); d.setDate(d.getDate() - 29);
    dateStart = d.toISOString().slice(0, 10);
  }

  const { data: rows, error } = await supabase.rpc("get_pnl_daily", {
    p_workspace_id: profile.workspace_id,
    p_date_start: dateStart,
    p_date_end: dateEnd,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Totals
  const totals = (rows ?? []).reduce(
    (acc: { income: number; adSpend: number; opex: number; net: number }, r: { total_income: number; ad_spend: number; opex: number; net: number }) => ({
      income: acc.income + Number(r.total_income),
      adSpend: acc.adSpend + Number(r.ad_spend),
      opex: acc.opex + Number(r.opex),
      net: acc.net + Number(r.net),
    }),
    { income: 0, adSpend: 0, opex: 0, net: 0 }
  );

  const margin = totals.income > 0 ? (totals.net / totals.income) * 100 : null;

  return NextResponse.json({ rows: rows ?? [], totals, margin, dateStart, dateEnd });
}
