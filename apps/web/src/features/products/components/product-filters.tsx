"use client";

import { useCallback } from "react";
import type { ProductFilterState } from "../utils/filter-utils";

interface ProductFiltersProps {
  filters: ProductFilterState;
  availableCategories: string[];
  onCategoryChange: (category: string | null) => void;
  onSearchChange: (query: string) => void;
  onOnAlertChange: (onAlert: boolean) => void;
  onClear: () => void;
  isPending: boolean;
  resultCount: number;
  totalCount: number;
}

export function ProductFilters({
  filters,
  availableCategories,
  onCategoryChange,
  onSearchChange,
  onOnAlertChange,
  onClear,
  isPending,
  resultCount,
  totalCount,
}: ProductFiltersProps) {
  const hasActiveFilters =
    filters.category !== null || filters.searchQuery !== "" || filters.onAlert;

  const handleCategoryChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      onCategoryChange(value === "" ? null : value);
    },
    [onCategoryChange]
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSearchChange(e.target.value);
    },
    [onSearchChange]
  );

  const handleOnAlertChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onOnAlertChange(e.target.checked);
    },
    [onOnAlertChange]
  );

  const handleClear = useCallback(() => {
    onClear();
  }, [onClear]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex min-w-[180px] flex-1 items-center gap-2 sm:min-w-[200px]">
          <label htmlFor="search" className="whitespace-nowrap text-sm font-medium text-gray-700">
            Search:
          </label>
          <input
            type="text"
            id="search"
            placeholder="Name or barcode..."
            value={filters.searchQuery}
            onChange={handleSearchChange}
            className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex min-w-[180px] flex-1 items-center gap-2 sm:min-w-[200px]">
          <label htmlFor="category" className="whitespace-nowrap text-sm font-medium text-gray-700">
            Category:
          </label>
          <select
            id="category"
            value={filters.category ?? ""}
            onChange={handleCategoryChange}
            className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All Categories</option>
            {availableCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="onAlert" className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              id="onAlert"
              checked={filters.onAlert}
              onChange={handleOnAlertChange}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="font-medium text-gray-700">On Alert</span>
          </label>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Clear Filters
          </button>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          {isPending ? "Filtering..." : `Showing ${resultCount} of ${totalCount} products`}
        </span>
        {hasActiveFilters && resultCount === 0 && (
          <span className="text-amber-600">No products match your filters.</span>
        )}
      </div>
    </div>
  );
}
