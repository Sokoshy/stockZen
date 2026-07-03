"use client";

import Link from "next/link"
import { useCallback, useState, useTransition } from "react"
import { useDropzone } from "react-dropzone"
import { useQueryClient } from "@tanstack/react-query"
import Papa from "papaparse"

import { useImportProducts } from "~/features/products/queries/useImportProducts"
import { buildImportErrorReportCsv } from "~/features/products/utils/csv-import"
import { Icons } from "~/components/icons"
import { toast } from "~/hooks/use-toast"

interface CSVRow {
  name?: string;
  category?: string;
  unit?: string;
  price?: string;
  barcode?: string;
  [key: string]: string | undefined;
}

interface ParsedRow {
  rowNumber: number;
  data: CSVRow;
  isValid: boolean;
  errors: Array<{ field: string; message: string }>;
}

interface ImportResult {
  success: boolean;
  importedCount: number;
  totalRows: number;
  errors: Array<{
    rowNumber: number;
    field: string;
    message: string;
  }>;
}

interface CSVImportClientProps {
  allowedRoles: readonly string[];
  membership: {
    tenantId: string;
    role: string;
    userId: string;
  } | null;
}

export function CSVImportClient({ allowedRoles, membership }: CSVImportClientProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isTransitioning, startTransition] = useTransition();
  const queryClient = useQueryClient();

  const { mutate: importProducts, isPending } = useImportProducts({
    onSuccess: (data) => {
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error) => {
      setImportResult({
        success: false,
        importedCount: 0,
        totalRows: preview.length,
        errors: [{ rowNumber: 0, field: "file", message: error.message }],
      });
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      if (!selectedFile) return;
      
      if (selectedFile.type !== "text/csv" && !selectedFile.name.endsWith(".csv")) {
        toast({ title: "Invalid file", description: "Please upload a CSV file", variant: "destructive" } as unknown as Parameters<typeof toast>[0])
        return
      }

      if (selectedFile.size > 5 * 1024 * 1024) {
        toast({ title: "File too large", description: "File size must be less than 5MB", variant: "destructive" } as unknown as Parameters<typeof toast>[0])
        return
      }

      setFile(selectedFile);
      parseCSV(selectedFile);
    }
  }, []);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
    },
    maxFiles: 1,
    onDragEnter: () => setDragActive(true),
    onDragLeave: () => setDragActive(false),
    onDropAccepted: () => setDragActive(false),
    onDropRejected: () => setDragActive(false),
  });

  const parseCSV = (csvFile: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      Papa.parse<CSVRow>(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results: Papa.ParseResult<CSVRow>) => {
          const parsedRows: ParsedRow[] = results.data.map((row: CSVRow, index: number) => {
            const errors: Array<{ field: string; message: string }> = [];

            if (!row.name || row.name.trim() === "") {
              errors.push({ field: "name", message: "Name is required" });
            } else if (row.name.length > 255) {
              errors.push({ field: "name", message: "Name must be less than 255 characters" });
            }

            if (!row.category || row.category.trim() === "") {
              errors.push({ field: "category", message: "Category is required" });
            } else if (row.category.length > 100) {
              errors.push({ field: "category", message: "Category must be less than 100 characters" });
            }

            if (!row.unit || row.unit.trim() === "") {
              errors.push({ field: "unit", message: "Unit is required" });
            } else if (row.unit.length > 50) {
              errors.push({ field: "unit", message: "Unit must be less than 50 characters" });
            }

            if (!row.price || row.price.trim() === "") {
              errors.push({ field: "price", message: "Price is required" });
            } else {
              const priceNum = parseFloat(row.price);
              if (isNaN(priceNum) || priceNum < 0) {
                errors.push({ field: "price", message: "Price must be a non-negative number" });
              }
            }

            if (row.barcode && row.barcode.length > 100) {
              errors.push({ field: "barcode", message: "Barcode must be less than 100 characters" });
            }

            return {
              rowNumber: index + 1,
              data: row,
              isValid: errors.length === 0,
              errors,
            };
          });

          setPreview(parsedRows);
        },
      });
    };
    reader.readAsText(csvFile);
  };

  const handleSubmit = () => {
    startTransition(() => {
      if (!file) {
        toast({ title: "No file selected", description: "Please select a file", variant: "destructive" } as unknown as Parameters<typeof toast>[0])
        return
      }

      const formData = new FormData()
      formData.append("file", file)
      importProducts(formData)
    })
  }

  const handleDownloadErrorReport = () => {
    if (!importResult || importResult.errors.length === 0) return;

    const csvContent = buildImportErrorReportCsv(importResult.errors);

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "import-errors.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const invalidRows = preview.filter((r) => !r.isValid);
  const validRows = preview.filter((r) => r.isValid);
  const importNeedsUpgrade = importResult?.errors.some((error) =>
    error.message.includes("Upgrade in Billing settings")
  ) ?? false;

  const handleClear = () => {
    setFile(null);
    setPreview([]);
    setImportResult(null);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Upload CSV File</h2>
        <p className="mb-4 text-sm text-gray-600">
          Your CSV file should contain columns: name, category, unit, price (required), and barcode (optional)
        </p>

        {importResult ? (
          <div className="rounded-lg border bg-gray-50 p-6">
            <div className="flex items-center gap-3">
              {importResult.success ? (
                <Icons.check className="h-6 w-6 text-green-600" />
              ) : (
                <Icons.x className="h-6 w-6 text-red-600" />
              )}
              <div>
                <h3 className="font-semibold">
                  {importResult.success ? "Import Completed" : "Import Failed"}
                </h3>
                <p className="text-sm text-gray-600">
                  Imported {importResult.importedCount} of {importResult.totalRows} rows
                </p>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="mt-4">
                {importNeedsUpgrade ? (
                  <Link
                    href="/settings/billing"
                    className="mb-3 inline-flex text-sm font-medium text-red-700 underline underline-offset-2"
                  >
                    Open Billing settings
                  </Link>
                ) : null}
                <button
                  onClick={handleDownloadErrorReport}
                  className="inline-flex items-center rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Icons.download className="mr-2 h-4 w-4" />
                  Download Error Report ({importResult.errors.length} errors)
                </button>
              </div>
            )}

            <button onClick={handleClear} className="mt-4 rounded border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50">
              Import Another File
            </button>
          </div>
        ) : (
          <div
            {...getRootProps()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
              dragActive
                ? "border-blue-500 bg-blue-50"
                : file
                  ? "border-green-500 bg-green-50"
                  : "border-gray-300 hover:border-gray-400"
            }`}
          >
            <input {...getInputProps()} />
            {file ? (
              <div className="text-center">
                <Icons.fileText className="mx-auto h-8 w-8 text-green-600" />
                <p className="mt-2 text-sm font-medium text-gray-900">{file.name}</p>
                <p className="text-xs text-gray-500">
                  {(file.size / 1024).toFixed(2)} KB
                </p>
              </div>
            ) : (
              <div className="text-center">
                <Icons.upload className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                <p className="mb-2 text-sm text-gray-600">
                  Drag and drop your CSV file here, or click to select
                </p>
                <p className="text-xs text-gray-500">CSV files up to 5MB</p>
              </div>
            )}
          </div>
        )}

        {preview.length > 0 && !importResult && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${validRows.length > 0 ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                  {validRows.length} valid
                </span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${invalidRows.length > 0 ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800"}`}>
                  {invalidRows.length} invalid
                </span>
              </div>
              <button onClick={handleClear} className="text-sm text-gray-500 hover:text-gray-700">
                Clear
              </button>
            </div>

            <div className="max-h-64 overflow-auto rounded-md border">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Row</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Category</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Unit</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Price</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Barcode</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {preview.slice(0, 50).map((row) => (
                    <tr key={row.rowNumber} className={row.isValid ? "" : "bg-red-50"}>
                      <td className="whitespace-nowrap px-3 py-2 text-sm font-medium text-gray-900">{row.rowNumber}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">{row.data.name || "-"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">{row.data.category || "-"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">{row.data.unit || "-"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">{row.data.price || "-"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">{row.data.barcode || "-"}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {row.isValid ? (
                          <Icons.check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Icons.alertTriangle className="h-4 w-4 text-red-600" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 50 && (
                <p className="p-4 text-center text-sm text-gray-500">
                  Showing 50 of {preview.length} rows
                </p>
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={isPending || invalidRows.length === preview.length}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {isPending ? (
                "Importing..."
              ) : invalidRows.length === preview.length ? (
                "All Rows Invalid"
              ) : (
                `Import ${validRows.length} Valid Rows`
              )}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">CSV Format Guide</h2>
        <p className="mb-4 text-sm text-gray-600">Required columns and validation rules</p>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Column</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Required</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Type</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Validation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              <tr>
                <td className="whitespace-nowrap px-3 py-2 text-sm font-medium text-gray-900">name</td>
                <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">Yes</td>
                <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">String</td>
                <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">Non-empty, max 255 chars</td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 text-sm font-medium text-gray-900">category</td>
                <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">Yes</td>
                <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">String</td>
                <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">Non-empty, max 100 chars</td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 text-sm font-medium text-gray-900">unit</td>
                <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">Yes</td>
                <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">String</td>
                <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">Non-empty, max 50 chars</td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 text-sm font-medium text-gray-900">price</td>
                <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">Yes</td>
                <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">Number</td>
                <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">&gt;= 0</td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2 text-sm font-medium text-gray-900">barcode</td>
                <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">No</td>
                <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">String</td>
                <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">Unique within tenant, max 100 chars</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-md bg-gray-50 p-4">
          <p className="mb-2 text-sm font-medium">Example CSV:</p>
          <pre className="overflow-x-auto text-xs">
            <code>
              {`name,category,unit,price,barcode
Flour,Bakery,kg,2.50,FLOUR-001
Sugar,Bakery,kg,1.80,SUGAR-001
Milk,Dairy,liter,1.20,MILK-001`}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}
