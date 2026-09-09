"use client";

import { useState } from "react";
import { DEFAULT_DURATION_HOURS, DURATION_PRESETS, durationMinutes, scheduleSummary, suggestEndLocal } from "@/lib/event-schedule";

// The Starts / Ends pair for the event forms, with three conveniences over two
// bare datetime inputs: picking a start auto-fills a suggested end when the end
// is empty or no longer after the start; duration chips set the end relative to
// the start in one tap; and a live line restates the chosen window in plain
// language so the coordinator can sanity-check it before saving.
export function EventScheduleFields({
  defaultStart = "",
  defaultEnd = "",
  defaultDurationHours = DEFAULT_DURATION_HOURS,
  disabled = false,
  endError,
}: {
  defaultStart?: string;
  defaultEnd?: string;
  defaultDurationHours?: number;
  disabled?: boolean;
  endError?: string;
}) {
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);

  const onStartChange = (value: string) => {
    setStart(value);
    // Fill or re-suggest the end only when the user hasn't set a still-valid one,
    // so we never overwrite a deliberate end time.
    if (value && (!end || durationMinutes(value, end) === null)) {
      const suggested = suggestEndLocal(value, defaultDurationHours);
      if (suggested) setEnd(suggested);
    }
  };

  const applyDuration = (hours: number) => {
    if (!start) return;
    const suggested = suggestEndLocal(start, hours);
    if (suggested) setEnd(suggested);
  };

  const summary = scheduleSummary(start, end);
  const activeMinutes = durationMinutes(start, end);

  return <>
    <div className="field-row">
      <label>Starts<input name="startsAt" type="datetime-local" value={start} onChange={(event) => onStartChange(event.target.value)} disabled={disabled} required /></label>
      <label>Ends<input name="endsAt" type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} disabled={disabled} required />{endError && <small>{endError}</small>}</label>
    </div>
    {!disabled && <div className="schedule-assist">
      <div className="duration-chips" role="group" aria-label="Set a duration">
        <span>Duration</span>
        {DURATION_PRESETS.map((preset) => {
          const active = activeMinutes !== null && activeMinutes === preset.hours * 60;
          return <button key={preset.hours} type="button" className={`chip${active ? " chip-active" : ""}`} onClick={() => applyDuration(preset.hours)} disabled={!start} aria-pressed={active}>{preset.label}</button>;
        })}
      </div>
      {summary && <p className="schedule-summary" aria-live="polite">{summary}</p>}
    </div>}
  </>;
}
