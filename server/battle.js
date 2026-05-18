// /projects/sandbox/rift-realm/server/battle.js
// Tick-based auto-battler simulation with traits, items, mana, range targeting.
// 5 ticks per second; ticks are streamed to client with a small delay.

const { UNIT_BY_ID, TRAITS, ITEM_BY_ID, BOARD, STAR2_MULT } = require('./gamedata');

const TICKS_PER_SEC = 5;          // 200ms per tick
const MAX_TICKS = 60 * TICKS_PER_SEC; // hard cap = 60s
const MANA_PER_HIT_TAKEN = 8;     // gain mana when hit
const MANA_PER_ATTACK   = 10;     // gain mana when attacking

// Build merged board: team1 placed on rows 0..1, team2 placed mirrored to rows 2..3.
// Each team's input is an array of { unitId, x, y, items?:[itemId,...], star?: 2 } where y is in 0..1 (their half).
// `augments` is { 1: [augObj,...], 2: [...] } applied as initial flat buffs.
function placeUnits(team1Slots, team2Slots, traitsActive, augments = { 1: [], 2: [] }) {
  const units = [];
  let uid = 0;

  function aug(team) { return augments[team] || []; }

  function inst(slot, team) {
    const cat = UNIT_BY_ID[slot.unitId];
    if (!cat) return null;
    // Mirror the y axis for team2 so both sides face each other.
    const y = team === 1 ? slot.y : (BOARD.rows - 1 - slot.y);
    const x = slot.x;
    const items = (slot.items || []).map((id) => ITEM_BY_ID[id]).filter(Boolean);
    const star = Number(slot.star) === 2 ? 2 : 1;

    // Base stats — apply 2-star upgrade multipliers
    let hp = cat.hp * (star === 2 ? STAR2_MULT.hp : 1);
    let attack = cat.attack * (star === 2 ? STAR2_MULT.attack : 1);
    let attackSpeed = cat.attackSpeed * (star === 2 ? STAR2_MULT.attackSpeed : 1);
    let manaStart = cat.manaStart;
    let spellMul = 1;
    let lifesteal = 0;
    let dodge = 0;
    let critChance = 0;
    let critMul = 2.0;
    let shieldPct = 0;

    for (const it of items) {
      const s = it.stats;
      if (s.hp) hp += s.hp;
      if (s.attack) attack += s.attack;
      if (s.attackSpeed) attackSpeed += s.attackSpeed;
      if (s.manaStart) manaStart += s.manaStart;
      if (s.spellMul) spellMul += s.spellMul;
      if (s.lifesteal) lifesteal += s.lifesteal;
      if (s.dodge) dodge += s.dodge;
      if (s.critChance) critChance = Math.max(critChance, s.critChance);
      if (s.critMul) critMul = Math.max(critMul, s.critMul);
      if (s.shieldPct) shieldPct += s.shieldPct;
    }

    // Apply augment effects (per-team)
    for (const a of aug(team)) {
      const ap = a.apply || {};
      if (ap.allHp) hp += ap.allHp;
      if (ap.allAttack) attack += ap.allAttack;
      if (ap.allAtkSpeed) attackSpeed += ap.allAtkSpeed;
      if (ap.allManaStart) manaStart += ap.allManaStart;
      if (ap.allSpellMul) spellMul += ap.allSpellMul;
      if (ap.allLifesteal) lifesteal += ap.allLifesteal;
      if (ap.allDodge) dodge += ap.allDodge;
      if (ap.allShieldPct) shieldPct += ap.allShieldPct;
      if (ap.allCritChance) critChance = Math.max(critChance, ap.allCritChance);
      if (ap.allCritMul) critMul = Math.max(critMul, ap.allCritMul);
    }

    // Apply trait bonuses (resolved per side)
    const t = traitsActive[team] || {};
    if (t.Knight) shieldPct += t.Knight.shieldPct || 0;
    if (t.Mage) spellMul *= t.Mage.spellMul || 1;
    if (t.Beast) attackSpeed += (t.Beast.atkSpdBonus || 0) * 0.15;
    if (t.Assassin && t.Assassin.critChance) {
      critChance = Math.max(critChance, t.Assassin.critChance);
      critMul = Math.max(critMul, t.Assassin.critMul);
    }
    const rangeBonus = (t.Ranger && cat.traits.includes('Ranger')) ? (t.Ranger.rangeBonus || 0) : 0;
    const rangedDmgMul = (t.Ranger && cat.traits.includes('Ranger')) ? (t.Ranger.rangedDmgMul || 1) : 1;

    return {
      uid: ++uid,
      team,
      catalogId: cat.id,
      name: cat.name + (star === 2 ? ' ★' : ''),
      emoji: cat.emoji,
      traits: cat.traits.slice(),
      star,
      cost: cat.cost,
      x, y,
      origX: x, origY: y,
      hp,
      maxHp: hp,
      attack,
      baseAttack: attack,
      attackSpeed, // attacks per second
      atkCooldownTicks: Math.max(1, Math.round(TICKS_PER_SEC / attackSpeed)),
      atkTimer: Math.floor(Math.random() * 3), // small jitter
      range: cat.range + rangeBonus,
      mana: manaStart,
      maxMana: cat.maxMana,
      skill: cat.skill,
      spellMul,
      lifesteal,
      dodge,
      critChance,
      critMul,
      shieldPct,
      rangedDmgMul,
      // statuses
      stunTicks: 0,
      freezeTicks: 0,
      bleedTicks: 0, bleedDmg: 0,
      buffAtkPct: 0, buffTicks: 0,
      shield: 0,
      alive: true,
      hasRevived: false,
      items: items.map((i) => ({ id: i.id, name: i.name, emoji: i.emoji })),
      isSummon: false,
      // tracking for recap
      damageDealt: 0, damageTaken: 0, healingDone: 0, kills: 0, casts: 0,
    };
  }

  for (const s of team1Slots) {
    const u = inst(s, 1);
    if (u) units.push(u);
  }
  for (const s of team2Slots) {
    const u = inst(s, 2);
    if (u) units.push(u);
  }

  // Augment: aug_revive — mark cheapest unit per team to revive at 30%
  for (const team of [1, 2]) {
    const hasRevive = aug(team).some((a) => a.apply && a.apply.reviveCheapest);
    if (!hasRevive) continue;
    const teamUnits = units.filter((u) => u.team === team);
    if (teamUnits.length === 0) continue;
    teamUnits.sort((a, b) => (a.cost || 99) - (b.cost || 99));
    teamUnits[0]._augRevive = true;
  }

  // Augment: aug_holy — bonus to holy heal pulse (encoded on traitsActive copy)
  for (const team of [1, 2]) {
    const holyBonus = aug(team).reduce((acc, a) => acc + ((a.apply && a.apply.holyPulseBonus) || 0), 0);
    if (holyBonus > 0 && traitsActive[team] && traitsActive[team].Holy) {
      traitsActive[team].Holy = { ...traitsActive[team].Holy, pulseHeal: (traitsActive[team].Holy.pulseHeal || 0) + holyBonus };
    }
  }

  // Assassin leap: at battle start, jump to back row of enemy
  for (const u of units) {
    if (u.traits.includes('Assassin')) {
      const trait = traitsActive[u.team];
      if (trait && trait.Assassin && trait.Assassin.leap) {
        u.y = u.team === 1 ? (BOARD.rows - 1) : 0;
        u.x = Math.min(BOARD.cols - 1, Math.max(0, u.x));
      }
    }
  }

  return units;
}

