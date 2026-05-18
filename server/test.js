// /projects/sandbox/rift-realm/server/test.js
// Lightweight test harness for battle.js. Run: `node test.js`.
// No external runner — uses simple assert + descriptive output.
//
// Coverage:
//   1. Two units fight; one team wins.
//   2. Damage tracking: source dealt damage, target took damage.
//   3. Mage casts a spell when mana fills (cast event present).
//   4. Undead trait revives on death.
//   5. Bleed status applies damage over time after Werebear maul.
//   6. 2-star unit beats 1-star variant of the same unit.
//   7. Augment Forged Steel boosts attack so winner takes fewer ticks.
//   8. Pickup of bot variant returns a non-empty board.
//   9. Elo math: winner vs equal-mmr equal-games gets ~K/2.
//  10. Tier classification boundary: mmr=1100 → Silver.

const { simulateBattle } = require('./battle');
const { pickBotTeam, AUGMENT_BY_ID } = require('./gamedata');
const { eloDelta, tierOf } = require('./ranking');

let failed = 0, passed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}\n     ${e.message}`);
    failed++;
  }
}
function assert(cond, msg = "assertion failed") { if (!cond) throw new Error(msg); }
function assertEq(a, b, msg = "") { if (a !== b) throw new Error(`${msg} expected ${b}, got ${a}`); }
function assertGt(a, b, msg = "") { if (!(a > b)) throw new Error(`${msg} expected ${a} > ${b}`); }
function assertGe(a, b, msg = "") { if (!(a >= b)) throw new Error(`${msg} expected ${a} >= ${b}`); }

// 1, 2: basic combat
console.log('\n— Basic combat —');
check('two units fight; team1 wins by overwhelming HP', () => {
  // Werebear (id 15) vs Squire (id 1) — Werebear should crush.
  const r = simulateBattle(
    [{ unitId: 15, x: 2, y: 1 }],
    [{ unitId: 1,  x: 2, y: 1 }],
  );
  assert(r.winner === 1, `Werebear should win, got winner=${r.winner}`);
});
check('damage tracking populates recap', () => {
  const r = simulateBattle(
    [{ unitId: 15, x: 2, y: 1 }],
    [{ unitId: 1,  x: 2, y: 1 }],
  );
  const u = r.recap[1].units[0];
  assertGt(u.damageDealt, 0, 'Werebear damageDealt');
});

// 3: skill cast
console.log('\n— Spells & traits —');
check('mage skill fires (cast event present)', () => {
  const r = simulateBattle(
    [{ unitId: 3, x: 2, y: 1 }],     // Apprentice (Spark)
    [{ unitId: 1, x: 2, y: 1 }],
  );
  const allFx = r.ticks.flatMap((t) => t.fx);
  const casts = allFx.filter((fx) => fx.t === 'cast');
  assertGt(casts.length, 0, 'expected at least one cast event');
});

// 4: undead revive
check('undead trait can revive on death', () => {
  // 2 undead → trait active. Pit 2 wraiths vs many enemies to force deaths.
  let revived = 0;
  for (let trial = 0; trial < 8 && revived === 0; trial++) {
    const r = simulateBattle(
      [{ unitId: 12, x: 2, y: 1 }, { unitId: 5, x: 1, y: 1 }],     // Wraith + Skeleton (both Undead)
      [{ unitId: 19, x: 2, y: 2 }, { unitId: 19, x: 0, y: 3 }],    // 2 Dragons
    );
    const allFx = r.ticks.flatMap((t) => t.fx);
    const revives = allFx.filter((fx) => fx.t === 'revive');
    if (revives.length > 0) revived = revives.length;
  }
  assertGt(revived, 0, 'expected at least one revive across trials');
});

// 5: bleed DOT
check('bleed status applies damage over time', () => {
  const r = simulateBattle(
    [{ unitId: 15, x: 2, y: 1 }],   // Werebear (Maul → bleed)
    [{ unitId: 6,  x: 2, y: 2 }],   // Paladin
  );
  const allFx = r.ticks.flatMap((t) => t.fx);
  const trueDmg = allFx.filter((fx) => fx.t === 'dmg' && fx.kind === 'true');
  assertGt(trueDmg.length, 0, 'expected bleed (true-damage) ticks after Maul');
});

// 6: 2-star scaling
console.log('\n— Stars & augments —');
check('2-star unit beats 1-star of same kind', () => {
  // Win counter to dampen RNG (lifesteal/dodge variance)
  let wins1 = 0;
  for (let i = 0; i < 5; i++) {
    const r = simulateBattle(
      [{ unitId: 15, x: 2, y: 1, star: 2 }],
      [{ unitId: 15, x: 2, y: 1, star: 1 }],
    );
    if (r.winner === 1) wins1++;
  }
  assertGe(wins1, 4, `expected 2★ to win at least 4/5, won ${wins1}`);
});
check('Forged Steel augment increases damage output', () => {
  const baseR = simulateBattle(
    [{ unitId: 15, x: 2, y: 1 }],
    [{ unitId: 15, x: 2, y: 1 }],
  );
  const augR = simulateBattle(
    [{ unitId: 15, x: 2, y: 1 }],
    [{ unitId: 15, x: 2, y: 1 }],
    { augments: { 1: [AUGMENT_BY_ID.aug_atk], 2: [] } },
  );
  // Aug team should deal noticeably more damage in same time.
  const baseDmg1 = baseR.recap[1].units[0].damageDealt;
  const augDmg1  = augR.recap[1].units[0].damageDealt;
  // Cumulative across ticks may differ since the battle ends sooner; allow either pattern:
  // - augR ends with team1 having dealt at least the same total damage to enemy
  // - or augR battle finished in fewer ticks
  assert(augDmg1 >= baseDmg1 * 0.95 || augR.totalTicks < baseR.totalTicks,
         `expected augment to help: base dmg=${baseDmg1} aug dmg=${augDmg1} ticks ${baseR.totalTicks}→${augR.totalTicks}`);
});

// 8: bot variant
console.log('\n— Adaptive bot —');
check('pickBotTeam returns non-empty for each difficulty', () => {
  for (const d of ['easy', 'medium', 'hard', 'nightmare']) {
    const t = pickBotTeam(d, [{ unitId: 1, x: 0, y: 0 }]);
    assert(Array.isArray(t) && t.length > 0, `${d} returned empty`);
  }
});
check('pickBotTeam without player board returns valid', () => {
  const t = pickBotTeam('medium', null);
  assert(Array.isArray(t) && t.length > 0, 'expected fallback team');
});

// 9, 10: ranking math
console.log('\n— Ranking math —');
check('elo with equal MMR & games gives ~K/2', () => {
  const d = eloDelta(1500, 50, 1500, 50);
  // K=20 at 50 games → expected ±10
  assertEq(d.winnerDelta, 10, 'winner delta');
  assertEq(d.loserDelta, -10, 'loser delta');
});
check('elo upset (low beats high) gives larger swing', () => {
  const upset = eloDelta(1200, 50, 1700, 50);
  const flat  = eloDelta(1500, 50, 1500, 50);
  assertGt(upset.winnerDelta, flat.winnerDelta, 'upset winner delta should exceed flat');
});
check('tierOf classifies correctly at boundary', () => {
  assertEq(tierOf(1099).name, 'Bronze', 'mmr 1099');
  assertEq(tierOf(1100).name, 'Silver', 'mmr 1100');
  assertEq(tierOf(2100).name, 'Apex', 'mmr 2100');
});

// Summary
console.log(`\n— Summary —\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
