"use client";
import { Search, Bell, User } from "lucide-react";

export function Topbar() {
  return (
    <header className="topbar rounded-b-2xl shadow-[0_10px_30px_-10px_rgba(0,0,0,.6)]">
      <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6">
        <h1 className="text-base font-semibold text-white md:text-lg">Analytics</h1>
        <div className="flex flex-1 items-center justify-center">
          <div className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
            <input
              className="w-full rounded-lg border border-white/10 bg-white/10 px-9 py-2 text-sm text-white placeholder-white/60 outline-none backdrop-blur focus:border-white/30"
              placeholder="Search"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-white/80">
          <span className="hidden sm:inline">Active</span>
          <Bell className="h-4 w-4" />
          <div className="grid h-7 w-7 place-items-center rounded-full bg-white/20">
            <User className="h-4 w-4" />
          </div>
        </div>
      </div>
    </header>
  );
}

