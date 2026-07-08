import { describe, expect, it } from "vitest";

import {
  buildFilterUrlParams,
  filterProducts,
  getFilterStateFromUrl,
  type ProductRow,
} from "~/features/products/utils/filter-utils";

function makeProduct(overrides: Partial<ProductRow>): ProductRow {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    tenantId: overrides.tenantId ?? "00000000-0000-0000-0000-000000000001",
    name: overrides.name ?? "Product",
    description: overrides.description ?? null,
    sku: overrides.sku ?? null,
    category: overrides.category ?? null,
    unit: overrides.unit ?? "pcs",
    barcode: overrides.barcode ?? null,
    price: overrides.price ?? 1,
    purchasePrice: overrides.purchasePrice,
    quantity: overrides.quantity ?? 0,
    lowStockThreshold: overrides.lowStockThreshold ?? null,
    customCriticalThreshold: overrides.customCriticalThreshold ?? null,
    customAttentionThreshold: overrides.customAttentionThreshold ?? null,
    createdAt: overrides.createdAt ?? "2026-02-16T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-02-16T00:00:00.000Z",
    syncStatus: overrides.syncStatus ?? "synced",
    alertLevel: overrides.alertLevel ?? null,
    hasActiveAlert: overrides.hasActiveAlert ?? false,
    activeAlertUpdatedAt: overrides.activeAlertUpdatedAt ?? null,
  };
}

describe("E2E - Product filters flow", () => {
  const products: ProductRow[] = [
    makeProduct({
      id: "p1",
      name: "Flour T55",
      category: "Baking",
      barcode: "FLOUR-001",
      quantity: 60,
      lowStockThreshold: 100,
    }),
    makeProduct({
      id: "p2",
      name: "Flour T45",
      category: "Baking",
      barcode: "FLOUR-002",
      quantity: 180,
      lowStockThreshold: 100,
    }),
    makeProduct({
      id: "p3",
      name: "Espresso Beans",
      category: "Beverages",
      barcode: "COFFEE-001",
      quantity: 40,
      lowStockThreshold: 35,
    }),
  ];

  it("persists filters in URL and restores exact filtered list", () => {
    const selectedFilters = {
      category: "Baking",
      searchQuery: "flour-00",
      onAlert: true,
    };

    const params = buildFilterUrlParams(selectedFilters);
    expect(params.toString()).toBe("category=Baking&search=flour-00&onAlert=true");

    const restoredFilters = getFilterStateFromUrl(params);
    expect(restoredFilters).toEqual(selectedFilters);

    const filtered = filterProducts(products, restoredFilters);
    expect(filtered.map((product) => product.id)).toEqual(["p1"]);
  });

  it("clears filters and returns full list again", () => {
    const clearedParams = buildFilterUrlParams({
      category: null,
      searchQuery: "",
      onAlert: false,
    });

    expect(clearedParams.toString()).toBe("");

    const clearedFilters = getFilterStateFromUrl(clearedParams);
    const filtered = filterProducts(products, clearedFilters);
    expect(filtered.map((product) => product.id)).toEqual(["p1", "p2", "p3"]);
  });
});
