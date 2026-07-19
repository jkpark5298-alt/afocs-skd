export type DutyType = "A" | "C" | "S";

export type FlightDirection = "ARR" | "DEP";

export interface RawFlightRow {
  stand?: string | null;
  flightNo: string;
  reg?: string | null;
  dep: string;
  apr: string;
  time: string; // HH:mm
  date: string; // YYYY-MM-DD
}

export interface ClassifiedFlight {
  id: string;
  flightNo: string;
  reg?: string;
  dep: string;
  apr: string;
  direction: FlightDirection;
  /** 원본 엑셀 일자 */
  originalDate: string;
  /** ICN 기준 시각 HH:mm */
  icnTime: string;
  /** 분 단위 0~1439 */
  icnMinutes: number;
  /** 기본 시간대 분류 (예외 전) */
  baseType: DutyType;
  /** 최종 근무 TYPE */
  dutyType: DutyType;
  /** 예외 전환 여부 (* 표시) */
  exception: boolean;
  /** 사용자가 시각을 수동 변경했는지 여부 (* 표시) */
  manualEdited?: boolean;
  /** 캘린더에 붙일 날짜 (S 심야는 전일) */
  calendarDate: string;
  /** 정렬용: 당일 22~23:59 = 0, 익일 00~06:30 = 1, 그 외 일반 */
  sortBucket: number;
}

export interface DayStats {
  date: string;
  a: number;
  c: number;
  s: number;
  total: number;
  flights: ClassifiedFlight[];
}

export interface GapSuggestion {
  /** S근무로 귀속된 날짜 (전일) */
  calendarDate: string;
  sCount: number;
  flights: ClassifiedFlight[];
  reason: string;
}

export const DUTY_COLORS = {
  A: { bg: "#7dd3fc", text: "#0f172a", label: "A 06:31~14:00" },
  C: { bg: "#c4b5fd", text: "#0f172a", label: "C 14:01~21:59" },
  S: { bg: "#fde047", text: "#0f172a", label: "S 22:01~익일 06:30" },
} as const;

