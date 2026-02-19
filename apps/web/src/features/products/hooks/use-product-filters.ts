"use client";

import { useCallback, useMemo, useState, useEffect, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { ProductFilterState } from "../utils/filter-utils";
import {
  filterProducts,
  extractCategories,
  getFilterStateFromUrl,
  buildFilterUrlParams,
} from "../utils/filter-utils";
import type { ProductRow } from "../utils/filter-utils";

const DEBOUNCE_DELAY = 300;

export interface UseProductFiltersResult {
  filters: ProductFilterState;
  filteredProducts: ProductRow[];
  availableCategories: string[];
  isPending: boolean;
  setCategory: (category: string | null) => void;
  setSearchQuery: (query: string) => void;
  setOnAlert: (onAlert: boolean) => void;
  clearFilters: () => void;
}

export function useProductFilters(
  products: ProductRow[],
  tenantDefaultAttentionThreshold?: number
): UseProductFiltersResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get("search") ?? "");

  const urlFilters = useMemo(() => getFilterStateFromUrl(searchParams), [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, DEBOUNCE_DELAY);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const filters: ProductFilterState = useMemo(() => {
    return {
      category: urlFilters.category,
      searchQuery: debouncedSearch,
      onAlert: urlFilters.onAlert,
    };
  }, [urlFilters.category, urlFilters.onAlert, debouncedSearch]);

  const filteredProducts = useMemo(() => {
    return filterProducts(products, filters, tenantDefaultAttentionThreshold);
  }, [products, filters, tenantDefaultAttentionThreshold]);

  const availableCategories = useMemo(() => {
    return extractCategories(products);
  }, [products]);

  const updateUrl = useCallback(
    (newFilters: ProductFilterState) => {
      const params = buildFilterUrlParams(newFilters);
      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;

      startTransition(() => {
        router.push(newUrl, { scroll: false });
      });
    },
    [pathname, router]
  );

  const setCategory = useCallback(
    (category: string | null) => {
      updateUrl({ ...urlFilters, searchQuery: debouncedSearch, category });
    },
    [urlFilters, debouncedSearch, updateUrl]
  );

  const setSearchQuery = useCallback(
    (query: string) => {
      setSearchInput(query);
    },
    []
  );

  const setOnAlert = useCallback(
    (onAlert: boolean) => {
      updateUrl({ ...urlFilters, searchQuery: debouncedSearch, onAlert });
    },
    [urlFilters, debouncedSearch, updateUrl]
  );

  const clearFilters = useCallback(() => {
    setSearchInput("");
    setDebouncedSearch("");
    updateUrl({
      category: null,
      searchQuery: "",
      onAlert: false,
    });
  }, [updateUrl]);

  useEffect(() => {
    setSearchInput(urlFilters.searchQuery);
    setDebouncedSearch(urlFilters.searchQuery);
  }, [urlFilters.searchQuery]);

  useEffect(() => {
    if (debouncedSearch === urlFilters.searchQuery) {
      return;
    }

    updateUrl({ ...urlFilters, searchQuery: debouncedSearch });
  }, [debouncedSearch, urlFilters, updateUrl]);

  return {
    filters,
    filteredProducts,
    availableCategories,
    isPending,
    setCategory,
    setSearchQuery,
    setOnAlert,
    clearFilters,
  };
}
