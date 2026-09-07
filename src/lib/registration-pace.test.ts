import { describe, expect, it } from "vitest";
import { buildOutreachRecommendation, forecastRegistrationPace, FORECAST_DISCLAIMER, type RegistrationPaceInput } from "./registration-pace";

const at = new Date("2026-09-01T00:00:00Z");
const input = (overrides: Partial<RegistrationPaceInput> = {}): RegistrationPaceInput => ({
  goal: 250,
  registered: 100,
  daysRemaining: 10,
  recentVelocityPerDay: 8,
  velocityWindowDays: 7,
  priorConversionRate: null,
  calculatedAt: at,
  ...overrides,
});

describe("forecastRegistrationPace", () => {
  it("projects forward from current pace and lists its inputs", () => {
    const forecast = forecastRegistrationPace(input());
    // 100 + 8 * 10 = 180
    expect(forecast.projectedFinal).toBe(180);
    expect(forecast.status).toBe("behind");
    expect(forecast.projectedGap).toBe(70);
    expect(forecast.confidence).toBe("high");
    expect(forecast.isEstimate).toBe(true);
    expect(forecast.inputs).toContain("250 attendance goal");
    expect(forecast.inputs.some((line) => /Recent pace 8\/day/.test(line))).toBe(true);
  });

  it("classifies a strong pace as ahead and never projects below the current count", () => {
    const forecast = forecastRegistrationPace(input({ registered: 240, recentVelocityPerDay: 6 }));
    expect(forecast.status).toBe("ahead");
    expect(forecast.projectedRange.low).toBeGreaterThanOrEqual(forecast.registered);
  });

  it("widens the uncertainty band and leans on prior conversion when data is thin", () => {
    const thin = forecastRegistrationPace(input({ velocityWindowDays: 1, recentVelocityPerDay: 2, priorConversionRate: 0.9 }));
    expect(thin.confidence).toBe("low");
    // velocity-only would be 100 + 2*10 = 120; prior (250*0.9=225) pulls it up
    // with 50% weight → ~172.
    expect(thin.projectedFinal).toBeGreaterThan(140);
    const band = thin.projectedRange.high - thin.projectedRange.low;
    expect(band).toBeGreaterThan(0);
  });

  it("cannot project without a horizon and reports the current count", () => {
    const forecast = forecastRegistrationPace(input({ daysRemaining: null }));
    expect(forecast.status).toBe("unknown");
    expect(forecast.projectedFinal).toBe(forecast.registered);
  });

  it("is unknown when no goal is set", () => {
    const forecast = forecastRegistrationPace(input({ goal: null }));
    expect(forecast.status).toBe("unknown");
    expect(forecast.projectedGap).toBeNull();
  });
});

describe("buildOutreachRecommendation", () => {
  it("nudges outreach only when projected behind, framed as an estimate", () => {
    const behind = buildOutreachRecommendation(forecastRegistrationPace(input()));
    expect(behind).not.toBeNull();
    expect(behind!.shortfall).toBe(70);
    expect(behind!.requiresApproval).toBe(true);
    expect(behind!.reason).toMatch(/estimate, not a guarantee/);
  });

  it("stays quiet when on track or ahead", () => {
    expect(buildOutreachRecommendation(forecastRegistrationPace(input({ registered: 245 })))).toBeNull();
  });

  it("exposes a disclaimer that forecasts are not guarantees", () => {
    expect(FORECAST_DISCLAIMER).toMatch(/may differ/);
  });
});
