"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ClassifiedFlight,
  DayStats,
  DutyType,
  GapSuggestion,
} from "@/lib/duty";
import {
  DUTY_COLORS,
  buildDayStats,
  classifyFlight,
  displayLabel,
  findSGapSuggestions,
} from "@/lib/duty";

type AnalyzeResult = {
  sheetName: string;
  warnings: string[];
  totalRows: number;
  classified: number;
  arrivals: number;
  departures: number;
  exceptions: number;
  dayStats: DayStats[];
  suggestions: GapSuggestion[];
  year: number;
  month: number;
  sourceFileName?: string;
  savedAt?: string;
  error?: string;
};

type FlightDraft = {
  id?: string;
  date: string;
  time: string;
  flightNo: string;
  dep: string;
  apr: string;
  reg: string;
};

const STORAGE_PREFIX = "afocs-skd:month:";

function storageKey(year: number, month: number) {
  return `${STORAGE_PREFIX}${year}-${String(month).padStart(2, "0")}`;
}

function resultWithFlights(
  result: AnalyzeResult,
  flights: ClassifiedFlight[]
): AnalyzeResult {
  return {
    ...result,
    classified: flights.length,
    arrivals: flights.filter((flight) => flight.direction === "ARR").length,
    departures: flights.filter((flight) => flight.direction === "DEP").length,
    exceptions: flights.filter((flight) => flight.exception).length,
    dayStats: buildDayStats(flights),
    suggestions: findSGapSuggestions(flights),
    savedAt: undefined,
  };
}

