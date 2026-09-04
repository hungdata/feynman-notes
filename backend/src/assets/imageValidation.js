export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 16_384;
export const MAX_IMAGE_PIXELS = 100_000_000;

export const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

export class ImageValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ImageValidationError";
    this.status = status;
  }
}

const invalidImage = (message) => {
  throw new ImageValidationError(message);
};

const dimensionsAreSafe = ({ width, height }) => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    invalidImage("Không thể đọc kích thước ảnh.");
  }

  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
    invalidImage("Ảnh có kích thước quá lớn.");
  }

  return { width, height };
};

const pngDimensions = (buffer) => {
  if (buffer.length < 24 || buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") return null;
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return dimensionsAreSafe({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) });
};

const jpegDimensions = (buffer) => {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 9 < buffer.length) {
    while (offset < buffer.length && buffer[offset] !== 0xff) offset += 1;
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;

    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) break;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;

    const isStartOfFrame = (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame && segmentLength >= 7) {
      return dimensionsAreSafe({
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      });
    }

    offset += segmentLength;
  }

  return null;
};

const gifDimensions = (buffer) => {
  if (buffer.length < 10 || !["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) return null;
  return dimensionsAreSafe({ width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) });
};

const webpDimensions = (buffer) => {
  if (buffer.length < 20 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return null;

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkSize;
    if (dataEnd > buffer.length) return null;

    if (chunkType === "VP8X" && chunkSize >= 10) {
      return dimensionsAreSafe({
        width: 1 + buffer.readUIntLE(dataStart + 4, 3),
        height: 1 + buffer.readUIntLE(dataStart + 7, 3),
      });
    }

    if (chunkType === "VP8 " && chunkSize >= 10
      && buffer[dataStart + 3] === 0x9d && buffer[dataStart + 4] === 0x01 && buffer[dataStart + 5] === 0x2a) {
      return dimensionsAreSafe({
        width: buffer.readUInt16LE(dataStart + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataStart + 8) & 0x3fff,
      });
    }

    if (chunkType === "VP8L" && chunkSize >= 5 && buffer[dataStart] === 0x2f) {
      const packed = buffer.readUInt32LE(dataStart + 1);
      return dimensionsAreSafe({
        width: (packed & 0x3fff) + 1,
        height: ((packed >>> 14) & 0x3fff) + 1,
      });
    }

    offset = dataEnd + (chunkSize % 2);
  }

  return null;
};

const parseSvgLength = (value) => {
  const match = String(value || "").trim().match(/^(\d+(?:\.\d+)?)(?:px)?$/i);
  return match ? Math.round(Number(match[1])) : null;
};

const svgDimensions = (text, rootTag) => {
  const attribute = (name) => rootTag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2];
  let width = parseSvgLength(attribute("width"));
  let height = parseSvgLength(attribute("height"));
  const viewBox = attribute("viewBox")?.trim().split(/[\s,]+/).map(Number);

  if ((!width || !height) && viewBox?.length === 4 && viewBox.every(Number.isFinite)) {
    width ||= Math.round(viewBox[2]);
    height ||= Math.round(viewBox[3]);
  }

  // SVGs without intrinsic dimensions are valid. Use a conservative layout
  // fallback rather than trusting a browser to derive an arbitrary size.
  return dimensionsAreSafe({ width: width || 400, height: height || 300 });
};

const safeSvg = (buffer) => {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "").trim();
  if (!text || text.includes("\0") || text.includes("\uFFFD")) invalidImage("SVG không hợp lệ.");

  const rootTag = text.match(/<svg\b[^>]*>/i)?.[0];
  if (!rootTag) invalidImage("SVG không hợp lệ.");

  const forbidden = [
    /<!doctype/i,
    /<!entity/i,
    /<(?:script|foreignobject|iframe|object|embed|audio|video|canvas)\b/i,
    /\son[a-z]+\s*=/i,
    /@import/i,
    /(?:href|xlink:href)\s*=\s*(["'])\s*(?:javascript:|https?:|file:|ftp:)/i,
    /url\s*\(\s*(["'])?\s*(?:javascript:|https?:|file:|ftp:)/i,
    /(?:href|xlink:href)\s*=\s*(["'])\s*data:(?!image\/(?:png|jpeg|gif|webp);base64,)/i,
  ];
  if (forbidden.some((pattern) => pattern.test(text))) invalidImage("SVG chứa nội dung không an toàn.");

  return { buffer: Buffer.from(text, "utf8"), ...svgDimensions(text, rootTag) };
};

const rasterValidators = {
  "image/png": pngDimensions,
  "image/jpeg": jpegDimensions,
  "image/gif": gifDimensions,
  "image/webp": webpDimensions,
};

export const validateImageUpload = ({ buffer, mimeType }) => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) invalidImage("Không nhận được tệp ảnh hợp lệ.");
  if (buffer.length > MAX_IMAGE_BYTES) throw new ImageValidationError("Ảnh vượt quá giới hạn 12 MB.", 413);
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) invalidImage("Chỉ hỗ trợ PNG, JPG, WEBP, GIF và SVG an toàn.");

  if (mimeType === "image/svg+xml") {
    const svg = safeSvg(buffer);
    return { ...svg, mimeType };
  }

  const dimensions = rasterValidators[mimeType](buffer);
  if (!dimensions) invalidImage("Nội dung tệp không khớp với định dạng ảnh đã chọn.");
  return { buffer, mimeType, ...dimensions };
};

export const safeImageFilename = (filename = "image") => {
  const sanitized = String(filename)
    .normalize("NFKC")
    .replace(/[\\/\0\r\n]/g, "_")
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .trim()
    .slice(0, 180);
  return sanitized || "image";
};
