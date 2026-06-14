import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "~/components/ui/button";

describe("Button", () => {
  it("renders with default classes", () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole("button", { name: "Click me" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass(
      "bg-primary text-primary-foreground hover:bg-primary/80"
    );
    expect(button).toHaveClass("h-8 gap-1.5 px-2.5");
  });

  it.each([
    { variant: "default", expected: "bg-primary text-primary-foreground hover:bg-primary/80" },
    { variant: "destructive", expected: "bg-destructive/10 text-destructive hover:bg-destructive/20" },
    { variant: "outline", expected: "border-border bg-background hover:bg-muted hover:text-foreground" },
    { variant: "secondary", expected: "bg-secondary text-secondary-foreground" },
    { variant: "ghost", expected: "hover:bg-muted hover:text-foreground" },
    { variant: "link", expected: "text-primary underline-offset-4 hover:underline" },
  ])("supports variant \"$variant\"", ({ variant, expected }) => {
    render(<Button variant={variant as "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"}>Button</Button>);
    const button = screen.getByRole("button", { name: "Button" });
    expect(button).toHaveClass(expected);
  });

  it.each([
    { size: "default", expected: "h-8 gap-1.5 px-2.5" },
    { size: "sm", expected: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5" },
    { size: "lg", expected: "h-9 gap-1.5 px-2.5" },
    { size: "icon", expected: "size-8" },
  ])("supports size \"$size\"", ({ size, expected }) => {
    render(<Button size={size as "default" | "sm" | "lg" | "icon"}>B</Button>);
    const button = screen.getByRole("button", { name: "B" });
    expect(button).toHaveClass(expected);
  });

  it("renders as a button element by default", () => {
    render(<Button>Click</Button>);
    const button = screen.getByRole("button", { name: "Click" });
    expect(button.tagName).toBe("BUTTON");
  });

  it("renders children correctly", () => {
    render(
      <Button>
        <span data-testid="child">Child Content</span>
      </Button>
    );
    const child = screen.getByTestId("child");
    expect(child).toBeInTheDocument();
    expect(child).toHaveTextContent("Child Content");
  });
});
