"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { api } from "~/trpc/react";
import {
  getMovementsByProduct as getLocalMovements,
} from "~/features/offline/movement-operations";

export type SyncStatus = "pending" | "synced" | "failed" | "processing";

export interface MovementItem {
  id: string;
  type: "entry" | "exit";
  quantity: number;
  createdAt: string;
  syncStatus: SyncStatus;
  source: "server" | "local";
}

interface UseStockMovementsOptions {
  productId: string;
  tenantId: string;
  pageSize?: number;
}

interface UseStockMovementsReturn {
  movements: MovementItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
  isEmpty: boolean;
}

function mergeMovements(
  serverMovements: MovementItem[],
  localMovements: MovementItem[]
): MovementItem[] {
  const seenIds = new Set<string>();
  const merged: MovementItem[] = [];

  const allMovements = [...localMovements, ...serverMovements];

  allMovements.sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    if (timeA !== timeB) {
      return timeB - timeA;
    }
    return b.id.localeCompare(a.id);
  });

  for (const movement of allMovements) {
    if (!seenIds.has(movement.id)) {
      seenIds.add(movement.id);
      merged.push(movement);
    }
  }

  return merged;
}

export function useStockMovements({
  productId,
  tenantId,
  pageSize = 20,
}: UseStockMovementsOptions): UseStockMovementsReturn {
  const [serverMovements, setServerMovements] = useState<MovementItem[]>([]);
  const [localMovements, setLocalMovements] = useState<MovementItem[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingInitialRef = useRef(true);

  const {
    data: serverData,
    isLoading,
    isError,
    refetch,
  } = api.stockMovements.listByProduct.useQuery(
    { productId, limit: pageSize, cursor },
    { enabled: !!productId }
  );

  useEffect(() => {
    isLoadingInitialRef.current = true;
    setServerMovements([]);
    setCursor(undefined);
    setNextCursor(undefined);
    setHasMore(true);
    setIsLoadingMore(false);
  }, [productId]);

  useEffect(() => {
    let cancelled = false;

    const loadLocalMovements = async () => {
      try {
        const local = await getLocalMovements({
          productId,
          tenantId,
        });
        if (!cancelled) {
          const mapped: MovementItem[] = local.map((m) => ({
            id: m.id,
            type: m.type,
            quantity: m.quantity,
            createdAt: m.clientCreatedAt,
            syncStatus: m.syncStatus,
            source: "local" as const,
          }));
          setLocalMovements(mapped);
        }
      } catch {
        if (!cancelled) {
          setLocalMovements([]);
        }
      }
    };

    void loadLocalMovements();

    const interval = setInterval(loadLocalMovements, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [productId, tenantId]);

  useEffect(() => {
    if (serverData) {
      const serverPageMovements: MovementItem[] = serverData.movements.map((m) => ({
        id: m.id,
        type: m.type,
        quantity: m.quantity,
        createdAt: m.createdAt.toISOString(),
        syncStatus: "synced" as SyncStatus,
        source: "server" as const,
      }));

      setServerMovements((previousServerMovements) => {
        if (isLoadingInitialRef.current || !cursor) {
          return serverPageMovements;
        }

        const existingIds = new Set(previousServerMovements.map((movement) => movement.id));
        const newMovements = serverPageMovements.filter((movement) => !existingIds.has(movement.id));

        return [...previousServerMovements, ...newMovements];
      });

      setNextCursor(serverData.nextCursor);
      setHasMore(Boolean(serverData.nextCursor));
      setIsLoadingMore(false);
      isLoadingInitialRef.current = false;
    }
  }, [serverData, cursor]);

  useEffect(() => {
    if (isError) {
      setIsLoadingMore(false);
    }
  }, [isError]);

  const movements = useMemo(
    () => mergeMovements(serverMovements, localMovements),
    [serverMovements, localMovements]
  );

  const loadMore = useCallback(() => {
    if (hasMore && !isLoadingMore && !isLoading && nextCursor) {
      setIsLoadingMore(true);
      setCursor(nextCursor);
    }
  }, [hasMore, isLoadingMore, isLoading, nextCursor]);

  const refresh = useCallback(() => {
    isLoadingInitialRef.current = true;
    setCursor(undefined);
    setNextCursor(undefined);
    setServerMovements([]);
    setHasMore(true);
    setIsLoadingMore(false);
    void refetch();
  }, [refetch]);

  return {
    movements,
    isLoading: isLoading && isLoadingInitialRef.current,
    isLoadingMore,
    hasMore,
    loadMore,
    refresh,
    isEmpty: movements.length === 0 && !isLoading,
  };
}
