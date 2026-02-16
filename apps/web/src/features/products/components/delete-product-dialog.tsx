"use client";

import React, { useState, useRef, useCallback } from "react";
import { deleteProductOffline, restoreProduct } from "~/features/offline/product-operations";
import { api } from "~/trpc/react";

type DeleteProductDialogProps = {
  product: {
    id: string;
    name: string;
    syncStatus: "pending" | "synced" | "failed";
  };
  tenantId: string;
  onDeleted: () => void;
  onRestored?: () => void;
  trigger?: React.ReactNode;
};

export function DeleteProductDialog({
  product,
  tenantId,
  onDeleted,
  onRestored,
  trigger,
}: DeleteProductDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showUndo, setShowUndo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const deleteMutation = api.products.delete.useMutation({
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const shouldDeleteOffline = isOffline || product.syncStatus !== "synced";

      if (shouldDeleteOffline) {
        await deleteProductOffline({
          id: product.id,
          tenantId,
          originalProductName: product.name,
        });
        setShowUndo(true);

        undoTimeoutRef.current = setTimeout(() => {
          setShowUndo(false);
        }, 5000);

        setIsOpen(false);
        setIsDeleting(false);
        onDeleted();
      } else {
        await deleteMutation.mutateAsync({ id: product.id });
        setIsOpen(false);
        setIsDeleting(false);
        onDeleted();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete product");
      setIsDeleting(false);
    }
  };

  const handleUndo = useCallback(async () => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }

    try {
      await restoreProduct(product.id);
      setShowUndo(false);
      onRestored?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore product");
    }
  }, [onRestored, product.id]);

  const handleClose = () => {
    setIsOpen(false);
    setError(null);
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
  };

  return (
    <>
      {trigger ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            setError(null);
            setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              setError(null);
              setIsOpen(true);
            }
          }}
        >
          {trigger}
        </div>
      ) : (
        <button
          type="button"
          className="rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
          onClick={() => {
            setError(null);
            setIsOpen(true);
          }}
        >
          Delete
        </button>
      )}

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-gray-900">Delete product</h3>
            <p className="mt-2 text-sm text-gray-700">
              Are you sure you want to delete <strong>{product.name}</strong>? This action cannot be undone.
            </p>

            {product.syncStatus !== "synced" ? (
              <p className="mt-2 text-xs text-amber-700">
                This product has unsynced local changes. Deletion will be queued offline.
              </p>
            ) : null}

            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                onClick={handleClose}
              >
                Cancel
              </button>

              <button
                type="button"
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-300"
                disabled={isDeleting}
                onClick={handleDelete}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>

            {product.syncStatus === "synced" && (
              <div className="mt-4 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="offline-delete"
                  checked={isOffline}
                  onChange={(e) => setIsOffline(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="offline-delete" className="text-sm text-gray-600">
                  Save offline (no server sync)
                </label>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {showUndo && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-3 text-white shadow-lg">
          <div className="flex items-center gap-3">
            <span className="text-sm">Product &quot;{product.name}&quot; deleted.</span>
            <button
              type="button"
              className="text-sm font-medium text-blue-300 hover:text-blue-200"
              onClick={handleUndo}
            >
              Undo
            </button>
          </div>
        </div>
      )}
    </>
  );
}
