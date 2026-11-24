/** Joins the audio of the parts of a text with the planned pauses (pure — no voice model needed). */

/** Cuts the quiet start and end of a voice clip, keeping a little air so no sound is clipped. */
export function trimSilence(x: Float32Array, rate: number, threshold = 0.004): Float32Array {
  let a = 0;
  while (a < x.length && Math.abs(x[a]) < threshold) a++;
  let b = x.length - 1;
  while (b > a && Math.abs(x[b]) < threshold) b--;
  if (a >= b) return x;
  return x.subarray(Math.max(0, a - Math.round(rate * 0.03)), Math.min(x.length, b + 1 + Math.round(rate * 0.08)));
}

/** clip₁ + pause₁ + clip₂ + pause₂ + … (pauses in ms at speed 1; a slower voice pauses longer). */
export function stitchSpeech(clips: Float32Array[], pausesMs: number[], speed: number, rate: number): Float32Array {
  const parts = clips.map((c) => trimSilence(c, rate));
  const gaps = parts.map((_, k) => (k < parts.length - 1 ? Math.round(((pausesMs[k] ?? 0) / 1000 / speed) * rate) : 0));
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0) + gaps.reduce((s, g) => s + g, 0));
  let o = 0;
  parts.forEach((p, k) => {
    out.set(p, o);
    o += p.length + gaps[k];
  });
  return out;
}
