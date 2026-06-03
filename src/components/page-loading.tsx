import { Card } from "@/components/ui";

export function PageLoading() {
  return (
    <div className="space-y-6" aria-label="Seite wird geladen">
      <div className="space-y-2">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-8 w-72 max-w-full animate-pulse rounded bg-muted" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="p-5">
            <div className="mb-4 h-10 w-10 animate-pulse rounded-md bg-muted" />
            <div className="h-8 w-16 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-4 w-28 animate-pulse rounded bg-muted" />
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index} className="space-y-4 p-5">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="space-y-3">
              <div className="h-16 animate-pulse rounded-md bg-muted" />
              <div className="h-16 animate-pulse rounded-md bg-muted" />
              <div className="h-16 animate-pulse rounded-md bg-muted" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
