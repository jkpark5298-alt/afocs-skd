import ExcelJS from "exceljs";
import {
  DUTY_COLORS,
  type ClassifiedFlight,
  type DayStats,
  type GapSuggestion,
  displayLabel,
} from "./duty";

function startOfCalendarGrid(year: number, month: number): Date {
  // month 1-12, Sunday-start grid
  const first = new Date(year, month - 1, 1);
  const dow = first.getDay(); // 0=Sun
  const start = new Date(first);
  start.setDate(first.getDate() - dow);
  return start;
}

export async function buildCalendarWorkbook(opts: {
  year: number;
  month: number;
  dayStats: DayStats[];
  suggestions: GapSuggestion[];
}): Promise<Buffer> {
  const { year, month, dayStats, suggestions } = opts;
  const byDate = new Map(dayStats.map((d) => [d.date, d]));
  const wb = new ExcelJS.Workbook();
  wb.creator = "AFOCS SKD";

  const cal = wb.addWorksheet(`${year}-${String(month).padStart(2, "0")} 캘린더`);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  cal.addRow([`${year}년 ${month}월 AFOCS 근무 캘린더 (일~토)`]);
  cal.mergeCells(1, 1, 1, 7);
  cal.getRow(1).font = { bold: true, size: 14 };

  const header = cal.addRow(weekdays);
  header.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: col === 1 ? "FFDC2626" : "FF0F172A" } };
    cell.alignment = { horizontal: "center" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F5F9" },
    };
  });

  const start = startOfCalendarGrid(year, month);
  let cursor = new Date(start);
  for (let week = 0; week < 6; week++) {
    const dates: string[] = [];
    for (let d = 0; d < 7; d++) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth() + 1;
      const day = cursor.getDate();
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      dates.push(iso);
      cursor.setDate(cursor.getDate() + 1);
    }
    // day number row
    const numRow = cal.addRow(
      dates.map((iso) => {
        const inMonth = Number(iso.slice(5, 7)) === month;
        return inMonth ? Number(iso.slice(8, 10)) : "";
      })
    );
    numRow.font = { bold: true };

    // content row - list flights
    const content = dates.map((iso) => {
      const day = byDate.get(iso);
      if (!day) return "";
      const lines = [
        `A${day.a} C${day.c} S${day.s}`,
        ...day.flights.map((f) => displayLabel(f)),
      ];
      return lines.join("\n");
    });
    const contentRow = cal.addRow(content);
    const maxLines = Math.max(
      1,
      ...dates.map((iso) => (byDate.get(iso)?.flights.length ?? 0) + 1)
    );
    contentRow.height = Math.max(90, maxLines * 15);
    contentRow.eachCell((cell, colNumber) => {
      cell.alignment = { wrapText: true, vertical: "top" };
      const iso = dates[colNumber - 1];
      const day = byDate.get(iso);
      if (!day) return;
      // tint by majority duty
      const majority =
        day.s >= day.a && day.s >= day.c
          ? "S"
          : day.c >= day.a
            ? "C"
            : "A";
      const color = DUTY_COLORS[majority].bg.replace("#", "FF");
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: color },
      };
      cell.font = { color: { argb: "FF0F172A" }, size: 9 };
    });

    // stop if next week is fully next month and we already passed month days
    if (
      dates.every((iso) => Number(iso.slice(5, 7)) !== month) &&
      week >= 3
    ) {
      break;
    }
  }

  for (let c = 1; c <= 7; c++) {
    cal.getColumn(c).width = 22;
  }

  // stats sheet
  const st = wb.addWorksheet("일자별통계");
  st.addRow(["일자", "A", "C", "S", "합계"]);
  st.getRow(1).font = { bold: true };
  for (const d of dayStats) {
    if (Number(d.date.slice(5, 7)) !== month) continue;
    st.addRow([d.date, d.a, d.c, d.s, d.total]);
  }
  st.getColumn(1).width = 14;

  // detail sheet
  const det = wb.addWorksheet("편명상세");
  det.addRow([
    "캘린더일자",
    "원본일자",
    "TYPE",
    "예외*",
    "시각",
    "편명",
    "방향",
    "DEP",
    "APR",
    "등록기호",
  ]);
  det.getRow(1).font = { bold: true };
  const all: ClassifiedFlight[] = dayStats.flatMap((d) => d.flights);
  for (const f of all) {
    if (Number(f.calendarDate.slice(5, 7)) !== month && Number(f.originalDate.slice(5, 7)) !== month) {
      continue;
    }
    const row = det.addRow([
      f.calendarDate,
      f.originalDate,
      f.dutyType,
      f.exception ? "*" : "",
      f.icnTime,
      f.flightNo,
      f.direction,
      f.dep,
      f.apr,
      f.reg ?? "",
    ]);
    const bg = DUTY_COLORS[f.dutyType].bg.replace("#", "FF");
    row.getCell(3).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: bg },
    };
  }

  // suggestions
  const sug = wb.addWorksheet("S공백제안");
  sug.addRow(["캘린더일자", "S편수", "사유", "전체편 요약"]);
  sug.getRow(1).font = { bold: true };
  for (const s of suggestions) {
    if (Number(s.calendarDate.slice(5, 7)) !== month) continue;
    sug.addRow([
      s.calendarDate,
      s.sCount,
      s.reason,
      s.flights.map((f) => displayLabel(f)).join(" / "),
    ]);
  }
  sug.getColumn(4).width = 60;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
