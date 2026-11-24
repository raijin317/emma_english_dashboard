import { expect, test, type Page } from "@playwright/test";
import { createCanvas } from "@napi-rs/canvas";
import { makePdf } from "../helpers/makePdf";
import { docxParagraphs, oleBytes } from "../helpers/office";

/** Collects uncaught page errors so a crashed screen fails the test. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function unlockParent(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("sunny.parent", "1"));
}

test("first visit asks to create a PIN, then opens the parent area", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/parent");
  await expect(page.getByText("Create a 4-digit parent PIN.")).toBeVisible();
  for (let round = 0; round < 2; round++) for (const d of "2468") await page.getByRole("button", { name: d, exact: true }).click();
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();

  // Child mode locks the parent area: the browser's Back button asks for the PIN again…
  await page.getByRole("link", { name: /Child mode/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(page.getByText("Parents only! Enter your PIN.")).toBeVisible();
  for (const d of "2468") await page.getByRole("button", { name: d, exact: true }).click();
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  // …and so does a parent page typed after any child screen.
  await page.goto("/learn/stickers");
  await page.goto("/parent/settings");
  await expect(page.getByText("Parents only! Enter your PIN.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("every main screen renders without errors", async ({ page }) => {
  await unlockParent(page);
  const errors = watchErrors(page);
  for (const p of ["/", "/learn", "/learn/stickers", "/parent", "/parent/books", "/parent/rules", "/parent/inspiration", "/parent/studio", "/parent/children", "/parent/settings"]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("This page couldn’t load")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("AI Studio: chat → inspiration pack → saved as draft topic", async ({ page }) => {
  await unlockParent(page);
  const errors = watchErrors(page);
  await page.goto("/parent/studio");
  await expect(page.getByText("Claude connected")).toBeVisible();
  const box = page.getByRole("textbox");
  if (!(await box.count())) await page.getByRole("button", { name: "Start a chat" }).click();
  await box.fill("Please create a dinosaur topic");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Dinosaurs", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Save as draft topic/ }).click();
  await page.getByRole("link", { name: /Saved as draft/ }).click();
  await expect(page.getByRole("heading", { name: /Dinosaurs/ })).toBeVisible();
  // Second message in the same chat (resumes the session) must also work.
  await page.goto("/parent/studio");
  await page.getByRole("textbox").fill("Any other ideas?");
  await page.keyboard.press("Enter");
  await expect(page.getByText("What topic would your child enjoy?")).toBeVisible();
  expect(errors).toEqual([]);
});

test("AI Studio: attach Word + picture files → Claude makes the topic from them", async ({ page }) => {
  await unlockParent(page);
  const errors = watchErrors(page);
  await page.goto("/parent/studio");
  await expect(page.getByText("Claude connected")).toBeVisible();
  await page.getByRole("button", { name: "+ New chat" }).click();
  await expect(page.getByText("Tell me a topic your child loves!")).toBeVisible();

  const c = createCanvas(300, 200);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(0, 0, 300, 200);
  await page.getByTestId("studio-file").setInputFiles([
    { name: "fruits.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: docxParagraphs(["Fruit words", "apple banana mango"]) },
    { name: "board.png", mimeType: "image/png", buffer: Buffer.from(await c.encode("png")) },
    { name: "old.doc", mimeType: "application/msword", buffer: oleBytes() },
  ]);
  const chips = page.getByRole("list", { name: "Attached files" });
  await expect(chips.getByText(/✅ Word/)).toBeVisible();
  await expect(chips.getByText(/✅ Picture/)).toBeVisible();
  await expect(chips.getByText(/old Word file/)).toBeVisible();
  await page.getByRole("button", { name: "Remove old.doc" }).click();
  await expect(chips.getByText(/old Word file/)).toHaveCount(0);

  await page.getByRole("button", { name: /Make a practice topic from this file/ }).click();
  await expect(page.getByText("From fruits.docx", { exact: true })).toBeVisible();
  await expect(page.getByText(/I read fruits\.docx: apple, banana, mango/)).toBeVisible();
  // The sent message keeps its files (thumbnail of the picture, link to the original).
  await expect(page.getByRole("link", { name: /fruits\.docx/ })).toBeVisible();
  const thumb = page.getByRole("link", { name: /board\.png/ }).locator("img");
  await expect.poll(() => thumb.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole("button", { name: /Save as draft topic/ }).click();
  await expect(page.getByRole("link", { name: /Saved as draft/ })).toBeVisible();

  // Reload: the chat still shows the files.
  await page.reload();
  await expect(page.getByRole("link", { name: /fruits\.docx/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("family flow: upload a book → lessons for every unit → add a child with that book → child learns", async ({ page }) => {
  test.setTimeout(180_000);
  await unlockParent(page);
  const errors = watchErrors(page);

  // 1. Upload the PDF on the Books page; the import + lesson making starts by itself.
  await page.goto("/parent/books");
  await expect(page.getByText("Claude connected")).toBeVisible();
  await page.getByTestId("book-file").setInputFiles({
    name: "Tieng-Anh-2_Test_Book.pdf",
    mimeType: "application/pdf",
    buffer: makePdf(["Cover", "Unit 1 Pets", "cat dog", "Unit 2 Food", "apple milk"]),
  });
  await expect(page.getByText(/Imported 1\/1 book/)).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText(/Learning resources ready for 2 unit/)).toBeVisible();

  // 2. The book is ready, with lessons in both units.
  await page.getByRole("link", { name: /Fake English Book 2/ }).click();
  await expect(page.getByText(/2\/2/).first()).toBeVisible();
  await expect(page.getByText(/🎒 \d+ lessons/)).toHaveCount(2);

  // 3. Create a child and tick the book.
  await page.goto("/parent/children");
  await page.getByRole("button", { name: "+ Add child" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Bi");
  await page.getByLabel("Age", { exact: true }).fill("7");
  await page.getByRole("checkbox", { name: /Fake English Book 2/ }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("📘 Fake English Book 2")).toBeVisible();

  // 4. In child mode, Bi sees the book's units — with the book's own pictures — and can open a lesson.
  await page.goto("/");
  await page.getByRole("button", { name: /Bi/ }).click();
  await expect(page.getByRole("heading", { name: /Fake English Book 2/ })).toBeVisible();
  const islandPic = page.locator('a[aria-label^="Unit 1"] img[src*="/crop?"]');
  await expect(islandPic).toBeVisible();
  await expect.poll(() => islandPic.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0); // the crop really loads
  await page.getByRole("link", { name: /Unit 1/ }).click();
  await expect(page.getByRole("link", { name: /Words/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Quiz/ })).toBeVisible();
  await expect(page.getByText("Start here!")).toBeVisible();

  // 5. The flashcards show the book's picture instead of the emoji; the reading is the book's own text.
  await page.getByRole("link", { name: /Words/ }).click();
  await expect(page.locator('main img[alt="cat"]')).toBeVisible();
  await page.goBack();
  await page.getByRole("link", { name: /Read/ }).click();
  await expect(page.getByRole("button", { name: "It's" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mai:" }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("lesson rules can be edited, switched off and extended", async ({ page }) => {
  await unlockParent(page);
  const errors = watchErrors(page);
  await page.goto("/parent/rules");
  await expect(page.getByRole("heading", { name: "Lesson rules" })).toBeVisible();
  await expect(page.getByLabel("Rule 1", { exact: true })).toHaveValue(/Stay inside the unit/);
  await page.getByRole("button", { name: "+ Add a rule" }).click();
  await page.getByLabel("Rule 5", { exact: true }).fill("Use our cat Miu in examples.");
  await page.getByLabel("Rule 4 on").uncheck();
  await page.getByRole("button", { name: "💾 Save rules" }).click();
  await expect(page.getByText(/Saved — new lessons/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Rule 5", { exact: true })).toHaveValue("Use our cat Miu in examples.");
  await expect(page.getByLabel("Rule 4 on")).not.toBeChecked();
  // Back to the defaults for the other tests.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await expect(page.getByLabel("Rule 5", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a lesson can be edited in a simple form", async ({ page, request }) => {
  await unlockParent(page);
  const errors = watchErrors(page);
  const { items } = await (await request.get("/api/items?unitId=demo-sunny-starter-u01&type=vocabulary")).json();
  await page.goto(`/parent/items/${items[0].id}`);
  await expect(page.getByRole("heading", { name: "✏️ Edit the lesson" })).toBeVisible();
  const words = page.getByRole("textbox", { name: "Word", exact: true });
  await expect(words.first()).toHaveValue("ball");
  await words.first().fill("big ball");
  await page.getByLabel("Title").fill("My toy words");
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  // The preview follows the edit.
  await expect(page.getByText("big ball", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "💾 Save changes" }).click();
  await expect(page.getByText("✅ Saved")).toBeVisible();
  const after = await (await request.get(`/api/items/${items[0].id}`)).json();
  expect(after.item.title).toBe("My toy words");
  expect(after.item.data.words[0].word).toBe("big ball");
  // An empty required text can't be saved.
  await expect(words.nth(1)).toHaveValue("car");
  await words.nth(1).fill("");
  await expect(page.getByRole("button", { name: "💾 Save changes" })).toBeDisabled();
  await page.getByRole("button", { name: "↩ Undo all changes" }).click();
  expect(errors).toEqual([]);
});

test("voice settings: natural voices can be chosen", async ({ page }) => {
  await unlockParent(page);
  const errors = watchErrors(page);
  await page.goto("/parent/settings");
  await expect(page.getByRole("radio", { name: /Natural voice/ })).toHaveAttribute("aria-checked", "true");
  const pick = (name: string) => page.getByRole("button", { name: new RegExp(`^(👩|👨) ${name}`) });
  await expect(page.getByRole("button", { name: "Listen to Puck" })).toBeVisible();
  await pick("Puck").click();
  await expect(pick("Puck")).toContainText("✓");
  await pick("Heart").click();
  await expect(pick("Heart")).toContainText("✓");
  expect(errors).toEqual([]);
});

test("a child sees the ready-made lessons of the books chosen for them", async ({ page, request }) => {
  const { children } = await (await request.get("/api/children")).json();
  const kid = children[0];
  await request.post("/api/children", { data: { ...kid, bookIds: [] } });
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(kid.name) }).click();
  await expect(page.getByText(/Ask your parent to choose a book/)).toBeVisible();
  const { books } = await (await request.get("/api/books")).json();
  const demo = books.find((b: { isDemo: boolean }) => b.isDemo);
  await request.post("/api/children", { data: { ...kid, bookIds: [demo.id] } });
  await page.reload();
  await expect(page.getByRole("link", { name: /My Toys/ })).toBeVisible();
});

test("child plays a quiz and earns stars", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Little Star/ }).click();
  await page.getByRole("link", { name: /My Toys/ }).click();
  await page.getByRole("link", { name: /Quiz/ }).first().click();
  // Answer with whatever is offered (wrong picks get locked, the hint glows after two misses) until the celebration shows.
  const tap = (l: ReturnType<Page["locator"]>) => l.click({ timeout: 3_000 }).catch(() => {});
  for (let k = 0; k < 120; k++) {
    if (await page.getByRole("button", { name: /Play again/ }).count()) break;
    const next = page.locator("main button:not([disabled])").filter({ hasText: /^(Next|Finish|Check)/ });
    const glow = page.locator('main button[class*="animate-glow"]:not([disabled])');
    const any = page.locator("main button:not([disabled])").filter({ hasNotText: /Back|✖|🔊|🐢|Next|Finish|Check/ });
    if (await next.count()) await tap(next.first());
    else if (await glow.count()) await tap(glow.first());
    else if (await any.count()) await tap(any.nth(k % (await any.count())));
    await page.waitForTimeout(300);
  }
  await expect(page.getByRole("button", { name: /Play again/ })).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

/** Plays one mini game to the end the way a child would (the target is read from the speaker button's label). */
async function playGame(page: Page, kind: string) {
  const done = page.getByRole("button", { name: /Play again/ });
  const say = page.locator('main button[aria-label^="Listen: "]').first();
  const heard: Record<string, RegExp> = { fishing: /Catch the (.+)!$/, feed: /Give me the (.+), please!$/, balloon: /Pop the (.+)!$/, popup: /Tap the (.+)!$/ };
  const cards = page.locator("main button.flip-scene");
  const known = new Map<number, string>();
  for (let k = 0; k < 300 && !(await done.count()); k++) {
    if (heard[kind]) {
      const label = await say.getAttribute("aria-label", { timeout: 1_000 }).catch(() => null);
      const word = label ? heard[kind].exec(label)?.[1] : null;
      const target = page.locator(`main button[aria-label="${word}"]:not([disabled])`).first();
      // Moving targets (fish, balloons, pop-ups) never stand still: a direct click event, like a tap.
      if (word && (await target.count())) await target.dispatchEvent("click").catch(() => {});
    } else if (kind === "echo") {
      const tiles = page.locator("main button[data-seq]:not([disabled])");
      if (await tiles.count()) {
        const order = await tiles.evaluateAll((els) =>
          els
            .map((e) => ({ n: Number(e.getAttribute("data-seq")), label: e.getAttribute("aria-label") }))
            .filter((t) => t.n >= 0)
            .sort((a, b) => a.n - b.n)
            .map((t) => t.label),
        );
        for (const l of order) await page.locator(`main button[data-seq][aria-label="${l}"]`).click({ timeout: 2_000 }).catch(() => {});
      }
    } else if (kind === "memory") {
      const n = await cards.count();
      const labels = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
      const hidden = labels.flatMap((l, i) => (l === "Hidden card" ? [i] : []));
      if (n && hidden.length) {
        const pair = hidden.flatMap((a) => hidden.filter((b) => b > a && known.get(a) && known.get(a) === known.get(b)).map((b) => [a, b]))[0];
        const flip = async (i: number) => {
          await cards.nth(i).click({ timeout: 2_000 }).catch(() => {});
          known.set(i, (await cards.nth(i).getAttribute("aria-label")) ?? "");
        };
        if (pair) {
          await flip(pair[0]);
          await flip(pair[1]);
        } else {
          const a = hidden.find((i) => !known.has(i)) ?? hidden[0];
          await flip(a);
          const b = hidden.find((i) => i !== a && known.get(i) === known.get(a)) ?? hidden.find((i) => i !== a && !known.has(i)) ?? hidden.find((i) => i !== a);
          if (b !== undefined) await flip(b);
        }
        await page.waitForTimeout(1_400);
      }
    } else {
      // I spy, Go car go, Rocket words: try the choices one by one (a wrong one is locked).
      const choice = page.getByRole("button", { name: /^(Hidden picture \d|Yes!|No!|cat|dog|fish|bird)$/ }).and(page.locator(":not([disabled])"));
      if (await choice.count()) await choice.first().dispatchEvent("click").catch(() => {});
    }
    await page.waitForTimeout(350);
  }
}

