import Link from "next/link";

const linkClass =
  "rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted";

export function Pagination({
  page,
  pageCount,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
}) {
  if (pageCount <= 1 || page > pageCount) {
    return null;
  }
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" className={linkClass}>
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <p className="text-sm text-muted">
        Page {page} of {pageCount}
      </p>
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} rel="next" className={linkClass}>
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
