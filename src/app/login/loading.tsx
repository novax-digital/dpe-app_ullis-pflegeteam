import Image from "next/image";
import { Card } from "@/components/ui";

export default function LoginLoading() {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[0.95fr_1.05fr]">
      <section className="hidden bg-primary px-12 py-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/ullis-logo.png"
            alt="Ullis Pflegeteam"
            width={48}
            height={48}
            className="rounded-full bg-white object-contain"
            priority
          />
          <div>
            <div className="h-5 w-40 animate-pulse rounded bg-white/25" />
            <div className="mt-2 h-4 w-32 animate-pulse rounded bg-white/20" />
          </div>
        </div>
        <div className="max-w-lg space-y-4">
          <div className="h-12 w-80 animate-pulse rounded bg-white/25" />
          <div className="h-6 w-full animate-pulse rounded bg-white/20" />
          <div className="h-6 w-2/3 animate-pulse rounded bg-white/20" />
        </div>
        <div className="h-4 w-40 animate-pulse rounded bg-white/20" />
      </section>

      <main className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2">
            <div className="h-8 w-36 animate-pulse rounded bg-muted" />
            <div className="h-5 w-80 max-w-full animate-pulse rounded bg-muted" />
          </div>
          <Card className="space-y-4 p-5">
            <div className="h-16 animate-pulse rounded-md bg-muted" />
            <div className="h-16 animate-pulse rounded-md bg-muted" />
            <div className="h-10 animate-pulse rounded-md bg-muted" />
          </Card>
        </div>
      </main>
    </div>
  );
}
