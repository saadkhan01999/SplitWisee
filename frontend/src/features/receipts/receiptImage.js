// Image clean-up for receipt OCR. Pure functions over RGBA pixel data so the browser (canvas) and the tests use the
// same code. Tesseract binarises with one global threshold, which fails on phone photos with shadows or uneven
// light: half the slip turns black. Dividing each pixel by the local paper brightness evens the light first.

const MAX_SCAN_PIXELS = 6_000_000;
const MAX_SCAN_EDGE = 5000;
const MIN_SCAN_EDGE = 1600;
const MAX_UPSCALE = 2.5;

const scaled = (width, height, scale) => ({
  width: Math.max(1, Math.round(width * scale)),
  height: Math.max(1, Math.round(height * scale)),
});

/**
 * Size to scan at: large photos are reduced to about 6 megapixels, which keeps a long, narrow till slip readable
 * rather than shrinking it by its long edge. Smaller images are scanned as they are.
 */
export function scanSize(width, height) {
  const scale = Math.min(
    1,
    Math.sqrt(MAX_SCAN_PIXELS / (width * height)),
    MAX_SCAN_EDGE / Math.max(width, height),
  );
  return scaled(width, height, scale);
}

/**
 * A larger size for a small image (a cropped screenshot, a thumbnail) whose text may be too small to read, or null
 * when the image is large enough. Enlarging is only a last resort: it also enlarges the noise in a small photo, which
 * can make an otherwise readable receipt unreadable.
 */
export function enlargedSize(width, height) {
  const longEdge = Math.max(width, height);
  return longEdge < MIN_SCAN_EDGE
    ? scaled(width, height, Math.min(MAX_UPSCALE, MIN_SCAN_EDGE / longEdge))
    : null;
}

const luminance = (data, i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

/** Paper brightness around every pixel: block maximum (ignores dark text), smoothed, then scaled back up. */
function paperBrightness(grey, width, height) {
  const block = Math.max(4, Math.round(Math.max(width, height) / 100));
  const cols = Math.ceil(width / block);
  const rows = Math.ceil(height / block);
  let small = new Float32Array(cols * rows);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const cell = Math.floor(y / block) * cols + Math.floor(x / block);
      if (grey[y * width + x] > small[cell]) small[cell] = grey[y * width + x];
    }
  // Two 3×3 box blurs remove block edges and isolated dark blocks (large bold text).
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(small.length);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        let sum = 0;
        let count = 0;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
            sum += small[rr * cols + cc];
            count++;
          }
        next[r * cols + c] = sum / count;
      }
    small = next;
  }
  return (x, y) => {
    // Bilinear interpolation between block centres.
    const fx = Math.min(cols - 1, Math.max(0, x / block - 0.5));
    const fy = Math.min(rows - 1, Math.max(0, y / block - 0.5));
    const c0 = Math.floor(fx);
    const r0 = Math.floor(fy);
    const c1 = Math.min(cols - 1, c0 + 1);
    const r1 = Math.min(rows - 1, r0 + 1);
    const tx = fx - c0;
    const ty = fy - r0;
    const top = small[r0 * cols + c0] * (1 - tx) + small[r0 * cols + c1] * tx;
    const bottom = small[r1 * cols + c0] * (1 - tx) + small[r1 * cols + c1] * tx;
    return top * (1 - ty) + bottom * ty;
  };
}

/**
 * Turns an RGBA image into evenly lit greyscale with dark text on near-white paper. Modifies `data` in place.
 * @param {{ data: Uint8ClampedArray, width: number, height: number }} image
 */
export function cleanForOcr({ data, width, height }) {
  const grey = new Float32Array(width * height);
  for (let p = 0, i = 0; p < grey.length; p++, i += 4) grey[p] = luminance(data, i);
  const paper = paperBrightness(grey, width, height);

  const levels = new Uint32Array(256);
  const evened = new Uint8ClampedArray(grey.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const value = Math.min(255, (grey[p] / Math.max(24, paper(x, y))) * 245);
      evened[p] = value;
      levels[evened[p]]++;
    }

  // Stretch so the darkest 1 % is black and the brightest 1 % is white.
  let low = 0;
  let high = 255;
  for (let seen = 0; low < 255 && (seen += levels[low]) < grey.length * 0.01;) low++;
  for (let seen = 0; high > 0 && (seen += levels[high]) < grey.length * 0.01;) high--;
  const range = Math.max(32, high - low);
  for (let p = 0, i = 0; p < evened.length; p++, i += 4) {
    const value = Math.min(255, Math.max(0, ((evened[p] - low) / range) * 255));
    data[i] = data[i + 1] = data[i + 2] = value;
    data[i + 3] = 255;
  }
}
