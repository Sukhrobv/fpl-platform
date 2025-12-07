import Link from "next/link";
import { MessageSquare, Users, TrendingUp, BarChart3 } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center">
        {/* Logo */}
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 mx-auto mb-8 flex items-center justify-center">
          <BarChart3 className="w-10 h-10 text-white" />
        </div>

        <h1 className="text-4xl font-bold text-white mb-4">
          FPL Analytics
        </h1>
        <p className="text-xl text-slate-400 mb-12">
          AI-Powered Fantasy Premier League Assistant
        </p>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/chat"
            className="group p-6 bg-slate-900 rounded-xl border border-slate-800 hover:border-emerald-600/50 transition-all"
          >
            <div className="w-12 h-12 rounded-lg bg-emerald-600/20 group-hover:bg-emerald-600/30 flex items-center justify-center mx-auto mb-4 transition-colors">
              <MessageSquare className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="font-semibold text-white mb-2">AI Chat</h3>
            <p className="text-sm text-slate-400">
              Ask about any player or strategy
            </p>
          </Link>

          <Link
            href="/personal"
            className="group p-6 bg-slate-900 rounded-xl border border-slate-800 hover:border-emerald-600/50 transition-all"
          >
            <div className="w-12 h-12 rounded-lg bg-emerald-600/20 group-hover:bg-emerald-600/30 flex items-center justify-center mx-auto mb-4 transition-colors">
              <Users className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="font-semibold text-white mb-2">My Team</h3>
            <p className="text-sm text-slate-400">
              Analyze your squad and get transfer advice
            </p>
          </Link>

          <Link
            href="/predictions"
            className="group p-6 bg-slate-900 rounded-xl border border-slate-800 hover:border-emerald-600/50 transition-all"
          >
            <div className="w-12 h-12 rounded-lg bg-emerald-600/20 group-hover:bg-emerald-600/30 flex items-center justify-center mx-auto mb-4 transition-colors">
              <TrendingUp className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="font-semibold text-white mb-2">Predictions</h3>
            <p className="text-sm text-slate-400">
              xPts forecasts for all players
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
