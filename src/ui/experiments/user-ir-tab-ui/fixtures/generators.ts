const toBase64 = (bytes: Uint8Array): string => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  // Browser fallback
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
};

const crcTable = (() => {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const adler32 = (bytes: Uint8Array): number => {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
};

const writeUint32BE = (value: number): Uint8Array => {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
};

const buildChunk = (type: string, data: Uint8Array): Uint8Array => {
  const typeBytes = new TextEncoder().encode(type);
  const length = writeUint32BE(data.length);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  const crc = writeUint32BE(crc32(crcInput));

  const chunk = new Uint8Array(4 + typeBytes.length + data.length + 4);
  chunk.set(length, 0);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  chunk.set(crc, 8 + data.length);
  return chunk;
};

export const generateSolidPngBase64 = (r: number, g: number, b: number): string => {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = buildChunk(
    'IHDR',
    new Uint8Array([
      0x00,
      0x00,
      0x00,
      0x01, // width
      0x00,
      0x00,
      0x00,
      0x01, // height
      0x08, // bit depth
      0x02, // color type RGB
      0x00, // compression
      0x00, // filter
      0x00, // interlace
    ]),
  );

  const raw = new Uint8Array([0x00, r & 0xff, g & 0xff, b & 0xff]); // filter byte + rgb
  const len = raw.length;
  const lenLow = len & 0xff;
  const lenHigh = (len >>> 8) & 0xff;
  const nlen = (~len) & 0xffff;
  const deflate = new Uint8Array(5 + raw.length);
  deflate.set([0x01, lenLow, lenHigh, nlen & 0xff, (nlen >>> 8) & 0xff], 0);
  deflate.set(raw, 5);

  const adler = adler32(raw);
  const adlerBytes = writeUint32BE(adler);
  const zlib = new Uint8Array(2 + deflate.length + 4);
  zlib.set([0x78, 0x01], 0); // zlib header: no compression/fast
  zlib.set(deflate, 2);
  zlib.set(adlerBytes, 2 + deflate.length);

  const idat = buildChunk('IDAT', zlib);
  const iend = buildChunk('IEND', new Uint8Array());

  const pngBytes = new Uint8Array(signature.length + ihdr.length + idat.length + iend.length);
  pngBytes.set(signature, 0);
  pngBytes.set(ihdr, signature.length);
  pngBytes.set(idat, signature.length + ihdr.length);
  pngBytes.set(iend, signature.length + ihdr.length + idat.length);

  return toBase64(pngBytes);
};

export const generateTinyPdfBase64 = (): string => {
  const stream1 = 'BT /F1 16 Tf 72 720 Td (Fixture PDF page one with quick summary) Tj ET';
  const stream2 = 'BT /F1 16 Tf 72 720 Td (Second page with a small table sketch) Tj ET';
  const objects = [
    '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj',
    '2 0 obj<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>endobj',
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 6 0 R >> >> >>endobj',
    '4 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 7 0 R /Resources << /Font << /F1 6 0 R >> >> >>endobj',
    `5 0 obj<< /Length ${stream1.length} >>stream\n${stream1}\nendstreamendobj`,
    '6 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj',
    `7 0 obj<< /Length ${stream2.length} >>stream\n${stream2}\nendstreamendobj`,
  ];

  const parts: string[] = ['%PDF-1.4\n'];
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(parts.join('').length);
    parts.push(`${obj}\n`);
  }
  const xrefStart = parts.join('').length;
  parts.push(`xref\n0 ${objects.length + 1}\n`);
  parts.push('0000000000 65535 f \n');
  for (const off of offsets) {
    parts.push(`${off.toString().padStart(10, '0')} 00000 n \n`);
  }
  parts.push('trailer\n');
  parts.push(`<< /Size ${objects.length + 1} /Root 1 0 R >>\n`);
  parts.push(`startxref\n${xrefStart}\n%%EOF`);

  const pdfString = parts.join('');
  return toBase64(new TextEncoder().encode(pdfString));
};
