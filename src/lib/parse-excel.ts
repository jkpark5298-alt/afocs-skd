import * as XLSX from "xlsx";
import type { RawFlightRow } from "./duty";
import { parseExcelDate } from "./duty";

function cell(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (k in row && row[k] != null && String(row[k]).trim() !== "") {
      return row[k];
    }
  }
  // case-insensitive
  const lower = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.toLowerCase(), v])
  );
  for (const k of keys) {
    const hit = lower[k.toLowerCase()];
    if (hit != null && String(hit).trim() !== "") return hit;
  }
  return null;
}

/** AFOCS 최종변환 시트 → RawFlightRow[] */
export function parseAfocsWorkbook(buffer: ArrayBuffer): {
  rows: RawFlightRow[];
  sheetName: string;
  warnings: string[];
} {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const warnings: string[] = [];

  const preferred =
    wb.SheetNames.find((n) => /최종변환|변환|final/i.test(n)) ??
    wb.SheetNames[0];
  const sheet = wb.Sheets[preferred];
  if (!sheet) {
    return { rows: [], sheetName: preferred, warnings: ["시트를 찾을 수 없습니다."] };
  }

  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(
    sheet,
    { header: 1, defval: null, raw: true }
  ) as unknown[][];

  // 헤더 행 찾기
  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(15, matrix.length); i++) {
    const row = (matrix[i] ?? []).map((v) => String(v ?? "").trim());
    const joined = row.join("|");
    if (/DEP/i.test(joined) && /APR/i.test(joined) && /(편명|FLT)/i.test(joined)) {
      headerIdx = i;
      headers = row;
      break;
    }
  }
  if (headerIdx < 0) {
    return {
      rows: [],
      sheetName: preferred,
      warnings: ["헤더(편명/DEP/APR)를 찾지 못했습니다."],
    };
  }

  const idx = (names: string[]) => {
    for (const n of names) {
      const i = headers.findIndex((h) => h.toLowerCase() === n.toLowerCase());
      if (i >= 0) return i;
    }
    for (const n of names) {
      const i = headers.findIndex((h) => h.toLowerCase().includes(n.toLowerCase()));
      if (i >= 0) return i;
    }
    return -1;
  };

  const iFlight = idx(["편명", "FLT", "FLIGHT"]);
  const iDep = idx(["DEP", "출발"]);
  const iApr = idx(["APR", "ARR", "도착"]);
  const iTime = idx(["ETD/ETA", "ETA", "ETD", "시각", "TIME"]);
  const iDate = idx(["일자", "DATE", "운항일"]);
  const iReg = idx(["등록기호", "REG", "TAIL"]);
  const iStand = idx(["주기장", "STAND", "BAY"]);

  if (iFlight < 0 || iDep < 0 || iApr < 0 || iTime < 0 || iDate < 0) {
    warnings.push(`필수 열 누락: flight=${iFlight} dep=${iDep} apr=${iApr} time=${iTime} date=${iDate}`);
  }

  const rows: RawFlightRow[] = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    const flightNo = String(line[iFlight] ?? "").trim();
    if (!flightNo) continue;
    const date = parseExcelDate(line[iDate]);
    if (!date) {
      warnings.push(`행 ${r + 1}: 일자 파싱 실패 (${flightNo})`);
      continue;
    }
    const rawTime = line[iTime];
    let timeStr = "";
    if (rawTime instanceof Date) {
      timeStr = `${String(rawTime.getHours()).padStart(2, "0")}:${String(rawTime.getMinutes()).padStart(2, "0")}`;
    } else if (typeof rawTime === "number" && rawTime >= 0 && rawTime < 1) {
      const mins = Math.round(rawTime * 24 * 60) % (24 * 60);
      timeStr = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    } else {
      timeStr = String(rawTime ?? "").trim();
    }

    rows.push({
      stand: iStand >= 0 ? String(line[iStand] ?? "") || null : null,
      flightNo,
      reg: iReg >= 0 ? String(line[iReg] ?? "") || null : null,
      dep: String(line[iDep] ?? "").trim(),
      apr: String(line[iApr] ?? "").trim(),
      time: timeStr,
      date,
    });
  }

  return { rows, sheetName: preferred, warnings };
}

// silence unused in some builds
void cell;
