import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const standaloneRoot = path.join(root, ".next", "standalone");
const standaloneNext = path.join(standaloneRoot, ".next");

await mkdir(standaloneNext, { recursive: true });
await rm(path.join(standaloneNext, "static"), { recursive: true, force: true });
await cp(path.join(root, ".next", "static"), path.join(standaloneNext, "static"), { recursive: true });

try {
  await rm(path.join(standaloneRoot, "public"), { recursive: true, force: true });
  await cp(path.join(root, "public"), path.join(standaloneRoot, "public"), { recursive: true });
} catch {
  // The app does not require a public directory yet.
}

console.log("Prepared Electron runtime assets.");
