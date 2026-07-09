"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bike,
  CalendarDays,
  FileText,
  HeartPulse,
  LayoutDashboard,
  Newspaper,
  Settings,
  Users,
} from "lucide-react";
import type { AppRole } from "@/lib/auth";
import { hasAllowedRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/",
    label: "Pinnwand",
    icon: LayoutDashboard,
    roles: ["admin", "employee", "physiotherapy"] as AppRole[],
  },
  {
    href: "/nachrichten",
    label: "Nachrichten",
    icon: Newspaper,
    roles: ["admin", "employee", "physiotherapy"] as AppRole[],
  },
  {
    href: "/e-bikes",
    label: "E-Bikes",
    icon: Bike,
    roles: ["admin", "employee"] as AppRole[],
    children: [
      {
        href: "/e-bikes/reservierungen",
        label: "Reservierungen",
        icon: CalendarDays,
      },
      {
        href: "/e-bikes/fuhrpark",
        label: "Fuhrpark",
        icon: Bike,
      },
    ],
  },
  {
    href: "/health-courses",
    label: "Kurse",
    icon: HeartPulse,
    roles: ["admin", "employee", "physiotherapy"] as AppRole[],
    children: [
      {
        href: "/health-courses/uebersicht",
        label: "Kursübersicht",
        icon: HeartPulse,
      },
      {
        href: "/health-courses/verwaltung",
        label: "Kursverwaltung",
        icon: CalendarDays,
        roles: ["admin", "physiotherapy"] as AppRole[],
      },
    ],
  },
  {
    href: "/calendar",
    label: "Kalender",
    icon: CalendarDays,
    roles: ["admin", "employee", "physiotherapy"] as AppRole[],
  },
  {
    href: "/documents",
    label: "Dokumente",
    icon: FileText,
    roles: ["admin", "employee", "physiotherapy"] as AppRole[],
  },
  {
    href: "/employees",
    label: "Mitarbeitende",
    icon: Users,
    roles: ["admin"] as AppRole[],
  },
  {
    href: "/settings",
    label: "Einstellungen",
    icon: Settings,
    roles: ["admin"] as AppRole[],
    children: [
      {
        href: "/settings/e-bikes",
        label: "E-Bikes",
        icon: Bike,
        roles: ["admin"] as AppRole[],
      },
      {
        href: "/settings/nachrichten",
        label: "Nachrichten",
        icon: Newspaper,
        roles: ["admin"] as AppRole[],
      },
      {
        href: "/settings/kalender",
        label: "Kalender",
        icon: CalendarDays,
        roles: ["admin"] as AppRole[],
      },
      {
        href: "/settings/kurse",
        label: "Kurse",
        icon: HeartPulse,
        roles: ["admin"] as AppRole[],
      },
    ],
  },
];

type AppNavOrientation = "vertical" | "horizontal" | "bottom" | "subnav";

export function AppNav({
  roles,
  orientation = "vertical",
}: {
  roles: AppRole[];
  orientation?: AppNavOrientation;
}) {
  const pathname = usePathname();
  const visibleItems = navItems.filter((item) =>
    hasAllowedRole(roles, item.roles),
  );
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  if (orientation === "subnav") {
    const activeItem = visibleItems.find((item) => isActive(item.href));
    const visibleChildItems =
      activeItem && "children" in activeItem
        ? activeItem.children?.filter((child) =>
            "roles" in child ? hasAllowedRole(roles, child.roles) : true,
          )
        : undefined;

    if (!visibleChildItems?.length) return null;

    return (
      <nav
        aria-label="Untermenü"
        className="mt-3 flex gap-2 overflow-x-auto pb-1"
      >
        {visibleChildItems.map((child) => {
          const ChildIcon = child.icon;
          const childActive =
            pathname === child.href || pathname.startsWith(`${child.href}/`);

          return (
            <Link
              key={child.href}
              href={child.href}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium transition",
                childActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <ChildIcon className="h-3.5 w-3.5 shrink-0" />
              <span>{child.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      className={cn(
        "flex gap-1",
        orientation === "vertical"
          ? "flex-col"
          : orientation === "bottom"
            ? "grid auto-cols-[72px] grid-flow-col overflow-x-auto"
            : "flex-row",
      )}
      aria-label={orientation === "bottom" ? "Hauptnavigation" : undefined}
    >
      {visibleItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        const childItems =
          active && orientation !== "bottom" && "children" in item
            ? item.children
            : undefined;
        const visibleChildItems = childItems?.filter((child) =>
          "roles" in child ? hasAllowedRole(roles, child.roles) : true,
        );

        return (
          <div
            key={item.href}
            className={cn(
              "flex gap-1",
              orientation === "vertical"
                ? "flex-col"
                : orientation === "bottom"
                  ? "min-w-0 justify-center"
                  : "flex-row",
            )}
          >
            <Link
              href={item.href}
              className={cn(
                "flex rounded-md font-medium transition",
                orientation === "bottom"
                  ? "h-14 w-[72px] flex-col items-center justify-center gap-1 px-1 text-[11px] leading-tight"
                  : "h-10 items-center gap-3 px-3 text-sm",
                orientation === "horizontal" ? "whitespace-nowrap" : "",
                orientation === "bottom"
                  ? active
                    ? "bg-accent text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  : active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "shrink-0",
                  orientation === "bottom" ? "h-5 w-5" : "h-4 w-4",
                )}
              />
              <span
                className={cn(
                  orientation === "bottom"
                    ? "max-w-full truncate text-center"
                    : "",
                )}
              >
                {item.label}
              </span>
            </Link>

            {visibleChildItems?.map((child) => {
              const ChildIcon = child.icon;
              const childActive =
                pathname === child.href || pathname.startsWith(`${child.href}/`);

              return (
                <Link
                  key={child.href}
                  href={child.href}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition",
                    orientation === "vertical"
                      ? "ml-7"
                      : "whitespace-nowrap",
                    childActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                  <span>{child.label}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
