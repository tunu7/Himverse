import Link from "next/link";

/** Announces result counts and recovery options to all users, including screen readers. */
export function ResultsSummary({
  total,
  noun,
  hasFilters,
  clearHref,
  ignored,
  outOfRange,
  firstPageHref,
}: {
  total: number;
  noun: { one: string; many: string };
  hasFilters: boolean;
  clearHref: string;
  ignored: readonly string[];
  outOfRange: boolean;
  firstPageHref: string;
}) {
  return (
    <div
      role="status"
      data-testid="results-summary"
      className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300"
    >
      {ignored.length > 0 ? (
        <p className="text-amber-800 dark:text-amber-300">
          Some filters in this link weren&apos;t recognised and were ignored ({ignored.join(", ")}).
        </p>
      ) : null}
      {outOfRange ? (
        <p>
          There are no results on this page.{" "}
          <Link href={firstPageHref} className="underline">
            Go to the first page
          </Link>
          .
        </p>
      ) : total === 0 ? (
        <p>
          {hasFilters
            ? `No ${noun.many} match your search and filters.`
            : `No ${noun.many} are published yet.`}{" "}
          {hasFilters ? (
            <Link href={clearHref} className="underline">
              Clear all filters
            </Link>
          ) : null}
        </p>
      ) : (
        <p>
          {total} {total === 1 ? noun.one : noun.many}
          {hasFilters ? (
            <>
              {" "}
              ·{" "}
              <Link href={clearHref} className="underline">
                Clear all filters
              </Link>
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}
