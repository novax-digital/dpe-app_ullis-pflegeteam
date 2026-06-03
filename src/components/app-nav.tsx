"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bike,
  CalendarDays,
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
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "employee", "physiotherapy"] as AppRole[],
  },
  {
    href: "/news",
    label: "News",
    icon: Newspaper,
    roles: ["admin", "employee"] as AppRole[],
  },
  {
    href: "/e-bikes",
    label: "E-Bikes",
    icon: Bike,
    roles: ["admin", "employee"] as AppRole[],
  },
  {
    href: "/calendar",
    label: "Kalender",
    icon: CalendarDays,
    roles: ["admin", "employee", "physiotherapy"] as AppRole[],
  },
  {
    href: "/health-courses",
    label: "Kurse",
    icon: HeartPulse,
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
    roles: ["admin", "employee", "physiotherapy"] as AppRole[],
  },
];

export function AppNav({
  roles,
  orientation = "vertical",
}: {
  roles: AppRole[];
  orientation?: "vertical" | "horizontal";
}) {
  const pathname = usePathname();
  const visibleItems = navItems.filter((item) =>
    hasAllowedRole(roles, item.roles),
  );

  return (
    <nav
      className={cn(
        "flex gap-1",
        orientation === "vertical" ? "flex-col" : "flex-row",
      )}
    >
      {visibleItems.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition",
              orientation === "horizontal" ? "whitespace-nowrap" : "",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
