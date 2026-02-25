/**
 * OraclePit — state.js
 * Thin wrapper around Intercom's replicated-state API.
 *
 * In production this delegates to intercom's built-in state.set / state.get.
 * For local development without a live Intercom peer, it falls back to a
 * local JSON file so you can run the app offline.
 */

import fs from 'fs/promises';
import path from 'path';

const DEV_DB_PATH = path.join(process.cwd(), '.oracle-state.json');

// Attempt to import the real Intercom state module; fall back to file-based dev store.
let intercomState = null;
try {
  const mod = await import('../intercom/state.js');
  intercomState = mod.default || mod;
} catch {
  // Running in dev mode without a live Intercom peer
}

async function readDevDB() {
  try {
    const raw = await fs.readFile(DEV_DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeDevDB(db) {
  await fs.writeFile(DEV_DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

export async function saveState(key, value) {
  if (intercomState) {
    return intercomState.set(key, JSON.stringify(value));
  }
  const db = await readDevDB();

  // Maintain index for list queries
  if (!key.startsWith('__index__') && !key.startsWith('scores/') && !key.startsWith('debate/')) {
    const category = key.split('/')[0];
    const indexKey = `__index__${category}`;
    db[indexKey] = db[indexKey] || [];
    if (!db[indexKey].includes(key)) db[indexKey].push(key);
  }

  db[key] = value;
  await writeDevDB(db);
}

export async function loadState(key) {
  if (intercomState) {
    const raw = await intercomState.get(key);
    return raw ? JSON.parse(raw) : null;
  }
  const db = await readDevDB();
  return db[key] ?? null;
}

export async function listKeys(prefix) {
  if (intercomState) {
    return intercomState.list(prefix);
  }
  const db = await readDevDB();
  return Object.keys(db).filter(k => k.startsWith(prefix));
}