function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month - 1, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(
      `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    );
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

export default function HomePage() {
  const now = new Date();
  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [editor, setEditor] = useState<FlightDraft | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<DutyType[]>([
    "A",
    "C",
    "S",
  ]);

  useEffect(() => {
    setError(null);
    setEditor(null);
    const saved = localStorage.getItem(storageKey(year, month));
    if (!saved) {
      setResult(null);
      setIsSaved(false);
      return;
    }
    try {
      setResult(JSON.parse(saved) as AnalyzeResult);
      setIsSaved(true);
    } catch {
      localStorage.removeItem(storageKey(year, month));
      setResult(null);
      setIsSaved(false);
      setError("저장된 월별 데이터를 읽지 못해 삭제했습니다.");
    }
  }, [year, month]);

  const byDate = useMemo(() => {
    const m = new Map<string, DayStats>();
    for (const day of result?.dayStats ?? []) {
      const flights = day.flights.filter((flight) =>
        selectedTypes.includes(flight.dutyType)
      );
      if (!flights.length) continue;
      m.set(day.date, {
        date: day.date,
        flights,
        a: flights.filter((flight) => flight.dutyType === "A").length,
        c: flights.filter((flight) => flight.dutyType === "C").length,
        s: flights.filter((flight) => flight.dutyType === "S").length,
        total: flights.length,
      });
    }
    return m;
  }, [result, selectedTypes]);

  const weeks = useMemo(() => monthGrid(year, month), [year, month]);
  const allFlights = useMemo(
    () => result?.dayStats.flatMap((day) => day.flights) ?? [],
    [result]
  );

  function toggleType(type: DutyType) {
    setSelectedTypes((current) => {
      if (current.includes(type)) {
        return current.length === 1
          ? current
          : current.filter((item) => item !== type);
      }
      return [...current, type];
    });
  }

  async function analyze() {
    if (!file) {
      setError("엑셀 파일을 선택하세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("year", String(year));
      form.set("month", String(month));
      form.set("mode", "analyze");
      const res = await fetch("/api/analyze", { method: "POST", body: form });
      const data = (await res.json()) as AnalyzeResult;
      if (!res.ok) throw new Error(data.error || "분석 실패");
      setResult({ ...data, sourceFileName: file.name });
      setIsSaved(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 실패");
    } finally {
      setLoading(false);
    }
  }

  async function exportExcel() {
    if (!result) {
      setError("먼저 엑셀을 분석하거나 저장된 월을 불러오세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const visibleFlights = allFlights.filter((flight) =>
        selectedTypes.includes(flight.dutyType)
      );
      const dayStats = buildDayStats(visibleFlights);
      const suggestions = selectedTypes.includes("S")
        ? findSGapSuggestions(visibleFlights)
        : [];
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, dayStats, suggestions }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "내보내기 실패");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `afocs-skd-${year}-${String(month).padStart(2, "0")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "내보내기 실패");
    } finally {
      setLoading(false);
    }
  }

  function saveMonth() {
    if (!result) {
      setError("저장할 캘린더 데이터가 없습니다.");
      return;
    }
    try {
      const saved = { ...result, savedAt: new Date().toISOString() };
      localStorage.setItem(storageKey(year, month), JSON.stringify(saved));
      setResult(saved);
      setIsSaved(true);
      setError(null);
    } catch {
      setError("브라우저 저장 공간이 부족하여 저장하지 못했습니다.");
    }
  }

  function deleteMonth() {
    if (!window.confirm(`${year}년 ${month}월 저장 데이터를 삭제할까요?`)) {
      return;
    }
    localStorage.removeItem(storageKey(year, month));
    setResult(null);
    setIsSaved(false);
    setEditor(null);
    setError(null);
  }

  function openAddFlight(date: string) {
    setEditor({
      date,
      time: "06:31",
      flightNo: "",
      dep: "ICN",
      apr: "",
      reg: "",
    });
  }

  function openEditFlight(flight: ClassifiedFlight) {
    setEditor({
      id: flight.id,
      date: flight.originalDate,
      time: flight.icnTime,
      flightNo: flight.flightNo,
      dep: flight.dep,
      apr: flight.apr,
      reg: flight.reg ?? "",
    });
  }

  function saveFlight() {
    if (!editor) return;
    const classified = classifyFlight(
      {
        flightNo: editor.flightNo,
        reg: editor.reg,
        dep: editor.dep,
        apr: editor.apr,
        time: editor.time,
        date: editor.date,
      },
      Date.now()
    );
    if (!classified) {
      setError("편명·일자·시각을 확인하고 DEP 또는 APR 중 하나를 ICN으로 입력하세요.");
      return;
    }

    const base: AnalyzeResult = result ?? {
      sheetName: "수동입력",
      warnings: [],
      totalRows: 0,
      classified: 0,
      arrivals: 0,
      departures: 0,
      exceptions: 0,
      dayStats: [],
      suggestions: [],
      year,
      month,
    };
    const nextFlight = editor.id
      ? { ...classified, id: editor.id }
      : classified;
    const nextFlights = editor.id
      ? allFlights.map((flight) =>
          flight.id === editor.id ? nextFlight : flight
        )
      : [...allFlights, nextFlight];
    setResult(resultWithFlights(base, nextFlights));
    setIsSaved(false);
    setEditor(null);
    setError(null);
  }

  function deleteFlight(flight: ClassifiedFlight) {
    if (!result || !window.confirm(`${displayLabel(flight)} 편을 삭제할까요?`)) {
      return;
    }
    setResult(
      resultWithFlights(
        result,
        allFlights.filter((item) => item.id !== flight.id)
      )
    );
    setIsSaved(false);
    setError(null);
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-8">
      <header className="mb-8">
        <p className="text-sm tracking-wide text-slate-500">AFOCS · SKD</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
          월간 근무 캘린더
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          최종변환 엑셀에서 인천 출발(DEP ICN)·도착(APR ICN)을 모두 반영해
          A/C/S 근무를 분류하고, 예외(*)·일자별 통계·S근무 공백을 확인합니다.
        </p>
      </header>

      <section className="mb-8 flex flex-wrap items-end gap-3 border-b border-slate-200 pb-6">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-500">엑셀 파일</span>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="max-w-xs text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-white"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-500">연도</span>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-24 rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-500">월</span>
          <input
            type="number"
            min={1}
            max={12}
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="w-20 rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <button
          type="button"
          onClick={analyze}
          disabled={loading}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "처리 중…" : "엑셀 불러오기"}
        </button>
        <button
          type="button"
          onClick={saveMonth}
          disabled={!result}
          className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          월 저장
        </button>
        <button
          type="button"
          onClick={deleteMonth}
          disabled={!isSaved}
          className="rounded border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
        >
          저장 월 삭제
        </button>
        <button
          type="button"
          onClick={exportExcel}
          disabled={loading || !result}
          className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
        >
          현재 캘린더 엑셀 다운로드
        </button>
        <span
          className={`self-center rounded px-2 py-1 text-xs font-medium ${
            isSaved
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {isSaved ? "브라우저에 저장됨" : result ? "저장되지 않은 변경 있음" : "저장 데이터 없음"}
        </span>
      </section>

      <div className="mb-6 flex flex-wrap gap-3 text-xs">
        {(["A", "C", "S"] as const).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => toggleType(t)}
            aria-pressed={selectedTypes.includes(t)}
            className="inline-flex items-center gap-2 rounded px-3 py-2 transition"
            style={{
              background: selectedTypes.includes(t)
                ? DUTY_COLORS[t].bg
                : "#e2e8f0",
              color: DUTY_COLORS[t].text,
              opacity: selectedTypes.includes(t) ? 1 : 0.45,
              outline: selectedTypes.includes(t)
                ? "2px solid #0f172a"
                : "2px solid transparent",
            }}
          >
            <strong>{selectedTypes.includes(t) ? "✓ " : ""}{t}</strong>
            {DUTY_COLORS[t].label.replace(`${t} `, "")}
          </button>
        ))}
        <span className="self-center text-slate-500">
          복수 선택 가능 (최소 1개)
        </span>
        <span className="text-slate-500">* = 예외 전환 (도착편)</span>
      </div>

      {error && (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {result && (
        <div className="mb-6 grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-slate-500">시트</p>
            <p className="font-medium">{result.sheetName}</p>
          </div>
          <div>
            <p className="text-slate-500">ICN 편</p>
            <p className="font-medium">
              {result.classified} (↓{result.arrivals} ↑{result.departures})
            </p>
          </div>
          <div>
            <p className="text-slate-500">예외*</p>
            <p className="font-medium">{result.exceptions}</p>
          </div>
          <div>
            <p className="text-slate-500">S공백 제안</p>
            <p className="font-medium">{result.suggestions.length}</p>
          </div>
        </div>
      )}

      <section className="mb-10 w-full overflow-x-auto">
        <div
          className="grid w-full gap-px bg-slate-200 text-sm"
          style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
        >
          {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
            <div
              key={d}
              className={`min-w-0 bg-slate-100 px-2 py-2 text-center font-medium ${
                i === 0 ? "text-red-600" : i === 6 ? "text-blue-700" : "text-slate-700"
              }`}
            >
              {d}
            </div>
          ))}
          {weeks.flatMap((week, wi) =>
            week.map((iso, di) => {
              if (!iso) {
                return (
                  <div
                    key={`e-${wi}-${di}`}
                    className="min-h-[110px] min-w-0 bg-slate-50"
                  />
                );
              }
              const day = byDate.get(iso);
              const dayNum = Number(iso.slice(8, 10));
              return (
                <div
                  key={iso}
                  className="min-h-[180px] min-w-0 overflow-hidden bg-white p-1.5 text-left"
                >
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <span className="font-semibold">{dayNum}</span>
                    <div className="flex items-center gap-1">
                      {day && (
                        <span className="shrink-0 text-[10px] text-slate-700">
                          A{day.a} C{day.c} S{day.s}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => openAddFlight(iso)}
                        className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white"
                        title={`${iso} 항공편 추가`}
                      >
                        + 추가
                      </button>
                    </div>
                  </div>
                  <ul className="space-y-1 text-[10px] leading-snug text-slate-900">
                    {(day?.flights ?? []).map((f) => (
                      <li
                        key={f.id}
                        className="break-words rounded px-1 py-1 font-medium"
                        style={{
                          background: DUTY_COLORS[f.dutyType].bg,
                          border:
                            f.dutyType === "S"
                              ? "2px solid #ca8a04"
                              : "1px solid transparent",
                        }}
                      >
                        <div className="break-words">{displayLabel(f)}</div>
                        <div className="mt-1 flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEditFlight(f)}
                            className="rounded bg-white/80 px-1.5 py-0.5 text-[9px] font-semibold"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteFlight(f)}
                            className="rounded bg-red-700 px-1.5 py-0.5 text-[9px] font-semibold text-white"
                          >
                            삭제
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      </section>

      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveFlight();
            }}
            className="w-full max-w-lg rounded-lg bg-white p-5 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                항공편 {editor.id ? "수정" : "추가"}
              </h2>
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
              >
                닫기
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-slate-500">원본 운항일자</span>
                <input
                  required
                  type="date"
                  value={editor.date}
                  onChange={(event) =>
                    setEditor({ ...editor, date: event.target.value })
                  }
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-500">ICN 시각</span>
                <input
                  required
                  type="time"
                  value={editor.time}
                  onChange={(event) =>
                    setEditor({ ...editor, time: event.target.value })
                  }
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-500">편명</span>
                <input
                  required
                  value={editor.flightNo}
                  onChange={(event) =>
                    setEditor({ ...editor, flightNo: event.target.value })
                  }
                  placeholder="KJ790"
                  className="w-full rounded border border-slate-300 px-3 py-2 uppercase"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-500">등록기호</span>
                <input
                  value={editor.reg}
                  onChange={(event) =>
                    setEditor({ ...editor, reg: event.target.value })
                  }
                  placeholder="HL7423"
                  className="w-full rounded border border-slate-300 px-3 py-2 uppercase"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-500">DEP</span>
                <input
                  required
                  value={editor.dep}
                  onChange={(event) =>
                    setEditor({ ...editor, dep: event.target.value })
                  }
                  placeholder="ICN"
                  className="w-full rounded border border-slate-300 px-3 py-2 uppercase"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-500">APR</span>
                <input
                  required
                  value={editor.apr}
                  onChange={(event) =>
                    setEditor({ ...editor, apr: event.target.value })
                  }
                  placeholder="MXP"
                  className="w-full rounded border border-slate-300 px-3 py-2 uppercase"
                />
              </label>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              DEP 또는 APR 중 하나는 ICN이어야 합니다. 00:00~06:30은 전날 S근무로 자동 귀속됩니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="rounded border border-slate-300 px-4 py-2 text-sm"
              >
                취소
              </button>
              <button
                type="submit"
                className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white"
              >
                변경 적용
              </button>
            </div>
          </form>
        </div>
      )}

      {result && result.suggestions.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-2 text-lg font-semibold">S근무 공백 제안</h2>
          <p className="mb-3 text-sm text-slate-600">
            S근무가 있으나 익일 02:00~05:30 편명이 없는 날입니다.
          </p>
          <div className="space-y-3">
            {result.suggestions
              .filter((s) => Number(s.calendarDate.slice(5, 7)) === month)
              .map((s) => (
                <div
                  key={s.calendarDate}
                  className="rounded border border-slate-300 bg-white px-3 py-3 text-sm"
                >
                  <span className="font-semibold text-slate-900">
                    {s.calendarDate}
                  </span>
                  <span className="ml-2 text-slate-600">
                    S {s.sCount}편 · {s.reason}
                  </span>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {s.flights.map((f) => (
                      <li
                        key={f.id}
                        className="rounded px-2 py-2 text-xs font-medium text-slate-900"
                        style={{
                          background: DUTY_COLORS[f.dutyType].bg,
                          border:
                            f.dutyType === "S"
                              ? "3px solid #ca8a04"
                              : "1px solid transparent",
                          boxShadow:
                            f.dutyType === "S"
                              ? "0 0 0 1px #fef08a inset"
                              : "none",
                        }}
                      >
                        {displayLabel(f)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </section>
      )}

      {result && result.warnings.length > 0 && (
        <details className="text-xs text-slate-500">
          <summary>경고 {result.warnings.length}건</summary>
          <ul className="mt-2 list-disc pl-5">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
