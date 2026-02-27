import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "~/trpc/react";

interface ImportResult {
  success: boolean;
  importedCount: number;
  totalRows: number;
  errors: Array<{
    rowNumber: number;
    field: string;
    message: string;
  }>;
  errorReportUrl?: string;
}

interface UseImportProductsOptions {
  onSuccess?: (data: ImportResult) => void;
  onError?: (error: Error) => void;
}

export function useImportProducts(options?: UseImportProductsOptions) {
  const utils = api.useUtils();
  const [isPending, setIsPending] = useState(false);

  const mutation = useMutation({
    mutationFn: async (formData: FormData): Promise<ImportResult> => {
      const response = await fetch("/api/products/import", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null) as
          | { error?: string; message?: string }
          | null;
        const message = errorBody?.error ?? errorBody?.message ?? "Import failed";
        throw new Error(message);
      }

      return response.json();
    },
    onMutate: () => {
      setIsPending(true);
    },
    onSuccess: (data) => {
      setIsPending(false);
      void utils.products.list.invalidate();
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      setIsPending(false);
      options?.onError?.(error);
    },
  });

  return {
    mutate: mutation.mutate,
    isPending,
  };
}
