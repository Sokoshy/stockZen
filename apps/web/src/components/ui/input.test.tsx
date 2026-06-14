import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "~/components/ui/input";

describe("Input", () => {
  it("renders as an input element", () => {
    render(<Input />);
    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });

  it("has default classes", () => {
    render(<Input />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveClass(
      "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none"
    );
    expect(input).toHaveClass(
      "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
    );
    expect(input).toHaveClass(
      "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    );
  });

  it("applies className prop", () => {
    render(<Input className="custom-class" />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveClass("custom-class");
  });

  it("forwards ref to the input element", () => {
    const ref: { current: HTMLInputElement | null } = { current: null };
    render(<Input ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current?.tagName).toBe("INPUT");
  });

  it("renders with a placeholder", () => {
    render(<Input placeholder="Enter text..." />);
    const input = screen.getByPlaceholderText("Enter text...");
    expect(input).toBeInTheDocument();
  });
});
