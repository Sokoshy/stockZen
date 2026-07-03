"use client"

import { useState, useRef, useCallback } from "react"
import { deleteProductOffline, restoreProduct } from "~/features/offline/sync-pipeline"
import { api } from "~/trpc/react"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/dialog"
import { Button } from "~/components/ui/button"

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
      await restoreProduct(product.id, tenantId);
      setShowUndo(false);
      onRestored?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore product");
    }
  }, [onRestored, product.id]);

  const handleClose = () => {
    setError(null)
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current)
      undoTimeoutRef.current = null
    }
    setIsOpen(false)
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => open ? setIsOpen(true) : handleClose()}>
        {trigger ? (
          <DialogTrigger render={trigger as React.ReactElement} />
        ) : (
          <DialogTrigger render={<Button variant="destructive" size="sm">Delete</Button>} />
        )}
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete product</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{product.name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {product.syncStatus !== "synced" && (
            <p className="text-xs text-amber-700">
              This product has unsynced local changes. Deletion will be queued offline.
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter showCloseButton={false}>
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>

          {product.syncStatus === "synced" && (
            <div className="mt-2 flex items-center gap-2">
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
        </DialogContent>
      </Dialog>

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
  )
}
