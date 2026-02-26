"use client";

import Link from "next/link";

export function EmptyState() {
  return (
    <div className="rounded-lg bg-green-50 p-8 shadow">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-8 w-8 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h3 className="mt-4 text-lg font-semibold text-green-900">
          All Clear!
        </h3>
        <p className="mt-2 max-w-sm text-sm text-green-700">
          Great news! Your inventory is healthy with no active alerts. All products
          are within their threshold levels.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/inventory"
            className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500"
          >
            Record Movement
          </Link>
          <Link
            href="/products"
            className="inline-flex items-center rounded-md border border-green-300 bg-white px-4 py-2 text-sm font-semibold text-green-700 shadow-sm hover:bg-green-50"
          >
            View Inventory
          </Link>
        </div>
      </div>
    </div>
  );
}
