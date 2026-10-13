/** Small presentational primitives shared across features (no data access). */

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`animate-spin ${className}`}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Button content that shows a spinner and the busy text while a form is pending. */
export function PendingLabel({
  pending,
  idle,
  busy,
}: {
  pending: boolean;
  idle: string;
  busy: string;
}) {
  return pending ? (
    <>
      <Spinner />
      {busy}
    </>
  ) : (
    idle
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`shimmer rounded-lg bg-skeleton ${className}`} />;
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex animate-fade flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface/50 px-6 py-14 text-center">
      <span
        aria-hidden="true"
        className="flex size-11 items-center justify-center rounded-full bg-surface-muted text-subtle"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className="size-5"
        >
          <path d="M3 19 9.5 8l4 6.5L16 11l5 8Z" strokeLinejoin="round" />
        </svg>
      </span>
      <p className="font-medium text-fg">{title}</p>
      {children ? <div className="text-sm text-muted">{children}</div> : null}
    </div>
  );
}
