/** Format minor units (e.g. ETB santim) as a currency string. */
export function formatMoney(amount: number, currency = "ETB"): string {
  return new Intl.NumberFormat("en-ET", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

export const CYCLE_DISCOUNTS: Record<string, number> = {
  monthly: 0,
  six_months: 0.1,
  annual: 0.2,
};

export function applyDiscount(amount: number, cycle: string): number {
  const discount = CYCLE_DISCOUNTS[cycle] ?? 0;
  return Math.round(amount * (1 - discount));
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}
