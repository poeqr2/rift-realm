// /projects/sandbox/rift-realm/server/gamedata.js
// Static catalog of units, traits, items.
// Kept out of server.js to make balance changes easy.

// ─── TRAITS ────────────────────────────────────────────────────────────────
// Threshold buffs that activate when N units of the trait are on your board.
// Each trait can have multiple breakpoints. The HIGHEST satisfied tier is active.
const TRAITS = {
  Mage: {
    emoji: '🔮', color: '#a78bfa',
    desc: 'Mages gain bonus spell power.',
    tiers: [
      { count: 2, name: 'Adept',   spellMul: 1.25 },
      { count: 4, name: 'Master',  spellMul: 1.65 },
      { count: 6, name: 'Archon',  spellMul: 2.10 },
    ],
  },
  Knight: {
    emoji: '🛡', color: '#60a5fa',
    desc: 'Knights gain a damage-reducing shield.',
    tiers: [
      { count: 2, name: 'Squires',   shieldPct: 0.15 },
      { count: 4, name: 'Vanguard',  shieldPct: 0.30 },
      { count: 6, name: 'Paragons',  shieldPct: 0.50 },
    ],
  },
  Beast: {
    emoji: '🐾', color: '#f59e0b',
    desc: 'Beasts gain attack speed.',
    tiers: [
      { count: 2, name: 'Pack',   atkSpdBonus: 1 },
      { count: 4, name: 'Pride',  atkSpdBonus: 2 },
      { count: 6, name: 'Wild',   atkSpdBonus: 3 },
    ],
  },
  Undead: {
    emoji: '💀', color: '#9333ea',
    desc: 'Undead chance to resurrect once at low HP.',
    tiers: [
      { count: 2, name: 'Cursed',  reviveChance: 0.30, reviveHpPct: 0.35 },
      { count: 4, name: 'Eternal', reviveChance: 1.00, reviveHpPct: 0.50 },
    ],
  },
  Elemental: {
    emoji: '🌪', color: '#22d3ee',
    desc: 'Elementals chain bonus magic damage on attacks.',
    tiers: [
      { count: 2, name: 'Spark',   chainDmg: 4 },
      { count: 4, name: 'Tempest', chainDmg: 9 },
    ],
  },
  Assassin: {
    emoji: '🗡', color: '#f87171',
    desc: 'Assassins jump to back row and crit on first strike.',
    tiers: [
      { count: 2, name: 'Stalker',  critChance: 0.20, critMul: 2.0, leap: true },
      { count: 4, name: 'Reaper',   critChance: 0.45, critMul: 2.5, leap: true },
    ],
  },
  Holy: {
    emoji: '✨', color: '#fde047',
    desc: 'Holy units periodically heal the lowest-HP ally.',
    tiers: [
      { count: 2, name: 'Blessed',  pulseHeal: 6 },
      { count: 3, name: 'Radiant',  pulseHeal: 14 },
    ],
  },
  Ranger: {
    emoji: '🏹', color: '#86efac',
    desc: 'Rangers gain attack range and bonus damage at distance.',
    tiers: [
      { count: 2, name: 'Hunter',  rangeBonus: 1, rangedDmgMul: 1.20 },
      { count: 4, name: 'Sniper',  rangeBonus: 2, rangedDmgMul: 1.50 },
    ],
  },
};

