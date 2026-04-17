import { describe, expect, it } from "vitest";

import { InvalidPathError, safeDataPath } from "./fsPaths";

describe("safeDataPath", () => {
  it("accepts valid 2-level nested profiles/client/name.yaml", () => {
    const abs = safeDataPath("profiles/client/test.yaml");
    expect(abs).toMatch(/data\/profiles\/client\/test\.yaml$/);
  });

  it("accepts profiles/servers/name.yaml", () => {
    const abs = safeDataPath("profiles/servers/default.yaml");
    expect(abs).toMatch(/data\/profiles\/servers\/default\.yaml$/);
  });

  it("accepts flat subdirs coa/ and tests/", () => {
    expect(safeDataPath("coa/sim1.yaml")).toMatch(/data\/coa\/sim1\.yaml$/);
    expect(safeDataPath("tests/t1.yaml")).toMatch(/data\/tests\/t1\.yaml$/);
  });

  it("rejects path traversal", () => {
    expect(() => safeDataPath("../etc/passwd")).toThrow(InvalidPathError);
    expect(() => safeDataPath("profiles/client/../../etc/passwd")).toThrow(InvalidPathError);
    expect(() => safeDataPath("profiles/..yaml")).toThrow(InvalidPathError);
  });

  it("rejects absolute paths", () => {
    expect(() => safeDataPath("/etc/passwd.yaml")).toThrow(InvalidPathError);
    expect(() => safeDataPath("\\etc\\passwd.yaml")).toThrow(InvalidPathError);
  });

  it("rejects non-yaml files", () => {
    expect(() => safeDataPath("profiles/client/test.txt")).toThrow(InvalidPathError);
    expect(() => safeDataPath("profiles/client/test")).toThrow(InvalidPathError);
  });

  it("rejects unknown subdirs", () => {
    expect(() => safeDataPath("foo/test.yaml")).toThrow(InvalidPathError);
    expect(() => safeDataPath("profiles/client/sub/baz.yaml")).toThrow(InvalidPathError);
    expect(() => safeDataPath("servers/default.yaml")).toThrow(InvalidPathError);
    expect(() => safeDataPath("profiles/default.yaml")).toThrow(InvalidPathError);
  });

  it("rejects bad filename characters", () => {
    expect(() => safeDataPath("profiles/client/te st.yaml")).toThrow(InvalidPathError);
    expect(() => safeDataPath("profiles/client/te$t.yaml")).toThrow(InvalidPathError);
  });

  it("rejects empty path", () => {
    expect(() => safeDataPath("")).toThrow(InvalidPathError);
  });

  it("rejects null-byte injection", () => {
    expect(() => safeDataPath("profiles/client/te\0st.yaml")).toThrow(InvalidPathError);
  });
});