function countTraits(slots) {
  // Returns {TraitName: count} based on UNIQUE catalogId (no double-counting same unit).
  const seenIds = new Set();
  const counts = {};
  for (const s of slots) {
    if (seenIds.has(s.unitId)) continue;
    const cat = UNIT_BY_ID[s.unitId];
    if (!cat) continue;
    seenIds.add(s.unitId);
    for (const t of cat.traits) counts[t] = (counts[t] || 0) + 1;
  }
  return counts;
}

function resolveTraits(slots) {
  const counts = countTraits(slots);
  const active = {};
  for (const [name, count] of Object.entries(counts)) {
    const def = TRAITS[name];
    if (!def) continue;
    let chosen = null;
    for (const tier of def.tiers) {
      if (count >= tier.count) chosen = tier;
    }
    if (chosen) active[name] = { ...chosen, count };
  }
  return { counts, active };
}

function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function aliveEnemies(units, team) {
  return units.filter((u) => u.alive && u.team !== team);
}
function aliveAllies(units, team) {
  return units.filter((u) => u.alive && u.team === team);
}

function nearestEnemy(self, units) {
  const enemies = aliveEnemies(units, self.team);
  if (!enemies.length) return null;
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    const d = chebyshev(self, e);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function farthestEnemy(self, units) {
  const enemies = aliveEnemies(units, self.team);
  if (!enemies.length) return null;
  return enemies.sort((a, b) => chebyshev(self, b) - chebyshev(self, a))[0];
}

function lowestHpEnemy(self, units) {
  const enemies = aliveEnemies(units, self.team);
  if (!enemies.length) return null;
  return enemies.sort((a, b) => a.hp - b.hp)[0];
}

function lowestHpAlly(self, units) {
  const allies = aliveAllies(units, self.team);
  if (!allies.length) return null;
  return allies.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
}

function takeDamage(target, amount, kind, source, fx, units) {
  if (!target.alive) return 0;
  // Dodge
  if (Math.random() < target.dodge) {
    fx.push({ t: 'dodge', uid: target.uid });
    return 0;
  }
  let dmg = Math.max(0, Math.floor(amount));
  // Shield (flat shield first)
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, dmg);
    target.shield -= absorbed;
    dmg -= absorbed;
    if (absorbed > 0) fx.push({ t: 'shield', uid: target.uid, amount: absorbed });
  }
  // Knight-trait shieldPct reduction (reduces % of remaining damage)
  if (target.shieldPct > 0) {
    dmg = Math.floor(dmg * (1 - target.shieldPct));
  }
  target.hp -= dmg;
  fx.push({ t: 'dmg', uid: target.uid, amount: dmg, kind, from: source ? source.uid : null });

  // tracking
  target.damageTaken = (target.damageTaken || 0) + dmg;
  if (source) source.damageDealt = (source.damageDealt || 0) + dmg;

  // mana from being hit
  if (target.alive) target.mana = Math.min(target.maxMana, target.mana + MANA_PER_HIT_TAKEN);

  if (target.hp <= 0) {
    // Phoenix passive
    if (target.name.startsWith('Phoenix') && !target.hasRevived) {
      target.hasRevived = true;
      target.hp = Math.floor(target.maxHp * 0.6);
      fx.push({ t: 'revive', uid: target.uid, hp: target.hp });
      return dmg;
    }
    // Augment cheapest revive
    if (target._augRevive && !target.hasRevived) {
      target.hasRevived = true;
      target.hp = Math.floor(target.maxHp * 0.3);
      fx.push({ t: 'revive', uid: target.uid, hp: target.hp });
      return dmg;
    }
    // Undead trait revive
    if (target.traits.includes('Undead') && !target.hasRevived && target._undeadTier) {
      const tier = target._undeadTier;
      if (Math.random() < tier.reviveChance) {
        target.hasRevived = true;
        target.hp = Math.floor(target.maxHp * tier.reviveHpPct);
        fx.push({ t: 'revive', uid: target.uid, hp: target.hp });
        return dmg;
      }
    }
    target.alive = false;
    target.hp = 0;
    if (source) source.kills = (source.kills || 0) + 1;
    fx.push({ t: 'death', uid: target.uid });
  }
  return dmg;
}

