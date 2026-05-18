# ⚔️ Rift Realm

A web-based **auto-battler** with deep tactical depth — traits, items, mana-driven skills, PvE bots, and live PvP.

![mode](https://img.shields.io/badge/mode-Auto%20Battler-purple) ![status](https://img.shields.io/badge/status-playable-brightgreen)

## Highlights

- 🎲 **24 unique units** across 5 rarity tiers (Common → Legendary).
- 🧬 **8 traits / synergies** with multiple breakpoints (Mage, Knight, Beast, Undead, Elemental, Assassin, Holy, Ranger).
- 💎 **8 items** that you can equip on placed units (max 2 per unit).
- 🤖 **PvE mode** with 4 difficulty tiers (Easy → Nightmare) — perfect for solo play.
- ⚔️ **Real-time PvP** matchmaking via WebSocket with placement timer + auto-walkover.
- 🔥 **Tick-based combat sim** at 5 ticks/sec with mana, statuses (stun, freeze, bleed), shields, dodge, crit, lifesteal.
- 📜 **Battle replays** stored on server, playable at 0.5×–4× speed with scrubber.
- 📋 **Daily quests** with gold rewards.
- 🏆 **Leaderboard** ranked by MMR.
- 🪙 **Persistent economy**: gold, units, items, MMR.
- ✨ **Polished UI**: floating damage numbers, attack lines, trait pips, screen shake, glassmorphism, animated stars background.

## Quick start

```bash
# 1. Server
cd server
npm install
npm start          # listens on :3001

# 2. Client (in another terminal)
cd client
npm install
npm run dev        # http://localhost:5173
```

The Vite dev server proxies `/api` and `/ws` to the backend automatically.

## Project layout

```
server/
  server.js        # Express + WebSocket + matchmaking
  battle.js        # Tick-based simulation engine
  gamedata.js      # Static catalog: units / traits / items / bots
  rift_realm.db    # SQLite (auto-created on first run)

client/
  src/
    pages/         # Lobby, Game, Profile, Leaderboard
    components/    # Board, BattleArena, TraitsPanel, ItemBag, ReplayViewer, ...
    api.js         # REST + WebSocket helper
    App.css        # The whole visual style
```

## How to play

1. **Register** — you start with 200 gold, 5 starter units (Squire, Wolfkin, Apprentice, Hunter, Skeleton) and an Iron Sword.
2. **Buy units & items** in the Lobby shop.
3. Pick **PvP** for matchmaking or **PvE** for instant solo play.
4. **Place** up to 8 units on your half (5×2 cells). Click an item then a unit to equip it.
5. **Lock In** — combat is auto-resolved. Win to earn gold + MMR.
6. Watch any past battle as a **replay** from your match history.

## Synergies in brief

| Trait | Effect at top tier |
|---|---|
| Mage | +110% spell power |
| Knight | 50% damage reduction |
| Beast | +0.45 attack speed |
| Undead | Guaranteed revive at 50% HP |
| Elemental | +9 chain magic damage on attacks |
| Assassin | 45% crit + leap to back row |
| Holy | Periodic heal pulse |
| Ranger | +2 range, +50% ranged damage |

Have fun in the rift!
