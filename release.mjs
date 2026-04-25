/*
 * release.mjs
 *
 * Run after bumping the version in package.json (e.g. via `bun pm version patch`).
 *
 * Steps:
 *   1. Read version from package.json
 *   2. Sync into manifest.json
 *   3. Add entry to versions.json (mapping version -> manifest.minAppVersion)
 *   4. Run production build
 *   5. Copy release artifacts into dist/<version>/
 *
 * Usage:  bun run release
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const RELEASE_FILES = ["main.js", "manifest.json", "icon.png"];

// --- 1. Read target version from package.json ------------------------------
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = pkg.version;
if (!version) {
    console.error("package.json has no 'version' field. Aborting.");
    process.exit(1);
}
console.log(`Releasing version ${version}\n`);

// --- 2. Sync manifest.json -------------------------------------------------
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const previousManifestVersion = manifest.version;
manifest.version = version;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`  manifest.json: ${previousManifestVersion} -> ${version}`);

// --- 3. Update versions.json -----------------------------------------------
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
if (versions[version]) {
    console.log(`  versions.json: entry for ${version} already exists (${versions[version]})`);
} else {
    versions[version] = manifest.minAppVersion;
    writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");
    console.log(`  versions.json: added ${version} -> ${manifest.minAppVersion}`);
}

// --- 4. Build production ---------------------------------------------------
console.log("\nBuilding production bundle...");
try {
    execSync("bun run build", { stdio: "inherit" });
} catch (err) {
    console.error("\nBuild failed. Aborting release.");
    process.exit(1);
}

// --- 5. Copy artifacts to dist/<version>/ ----------------------------------
const distDir = join("dist", version);
mkdirSync(distDir, { recursive: true });

console.log(`\nStaging release files in ${distDir}/`);
const missingRequired = [];
const missingOptional = [];
for (const file of RELEASE_FILES) {
    if (!existsSync(file)) {
        if (file === "icon.png") {
            missingOptional.push(file);
        } else {
            missingRequired.push(file);
        }
        continue;
    }
    copyFileSync(file, join(distDir, file));
    console.log(`  ${file}`);
}

if (missingOptional.length > 0) {
    console.warn(`\nWARNING: missing optional files (skipped): ${missingOptional.join(", ")}`);
}
if (missingRequired.length > 0) {
    console.error(`\nERROR: missing required release files (aborting): ${missingRequired.join(", ")}`);
    process.exit(1);
}

// --- Done ------------------------------------------------------------------
console.log(`
Release ${version} prepared.

Next steps:
  git add -A
  git commit -m "Release ${version}"
  git push && git push --tags
  
Then on GitHub:
  - Draft a new release at tag v${version}
  - Attach the three files in ${distDir}/ as LOOSE assets (do not zip)
  - Publish
`);
