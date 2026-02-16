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
    deletedAt: null,
  };

  await db.transaction("rw", db.products, db.outbox, async () => {
    await db.products.add(localProduct);

    await enqueueOperation({
      operationId,
      operationType: "create",
      entityType: "product",
      entityId: localId,
      payload: {
        operationId,
        tenantId: input.tenantId,
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
  });

  return localProduct;
}

export async function getLocalProducts(tenantId: string): Promise<LocalProduct[]> {
  return db.products
    .where("tenantId")
    .equals(tenantId)
    .and((p) => !p.deletedAt)
    .toArray();
}

export async function getAllLocalProducts(tenantId: string): Promise<LocalProduct[]> {
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

export interface UpdateProductOfflineInput {
  id: string;
  tenantId: string;
  name?: string;
  description?: string | null;
  sku?: string | null;
  category?: string;
  unit?: string;
  barcode?: string | null;
  price?: number;
  purchasePrice?: number | null;
  lowStockThreshold?: number | null;
}

export async function updateProductOffline(input: UpdateProductOfflineInput): Promise<LocalProduct> {
  const now = new Date().toISOString();
  const operationId = crypto.randomUUID();

  const existingProduct = await db.products.get(input.id);
  if (!existingProduct) {
    throw new Error("Product not found in local database");
  }

  if (existingProduct.tenantId !== input.tenantId) {
    throw new Error("Product does not belong to the provided tenant");
  }

  const updatedProduct: LocalProduct = {
    ...existingProduct,
    name: input.name ?? existingProduct.name,
    description: input.description !== undefined ? input.description : existingProduct.description,
    sku: input.sku !== undefined ? input.sku : existingProduct.sku,
    category: input.category ?? existingProduct.category,
    unit: input.unit ?? existingProduct.unit,
    barcode: input.barcode !== undefined ? input.barcode : existingProduct.barcode,
    price: input.price ?? existingProduct.price,
    purchasePrice: input.purchasePrice !== undefined ? input.purchasePrice : existingProduct.purchasePrice,
    lowStockThreshold: input.lowStockThreshold !== undefined ? input.lowStockThreshold : existingProduct.lowStockThreshold,
    syncStatus: "pending",
    updatedAt: now,
  };

  await db.transaction("rw", db.products, db.outbox, async () => {
    await db.products.put(updatedProduct);

    await enqueueOperation({
      operationId,
      operationType: "update",
      entityType: "product",
      entityId: input.id,
      payload: {
        operationId,
        tenantId: input.tenantId,
        originalProduct: {
          id: existingProduct.id,
          name: existingProduct.name,
          description: existingProduct.description,
          sku: existingProduct.sku,
          category: existingProduct.category,
          unit: existingProduct.unit,
          barcode: existingProduct.barcode,
          price: existingProduct.price,
          purchasePrice: existingProduct.purchasePrice,
          lowStockThreshold: existingProduct.lowStockThreshold,
        },
        updatedFields: {
          name: input.name,
          description: input.description,
          sku: input.sku,
          category: input.category,
          unit: input.unit,
          barcode: input.barcode,
          price: input.price,
          purchasePrice: input.purchasePrice,
          lowStockThreshold: input.lowStockThreshold,
        },
      },
    });
  });

  return updatedProduct;
}

export interface DeleteProductOfflineInput {
  id: string;
  tenantId: string;
  originalProductName: string;
}

export async function deleteProductOffline(input: DeleteProductOfflineInput): Promise<void> {
  const now = new Date().toISOString();
  const operationId = crypto.randomUUID();

  const existingProduct = await db.products.get(input.id);
  if (!existingProduct) {
    throw new Error("Product not found in local database");
  }

  if (existingProduct.tenantId !== input.tenantId) {
    throw new Error("Product does not belong to the provided tenant");
  }

  await db.transaction("rw", db.products, db.outbox, async () => {
    await db.products.update(input.id, {
      deletedAt: now,
      syncStatus: "pending",
      updatedAt: now,
    });

    await enqueueOperation({
      operationId,
      operationType: "delete",
      entityType: "product",
      entityId: input.id,
      payload: {
        operationId,
        tenantId: input.tenantId,
        productId: input.id,
        originalProductName: input.originalProductName,
      },
    });
  });
}

export async function restoreProduct(productId: string): Promise<void> {
  const now = new Date().toISOString();

  const existingProduct = await db.products.get(productId);
  if (!existingProduct) {
    throw new Error("Product not found in local database");
  }

  await db.products.update(productId, {
    deletedAt: null,
    updatedAt: now,
  });

  const pendingDeleteOps = await db.outbox
    .where("entityId")
    .equals(productId)
    .and((op) => op.operationType === "delete" && op.status === "pending")
    .toArray();

  for (const op of pendingDeleteOps) {
    await db.outbox.delete(op.id);
  }
}

export async function permanentlyDeleteLocalProduct(productId: string): Promise<void> {
  await db.products.delete(productId);
}
