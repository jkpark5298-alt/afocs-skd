"use client";

import { useMemo, useState } from "react";
import type { DayStats, DutyType, GapSuggestion } from "@/lib/duty";
import { DUTY_COLORS, displayLabel } from "@/lib/duty";

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
  error?: string;
};

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
  const [selectedTypes, setSelectedTypes] = useState<DutyType[]>([
    "A",
    "C",
    "S",
  ]);

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
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 실패");
    } finally {
      setLoading(false);
    }
  }

  async function exportExcel() {
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
      form.set("mode", "export");
      form.set("types", selectedTypes.join(","));
      const res = await fetch("/api/analyze", { method: "POST", body: form });
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
          {loading ? "처리 중…" : "분석"}
        </button>
        <button
          type="button"
          onClick={exportExcel}
          disabled={loading || !file}
          className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
        >
          현재 캘린더 엑셀 다운로드
        </button>
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
                  <div className="mb-1 flex items-baseline justify-between gap-1">
                    <span className="font-semibold">{dayNum}</span>
                    {day && (
                      <span className="shrink-0 text-[10px] text-slate-700">
                        A{day.a} C{day.c} S{day.s}
                      </span>
                    )}
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
                        {displayLabel(f)}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      </section>

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
