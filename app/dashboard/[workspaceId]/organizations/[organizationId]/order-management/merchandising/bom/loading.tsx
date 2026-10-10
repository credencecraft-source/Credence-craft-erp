import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading BOM report">
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex gap-3">
              {Array.from({ length: 5 }, (_, column) => (
                <Skeleton key={column} className="h-5 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
