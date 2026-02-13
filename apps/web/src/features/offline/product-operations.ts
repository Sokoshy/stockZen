import { db, type LocalProduct } from "./database";
import { enqueueOperation } from "./outbox";

export interface CreateProductOfflineInput {
  tenantId: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  category: string;
  unit: string;
  barcode?: string | null;
  price: number;
  purchasePrice?: number | null;
  quantity?: number;
  lowStockThreshold?: number | null;
}

export async function createProductOffline(input: CreateProductOfflineInput): Promise<LocalProduct> {
  const now = new Date().toISOString();
  const localId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const localProduct: LocalProduct = {
    id: localId,
    tenantId: input.tenantId,
    name: input.name,
    description: input.description ?? null,
    sku: input.sku ?? null,
    category: input.category,
    unit: input.unit,
    barcode: input.barcode ?? null,
    price: input.price,
    purchasePrice: input.purchasePrice ?? null,
    quantity: input.quantity ?? 0,
    lowStockThreshold: input.lowStockThreshold ?? null,
    syncStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };

  await db.products.add(localProduct);

  await enqueueOperation({
    operationId,
    operationType: "create",
    entityType: "product",
    entityId: localId,
    payload: {
      operationId,
      name: input.name,
      description: input.description,
      sku: input.sku,
      category: input.category,
      unit: input.unit,
      barcode: input.barcode,
      price: input.price,
      purchasePrice: input.purchasePrice,
      quantity: input.quantity ?? 0,
      lowStockThreshold: input.lowStockThreshold,
    },
  });

  return localProduct;
}

export async function getLocalProducts(tenantId: string): Promise<LocalProduct[]> {
  return db.products.where("tenantId").equals(tenantId).toArray();
}

export async function getLocalProductById(
  productId: string,
  tenantId: string
): Promise<LocalProduct | undefined> {
  return db.products
    .where("id")
    .equals(productId)
    .and((p) => p.tenantId === tenantId)
    .first();
}

export async function getPendingSyncProducts(tenantId: string): Promise<LocalProduct[]> {
  return db.products
    .where("tenantId")
    .equals(tenantId)
    .and((p) => p.syncStatus === "pending")
    .toArray();
}

export async function updateProductSyncStatus(
  productId: string,
  status: "pending" | "synced" | "failed"
): Promise<void> {
  await db.products.update(productId, {
    syncStatus: status,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteLocalProduct(productId: string): Promise<void> {
  await db.products.delete(productId);
}