test("mini games: each new game can be played to the end (with its animations), and units get two of them", async ({ page, request }) => {
  test.setTimeout(480_000);
  const errors = watchErrors(page);
  const words = [
    { word: "cat", emoji: "🐱" },
    { word: "dog", emoji: "🐶" },
    { word: "fish", emoji: "🐟" },
    { word: "bird", emoji: "🐦" },
  ];
  const kinds = ["fishing", "feed", "spy", "popup", "echo", "traffic", "rocket", "balloon", "memory"];
  const pack = {
    kind: "inspiration-pack",
    topic: { title: "Game park", emoji: "🎡", description: "Every game", stage: "early-reader" },
    items: kinds.map((game) => ({ type: "game", title: game, data: { game, words } })),
  };
  const saved = await (await request.post("/api/topics", { data: { pack } })).json();
  expect(saved.addedGames).toEqual([]); // it has games already
  await request.patch(`/api/topics/${saved.topic.id}`, { data: { status: "approved" } });
  const { items } = await (await request.get(`/api/topics/${saved.topic.id}`)).json();

  await page.goto("/");
  await page.getByRole("button", { name: /Little Star/ }).click();
  await expect(page.getByRole("link", { name: /My Toys/ })).toBeVisible();
  for (const kind of kinds) {
    const item = items.find((i: { data: { game?: string } }) => i.data.game === kind);
    await page.goto(`/learn/play/${item.id}`);
    await playGame(page, kind);
    await expect(page.getByRole("button", { name: /Play again/ }), kind).toBeVisible({ timeout: 20_000 });
  }

  // A topic saved with fewer than two games gets one that fits it.
  const one = {
    kind: "inspiration-pack",
    topic: { title: "Under the sea", emoji: "🌊", description: "Sea animals", stage: "early-reader" },
    items: [{ type: "vocabulary", title: "Sea", data: { words: [{ word: "fish", emoji: "🐟" }, { word: "crab", emoji: "🦀" }, { word: "whale", emoji: "🐋" }] } }],
  };
  const topped = await (await request.post("/api/topics", { data: { pack: one } })).json();
  expect(topped.addedGames).toHaveLength(2);
  const games = (await (await request.get(`/api/topics/${topped.topic.id}`)).json()).items.filter((i: { type: string }) => i.type === "game");
  expect(new Set(games.map((g: { data: { game: string } }) => g.data.game)).size).toBe(2);
  expect(errors).toEqual([]);
});