// ─── UNITS (24 total) ──────────────────────────────────────────────────────
// stats: hp, attack, attackSpeed (attacks/sec), range (1..4), maxMana, manaStart, skillName, skillDesc
// rarity affects shop cost and "tier" tag.
// Each unit has 1-2 traits.
const UNITS = [
  // Tier 1 (cheap)
  { id: 1,  name: 'Squire',     emoji: '🛡',  rarity: 1, cost: 1,  hp: 600, attack: 45, attackSpeed: 0.7, range: 1, maxMana: 60,  manaStart: 0,  traits: ['Knight'],          skill: 'Bash',           skillDesc: 'Stuns target 1.5s and deals 80 magic dmg.' },
  { id: 2,  name: 'Wolfkin',    emoji: '🐺',  rarity: 1, cost: 1,  hp: 500, attack: 50, attackSpeed: 0.85,range: 1, maxMana: 50,  manaStart: 0,  traits: ['Beast'],           skill: 'Pounce',         skillDesc: 'Leaps and deals 140 phys dmg.' },
  { id: 3,  name: 'Apprentice', emoji: '🧙',  rarity: 1, cost: 1,  hp: 450, attack: 30, attackSpeed: 0.7, range: 3, maxMana: 50,  manaStart: 10, traits: ['Mage'],            skill: 'Spark',          skillDesc: 'Hits 2 random enemies for 90 magic.' },
  { id: 4,  name: 'Hunter',     emoji: '🏹',  rarity: 1, cost: 1,  hp: 480, attack: 50, attackSpeed: 0.75,range: 3, maxMana: 50,  manaStart: 0,  traits: ['Ranger'],          skill: 'Quick Shot',     skillDesc: 'Fires 3 arrows for 70 phys each.' },
  { id: 5,  name: 'Skeleton',   emoji: '💀',  rarity: 1, cost: 1,  hp: 520, attack: 40, attackSpeed: 0.7, range: 1, maxMana: 70,  manaStart: 0,  traits: ['Undead'],          skill: 'Bone Throw',     skillDesc: 'Hurls a bone for 110 phys dmg.' },

  // Tier 2 (mid)
  { id: 6,  name: 'Paladin',    emoji: '🛡',  rarity: 2, cost: 2,  hp: 850, attack: 55, attackSpeed: 0.6, range: 1, maxMana: 80,  manaStart: 20, traits: ['Knight','Holy'],   skill: 'Divine Shield',  skillDesc: 'Shields ally for 250 + 200 hp.' },
  { id: 7,  name: 'Beastlord',  emoji: '🦁',  rarity: 2, cost: 2,  hp: 800, attack: 65, attackSpeed: 0.8, range: 1, maxMana: 60,  manaStart: 0,  traits: ['Beast','Knight'],  skill: 'Roar',           skillDesc: 'Buffs allies +25% atk for 4s.' },
  { id: 8,  name: 'Pyromancer', emoji: '🔥',  rarity: 2, cost: 2,  hp: 600, attack: 40, attackSpeed: 0.75,range: 4, maxMana: 60,  manaStart: 10, traits: ['Mage','Elemental'],skill: 'Fireball',       skillDesc: 'Explosion deals 220 magic in radius.' },
  { id: 9,  name: 'Cleric',     emoji: '💚',  rarity: 2, cost: 2,  hp: 700, attack: 25, attackSpeed: 0.7, range: 2, maxMana: 50,  manaStart: 25, traits: ['Holy','Mage'],     skill: 'Mend',           skillDesc: 'Heals lowest ally for 320 hp.' },
  { id: 10, name: 'Shadowblade',emoji: '🗡',  rarity: 2, cost: 2,  hp: 650, attack: 70, attackSpeed: 0.95,range: 1, maxMana: 50,  manaStart: 0,  traits: ['Assassin'],        skill: 'Backstab',       skillDesc: '300% atk + 50 to lowest HP enemy.' },
  { id: 11, name: 'Sniper',     emoji: '🎯',  rarity: 2, cost: 2,  hp: 550, attack: 70, attackSpeed: 0.7, range: 4, maxMana: 70,  manaStart: 0,  traits: ['Ranger'],          skill: 'Headshot',       skillDesc: '350 phys dmg to farthest enemy.' },
  { id: 12, name: 'Wraith',     emoji: '👻',  rarity: 2, cost: 2,  hp: 700, attack: 55, attackSpeed: 0.7, range: 1, maxMana: 80,  manaStart: 0,  traits: ['Undead','Assassin'],skill: 'Soul Drain',    skillDesc: 'Steals 200 hp from target.' },

  // Tier 3 (strong)
  { id: 13, name: 'Knight Lord',emoji: '⚔️', rarity: 3, cost: 3,  hp: 1100,attack: 70, attackSpeed: 0.65,range: 1, maxMana: 80,  manaStart: 30, traits: ['Knight'],          skill: 'Earthquake',     skillDesc: 'Stuns row, 200 magic dmg.' },
  { id: 14, name: 'Frostmage',  emoji: '🧊',  rarity: 3, cost: 3,  hp: 700, attack: 45, attackSpeed: 0.75,range: 3, maxMana: 60,  manaStart: 20, traits: ['Mage','Elemental'],skill: 'Blizzard',       skillDesc: 'Freezes 2 enemies for 2s, 250 magic.' },
  { id: 15, name: 'Werebear',   emoji: '🐻',  rarity: 3, cost: 3,  hp: 1000,attack: 75, attackSpeed: 0.85,range: 1, maxMana: 60,  manaStart: 0,  traits: ['Beast'],           skill: 'Maul',           skillDesc: 'Bleeds target 80/s for 4s.' },
  { id: 16, name: 'Lich',       emoji: '☠️', rarity: 3, cost: 3,  hp: 750, attack: 50, attackSpeed: 0.7, range: 3, maxMana: 80,  manaStart: 30, traits: ['Undead','Mage'],   skill: 'Death Coil',     skillDesc: '300 magic, heals self 150.' },
  { id: 17, name: 'Stormcaller',emoji: '🌪',  rarity: 3, cost: 3,  hp: 800, attack: 55, attackSpeed: 0.75,range: 3, maxMana: 70,  manaStart: 20, traits: ['Elemental'],       skill: 'Chain Lightning',skillDesc: 'Bounces 4 times, 180 magic each.' },
  { id: 18, name: 'Templar',    emoji: '✨',  rarity: 3, cost: 3,  hp: 950, attack: 60, attackSpeed: 0.7, range: 1, maxMana: 70,  manaStart: 25, traits: ['Holy','Knight'],   skill: 'Judgement',      skillDesc: '500 holy dmg, +200 if enemy is Undead.' },

  // Tier 4 (premium)
  { id: 19, name: 'Dragon',     emoji: '🐉',  rarity: 4, cost: 5,  hp: 1300,attack: 85, attackSpeed: 0.7, range: 2, maxMana: 90,  manaStart: 0,  traits: ['Elemental','Beast'],skill: 'Inferno Breath',skillDesc: 'Cone: 500 magic in front 3 cells.' },
  { id: 20, name: 'Phoenix',    emoji: '🔥',  rarity: 4, cost: 5,  hp: 1000,attack: 80, attackSpeed: 0.85,range: 2, maxMana: 80,  manaStart: 30, traits: ['Elemental','Holy'],skill: 'Rebirth',        skillDesc: 'On death, revive once at 60% hp.' },
  { id: 21, name: 'Necrolord',  emoji: '🎃',  rarity: 4, cost: 5,  hp: 1100,attack: 75, attackSpeed: 0.7, range: 2, maxMana: 100, manaStart: 30, traits: ['Undead'],          skill: 'Raise Army',     skillDesc: 'Summons 3 ghouls (300 hp, 40 atk).' },
  { id: 22, name: 'Valkyrie',   emoji: '⚔️', rarity: 4, cost: 5,  hp: 1150,attack: 80, attackSpeed: 0.8, range: 1, maxMana: 80,  manaStart: 30, traits: ['Knight','Holy'],   skill: 'Spear Storm',    skillDesc: 'Throws 6 spears for 110 each.' },

  // Tier 5 (legendary)
  { id: 23, name: 'Archon',     emoji: '🌟',  rarity: 5, cost: 8,  hp: 1500,attack: 95, attackSpeed: 0.75,range: 3, maxMana: 100, manaStart: 50, traits: ['Holy','Mage'],     skill: 'Starfall',       skillDesc: '800 magic to 3 random enemies.' },
  { id: 24, name: 'Riftwalker', emoji: '🌌',  rarity: 5, cost: 8,  hp: 1400,attack: 100,attackSpeed: 0.85,range: 1, maxMana: 100, manaStart: 30, traits: ['Assassin','Mage'], skill: 'Voidblink',      skillDesc: 'Teleports + 700 magic to lowest HP.' },
];

