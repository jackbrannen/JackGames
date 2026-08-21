#!/usr/bin/env node
// Resizes/compresses source voice card art from WordBirds/Voices into small web-ready
// WebP thumbnails, and maintains a manifest so re-running only touches new/changed files.
//
// Usage: node scripts/process-voices.mjs

import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, unlinkSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCE_DIR = path.join(__dirname, "..", "..", "WordBirds", "Voices")
const OUT_DIR = path.join(__dirname, "..", "public", "voices")
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json")
const CARD_SIZE = 480 // long-edge px; cards render small on screen but this covers retina

mkdirSync(OUT_DIR, { recursive: true })

function slugify(filename) {
  return path
    .basename(filename, path.extname(filename))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function displayName(slug) {
  return slug
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ")
}

function hashFile(filePath) {
  return createHash("sha1").update(readFileSync(filePath)).digest("hex").slice(0, 12)
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return { cards: {} }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
}

function main() {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`Source dir not found: ${SOURCE_DIR}`)
    process.exit(1)
  }

  const manifest = loadManifest()
  const sourceFiles = readdirSync(SOURCE_DIR).filter((f) => /\.(png|jpe?g)$/i.test(f))
  const seenSlugs = new Set()

  let added = 0
  let updated = 0
  let unchanged = 0

  for (const file of sourceFiles) {
    const slug = slugify(file)
    seenSlugs.add(slug)
    const srcPath = path.join(SOURCE_DIR, file)
    const hash = hashFile(srcPath)
    const existing = manifest.cards[slug]
    const outPath = path.join(OUT_DIR, `${slug}.webp`)

    if (existing && existing.hash === hash && existsSync(outPath)) {
      unchanged++
      continue
    }

    execFileSync("cwebp", ["-quiet", "-q", "82", "-resize", String(CARD_SIZE), "0", srcPath, "-o", outPath])

    manifest.cards[slug] = {
      slug,
      name: displayName(slug),
      file: `${slug}.webp`,
      hash,
      version: Date.now(),
    }

    if (existing) updated++
    else added++
  }

  // Drop cards whose source file no longer exists.
  let removed = 0
  for (const slug of Object.keys(manifest.cards)) {
    if (!seenSlugs.has(slug)) {
      const outPath = path.join(OUT_DIR, `${slug}.webp`)
      if (existsSync(outPath)) unlinkSync(outPath)
      delete manifest.cards[slug]
      removed++
    }
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))

  console.log(`Voice cards processed: ${added} added, ${updated} updated, ${unchanged} unchanged, ${removed} removed.`)
  console.log(`Total cards in pool: ${Object.keys(manifest.cards).length}`)
}

main()