/** HH:mm 또는 Date/엑셀 시리얼 → 분 */
export function parseTimeToMinutes(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    // excel time fraction
    if (value >= 0 && value < 1) {
      return Math.round(value * 24 * 60) % (24 * 60);
    }
  }
  if (value instanceof Date) {
    return value.getHours() * 60 + value.getMinutes();
  }
  const s = String(value).trim();
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minutesToHm(mins: number): string {
  const h = Math.floor(((mins % 1440) + 1440) % 1440 / 60);
  const m = ((mins % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseExcelDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const mo = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  if (typeof value === "number" && value > 20000 && value < 80000) {
    // Excel serial (1900 system)
    const utc = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    const y = utc.getUTCFullYear();
    const mo = String(utc.getUTCMonth() + 1).padStart(2, "0");
    const d = String(utc.getUTCDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  const s = String(value).trim().replace(/\./g, "-").replace(/\//g, "-");
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function addDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/**
 * 기본 시간대 분류 (예외 전)
 * A 06:31~14:00 / C 14:01~21:59 / S 22:01~23:59 또는 00:00~06:30
 */
export function baseDutyType(minutes: number): DutyType {
  if (minutes >= 6 * 60 + 31 && minutes <= 14 * 60) return "A";
  if (minutes >= 14 * 60 + 1 && minutes <= 21 * 60 + 59) return "C";
  // 22:01~23:59 or 00:00~06:30
  if (minutes >= 22 * 60 + 1 || minutes <= 6 * 60 + 30) return "S";
  // 14:00 exact already A; 22:00 gap → 가까운 쪽으로: 22:00은 S로
  if (minutes === 22 * 60) return "S";
  // 06:30 exact is S per upper bound; 06:31 is A
  return "A";
}

/**
 * 예외 전환 — 인천 도착편에만 적용
 * A & 도착≥13:40 → C*
 * C & 도착≥21:40 → S*
 * 00:00~06:30은 예외 없이 전날 S근무로 귀속
 */
export function applyArrivalException(
  base: DutyType,
  minutes: number
): { type: DutyType; exception: boolean } {
  if (base === "A" && minutes >= 13 * 60 + 40) {
    return { type: "C", exception: true };
  }
  if (base === "C" && minutes >= 21 * 60 + 40) {
    return { type: "S", exception: true };
  }
  return { type: base, exception: false };
}

export function classifyFlight(row: RawFlightRow, index: number): ClassifiedFlight | null {
  const dep = String(row.dep || "").trim().toUpperCase();
  const apr = String(row.apr || "").trim().toUpperCase();
  const flightNo = String(row.flightNo || "").trim();
  if (!flightNo) return null;

  let direction: FlightDirection | null = null;
  if (apr === "ICN") direction = "ARR";
  else if (dep === "ICN") direction = "DEP";
  else return null;

  const originalDate = parseExcelDate(row.date);
  const icnMinutes = parseTimeToMinutes(row.time);
  if (!originalDate || icnMinutes == null) return null;

  const baseType = baseDutyType(icnMinutes);
  let dutyType = baseType;
  let exception = false;

  if (direction === "ARR") {
    const ex = applyArrivalException(baseType, icnMinutes);
    dutyType = ex.type;
    exception = ex.exception;
  }

  // S 심야 00:00~06:30 → 예외 없이 전일 캘린더 S근무로 귀속
  let calendarDate = originalDate;
  let sortBucket = 0;
  const isOvernightWindow = icnMinutes <= 6 * 60 + 30;

  if (dutyType === "S") {
    if (isOvernightWindow) {
      calendarDate = addDays(originalDate, -1);
      sortBucket = 1; // 익일 오전은 뒤로
    } else if (icnMinutes >= 22 * 60) {
      sortBucket = 0; // 당일 야간 먼저
    }
  }

  return {
    id: `${originalDate}-${flightNo}-${direction}-${index}`,
    flightNo,
    reg: row.reg ? String(row.reg) : undefined,
    dep,
    apr,
    direction,
    originalDate,
    icnTime: minutesToHm(icnMinutes),
    icnMinutes,
    baseType,
    dutyType,
    exception,
    calendarDate,
    sortBucket,
  };
}

export function classifyFlights(rows: RawFlightRow[]): ClassifiedFlight[] {
  const out: ClassifiedFlight[] = [];
  rows.forEach((row, i) => {
    const f = classifyFlight(row, i);
    if (f) out.push(f);
  });
  return out.sort(compareFlights);
}

export function compareFlights(a: ClassifiedFlight, b: ClassifiedFlight): number {
  if (a.calendarDate !== b.calendarDate) {
    return a.calendarDate < b.calendarDate ? -1 : 1;
  }
  if (a.sortBucket !== b.sortBucket) return a.sortBucket - b.sortBucket;
  if (a.icnMinutes !== b.icnMinutes) {
    // 심야 버킷(1)은 00:xx 순서, 야간 버킷(0)의 22~23은 그대로
    return a.icnMinutes - b.icnMinutes;
  }
  return a.flightNo.localeCompare(b.flightNo);
}

export function buildDayStats(flights: ClassifiedFlight[]): DayStats[] {
  const map = new Map<string, DayStats>();
  for (const f of flights) {
    let day = map.get(f.calendarDate);
    if (!day) {
      day = { date: f.calendarDate, a: 0, c: 0, s: 0, total: 0, flights: [] };
      map.set(f.calendarDate, day);
    }
    day.flights.push(f);
    day.total += 1;
    if (f.dutyType === "A") day.a += 1;
    else if (f.dutyType === "C") day.c += 1;
    else day.s += 1;
  }
  for (const day of map.values()) {
    day.flights.sort(compareFlights);
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * S근무 중 익일 오전 02:00~05:30 사이 편명이 없는 일자 제안
 * = calendarDate 기준 S 편들 중, originalDate가 다음날이고 시각이 02:00~05:30인 편이 없음
 */
export function findSGapSuggestions(flights: ClassifiedFlight[]): GapSuggestion[] {
  const byDay = buildDayStats(flights);
  const suggestions: GapSuggestion[] = [];

  for (const day of byDay) {
    const sFlights = day.flights.filter((f) => f.dutyType === "S");
    if (!sFlights.length) continue;

    const nextDate = addDays(day.date, 1);
    const hasGapCover = sFlights.some((f) => {
      // 익일 02:00~05:30에 해당하는 편
      return (
        f.originalDate === nextDate &&
        f.icnMinutes >= 2 * 60 &&
        f.icnMinutes <= 5 * 60 + 30
      );
    });

    if (!hasGapCover) {
      suggestions.push({
        calendarDate: day.date,
        sCount: sFlights.length,
        flights: day.flights,
        reason: `익일(${nextDate}) 02:00~05:30 구간 편명 없음`,
      });
    }
  }
  return suggestions;
}

export function displayLabel(f: ClassifiedFlight): string {
  const star = f.exception || f.manualEdited ? "*" : "";
  const route = `${f.dep}→${f.apr}`;
  const reg = f.reg ? ` ${f.reg}` : "";
  return `${f.dutyType}${star} ${f.icnTime} ${route} ${f.flightNo}${reg}`;
}
