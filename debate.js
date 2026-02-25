/**
 * OraclePit — debate.js
 * Challenge another peer's forecast over Intercom sideChannels.
 */

import crypto from 'crypto';
import { parseArgs } from 'util';
import { saveState } from './state.js';
import { broadcast, sendDirect } from './channel.js';

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    'market-id':    { type: 'string' },
    'target-peer':  { type: 'string' },
    argument:       { type: 'string' },
  },
});

const [command] = positionals;
if (command !== 'challenge') {
  console.error('Usage: node src/debate.js challenge [options]');
  process.exit(1);
}

await challengeForecast(values);

async function challengeForecast({ 'market-id': marketId, 'target-peer': targetPeer, argument }) {
  if (!marketId)   throw new Error('--market-id is required');
  if (!targetPeer) throw new Error('--target-peer is required');
  if (!argument)   throw new Error('--argument is required');

  const challenger = process.env.TRAC_ADDRESS || 'local-peer-dev';
  const debateId = crypto.randomUUID();

  const debate = {
    debateId,
    marketId,
    challenger,
    target: targetPeer,
    argument: argument.slice(0, 500),
    timestamp: new Date().toISOString(),
  };

  await saveState(`debate/${marketId}/${debateId}`, debate);

  // Send directly to target peer AND broadcast to the room
  await sendDirect(targetPeer, { type: 'oracle:debate:challenge', ...debate });
  await broadcast({ type: 'oracle:debate:challenge', ...debate });

  console.log(JSON.stringify({ success: true, ...debate }, null, 2));
}
