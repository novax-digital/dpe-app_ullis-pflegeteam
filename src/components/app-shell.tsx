import Image from "next/image";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui";
import { ROLE_LABEL, type AppRole, type Profile } from "@/lib/auth";

export function AppShell({
  children,
  profile,
  roles,
  primaryRole,
}: {
  children: React.ReactNode;
  profile: Profile | null;
  roles: AppRole[];
  primaryRole: AppRole | null;
}) {
  const displayName =
    profile?.full_name?.trim() || profile?.email?.trim() || "Ullis Team";
  const roleLabel = primaryRole ? ROLE_LABEL[primaryRole] : "Team";

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="hidden border-r border-border bg-card px-4 py-5 lg:flex lg:flex-col">
        <div className="mb-8 flex items-center gap-3 px-2">
          <Image
            src="/ullis-logo.png"
            alt="Ullis Pflegeteam"
            width={44}
            height={44}
            className="rounded-full bg-white object-contain"
            priority
          />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">Ullis Connect</p>
            <p className="text-xs text-muted-foreground">Mitarbeiterportal</p>
          </div>
        </div>

        <AppNav roles={roles} />

        <div className="mt-auto space-y-3 border-t border-border pt-4">
          <div className="px-2">
            <p className="truncate text-sm font-medium">{displayName}</p>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
          </div>
          <form action={signOut}>
            <Button
              type="submit"
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
            >
              <LogOut className="h-4 w-4" />
              Abmelden
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-card/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Image
                src="/ullis-logo.png"
                alt="Ullis Pflegeteam"
                width={36}
                height={36}
                className="rounded-full bg-white object-contain"
                priority
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Ullis Connect</p>
                <p className="truncate text-xs text-muted-foreground">
                  {displayName}
                </p>
              </div>
            </div>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="icon" title="Abmelden">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
          <div className="mt-3 overflow-x-auto">
            <div className="flex min-w-max gap-1">
              <AppNav roles={roles} orientation="horizontal" />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
