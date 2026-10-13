import Link from "next/link";

const linkClass =
  "rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium transition duration-200 hover:-translate-y-px hover:border-line-strong hover:shadow-sm";

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
