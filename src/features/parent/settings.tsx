"use client";

import { useEffect, useState } from "react";
import { api, streamSSE, useApi } from "@/lib/client/api";
import { Button, Field, PageHeader, Panel, ProgressBar, inputCls } from "@/components/ui";
import { Loading } from "@/components/kids";
import { loadVoices, pickVoice, speak } from "@/lib/client/speech";
import { sfx } from "@/lib/client/sfx";
import { NATURAL_VOICES, VOICE_SAMPLE } from "@/lib/voices";
import type { AppSettings } from "@/lib/types";
import { applySettings } from "../SettingsSync";
import { HomeOnly } from "@/components/online";
import { ONLINE } from "@/lib/mode";
import { JobLog, useJob } from "./common";

type OnlineVoice = { voice: string; childRate: number; clips: number; missing: number };
type OnlineInfo = { exportedAt: string | null; voice: OnlineVoice | null; books: number; items: number; topics: number; files?: number };

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

/**
 * Home: makes the files of the online version (lessons, pictures, voice) in this project folder.
 * Online: shows what was published and when.
 */
function OnlineVersionPanel() {
  const info = useApi<OnlineInfo>("/api/online");
  const job = useJob(info.reload);
  const d = info.data;
  const published = d?.exportedAt ? (
    <p>
      {ONLINE ? "Published" : "Last prepared"}: <b>{when(d.exportedAt)}</b> — {d.books} book(s), {d.items} lessons, {d.topics} extra topic(s)
      {d.voice ? `, ${d.voice.clips} voice clips (${NATURAL_VOICES.find((v) => v.id === d.voice!.voice)?.label ?? d.voice.voice}, speed ${d.voice.childRate.toFixed(2)})` : ", no natural voice"}.
      {d.voice && d.voice.missing > 0 && <span className="block text-sm font-bold text-orange-deep">⚠️ {d.voice.missing} sentence(s) had no voice yet — they use the browser voice online. Let the voice finish at home, then prepare again.</span>}
    </p>
  ) : (
    <p className="text-ink-soft">{ONLINE ? "Nothing has been published yet." : "The online files have not been prepared yet."}</p>
  );
  if (ONLINE)
    return (
      <Panel title="🌐 Published lessons">
        {published}
        <p className="mt-2 text-sm text-ink-soft">To add or change lessons: make them in the app at home, press “Prepare the online files” there, then commit and push the project — Cloudflare builds this version again by itself.</p>
      </Panel>
    );
  return (
    <Panel title="🌐 Online version (Cloudflare)">
      <p className="text-ink-soft">
        Copies the lessons that are live now into this project folder for the online version: the lessons (<code className="rounded bg-cream px-1">content/online/</code>) and the book pictures, topic pictures and
        natural voice (<code className="rounded bg-cream px-1">public/online/</code>). Drafts, book PDFs, chats and your children&apos;s data are not included.
      </p>
      <div className="mt-2">{published}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" disabled={job.running} onClick={() => job.run("/api/online/export", {})}>
          {job.running ? "Preparing…" : "📦 Prepare the online files"}
        </Button>
      </div>
      <JobLog job={job} />
      <p className="mt-3 text-sm text-ink-soft">
        Then commit and push the project (GitHub Desktop or <code className="rounded bg-cream px-1">git push</code>) — Cloudflare builds the online version again by itself. Children, progress and the PIN online
        are kept; to bring this computer&apos;s children and progress online, export a backup here and restore it in the online Settings.
      </p>
    </Panel>
  );
}

/** Pre-generates the natural voice for all approved lessons (runs on this PC). */
export function PrepareVoices({ target = "all", label = "🎙️ Prepare voices for all lessons" }: { target?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            setPct(0);
            try {
              await streamSSE("/api/tts/prepare", { target }, (_ev, d) => {
                const x = d as { msg?: string; progress?: number };
                if (x?.progress !== undefined) setPct(x.progress);
                if (x?.msg) setMsg(x.msg);
              });
            } catch (e) {
              setMsg((e as Error).message);
            }
            setBusy(false);
          }}
        >
          {busy ? "Preparing…" : label}
        </Button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
      {busy && pct !== null && <ProgressBar value={pct} tone="bg-sky" />}
    </div>
  );
}

