// Weeks of the Changelog: weeks start on Monday and tickets count by the time they were completed.
// Plain functions without the page, so that the tests can load them.

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDay = (key) => new Date(`${key}T00:00:00`);

// The time a ticket was completed; tickets that only know their day count from midnight.
export const completionTime = (ticket) => new Date(ticket.completedAt || `${ticket.completed}T00:00:00`);

// The Monday (as YYYY-MM-DD, local time) of the week that contains the date.
export function weekOf(date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return dayKey(monday);
}

// The Mondays of the last `count` weeks including the current one, oldest first.
export function lastWeeks(count, now = new Date()) {
  const current = parseDay(weekOf(now));
  return Array.from({ length: count }, (_, i) => {
    const monday = new Date(current);
    monday.setDate(monday.getDate() - 7 * (count - 1 - i));
    return dayKey(monday);
  });
}

// Completed tickets per project for each of the weeks: [{ week, total, byProject: { MTV: 2 } }]
export function weekCounts(tickets, weeks) {
  const counts = new Map(weeks.map((week) => [week, { week, total: 0, byProject: {} }]));
  for (const ticket of tickets) {
    if (ticket.status !== 'completed' || !ticket.completed) continue;
    const entry = counts.get(weekOf(completionTime(ticket)));
    if (!entry) continue;
    entry.total += 1;
    entry.byProject[ticket.project] = (entry.byProject[ticket.project] || 0) + 1;
  }
  return [...counts.values()];
}

// Splits tickets that are already sorted newest first into runs of the same week.
export function groupByWeek(sorted) {
  const groups = [];
  for (const ticket of sorted) {
    const week = weekOf(completionTime(ticket));
    if (groups.at(-1)?.week !== week) groups.push({ week, tickets: [] });
    groups.at(-1).tickets.push(ticket);
  }
  return groups;
}

// The ISO number of the week that starts on the given Monday.
export function weekNumber(week) {
  const thursday = parseDay(week);
  thursday.setDate(thursday.getDate() + 3);
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  return 1 + Math.round((thursday - firstThursday) / (7 * 24 * 3600 * 1000));
}

// "19 – 25 Oct 2026", or "28 Sep – 4 Oct 2026" across months.
export function weekRange(week) {
  const start = parseDay(week);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const month = (d) => d.toLocaleDateString('en-GB', { month: 'short' });
  const from = start.getMonth() === end.getMonth() ? `${start.getDate()}` : `${start.getDate()} ${month(start)}`;
  return `${from} – ${end.getDate()} ${month(end)} ${end.getFullYear()}`;
}
