"use client";

// app/settings/page.tsx
// Settings page for FPL ID and preferences

import { useState, useEffect } from "react";
import { useFplSettings } from "@/contexts/FplSettingsContext";
import { Check, Save, User } from "lucide-react";

export default function SettingsPage() {
  const { fplId, setFplId } = useFplSettings();
  const [inputValue, setInputValue] = useState(fplId);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setInputValue(fplId);
  }, [fplId]);

  const handleSave = () => {
    setFplId(inputValue);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-8">Settings</h1>

        {/* FPL Account Section */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center">
              <User className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">FPL Account</h2>
              <p className="text-sm text-slate-400">Link your Fantasy Premier League account</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                FPL Team ID
              </label>
              <p className="text-xs text-slate-500 mb-3">
                Find your Team ID in your FPL URL: fantasy.premierleague.com/entry/<strong>123456</strong>/event/...
              </p>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Enter your FPL Team ID"
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                />
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors"
                >
                  {saved ? (
                    <>
                      <Check className="w-4 h-4" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save
                    </>
                  )}
                </button>
              </div>
            </div>

            {fplId && (
              <div className="pt-4 border-t border-slate-800">
                <p className="text-sm text-slate-400">
                  Currently linked: <span className="text-emerald-400 font-medium">{fplId}</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-2">How to find your FPL ID</h3>
          <ol className="text-sm text-slate-400 space-y-2">
            <li>1. Go to fantasy.premierleague.com</li>
            <li>2. Click on &quot;Points&quot; tab</li>
            <li>3. Look at the URL - your ID is the number after /entry/</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
