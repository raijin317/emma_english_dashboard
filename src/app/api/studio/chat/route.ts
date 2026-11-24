import fs from "node:fs";
import { route, sse, body, fail, localOnly } from "@/server/api";
import { addMessage, getBook, getChild, getThread, listItems, listMessages, listTopics, listUnits, updateThread } from "@/server/repo";
import { claudeStudio, type StudioAttachment } from "@/server/claude/jobs";
import { readStudioFile, studioFileDir, studioThreadDir } from "@/server/studioFiles";
import { FILE_ASK, MAX_FILES_PER_MESSAGE } from "@/lib/studioFiles";
import type { StudioFile } from "@/lib/types";

/** The games of the newest topics, so Claude picks other ones for the next topic. */
function recentTopicGames() {
  const kinds = listTopics()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3)
    .flatMap((t) => listItems({ topicId: t.id, type: "game" }).map((i) => (i.data as { game: string }).game));
  return kinds.length ? `Mini games in the family's newest topics (pick other kinds when they fit): ${[...new Set(kinds)].join(", ")}.` : "";
}

function childContext(childId?: string) {
  const lines = [childLines(childId), recentTopicGames()].filter(Boolean);
  return lines.join("\n");
}

function childLines(childId?: string) {
  if (!childId) return "";
  const child = getChild(childId);
  if (!child) return "";
  const book = child.activeBookId ? getBook(child.activeBookId) : null;
  const lines = [`Child: ${child.name}, age ${child.age}.`];
  if (book?.assessment) {
    const a = book.assessment;
    lines.push(`Current book: "${book.title}" — ${a.stage}, ages ${a.estimatedAge.min}–${a.estimatedAge.max}, ${a.cefr}.`);
    lines.push(`Level rules: max ${a.generationProfile.maxSentenceWords} words per sentence; reading ${a.generationProfile.readingPassageWords.join("–")} words; writing ${a.generationProfile.allowWriting ? "ok" : "no"}.`);
    const words = [...new Set(listUnits(book.id).flatMap((u) => u.extract.vocabulary.map((v) => v.word)))].slice(0, 120);
    if (words.length) lines.push(`Words the child already knows from the book: ${words.join(", ")}.`);
  }
  return lines.join("\n");
}

export const POST = route(localOnly(async (req) => {
  const b = await body<{ threadId?: string; message?: string; childId?: string; fileIds?: unknown }>(req);
  const thread = b.threadId ? getThread(b.threadId) : null;
  if (!thread) return fail("Chat not found", 404);
  const fileIds = Array.isArray(b.fileIds) ? [...new Set(b.fileIds.filter((x): x is string => typeof x === "string"))] : [];
  if (fileIds.length > MAX_FILES_PER_MESSAGE) return fail(`Please attach at most ${MAX_FILES_PER_MESSAGE} files to one message.`);
  const files = fileIds.map((id) => readStudioFile(thread.id, id));
  if (files.some((f) => !f)) return fail("An attached file is missing. Please attach it again.");
  const attached = files as StudioFile[];
  const message = b.message?.trim().slice(0, 4000) || (attached.length ? FILE_ASK : "");
  if (!message) return fail("Type a message first.");

  const history = listMessages(thread.id).filter((m) => m.role !== "error");
  addMessage(thread.id, "user", message, null, attached);
  if (history.length === 0) updateThread(thread.id, { title: (b.message?.trim() || `📎 ${attached[0]?.name ?? ""}`).slice(0, 48) });

  const withDir = (info: StudioFile): StudioAttachment => ({ info, dir: studioFileDir(thread.id, info.id) });
  const workDir = studioThreadDir(thread.id);
  fs.mkdirSync(workDir, { recursive: true });

  return sse(async (send, signal) => {
    try {
      let looking = false;
      const r = await claudeStudio({
        message,
        sessionId: thread.claudeSessionId,
        context: childContext(b.childId),
        history: history.map((m) => ({ role: m.role, text: m.text, files: m.files.map((f) => f.name) })),
        files: attached.map(withDir),
        earlierFiles: history.flatMap((m) => m.files).filter((f) => readStudioFile(thread.id, f.id)).map(withDir),
        workDir,
        signal,
        onEvent: (e) => {
          if (e.kind === "delta") send("delta", { text: e.text });
          if (e.kind === "tool" && !looking) {
            looking = true;
            send("status", { message: "👀 Looking at your files…" });
          }
        },
      });
      if (r.sessionId) updateThread(thread.id, { claudeSessionId: r.sessionId });
      addMessage(thread.id, "assistant", r.text, r.pack);
      send("done", { text: r.text, pack: r.pack, packError: r.packError });
    } catch (e) {
      addMessage(thread.id, "error", (e as Error).message);
      throw e;
    }
  }, req);
}));
