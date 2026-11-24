"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api, parentSession, useParentUnlocked } from "@/lib/client/api";
import { CloverMascot, Mascot } from "@/components/kids";
import { OnlineBanner } from "@/components/online";
import { ONLINE } from "@/lib/mode";

const NAV = [
  { href: "/parent", label: "Home", icon: "🏠" },
  { href: "/parent/books", label: "Books", icon: "📚" },
  { href: "/parent/rules", label: "Lesson rules", icon: "📏" },
  { href: "/parent/inspiration", label: "Inspiration", icon: "✨" },
  // AI Studio (Claude) runs only on the home computer.
  ...(ONLINE ? [] : [{ href: "/parent/studio", label: "AI Studio", icon: "🤖" }]),
  { href: "/parent/children", label: "Children", icon: "👧" },
  { href: "/parent/settings", label: "Settings", icon: "⚙️" },
];

export function ParentShell({ children }: { children: ReactNode }) {
  const unlocked = useParentUnlocked();
  const path = usePathname();
  if (unlocked === null) return null;
  if (!unlocked) return <PinGate onUnlock={() => parentSession.unlock()} />;

  const active = (href: string) => (href === "/parent" ? path === "/parent" : path.startsWith(href));
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="no-print flex shrink-0 flex-col gap-1 border-b-2 border-line bg-paper p-3 md:sticky md:top-0 md:h-screen md:w-60 md:border-b-0 md:border-r-2">
        <Link href="/parent" className="mb-2 hidden items-center gap-2 px-2 md:flex">
          <CloverMascot size={44} className="shrink-0" />
          <span className="font-display text-xl font-extrabold leading-tight">
            Emma English
            <br />
            <span className="text-sm font-bold text-ink-soft">Parent area</span>
          </span>
        </Link>
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex min-h-11 shrink-0 items-center gap-3 rounded-2xl px-3 py-2 font-bold ${active(n.href) ? "bg-sun text-ink" : "text-ink-soft hover:bg-cream"} ${n.href === "/parent/studio" && !active(n.href) ? "text-grape-deep" : ""}`}
            >
              <span className="text-xl">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden flex-col gap-2 md:flex">
          <Link href="/" className="btn-3d rounded-2xl border-2 border-ink bg-sky px-3 py-2 text-center font-bold [--shadow:#0277bd]">
            🧒 Child mode
          </Link>
          <button
            onClick={() => parentSession.lock()}
            className="rounded-2xl px-3 py-2 text-sm font-bold text-ink-soft hover:bg-cream"
          >
            🔒 Lock
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
        <OnlineBanner />
        {children}
      </main>
    </div>
  );
}

function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [setup, setSetup] = useState<null | { first?: string }>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ ok: boolean; needsSetup?: boolean }>("/api/settings/pin", { body: { action: "verify", pin: "" } })
      .then((r) => r.needsSetup && setSetup({}))
      .catch(() => {});
  }, []);

  const submit = async (value: string) => {
    setError(null);
    if (setup) {
      if (!setup.first) {
        setSetup({ first: value });
        setPin("");
        return;
      }
      if (setup.first !== value) {
        setError("The two PINs don't match. Try again.");
        setSetup({});
        setPin("");
        return;
      }
      await api("/api/settings/pin", { body: { action: "set", pin: value } });
      onUnlock();
      return;
    }
    try {
      await api("/api/settings/pin", { body: { action: "verify", pin: value } });
      onUnlock();
    } catch {
      setError("Wrong PIN.");
      setPin("");
    }
  };

  const press = (d: string) => {
    if (d === "⌫") return setPin((p) => p.slice(0, -1));
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) void submit(next);
  };

  return (
    <main className="bg-dots flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <Mascot size={90} say={setup ? (setup.first ? "Type it again to confirm." : "Create a 4-digit parent PIN.") : "Parents only! Enter your PIN."} />
      <div className="flex gap-3" aria-label="PIN">
        {[0, 1, 2, 3].map((k) => (
          <span key={k} className={`h-6 w-6 rounded-full border-[3px] border-ink ${k < pin.length ? "bg-ink" : "bg-paper"}`} />
        ))}
      </div>
      {error && <p className="font-bold text-berry-deep">{error}</p>}
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d, k) =>
          d ? (
            <button key={k} onClick={() => press(d)} className="btn-3d h-20 w-20 rounded-3xl border-[3px] border-ink bg-paper font-display text-3xl font-bold [--shadow:#e3d3ad]">
              {d}
            </button>
          ) : (
            <span key={k} />
          ),
        )}
      </div>
      <Link href="/" className="font-bold text-ink-soft underline">
        ← Back to child mode
      </Link>
    </main>
  );
}
