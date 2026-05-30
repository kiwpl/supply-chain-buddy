export const fmtMoney = (n: number | string | null | undefined, currency = "USD") => {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v || 0);
};
export const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};
export const fmtQty = (n: number | string | null | undefined) => {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(v || 0);
};
