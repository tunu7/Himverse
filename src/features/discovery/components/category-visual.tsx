import type { ExperienceCategory } from "@/lib/catalog-options";

/**
 * Decorative colour band and icon per category, standing in for photos until
 * providers upload images. Purely visual (aria-hidden).
 */
const STYLES: Record<ExperienceCategory, { band: string; icon: string }> = {
  culture: {
    band: "from-amber-100 via-orange-100 to-orange-200 dark:from-amber-900/60 dark:via-zinc-900 dark:to-orange-900/60",
    icon: "M4 20h16M6 20V10l6-5 6 5v10M10 20v-5h4v5",
  },
  trekking: {
    band: "from-emerald-100 via-teal-100 to-teal-200 dark:from-emerald-900/60 dark:via-zinc-900 dark:to-teal-900/60",
    icon: "M3 20 9 9l4 6 3-4 5 9Z",
  },
  adventure: {
    band: "from-sky-100 via-sky-100 to-blue-200 dark:from-sky-900/60 dark:via-zinc-900 dark:to-blue-900/60",
    icon: "M3 17c3-3 6 3 9 0s6 3 9 0M3 12c3-3 6 3 9 0s6 3 9 0",
  },
  wildlife: {
    band: "from-lime-100 via-green-100 to-green-200 dark:from-lime-900/60 dark:via-zinc-900 dark:to-green-900/60",
    icon: "M12 21c-4-3-7-6-7-10a7 7 0 0 1 14 0c0 4-3 7-7 10Zm0-15v15",
  },
  nature: {
    band: "from-teal-100 via-cyan-100 to-cyan-200 dark:from-teal-900/60 dark:via-zinc-900 dark:to-cyan-900/60",
    icon: "M12 3l5 8h-3l4 6H6l4-6H7Zm0 14v4",
  },
  food_and_drink: {
    band: "from-rose-100 via-orange-50 to-orange-100 dark:from-rose-900/60 dark:via-zinc-900 dark:to-orange-900/60",
    icon: "M4 11h16a8 8 0 0 1-16 0Zm4-6v3m4-4v4m4-3v3",
  },
  wellness: {
    band: "from-violet-100 via-fuchsia-50 to-fuchsia-100 dark:from-violet-900/60 dark:via-zinc-900 dark:to-fuchsia-900/60",
    icon: "M12 20c-5-3-8-6-8-10a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 4-3 7-8 10Z",
  },
  other: {
    band: "from-stone-100 via-stone-100 to-stone-200 dark:from-zinc-800 dark:via-zinc-900 dark:to-stone-800",
    icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 9h6m-3-3v6",
  },
  festivals: {
    band: "from-pink-100 via-purple-50 to-purple-200 dark:from-pink-900/60 dark:via-zinc-900 dark:to-purple-900/60",
    icon: "M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  },
};

/** Layered ridge lines shared by the decorative bands. */
export function Ridges() {
  return (
    <svg
      viewBox="0 0 400 120"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="absolute inset-x-0 bottom-0 h-3/5 w-full"
    >
      <path
        d="M0 120 L60 62 L110 92 L180 38 L250 88 L310 56 L400 96 L400 120 Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M0 120 L50 96 L120 108 L200 74 L270 104 L340 84 L400 106 L400 120 Z"
        fill="currentColor"
        opacity="0.28"
      />
    </svg>
  );
}

export function CategoryBand({
  category,
  className = "h-40",
}: {
  category: ExperienceCategory;
  className?: string;
}) {
  const style = STYLES[category];
  return (
    <div aria-hidden="true" className={`relative overflow-hidden ${className}`}>
      <div
        className={`absolute inset-0 bg-gradient-to-br text-black/60 transition-transform duration-700 ease-out group-hover:scale-[1.06] dark:text-white/50 ${style.band}`}
      >
        <Ridges />
      </div>
      <span className="absolute right-4 bottom-4 flex size-10 items-center justify-center rounded-full bg-white/60 text-black/60 backdrop-blur transition duration-500 group-hover:-translate-y-1 group-hover:rotate-6 dark:bg-black/30 dark:text-white/70">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
        >
          <path d={style.icon} />
        </svg>
      </span>
    </div>
  );
}
