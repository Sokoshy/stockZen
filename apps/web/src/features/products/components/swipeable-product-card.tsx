"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { DeleteProductDialog } from "./delete-product-dialog";
import type { TenantRole } from "~/schemas/team-membership";
import type { ProductRow } from "../utils/filter-utils";

const SWIPE_THRESHOLD = 80;
const TOUCH_TARGET_MIN = 48;

interface SwipeableProductCardProps {
  product: ProductRow;
  actorRole: TenantRole;
  tenantId: string;
  onDeleted: () => void;
  onRestored: () => void;
  canViewPurchasePrice: boolean;
}

export function SwipeableProductCard({
  product,
  actorRole,
  tenantId,
  onDeleted,
  onRestored,
  canViewPurchasePrice,
}: SwipeableProductCardProps) {
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const touchStartX = useRef(0);
  const currentTranslateX = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      let clientX: number;
      if (e.type === 'touchstart' && 'touches' in e) {
        const touchEvent = e as React.TouchEvent;
        const touch = touchEvent.touches[0];
        if (!touch) {
          return;
        }
        clientX = touch.clientX;
      } else if ('clientX' in e) {
        const mouseEvent = e as React.MouseEvent;
        clientX = mouseEvent.clientX;
      } else {
        return;
      }
      touchStartX.current = clientX;
      setIsSwiping(true);
    },
    []
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (!isSwiping) return;

      let clientX: number;
      if (e.type === 'touchmove' && 'touches' in e) {
        const touchEvent = e as React.TouchEvent;
        const touch = touchEvent.touches[0];
        if (!touch) {
          return;
        }
        clientX = touch.clientX;
      } else if ('clientX' in e) {
        const mouseEvent = e as React.MouseEvent;
        clientX = mouseEvent.clientX;
      } else {
        return;
      }
      const diff = clientX - touchStartX.current;

      if (diff < 0) {
        currentTranslateX.current = Math.max(diff, -SWIPE_THRESHOLD * 1.5);
        setTranslateX(currentTranslateX.current);
      }
    },
    [isSwiping]
  );

  const handleTouchEnd = useCallback(() => {
    setIsSwiping(false);

    if (currentTranslateX.current < -SWIPE_THRESHOLD) {
      setTranslateX(-SWIPE_THRESHOLD);
      setShowActions(true);
    } else {
      setTranslateX(0);
      setShowActions(false);
    }

    currentTranslateX.current = 0;
  }, []);

  const closeActions = useCallback(() => {
    setTranslateX(0);
    setShowActions(false);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        closeActions();
      }
    };

    if (showActions) {
      document.addEventListener("click", handleClickOutside);
    }

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [showActions, closeActions]);

  const getSyncBadgeClasses = (status: ProductRow["syncStatus"]) => {
    if (status === "pending") {
      return "bg-amber-100 text-amber-800";
    }
    if (status === "failed") {
      return "bg-red-100 text-red-700";
    }
    return "bg-green-100 text-green-700";
  };

  return (
    <div
      ref={cardRef}
      className="relative overflow-hidden rounded-lg border border-gray-200 bg-white"
    >
      {/* Background Actions */}
      <div
        className="absolute inset-y-0 right-0 flex items-center bg-red-500 px-4"
        style={{
          width: `${SWIPE_THRESHOLD}px`,
          transform: `translateX(${Math.max(0, -translateX - SWIPE_THRESHOLD)}px)`,
          transition: isSwiping ? "none" : "transform 0.2s ease-out",
        }}
      >
        <div className="flex flex-col items-center gap-1">
          <DeleteProductDialog
            product={{
              id: product.id,
              name: product.name,
              syncStatus: product.syncStatus,
            }}
            tenantId={tenantId}
            onDeleted={() => {
              closeActions();
              onDeleted();
            }}
            onRestored={onRestored}
          />
          <span className="text-xs font-medium text-white">Delete</span>
        </div>
      </div>

      <div
        className="absolute inset-y-0 right-0 flex items-center bg-blue-500 px-4"
        style={{
          width: `${SWIPE_THRESHOLD}px`,
          right: `${SWIPE_THRESHOLD}px`,
          transform: `translateX(${Math.max(0, -translateX)}px)`,
          transition: isSwiping ? "none" : "transform 0.2s ease-out",
        }}
      >
        <Link
          href={`/products/${product.id}/edit`}
          className="flex flex-col items-center gap-1"
          onClick={closeActions}
          style={{ minWidth: TOUCH_TARGET_MIN, minHeight: TOUCH_TARGET_MIN }}
        >
          <svg
            className="h-6 w-6 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
          <span className="text-xs font-medium text-white">Edit</span>
        </Link>
      </div>

      {/* Main Card Content */}
      <div
        className="relative bg-white p-4"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isSwiping ? "none" : "transform 0.2s ease-out",
          touchAction: "pan-y",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleTouchStart}
        onMouseMove={handleTouchMove}
        onMouseUp={handleTouchEnd}
        onMouseLeave={handleTouchEnd}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">{product.name}</h3>
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getSyncBadgeClasses(product.syncStatus)}`}
              >
                {product.syncStatus}
              </span>
            </div>

            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
              {product.category && (
                <span className="inline-flex items-center">
                  <svg
                    className="mr-1 h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                    />
                  </svg>
                  {product.category}
                </span>
              )}
              <span className="inline-flex items-center">
                <svg
                  className="mr-1 h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
                {product.quantity} {product.unit}
              </span>
              <span className="inline-flex items-center font-medium text-gray-900">
                <svg
                  className="mr-1 h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                ${product.price.toFixed(2)}
              </span>
            </div>

            {canViewPurchasePrice && product.purchasePrice !== undefined && (
              <div className="mt-1 text-xs text-gray-500">
                Purchase: ${product.purchasePrice?.toFixed(2) ?? "-"}
              </div>
            )}

            {product.barcode && (
              <div className="mt-1 text-xs text-gray-500">
                Barcode: {product.barcode}
              </div>
            )}
          </div>

          {/* Mobile Action Buttons (visible on small screens when not swiping) */}
          <div className="flex flex-col gap-2 sm:hidden">
            <Link
              href={`/products/${product.id}/edit`}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-blue-600 text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={`Edit ${product.name}`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </Link>
            <DeleteProductDialog
              product={{
                id: product.id,
                name: product.name,
                syncStatus: product.syncStatus,
              }}
              tenantId={tenantId}
              onDeleted={onDeleted}
              onRestored={onRestored}
              trigger={
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-300 bg-white text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label={`Delete ${product.name}`}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              }
            />
          </div>
        </div>

        {/* Swipe Hint */}
        {!showActions && (
          <div className="mt-2 flex items-center text-xs text-gray-400">
            <svg className="mr-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16l-4-4m0 0l4-4m-4 4h18"
              />
            </svg>
            Swipe left for quick actions
          </div>
        )}
      </div>
    </div>
  );
}
