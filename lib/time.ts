// All times are "HH:MM" 24h strings within a single day (00:00-23:59).

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function toHHMM(totalMinutes: number): string {
  const mins = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(
    mins % 60
  ).padStart(2, "0")}`;
}

// Snap a time to the nearest 30-minute mark (used for activity start/end display).
export function snapToHalfHour(hhmm: string): string {
  const mins = toMinutes(hhmm);
  const snapped = Math.round(mins / 30) * 30;
  return toHHMM(snapped);
}

// Arrival time after travel: departure + minutes, rounded UP to the next 30-minute
// mark, to leave buffer for parking/traffic. If already exactly on a 30-min mark,
// it stays there (no extra buffer added).
export function arrivalWithBuffer(departureHHMM: string, travelMinutes: number): string {
  const raw = toMinutes(departureHHMM) + travelMinutes;
  const roundedUp = Math.ceil(raw / 30) * 30;
  return toHHMM(roundedUp);
}

// 12-hour display like the reference design ("1:00", "12:30") without leading zero/AM-PM,
// matching the spec's shorthand (e.g. "1 : 00" for 13:00).
export function toDisplayTime(hhmm: string): string {
  const [hStr, m] = hhmm.split(":");
  let h = Number(hStr) % 12;
  if (h === 0) h = 12;
  return `${h}:${m}`;
}

// Unambiguous display for UI that lists times across the whole day (e.g. a scrollable
// picker) where plain toDisplayTime's dropped AM/PM would make 2am and 2pm look identical.
export function toPeriodDisplayTime(hhmm: string): string {
  const hour = Number(hhmm.split(":")[0]);
  const period = hour < 6 ? "凌晨" : hour < 12 ? "上午" : hour < 13 ? "中午" : hour < 18 ? "下午" : "晚上";
  return `${period} ${toDisplayTime(hhmm)}`;
}

// "YYYY-MM-DD" date helpers, always computed in UTC so the result never shifts by a
// day depending on the browser/server's local timezone.
export function isoDateDiffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
}

export function addDaysToISODate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
