/** A small, valid PDF with one line of Helvetica on each page. */
export function pdfWith(lines: string[]): string {
  const objs: string[] = [];
  const kids = lines.map((_, i) => `${3 + i * 2} 0 R`).join(' ');
  objs.push('<</Type/Catalog/Pages 2 0 R>>');
  objs.push(`<</Type/Pages/Kids[${kids}]/Count ${lines.length}>>`);
  const font = 3 + lines.length * 2;
  lines.forEach((line, i) => {
    const stream = `BT /F1 28 Tf 60 700 Td (${line}) Tj ET`;
    objs.push(
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents ${4 + i * 2} 0 R/Resources<</Font<</F1 ${font} 0 R>>>>>>`,
    );
    objs.push(`<</Length ${stream.length}>>stream\n${stream}\nendstream`);
  });
  objs.push('<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>');
  let out = '%PDF-1.4\n';
  const at: number[] = [];
  objs.forEach((o, i) => {
    at.push(out.length);
    out += `${i + 1} 0 obj${o}endobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}
