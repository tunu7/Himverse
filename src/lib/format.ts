const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** Formats an amount in paise as rupees, e.g. 150000 -> "₹1,500". */
export function formatPriceFrom(minor: number | null): string | null {
  return minor === null ? null : inr.format(minor / 100);
}

/** 90 -> "1 h 30 min", 2880 -> "2 days". */
export function formatDuration(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest} min`;
  }
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
