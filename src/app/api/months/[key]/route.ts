import { NextResponse } from "next/server";
import { ensureSchema, getSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY_RE = /^(\d{4})-(\d{2})$/;

function parseKey(key: string): { year: number; month: number } | null {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    if (!parseKey(key)) {
      return NextResponse.json({ error: "잘못된 월 키입니다." }, { status: 400 });
    }
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT data FROM afocs_months WHERE key = ${key}
    `;
    if (!rows.length) {
      return NextResponse.json({ data: null });
    }
    return NextResponse.json({ data: rows[0].data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "월 데이터를 불러오지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const parsed = parseKey(key);
    if (!parsed) {
      return NextResponse.json({ error: "잘못된 월 키입니다." }, { status: 400 });
    }
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "저장할 데이터가 없습니다." }, { status: 400 });
    }
    await ensureSchema();
    const sql = getSql();
    await sql`
      INSERT INTO afocs_months (key, year, month, data, updated_at)
      VALUES (${key}, ${parsed.year}, ${parsed.month}, ${JSON.stringify(body)}, now())
      ON CONFLICT (key)
      DO UPDATE SET data = EXCLUDED.data, updated_at = now()
    `;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "월 데이터를 저장하지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    if (!parseKey(key)) {
      return NextResponse.json({ error: "잘못된 월 키입니다." }, { status: 400 });
    }
    await ensureSchema();
    const sql = getSql();
    await sql`DELETE FROM afocs_months WHERE key = ${key}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "월 데이터를 삭제하지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
