// /client/src/components/LoadoutManager.jsx
// Save/load up to 3 named board presets. Saved server-side in `loadouts` table.
import React, { useState } from "react";
import { saveLoadout, deleteLoadout } from "../api";
import { play } from "../audio";

export default function LoadoutManager({ loadouts = [], currentBoard, onLoad, onUpdated }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(slot) {
    if (!currentBoard || currentBoard.length === 0) return;
    const trimmed = (name || `Loadout ${slot}`).slice(0, 32);
    setBusy(true);
    try {
      const data = await saveLoadout(slot, trimmed, currentBoard.map((s) => ({
        unitId: s.unitId, x: s.x, y: s.y, items: s.items || [],
      })));
      play("pickup");
      setName("");
      onUpdated && onUpdated(data.loadouts || []);
    } catch (_) { /* ignored */ }
    setBusy(false);
  }

  async function remove(slot) {
    setBusy(true);
    try {
      await deleteLoadout(slot);
      play("click");
      onUpdated && onUpdated((loadouts || []).filter((l) => l.slot !== slot));
    } catch (_) {}
    setBusy(false);
  }

  return (
    <div className="loadout-mgr">
      <div className="loadout-row">
        <input
          className="form-input loadout-input"
          placeholder="Loadout name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="loadout-grid">
        {[1, 2, 3].map((slot) => {
          const existing = (loadouts || []).find((l) => l.slot === slot);
          return (
            <div key={slot} className={`loadout-card ${existing ? "filled" : "empty"}`}>
              <div className="loadout-slot-num">Slot {slot}</div>
              {existing ? (
                <>
                  <div className="loadout-name" title={existing.name}>{existing.name}</div>
                  <div className="loadout-meta">{(existing.data || []).length} units</div>
                  <div className="loadout-actions">
                    <button className="btn btn-mini btn-outline" disabled={busy}
                            onClick={() => { play("click"); onLoad && onLoad(existing.data || []); }}>Load</button>
                    <button className="btn btn-mini btn-outline" disabled={busy} onClick={() => save(slot)}>Save</button>
                    <button className="btn btn-mini btn-danger" disabled={busy} onClick={() => remove(slot)}>✕</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="loadout-empty-msg">empty</div>
                  <div className="loadout-actions">
                    <button className="btn btn-mini btn-gold"
                            disabled={busy || !currentBoard || currentBoard.length === 0}
                            onClick={() => save(slot)}>
                      Save board here
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
