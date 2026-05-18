// /projects/sandbox/rift-realm/server/ranking.js
// MMR tiers, K-factor scaling, and Elo-flavored math.

const TIERS = [
  { name: 'Bronze',   color: '#a16207', min: 0,    max: 1099 },
  { name: 'Silver',   color: '#94a3b8', min: 1100, max: 1299 },
  { name: 'Gold',     color: '#fbbf24', min: 1300, max: 1499 },
  { name: 'Platinum', color: '#22d3ee', min: 1500, max: 1699 },
  { name: 'Diamond',  color: '#60a5fa', min: 1700, max: 1899 },
  { name: 'Master',   color: '#a855f7', min: 1900, max: 2099 },
  { name: 'Apex',     color: '#ef4444', min: 2100, max: 99999 },
];

function tierOf(mmr) {
  for (const t of TIERS) {
    if (mmr >= t.min && mmr <= t.max) return t;
  }
  return TIERS[0];
}

// K-factor: new players gain/lose more, veterans less.
// games_played < 10 → K=40, < 30 → K=28, < 100 → K=20, else K=14.
function kFactor(gamesPlayed) {
  if (gamesPlayed < 10) return 40;
  if (gamesPlayed < 30) return 28;
  if (gamesPlayed < 100) return 20;
  return 14;
}

// Expected score from Elo formula.
function expectedScore(mmrA, mmrB) {
  return 1 / (1 + Math.pow(10, (mmrB - mmrA) / 400));
}

// Returns { winnerDelta, loserDelta }
function eloDelta(winnerMmr, winnerGames, loserMmr, loserGames) {
  const eW = expectedScore(winnerMmr, loserMmr);
  const eL = 1 - eW;
  const kW = kFactor(winnerGames);
  const kL = kFactor(loserGames);
  const winnerDelta = Math.round(kW * (1 - eW));
  const loserDelta  = -Math.round(kL * eL);
  return { winnerDelta, loserDelta };
}

module.exports = { TIERS, tierOf, kFactor, eloDelta, expectedScore };
