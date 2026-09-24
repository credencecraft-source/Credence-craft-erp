import Link from "next/link";

type SegmentItem = {
  id: string;
  name: string;
};

type SegmentRestrictionNavigationProps = {
  segments: readonly SegmentItem[];
  currentSegmentId: string;
  segmentBasePath: string;
  restrictionSlug: "modulesbased-restriction" | "transactionbased-restriction";
};

function segmentUrlSegment(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function SegmentRestrictionNavigation({
  segments,
  currentSegmentId,
  segmentBasePath,
  restrictionSlug,
}: SegmentRestrictionNavigationProps) {
  const currentIndex = segments.findIndex((segment) => segment.id === currentSegmentId);
  const currentSegment = segments[currentIndex];
  const previousSegment = currentIndex > 0 ? segments[currentIndex - 1] : null;
  const nextSegment = currentIndex >= 0 && currentIndex < segments.length - 1 ? segments[currentIndex + 1] : null;
  const restrictionLabel = restrictionSlug === "modulesbased-restriction" ? "Module" : "Transaction";
  const alternateSlug = restrictionSlug === "modulesbased-restriction" ? "transactionbased-restriction" : "modulesbased-restriction";

  const pathFor = (segment: SegmentItem, slug = restrictionSlug) =>
    `${segmentBasePath}/${segmentUrlSegment(segment.name)}/${slug}`;

  if (!currentSegment) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Segment setup</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{currentSegment.name.toUpperCase()} <span className="font-normal text-slate-500">of {segments.length} segments</span></p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Link href={pathFor(currentSegment, alternateSlug)} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-slate-600 hover:border-slate-300 hover:text-slate-900">
            {alternateSlug === "modulesbased-restriction" ? "Module restrictions" : "Transaction restrictions"}
          </Link>
          {previousSegment ? <Link href={pathFor(previousSegment)} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-slate-600 hover:border-slate-300 hover:text-slate-900">Previous</Link> : <span className="rounded-md border border-slate-100 px-2.5 py-1.5 text-slate-300">Previous</span>}
          {nextSegment ? <Link href={pathFor(nextSegment)} className="rounded-md bg-slate-900 px-2.5 py-1.5 text-white hover:bg-slate-700">Next</Link> : <span className="rounded-md bg-slate-100 px-2.5 py-1.5 text-slate-400">Next</span>}
        </div>
      </div>
      <nav aria-label={`${restrictionLabel} restriction segments`} className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {segments.map((segment) => {
          const isCurrent = segment.id === currentSegmentId;
          return (
            <Link
              key={segment.id}
              href={pathFor(segment)}
              aria-current={isCurrent ? "page" : undefined}
              className={`shrink-0 rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${isCurrent ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-800"}`}
            >
              {segment.name.toUpperCase()}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}