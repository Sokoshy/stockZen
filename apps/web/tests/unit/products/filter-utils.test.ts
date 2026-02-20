import { describe, expect, it } from "vitest";
import {
  matchesCategory,
  matchesSearch,
  matchesOnAlertFilter,
  isProductOnAlert,
  filterProducts,
  extractCategories,
  getFilterStateFromUrl,
  buildFilterUrlParams,
  resolveEffectiveThresholds,
} from "~/features/products/utils/filter-utils";
import type { ProductRow, ProductFilterState, TenantThresholds } from "~/features/products/utils/filter-utils";

const mockProduct = (overrides: Partial<ProductRow> = {}): ProductRow => ({
  id: "p1",
  tenantId: "t1",
  name: "Test Product",
  description: null,
  sku: null,
  category: "Baking",
  unit: "kg",
  barcode: "123456",
  price: 10,
  purchasePrice: 5,
  quantity: 50,
  lowStockThreshold: null,
  customCriticalThreshold: null,
  customAttentionThreshold: null,
  createdAt: "2026-02-15T10:00:00.000Z",
  updatedAt: "2026-02-15T10:00:00.000Z",
  syncStatus: "synced",
  alertLevel: null,
  hasActiveAlert: false,
  activeAlertUpdatedAt: null,
  ...overrides,
});

describe("matchesCategory", () => {
  it("returns true when no category filter is set", () => {
    const product = mockProduct({ category: "Baking" });
    expect(matchesCategory(product, null)).toBe(true);
    expect(matchesCategory(product, "")).toBe(true);
  });

  it("returns true when product matches category", () => {
    const product = mockProduct({ category: "Baking" });
    expect(matchesCategory(product, "Baking")).toBe(true);
  });

  it("returns false when product does not match category", () => {
    const product = mockProduct({ category: "Beverages" });
    expect(matchesCategory(product, "Baking")).toBe(false);
  });

  it("handles null category on product", () => {
    const product = mockProduct({ category: null });
    expect(matchesCategory(product, "Baking")).toBe(false);
    expect(matchesCategory(product, null)).toBe(true);
  });
});

describe("matchesSearch", () => {
  it("returns true when no search query", () => {
    const product = mockProduct({ name: "Flour" });
    expect(matchesSearch(product, "")).toBe(true);
  });

  it("matches product name (case insensitive)", () => {
    const product = mockProduct({ name: "All-Purpose Flour" });
    expect(matchesSearch(product, "flour")).toBe(true);
    expect(matchesSearch(product, "FLOUR")).toBe(true);
    expect(matchesSearch(product, "purpose")).toBe(true);
  });

  it("matches barcode (exact prefix)", () => {
    const product = mockProduct({ barcode: "123456789" });
    expect(matchesSearch(product, "123")).toBe(true);
    expect(matchesSearch(product, "123456")).toBe(true);
    expect(matchesSearch(product, "999")).toBe(false);
  });

  it("returns false when neither name nor barcode matches", () => {
    const product = mockProduct({ name: "Flour", barcode: "123456" });
    expect(matchesSearch(product, "sugar")).toBe(false);
  });

  it("handles null barcode", () => {
    const product = mockProduct({ name: "Flour", barcode: null });
    expect(matchesSearch(product, "flour")).toBe(true);
    expect(matchesSearch(product, "123")).toBe(false);
  });

  it("matches multi-term search (all terms must match)", () => {
    const product = mockProduct({ name: "All Purpose Flour" });
    expect(matchesSearch(product, "all flour")).toBe(true);
    expect(matchesSearch(product, "all wheat")).toBe(false);
  });
});

describe("isProductOnAlert", () => {
  it("returns false for products with sufficient stock", () => {
    const product = mockProduct({ quantity: 500, lowStockThreshold: null });
    // Using default threshold of 100
    expect(isProductOnAlert(product)).toBe(false);
  });

  it("returns true when quantity is below default threshold", () => {
    const product = mockProduct({ quantity: 50, lowStockThreshold: null });
    expect(isProductOnAlert(product)).toBe(true);
  });

  it("uses tenant default attention threshold when product threshold is not set", () => {
    const product = mockProduct({ quantity: 120, lowStockThreshold: null });
    expect(isProductOnAlert(product, 150)).toBe(true);
    expect(isProductOnAlert(product, 100)).toBe(false);
  });

  it("returns true when quantity is at or below 0", () => {
    const product = mockProduct({ quantity: 0, lowStockThreshold: null });
    expect(isProductOnAlert(product)).toBe(true);
  });

  it("uses custom thresholds when customCriticalThreshold and customAttentionThreshold are set", () => {
    const product = mockProduct({ 
      quantity: 30, 
      lowStockThreshold: null,
      customCriticalThreshold: 25,
      customAttentionThreshold: 50 
    });
    expect(isProductOnAlert(product)).toBe(true);
  });

  it("ignores lowStockThreshold when custom thresholds are set", () => {
    const product = mockProduct({ 
      quantity: 150, 
      lowStockThreshold: 200,
      customCriticalThreshold: 25,
      customAttentionThreshold: 50 
    });
    expect(isProductOnAlert(product)).toBe(false);
  });
});

