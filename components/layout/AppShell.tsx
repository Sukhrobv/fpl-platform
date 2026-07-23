"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  Bot,
  ChartNoAxesCombined,
  Database,
  Home,
  Menu,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useFplSettings } from "@/contexts/FplSettingsContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const navigation = [
  { href: "/", label: "Overview", icon: Home },
  { href: "/personal", label: "My team", icon: Users },
  { href: "/predictions", label: "Player explorer", icon: ChartNoAxesCombined },
  { href: "/chat", label: "Assistant", icon: Bot },
] as const;

function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-3"
      aria-label="FPL Index home"
    >
      <span className="grid size-8 place-items-center border border-foreground bg-foreground text-xs font-black tracking-tighter text-background">
        FI
      </span>
      <span>
        <span className="block text-sm font-black tracking-[-0.02em]">
          FPL Index
        </span>
        <span className="block text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Decision desk
        </span>
      </span>
    </Link>
  );
}

function Navigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary navigation" className="space-y-1">
      {navigation.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "group flex min-h-10 items-center gap-3 border-l-2 px-3 text-sm font-semibold transition-colors duration-(--fpl-motion-fast)",
              active
                ? "border-primary bg-primary/8 text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
              mobile && "min-h-12",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
    >
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}

function DataStatus() {
  return (
    <div className="flex items-center gap-2 border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground">
      <ShieldCheck className="size-3.5 text-fresh" aria-hidden="true" />
      <span className="hidden sm:inline">2025/26 evidence frozen</span>
      <span className="sm:hidden">Data safe</span>
      <span className="size-1 bg-border" aria-hidden="true" />
      <span className="text-stale">26/27 pending</span>
    </div>
  );
}

function DesktopSidebar() {
  return (
    <aside className="hidden min-h-dvh w-60 shrink-0 border-r border-border bg-card lg:flex lg:flex-col">
      <div className="flex h-16 items-center border-b border-border px-5">
        <Brand />
      </div>
      <div className="flex-1 px-3 py-5">
        <p className="mb-3 px-3 text-[10px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
          Workspace
        </p>
        <Navigation />
      </div>
      <div className="border-t border-border p-3">
        <Link
          href="/settings"
          className="flex min-h-10 items-center gap-3 border-l-2 border-transparent px-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
        >
          <Settings className="size-4" aria-hidden="true" />
          Settings
        </Link>
      </div>
    </aside>
  );
}

function MobileNavigation() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation"
          />
        }
      >
        <Menu aria-hidden="true" />
      </DialogTrigger>
      <DialogContent
        className="fpl-ui top-0 left-0 h-dvh w-[min(21rem,88vw)] max-w-none translate-x-0 translate-y-0 content-start border-r border-border p-0"
        showCloseButton
      >
        <DialogTitle className="sr-only">Navigation</DialogTitle>
        <DialogDescription className="sr-only">
          Navigate between FPL Index workspaces.
        </DialogDescription>
        <div className="flex h-16 items-center border-b border-border px-5">
          <Brand />
        </div>
        <div className="px-3 py-5">
          <Navigation mobile />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { density } = useFplSettings();

  return (
    <div
      className="fpl-ui app-root flex min-h-dvh bg-background text-foreground"
      data-density={density}
    >
      <a
        href="#main-content"
        className="sr-only z-[100] bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <DesktopSidebar />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/94 px-4 backdrop-blur-sm sm:px-6">
          <div className="flex items-center gap-3">
            <MobileNavigation />
            <div className="lg:hidden">
              <Brand />
            </div>
            <div className="hidden items-center gap-2 lg:flex">
              <Database
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">
                Pre-season · 2026/27
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DataStatus />
            <ThemeToggle />
          </div>
        </header>
        <main
          id="main-content"
          className="min-h-[calc(100dvh-4rem)] overflow-x-hidden"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
