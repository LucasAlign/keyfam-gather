import { z } from "zod";

export const moneyCents = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter a non-negative amount with up to two decimal places.").transform((value) => Math.round(Number(value) * 100)).pipe(z.number().int().max(2147483647));
export const optionalMoneyCents = z.preprocess((value) => value === "" || value == null ? undefined : value, moneyCents.optional());
export const expenseCategories = ["Catering", "Speaker", "Decorations", "Venue", "Equipment", "Marketing", "Other"] as const;
export const expenseSchema = z.object({
  category: z.enum(expenseCategories),
  description: z.string().trim().min(1).max(160),
  vendor: z.string().trim().max(160),
  plannedCents: moneyCents,
  actualCents: optionalMoneyCents,
});
export const quickLinkSchema = z.object({
  title: z.string().trim().min(1).max(120),
  url: z.string().trim().max(2048).url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && ["drive.google.com", "docs.google.com"].includes(url.hostname);
  }, "Paste an HTTPS Google Drive, Docs, Sheets, or Slides link."),
});
export function budgetTotals(expenses: Array<{ plannedCents: number; actualCents: number | null }>) {
  return expenses.reduce((total, expense) => ({
    planned: total.planned + expense.plannedCents,
    actual: total.actual + (expense.actualCents ?? 0),
    forecast: total.forecast + (expense.actualCents ?? expense.plannedCents),
  }), { planned: 0, actual: 0, forecast: 0 });
}
