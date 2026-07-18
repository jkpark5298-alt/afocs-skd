/**
 * Quick smoke test against sample AFOCS workbook.
 * Run: npx tsx scripts/smoke-classify.ts
 */
import fs from "fs";
import path from "path";
import { parseAfocsWorkbook } from "../src/lib/parse-excel";
import {
  buildDayStats,
  classifyFlights,
  findSGapSuggestions,
} from "../src/lib/duty";

const sampleDir =
  process.argv[2] ||
  "C:/박종규/AI 프로잭트/afocs-auto-final-transform/output";

const files = fs
  .readdirSync(sampleDir)
  .filter((f) => f.endsWith(".xlsx") && /FINAL/i.test(f))
  .sort();
if (!files.length) {
  console.error("No sample xlsx in", sampleDir);
  process.exit(1);
}
const file = path.join(sampleDir, files[files.length - 1]);
const buf = fs.readFileSync(file);
const parsed = parseAfocsWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const flights = classifyFlights(parsed.rows);
const stats = buildDayStats(flights);
const gaps = findSGapSuggestions(flights);

console.log({
  file,
  sheet: parsed.sheetName,
  rows: parsed.rows.length,
  classified: flights.length,
  arr: flights.filter((f) => f.direction === "ARR").length,
  dep: flights.filter((f) => f.direction === "DEP").length,
  exceptions: flights.filter((f) => f.exception).length,
  days: stats.length,
  gapSuggestions: gaps.length,
  sampleDay: stats.find((d) => d.date.endsWith("-15")) ?? stats[Math.floor(stats.length / 2)],
  firstGaps: gaps.slice(0, 3).map((g) => ({
    date: g.calendarDate,
    s: g.sCount,
    reason: g.reason,
  })),
});
