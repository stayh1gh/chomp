#!/usr/bin/env node
// Regenerates desktop/build/icon.icns from desktop/build-src/icon-source.svg.
//
// This is the desktop app's own icon — deliberately a separate source file from
// harness/dashboard/assets/logo.svg (the in-app dashboard header / favicon mark),
// so changing one doesn't silently change the other.
//
// One-off / occasional: run `npm run icon` in desktop/ after the app icon
// changes, then commit the resulting .icns. electron-builder just reads the
// committed file — this script is not part of the normal build.
//
// macOS-only (uses sips + iconutil, both system tools).
//
// Earlier version rasterized via `qlmanage -t`, which frames SVG thumbnails with
// QuickLook's own preview chrome (padding + off-center crop) instead of a clean
// full-bleed render — that's why the first generated icon had a stray white
// border and a cropped monster. `sips -s format png -z <n> <n>` rasterizes the
// SVG directly at the target size with no framing.
//
// The source is drawn full-bleed (1024px, 185px corners). macOS app icons sit on
// Apple's grid instead: an 824px body centered on the 1024px canvas with ~185px
// corners, so a full-bleed icon reads bigger than its Dock neighbours and newer
// macOS boxes it in a plate. Step 1 wraps the source onto that grid.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SVG_PATH = path.join(HERE, "build-src", "icon-source.svg");
const OUT_DIR = path.join(HERE, "build");
const ICNS_PATH = path.join(OUT_DIR, "icon.icns");

if (process.platform !== "darwin") {
  console.error("build-icon.mjs only runs on macOS (sips/iconutil).");
  process.exit(1);
}

if (!existsSync(SVG_PATH)) {
  console.error(`Source SVG not found: ${SVG_PATH}`);
  process.exit(1);
}

const tmp = mkdtempSync(path.join(os.tmpdir(), "agentos-icon-"));
const iconset = path.join(tmp, "icon.iconset");
mkdirSync(iconset);

// 1. Put the source on Apple's icon grid, then rasterize it to a 1024px PNG.
const BODY = 824;
const INSET = (1024 - BODY) / 2;
// Corners are 185px on the 824px body, i.e. 185 * 1024/824 in the source's own units.
const radius = ((185 * 1024) / BODY).toFixed(1);
const source = readFileSync(SVG_PATH, "utf8").replace(/rx="185" ry="185"/g, `rx="${radius}" ry="${radius}"`);
const inner = source.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const gridSvg = path.join(tmp, "icon-grid.svg");
writeFileSync(
  gridSvg,
  `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">` +
    `<svg x="${INSET}" y="${INSET}" width="${BODY}" height="${BODY}" viewBox="0 0 1024 1024">${inner}</svg></svg>`
);
console.log("Rasterizing SVG via sips...");
const basePng = path.join(tmp, "icon-1024.png");
execFileSync("sips", ["-s", "format", "png", "-z", "1024", "1024", gridSvg, "--out", basePng], { stdio: "inherit" });

// 2. Resize into the full iconset (each size + its @2x variant).
const sizes = [16, 32, 128, 256, 512];
console.log("Building iconset...");
for (const size of sizes) {
  execFileSync("sips", ["-z", String(size), String(size), basePng, "--out", path.join(iconset, `icon_${size}x${size}.png`)], { stdio: "ignore" });
  const size2x = size * 2;
  execFileSync("sips", ["-z", String(size2x), String(size2x), basePng, "--out", path.join(iconset, `icon_${size}x${size}@2x.png`)], { stdio: "ignore" });
}

// 3. Compile to .icns.
mkdirSync(OUT_DIR, { recursive: true });
console.log("Compiling icon.icns...");
execFileSync("iconutil", ["-c", "icns", iconset, "-o", ICNS_PATH], { stdio: "inherit" });

rmSync(tmp, { recursive: true, force: true });
console.log(`Wrote ${ICNS_PATH}`);
