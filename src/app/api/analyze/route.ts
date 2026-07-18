import { NextResponse } from "next/server";
import {
  buildDayStats,
  classifyFlights,
  findSGapSuggestions,
  type DutyType,
} from "@/lib/duty";
import { parseAfocsWorkbook } from "@/lib/parse-excel";
import { buildCalendarWorkbook } from "@/lib/export-excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const year = Number(form.get("year") || new Date().getFullYear());
    const month = Number(form.get("month") || new Date().getMonth() + 1);
    const mode = String(form.get("mode") || "analyze");
    const requestedTypes = String(form.get("types") || "A,C,S")
      .split(",")
      .filter((type): type is DutyType =>
        type === "A" || type === "C" || type === "S"
      );

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "엑셀 파일이 필요합니다." }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const parsed = parseAfocsWorkbook(buffer);
    const flights = classifyFlights(parsed.rows);
    const dayStats = buildDayStats(flights);
    const suggestions = findSGapSuggestions(flights);

    if (mode === "export") {
      const visibleFlights = flights.filter((flight) =>
        requestedTypes.includes(flight.dutyType)
      );
      const xlsx = await buildCalendarWorkbook({
        year,
        month,
        dayStats: buildDayStats(visibleFlights),
        suggestions: requestedTypes.includes("S")
          ? findSGapSuggestions(visibleFlights)
          : [],
      });
      const filename = `afocs-skd-${year}-${String(month).padStart(2, "0")}.xlsx`;
      return new NextResponse(new Uint8Array(xlsx), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({
      sheetName: parsed.sheetName,
      warnings: parsed.warnings.slice(0, 30),
      totalRows: parsed.rows.length,
      classified: flights.length,
      arrivals: flights.filter((f) => f.direction === "ARR").length,
      departures: flights.filter((f) => f.direction === "DEP").length,
      exceptions: flights.filter((f) => f.exception).length,
      dayStats,
      suggestions,
      year,
      month,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "처리 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