const UNIT_BY_ID = {};
for (const u of UNITS) UNIT_BY_ID[u.id] = u;

// ─── ITEMS ─────────────────────────────────────────────────────────────────
// Items are equipped to a unit; max 2 per unit.
// Each provides flat or % stat changes and possibly a passive trigger.
const ITEMS = [
  { id: 1, name: 'Iron Sword',     emoji: '🗡', cost: 2,  desc: '+25 attack',                stats: { attack: 25 } },
  { id: 2, name: 'Plated Armor',   emoji: '🛡', cost: 2,  desc: '+250 hp, +10% shield',      stats: { hp: 250, shieldPct: 0.10 } },
  { id: 3, name: 'Quickboots',     emoji: '👢', cost: 2,  desc: '+0.25 attack speed',        stats: { attackSpeed: 0.25 } },
  { id: 4, name: 'Mage Staff',     emoji: '🪄', cost: 3,  desc: '+30% spell power',          stats: { spellMul: 0.30 } },
  { id: 5, name: 'Vampire Fang',   emoji: '🩸', cost: 3,  desc: 'Lifesteal 15%',             stats: { lifesteal: 0.15 } },
  { id: 6, name: 'Lucky Coin',     emoji: '🪙', cost: 3,  desc: 'Crit chance +20%',          stats: { critChance: 0.20, critMul: 1.5 } },
  { id: 7, name: 'Aegis Charm',    emoji: '🌟', cost: 4,  desc: '+15% dodge, +200 hp',       stats: { dodge: 0.15, hp: 200 } },
  { id: 8, name: 'Mana Crystal',   emoji: '💎', cost: 3,  desc: '+25 starting mana',         stats: { manaStart: 25 } },
];

