// Checks the hand-written PDF writer produces a structurally valid file.
//
// A malformed PDF does not throw — it saves happily and then fails to open,
// which the user discovers later, in another application. The xref table is
// the fragile part: every entry is a byte offset that must land exactly on
// its object header.

const fs = require("fs");
const path = require("path");
const { createChecker } = require("./lib");

// pdf.js is a classic script that assigns to `self`.
const src = fs.readFileSync(path.join(__dirname, "..", "fullpage-capture", "pdf.js"), "utf8");
const self = { Blob: class {}, TextEncoder };

// A Blob stand-in that keeps the bytes, so the output can be inspected.
self.Blob = class {
  constructor(parts) {
    const encoder = new TextEncoder();
    const arrays = parts.map((p) => (typeof p === "string" ? encoder.encode(p) : p));
    const total = arrays.reduce((n, a) => n + a.length, 0);
    this.bytes = new Uint8Array(total);
    let at = 0;
    for (const a of arrays) {
      this.bytes.set(a, at);
      at += a.length;
    }
  }
};
new Function("self", "Blob", "TextEncoder", src)(self, self.Blob, TextEncoder);

const check = createChecker("pdf writer");

// Stand-in JPEG payloads; the writer embeds bytes verbatim and never decodes.
const fakeJpeg = (n) => new Uint8Array(Array.from({ length: n }, (_, i) => i % 256));

const pages = [
  { jpeg: fakeJpeg(300), width: 1780, height: 2517 },
  { jpeg: fakeJpeg(180), width: 1780, height: 900 },
];
const bytes = self.QolPdf.buildPdf(pages).bytes;
const text = Buffer.from(bytes).toString("latin1");

check("starts with a PDF header", text.startsWith("%PDF-1.4"), true);
check("ends with the EOF marker", text.trimEnd().endsWith("%%EOF"), true);
check("declares one page object per page", (text.match(/\/Type \/Page[^s]/g) || []).length, pages.length);
check("declares the right page count", /\/Type \/Pages \/Count 2/.test(text), true);
check("embeds JPEG data without re-encoding", (text.match(/\/Filter \/DCTDecode/g) || []).length, pages.length);
check("page size matches the image", /\/MediaBox \[0 0 1780 2517\]/.test(text), true);
check("second page size matches its slice", /\/MediaBox \[0 0 1780 900\]/.test(text), true);
check("stream length matches the payload", /\/Length 300 /.test(text), true);

// The xref table: every offset must point at that object's header.
// Located by the newline-delimited keyword, since "startxref" contains "xref".
const xrefAt = text.lastIndexOf("\nxref\n") + 1;
const startxrefMatch = text.match(/startxref\n(\d+)/);
check("startxref points at the xref table", Number(startxrefMatch[1]), xrefAt);

const entries = [...text.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
check("one xref entry per object", entries.length, 2 + pages.length * 3);
const misaligned = entries.filter((offset, i) => !text.slice(offset).startsWith(`${i + 1} 0 obj`));
check("every xref offset lands on its object header", misaligned, []);

// /Size is the highest object number plus one: 8 objects here, so 9.
check("size in the trailer matches the object count", /\/Size 9 /.test(text), true);

// One page must work: a single-page PDF is the common case for short pages.
const single = self.QolPdf.buildPdf([{ jpeg: fakeJpeg(50), width: 800, height: 600 }]);
check("a single-page PDF is valid too", Buffer.from(single.bytes).toString("latin1").includes("/Count 1"), true);

let threw = false;
try {
  self.QolPdf.buildPdf([]);
} catch {
  threw = true;
}
check("an empty page list is rejected", threw, true);

process.exit(check.done());
