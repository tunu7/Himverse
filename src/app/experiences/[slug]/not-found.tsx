import Link from "next/link";

export default function ExperienceNotFound() {
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">Experience not found</h1>
      <p className="text-muted">
        This experience doesn&apos;t exist or isn&apos;t available right now.
      </p>
      <Link
        href="/experiences"
        className="font-medium text-accent underline-offset-4 hover:underline"
      >
        Browse all experiences
      </Link>
    </section>
  );
}