function basicAttack(self, units, fx) {
  const target = nearestEnemy(self, units);
  if (!target) return;
  if (chebyshev(self, target) > self.range) {
    // step toward target by 1 cell on x or y
    const dx = Math.sign(target.x - self.x);
    const dy = Math.sign(target.y - self.y);
    if (Math.abs(target.x - self.x) >= Math.abs(target.y - self.y)) self.x += dx;
    else self.y += dy;
    fx.push({ t: 'move', uid: self.uid, x: self.x, y: self.y });
    return;
  }
  // Attack!
  let dmg = self.attack * (1 + (self.buffAtkPct || 0));
  // ranger ranged dmg mul
  if (self.range >= 2) dmg *= self.rangedDmgMul || 1;
  let isCrit = false;
  if (Math.random() < self.critChance) {
    dmg *= self.critMul;
    isCrit = true;
  }
  fx.push({ t: 'atk', uid: self.uid, target: target.uid, crit: isCrit });
  const dealt = takeDamage(target, dmg, 'phys', self, fx, units);
  if (dealt > 0 && self.lifesteal > 0) {
    const heal = Math.floor(dealt * self.lifesteal);
    self.hp = Math.min(self.maxHp, self.hp + heal);
    self.healingDone = (self.healingDone || 0) + heal;
    fx.push({ t: 'heal', uid: self.uid, amount: heal });
  }
  // Elemental chain damage from trait
  if (self._elementalChain && target.alive) {
    takeDamage(target, self._elementalChain, 'magic', self, fx, units);
  }
  // mana from attacking
  self.mana = Math.min(self.maxMana, self.mana + MANA_PER_ATTACK);
}

