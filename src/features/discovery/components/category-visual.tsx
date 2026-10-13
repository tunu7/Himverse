import type { ExperienceCategory } from "@/lib/catalog-options";

/**
 * Decorative colour band and icon per category, standing in for photos until
 * providers upload images. Purely visual (aria-hidden).
 */
const STYLES: Record<ExperienceCategory, { band: string; icon: string }> = {
  culture: {
    band: "from-amber-200 to-orange-300 dark:from-amber-900/60 dark:to-orange-900/60",
    icon: "M4 20h16M6 20V10l6-5 6 5v10M10 20v-5h4v5",
  },
  trekking: {
    band: "from-emerald-200 to-teal-300 dark:from-emerald-900/60 dark:to-teal-900/60",
    icon: "M3 20 9 9l4 6 3-4 5 9Z",
  },
  adventure: {
    band: "from-sky-200 to-blue-300 dark:from-sky-900/60 dark:to-blue-900/60",
    icon: "M3 17c3-3 6 3 9 0s6 3 9 0M3 12c3-3 6 3 9 0s6 3 9 0",
  },
  wildlife: {
    band: "from-lime-200 to-green-300 dark:from-lime-900/60 dark:to-green-900/60",
    icon: "M12 21c-4-3-7-6-7-10a7 7 0 0 1 14 0c0 4-3 7-7 10Zm0-15v15",
  },
  nature: {
    band: "from-teal-200 to-cyan-300 dark:from-teal-900/60 dark:to-cyan-900/60",
    icon: "M12 3l5 8h-3l4 6H6l4-6H7Zm0 14v4",
  },
  food_and_drink: {
    band: "from-rose-200 to-orange-200 dark:from-rose-900/60 dark:to-orange-900/60",
    icon: "M4 11h16a8 8 0 0 1-16 0Zm4-6v3m4-4v4m4-3v3",
  },
  wellness: {
    band: "from-violet-200 to-fuchsia-200 dark:from-violet-900/60 dark:to-fuchsia-900/60",
    icon: "M12 20c-5-3-8-6-8-10a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 4-3 7-8 10Z",
  },
  other: {
    band: "from-zinc-200 to-stone-300 dark:from-zinc-800 dark:to-stone-800",
    icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 9h6m-3-3v6",
  },
  festivals: {
    band: "from-pink-200 to-purple-300 dark:from-pink-900/60 dark:to-purple-900/60",
    icon: "M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  },
};

export function CategoryBand({
  category,
  className = "h-28",
}: {
  category: ExperienceCategory;
  className?: string;
}) {
  const style = STYLES[category];
  return (
    <div
      aria-hidden="true"
      className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br ${style.band} ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-12 text-black/35 transition-transform duration-300 group-hover:scale-110 dark:text-white/40"
      >
        <path d={style.icon} />
      </svg>
    </div>
  );
}
