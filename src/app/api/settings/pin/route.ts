import { route, ok, fail, body } from "@/server/api";
import { family } from "@/server/family";

/** Parent PIN: a simple child lock (not real security). */
export const POST = route(async (req) => {
  const b = await body<{ action?: "verify" | "set"; pin?: string; currentPin?: string }>(req);
  const pin = String(b.pin ?? "");
  const store = family();
  const hasPin = !!(await store.getSetting("pinHash"));
  if (b.action === "verify") {
    if (!hasPin) return ok({ ok: true, needsSetup: true });
    return (await store.checkPin(pin)) ? ok({ ok: true }) : fail("Wrong PIN", 401);
  }
  if (b.action === "set") {
    if (!/^\d{4}$/.test(pin)) return fail("The PIN must be 4 digits.");
    if (hasPin && !(await store.checkPin(String(b.currentPin ?? "")))) return fail("The current PIN is wrong.", 401);
    await store.setPin(pin);
    return ok({ ok: true });
  }
  return fail("Unknown action");
});
