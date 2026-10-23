// Dependency-free writers for ZIP archives and minimal OOXML (.xlsx) workbooks. Text is always written as inline
// strings, never as formulas.

const encoder = new TextEncoder();

const xmlEscape = (value) =>
  String(value ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Stored (uncompressed) ZIP archive. `files` maps paths to strings or Uint8Arrays. */
export function zipFiles(files, type = "application/zip") {
  const chunks = [];
  const directory = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const filename = encoder.encode(name);
    const data = typeof content === "string" ? encoder.encode(content) : content;
    const crc = crc32(data);

    const local = new Uint8Array(30 + filename.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, filename.length, true);
    local.set(filename, 30);
    chunks.push(local, data);

    const central = new Uint8Array(46 + filename.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, filename.length, true);
    centralView.setUint32(42, offset, true);
    central.set(filename, 46);
    directory.push(central);

    offset += local.length + data.length;
  }

  const directorySize = directory.reduce((total, entry) => total + entry.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, directory.length, true);
  endView.setUint16(10, directory.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true);

  return new Blob([...chunks, ...directory, end], { type });
}

const SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const STYLES = `<styleSheet xmlns="${SHEET_NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF147D64"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function cell(value, header) {
  if (typeof value === "number" && Number.isFinite(value)) return `<c><v>${value}</v></c>`;
  return `<c s="${header ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function worksheet(name, rows) {
  const readMe = name === "Read me";
  const body = rows
    .map(
      (row, index) =>
        `<row r="${index + 1}" ht="${readMe ? 42 : 32}" customHeight="1">${row.map((value) => cell(value, index === 0)).join("")}</row>`,
    )
    .join("");
  return (
    `<worksheet xmlns="${SHEET_NS}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols><col min="1" max="1" width="${readMe ? 110 : 38}" customWidth="1"/><col min="2" max="30" width="28" customWidth="1"/></cols>` +
    `<sheetData>${body}</sheetData></worksheet>`
  );
}

/** Builds an .xlsx workbook from `{ "Sheet name": [[header…], [row…]] }`. */
export function workbook(sheets) {
  const names = Object.keys(sheets);
  const files = {
    "[Content_Types].xml":
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      names
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join("") +
      "</Types>",
    "_rels/.rels": `<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${DOC_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/styles.xml": STYLES,
    "xl/workbook.xml":
      `<workbook xmlns="${SHEET_NS}" xmlns:r="${DOC_REL}"><sheets>` +
      names
        .map(
          (name, i) =>
            `<sheet name="${xmlEscape(name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
        )
        .join("") +
      "</sheets></workbook>",
    "xl/_rels/workbook.xml.rels":
      `<Relationships xmlns="${REL_NS}"><Relationship Id="rStyles" Type="${DOC_REL}/styles" Target="styles.xml"/>` +
      names
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="${DOC_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join("") +
      "</Relationships>",
  };
  names.forEach((name, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = worksheet(name, sheets[name]);
  });
  return zipFiles(files, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
