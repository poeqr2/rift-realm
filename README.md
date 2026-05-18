# ⚔️ Rift Realm

A web-based **auto-battler** with deep tactical depth — traits, items, skills, augments, 2★ upgrades, friends & private matches, all wrapped in a polished real-time UI.

![mode](https://img.shields.io/badge/mode-Auto%20Battler-purple) ![status](https://img.shields.io/badge/status-playable-brightgreen) ![tests](https://img.shields.io/badge/tests-37%20passing-success)

## Highlights

### Game systems
- 🎲 **24 unique units** across 5 rarity tiers (Common → Legendary), each with a unique skill.
- 🧬 **8 traits / synergies** with multi-tier breakpoints (Mage, Knight, Beast, Undead, Elemental, Assassin, Holy, Ranger).
- 💎 **8 craftable items** (max 2 per unit) with stat boosts + passives.
- ⭐ **2★ upgrades**: stack 3 of the same unit on the board → auto-merges into a 2★ powerhouse (1.7× attack, 1.8× HP).
- ⚡ **Augments**: pre-battle, pick 1 of 3 random global buffs (12 total — Forged Steel, Battle Frenzy, Vampiric Aura, Coinpurse, Second Wind, …).
- 🔭 **Scout phase** (4 s) shows the enemy comp before each PvP fight — adapt your tactics.
- 🤖 **Adaptive PvE bots** at 4 difficulties × 3 variants each; the bot picks the variant whose synergies counter your traits.

### Combat
- ⏱ **Tick-based simulation** at 5 ticks/s with mana-driven skills.
- 🔥 **Per-skill particle effects** (fire, ice, sparks, stars, void, holy, smoke).
- 🛡 Status effects: stun, freeze, bleed, shield, dodge, crit, lifesteal, knockup.
- 📊 **Full battle recap**: per-unit damage / taken / heal / kills / casts, MVP highlight, total bars.

### Social & ranking
- 🏆 **Tiered MMR**: Bronze → Silver → Gold → Platinum → Diamond → Master → Apex, with **Elo K-factor** (new players gain/lose more, veterans less).
- 🔥 **Win streak bonuses** (+10 gold per consecutive win, capped at +50) and **comeback bonus** (+30 after losestreak ≥ 3).
- 📅 **Seasons** with 30-day cycles (stored in DB; ready for archived snapshots).
- 👥 **Friends list** with friend codes, request/accept flow, online indicators, and **invite-to-private-match** over WebSocket.
- 📨 **Replay sharing**: any owned match can generate a public token; anyone can watch via `/replay/<token>` (no auth required).
- 📋 **Daily quests** including a 2★ unlock quest.
- 🏅 Ranked **leaderboard** with tier badges and win-rate.

### Polish
- 🔊 **Sound effects + ambient BGM** generated procedurally via Web Audio API (no audio files needed). Per-bus volume sliders.
- 🎓 **First-time tutorial** (5 steps) explaining traits, items, augments, and scouting.
- 🪄 **Drag-and-drop** placement; click also works.
- 💾 **3 saved loadouts** per account (server-persisted).
- 📱 **Responsive layout** down to phone widths.
- 🎉 **Victory recap modal** with MVP card, damage bars, augment summary, and one-click replay-share.
- ✨ Glassmorphism UI, animated star background, neon trait pips, screen-shake on big hits.

### Reliability & safety
- 🗄 **DB migrations** runner (4 versions; safe to upgrade in place).
- 💓 **WebSocket heartbeat** (ping every 25 s, drop dead sockets after 60 s).
- 🚦 **Rate limiting** per IP (token-bucket) on auth, shop, play endpoints + per-socket WS limiter.
- 🛡 **Anti-AFK** abandon counter on disconnect / concede / placement timeout.
- 🔁 **PvP reconnection**: server holds the match for 8 s on disconnect; client persists `matchId` in `sessionStorage`.
- ✅ **37 tests passing** (12 battle-engine + 25 e2e API/WS).

## Quick start

```bash
# 1. Server
cd server
npm install
npm start          # listens on :3001
npm test           # battle-engine tests

# 2. Client (in another terminal)
cd client
npm install
npm run dev        # http://localhost:5173
```

The Vite dev server proxies `/api` and `/ws` to the backend automatically.

## Project layout

```
server/
  server.js        # Express + WebSocket + matchmaking + auth + friends
  battle.js        # Tick-based simulation engine with augments + recap
  gamedata.js      # Static catalog: units / traits / items / augments / bot variants
  ranking.js       # Tiers, K-factor, Elo math
  migrations.js    # DB migration runner (auto-applied at boot)
  rateLimit.js     # Token-bucket limiter for HTTP + WS
  test.js          # Unit tests (run with `npm test`)
  rift_realm.db    # SQLite (auto-created on first run)

client/
  src/
    pages/         # Lobby, Game, Profile, Leaderboard, PublicReplay
    components/    # Board, BattleArena, TraitsPanel, ItemBag, AugmentPicker,
                   # FriendsPanel, LoadoutManager, Tutorial, AudioControl,
                   # ReplayViewer, VictoryRecap, …
    audio.js       # Synthetic SFX + ambient BGM (Web Audio API)
    api.js         # REST + WebSocket helper
    App.css        # Whole visual system
```

## How to play

1. **Register** — you start with 200 gold, 5 starter units, an Iron Sword, **and a unique friend code**.
2. (First time) Walk through the **5-step tutorial**.
3. **Buy units & items** in the Lobby shop.
4. Pick **PvP** for matchmaking or **PvE** for instant solo play; both phases let you pick an **augment** first.
5. **Build & lock in**: click or drag bench units onto your half (5 × 2 cells). Click an item then a unit to equip; click an item dot on a placed unit to unequip; click the ✕ on a placed unit to remove. Stack 3 of the same unit for an automatic 2★ upgrade.
6. (PvP) **Scout** the enemy for 4 s before combat starts.
7. **Watch** the auto-resolved battle play out with floating numbers, attack lines, and skill particles.
8. After the match: see the **MVP recap**, claim **daily quest** rewards, share the replay link with friends, queue again.
9. Add **friends** by code, then invite them to a **private match** straight from the lobby.

## Synergies

| Trait | Top-tier effect |
|---|---|
| Mage | +110% spell power |
| Knight | 50% damage reduction |
| Beast | +0.45 attack speed |
| Undead | Guaranteed revive at 50% HP |
| Elemental | +9 chain magic damage on attacks |
| Assassin | 45% crit + leap to back row |
| Holy | Periodic heal pulse |
| Ranger | +2 range, +50% ranged damage |

## Augments (sample)

| Augment | Effect |
|---|---|
| Forged Steel | +15 attack to all units |
| Iron Will | +150 HP to all units |
| Battle Frenzy | +0.20 attack speed |
| Mana Surge | +30 starting mana |
| Aegis Pact | 15% damage reduction |
| Lucky Strikes | +15% crit chance |
| Vampiric Aura | 10% lifesteal |
| Phantom Step | 10% dodge |
| Arcane Conduit | +25% spell power |
| Coinpurse | +50 gold (win or lose) |
| Second Wind | Cheapest unit revives once at 30% |
| Divine Pulse | +8 to Holy heal pulses |

Have fun in the rift!
