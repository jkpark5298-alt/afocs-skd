import { NextResponse } from "next/server";
import { ensureSchema, getSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT key, year, month, updated_at
      FROM afocs_months
      ORDER BY key DESC
    `;
    return NextResponse.json({ months: rows });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "월 목록을 불러오지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
