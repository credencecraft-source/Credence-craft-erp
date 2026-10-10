import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as prismaCleaner from "./clean-prisma-generated-client.cjs";

const { cleanupStalePrismaTempFiles } = prismaCleaner;

describe("cleanupStalePrismaTempFiles", () => {
  it("removes stale Prisma temp engine files while keeping the live engine", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-clean-"));
    const clientDir = path.join(rootDir, "node_modules", ".prisma", "client");

    fs.mkdirSync(clientDir, { recursive: true });
    fs.writeFileSync(path.join(clientDir, "query_engine-windows.dll.node"), "live-engine");
    fs.writeFileSync(path.join(clientDir, "query_engine-windows.dll.node.tmp2572"), "stale-temp");
    fs.writeFileSync(path.join(clientDir, "query_engine-windows.dll.node.tmp"), "stale-temp");
    fs.writeFileSync(path.join(clientDir, "keep-me.json"), JSON.stringify({ ok: true }));

    const result = cleanupStalePrismaTempFiles(rootDir);

    expect(result.removed).toBe(2);
    expect(fs.existsSync(path.join(clientDir, "query_engine-windows.dll.node"))).toBe(true);
    expect(fs.existsSync(path.join(clientDir, "query_engine-windows.dll.node.tmp2572"))).toBe(false);
    expect(fs.existsSync(path.join(clientDir, "query_engine-windows.dll.node.tmp"))).toBe(false);
    expect(fs.existsSync(path.join(clientDir, "keep-me.json"))).toBe(true);

    fs.rmSync(rootDir, { recursive: true, force: true });
  });
});
