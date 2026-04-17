import { describe, expect, it } from "vitest";

import { nextFreeName } from "./nextFreeName";

describe("nextFreeName", () => {
  it("returns <base>-copy when base is free", () => {
    expect(nextFreeName("azdolinski", new Set(["azdolinski"]))).toBe("azdolinski-copy");
  });

  it("returns <base>-copy-2 when <base>-copy is taken", () => {
    expect(
      nextFreeName("azdolinski", new Set(["azdolinski", "azdolinski-copy"])),
    ).toBe("azdolinski-copy-2");
  });

  it("skips gaps and returns first free -copy-N", () => {
    expect(
      nextFreeName(
        "foo",
        new Set(["foo", "foo-copy", "foo-copy-2", "foo-copy-3"]),
      ),
    ).toBe("foo-copy-4");
  });

  it("does not special-case a base that already ends in -copy", () => {
    expect(nextFreeName("foo-copy", new Set(["foo", "foo-copy"]))).toBe(
      "foo-copy-copy",
    );
  });

  it("works when the base is not in the taken set", () => {
    expect(nextFreeName("lonely", new Set())).toBe("lonely-copy");
  });
});
