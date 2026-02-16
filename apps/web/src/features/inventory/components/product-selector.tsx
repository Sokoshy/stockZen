"use client";

import { useState, useMemo } from "react";

interface Product {
  id: string;
  name: string;
  category: string | null;
}

interface ProductSelectorProps {
  products: Product[];
  recentProducts: Product[];
  selectedProductId: string;
  onSelect: (productId: string) => void;
  error?: string;
}

export function ProductSelector({
  products,
  recentProducts,
  selectedProductId,
  onSelect,
  error,
}: ProductSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const query = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.category && p.category.toLowerCase().includes(query))
    );
  }, [products, searchQuery]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [products, selectedProductId]
  );

  if (selectedProduct) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between p-3 border rounded-md bg-blue-50">
          <div>
            <p className="font-medium">{selectedProduct.name}</p>
            {selectedProduct.category && (
              <p className="text-sm text-gray-500">{selectedProduct.category}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onSelect("")}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search Input */}
      <input
        type="text"
        placeholder="Search products..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full px-3 py-2 border rounded-md"
        autoFocus
      />

      {/* Recent Products Quick Select */}
      {!searchQuery && recentProducts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Recent</p>
          <div className="grid grid-cols-1 gap-2">
            {recentProducts.slice(0, 5).map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => onSelect(product.id)}
                className="flex items-center justify-between p-3 border rounded-md hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
              >
                <div>
                  <p className="font-medium">{product.name}</p>
                  {product.category && (
                    <p className="text-sm text-gray-500">{product.category}</p>
                  )}
                </div>
                <span className="text-gray-400">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* All Products or Search Results */}
      {(searchQuery || showAll) && (
        <div className="space-y-2 max-h-64 overflow-y-auto border rounded-md">
          {filteredProducts.length === 0 ? (
            <p className="p-3 text-sm text-gray-500 text-center">
              No products found
            </p>
          ) : (
            filteredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => onSelect(product.id)}
                className="w-full flex items-center justify-between p-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left border-b last:border-b-0"
              >
                <div>
                  <p className="font-medium">{product.name}</p>
                  {product.category && (
                    <p className="text-sm text-gray-500">{product.category}</p>
                  )}
                </div>
                <span className="text-gray-400">→</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Show All Button */}
      {!searchQuery && !showAll && products.length > 5 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full py-2 text-sm text-blue-600 hover:text-blue-800"
        >
          Show all products ({products.length})
        </button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