const ITEM_BY_ID = {};
for (const it of ITEMS) ITEM_BY_ID[it.id] = it;

// ─── BOT TEAMS (PvE) ───────────────────────────────────────────────────────
// Pre-built teams for AI difficulties. Each team uses unit-id refs.
// Format: array of { unitId, x, y, items?:[itemId] }
const BOT_TEAMS = {
  easy: [
    { unitId: 1, x: 1, y: 3 }, { unitId: 5, x: 2, y: 3 }, { unitId: 2, x: 3, y: 3 },
    { unitId: 4, x: 1, y: 0 }, { unitId: 3, x: 3, y: 0 },
  ],
  medium: [
    { unitId: 7, x: 1, y: 3 }, { unitId: 6, x: 2, y: 3 }, { unitId: 13, x: 3, y: 3 },
    { unitId: 8, x: 1, y: 0 }, { unitId: 11, x: 4, y: 0 }, { unitId: 9, x: 0, y: 1 },
  ],
  hard: [
    { unitId: 13, x: 2, y: 3 }, { unitId: 22, x: 1, y: 3 }, { unitId: 15, x: 3, y: 3, items: [1, 5] },
    { unitId: 19, x: 2, y: 2, items: [3] }, { unitId: 14, x: 0, y: 0 }, { unitId: 17, x: 4, y: 0 },
    { unitId: 18, x: 4, y: 3 },
  ],
  nightmare: [
    { unitId: 23, x: 2, y: 3, items: [4, 6] }, { unitId: 24, x: 0, y: 3, items: [1, 3] },
    { unitId: 19, x: 4, y: 3, items: [2] }, { unitId: 22, x: 1, y: 3, items: [5] },
    { unitId: 20, x: 3, y: 3 }, { unitId: 21, x: 2, y: 2 },
    { unitId: 14, x: 0, y: 0 }, { unitId: 17, x: 4, y: 0 },
  ],
};

const REWARDS = {
  pvp_win:  { gold: 60, mmr:  25 },
  pvp_loss: { gold: 20, mmr: -15 },
  bot_easy:      { gold: 30,  mmr: 0 },
  bot_medium:    { gold: 60,  mmr: 0 },
  bot_hard:      { gold: 120, mmr: 0 },
  bot_nightmare: { gold: 250, mmr: 0 },
};

const BOARD = { cols: 5, rows: 4 }; // your half = rows 0..1; enemy half = rows 2..3 (mirrored at battle)

module.exports = {
  UNITS,
  UNIT_BY_ID,
  TRAITS,
  ITEMS,
  ITEM_BY_ID,
  BOT_TEAMS,
  REWARDS,
  BOARD,
};
