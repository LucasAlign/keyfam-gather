// Guided CSV import for People + Registrations (issue #14). This module is the
// single source of truth for parsing, column mapping, and per-row validation so
// the client-side preview and the server-side import agree exactly on what each
// row means and whether it is importable.

export type ImportFieldKey = "firstName" | "lastName" | "email" | "phone" | "group" | "party" | "table";

export const REGISTRATION_IMPORT_FIELDS: Array<{ key: ImportFieldKey; label: string; required: boolean }> = [
  { key: "firstName", label: "First name", required: true },
  { key: "lastName", label: "Last name", required: true },
  { key: "email", label: "Email", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "group", label: "Group", required: false },
  { key: "party", label: "Party", required: false },
  { key: "table", label: "Table", required: false },
];

export type ColumnMapping = Partial<Record<ImportFieldKey, number>>;

// Pick the field separator from the first non-empty line so a tab-separated
// export (what Excel and Google Sheets produce when you copy cells, and a
// common "Save As" format) imports as readily as a comma-separated one.
export function detectDelimiter(text: string): "," | "\t" {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return tabs > commas ? "\t" : ",";
}

// RFC 4180-ish parser: handles quoted fields, escaped quotes (""), embedded
// separators and newlines, and both CRLF and LF line endings. The delimiter is
// auto-detected (comma or tab) unless one is supplied.
export function parseCsv(text: string, delimiter: string = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let sawField = false;
  const endField = () => { row.push(field); field = ""; sawField = true; };
  const endRow = () => { rows.push(row); row = []; sawField = false; };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
      sawField = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      endField();
      endRow();
    } else {
      field += ch;
      sawField = true;
    }
  }
  if (sawField || field.length > 0) { endField(); endRow(); }
  // Drop fully blank lines (a single empty cell with nothing else).
  return rows.filter((cells) => !(cells.length === 1 && cells[0].trim() === ""));
}

export function parseCsvTable(text: string): { headers: string[]; rows: string[][] } {
  const all = parseCsv(text);
  if (all.length === 0) return { headers: [], rows: [] };
  return { headers: all[0].map((header) => header.trim()), rows: all.slice(1) };
}

const HEADER_SYNONYMS: Record<ImportFieldKey, string[]> = {
  firstName: ["first name", "firstname", "first", "given name", "given"],
  lastName: ["last name", "lastname", "last", "surname", "family name"],
  email: ["email", "e-mail", "email address", "mail"],
  phone: ["phone", "phone number", "mobile", "cell", "telephone", "tel"],
  group: ["group", "host group"],
  party: ["party", "household", "table party"],
  table: ["table", "table assignment", "seat", "table name"],
};

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

// Best-effort match of a spreadsheet's headers to import fields so the mapping
// starts pre-filled; the coordinator can still correct it before importing.
export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  for (const { key } of REGISTRATION_IMPORT_FIELDS) {
    const synonyms = HEADER_SYNONYMS[key].map(normalizeHeader);
    const index = headers.findIndex((header, i) => !used.has(i) && synonyms.includes(normalizeHeader(header)));
    if (index >= 0) { mapping[key] = index; used.add(index); }
  }
  return mapping;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type MappedRow = {
  index: number; // 0-based position within the data rows
  values: Record<ImportFieldKey, string>;
  errors: string[];
  duplicateInFile: boolean;
};

const cell = (row: string[], column: number | undefined) => (column === undefined ? "" : (row[column] ?? "").trim());

// Turn raw rows + a column mapping into validated, deduplicated import rows.
// Requirements mirror staff registration: a first and last name, plus at least
// one matchable contact (email or phone). Rows keep their original position so
// errors can name the exact spreadsheet row.
export function buildImportRows(rows: string[][], mapping: ColumnMapping): MappedRow[] {
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const values: Record<ImportFieldKey, string> = {
      firstName: cell(row, mapping.firstName),
      lastName: cell(row, mapping.lastName),
      email: cell(row, mapping.email),
      phone: cell(row, mapping.phone),
      group: cell(row, mapping.group),
      party: cell(row, mapping.party),
      table: cell(row, mapping.table),
    };
    const errors: string[] = [];
    if (!values.firstName) errors.push("Missing first name.");
    if (!values.lastName) errors.push("Missing last name.");
    if (!values.email && !values.phone) errors.push("Needs an email or phone to match a Person.");
    if (values.email && !EMAIL_RE.test(values.email)) errors.push("Email is not a valid address.");

    // Flag rows that repeat a contact already seen earlier in this file so the
    // coordinator notices spreadsheet duplicates before importing.
    let duplicateInFile = false;
    const key = (values.email || values.phone).toLowerCase();
    if (key) {
      if (seen.has(key)) duplicateInFile = true;
      else seen.add(key);
    }
    return { index, values, errors, duplicateInFile };
  });
}

export type ImportPreviewSummary = { total: number; ready: number; withErrors: number; duplicatesInFile: number };

export function summarizeImportRows(rows: MappedRow[]): ImportPreviewSummary {
  return {
    total: rows.length,
    ready: rows.filter((row) => row.errors.length === 0 && !row.duplicateInFile).length,
    withErrors: rows.filter((row) => row.errors.length > 0).length,
    duplicatesInFile: rows.filter((row) => row.duplicateInFile).length,
  };
}

export function requiredFieldsMapped(mapping: ColumnMapping): boolean {
  return REGISTRATION_IMPORT_FIELDS.filter((field) => field.required).every((field) => mapping[field.key] !== undefined);
}