function castSkill(self, units, fx) {
  const team = self.team;
  const sm = self.spellMul;
  self.casts = (self.casts || 0) + 1;
  fx.push({ t: 'cast', uid: self.uid, name: self.skill });

  switch (self.skill) {
    case 'Bash': {
      const t = nearestEnemy(self, units); if (!t) break;
      takeDamage(t, 80 * sm, 'magic', self, fx, units);
      if (t.alive) t.stunTicks = Math.max(t.stunTicks, Math.round(1.5 * TICKS_PER_SEC));
      break;
    }
    case 'Pounce': {
      const t = lowestHpEnemy(self, units); if (!t) break;
      // jump to target
      self.x = t.x; self.y = t.y;
      fx.push({ t: 'move', uid: self.uid, x: self.x, y: self.y });
      takeDamage(t, 140 * sm, 'phys', self, fx, units);
      break;
    }
    case 'Spark': {
      const enemies = aliveEnemies(units, team);
      const picks = pickRandom(enemies, 2);
      for (const e of picks) takeDamage(e, 90 * sm, 'magic', self, fx, units);
      break;
    }
    case 'Quick Shot': {
      for (let i = 0; i < 3; i++) {
        const t = nearestEnemy(self, units); if (!t) break;
        takeDamage(t, 70 * sm, 'phys', self, fx, units);
      }
      break;
    }
    case 'Bone Throw': {
      const t = nearestEnemy(self, units); if (!t) break;
      takeDamage(t, 110 * sm, 'phys', self, fx, units);
      break;
    }
    case 'Divine Shield': {
      const a = lowestHpAlly(self, units); if (!a) break;
      const heal = 250;
      a.hp = Math.min(a.maxHp, a.hp + heal);
      a.shield = Math.max(a.shield, 200);
      fx.push({ t: 'heal', uid: a.uid, amount: heal });
      fx.push({ t: 'shieldGain', uid: a.uid, amount: 200 });
      break;
    }
    case 'Roar': {
      for (const a of aliveAllies(units, team)) {
        a.buffAtkPct = Math.max(a.buffAtkPct, 0.25);
        a.buffTicks = Math.max(a.buffTicks, 4 * TICKS_PER_SEC);
      }
      fx.push({ t: 'buffAura', uid: self.uid });
      break;
    }
    case 'Fireball': {
      const center = nearestEnemy(self, units); if (!center) break;
      for (const e of aliveEnemies(units, team)) {
        if (chebyshev(e, center) <= 1) takeDamage(e, 220 * sm, 'magic', self, fx, units);
      }
      break;
    }
    case 'Mend': {
      const a = lowestHpAlly(self, units); if (!a) break;
      const heal = Math.floor(320 * sm);
      a.hp = Math.min(a.maxHp, a.hp + heal);
      fx.push({ t: 'heal', uid: a.uid, amount: heal });
      break;
    }
    case 'Backstab': {
      const t = lowestHpEnemy(self, units); if (!t) break;
      const dmg = self.attack * 3 + 50;
      takeDamage(t, dmg * sm, 'phys', self, fx, units);
      break;
    }
    case 'Headshot': {
      const t = farthestEnemy(self, units); if (!t) break;
      takeDamage(t, 350 * sm, 'phys', self, fx, units);
      break;
    }
    case 'Soul Drain': {
      const t = nearestEnemy(self, units); if (!t) break;
      const dealt = takeDamage(t, 200 * sm, 'magic', self, fx, units);
      const heal = Math.floor(dealt * 1.0);
      self.hp = Math.min(self.maxHp, self.hp + heal);
      fx.push({ t: 'heal', uid: self.uid, amount: heal });
      break;
    }
    case 'Earthquake': {
      const enemies = aliveEnemies(units, team);
      // pick most populated row
      const rows = {};
      for (const e of enemies) rows[e.y] = (rows[e.y] || 0) + 1;
      const targetRow = Number(Object.keys(rows).sort((a, b) => rows[b] - rows[a])[0]);
      for (const e of enemies.filter((u) => u.y === targetRow)) {
        takeDamage(e, 200 * sm, 'magic', self, fx, units);
        if (e.alive) e.stunTicks = Math.max(e.stunTicks, TICKS_PER_SEC);
      }
      break;
    }
    case 'Blizzard': {
      const enemies = aliveEnemies(units, team);
      const picks = pickRandom(enemies, 2);
      for (const e of picks) {
        takeDamage(e, 250 * sm, 'magic', self, fx, units);
        if (e.alive) e.freezeTicks = Math.max(e.freezeTicks, 2 * TICKS_PER_SEC);
      }
      break;
    }
    case 'Maul': {
      const t = nearestEnemy(self, units); if (!t) break;
      takeDamage(t, 120 * sm, 'phys', self, fx, units);
      if (t.alive) {
        t.bleedTicks = Math.max(t.bleedTicks, 4 * TICKS_PER_SEC);
        t.bleedDmg = Math.max(t.bleedDmg, 80);
      }
      break;
    }
    case 'Death Coil': {
      const t = lowestHpEnemy(self, units); if (!t) break;
      takeDamage(t, 300 * sm, 'magic', self, fx, units);
      self.hp = Math.min(self.maxHp, self.hp + 150);
      fx.push({ t: 'heal', uid: self.uid, amount: 150 });
      break;
    }
    case 'Chain Lightning': {
      let curr = nearestEnemy(self, units); if (!curr) break;
      const visited = new Set();
      let dmg = 180 * sm;
      for (let i = 0; i < 4 && curr; i++) {
        takeDamage(curr, dmg, 'magic', self, fx, units);
        visited.add(curr.uid);
        const enemies = aliveEnemies(units, team).filter((e) => !visited.has(e.uid));
        if (!enemies.length) break;
        curr = enemies.sort((a, b) => chebyshev(curr, a) - chebyshev(curr, b))[0];
        dmg = Math.floor(dmg * 0.85);
      }
      break;
    }
    case 'Judgement': {
      const t = nearestEnemy(self, units); if (!t) break;
      let dmg = 500;
      if (t.traits.includes('Undead')) dmg += 200;
      takeDamage(t, dmg * sm, 'magic', self, fx, units);
      break;
    }
    case 'Inferno Breath': {
      // 3-cell cone in front of dragon
      const dir = self.team === 1 ? 1 : -1;
      const enemies = aliveEnemies(units, team);
      for (let i = 1; i <= 3; i++) {
        const targetY = self.y + dir * i;
        for (const e of enemies.filter((u) => u.y === targetY)) {
          takeDamage(e, 500 * sm, 'magic', self, fx, units);
        }
      }
      break;
    }
    case 'Rebirth': {
      // proactive heal cast
      const heal = 400;
      self.hp = Math.min(self.maxHp, self.hp + heal);
      fx.push({ t: 'heal', uid: self.uid, amount: heal });
      break;
    }
    case 'Raise Army': {
      // summon 3 ghouls adjacent to self
      const dir = self.team === 1 ? 1 : -1;
      const positions = [
        { x: self.x - 1, y: self.y }, { x: self.x + 1, y: self.y }, { x: self.x, y: self.y + dir },
      ];
      for (const p of positions) {
        if (p.x < 0 || p.x >= BOARD.cols || p.y < 0 || p.y >= BOARD.rows) continue;
        const occ = units.find((u) => u.alive && u.x === p.x && u.y === p.y);
        if (occ) continue;
        units.push({
          uid: nextSummonUid(units),
          team: self.team,
          catalogId: -1,
          name: 'Ghoul', emoji: '👹',
          traits: ['Undead'],
          x: p.x, y: p.y, origX: p.x, origY: p.y,
          hp: 300, maxHp: 300,
          attack: 40, baseAttack: 40,
          attackSpeed: 0.8, atkCooldownTicks: Math.round(TICKS_PER_SEC / 0.8), atkTimer: 0,
          range: 1, mana: 0, maxMana: 999, skill: null,
          spellMul: 1, lifesteal: 0, dodge: 0, critChance: 0, critMul: 2,
          shieldPct: 0, rangedDmgMul: 1,
          stunTicks: 0, freezeTicks: 0, bleedTicks: 0, bleedDmg: 0,
          buffAtkPct: 0, buffTicks: 0, shield: 0, alive: true,
          hasRevived: false, items: [], isSummon: true,
        });
        fx.push({ t: 'summon', team: self.team, name: 'Ghoul', x: p.x, y: p.y });
      }
      break;
    }
    case 'Spear Storm': {
      const enemies = aliveEnemies(units, team);
      for (let i = 0; i < 6; i++) {
        if (!enemies.length) break;
        const t = enemies[Math.floor(Math.random() * enemies.length)];
        takeDamage(t, 110 * sm, 'phys', self, fx, units);
      }
      break;
    }
    case 'Starfall': {
      const enemies = aliveEnemies(units, team);
      const picks = pickRandom(enemies, 3);
      for (const e of picks) takeDamage(e, 800 * sm, 'magic', self, fx, units);
      break;
    }
    case 'Voidblink': {
      const t = lowestHpEnemy(self, units); if (!t) break;
      // teleport adjacent
      const dir = self.team === 1 ? -1 : 1;
      self.x = t.x; self.y = t.y + dir;
      if (self.y < 0) self.y = 0; if (self.y >= BOARD.rows) self.y = BOARD.rows - 1;
      fx.push({ t: 'move', uid: self.uid, x: self.x, y: self.y });
      takeDamage(t, 700 * sm, 'magic', self, fx, units);
      break;
    }
    default: break;
  }
  self.mana = 0;
}

