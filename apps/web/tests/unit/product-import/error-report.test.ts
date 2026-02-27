import { describe, expect, it } from "vitest";

import {
  buildImportErrorReportCsv,
  toCsvSafeCell,
} from "~/features/products/utils/csv-import";

describe("CSV error report helpers", () => {
  it("should wrap and escape values for CSV", () => {
    expect(toCsvSafeCell('hello "world"')).toBe('"hello ""world"""');
    expect(toCsvSafeCell("value,with,comma")).toBe('"value,with,comma"');
  });

  it("should protect formula-like values from CSV injection", () => {
    expect(toCsvSafeCell("=SUM(A1:A2)")).toBe('"\'=SUM(A1:A2)"');
    expect(toCsvSafeCell("  +2+2")).toBe('"\'  +2+2"');
  });

  it("should build error report CSV with headers", () => {
    const csv = buildImportErrorReportCsv([
      {
        rowNumber: 3,
        field: "barcode",
        message: "Barcode already exists",
      },
    ]);

    expect(csv).toContain('"Row","Field","Error Message"');
    expect(csv).toContain('"3","barcode","Barcode already exists"');
  });
});
