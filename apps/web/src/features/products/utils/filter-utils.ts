export interface ProductFilterState {
  category: string | null;
  searchQuery: string;
  onAlert: boolean;
}

export interface ProductRow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  sku: string | null;
  category: string | null;
  unit: string | null;
  barcode: string | null;
  price: number;
  purchasePrice?: number | null;
  quantity: number;
  lowStockThreshold: number | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: "pending" | "synced" | "failed";
}

const DEFAULT_LOW_STOCK_THRESHOLD = 100;

export function isProductOnAlert(product: ProductRow): boolean {
  const threshold = product.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
  return product.quantity <= threshold;
}

export function matchesCategory(product: ProductRow, category: string | null): boolean {
  if (!category) return true;
  return product.category === category;
}

export function matchesSearch(product: ProductRow, query: string): boolean {
  if (!query.trim()) return true;

  const normalizedQuery = query.toLowerCase().trim();

  if (product.barcode) {
    const barcodeLower = product.barcode.toLowerCase();
    if (barcodeLower.startsWith(normalizedQuery)) {
      return true;
    }
  }

  const nameLower = product.name.toLowerCase();
  const searchTerms = normalizedQuery.split(/\s+/);

  if (searchTerms.length === 1) {
    return nameLower.includes(normalizedQuery);
  }

  return searchTerms.every((term) => nameLower.includes(term));
}

export function matchesOnAlertFilter(product: ProductRow, onAlert: boolean): boolean {
  if (!onAlert) return true;
  return isProductOnAlert(product);
}

export function filterProducts(
  products: ProductRow[],
  filters: ProductFilterState
): ProductRow[] {
  return products.filter((product) => {
    if (!matchesCategory(product, filters.category)) return false;
    if (!matchesSearch(product, filters.searchQuery)) return false;
    if (!matchesOnAlertFilter(product, filters.onAlert)) return false;
    return true;
  });
}

export function extractCategories(products: ProductRow[]): string[] {
  const categorySet = new Set<string>();

  for (const product of products) {
    if (product.category) {
      categorySet.add(product.category);
    }
  }

  return Array.from(categorySet).sort();
}

export function getFilterStateFromUrl(searchParams: URLSearchParams): ProductFilterState {
  const category = searchParams.get("category");
  const searchQuery = searchParams.get("search") ?? "";
  const onAlert = searchParams.get("onAlert") === "true";

  return {
    category: category || null,
    searchQuery,
    onAlert,
  };
}

export function buildFilterUrlParams(filters: ProductFilterState): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.category) {
    params.set("category", filters.category);
  }
  if (filters.searchQuery) {
    params.set("search", filters.searchQuery);
  }
  if (filters.onAlert) {
    params.set("onAlert", "true");
  }

  return params;
}
