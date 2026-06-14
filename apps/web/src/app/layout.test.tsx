import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RootLayout from "./layout";

// Mock next/font/google since it requires Next.js server environment
vi.mock("next/font/google", () => ({
  Geist: () => ({
    className: "geist-font",
    variable: "--font-geist-sans",
  }),
}));

// Mock TRPCReactProvider to just render children
vi.mock("~/trpc/react", () => ({
  TRPCReactProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

describe("RootLayout", () => {
  it("renders the Toaster component", () => {
    render(<RootLayout>{null}</RootLayout>);

    // ToastViewport from @base-ui/react renders with role="region" and aria-label="Notifications"
    const toaster = screen.getByRole("region", { name: /notifications/i });
    expect(toaster).toBeInTheDocument();
  });
});
