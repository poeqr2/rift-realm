// /client/src/components/AudioControl.jsx
// Compact audio control with master toggle and music toggle.
import React, { useEffect, useState } from "react";
import { getPrefs, setPrefs, startBGM, stopBGM, unlock, play } from "../audio";

export default function AudioControl() {
  const [open, setOpen] = useState(false);
  const [prefs, setLocal] = useState(getPrefs());

  useEffect(() => {
    if (!prefs.muted) { unlock(); }
  }, []); // eslint-disable-line

  function update(patch) {
    const next = { ...prefs, ...patch };
    setPrefs(patch);
    setLocal(next);
  }

  function toggleMute() {
    update({ muted: !prefs.muted });
    if (!prefs.muted) stopBGM();
  }

  function toggleMusic() {
    if (prefs.music === 0) {
      update({ music: 0.35 });
      unlock(); startBGM();
    } else {
      update({ music: 0 });
      stopBGM();
    }
  }

  return (
    <div className="audio-control">
      <button
        className="audio-btn"
        onClick={() => { setOpen(!open); play("click"); unlock(); }}
        title="Sound settings"
      >
        {prefs.muted ? "🔇" : "🔊"}
      </button>
      {open && (
        <div className="audio-panel">
          <div className="audio-row">
            <span>Master</span>
            <input type="range" min="0" max="1" step="0.05" value={prefs.master}
                   onChange={(e) => update({ master: Number(e.target.value) })} />
          </div>
          <div className="audio-row">
            <span>SFX</span>
            <input type="range" min="0" max="1" step="0.05" value={prefs.sfx}
                   onChange={(e) => update({ sfx: Number(e.target.value) })} />
          </div>
          <div className="audio-row">
            <span>Music</span>
            <input type="range" min="0" max="1" step="0.05" value={prefs.music}
                   onChange={(e) => update({ music: Number(e.target.value) })} />
          </div>
          <div className="audio-row" style={{ gap: 6, justifyContent: "flex-end" }}>
            <button className="btn btn-outline btn-mini" onClick={toggleMute}>
              {prefs.muted ? "Unmute" : "Mute"}
            </button>
            <button className="btn btn-outline btn-mini" onClick={toggleMusic}>
              {prefs.music > 0 ? "Music off" : "Music on"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
