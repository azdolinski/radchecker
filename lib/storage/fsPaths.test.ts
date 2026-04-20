import { describe, expect, it } from "vitest";

import { InvalidPathError, safeDataPath } from "./fsPaths";

describe("safeDataPath", () => {
  it("accepts profiles/clients.yaml", () => {
    const abs = safeDataPath("profiles/clients.yaml");
    expect(abs).toMatch(/data\/profiles\/clients\.yaml$/);
  });

  it("accepts profiles/servers.yaml", () => {
    expect(safeDataPath("profiles/servers.yaml")).toMatch(/data\/profiles\/servers\.yaml$/);
  });

  it("accepts profiles/coa_sender.yaml and profiles/coa_server.yaml", () => {
    expect(safeDataPath("profiles/coa_sender.yaml")).toMatch(
      /data\/profiles\/coa_sender\.yaml$/,
    );
    expect(safeDataPath("profiles/coa_server.yaml")).toMatch(
      /data\/profiles\/coa_server\.yaml$/,
    );
  });

  it("accepts tests/<name>.yaml", () => {
    expect(safeDataPath("tests/t1.yaml")).toMatch(/data\/tests\/t1\.yaml$/);
  });

  it("accepts arbitrary depth so users can mirror their own FS layout", () => {
    expect(safeDataPath("tests/group-a/deep/nested/t.yaml")).toMatch(
      /data\/tests\/group-a\/deep\/nested\/t\.yaml$/,
    );
  });

  it("accepts previously-unknown top-level dirs", () => {
    expect(safeDataPath("foo/test.yaml")).toMatch(/data\/foo\/test\.yaml$/);
    expect(safeDataPath("servers/default.yaml")).toMatch(/data\/servers\/default\.yaml$/);
  });

  it("rejects path traversal", () => {
    expect(() => safeDataPath("../etc/passwd.yaml")).toThrow(InvalidPathError);
    expect(() => safeDataPath("profiles/../../etc/passwd.yaml")).toThrow(InvalidPathError);
    expect(() => safeDataPath("profiles/./foo.yaml")).toThrow(InvalidPathError);
  });

  it("rejects absolute paths", () => {
    expect(() => safeDataPath("/etc/passwd.yaml")).toThrow(InvalidPathError);
    expect(() => safeDataPath("\\etc\\passwd.yaml")).toThrow(InvalidPathError);
  });

  it("rejects non-yaml files", () => {
    expect(() => safeDataPath("profiles/test.txt")).toThrow(InvalidPathError);
    expect(() => safeDataPath("profiles/test")).toThrow(InvalidPathError);
  });

  it("rejects bare top-level files (must have at least one directory)", () => {
    expect(() => safeDataPath("foo.yaml")).toThrow(InvalidPathError);
  });

  it("rejects the runtime-owned jobs/ subtree", () => {
    expect(() => safeDataPath("jobs/foo.yaml")).toThrow(InvalidPathError);
    expect(() => safeDataPath("jobs/123/logs.yaml")).toThrow(InvalidPathError);
  });

  it("rejects bad filename characters", () => {
    expect(() => safeDataPath("profiles/te st.yaml")).toThrow(InvalidPathError);
    expect(() => safeDataPath("profiles/te$t.yaml")).toThrow(InvalidPathError);
  });

  it("rejects empty path", () => {
    expect(() => safeDataPath("")).toThrow(InvalidPathError);
  });

  it("rejects null-byte injection", () => {
    expect(() => safeDataPath("profiles/te\0st.yaml")).toThrow(InvalidPathError);
  });
});
