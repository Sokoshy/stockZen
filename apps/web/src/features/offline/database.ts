import Dexie, { type EntityTable } from "dexie";

export interface LocalProduct {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  sku: string | null;
  category: string | null;
  unit: string | null;
  barcode: string | null;
  price: number;
  purchasePrice: number | null;
  quantity: number;
  lowStockThreshold: number | null;
  syncStatus: "pending" | "synced" | "failed";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface LocalStockMovement {
  id: string;
  tenantId: string;
  productId: string;
  type: "entry" | "exit";
  quantity: number;
  idempotencyKey: string;
  clientCreatedAt: string;
  serverCreatedAt: string | null;
  syncedAt: string | null;
  syncStatus: "pending" | "processing" | "synced" | "failed";
}

export interface OutboxOperation {
  id: string;
  operationId: string;
  operationType: "create" | "update" | "delete";
  entityType: "product" | "stockMovement";
  entityId: string;
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "completed" | "failed";
  retryCount: number;
  createdAt: string;
  processedAt: string | null;
  error: string | null;
}

const db = new Dexie("StockZenDB") as Dexie & {
  products: EntityTable<LocalProduct, "id">;
  stockMovements: EntityTable<LocalStockMovement, "id">;
  outbox: EntityTable<OutboxOperation, "id">;
};

db.version(1).stores({
  products: "id, tenantId, syncStatus, category, barcode, [tenantId+syncStatus]",
  outbox: "id, entityType, entityId, status, createdAt, [entityType+entityId]",
});

db.version(2).stores({
  products: "id, tenantId, syncStatus, category, barcode, [tenantId+syncStatus], deletedAt",
  outbox:
    "id, operationId, entityType, entityId, status, createdAt, [entityType+entityId], [entityType+operationId]",
});

db.version(3).stores({
  products: "id, tenantId, syncStatus, category, barcode, [tenantId+syncStatus], deletedAt",
  outbox:
    "id, operationId, entityType, entityId, status, createdAt, [entityType+entityId], [entityType+operationId]",
});

db.version(4).stores({
  products: "id, tenantId, syncStatus, category, barcode, [tenantId+syncStatus], deletedAt",
  stockMovements:
    "id, tenantId, productId, syncStatus, clientCreatedAt, [tenantId+syncStatus], [productId+clientCreatedAt]",
  outbox:
    "id, operationId, entityType, entityId, status, createdAt, [entityType+entityId], [entityType+operationId]",
});

export { db };

export async function getDatabase(): Promise<typeof db> {
  return db;
}
