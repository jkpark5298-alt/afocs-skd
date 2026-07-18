import { NextResponse } from "next/server";
import type { DayStats, GapSuggestion } from "@/lib/duty";
import { buildCalendarWorkbook } from "@/lib/export-excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportBody = {
  year: number;
  month: number;
  dayStats: DayStats[];
  suggestions: GapSuggestion[];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ExportBody;
    if (
      !Number.isInteger(body.year) ||
      !Number.isInteger(body.month) ||
      body.month < 1 ||
      body.month > 12 ||
      !Array.isArray(body.dayStats) ||
      !Array.isArray(body.suggestions)
    ) {
      return NextResponse.json(
        { error: "내보낼 캘린더 데이터가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const xlsx = await buildCalendarWorkbook(body);
    const filename = `afocs-skd-${body.year}-${String(body.month).padStart(2, "0")}.xlsx`;
    return new NextResponse(new Uint8Array(xlsx), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "엑셀 내보내기에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
