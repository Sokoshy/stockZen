const DANGEROUS_CSV_PREFIX = /^\s*[=+\-@]/;

export interface ImportErrorRow {
  rowNumber: number;
  field: string;
  message: string;
}

export function toCsvSafeCell(value: string | number): string {
  const rawValue = String(value);
  const guardedValue = DANGEROUS_CSV_PREFIX.test(rawValue)
    ? `'${rawValue}`
    : rawValue;
  const escapedValue = guardedValue.replaceAll('"', '""');

  return `"${escapedValue}"`;
}

export function buildImportErrorReportCsv(errors: ImportErrorRow[]): string {
  const rows: Array<Array<string | number>> = [
    ["Row", "Field", "Error Message"],
    ...errors.map((error) => [error.rowNumber, error.field, error.message]),
  ];

  return rows
    .map((row) => row.map((cell) => toCsvSafeCell(cell)).join(","))
    .join("\n");
}