function nextSummonUid(units) {
  return Math.max(...units.map((u) => u.uid)) + 1;
}

function pickRandom(arr, n) {
  const pool = arr.slice();
  const out = [];
  while (pool.length && out.length < n) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function teamAlive(units, team) {
  return units.some((u) => u.alive && u.team === team);
}

function snapshotUnits(units) {
  return units.map((u) => ({
    uid: u.uid, team: u.team, catalogId: u.catalogId, name: u.name, emoji: u.emoji,
    x: u.x, y: u.y, hp: Math.max(0, u.hp), maxHp: u.maxHp, mana: u.mana, maxMana: u.maxMana,
    shield: u.shield || 0, attack: Math.round(u.attack * (1 + (u.buffAtkPct || 0))),
    alive: u.alive, isSummon: !!u.isSummon, items: u.items || [],
    stun: u.stunTicks > 0, freeze: u.freezeTicks > 0, bleed: u.bleedTicks > 0,
    traits: u.traits, star: u.star || 1,
  }));
}

function holyPulseHeal(units, team, amount, fx) {
  const a = aliveAllies(units, team).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
  if (!a) return;
  const heal = Math.min(amount, a.maxHp - a.hp);
  a.hp = Math.min(a.maxHp, a.hp + amount);
  if (heal > 0) {
    a.healingDone = (a.healingDone || 0) + heal; // technically the holy unit healed, not target; close enough for recap
  }
  fx.push({ t: 'heal', uid: a.uid, amount });
}

function simulateBattle(team1Slots, team2Slots, options = {}) {
  const augments = options.augments || { 1: [], 2: [] };
  const traitsRes1 = resolveTraits(team1Slots);
  const traitsRes2 = resolveTraits(team2Slots);
  const traitsActive = { 1: traitsRes1.active, 2: traitsRes2.active };

  const units = placeUnits(team1Slots, team2Slots, traitsActive, augments);

  // attach undead tier reference and elemental chain
  for (const u of units) {
    if (u.traits.includes('Undead')) u._undeadTier = traitsActive[u.team].Undead || null;
    if (u.traits.includes('Elemental') && traitsActive[u.team].Elemental) {
      u._elementalChain = traitsActive[u.team].Elemental.chainDmg;
    }
  }

  const ticks = [];
  ticks.push({
    tick: 0, fx: [{ t: 'start' }], state: snapshotUnits(units),
    info: { traits1: { counts: traitsRes1.counts, active: traitsRes1.active },
            traits2: { counts: traitsRes2.counts, active: traitsRes2.active } },
  });

  let tick = 0;
  let holyPulseTimer1 = 3 * TICKS_PER_SEC;
  let holyPulseTimer2 = 3 * TICKS_PER_SEC;

  while (tick < MAX_TICKS && teamAlive(units, 1) && teamAlive(units, 2)) {
    tick += 1;
    const fx = [];

    // 1) status decay & DOTs
    for (const u of units) {
      if (!u.alive) continue;
      if (u.bleedTicks > 0) {
        u.bleedTicks -= 1;
        if (tick % TICKS_PER_SEC === 0) takeDamage(u, u.bleedDmg, 'true', null, fx, units);
      }
      if (u.buffTicks > 0) {
        u.buffTicks -= 1;
        if (u.buffTicks === 0) u.buffAtkPct = 0;
      }
      if (u.stunTicks > 0) u.stunTicks -= 1;
      if (u.freezeTicks > 0) u.freezeTicks -= 1;
    }

    // 2) Holy pulse heal trait
    holyPulseTimer1 -= 1; holyPulseTimer2 -= 1;
    if (holyPulseTimer1 <= 0) {
      holyPulseTimer1 = 3 * TICKS_PER_SEC;
      const t = traitsActive[1].Holy;
      if (t) holyPulseHeal(units, 1, t.pulseHeal, fx);
    }
    if (holyPulseTimer2 <= 0) {
      holyPulseTimer2 = 3 * TICKS_PER_SEC;
      const t = traitsActive[2].Holy;
      if (t) holyPulseHeal(units, 2, t.pulseHeal, fx);
    }

    // 3) Each unit acts
    const order = units.filter((u) => u.alive)
      .sort((a, b) => (b.attackSpeed - a.attackSpeed) || (a.team - b.team) || (a.uid - b.uid));
    for (const u of order) {
      if (!u.alive) continue;
      if (u.stunTicks > 0) { fx.push({ t: 'stunned', uid: u.uid }); continue; }
      if (u.freezeTicks > 0) { fx.push({ t: 'frozen', uid: u.uid }); continue; }

      if (u.skill && u.mana >= u.maxMana) {
        castSkill(u, units, fx);
        continue;
      }

      u.atkTimer += 1;
      if (u.atkTimer >= u.atkCooldownTicks) {
        u.atkTimer = 0;
        basicAttack(u, units, fx);
      }
    }

    ticks.push({ tick, fx, state: snapshotUnits(units) });
  }

  let winner;
  if (teamAlive(units, 1) && !teamAlive(units, 2)) winner = 1;
  else if (teamAlive(units, 2) && !teamAlive(units, 1)) winner = 2;
  else {
    const hp1 = units.filter((u) => u.team === 1).reduce((s, u) => s + Math.max(0, u.hp), 0);
    const hp2 = units.filter((u) => u.team === 2).reduce((s, u) => s + Math.max(0, u.hp), 0);
    winner = hp1 >= hp2 ? 1 : 2;
  }

  return {
    ticks, winner, totalTicks: tick,
    traits: { 1: traitsRes1, 2: traitsRes2 },
    recap: buildRecap(units),
  };
}

function buildRecap(units) {
  const teams = { 1: [], 2: [] };
  for (const u of units) {
    if (u.isSummon) continue;
    teams[u.team].push({
      uid: u.uid,
      name: u.name,
      emoji: u.emoji,
      catalogId: u.catalogId,
      damageDealt: Math.floor(u.damageDealt || 0),
      damageTaken: Math.floor(u.damageTaken || 0),
      healingDone: Math.floor(u.healingDone || 0),
      kills: u.kills || 0,
      casts: u.casts || 0,
      survived: u.alive,
      finalHp: Math.max(0, Math.floor(u.hp)),
      maxHp: u.maxHp,
    });
  }

  function pickMvp(arr) {
    if (arr.length === 0) return null;
    const sorted = arr.slice().sort((a, b) =>
      (b.damageDealt + b.healingDone * 1.2 + b.kills * 200) -
      (a.damageDealt + a.healingDone * 1.2 + a.kills * 200)
    );
    return sorted[0].uid;
  }
  return {
    1: { units: teams[1], mvpUid: pickMvp(teams[1]) },
    2: { units: teams[2], mvpUid: pickMvp(teams[2]) },
  };
}

module.exports = {
  simulateBattle,
  resolveTraits,
  TICKS_PER_SEC,
  BOARD,
};
