import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as Indonesian Rupiah (or a given currency). */
export function formatCurrency(
  value: number | null | undefined,
  currency = "IDR"
): string {
  if (value == null) return "—";
  if (currency === "IDR") {
    return "Rp " + new Intl.NumberFormat("id-ID").format(value);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    value
  );
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
