import { createHash } from "node:crypto";
import { z } from "zod";

export const recommendationActionSchema = z.object({
  type: z.literal("REVIEW_WORKSPACE"),
  href: z.string().regex(/^\/events\/[^/]+(?:\/.*)?$/),
  label: z.string().trim().min(1).max(80),
});

export const recommendationProposalSchema = z.object({
  kind: z.string().trim().regex(/^[A-Z][A-Z0-9_]*$/).max(80),
  dedupeKey: z.string().trim().min(1).max(180),
  title: z.string().trim().min(1).max(160),
  why: z.string().trim().min(1).max(500),
  evidence: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  proposedAction: recommendationActionSchema,
  expectedImpact: z.string().trim().min(1).max(500),
  confidence: z.number().min(0).max(1).optional(),
});

export type RecommendationProposal = z.infer<typeof recommendationProposalSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function prepareRecommendation(proposal: RecommendationProposal) {
  const parsed = recommendationProposalSchema.parse(proposal);
  return { ...parsed, sourceFingerprint: createHash("sha256").update(stable({ evidence: parsed.evidence, proposedAction: parsed.proposedAction })).digest("hex") };
}

export function visibleRecommendation(status: string, snoozedUntil: Date | null, now = new Date()) {
  return status === "PROPOSED" || status === "APPROVED" || (status === "SNOOZED" && Boolean(snoozedUntil && snoozedUntil <= now));
}