/** The background warm-up (server makes the voice for every lesson while nobody is tapping). */
function VoiceWarmUp() {
  const { data, reload } = useApi<{ voiceWarmUp?: { running: boolean; done: number; total: number } }>("/api/settings");
  const w = data?.voiceWarmUp;
  useEffect(() => {
    if (!w?.running) return;
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [w?.running, reload]);
  if (!w?.running || !w.total) return null;
  return (
    <div className="mt-3 rounded-2xl border-2 border-sky bg-sky-soft p-3 text-sm" role="status">
      <p className="font-bold">
        🎙️ Getting the voice ready for all lessons in the background: {w.done}/{w.total}
      </p>
      <p className="text-ink-soft">The app can be used meanwhile — what your child taps is always made first.</p>
      <ProgressBar value={(w.done / w.total) * 100} tone="bg-sky" />
    </div>
  );
}

export function SettingsPage() {
  const { data, setData } = useApi<{ settings: AppSettings; onlineVoice?: OnlineVoice | null }>("/api/settings");
  const claude = useApi<{ ok: boolean; version: string | null; command: string; source: "env" | "path" | "vscode-extension"; error: string | null }>(ONLINE ? null : "/api/claude/status");
  const sourceLabel = { env: "CLAUDE_CLI_PATH in .env.local", path: "claude on PATH", "vscode-extension": "Claude Code from your VS Code extension (same login)" };
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [pin, setPin] = useState({ current: "", next: "" });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    loadVoices().then(setVoices);
  }, []);
  if (!data) return <Loading />;
  const s = data.settings;

  const save = async (patch: Partial<AppSettings>) => {
    const r = await api<{ settings: AppSettings }>("/api/settings", { method: "PATCH", body: patch });
    setData({ ...data, settings: r.settings });
    applySettings(r.settings);
  };

  const auto = pickVoice(voices);
  const SAMPLE = VOICE_SAMPLE;
  // Online the natural voice is the one the published clips were made with at home (none = browser voice only).
  const onlineVoice = ONLINE ? (data.onlineVoice ?? null) : null;
  const fixedVoice = onlineVoice ? NATURAL_VOICES.find((v) => v.id === onlineVoice.voice) : undefined;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader emoji="⚙️" title="Settings" />

      <Panel title="🔊 Voice (American English)">
        <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Voice type">
          {(
            [
              [
                "natural",
                "🌟 Natural voice (recommended)",
                ONLINE ? (fixedVoice ? "Human-like and expressive. Made on your home computer and published with the lessons." : "Not published yet — prepare the online files at home first.") : "Human-like and expressive. Made on this PC, works offline.",
              ],
              ["browser", "🖥️ Browser voice", "The browser's built-in voice. Sounds more robotic."],
            ] as const
          ).map(([k, label, hint]) => (
            <button
              key={k}
              role="radio"
              aria-checked={s.ttsEngine === k}
              disabled={ONLINE && k === "natural" && !fixedVoice}
              onClick={() => save({ ttsEngine: k })}
              className={`flex-1 rounded-2xl border-2 p-3 text-left disabled:opacity-50 ${s.ttsEngine === k ? "border-ink bg-sun-soft" : "border-line bg-paper"}`}
            >
              <b>{label}</b>
              <span className="block text-sm text-ink-soft">{hint}</span>
            </button>
          ))}
        </div>

        {s.ttsEngine === "natural" && ONLINE && fixedVoice ? (
          <div className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-sun-soft p-3">
            <button aria-label={`Listen to ${fixedVoice.label}`} onClick={() => speak(SAMPLE)} className="btn-3d h-11 w-11 shrink-0 rounded-full border-2 border-ink bg-sky text-lg [--shadow:#0277bd]">
              ▶
            </button>
            <div>
              <b>
                {fixedVoice.gender === "female" ? "👩" : "👨"} {fixedVoice.label}
              </b>{" "}
              <span className="text-sm text-ink-soft">— {fixedVoice.note}</span>
              <span className="block text-sm text-ink-soft">The voice your lessons were made with at home. To use another one, choose it in the app at home and prepare the online files again.</span>
            </div>
          </div>
        ) : s.ttsEngine === "natural" ? (
          <>
            <p className="mb-2 font-bold">Choose a voice — press ▶ to listen</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {NATURAL_VOICES.map((v) => (
                <div key={v.id} className={`flex items-center gap-2 rounded-2xl border-2 p-2 ${s.ttsVoice === v.id ? "border-ink bg-sun-soft" : "border-line"}`}>
                  <button aria-label={`Listen to ${v.label}`} onClick={() => speak(SAMPLE, { voice: v.id })} className="btn-3d h-11 w-11 shrink-0 rounded-full border-2 border-ink bg-sky text-lg [--shadow:#0277bd]">
                    ▶
                  </button>
                  <button className="min-w-0 flex-1 text-left" onClick={() => save({ ttsVoice: v.id })}>
                    <b>
                      {v.gender === "female" ? "👩" : "👨"} {v.label}
                    </b>
                    {s.ttsVoice === v.id && <span className="ml-1 text-grass-deep">✓</span>}
                    <span className="block text-xs text-ink-soft">{v.note}</span>
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-sm text-ink-soft">
              The first time, the voice engine loads for a few seconds. Every sentence is made once and saved, then plays instantly. After you change the voice or the speed, the app makes the new voice
              for all lessons by itself in the background.
            </p>
            <VoiceWarmUp />
            <PrepareVoices />
          </>
        ) : (
          <Field label="Browser voice" hint={voices.length ? `${voices.length} en-US voice(s) in this browser. Microsoft Edge has the most natural ones (e.g. “Ana”, “Ava”, “Jenny”).` : "No en-US voice found — try Microsoft Edge."}>
            <select className={inputCls} value={s.voiceName} onChange={(e) => save({ voiceName: e.target.value })}>
              <option value="">Automatic{auto ? ` (${auto.name})` : ""}</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field
            label={`Speed for children: ${s.childRate.toFixed(2)}`}
            hint={ONLINE ? "Set in the app at home — the published voice was made at this speed." : "0.85 is a good speed for young learners. The 🐢 button is always slower."}
          >
            <input type="range" min={0.6} max={1.2} step={0.05} value={s.childRate} disabled={ONLINE} onChange={(e) => save({ childRate: Number(e.target.value) })} />
          </Field>
          <div className="flex items-end">
            <Button variant="sun" onClick={() => speak(SAMPLE)}>
              ▶ Test the current voice
            </Button>
          </div>
        </div>
      </Panel>

      <HomeOnly>
      <Panel title="🖼️ Pictures for AI Studio topics">
        <div className="flex flex-col gap-2 sm:flex-row" role="radiogroup" aria-label="Pictures for AI Studio topics">
          {(
            [
              ["draw", "🎨 Claude draws (recommended)", "Claude draws every picture in the style of the pictures you attach in the chat — or in a style that fits the topic — then checks them and redraws weak ones. Nothing is searched on the web."],
              ["web", "🌐 Web pictures + drawings", "Claude picks openly licensed pictures from the web (Openverse) and draws the rest in the topic's style. Only the topic's words are searched."],
              ["off", "😀 Emoji only", "No pictures are made."],
            ] as const
          ).map(([k, label, hint]) => (
            <button
              key={k}
              role="radio"
              aria-checked={s.topicPictures === k}
              onClick={() => save({ topicPictures: k })}
              className={`flex-1 rounded-2xl border-2 p-3 text-left ${s.topicPictures === k ? "border-ink bg-grape-soft" : "border-line bg-paper"}`}
            >
              <b>{label}</b>
              <span className="block text-sm text-ink-soft">{hint}</span>
            </button>
          ))}
        </div>
      </Panel>
      </HomeOnly>

      <Panel title="🎈 Fun & healthy habits">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-3 font-bold">
            <input type="checkbox" className="h-6 w-6" checked={s.soundOn} onChange={(e) => void save({ soundOn: e.target.checked }).then(() => sfx("correct"))} />
            Sound effects
          </label>
          <Field label="Suggest a break after (minutes per day)">
            <input className={inputCls} type="number" min={5} max={90} value={s.breakMinutes} onChange={(e) => save({ breakMinutes: Number(e.target.value) })} />
          </Field>
        </div>
      </Panel>

      <Panel title="🔒 Parent PIN">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Current PIN">
            <input className={inputCls} type="password" inputMode="numeric" maxLength={4} value={pin.current} onChange={(e) => setPin({ ...pin, current: e.target.value })} />
          </Field>
          <Field label="New PIN (4 digits)">
            <input className={inputCls} type="password" inputMode="numeric" maxLength={4} value={pin.next} onChange={(e) => setPin({ ...pin, next: e.target.value })} />
          </Field>
          <Button
            variant="primary"
            onClick={async () => {
              try {
                await api("/api/settings/pin", { body: { action: "set", pin: pin.next, currentPin: pin.current } });
                setMsg("PIN changed.");
                setPin({ current: "", next: "" });
              } catch (e) {
                setMsg((e as Error).message);
              }
            }}
          >
            Change PIN
          </Button>
        </div>
        {msg && <p className="mt-2 font-bold">{msg}</p>}
      </Panel>

      <OnlineVersionPanel />

      <HomeOnly>
      <Panel title="🤖 Claude Code CLI">
        <div id="claude">
          {claude.data?.ok ? (
            <>
              <p className="font-bold text-grass-deep">🟢 Connected: {claude.data.version}</p>
              <p className="text-sm text-ink-soft">Using {sourceLabel[claude.data.source]}.</p>
              <p className="break-all text-xs text-ink-soft">{claude.data.command}</p>
            </>
          ) : (
            <>
              <p className="font-bold text-berry-deep">🔴 Not found (command: {claude.data?.command ?? "claude"})</p>
              <ol className="mt-2 list-decimal space-y-1 pl-6">
                <li>The app looks for the Claude Code that comes with the VS Code extension, or for <code className="rounded bg-cream px-1">claude</code> on PATH.</li>
                <li>Install/sign in to the Claude Code extension in VS Code (or install the Claude Code CLI), then press “Check again”.</li>
                <li>
                  If it is installed somewhere else, put the full path in <code className="rounded bg-cream px-1">.env.local</code> as <code className="rounded bg-cream px-1">CLAUDE_CLI_PATH=…</code> and restart the app.
                </li>
              </ol>
              {claude.data?.error && <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-cream p-2 text-xs">{claude.data.error}</pre>}
            </>
          )}
          <Button className="mt-3" onClick={claude.reload}>
            🔄 Check again
          </Button>
        </div>
      </Panel>
      </HomeOnly>

      <Panel title="💾 Backup">
        <p className="mb-3 text-ink-soft">
          {ONLINE
            ? "Saves the children, their progress, the PIN and the settings of the online version to one file. Restoring a backup made at home brings its children and progress here (the lessons stay as published)."
            : "Saves children, progress, units, practice items and chats to one file (book PDFs are not included)."}
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/backup" className="btn-3d inline-flex min-h-11 items-center rounded-2xl border-2 border-ink bg-sun px-4 font-bold [--shadow:#e09b00]">
            ⬇️ Export backup
          </a>
          <label className="btn-3d inline-flex min-h-11 cursor-pointer items-center rounded-2xl border-2 border-line bg-paper px-4 font-bold">
            ⬆️ Restore from file
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f || !confirm(ONLINE ? "Replace the online children, progress, PIN and settings with this backup?" : "Replace ALL current data with this backup?")) return;
                try {
                  await api("/api/backup", { body: JSON.parse(await f.text()) });
                  alert("Restored!");
                  location.reload();
                } catch (err) {
                  alert((err as Error).message);
                }
              }}
            />
          </label>
        </div>
      </Panel>
    </div>
  );
}
