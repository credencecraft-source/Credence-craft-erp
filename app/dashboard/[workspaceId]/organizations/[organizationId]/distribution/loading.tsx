import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-4 p-4 md:p-8" aria-busy="true" aria-label="Loading Advance Booking">
      <header className="space-y-2">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </header>
      <Card className="space-y-3 p-3 shadow-none">
        <div className="flex justify-between gap-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-48" />
        </div>
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex gap-3">
            {Array.from({ length: 5 }, (_, column) => (
              <Skeleton key={column} className="h-6 flex-1" />
            ))}
          </div>
        ))}
      </Card>
    </div>
  );
}
