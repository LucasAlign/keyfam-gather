// ---------------------------------------------------------------------------
// #23 — Forecast Registration pace and recommend outreach (pure).
//
// Given an attendance goal, how much registration time is left, the recent
// sign-up velocity, and (when available) how prior comparable Events converted,
// this projects a likely final attendance with an explicit uncertainty band and
// says whether the Event is ahead, on track, or behind. When it is behind, it
// produces a previewable outreach recommendation — never a sent message. Every
// figure is framed as an estimate, never a guarantee.
//
// Pure and spine-independent: the loader assembles the inputs (goal, dates, a
// recent-velocity window, optional prior-Event conversion) and, once the
// recommendation spine (#21) lands, buildOutreachRecommendation feeds propose().
// ---------------------------------------------------------------------------

export type PaceStatus = "ahead" | "on_track" | "behind" | "unknown";
export type ForecastConfidence = "low" | "medium" | "high";

export type RegistrationPaceInput = {
  // Attendance goal; null when none is configured (then pace can't be judged).
  goal: number | null;
  // Active registrations so far.
  registered: number;
  // Days until registration closes (or the Event); null when open-ended.
  daysRemaining: number | null;
  // Recent sign-ups per day over the velocity window.
  recentVelocityPerDay: number;
  // How many days that velocity covers — the main driver of confidence.
  velocityWindowDays: number;
  // Optional: prior comparable Events' final-registrations-to-goal ratio, used
  // to temper a thin velocity sample.
  priorConversionRate?: number | null;
  calculatedAt: Date;
};

export type RegistrationForecast = {
  goal: number | null;
  registered: number;
  daysRemaining: number | null;
  velocityPerDay: number;
  projectedFinal: number;
  projectedRange: { low: number; high: number };
  // goal − projectedFinal; positive means projected to fall short. Null with no goal.
  projectedGap: number | null;
  status: PaceStatus;
  confidence: ForecastConfidence;
  // Always true: this is a projection, surfaced so the UI never implies certainty.
  isEstimate: true;
  // Human-readable list of the inputs the projection used.
  inputs: string[];
  calculatedAt: Date;
};

export const FORECAST_DISCLAIMER = "Projection based on current pace and prior events; actual attendance may differ.";

// How wide the uncertainty band is, as a fraction of the projected increase —
// thinner data, wider band.
const BAND_FRACTION: Record<ForecastConfidence, number> = { low: 0.4, medium: 0.25, high: 0.15 };
// How much weight the prior-Event conversion gets against the velocity
// projection — more when the velocity sample is thin.
const PRIOR_WEIGHT: Record<ForecastConfidence, number> = { low: 0.5, medium: 0.25, high: 0.1 };

function computeConfidence(velocityWindowDays: number, registered: number): ForecastConfidence {
  if (velocityWindowDays >= 7 && registered >= 10) return "high";
  if (velocityWindowDays >= 3) return "medium";
  return "low";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function forecastRegistrationPace(input: RegistrationPaceInput): RegistrationForecast {
  const confidence = computeConfidence(input.velocityWindowDays, input.registered);
  const inputs: string[] = [];
  if (input.goal !== null) inputs.push(`${formatNumber(input.goal)} attendance goal`);
  inputs.push(`${formatNumber(input.registered)} registered so far`);
  inputs.push(input.daysRemaining === null ? "No registration close date set" : `${formatNumber(input.daysRemaining)} ${input.daysRemaining === 1 ? "day" : "days"} remaining`);
  inputs.push(`Recent pace ${round1(input.recentVelocityPerDay)}/day over ${input.velocityWindowDays} ${input.velocityWindowDays === 1 ? "day" : "days"}`);
  if (input.priorConversionRate != null) inputs.push(`Prior comparable events reached ${Math.round(input.priorConversionRate * 100)}% of goal`);

  // With no horizon we cannot project forward — report the current count as-is.
  if (input.daysRemaining === null) {
    return { goal: input.goal, registered: input.registered, daysRemaining: null, velocityPerDay: input.recentVelocityPerDay, projectedFinal: input.registered, projectedRange: { low: input.registered, high: input.registered }, projectedGap: input.goal === null ? null : input.goal - input.registered, status: "unknown", confidence, isEstimate: true, inputs, calculatedAt: input.calculatedAt };
  }

  const velocityProjection = input.registered + input.recentVelocityPerDay * input.daysRemaining;
  let projected = velocityProjection;
  if (input.priorConversionRate != null && input.goal !== null) {
    const priorProjection = input.goal * input.priorConversionRate;
    const weight = PRIOR_WEIGHT[confidence];
    projected = velocityProjection * (1 - weight) + priorProjection * weight;
  }
  // Registrations only grow, so the final can never dip below the current count.
  const projectedFinal = Math.max(input.registered, Math.round(projected));
  const increment = projectedFinal - input.registered;
  const delta = Math.round(increment * BAND_FRACTION[confidence]);
  const projectedRange = { low: Math.max(input.registered, projectedFinal - delta), high: projectedFinal + delta };

  const status: PaceStatus = input.goal === null
    ? "unknown"
    : projectedFinal >= input.goal * 1.05 ? "ahead" : projectedFinal >= input.goal * 0.95 ? "on_track" : "behind";

  return { goal: input.goal, registered: input.registered, daysRemaining: input.daysRemaining, velocityPerDay: input.recentVelocityPerDay, projectedFinal, projectedRange, projectedGap: input.goal === null ? null : input.goal - projectedFinal, status, confidence, isEstimate: true, inputs, calculatedAt: input.calculatedAt };
}

export type OutreachRecommendation = {
  // How many more registrations the projection is short by.
  shortfall: number;
  daysRemaining: number;
  confidence: ForecastConfidence;
  reason: string;
  // The detector never sends; the executor requires explicit approval.
  requiresApproval: true;
};

// Only a Group projected to fall short earns an outreach nudge. On-track, ahead,
// and unknown (no goal / no horizon) forecasts return null.
export function buildOutreachRecommendation(forecast: RegistrationForecast): OutreachRecommendation | null {
  if (forecast.status !== "behind" || forecast.projectedGap === null || forecast.daysRemaining === null || forecast.projectedGap <= 0) return null;
  const shortfall = forecast.projectedGap;
  return {
    shortfall,
    daysRemaining: forecast.daysRemaining,
    confidence: forecast.confidence,
    reason: `At the current pace, registration is projected to finish about ${formatNumber(shortfall)} short of goal with ${formatNumber(forecast.daysRemaining)} ${forecast.daysRemaining === 1 ? "day" : "days"} left. Consider outreach to prior guests and unconverted invitees. This is an estimate, not a guarantee.`,
    requiresApproval: true,
  };
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
