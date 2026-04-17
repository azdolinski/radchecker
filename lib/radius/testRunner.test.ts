import { describe, expect, it } from "vitest";

import { __internal } from "./testRunner";

const { compareAttribute } = __internal;

describe("testRunner.compareAttribute — assertion semantics", () => {
  it("'any' passes when attribute exists", () => {
    expect(compareAttribute("X", "any", "whatever")).toBeNull();
  });

  it("'*' passes when attribute exists", () => {
    expect(compareAttribute("X", "*", 42)).toBeNull();
  });

  it("'any' fails when missing", () => {
    const r = compareAttribute("X", "any", undefined);
    expect(r?.reason).toBe("missing");
  });

  it("'not-exist' passes when actual is missing", () => {
    expect(compareAttribute("X", "not-exist", undefined)).toBeNull();
  });

  it("'not-exist' fails when attribute present", () => {
    const r = compareAttribute("X", "not-exist", "anything");
    expect(r?.reason).toBe("should_not_exist");
  });

  it("prefix match passes when actual startsWith expected", () => {
    expect(compareAttribute("Framed-Pool", "ippool-TEST123-trusted", "ippool-TEST123-trusted")).toBeNull();
    expect(compareAttribute("Reply-Message", "User MAC", "User MAC001122000000 assign to …")).toBeNull();
  });

  it("prefix match fails when not startsWith", () => {
    const r = compareAttribute("Framed-Pool", "ippool-TEST123", "different-pool");
    expect(r?.reason).toBe("mismatch");
  });

  it("numeric strict equality passes", () => {
    expect(compareAttribute("Session-Timeout", 3600, 3600)).toBeNull();
  });

  it("numeric strict equality fails", () => {
    const r = compareAttribute("Session-Timeout", 3600, 7200);
    expect(r?.reason).toBe("mismatch");
  });
});
