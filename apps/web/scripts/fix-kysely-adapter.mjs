#!/usr/bin/env node
/**
 * Patch @better-auth/kysely-adapter for kysely 0.29.2 compatibility.
 * kysely's entry point does not export DEFAULT_MIGRATION_LOCK_TABLE
 * and DEFAULT_MIGRATION_TABLE, causing Turbopack build errors.
 *
 * This script replaces the imports with local constants.
 * Run after `aube install` if needed.
 */

import { readFileSync, writeFileSync, globSync } from "node:fs";
import { join } from "node:path";

const replacements = [
  {
    from: 'import { CompiledQuery, DEFAULT_MIGRATION_LOCK_TABLE, DEFAULT_MIGRATION_TABLE, DefaultQueryCompiler, sql } from "kysely";',
    to: 'import { CompiledQuery, DefaultQueryCompiler, sql } from "kysely";\nconst DEFAULT_MIGRATION_LOCK_TABLE = "kysely_migration_lock";\nconst DEFAULT_MIGRATION_TABLE = "kysely_migration";',
  },
  {
    from: 'import { DEFAULT_MIGRATION_LOCK_TABLE, DEFAULT_MIGRATION_TABLE, SqliteAdapter, SqliteQueryCompiler } from "kysely";',
    to: 'import { SqliteAdapter, SqliteQueryCompiler } from "kysely";\nconst DEFAULT_MIGRATION_LOCK_TABLE = "kysely_migration_lock";\nconst DEFAULT_MIGRATION_TABLE = "kysely_migration";',
  },
];

const base = join(process.cwd(), "node_modules", ".pnpm");
const pattern = join(base, "@better-auth+kysely-adapter@1.6.14_*/node_modules/@better-auth/kysely-adapter/dist/*-sqlite-*.mjs");
const pattern2 = join(base, "@better-auth+kysely-adapter@1.6.14_*/node_modules/@better-auth/kysely-adapter/dist/node-sqlite-dialect.mjs");

const files = [...globSync(pattern), ...globSync(pattern2)];

if (files.length === 0) {
  console.error("❌ No kysely-adapter files found. Run 'aube install' first.");
  process.exit(1);
}

let patched = 0;
for (const file of files) {
  let content = readFileSync(file, "utf-8");
  let changed = false;

  for (const { from, to } of replacements) {
    if (content.includes(from)) {
      content = content.replace(from, to);
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(file, content, "utf-8");
    console.log(`✅ Patched: ${file}`);
    patched++;
  } else {
    console.log(`⏭ Already patched or no match: ${file}`);
  }
}

console.log(`\nDone: ${patched}/${files.length} files patched.`);
