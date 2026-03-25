/**
 * Formats an ISO timestamp as 'Mon D, YYYY' (e.g. "Mar 24, 2026") for date-only display.
 */
export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Formats an ISO timestamp as 'Mon D, YYYY, H:MM AM/PM' (e.g. "Mar 24, 2026, 7:49 PM")
 * for display contexts that need both date and time.
 */
export function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * Formats a YYYY-MM-DD date string as 'Mon D' (e.g. "Mar 24") for chart axis labels.
 * Parses as local date to avoid UTC-midnight off-by-one issues.
 */
export function formatDateShort(iso: string): string {
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return iso;
  const [year, month, day] = parts as [number, number, number];
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
