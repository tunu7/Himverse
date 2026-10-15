import Link from "next/link";

/** Building blocks shared by the traveller, partner and admin dashboards. */

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  tone?: "default" | "attention";
}) {
  const body = (
    <>
      <span className="text-xs font-medium tracking-wide text-subtle uppercase">{label}</span>
      <span className="text-3xl font-semibold tracking-tight text-fg tabular-nums">{value}</span>
      {hint ? <span className="text-sm text-muted">{hint}</span> : null}
    </>
  );
  const className = `flex flex-col gap-1 rounded-2xl border p-5 transition ${
    tone === "attention"
      ? "border-amber-400/50 bg-amber-50/60 dark:bg-amber-400/5"
      : "border-line bg-surface"
  }`;
  return href ? (
    <Link
      href={href}
      className={`${className} hover:-translate-y-px hover:border-line-strong hover:shadow-sm`}
      data-testid={`stat-${label.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`}
    >
      {body}
    </Link>
  ) : (
    <div
      className={className}
      data-testid={`stat-${label.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`}
    >
      {body}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export type ChecklistStep = { label: string; done: boolean; href?: string; detail?: string };

/** Setup steps with a progress count; the first open step is highlighted. */
export function Checklist({ steps }: { steps: readonly ChecklistStep[] }) {
  const done = steps.filter((s) => s.done).length;
  const next = steps.findIndex((s) => !s.done);
  return (
    <div className="flex flex-col gap-3" data-testid="setup-checklist">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>
        <span className="text-sm text-muted tabular-nums">
          {done}/{steps.length} done
        </span>
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <li
            key={step.label}
            className={`flex items-start gap-3 rounded-xl p-3 ${i === next ? "bg-accent-soft" : ""}`}
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                step.done ? "bg-accent text-on-accent" : "border border-line-strong text-muted"
              }`}
            >
              {step.done ? "✓" : i + 1}
            </span>
            <span className="flex flex-col gap-0.5">
              {step.href && !step.done ? (
                <Link
                  href={step.href}
                  className="font-medium text-fg hover:text-accent hover:underline"
                >
                  {step.label}
                </Link>
              ) : (
                <span
                  className={`font-medium ${step.done ? "text-muted line-through" : "text-fg"}`}
                >
                  {step.label}
                </span>
              )}
              {step.detail ? <span className="text-sm text-muted">{step.detail}</span> : null}
              <span className="sr-only">{step.done ? "(done)" : "(to do)"}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export type TabLink = { key: string; label: string; count?: number };

/** URL-driven filter tabs (works without JavaScript; the server filters). */
export function FilterTabs({
  tabs,
  active,
  hrefFor,
  label,
}: {
  tabs: readonly TabLink[];
  active: string;
  hrefFor: (key: string) => string;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="flex gap-1 overflow-x-auto rounded-full border border-line bg-surface-muted p-1"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={hrefFor(tab.key)}
          aria-current={tab.key === active ? "page" : undefined}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
            tab.key === active ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
          }`}
        >
          {tab.label}
          {tab.count !== undefined ? (
            <span className="ml-1.5 rounded-full bg-line px-1.5 text-xs tabular-nums">
              {tab.count}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-line-strong p-6">
      <p className="font-medium text-fg">{title}</p>
      {body ? <p className="text-sm text-muted">{body}</p> : null}
      {action}
    </div>
  );
}
