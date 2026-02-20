import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProductsTable } from "~/features/products/components/products-table";
import type { ProductRow } from "~/features/products/utils/filter-utils";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: any }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("~/features/products/components/delete-product-dialog", () => ({
  DeleteProductDialog: () => <button type="button">Delete</button>,
}));

function makeProduct(overrides: Partial<ProductRow>): ProductRow {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    tenantId: overrides.tenantId ?? "tenant-1",
    name: overrides.name ?? "Product",
    description: overrides.description ?? null,
    sku: overrides.sku ?? null,
    category: overrides.category ?? "Category",
    unit: overrides.unit ?? "pcs",
    barcode: overrides.barcode ?? null,
    price: overrides.price ?? 10,
    purchasePrice: overrides.purchasePrice ?? 5,
    quantity: overrides.quantity ?? 100,
    lowStockThreshold: overrides.lowStockThreshold ?? null,
    customCriticalThreshold: overrides.customCriticalThreshold ?? null,
    customAttentionThreshold: overrides.customAttentionThreshold ?? null,
    createdAt: overrides.createdAt ?? "2026-02-20T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-02-20T10:00:00.000Z",
    syncStatus: overrides.syncStatus ?? "synced",
    alertLevel: overrides.alertLevel ?? null,
    hasActiveAlert: overrides.hasActiveAlert ?? false,
    activeAlertUpdatedAt: overrides.activeAlertUpdatedAt ?? null,
  };
}

describe("ProductsTable alert badges", () => {
  it("renders RED, ORANGE, and GREEN badges from product payload", () => {
    render(
      <ProductsTable
        products={[
          makeProduct({ id: "p-red", name: "Red Product", alertLevel: "red", quantity: 20 }),
          makeProduct({ id: "p-orange", name: "Orange Product", alertLevel: "orange", quantity: 80 }),
          makeProduct({ id: "p-green", name: "Green Product", alertLevel: "green", quantity: 180 }),
        ]}
        actorRole="Admin"
        tenantId="tenant-1"
        onProductDeleted={() => undefined}
        onProductRestored={() => undefined}
      />
    );

    expect(screen.getByText("RED")).toBeInTheDocument();
    expect(screen.getByText("ORANGE")).toBeInTheDocument();
    expect(screen.getByText("GREEN")).toBeInTheDocument();
  });

  it("reflects alert-level transitions on rerender", () => {
    const { rerender } = render(
      <ProductsTable
        products={[makeProduct({ id: "p1", name: "Transition Product", alertLevel: "orange" })]}
        actorRole="Admin"
        tenantId="tenant-1"
        onProductDeleted={() => undefined}
        onProductRestored={() => undefined}
      />
    );

    expect(screen.getByText("ORANGE")).toBeInTheDocument();

    rerender(
      <ProductsTable
        products={[makeProduct({ id: "p1", name: "Transition Product", alertLevel: "green" })]}
        actorRole="Admin"
        tenantId="tenant-1"
        onProductDeleted={() => undefined}
        onProductRestored={() => undefined}
      />
    );

    expect(screen.queryByText("ORANGE")).not.toBeInTheDocument();
    expect(screen.getByText("GREEN")).toBeInTheDocument();
  });
});