describe("resolveEffectiveThresholds", () => {
  const defaultTenantThresholds: TenantThresholds = {
    defaultCriticalThreshold: 50,
    defaultAttentionThreshold: 100,
  };

  it("returns tenant defaults when product has no custom thresholds", () => {
    const product = mockProduct({ 
      customCriticalThreshold: null, 
      customAttentionThreshold: null 
    });
    const result = resolveEffectiveThresholds(product, defaultTenantThresholds);
    
    expect(result.mode).toBe("defaults");
    expect(result.criticalThreshold).toBe(50);
    expect(result.attentionThreshold).toBe(100);
  });

  it("returns custom thresholds when both are set", () => {
    const product = mockProduct({ 
      customCriticalThreshold: 25, 
      customAttentionThreshold: 75 
    });
    const result = resolveEffectiveThresholds(product, defaultTenantThresholds);
    
    expect(result.mode).toBe("custom");
    expect(result.criticalThreshold).toBe(25);
    expect(result.attentionThreshold).toBe(75);
  });

  it("returns defaults when only customCriticalThreshold is set", () => {
    const product = mockProduct({ 
      customCriticalThreshold: 25, 
      customAttentionThreshold: null 
    });
    const result = resolveEffectiveThresholds(product, defaultTenantThresholds);
    
    expect(result.mode).toBe("defaults");
    expect(result.criticalThreshold).toBe(50);
    expect(result.attentionThreshold).toBe(100);
  });

  it("returns defaults when only customAttentionThreshold is set", () => {
    const product = mockProduct({ 
      customCriticalThreshold: null, 
      customAttentionThreshold: 75 
    });
    const result = resolveEffectiveThresholds(product, defaultTenantThresholds);
    
    expect(result.mode).toBe("defaults");
  });

  it("uses default tenant thresholds when not provided", () => {
    const product = mockProduct({ 
      customCriticalThreshold: null, 
      customAttentionThreshold: null 
    });
    const result = resolveEffectiveThresholds(product);
    
    expect(result.mode).toBe("defaults");
    expect(result.criticalThreshold).toBe(50);
    expect(result.attentionThreshold).toBe(100);
  });

  it("falls back to defaults for invalid custom threshold values", () => {
    const product = mockProduct({ 
      customCriticalThreshold: 0, 
      customAttentionThreshold: 0 
    });
    const result = resolveEffectiveThresholds(product, defaultTenantThresholds);
    
    expect(result.mode).toBe("defaults");
    expect(result.criticalThreshold).toBe(50);
    expect(result.attentionThreshold).toBe(100);
  });
});

describe("matchesOnAlertFilter", () => {
  it("returns true when onAlert filter is disabled", () => {
    const product = mockProduct({ quantity: 500 });
    expect(matchesOnAlertFilter(product, false)).toBe(true);
  });

  it("returns true when product is on alert and filter is enabled", () => {
    const product = mockProduct({ quantity: 50 });
    expect(matchesOnAlertFilter(product, true)).toBe(true);
  });

  it("returns false when product is not on alert but filter is enabled", () => {
    const product = mockProduct({ quantity: 500 });
    expect(matchesOnAlertFilter(product, true)).toBe(false);
  });

  it("respects tenant default attention threshold in on-alert filtering", () => {
    const product = mockProduct({ quantity: 120, lowStockThreshold: null });
    expect(matchesOnAlertFilter(product, true, 150)).toBe(true);
    expect(matchesOnAlertFilter(product, true, 100)).toBe(false);
  });
});

