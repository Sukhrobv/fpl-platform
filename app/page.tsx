import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  ChartNoAxesCombined,
  Database,
  ShieldCheck,
  Users,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-[92rem] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <section className="grid gap-8 border-b border-border pb-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.7fr)] lg:items-end">
        <div>
          <p className="mb-4 text-xs font-bold tracking-[0.18em] text-primary uppercase">
            Fantasy Premier League · Decision intelligence
          </p>
          <h1 className="max-w-4xl text-4xl leading-[0.98] font-black tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
            Prepare the next decision, not the next dashboard.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Your squad, player forecasts and evidence in one analytical
            workspace. The 2025/26 evidence base is frozen while official
            2026/27 FPL data is pending.
          </p>
        </div>
        <div className="border-t-2 border-foreground pt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">
                Current operating mode
              </p>
              <p className="mt-2 text-xl font-black">Pre-season research</p>
            </div>
            <CalendarClock className="size-6 text-primary" aria-hidden="true" />
          </div>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            Publication remains locked until the new roster, fixtures and
            mappings pass their gates.
          </p>
        </div>
      </section>

      <section
        className="grid border-b border-border md:grid-cols-3"
        aria-label="Workspace shortcuts"
      >
        {[
          {
            href: "/personal",
            eyebrow: "Squad",
            title: "Review my team",
            body: "Find availability, structure and transfer problems in the current squad.",
            icon: Users,
          },
          {
            href: "/predictions",
            eyebrow: "Market",
            title: "Explore players",
            body: "Filter and compare the forecast pool across upcoming gameweeks.",
            icon: ChartNoAxesCombined,
          },
          {
            href: "/chat",
            eyebrow: "Evidence",
            title: "Ask a question",
            body: "Use the assistant to investigate players, alternatives and strategy.",
            icon: Database,
          },
        ].map(({ href, eyebrow, title, body, icon: Icon }) => (
          <Link
            href={href}
            key={href}
            className="group border-border py-8 md:border-r md:px-7 md:last:border-r-0"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
                {eyebrow}
              </span>
              <Icon className="size-5 text-primary" aria-hidden="true" />
            </div>
            <h2 className="mt-8 flex items-center gap-2 text-xl font-black">
              {title}
              <ArrowUpRight
                className="size-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1"
                aria-hidden="true"
              />
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
              {body}
            </p>
          </Link>
        ))}
      </section>

      <section className="grid gap-8 py-10 lg:grid-cols-[1fr_2fr]">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-muted-foreground uppercase">
            Data posture
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight">
            Nothing invented.
          </h2>
        </div>
        <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
          {[
            ["Evidence", "2025/26", "Frozen and reusable", ShieldCheck],
            ["New season", "2026/27", "Roster API pending", CalendarClock],
            ["Publication", "Locked", "Readiness gates required", Database],
          ].map(([label, value, note, Icon]) => {
            const StatusIcon = Icon as typeof ShieldCheck;
            return (
              <div key={String(label)} className="bg-background p-5">
                <StatusIcon
                  className="size-4 text-primary"
                  aria-hidden="true"
                />
                <p className="mt-5 text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                  {String(label)}
                </p>
                <p className="mt-1 text-lg font-black">{String(value)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {String(note)}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
