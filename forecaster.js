/**
 * OraclePit — forecaster.js
 * Submit or update a YES/NO forecast for an open market.
 */

import crypto from 'crypto';
import { parseArgs } from 'util';
import { loadState, saveState } from './state.js';
import { broadcast } from './channel.js';

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    'market-id':  { type: 'string' },
    stance:       { type: 'string' },
    confidence:   { type: 'string' },
    reasoning:    { type: 'string', default: '' },
  },
});

const [command] = positionals;
if (command !== 'submit') {
  console.error('Usage: node src/forecaster.js submit [options]');
  process.exit(1);
}

await submitForecast(values);

async function submitForecast({ 'market-id': marketId, stance, confidence, reasoning }) {
  if (!marketId)   throw new Error('--market-id is required');
  if (!stance)     throw new Error('--stance is required (YES|NO)');
  if (!confidence) throw new Error('--confidence is required (0.0–1.0)');

  const upper = stance.toUpperCase();
  if (upper !== 'YES' && upper !== 'NO') throw new Error('INVALID_STANCE');

  const conf = parseFloat(confidence);
  if (isNaN(conf) || conf < 0 || conf > 1) throw new Error('CONFIDENCE_OUT_OF_RANGE');

  const market = await loadState(`market/${marketId}`);
  if (!market) throw new Error(`Market ${marketId} not found`);
  if (market.status !== 'open') throw new Error('MARKET_CLOSED');
  if (new Date() > new Date(market.deadline)) throw new Error('MARKET_CLOSED');

  const peerAddress = process.env.TRAC_ADDRESS || 'local-peer-dev';
  const forecastId = crypto.randomUUID();

  const forecast = {
    forecastId,
    marketId,
    peerAddress,
    stance: upper,
    confidence: conf,
    reasoning: reasoning.slice(0, 280), // tweet-length cap
    timestamp: new Date().toISOString(),
  };

  await saveState(`forecast/${marketId}/${peerAddress}`, forecast);
  await broadcast({
    type: 'oracle:forecast:submit',
    marketId,
    stance: upper,
    confidence: conf,
    peerAddress,
  });

  console.log(JSON.stringify({ success: true, ...forecast }, null, 2));
}
