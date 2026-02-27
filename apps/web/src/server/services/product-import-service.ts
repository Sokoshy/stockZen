import Papa from "papaparse";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { products, tenants } from "~/server/db/schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "~/server/db/schema";

type DBClient = PostgresJsDatabase<typeof schema>;

interface ImportCSVOptions {
  file: File;
  ctx: { db: DBClient };
  tenantId: string;
  userId: string;
  role: "Admin" | "Manager" | "Operator";
}

type CSVRow = Record<string, string | undefined>;

interface ImportError {
  rowNumber: number;
  field: string;
  message: string;
}

interface ImportCSVResult {
  success: boolean;
  importedCount: number;
  totalRows: number;
  errors: ImportError[];
  errorReportUrl?: string;
}

export const productImportSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  category: z.string().trim().min(1, "Category is required").max(100),
  unit: z.string().trim().min(1, "Unit is required").max(50),
  price: z
    .string()
    .trim()
    .min(1, "Price is required")
    .refine((val) => {
      const num = Number(val);
      return Number.isFinite(num) && num >= 0;
    }, { message: "Price must be a non-negative number" }),
  barcode: z
    .string()
    .trim()
    .max(100)
    .optional()
    .or(z.literal(""))
    .transform((val) => val || undefined),
});

function normalizeBarcode(barcode: string | undefined): string | undefined {
  const normalized = barcode?.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized;
}

export function findDuplicateBarcodesInRows(rows: CSVRow[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const row of rows) {
    const barcode = normalizeBarcode(row.barcode);
    if (!barcode) {
      continue;
    }

    if (seen.has(barcode)) {
      duplicates.add(barcode);
      continue;
    }

    seen.add(barcode);
  }

  return duplicates;
}

async function checkDuplicateBarcodes(
  db: DBClient,
  tenantId: string,
  barcodes: string[]
): Promise<Set<string>> {
  if (barcodes.length === 0) return new Set();

  const existing = await db
    .select({ barcode: products.barcode })
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        inArray(products.barcode, barcodes),
        isNull(products.deletedAt)
      )
    );

  return new Set(existing.map((p) => p.barcode).filter((b): b is string => b !== null));
}

export async function importCSVHandler({
  file,
  ctx,
  tenantId,
  userId,
  role,
}: ImportCSVOptions): Promise<ImportCSVResult> {
  const errors: ImportError[] = [];
  const validRows: Array<z.infer<typeof productImportSchema>> = [];

  const fileText = await file.text();

  const parseResult = Papa.parse(fileText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
    return {
      success: false,
      importedCount: 0,
      totalRows: 0,
      errors: parseResult.errors.map((e) => ({
        rowNumber: e.row || 0,
        field: "file",
        message: e.message,
      })),
    };
  }

  const requiredColumns = ["name", "category", "unit", "price"];
  const missingColumns = requiredColumns.filter((col) => !parseResult.meta.fields?.includes(col));

  if (missingColumns.length > 0) {
    return {
      success: false,
      importedCount: 0,
      totalRows: 0,
      errors: [
        {
          rowNumber: 0,
          field: "columns",
          message: `Missing required columns: ${missingColumns.join(", ")}`,
        },
      ],
    };
  }

  const dataRows = parseResult.data as CSVRow[];

  const duplicateBarcodesInCsv = findDuplicateBarcodesInRows(dataRows);

  const barcodesToCheck = Array.from(
    new Set(
      dataRows
        .map((row) => normalizeBarcode(row.barcode))
        .filter((barcode): barcode is string => Boolean(barcode))
    )
  );

  const duplicateBarcodes = await checkDuplicateBarcodes(ctx.db, tenantId, barcodesToCheck);

  dataRows.forEach((row, index) => {
    const rowNumber = index + 2;

    try {
      const validated = productImportSchema.parse(row);

      if (validated.barcode && duplicateBarcodesInCsv.has(validated.barcode)) {
        errors.push({
          rowNumber,
          field: "barcode",
          message: `Barcode "${validated.barcode}" appears multiple times in CSV`,
        });
        return;
      }

      if (validated.barcode && duplicateBarcodes.has(validated.barcode)) {
        errors.push({
          rowNumber,
          field: "barcode",
          message: `Barcode "${validated.barcode}" already exists in tenant`,
        });
        return;
      }

      validRows.push(validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        error.errors.forEach((e) => {
          errors.push({
            rowNumber,
            field: e.path[0] as string,
            message: e.message,
          });
        });
      } else {
        errors.push({
          rowNumber,
          field: "validation",
          message: error instanceof Error ? error.message : "Invalid row data",
        });
      }
    }
  });

  if (validRows.length === 0) {
    return {
      success: false,
      importedCount: 0,
      totalRows: dataRows.length,
      errors,
    };
  }

  try {
    const tenant = await ctx.db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: {
        defaultCriticalThreshold: true,
        defaultAttentionThreshold: true,
      },
    });

    const insertRows = validRows.map((row) => ({
      tenantId,
      name: row.name,
      category: row.category,
      unit: row.unit,
      price: row.price,
      barcode: row.barcode || null,
      quantity: 0,
      purchasePrice: null,
      description: null,
      sku: null,
      lowStockThreshold: null,
      customCriticalThreshold: tenant?.defaultCriticalThreshold ?? null,
      customAttentionThreshold: tenant?.defaultAttentionThreshold ?? null,
    }));

    const inserted = await ctx.db.insert(products).values(insertRows).returning();

    return {
      success: true,
      importedCount: inserted.length,
      totalRows: dataRows.length,
      errors,
    };
  } catch (error) {
    throw new Error(`Database error: ${error instanceof Error ? error.message : "Failed to insert products"}`);
  }
}
