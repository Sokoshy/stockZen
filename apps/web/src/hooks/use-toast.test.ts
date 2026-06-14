import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  reducer,
  toast,
  useToast,
  resetToastsForTesting,
} from "~/hooks/use-toast";
import type { State, Action } from "~/hooks/use-toast";

// Helper to build a minimal toast object
function makeToast(overrides: Partial<State["toasts"][number]> = {}) {
  return {
    id: "1",
    open: true,
    ...overrides,
  } as State["toasts"][number];
}

beforeEach(() => {
  resetToastsForTesting();
});

describe("reducer", () => {
  const emptyState: State = { toasts: [] };

  it("ADD_TOAST — adds toast to state.toasts", () => {
    const t = makeToast();
    const action: Action = { type: "ADD_TOAST", toast: t };
    const next = reducer(emptyState, action);
    expect(next.toasts).toHaveLength(1);
    expect(next.toasts[0]!.id).toBe("1");
  });

  it("ADD_TOAST enforces TOAST_LIMIT — max 3 toasts", () => {
    const state: State = {
      toasts: [makeToast({ id: "a" }), makeToast({ id: "b" }), makeToast({ id: "c" })],
    };
    const action: Action = { type: "ADD_TOAST", toast: makeToast({ id: "d" }) };
    const next = reducer(state, action);
    expect(next.toasts).toHaveLength(3);
    expect(next.toasts[0]!.id).toBe("d"); // newest first
  });

  it("UPDATE_TOAST — merges partial fields by id", () => {
    const state: State = { toasts: [makeToast({ id: "1", open: true })] };
    const action: Action = {
      type: "UPDATE_TOAST",
      toast: { id: "1", open: false } as State["toasts"][number],
    };
    const next = reducer(state, action);
    expect(next.toasts[0]!.open).toBe(false);
    expect(next.toasts[0]!.id).toBe("1");
  });

  it("DISMISS_TOAST with id — sets open: false on targeted toast", () => {
    vi.useFakeTimers();
    const state: State = {
      toasts: [makeToast({ id: "1" }), makeToast({ id: "2" })],
    };
    const action: Action = { type: "DISMISS_TOAST", toastId: "1" };
    const next = reducer(state, action);
    expect(next.toasts.find((t) => t.id === "1")!.open).toBe(false);
    expect(next.toasts.find((t) => t.id === "2")!.open).toBe(true);
    vi.useRealTimers();
  });

  it("DISMISS_TOAST without id — sets open: false on all toasts", () => {
    vi.useFakeTimers();
    const state: State = {
      toasts: [makeToast({ id: "1" }), makeToast({ id: "2" })],
    };
    const action: Action = { type: "DISMISS_TOAST" };
    const next = reducer(state, action);
    expect(next.toasts.every((t) => t.open === false)).toBe(true);
    vi.useRealTimers();
  });

  it("REMOVE_TOAST with id — filters out targeted toast", () => {
    const state: State = {
      toasts: [makeToast({ id: "1" }), makeToast({ id: "2" })],
    };
    const action: Action = { type: "REMOVE_TOAST", toastId: "1" };
    const next = reducer(state, action);
    expect(next.toasts).toHaveLength(1);
    expect(next.toasts[0]!.id).toBe("2");
  });

  it("REMOVE_TOAST without id — clears all toasts", () => {
    const state: State = {
      toasts: [makeToast({ id: "1" }), makeToast({ id: "2" })],
    };
    const action: Action = { type: "REMOVE_TOAST" };
    const next = reducer(state, action);
    expect(next.toasts).toHaveLength(0);
  });
});

describe("toast() function", () => {
  it("returns { id, dismiss, update }", () => {
    const result = toast({ title: "hello" } as unknown as Parameters<typeof toast>[0]);
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("dismiss");
    expect(result).toHaveProperty("update");
    expect(typeof result.id).toBe("string");
    expect(typeof result.dismiss).toBe("function");
    expect(typeof result.update).toBe("function");
  });
});

describe("genId uniqueness", () => {
  it("two calls return different ids", () => {
    const a = toast({ title: "a" } as unknown as Parameters<typeof toast>[0]);
    const b = toast({ title: "b" } as unknown as Parameters<typeof toast>[0]);
    expect(a.id).not.toBe(b.id);
  });
});

describe("useToast hook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns toasts array, toast/dismiss functions", () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toasts).toBeDefined();
    expect(Array.isArray(result.current.toasts)).toBe(true);
    expect(typeof result.current.toast).toBe("function");
    expect(typeof result.current.dismiss).toBe("function");
  });

  it("toast() adds a toast visible via useToast", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.toast({ title: "test" } as unknown as Parameters<typeof toast>[0]);
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]!.open).toBe(true);
  });

  it("dismiss() closes all toasts", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.toast({ title: "a" } as unknown as Parameters<typeof toast>[0]);
    });
    expect(result.current.toasts).toHaveLength(1);
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.toasts[0]!.open).toBe(false);
  });
});
