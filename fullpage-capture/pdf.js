// A minimal PDF writer: enough to wrap JPEG pages, nothing more.
//
// Written by hand rather than pulling in a library, because a PDF containing
// only JPEG images is a genuinely small format — JPEG is embeddable verbatim
// via /DCTDecode, so there is no encoder to write — and a dependency would
// undo the "the source here is what runs" property of this extension.

(function (root) {
  const encoder = new TextEncoder();

  // Assembles byte chunks while tracking offsets, which an xref table needs.
  function createWriter() {
    const chunks = [];
    let length = 0;
    return {
      get length() {
        return length;
      },
      push(data) {
        const bytes = typeof data === "string" ? encoder.encode(data) : data;
        chunks.push(bytes);
        length += bytes.length;
      },
      toBlob() {
        return new Blob(chunks, { type: "application/pdf" });
      },
    };
  }

  // Byte offsets in an xref entry are fixed-width, 10 digits.
  function offset10(n) {
    return String(n).padStart(10, "0");
  }

  /**
   * pages: [{ jpeg: Uint8Array, width: number, height: number }]
   * Each becomes one page sized exactly to its image, in points.
   */
  function buildPdf(pages) {
    if (!pages.length) throw new Error("a PDF needs at least one page");

    const out = createWriter();
    const offsets = [];
    const startObject = (number, body) => {
      offsets[number] = out.length;
      out.push(`${number} 0 obj\n${body}\n`);
    };

    out.push("%PDF-1.4\n");
    // A comment of high bytes, marking the file as binary so naive tools do
    // not mangle it in text mode. Convention, and cheap to honour.
    out.push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

    // Object numbering: 1 catalog, 2 page tree, then 3 objects per page.
    const pageObjectNumber = (i) => 3 + i * 3;
    const contentObjectNumber = (i) => 4 + i * 3;
    const imageObjectNumber = (i) => 5 + i * 3;

    const kids = pages.map((_, i) => `${pageObjectNumber(i)} 0 R`).join(" ");
    startObject(1, "<< /Type /Catalog /Pages 2 0 R >>\nendobj");
    startObject(2, `<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>\nendobj`);

    pages.forEach((page, i) => {
      const { jpeg, width, height } = page;

      startObject(
        pageObjectNumber(i),
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
          `/Resources << /XObject << /Im0 ${imageObjectNumber(i)} 0 R >> >> ` +
          `/Contents ${contentObjectNumber(i)} 0 R >>\nendobj`
      );

      // Draw the image over the whole page: scale by width/height, no offset.
      const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
      startObject(
        contentObjectNumber(i),
        `<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj`
      );

      // The JPEG is embedded verbatim; /DCTDecode tells the reader to decode
      // it, so no re-encoding happens and nothing is lost here.
      offsets[imageObjectNumber(i)] = out.length;
      out.push(
        `${imageObjectNumber(i)} 0 obj\n` +
          `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\n` +
          `stream\n`
      );
      out.push(jpeg);
      out.push("\nendstream\nendobj\n");
    });

    const objectCount = 3 + pages.length * 3; // including the free object 0
    const xrefOffset = out.length;
    out.push(`xref\n0 ${objectCount}\n`);
    out.push("0000000000 65535 f \n");
    for (let n = 1; n < objectCount; n++) {
      out.push(`${offset10(offsets[n] || 0)} 00000 n \n`);
    }
    out.push(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

    return out.toBlob();
  }

  root.QolPdf = { buildPdf };
})(typeof self !== "undefined" ? self : globalThis);
