import { Skeleton } from "@/components/ui";

const widths = { default: "max-w-6xl", narrow: "max-w-3xl", form: "max-w-xl" } as const;

/** Standard page frame: consistent width, spacing and title. */
export function PageShell({
  title,
  description,
  width = "default",
  children,
}: {
  title: string;
  description?: React.ReactNode;
  width?: keyof typeof widths;
  children: React.ReactNode;
}) {
  return (
    <main
      className={`mx-auto flex w-full ${widths[width]} flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14`}
    >
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{title}</h1>
        {description ? <p className="max-w-2xl text-muted">{description}</p> : null}
      </header>
      {children}
    </main>
  );
}

/** Main element for pages whose title comes from loaded data (detail pages). */
export function PageMain({
  width = "default",
  children,
}: {
  width?: keyof typeof widths;
  children: React.ReactNode;
}) {
  return (
    <main
      className={`mx-auto flex w-full ${widths[width]} flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14`}
    >
      {children}
    </main>
  );
}

type LoadingVariant = "cards" | "detail" | "list" | "form";

/**
 * Suspense fallback shaped like the content it replaces, so the layout doesn't
 * jump when data arrives. `label` is announced to screen readers.
 */
export function LoadingBlock({
  label,
  variant = "list",
}: {
  label: string;
  variant?: LoadingVariant;
}) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">{label}</span>
      {variant === "cards" ? <CardsSkeleton /> : null}
      {variant === "detail" ? <DetailSkeleton /> : null}
      {variant === "list" ? <ListSkeleton /> : null}
      {variant === "form" ? <FormSkeleton /> : null}
    </div>
  );
}

function CardsSkeleton() {
  return (
    <>
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-4 w-32" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border border-line p-5">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="mt-4 h-4 w-2/3" />
          </div>
        ))}
      </div>
    </>
  );
}

function DetailSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </div>
      <div className="grid gap-4 rounded-xl border border-line p-5 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-32" />
          </div>
        ))}
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
    </>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-4 rounded-xl border border-line p-4"
        >
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
      <Skeleton className="h-10 w-32 rounded-lg" />
    </div>
  );
}
