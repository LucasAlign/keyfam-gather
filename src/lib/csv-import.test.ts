import { describe, expect, it } from "vitest";
import { autoMapColumns, buildImportRows, parseCsv, parseCsvTable, requiredFieldsMapped, summarizeImportRows } from "./csv-import";

describe("parseCsv", () => {
  it("parses quoted fields with embedded commas, quotes, and newlines", () => {
    const text = 'first,last,note\r\n"Ada","Lovelace","Enjoys ""maths"", and\ncommas"\nGrace,Hopper,plain';
    expect(parseCsv(text)).toEqual([
      ["first", "last", "note"],
      ["Ada", "Lovelace", 'Enjoys "maths", and\ncommas'],
      ["Grace", "Hopper", "plain"],
    ]);
  });
  it("ignores blank lines and a missing trailing newline", () => {
    expect(parseCsv("a,b\n\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("splits a header row from data rows", () => {
    expect(parseCsvTable(" First Name , Email \nAda,ada@example.test")).toEqual({
      headers: ["First Name", "Email"],
      rows: [["Ada", "ada@example.test"]],
    });
  });
});

describe("autoMapColumns", () => {
  it("matches common header spellings to fields without reusing a column", () => {
    const mapping = autoMapColumns(["Given Name", "Surname", "E-Mail", "Mobile", "Host Group", "Table Name"]);
    expect(mapping).toEqual({ firstName: 0, lastName: 1, email: 2, phone: 3, group: 4, table: 5 });
  });
  it("leaves unmatched fields undefined", () => {
    expect(autoMapColumns(["name", "notes"]).firstName).toBeUndefined();
  });
});

describe("buildImportRows", () => {
  const headers = ["first", "last", "email", "phone"];
  const mapping = autoMapColumns(headers);
  it("requires a name and a matchable contact, and validates the email", () => {
    const rows = buildImportRows([
      ["Ada", "Lovelace", "ada@example.test", ""],
      ["", "Hopper", "grace@example.test", ""],
      ["Alan", "Turing", "", ""],
      ["Katherine", "Johnson", "not-an-email", ""],
    ], mapping);
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors).toContain("Missing first name.");
    expect(rows[2].errors).toContain("Needs an email or phone to match a Person.");
    expect(rows[3].errors).toContain("Email is not a valid address.");
  });
  it("accepts a phone-only contact", () => {
    const rows = buildImportRows([["Sam", "Lee", "", "615-555-0100"]], mapping);
    expect(rows[0].errors).toEqual([]);
  });
  it("flags rows that repeat an earlier contact in the same file", () => {
    const rows = buildImportRows([
      ["Ada", "Lovelace", "ada@example.test", ""],
      ["Ada", "L.", "ADA@example.test", ""],
    ], mapping);
    expect(rows[0].duplicateInFile).toBe(false);
    expect(rows[1].duplicateInFile).toBe(true);
  });
  it("preserves row position for exact error reporting", () => {
    const rows = buildImportRows([["Ada", "Lovelace", "ada@example.test", ""], ["", "", "", ""]], mapping);
    expect(rows[1].index).toBe(1);
  });
});

describe("summary and mapping guards", () => {
  it("counts ready, errored, and duplicate rows", () => {
    const rows = buildImportRows([
      ["Ada", "Lovelace", "ada@example.test", ""],
      ["Ada", "Lovelace", "ada@example.test", ""],
      ["", "", "", ""],
    ], { firstName: 0, lastName: 1, email: 2, phone: 3 });
    expect(summarizeImportRows(rows)).toEqual({ total: 3, ready: 1, withErrors: 1, duplicatesInFile: 1 });
  });
  it("only reports required fields as satisfied when both name columns are mapped", () => {
    expect(requiredFieldsMapped({ firstName: 0 })).toBe(false);
    expect(requiredFieldsMapped({ firstName: 0, lastName: 1 })).toBe(true);
  });
});
