import { describe, expect, it } from "vitest";

import { __internal } from "./perfTest";

const { percentile } = __internal;

describe("perfTest.percentile", () => {
  it("returns 0 for empty array", () => {
    expect(percentile([], 50)).toBe(0);
  });

  it("returns the only value for single-element array", () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 99)).toBe(42);
  });

  it("p50 on [1..10]", () => {
    // idx = floor(0.5 * 10) = 5, sortedAsc[5] = 6
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(6);
  });

  it("p95 on [1..100]", () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(arr, 95)).toBe(96);
  });

  it("p99 on [1..100]", () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(arr, 99)).toBe(100);
  });

  it("monotonically non-decreasing as p grows", () => {
    const arr = [5, 1, 9, 3, 7, 2, 8, 4, 6].sort((a, b) => a - b);
    const pts = [10, 25, 50, 75, 90, 95, 99].map((p) => percentile(arr, p));
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]).toBeGreaterThanOrEqual(pts[i - 1]);
    }
  });
});
