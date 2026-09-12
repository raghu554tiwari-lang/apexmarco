import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronRight, Clock, PlayCircle } from "lucide-react";

import { CardSkeleton, EmptyState, ErrorState } from "@/components/apex/states";
import {
  batchDetailsQuery,
  buildPlayPath,
  imageUrl,
  todaysScheduleQuery,
  type ScheduleItem,
} from "@/lib/content/client";

type ClassStatus = "live" | "upcoming" | "ended";

/** Status comes straight from the source (`tag` / `status`); never guessed. */
function classStatus(item: ScheduleItem): ClassStatus | null {
  const raw = `${item.tag ?? ""} ${item.status ?? ""}`.toLowerCase();
  if (raw.includes("end") || raw.includes("complet") || raw.includes("expired")) return "ended";
  if (raw.includes("live") || raw.includes("ongoing") || raw.includes("started")) return "live";
  if (raw.includes("upcoming") || raw.includes("todo") || raw.includes("scheduled")) return "upcoming";

  const now = Date.now();
  const start = item.startTime ? new Date(item.startTime).getTime() : NaN;
  const end = item.endTime ? new Date(item.endTime).getTime() : NaN;
  if (!Number.isNaN(end) && now > end) return "ended";
  if (!Number.isNaN(start) && now < start) return "upcoming";
  if (!Number.isNaN(start) && !Number.isNaN(end)) return "live";
  return null;
}

const STATUS_META: Record<ClassStatus, { label: string; className: string }> = {
  live: { label: "Live", className: "bg-destructive text-destructive-foreground" },
  upcoming: { label: "Upcoming", className: "bg-primary text-primary-foreground" },
  ended: { label: "Ended", className: "bg-secondary text-secondary-foreground" },
};

function timeLabel(item: ScheduleItem): string {
  const fmt = (v?: string) =>
    v && !Number.isNaN(new Date(v).getTime())
      ? new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : null;
  return [fmt(item.startTime), fmt(item.endTime)].filter(Boolean).join(" – ");
}

type SubjectRef = { id: string; slug: string };

function TodaysClasses({
  batchId,
  subjectById,
  fallbackSubject,
}: {
  batchId: string;
  subjectById: Record<string, SubjectRef>;
  fallbackSubject: SubjectRef;
}) {
  const schedule = useQuery(todaysScheduleQuery(batchId));
  const items: ScheduleItem[] = schedule.data ?? [];

  return (
    <section className="mt-6">
      <h2 className="text-lg font-bold">Today&apos;s classes</h2>
      {schedule.isPending ? (
        <div className="mt-3 flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-48 w-64 shrink-0 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No class scheduled for today.</p>
      ) : (
        <div className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
          {items.map((item) => {
            const subject =
              (item.batchSubjectId ? subjectById[item.batchSubjectId] : undefined) ??
              (item.subjectId ? subjectById[item.subjectId] : undefined) ??
              fallbackSubject;
            const status = classStatus(item);
            const meta = status ? STATUS_META[status] : null;
            // Only the source's own banner — no batch-cover stand-in.
            const banner = item.videoDetails?.image ?? null;
            const title = item.topic ?? item.videoDetails?.name ?? null;
            const when = timeLabel(item);
            const href = buildPlayPath({
              batchId,
              subjectId: subject.id,
              subjectSlug: subject.slug,
              scheduleId: item._id,
              ...(title ? { title } : {}),
            });
            return (
              <a
                key={item._id}
                href={href}
                className="group w-64 shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-accent"
              >
                <span className="relative block aspect-video w-full overflow-hidden bg-secondary">
                  {banner ? (
                    <img
                      src={banner}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center">
                      <PlayCircle className="h-8 w-8 text-muted-foreground" aria-hidden />
                    </span>
                  )}
                  {meta ? (
                    <span
                      className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.className}`}
                    >
                      {status === "live" ? (
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                      ) : null}
                      {meta.label}
                    </span>
                  ) : null}
                </span>
                <span className="block p-3">
                  {title ? (
                    <span className="line-clamp-2 block text-sm font-semibold">{title}</span>
                  ) : null}
                  {when || item.lectureType ? (
                    <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">
                        {[when, item.lectureType].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  ) : null}
                </span>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}




export const Route = createFileRoute("/batch/$batchId/")({
  head: () => ({
    meta: [
      { title: "Batch — PW-MARCO" },
      {
        name: "description",
        content: "Subjects, topics and lectures for this PW-MARCO batch.",
      },
      { property: "og:title", content: "Batch — PW-MARCO" },
      {
        property: "og:description",
        content: "Open subjects, topics and lectures for this batch.",
      },
    ],
  }),
  component: BatchPage,
});

function plainText(html?: string) {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function BatchPage() {
  const { batchId } = Route.useParams();
  const query = useQuery(batchDetailsQuery(batchId));
  const batch = query.data;
  const cover = imageUrl(batch?.previewImage);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      {query.isPending ? (
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-2xl bg-muted" />
          <CardSkeleton count={4} />
        </div>
      ) : null}

      {query.isError ? (
        <ErrorState
          message={(query.error as Error).message || "This batch isn't available."}
          onRetry={() => query.refetch()}
        />
      ) : null}

      {batch ? (
        <>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {cover ? (
              <img src={cover} alt={batch.name} className="h-40 w-full object-cover sm:h-56" />
            ) : null}
            <div className="p-4">
              <h1 className="text-xl font-bold leading-snug sm:text-2xl">{batch.name}</h1>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {batch.class ? <span>Class {batch.class}</span> : null}
                {batch.language ? <span>· {batch.language}</span> : null}
                {batch.startDate ? (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    {new Date(batch.startDate).toLocaleDateString()}
                  </span>
                ) : null}
              </div>
              {plainText(batch.shortDescription) ? (
                <p className="mt-3 line-clamp-4 text-sm text-muted-foreground">
                  {plainText(batch.shortDescription)}
                </p>
              ) : null}
            </div>
          </div>

          <TodaysClasses
            batchId={batchId}
            batchSlug={batch.slug}
            subjectSlugById={Object.fromEntries(
              (batch.subjects ?? []).flatMap((s) => [
                [s._id, s.slug] as [string, string],
                ...(s.subjectId ? [[s.subjectId, s.slug] as [string, string]] : []),
              ]),
            )}
            fallbackSubjectSlug={batch.subjects?.[0]?.slug ?? ""}
          />

          <h2 className="mt-6 text-lg font-bold">Subjects</h2>

          {batch.subjects && batch.subjects.length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {batch.subjects.map((s) => (
                <Link
                  key={s._id}
                  to="/batch/$batchId/$subjectSlug"
                  params={{ batchId, subjectSlug: s.slug }}
                  search={{ title: s.subject }}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-colors hover:border-accent"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary">
                    {imageUrl(s.imageId) ? (
                      <img
                        src={imageUrl(s.imageId) as string}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <BookOpen className="h-4 w-4" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{s.subject}</span>
                    <span className="block text-xs text-muted-foreground">
                      {s.lectureCount ? `${s.lectureCount} lectures` : "View topics"}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState message="No subjects published for this batch yet." />
          )}
        </>
      ) : null}
    </div>
  );
}