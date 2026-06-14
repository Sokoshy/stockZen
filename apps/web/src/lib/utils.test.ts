import { describe, it, expect } from "vitest";
import { cn } from "~/lib/utils";

describe("cn", () => {
  it("merges Tailwind classes correctly", () => {
    expect(cn("px-4", "py-2")).toBe("px-4 py-2");
  });

  it("resolves conflicts — last class wins", () => {
    expect(cn("px-4", "px-6")).toBe("px-6");
  });

  it("filters out falsy values", () => {
    expect(cn("px-4", false && "py-2", "pt-3")).toBe("px-4 pt-3");
  });

  it("accepts arrays of classes", () => {
    expect(cn(["px-4", "py-2"])).toBe("px-4 py-2");
  });

  it("returns empty string with no arguments", () => {
    expect(cn()).toBe("");
  });
});
