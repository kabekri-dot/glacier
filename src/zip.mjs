// A small zip reader and writer for Export and Import (#13). Written here in
// one file instead of pulling in a library (ADR 0002). Writing stores files
// as they are (notes are small text, so no compression is needed); reading
// also understands deflated files, which is what Obsidian and the system's
// "compress" make, using the platform's DecompressionStream.

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_DIRECTORY = 0x06054b50;
const STORED = 0;
const DEFLATED = 8;
// Bit 11 of the flags says the file names are UTF-8, so titles keep accents.
const UTF8_NAMES = 0x0800;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Zip keeps times in the old DOS format: 2 second steps, years from 1980.
function dosTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day =
    ((Math.max(date.getFullYear(), 1980) - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { time, day };
}

// Pack [{ path, text }] into the bytes of a zip file.
export function zipFiles(files, date = new Date()) {
  const encoder = new TextEncoder();
  const { time, day } = dosTime(date);
  const parts = [];
  const directory = [];
  let offset = 0;
  for (const { path, text } of files) {
    const name = encoder.encode(path);
    const data = encoder.encode(text);
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, LOCAL_HEADER, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, UTF8_NAMES, true);
    local.setUint16(8, STORED, true);
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, CENTRAL_HEADER, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, UTF8_NAMES, true);
    central.setUint16(10, STORED, true);
    central.setUint16(12, time, true);
    central.setUint16(14, day, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    directory.push(new Uint8Array(central.buffer), name);

    offset += 30 + name.length + data.length;
  }
  const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, END_OF_DIRECTORY, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  parts.push(...directory, new Uint8Array(end.buffer));

  const zip = new Uint8Array(offset + directorySize + 22);
  let at = 0;
  for (const part of parts) {
    zip.set(part, at);
    at += part.length;
  }
  return zip;
}

// The end record sits in the last 22 bytes, unless a comment follows it, so
// search backwards for its signature.
function findEnd(view) {
  for (let at = view.byteLength - 22; at >= 0; at--) {
    if (view.getUint32(at, true) === END_OF_DIRECTORY) {
      return at;
    }
  }
  throw new Error("This file is not a zip");
}

async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Unpack the bytes of a zip file into [{ path, text }]. Folders are skipped.
// Sizes and offsets are read from the central directory, because some tools
// leave them out of the header in front of each file.
export async function unzipFiles(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEnd(view);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== CENTRAL_HEADER) {
      throw new Error("This zip is damaged");
    }
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const path = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;

    if (path.endsWith("/")) continue;
    const dataAt =
      localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
    const data = bytes.subarray(dataAt, dataAt + size);
    if (method === STORED) {
      files.push({ path, text: decoder.decode(data) });
    } else if (method === DEFLATED) {
      files.push({ path, text: decoder.decode(await inflate(data)) });
    } else {
      throw new Error(`This zip uses a packing Glacier can't read (${method})`);
    }
  }
  return files;
}
