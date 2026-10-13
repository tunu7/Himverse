"use client";

import { useEffect, useState } from "react";

import { Spinner } from "@/components/ui";

// What the server is doing, in order (src/server/itineraries/pipeline.ts). Timings
// are approximate: the stages are indicative, the work happens on the server.
const STAGES = [
  { after: 0, label: "Finding experiences that match your trip" },
  { after: 4, label: "Arranging them into days" },
  { after: 15, label: "Checking timings, travel and your budget" },
  { after: 30, label: "Polishing the plan" },
  { after: 50, label: "Almost there. Thanks for waiting" },
] as const;

/** Shown while an itinerary is being generated (up to about a minute). */
export function PlanningProgress() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const current = STAGES.findLastIndex((stage) => seconds >= stage.after);
  // Eases towards 95% over ~60 s; it never claims to be finished.
  const percent = Math.min(95, Math.round(100 * (1 - Math.exp(-seconds / 22))));

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-4 rounded-2xl border border-accent/30 bg-accent-soft p-5"
    >
      <div className="flex items-center gap-3">
        <Spinner className="size-5 text-accent" />
        <p className="font-semibold text-accent-soft-fg">{STAGES[current]?.label}…</p>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-accent/15"
        role="progressbar"
        aria-label="Planning progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ol className="flex flex-col gap-1.5 text-sm">
        {STAGES.slice(0, 4).map((stage, i) => (
          <li
            key={stage.label}
            className={`flex items-center gap-2 ${i <= current ? "text-accent-soft-fg" : "text-subtle"}`}
          >
            <span aria-hidden="true">{i < current ? "✓" : i === current ? "•" : "○"}</span>
            {stage.label}
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">
        {seconds}s elapsed · usually under a minute. Please keep this page open.
      </p>
    </div>
  );
}
