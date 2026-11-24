import zlib from "node:zlib";

/**
 * Minimal ZIP reader (stored + deflate), enough for Office files (.docx/.xlsx/.pptx).
 * Entries are inflated lazily and capped, so a "zip bomb" can't fill the memory.
 */
export type ZipEntry = { name: string; size: number; read: () => Buffer };

export class ZipError extends Error {}

const EOCD = 0x06054b50;
const CEN = 0x02014b50;
const LOC = 0x04034b50;

export function readZip(buf: Buffer, opts: { maxEntryBytes?: number } = {}): Map<string, ZipEntry> {
  const max = opts.maxEntryBytes ?? 64 * 1024 * 1024;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError("Not a ZIP file.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, ZipEntry>();
  for (let k = 0; k < count; k++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN) throw new ZipError("The file is damaged.");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf
      .toString(flags & 0x800 ? "utf8" : "latin1", p + 46, p + 46 + nlen)
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");
    p += 46 + nlen + xlen + clen;
    if (!name || name.endsWith("/")) continue;
    if (flags & 1) throw new ZipError("The file has a password.");
    out.set(name.toLowerCase(), {
      name,
      size: usize,
      read: () => {
        if (local + 30 > buf.length || buf.readUInt32LE(local) !== LOC) throw new ZipError("The file is damaged.");
        const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const data = buf.subarray(start, start + csize);
        if (method === 0) return Buffer.from(data);
        if (method === 8) return zlib.inflateRawSync(data, { maxOutputLength: max });
        throw new ZipError(`Unsupported compression (${method}).`);
      },
    });
  }
  return out;
}

/** Reads one entry as UTF-8 text (case-insensitive name), or null when it is missing. */
export function zipText(zip: Map<string, ZipEntry>, name: string): string | null {
  const e = zip.get(name.toLowerCase());
  return e ? e.read().toString("utf8").replace(/^﻿/, "") : null;
}
