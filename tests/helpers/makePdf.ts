/** Builds a tiny valid PDF (one line of text per page) for pipeline tests. */
export function makePdf(pageTexts: string[]): Buffer {
  const objs: string[] = [];
  const n = pageTexts.length;
  // 1 catalog, 2 pages, 3 font, then (page, content) pairs
  const pageIds = pageTexts.map((_, i) => 4 + i * 2);
  objs[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${n} >>`;
  objs[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  pageTexts.forEach((t, i) => {
    const pid = pageIds[i];
    const stream = `BT /F1 28 Tf 40 300 Td (${t.replace(/[()\\]/g, "")}) Tj ET`;
    objs[pid] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Contents ${pid + 1} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`;
    objs[pid + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objs.length; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objs[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objs.length; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
