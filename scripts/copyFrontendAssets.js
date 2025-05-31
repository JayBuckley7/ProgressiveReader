// Copies built frontend assets into the Flask static directory.
// This script is cross-platform and requires Node 16+ for fs.cpSync.
const fs = require("fs");
const path = require("path");

const srcAssets = path.join(__dirname, "..", "frontend", "dist", "assets");
const destDir = path.join(__dirname, "..", "app", "static", "dist");
const destAssets = path.join(destDir, "assets");
const manifestSrc = path.join(
  __dirname,
  "..",
  "frontend",
  "dist",
  "manifest.json",
);
const manifestDest = path.join(destDir, "manifest.json");

fs.mkdirSync(destDir, { recursive: true });

if (fs.existsSync(srcAssets)) {
  fs.cpSync(srcAssets, destAssets, { recursive: true });
}

if (fs.existsSync(manifestSrc)) {
  fs.copyFileSync(manifestSrc, manifestDest);
}
