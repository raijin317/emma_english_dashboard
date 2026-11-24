import zlib from "node:zlib";

/** Builds a ZIP (deflate, or stored) — enough to make small .docx/.xlsx/.pptx files in tests. */
export function makeZip(entries: Record<string, string | Buffer>, opts: { store?: boolean; encrypted?: boolean } = {}): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const names = Object.keys(entries);
  for (const name of names) {
    const content = entries[name];
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const method = opts.store ? 0 : 8;
    const comp = method ? zlib.deflateRawSync(data) : data;
    const crc = zlib.crc32(data);
    const nameBuf = Buffer.from(name, "utf8");
    const flags = 0x800 | (opts.encrypted ? 1 : 0);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0);
    loc.writeUInt16LE(20, 4);
    loc.writeUInt16LE(flags, 6);
    loc.writeUInt16LE(method, 8);
    loc.writeUInt32LE(crc, 14);
    loc.writeUInt32LE(comp.length, 18);
    loc.writeUInt32LE(data.length, 22);
    loc.writeUInt16LE(nameBuf.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(flags, 8);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    locals.push(loc, nameBuf, comp);
    central.push(cen, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const IMAGE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";

/** A .docx whose body is `bodyXml` (w: elements); `images` become word/media/imageN.png as rId1… */
export function makeDocx(bodyXml: string, images: Buffer[] = []) {
  const rels = images.map((_, k) => `<Relationship Id="rId${k + 1}" Type="${IMAGE}" Target="media/image${k + 1}.png"/>`).join("");
  return makeZip({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${bodyXml}</w:body></w:document>`,
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`,
    ...Object.fromEntries(images.map((b, k) => [`word/media/image${k + 1}.png`, b])),
  });
}

/** Simple paragraphs → .docx */
export const docxParagraphs = (lines: string[]) => makeDocx(lines.map((l) => `<w:p><w:r><w:t xml:space="preserve">${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</w:t></w:r></w:p>`).join(""));

/** First bytes of an old binary Office file (.doc/.xls/.ppt). */
export const oleBytes = () => Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(504)]);
