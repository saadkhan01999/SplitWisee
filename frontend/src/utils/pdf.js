import logoUrl from "../assets/brand/coinsplit-logo-pdf.png?url";
import regularFontUrl from "../assets/fonts/DejaVuSans.ttf?url";
import boldFontUrl from "../assets/fonts/DejaVuSans-Bold.ttf?url";
import { brand } from "../config/brand.js";
import { formatLongDate } from "./format.js";

// Branded A4 documents (receipts, statements, closing sheets). Every page carries the logo, the document name,
// household and date range in the header, and the export time, page number and a privacy line in the footer.
// jsPDF, the DejaVu Sans fonts and the logo load on first use only.

const PAGE = { width: 210, left: 18, right: 192, contentBottom: 258 };
const COLORS = {
  text: [26, 47, 43],
  muted: [99, 118, 111],
  brand: [20, 125, 100],
  logo: [18, 70, 44],
  brandSoft: [223, 247, 237],
  highlight: [232, 246, 237],
  tableHead: [241, 246, 243],
  rule: [226, 235, 229],
  white: [255, 255, 255],
};

let fontsPromise;
let logoPromise;
const LOGO_RATIO = 1400 / 382; // width / height of coinsplit-logo-pdf.png

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function loadFonts() {
  fontsPromise ??= Promise.all(
    [regularFontUrl, boldFontUrl].map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Font unavailable");
      return toBase64(await response.arrayBuffer());
    }),
  ).catch((error) => {
    fontsPromise = undefined;
    throw error;
  });
  return fontsPromise;
}

function loadLogo() {
  logoPromise ??= fetch(logoUrl)
    .then((response) => {
      if (!response.ok) throw new Error("Logo unavailable");
      return response.arrayBuffer();
    })
    .then((buffer) => `data:image/png;base64,${toBase64(buffer)}`)
    .catch((error) => {
      logoPromise = undefined;
      throw error;
    });
  return logoPromise;
}

export class PdfReport {
  /**
   * @param {object} options label (document name), household (name), range ([start, end] ISO dates or a text),
   *   subtitle, generatedAt
   */
  static async create(options) {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    let family = "helvetica";
    try {
      const [regular, bold] = await loadFonts();
      doc.addFileToVFS("DejaVuSans.ttf", regular);
      doc.addFileToVFS("DejaVuSans-Bold.ttf", bold);
      doc.addFont("DejaVuSans.ttf", "DejaVuSans", "normal");
      doc.addFont("DejaVuSans-Bold.ttf", "DejaVuSans", "bold");
      family = "DejaVuSans";
    } catch {
      // Built-in Helvetica covers £ and Latin text if the font files cannot be fetched (offline).
    }
    let logo = null;
    try {
      logo = await loadLogo();
    } catch {
      // Offline: the header falls back to the brand name in text.
    }
    return new PdfReport(doc, family, { ...options, logo });
  }

  constructor(
    doc,
    family,
    {
      label,
      subtitle = brand.tagline.toUpperCase(),
      household = "",
      range = "",
      generatedAt = new Date(),
      logo = null,
    },
  ) {
    this.doc = doc;
    this.family = family;
    this.label = label;
    this.subtitle = subtitle;
    this.household = household;
    this.range = Array.isArray(range)
      ? `${formatLongDate(range[0])} – ${formatLongDate(range[1])}`
      : String(range || "");
    this.generatedAt = generatedAt;
    this.logo = logo;
    this.y = 0;
    this.header();
  }

