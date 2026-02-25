/**
 * OraclePit — channel.js
 * Intercom sideChannel abstraction.
 *
 * Wraps Intercom's sideChannel.broadcast() and sideChannel.send() for OraclePit messages.
 * In dev mode (no live peer) it logs the message to stdout and writes to a local log file.
 */

import fs from 'fs/promises';
import path from 'path';

const DEV_LOG_PATH = path.join(process.cwd(), '.oracle-channel.jsonl');

let sideChannel = null;
try {
  const mod = await import('../intercom/sideChannel.js');
  sideChannel = mod.default || mod;
} catch {
  // Dev mode
}

export async function broadcast(payload) {
  const envelope = { ...payload, _sentAt: new Date().toISOString() };
  if (sideChannel) {
    await sideChannel.broadcast(envelope);
  } else {
    await devLog('broadcast', envelope);
  }
}

export async function sendDirect(targetPeer, payload) {
  const envelope = { ...payload, _sentAt: new Date().toISOString() };
  if (sideChannel) {
    await sideChannel.send(targetPeer, envelope);
  } else {
    await devLog(`direct→${targetPeer}`, envelope);
  }
}

async function devLog(direction, payload) {
  const line = JSON.stringify({ direction, payload }) + '\n';
  await fs.appendFile(DEV_LOG_PATH, line, 'utf8');
  console.log(`[sideChannel:${direction}]`, JSON.stringify(payload));
}