describe("filterProducts", () => {
  it("filters products by all criteria", () => {
    const products = [
      mockProduct({ id: "p1", name: "Flour", category: "Baking", quantity: 50 }),
      mockProduct({ id: "p2", name: "Sugar", category: "Baking", quantity: 500 }),
      mockProduct({ id: "p3", name: "Coffee", category: "Beverages", quantity: 30 }),
    ];

    const filters: ProductFilterState = {
      category: "Baking",
      searchQuery: "",
      onAlert: true,
    };

    const result = filterProducts(products, filters);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("p1");
  });

  it("uses tenant default attention threshold when filtering on alert", () => {
    const products = [
      mockProduct({ id: "p1", name: "Flour", quantity: 130, lowStockThreshold: null }),
      mockProduct({ id: "p2", name: "Sugar", quantity: 80, lowStockThreshold: null }),
    ];

    const filters: ProductFilterState = {
      category: null,
      searchQuery: "",
      onAlert: true,
    };

    const withTenantDefault = filterProducts(products, filters, 150);
    const withLegacyDefault = filterProducts(products, filters);

    expect(withTenantDefault).toHaveLength(2);
    expect(withLegacyDefault).toHaveLength(1);
    expect(withLegacyDefault[0]?.id).toBe("p2");
  });

  it("returns all products when no filters applied", () => {
    const products = [
      mockProduct({ id: "p1", name: "Flour" }),
      mockProduct({ id: "p2", name: "Sugar" }),
    ];

    const filters: ProductFilterState = {
      category: null,
      searchQuery: "",
      onAlert: false,
    };

    const result = filterProducts(products, filters);
    expect(result).toHaveLength(2);
  });

  it("filters by search query only", () => {
    const products = [
      mockProduct({ id: "p1", name: "All Purpose Flour" }),
      mockProduct({ id: "p2", name: "Cake Flour" }),
      mockProduct({ id: "p3", name: "Sugar" }),
    ];

    const filters: ProductFilterState = {
      category: null,
      searchQuery: "flour",
      onAlert: false,
    };

    const result = filterProducts(products, filters);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id)).toContain("p1");
    expect(result.map((p) => p.id)).toContain("p2");
  });
});

describe("extractCategories", () => {
  it("extracts unique categories from products", () => {
    const products = [
      mockProduct({ id: "p1", category: "Baking" }),
      mockProduct({ id: "p2", category: "Beverages" }),
      mockProduct({ id: "p3", category: "Baking" }), // duplicate
      mockProduct({ id: "p4", category: null }),
    ];

    const categories = extractCategories(products);
    expect(categories).toEqual(["Baking", "Beverages"]);
  });

  it("returns empty array when no categories", () => {
    const products = [
      mockProduct({ id: "p1", category: null }),
      mockProduct({ id: "p2", category: null }),
    ];

    const categories = extractCategories(products);
    expect(categories).toEqual([]);
  });

  it("sorts categories alphabetically", () => {
    const products = [
      mockProduct({ id: "p1", category: "Zebra" }),
      mockProduct({ id: "p2", category: "Apple" }),
      mockProduct({ id: "p3", category: "Mango" }),
    ];

    const categories = extractCategories(products);
    expect(categories).toEqual(["Apple", "Mango", "Zebra"]);
  });
});

describe("getFilterStateFromUrl", () => {
  it("parses all filter params from URL", () => {
    const params = new URLSearchParams("?category=Baking&search=flour&onAlert=true");
    const state = getFilterStateFromUrl(params);

    expect(state).toEqual({
      category: "Baking",
      searchQuery: "flour",
      onAlert: true,
    });
  });

  it("handles missing params", () => {
    const params = new URLSearchParams("");
    const state = getFilterStateFromUrl(params);

    expect(state).toEqual({
      category: null,
      searchQuery: "",
      onAlert: false,
    });
  });

  it("handles partial params", () => {
    const params = new URLSearchParams("?category=Baking");
    const state = getFilterStateFromUrl(params);

    expect(state).toEqual({
      category: "Baking",
      searchQuery: "",
      onAlert: false,
    });
  });
});

describe("buildFilterUrlParams", () => {
  it("builds URL params from filter state", () => {
    const filters: ProductFilterState = {
      category: "Baking",
      searchQuery: "flour",
      onAlert: true,
    };

    const params = buildFilterUrlParams(filters);
    expect(params.get("category")).toBe("Baking");
    expect(params.get("search")).toBe("flour");
    expect(params.get("onAlert")).toBe("true");
  });

  it("omits empty filters", () => {
    const filters: ProductFilterState = {
      category: null,
      searchQuery: "",
      onAlert: false,
    };

    const params = buildFilterUrlParams(filters);
    expect(params.has("category")).toBe(false);
    expect(params.has("search")).toBe(false);
    expect(params.has("onAlert")).toBe(false);
  });
});
