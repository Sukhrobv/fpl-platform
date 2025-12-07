"use client";

// components/layout/Sidebar.tsx
// Sidebar navigation component

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  MessageSquare, 
  Users, 
  TrendingUp, 
  Settings,
  BarChart3
} from "lucide-react";

const navItems = [
  {
    href: "/chat",
    label: "AI Chat",
    icon: MessageSquare,
  },
  {
    href: "/personal",
    label: "My Team",
    icon: Users,
  },
  {
    href: "/predictions",
    label: "Predictions",
    icon: TrendingUp,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-800">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-semibold text-white">FPL Analytics</h1>
          <p className="text-xs text-slate-400">AI-Powered Assistant</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-emerald-600/20 text-emerald-400"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Settings at bottom */}
      <div className="p-3 border-t border-slate-800">
        <Link
          href="/settings"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            pathname === "/settings"
              ? "bg-emerald-600/20 text-emerald-400"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <Settings className="w-5 h-5" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
