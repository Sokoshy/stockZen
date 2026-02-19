import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreateProductForm } from "~/features/products/components/create-product-form";
import { EditProductForm } from "~/features/products/components/edit-product-form";

const pushMock = vi.fn();
const createUseMutationMock = vi.fn();
const updateUseMutationMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    products: {
      create: {
        useMutation: (...args: unknown[]) => createUseMutationMock(...args),
      },
      update: {
        useMutation: (...args: unknown[]) => updateUseMutationMock(...args),
      },
    },
  },
}));

describe("product threshold forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createUseMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    updateUseMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  it("disables create submit when custom thresholds are invalid", () => {
    render(
      <CreateProductForm
        tenantId="tenant-1"
        canWritePurchasePrice
      />
    );

    fireEvent.click(screen.getByLabelText("Customize thresholds"));

    const criticalInput = screen.getByLabelText("Critical Threshold *");
    const attentionInput = screen.getByLabelText("Attention Threshold *");
    const submitButton = screen.getByRole("button", { name: /create product/i });

    fireEvent.change(criticalInput, { target: { value: "40" } });
    fireEvent.change(attentionInput, { target: { value: "20" } });

    expect(submitButton).toBeDisabled();

    fireEvent.change(attentionInput, { target: { value: "80" } });
    expect(submitButton).toBeEnabled();
  });

  it("asks confirmation before clearing custom thresholds in edit form", () => {
    render(
      <EditProductForm
        product={{
          id: "product-1",
          name: "Flour",
          description: null,
          sku: null,
          category: "Baking",
          unit: "kg",
          barcode: null,
          price: 10,
          purchasePrice: null,
          lowStockThreshold: null,
          thresholdMode: "custom",
          customCriticalThreshold: 20,
          customAttentionThreshold: 50,
        }}
        tenantId="tenant-1"
        canWritePurchasePrice
      />
    );

    fireEvent.click(screen.getByLabelText(/Use tenant defaults/i));

    expect(screen.getByText("Clear custom thresholds?")).toBeInTheDocument();
  });
});
