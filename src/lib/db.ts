import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

function connectionString(): string {
  const value =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!value) {
    throw new Error(
      "DATABASE_URL이 설정되지 않았습니다. Vercel 프로젝트에 데이터베이스를 연결하세요."
    );
  }
  return value;
}

let client: NeonQueryFunction<false, false> | null = null;

/** Lazily create the neon client so builds without env vars don't fail. */
export function getSql(): NeonQueryFunction<false, false> {
  if (!client) {
    client = neon(connectionString());
  }
  return client;
}

let ensured = false;

/** Lazily create the months table on first use. */
export async function ensureSchema(): Promise<void> {
  if (ensured) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS afocs_months (
      key TEXT PRIMARY KEY,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  ensured = true;
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}
