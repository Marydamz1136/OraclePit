/**
 * OraclePit — market.js
 * Open, list, and resolve prediction markets on Intercom.
 */

import crypto from 'crypto';
import { parseArgs } from 'util';
import { loadState, saveState } from './state.js';
import { broadcast } from './channel.js';
import { recalculateScores } from './scorer.js';

// ─── CLI entry point ──────────────────────────────────────────────────────────

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    question:  { type: 'string' },
    deadline:  { type: 'string' },
    tag:       { type: 'string', default: '' },
    'market-id': { type: 'string' },
    outcome:   { type: 'string' },
    source:    { type: 'string' },
    status:    { type: 'string', default: 'open' },
  },
});

const [command] = positionals;

switch (command) {
  case 'open':    await openMarket(values);   break;
  case 'resolve': await resolveMarket(values); break;
  case 'list':    await listMarkets(values);   break;
  default:
    console.error('Unknown command. Use: open | resolve | list');
    process.exit(1);
}

// ─── open ─────────────────────────────────────────────────────────────────────

async function openMarket({ question, deadline, tag }) {
  if (!question) throw new Error('--question is required');
  if (!deadline) throw new Error('--deadline is required (YYYY-MM-DD)');

  const marketId = crypto.randomUUID();
  const peerAddress = await getLocalPeerAddress();
  const market = {
    marketId,
    question,
    deadline,
    tags: tag ? tag.split(',').map(t => t.trim()) : [],
    status: 'open',
    openedBy: peerAddress,
    openedAt: new Date().toISOString(),
  };

  await saveState(`market/${marketId}`, market);
  await broadcast({ type: 'oracle:market:open', ...market });

  console.log(JSON.stringify({ success: true, ...market }, null, 2));
  return market;
}

// ─── resolve ──────────────────────────────────────────────────────────────────

async function resolveMarket({ 'market-id': marketId, outcome, source }) {
  if (!marketId) throw new Error('--market-id is required');
  if (!outcome)  throw new Error('--outcome is required (YES|NO)');
  if (!source)   throw new Error('--source URL is required');

  const upper = outcome.toUpperCase();
  if (upper !== 'YES' && upper !== 'NO') throw new Error('INVALID_STANCE');

  const market = await loadState(`market/${marketId}`);
  if (!market) throw new Error(`Market ${marketId} not found`);
  if (market.status === 'resolved') throw new Error('ALREADY_RESOLVED');

  const peerAddress = await getLocalPeerAddress();
  if (market.openedBy !== peerAddress) throw new Error('UNAUTHORIZED_RESOLVER');

  market.status = 'resolved';
  market.outcome = upper;
  market.source = source;
  market.resolvedAt = new Date().toISOString();

  await saveState(`market/${marketId}`, market);
  const scoreDeltas = await recalculateScores(marketId, upper);
  await broadcast({ type: 'oracle:market:resolve', marketId, outcome: upper, source });

  console.log(JSON.stringify({ success: true, market, scoreDeltas }, null, 2));
}

// ─── list ─────────────────────────────────────────────────────────────────────

async function listMarkets({ status, tag }) {
  const allKeys = await loadState('__index__market') || [];
  const results = [];

  for (const key of allKeys) {
    const m = await loadState(key);
    if (!m) continue;
    if (status !== 'all' && m.status !== status) continue;
    if (tag && !m.tags.includes(tag)) continue;

    const forecasts = await loadState(`__index__forecast/${m.marketId}`) || [];
    const yesCount = forecasts.filter(f => f.stance === 'YES').length;
    const yesPercent = forecasts.length
      ? Math.round((yesCount / forecasts.length) * 100)
      : null;

    results.push({
      marketId: m.marketId,
      question: m.question,
      deadline: m.deadline,
      status: m.status,
      forecastCount: forecasts.length,
      yesPercent,
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function getLocalPeerAddress() {
  // In a real Intercom app this comes from the peer's keypair.
  // Here we read from env or generate a stable address for the session.
  return process.env.TRAC_ADDRESS || 'local-peer-dev';
}
