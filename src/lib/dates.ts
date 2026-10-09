// WIB (UTC+7) date helpers. The database returns dates as 'YYYY-MM-DD' / 'YYYY-MM-DD HH:MM:SS' strings
// in WIB; these helpers work on those strings directly so nothing depends on the server or browser
// timezone. Indonesia has no daylight saving, so a fixed +7 hour offset is always correct.

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

// Epoch milliseconds of a WIB date/datetime string, or NaN when it cannot be read.
export function parseWib(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value);
  if (!match) return NaN;
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = match;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - WIB_OFFSET_MS;
}

// 'YYYY-MM-DD HH:MM:SS' in WIB for an epoch.
export function wibDateTime(epoch: number = Date.now()): string {
  const t = new Date(epoch + WIB_OFFSET_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
}

// Whole days left until an epoch, rounded up (0 or negative once it has passed).
export function daysLeftUntil(epoch: number): number {
  return Math.ceil((epoch - Date.now()) / DAY_MS);
}

export function todayWib(): string {
  return wibDateTime().slice(0, 10);
}

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// Calendar arithmetic on the date part of a string; returns 'YYYY-MM-DD'.
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

// Whole days from `from` to `to` (date parts only); negative when `to` is earlier.
export function daysBetween(from: string, to: string): number {
  return Math.round((parseWib(to.slice(0, 10)) - parseWib(from.slice(0, 10))) / DAY_MS);
}

// Days from today until a deadline (negative when late).
export function daysUntil(deadline: string): number {
  return daysBetween(todayWib(), deadline);
}

// Monday..Sunday of the current ISO week, like PHP strtotime('monday this week').
export function currentWeekRange(): [string, string] {
  const today = todayWib();
  const weekday = new Date(parseWib(today) + WIB_OFFSET_MS).getUTCDay(); // 0 = Sunday
  const monday = addDays(today, weekday === 0 ? -6 : 1 - weekday);
  return [monday, addDays(monday, 6)];
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Weekday of a date, 0 = Sunday.
export function weekdayOf(date: string): number {
  return new Date(parseWib(date.slice(0, 10)) + WIB_OFFSET_MS).getUTCDay();
}

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? "";
}

// Subset of PHP date() letters used by the pages: d j m n Y F M D l H i s.
export function formatDate(value: string | null | undefined, pattern: string): string {
  if (!value) return "";
  const epoch = parseWib(value);
  if (Number.isNaN(epoch)) return value;
  const t = new Date(epoch + WIB_OFFSET_MS);
  const parts: Record<string, string> = {
    d: pad(t.getUTCDate()),
    j: String(t.getUTCDate()),
    m: pad(t.getUTCMonth() + 1),
    n: String(t.getUTCMonth() + 1),
    Y: String(t.getUTCFullYear()),
    F: MONTHS[t.getUTCMonth()],
    M: MONTHS[t.getUTCMonth()].slice(0, 3),
    l: WEEKDAYS[t.getUTCDay()],
    D: WEEKDAYS[t.getUTCDay()].slice(0, 3),
    H: pad(t.getUTCHours()),
    i: pad(t.getUTCMinutes()),
    s: pad(t.getUTCSeconds()),
  };
  return pattern.replace(/[djmnYFMlDHis]/g, (letter) => parts[letter]);
}