  font(size = 10, bold = false, color = COLORS.text) {
    this.doc.setFont(this.family, bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
  }

  header() {
    const { doc } = this;
    if (this.logo) doc.addImage(this.logo, "PNG", PAGE.left, 10, 12 * LOGO_RATIO, 12, "logo", "FAST");
    else {
      this.font(20, true, COLORS.logo);
      doc.text(brand.name, PAGE.left, 19);
      this.font(7, false, COLORS.muted);
      doc.text(this.subtitle, PAGE.left, 24);
    }
    this.font(9, true, COLORS.brand);
    doc.text(this.label, PAGE.right, 13, { align: "right" });
    if (this.household) {
      this.font(9, true);
      doc.text(doc.splitTextToSize(this.household, 90)[0], PAGE.right, 18.5, { align: "right" });
    }
    this.font(8, false, COLORS.muted);
    doc.text(this.range || `GBP · v${brand.version}`, PAGE.right, 23.5, { align: "right" });
    doc.setDrawColor(...COLORS.brand);
    doc.setLineWidth(0.6);
    doc.line(PAGE.left, 29, PAGE.right, 29);
    doc.setLineWidth(0.2);
    this.y = 40;
  }

  newPage() {
    this.doc.addPage();
    this.header();
  }

  ensure(height) {
    if (this.y + height > PAGE.contentBottom) this.newPage();
  }

  text(value, { size = 10, bold = false, color = COLORS.text, after = 4 } = {}) {
    this.font(size, bold, color);
    for (const line of this.doc.splitTextToSize(String(value), PAGE.right - PAGE.left)) {
      this.ensure(size * 0.5 + 2);
      this.font(size, bold, color);
      this.doc.text(line, PAGE.left, this.y);
      this.y += size * 0.46;
    }
    this.y += after;
  }

  muted(value, size = 9) {
    this.text(value, { size, color: COLORS.muted });
  }

  heading(value) {
    this.text(value, { size: 19, bold: true });
  }

  section(value) {
    this.ensure(18);
    this.y += 3;
    this.text(value, { size: 11, bold: true, color: COLORS.brand });
  }

  /** Highlighted total box: label on the left, large amount on the right. */
  total(label, amount) {
    const { doc } = this;
    this.ensure(29);
    doc.setFillColor(...COLORS.highlight);
    doc.roundedRect(PAGE.left, this.y, PAGE.right - PAGE.left, 24, 3, 3, "F");
    this.font(9, true, COLORS.brand);
    doc.text(label, PAGE.left + 6, this.y + 10);
    this.font(25, true, COLORS.brand);
    doc.text(amount, PAGE.right - 6, this.y + 16, { align: "right" });
    this.y += 32;
  }

  /**
   * Table with a wrapped first column. `columns`: [{ label, width, align }], widths in mm summing to 174.
   * Cells may be strings or { text, note } where note is a small grey line under the value.
   */
  table(columns, rows, { footer } = {}) {
    const { doc } = this;
    const starts = columns.reduce(
      (list, column, i) => [...list, i ? list[i - 1] + columns[i - 1].width : PAGE.left],
      [],
    );
    const x = (i) => (columns[i].align === "right" ? starts[i] + columns[i].width - 3 : starts[i] + 3);

    const head = () => {
      this.ensure(14);
      doc.setFillColor(...COLORS.tableHead);
      doc.rect(PAGE.left, this.y, PAGE.right - PAGE.left, 10, "F");
      this.font(8, true, COLORS.muted);
      columns.forEach((column, i) =>
        doc.text(column.label.toUpperCase(), x(i), this.y + 6.5, { align: column.align }),
      );
      this.y += 13;
    };

    const row = (cells, bold = false) => {
      this.font(9, bold);
      const first = doc.splitTextToSize(String(cells[0]), columns[0].width - 6);
      const hasNote = cells.some((cell) => cell?.note);
      const height = Math.max(hasNote ? 11 : 9, first.length * 4 + 4);
      if (this.y + height > PAGE.contentBottom) {
        this.newPage();
        head();
      }
      cells.forEach((cell, i) => {
        const value = i === 0 ? first : String(cell?.text ?? cell);
        this.font(9, bold);
        doc.text(value, x(i), this.y + 3, { align: columns[i].align });
        if (cell?.note) {
          this.font(7, false, COLORS.muted);
          doc.text(cell.note, x(i), this.y + 7, { align: columns[i].align });
        }
      });
      doc.setDrawColor(...COLORS.rule);
      doc.line(PAGE.left, this.y + height - 2, PAGE.right, this.y + height - 2);
      this.y += height;
    };

    head();
    rows.forEach((cells) => row(cells));
    if (footer) row(footer, true);
    this.y += 4;
  }

  /** Adds the notes, export time, privacy line and page numbers to every page and returns the PDF as a Blob. */
  finish(footerLines = []) {
    const { doc } = this;
    const pages = doc.getNumberOfPages();
    const exported = this.generatedAt.toISOString().slice(0, 16).replace("T", " ");
    for (let page = 1; page <= pages; page++) {
      doc.setPage(page);
      this.font(7, false, COLORS.muted);
      footerLines.slice(0, 2).forEach((line, i) => doc.text(line, PAGE.left, 266 + i * 4.5));
      doc.setDrawColor(...COLORS.rule);
      doc.line(PAGE.left, 277, PAGE.right, 277);
      this.font(7, true, COLORS.logo);
      doc.text(`${brand.name}`, PAGE.left, 282);
      this.font(7, false, COLORS.muted);
      doc.text(
        `· ${brand.tagline} · v${brand.version}`,
        PAGE.left + doc.getTextWidth(`${brand.name} `) + 1,
        282,
      );
      doc.text(`Page ${page} of ${pages}`, PAGE.right, 282, { align: "right" });
      doc.text("Private household record. Share only with the people it concerns.", PAGE.left, 287);
      doc.text(`Exported ${exported} UTC`, PAGE.right, 287, { align: "right" });
    }
    return doc.output("blob");
  }
}
