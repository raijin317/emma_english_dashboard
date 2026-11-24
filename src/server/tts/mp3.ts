/**
 * WAV → MP3 for the online version's voice files (scripts/online-export.ts). Pure JS (lamejs), no ffmpeg needed.
 * Only used by the export script and tests — never imported by Next.js code.
 */
// Loaded with import(): the package's require() entry is a browser IIFE without exports (tsx runs scripts as CommonJS).
let lame: Promise<typeof import("@breezystack/lamejs")> | null = null;

/** Speech at 24 kHz mono, 48 kbps: ≈ 6 KB per second, about 1/16 of the voice engine's WAV. */
export const MP3_KBPS = 48;

/** Reads a WAV (PCM 16-bit or 32-bit float, as the voice engine writes it) as mono samples (first channel). */
export function readWav(buf: Buffer): { rate: number; samples: Float32Array } {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV file");
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null;
  for (let o = 12; o + 8 <= buf.length; ) {
    const id = buf.toString("ascii", o, o + 4);
    const size = buf.readUInt32LE(o + 4);
    const body = o + 8;
    if (id === "fmt ") fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    if (id === "data") {
      if (!fmt) throw new Error("WAV without format");
      const float = fmt.format === 3 && fmt.bits === 32;
      if (!float && fmt.bits !== 16) throw new Error(`WAV format not supported (${fmt.bits}-bit)`);
      const frame = (fmt.bits / 8) * fmt.channels;
      const frames = Math.floor(Math.min(size, buf.length - body) / frame);
      const out = new Float32Array(frames);
      for (let k = 0; k < frames; k++) out[k] = float ? buf.readFloatLE(body + k * frame) : buf.readInt16LE(body + k * frame) / 32768;
      return { rate: fmt.rate, samples: out };
    }
    o = body + size + (size % 2);
  }
  throw new Error("WAV without data");
}

export async function wavToMp3(wav: Buffer): Promise<Buffer> {
  const { Mp3Encoder } = await (lame ??= import("@breezystack/lamejs"));
  const { rate, samples } = readWav(wav);
  const pcm = new Int16Array(samples.length);
  for (let k = 0; k < samples.length; k++) pcm[k] = Math.max(-32768, Math.min(32767, Math.round(samples[k] * 32767)));
  const enc = new Mp3Encoder(1, rate, MP3_KBPS);
  const parts: Uint8Array[] = [];
  for (let k = 0; k < pcm.length; k += 1152) parts.push(enc.encodeBuffer(pcm.subarray(k, k + 1152)));
  parts.push(enc.flush());
  return Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength)));
}
