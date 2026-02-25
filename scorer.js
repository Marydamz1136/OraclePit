/**
 * OraclePit — scorer.js
 * Compute Brier scores and display the forecaster leaderboard.
 *
 * Brier score per prediction = (outcome_binary - confidence)²
 * Lower is better. 0.0 = perfect. 2.0 = maximally wrong.
 */

import { parseArgs } from 'util';
import { loadState, saveState, listKeys } from './state.js';

// ─── CLI ──────────────────────────────────────────────────────────────────────

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    top: { type: 'string', default: '10' },
    tag: { type: 'string', default: '' },
  },
});

const [command] = positionals;
if (command === 'leaderboard') {
  await printLeaderboard(values);
} else {
  console.error('Usage: node src/scorer.js leaderboard [--top N] [--tag TAG]');
  process.exit(1);
}

// ─── leaderboard ──────────────────────────────────────────────────────────────

async function printLeaderboard({ top, tag }) {
  const scoreKeys = await listKeys('scores/');
  const entries = [];

  for (const key of scoreKeys) {
    const score = await loadState(key);
    if (!score) continue;
    entries.push({ peerAddress: key.replace('scores/', ''), ...score });
  }

  entries.sort((a, b) => a.brierScore - b.brierScore);
  const topN = entries.slice(0, parseInt(top, 10));

  const ranked = topN.map((e, i) => ({
    rank: i + 1,
    peerAddress: e.peerAddress,
    brierScore: e.brierScore.toFixed(4),
    totalPredictions: e.total,
    accuracy: `${Math.round((e.correct / (e.total || 1)) * 100)}%`,
    tier: e.brierScore < 0.25 ? 'Expert' : e.brierScore < 0.5 ? 'Good' : 'Learning',
  }));

  console.table(ranked);
  console.log('\n(Lower Brier score = better forecaster. Expert tier: < 0.25)\n');
}

// ─── called by market.js on resolution ───────────────────────────────────────

export async function recalculateScores(marketId, outcome) {
  const forecastKeys = await listKeys(`forecast/${marketId}/`);
  const outcomeBinary = outcome === 'YES' ? 1 : 0;
  const deltas = [];

  for (const key of forecastKeys) {
    const forecast = await loadState(key);
    if (!forecast) continue;

    const { peerAddress, stance, confidence } = forecast;

    // Calibrate confidence toward the declared stance
    const calibratedProb = stance === 'YES' ? confidence : 1 - confidence;
    const brierThis = Math.pow(outcomeBinary - calibratedProb, 2);
    const correct = stance === outcome;

    // Load existing score or initialise
    const existing = (await loadState(`scores/${peerAddress}`)) || {
      brierScore: 0,
      total: 0,
      correct: 0,
      history: [],
    };

    const newTotal = existing.total + 1;
    const newCorrect = existing.correct + (correct ? 1 : 0);

    // Rolling average Brier score
    const newBrier = (existing.brierScore * existing.total + brierThis) / newTotal;

    const updated = {
      brierScore: newBrier,
      total: newTotal,
      correct: newCorrect,
      history: [
        ...existing.history.slice(-49),
        { marketId, stance, confidence, outcome, brierThis, timestamp: new Date().toISOString() },
      ],
    };

    await saveState(`scores/${peerAddress}`, updated);
    deltas.push({ peer: peerAddress, delta: +(newBrier - existing.brierScore).toFixed(6) });
  }

  return deltas;
}
