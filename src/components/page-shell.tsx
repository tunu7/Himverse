export function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {title}
      </h1>
      {children}
    </main>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <p role="status" className="animate-pulse text-zinc-500">
      {label}
    </p>
  );
}
