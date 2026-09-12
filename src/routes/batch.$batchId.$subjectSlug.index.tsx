import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Layers } from "lucide-react";

import { RowSkeleton, EmptyState, ErrorState } from "@/components/apex/states";
import { batchDetailsQuery, topicsQuery } from "@/lib/content/client";

type SubjectSearch = { title?: string | undefined };

export const Route = createFileRoute("/batch/$batchId/$subjectSlug/")({
  validateSearch: (search: Record<string, unknown>): SubjectSearch => ({
    title: typeof search["title"] === "string" ? search["title"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Subject Topics — PW-MARCO" },
      { name: "description", content: "All topics and chapters inside this subject." },
      { property: "og:title", content: "Subject Topics — PW-MARCO" },
      { property: "og:description", content: "All topics and chapters inside this subject." },
    ],
  }),
  component: SubjectPage,
});

function SubjectPage() {
  const { batchId, subjectSlug } = Route.useParams();
  const { title } = Route.useSearch();

  const details = useQuery(batchDetailsQuery(batchId));
  const subject = details.data?.subjects?.find((s) => s.slug === subjectSlug);
  const subjectId = subject?._id ?? "";

  const topics = useQuery({
    ...topicsQuery(batchId, subjectId),
    enabled: Boolean(subjectId),
  });

  const heading = subject?.subject ?? title ?? "Topics";
  const isLoading = details.isPending || topics.isPending;
  const error = details.error ?? topics.error;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <Link
        to="/batch/$batchId"
        params={{ batchId }}
        className="text-xs font-semibold text-muted-foreground"
      >
        ← Back to batch
      </Link>
      <h1 className="mt-2 text-xl font-bold sm:text-2xl">{heading}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {details.data?.name ?? "Loading subject…"}
      </p>

      <div className="mt-5">
        {isLoading ? <RowSkeleton count={7} /> : null}
        {error ? (
          <ErrorState
            message={(error as Error).message || "Couldn't load topics."}
            onRetry={() => topics.refetch()}
          />
        ) : null}
        {!isLoading && !error && (topics.data?.length ?? 0) === 0 ? (
          <EmptyState message="No topics published for this subject yet." />
        ) : null}
        <div className="space-y-2">
          {(topics.data ?? []).map((t) => (
            <Link
              key={t._id}
              to="/batch/$batchId/$subjectSlug/$topicId"
              params={{ batchId, subjectSlug, topicId: t._id }}
              search={{ title: t.name, subject: heading, topicSlug: t.slug }}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-accent"
            >
              <Layers className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{t.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {[
                    t.videos ? `${t.videos} videos` : null,
                    t.notes ? `${t.notes} notes` : null,
                    t.exercises ? `${t.exercises} DPP` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Open topic"}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}