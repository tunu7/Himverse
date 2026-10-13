/** The Himverse.AI mark: two peaks in a rounded tile. Decorative (aria-hidden). */
export function BrandMark({ className = "size-7" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-fg text-canvas transition-transform duration-300 group-hover:-rotate-6 ${className}`}
    >
      <svg viewBox="0 0 24 24" className="size-[62%]">
        <path d="M2 19 9 7l4 6.5 2.5-4L22 19Z" fill="currentColor" />
        <path d="m9 7 1.6 2.75L9 9.2l-1.4.9Z" className="fill-accent" />
      </svg>
    </span>
  );
}

/** Mark plus wordmark, for headers and footers. */
export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 font-semibold tracking-tight ${className}`}>
      <BrandMark />
      <span>
        Himverse<span className="text-accent">.AI</span>
      </span>
    </span>
  );
}