test("a wrong answer is shown as wrong and must be fixed before Next", async ({ page, request }) => {
  const errors = watchErrors(page);
  const { items } = await (await request.get("/api/items?unitId=demo-sunny-starter-u01&type=reading")).json();
  const reading = items.find((i: { title: string }) => i.title === "Mia's Toy Box");
  await page.goto("/");
  await page.getByRole("button", { name: /Little Star/ }).click();
  await expect(page.getByRole("link", { name: /My Toys/ })).toBeVisible();
  await page.goto(`/learn/play/${reading.id}`);
  await page.getByRole("button", { name: /Questions/ }).click();
  const next = page.getByRole("button", { name: /Next|Finish/ });
  const oops = page.getByRole("alert").filter({ hasText: "Oops! That's not right." });

  // 1. "Mia has a toy box." — No is wrong: red message, No is locked, no Next until Yes.
  await page.getByRole("button", { name: /No$/ }).click();
  await expect(oops).toBeVisible();
  await expect(oops).toContainText("Try again!");
  await expect(page.getByRole("button", { name: /No$/ })).toBeDisabled();
  await expect(next).toHaveCount(0);
  await page.getByRole("button", { name: /Yes$/ }).click();
  await expect(page.getByText("You got it! 👍")).toBeVisible();
  await next.click();

  // 2. Two wrong picks → the right one glows; still no Next until it is picked.
  await page.getByRole("button", { name: "in the box" }).click();
  await expect(page.getByRole("button", { name: "in the box" })).toBeDisabled();
  await page.getByRole("button", { name: "on the car" }).click();
  await expect(oops).toContainText("Look for the glowing one");
  await expect(page.getByRole("button", { name: "on the bed" })).toHaveClass(/animate-glow/);
  await expect(next).toHaveCount(0);
  await page.getByRole("button", { name: "on the bed" }).click();
  await next.click();

  // 3. Right the first time.
  await page.getByRole("button", { name: "blue" }).click();
  await expect(page.getByText("Great job! 🎉")).toBeVisible();
  await next.click();
  // Only the first-try answer counts: 1 of 3 → one star.
  await expect(page.getByRole("heading", { name: "Good try!" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("an AI Studio topic shows only for the children it is given to (Children → Edit)", async ({ page, request }) => {
  await unlockParent(page);
  const errors = watchErrors(page);
  const pack = {
    kind: "inspiration-pack",
    topic: { title: "Under the Sea", emoji: "🐠", description: "Sea animals", stage: "early-reader" },
    items: [{ type: "vocabulary", title: "Sea words", data: { words: [{ word: "fish", emoji: "🐟" }, { word: "crab", emoji: "🦀" }, { word: "whale", emoji: "🐋" }] } }],
  };
  const { topic } = await (await request.post("/api/topics", { data: { pack } })).json();
  await request.patch(`/api/topics/${topic.id}`, { data: { status: "approved" } });

  // Approved, but not given to a child yet → no Bonus island.
  await page.goto("/");
  await page.getByRole("button", { name: /Little Star/ }).click();
  await expect(page.getByRole("link", { name: /My Toys/ })).toBeVisible();
  await expect(page.getByText("Under the Sea")).toHaveCount(0);
  await page.goto(`/parent/inspiration/${topic.id}`);
  await expect(page.getByText("Not given to any child yet")).toBeVisible();

  // Children → Edit → tick the topic → Save.
  await page.goto("/parent/children");
  const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: /Little Star/ }) });
  await panel.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("checkbox", { name: /Under the Sea/ }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(panel.getByText("🐠 Under the Sea")).toBeVisible();

  // Now the child has it, and the topic page says so.
  await page.goto("/learn");
  await expect(page.getByRole("heading", { name: /Bonus islands/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Under the Sea/ })).toBeVisible();
  await page.goto(`/parent/inspiration/${topic.id}`);
  await expect(page.getByText(/For: .*Little Star/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("AI Studio topic pictures: made after saving, shown in the lessons, changeable by the parent", async ({ page, request }) => {
  await unlockParent(page);
  const errors = watchErrors(page);
  const pack = {
    kind: "inspiration-pack",
    topic: { title: "Pets at home", emoji: "🏠", description: "Pets", stage: "early-reader" },
    items: [{ type: "vocabulary", title: "Pet words", data: { words: [{ word: "cat", emoji: "🐱" }, { word: "dog", emoji: "🐶" }, { word: "hello", emoji: "👋" }] } }],
  };
  const saved = await (await request.post("/api/topics", { data: { pack } })).json();
  expect(saved.pictures).toBe(true); // the picture job started by itself
  await page.goto(`/parent/inspiration/${saved.topic.id}`);
  // No internet in the test: Claude (fake) draws them; the greeting keeps its emoji.
  const cat = page.getByTestId("picture-cat");
  await expect(cat.getByText("🎨 Drawn by Claude")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("picture-dog").getByText("🎨 Drawn by Claude")).toBeVisible();
  await expect(page.getByTestId("picture-hello").getByText("😀 Emoji")).toBeVisible();
  await expect.poll(() => cat.locator("img").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  // No style pictures in this chat: Claude chose a style for the topic, and the parent can add one.
  await expect(page.getByTestId("picture-style")).toContainText("Style Claude chose for this topic: Bright flat cartoon for the topic");
  await expect(page.getByTestId("picture-style").getByText("➕ Add a style picture")).toBeVisible();
  // The lesson itself shows the picture instead of the emoji.
  const { items } = await (await request.get(`/api/topics/${saved.topic.id}`)).json();
  const { pictures } = await (await request.get(`/api/items/${items[0].id}`)).json();
  expect(pictures["w:cat"]).toMatch(/\/pictures\/cat-[a-z0-9]+\/ai\.png\?v=\d+$/);
  // The parent can ask Claude to draw it again, or go back to the emoji.
  await cat.getByRole("button", { name: "Change picture" }).click();
  await cat.getByRole("button", { name: /Claude, draw it/ }).click();
  await expect(cat.getByText("🎨 Drawn by Claude")).toBeVisible({ timeout: 30_000 });
  await expect(cat.getByRole("button", { name: "Change picture" })).toBeEnabled({ timeout: 30_000 });
  await cat.getByRole("button", { name: "Change picture" }).click();
  await cat.getByRole("button", { name: /Use the emoji/ }).click();
  await expect(cat.getByText("😀 Emoji")).toBeVisible();
  expect(errors).toEqual([]);
});

test("speaking: the child hears their own voice back; it is gone after Next", async ({ page, request }) => {
  const errors = watchErrors(page);
  // A pretend speech recogniser (the browser's real one needs the internet).
  await page.addInitScript(() => {
    class FakeRecognition {
      lang = "";
      interimResults = false;
      maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          this.onresult?.({ results: { 0: { 0: { transcript: "ball" }, length: 1 }, length: 1 } });
          this.onend?.();
        }, 800);
      }
      stop() {}
    }
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition });
  });
  const { items } = await (await request.get("/api/items?unitId=demo-sunny-starter-u01&type=speaking")).json();
  test.skip(!items.length, "no speaking item in the demo unit");
  await page.goto("/");
  await page.getByRole("button", { name: /Little Star/ }).click();
  await expect(page.getByRole("link", { name: /My Toys/ })).toBeVisible();
  await page.goto(`/learn/play/${items[0].id}`);
  await expect(page.getByRole("button", { name: "Listen to my voice" })).toHaveCount(0);
  await page.getByRole("button", { name: /Now you say it/ }).click();
  await expect(page.getByText(/I heard: “ball”/)).toBeVisible();
  const me = page.getByRole("button", { name: "Listen to my voice" });
  await expect(me).toBeVisible();
  await me.click();
  // Next → the recording is dropped.
  const next = page.getByRole("button", { name: /Next|Finish/ });
  if ((await next.textContent())?.includes("Next")) {
    await next.click();
    await expect(page.getByRole("button", { name: "Listen to my voice" })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("sticker album: themed pages; a full page wins a trophy and the child's level", async ({ page, request }) => {
  const errors = watchErrors(page);
  const { children } = await (await request.get("/api/children")).json();
  const kid = children.find((c: { name: string }) => c.name === "Little Star");
  const { items } = await (await request.get("/api/items?unitId=demo-sunny-starter-u01&type=vocabulary")).json();
  // Bring the child to 39 stars (7 stickers); the next 3-star activity finishes the first page.
  let total: number = kid.stats.totalStars;
  test.skip(total > 39, "this child already has the first trophy");
  while (total < 39) {
    const stars = Math.min(3, 39 - total);
    const r = await (await request.post("/api/attempts", { data: { childId: kid.id, itemId: items[0].id, score: stars === 3 ? 10 : stars === 2 ? 6 : 1, maxScore: 10, durationSec: 10, missed: [] } })).json();
    total += r.stars;
  }
  await page.goto("/");
  await page.getByRole("button", { name: /Little Star/ }).click();
  await page.goto("/learn/stickers");
  await expect(page.getByRole("heading", { name: "🦁 Animals on land" })).toBeVisible();
  await expect(page.getByText("7 / 8")).toBeVisible();
  await expect(page.getByText("1 more sticker to win this trophy!")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Robot friends" })).toBeVisible();

  // Play the flashcards to the end (3 stars) → the 8th sticker and the trophy.
  await page.goto(`/learn/play/${items[0].id}`);
  for (let k = 0; k < 20 && !(await page.getByRole("button", { name: /Done/ }).count()); k++) await page.getByRole("button", { name: /Next/ }).click();
  await page.getByRole("button", { name: /Done/ }).click();
  await expect(page.getByText("🏆 You won a trophy!")).toBeVisible();
  await expect(page.getByText(/Animals on land — Level 1!/)).toBeVisible();

  await page.goto("/learn/stickers");
  await expect(page.getByRole("heading", { name: /My trophies · Level 1/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Animals on land trophy, level 1/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "🐠 Under the sea" })).toBeVisible(); // the next page to fill
  // Robots are original drawings.
  await page.getByRole("tab", { name: "Robot friends" }).click();
  await expect(page.getByRole("heading", { name: "🤖 Robot friends" })).toBeVisible();
  await expect(page.locator("main svg[aria-label='Beep']")).toHaveCount(1);
  expect(errors).toEqual([]);
});
