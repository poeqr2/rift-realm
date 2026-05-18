// /client/src/components/Tutorial.jsx
// First-time onboarding overlay. 5 steps explaining auto-battler basics.
import React, { useEffect, useState } from "react";
import { play } from "../audio";

const KEY = "rr_tutorial_v1";

const STEPS = [
  {
    title: "Welcome to Rift Realm",
    body: (
      <>
        <p>An auto-battler of <b>traits</b>, <b>items</b>, and <b>tactics</b>.</p>
        <p>You build a team, lock it in, and watch the battle play out automatically. Make smart choices in placement and synergy.</p>
      </>
    ),
  },
  {
    title: "Build your roster",
    body: (
      <>
        <p>Buy units in the <b>Shop</b> with gold. Each unit has a <b>rarity</b> (Common → Legendary), <b>traits</b>, and a unique <b>skill</b>.</p>
        <p>Owning <b>3 of the same unit</b> auto-upgrades to a powerful 2★ version when you place all three.</p>
      </>
    ),
  },
  {
    title: "Synergies matter",
    body: (
      <>
        <p>Each unit belongs to one or two <b>traits</b> (Mage, Knight, Beast, etc).</p>
        <p>Stacking traits unlocks <b>tier bonuses</b>: e.g. 4 Mages = +65% spell power. Plan your team around 1–2 dominant synergies.</p>
      </>
    ),
  },
  {
    title: "Place & equip",
    body: (
      <>
        <p>On the battle screen, click a unit on the bench then click a cell on your half (bottom rows).</p>
        <p>Click an <b>item</b> in your bag, then click a placed unit to equip (max 2 per unit). Items stack with traits.</p>
      </>
    ),
  },
  {
    title: "Pick augments + scout",
    body: (
      <>
        <p>Before each ranked match you'll pick <b>1 of 3 augments</b> — global buffs that last the battle.</p>
        <p>After lock-in you'll briefly <b>scout</b> the enemy comp before combat starts. Use it!</p>
        <p>Good luck in the rift.</p>
      </>
    ),
  },
];

export function shouldShowTutorial() {
  return !localStorage.getItem(KEY);
}

export function dismissTutorial() {
  try { localStorage.setItem(KEY, "1"); } catch (_) {}
}

export default function Tutorial({ onClose }) {
  const [step, setStep] = useState(0);

  useEffect(() => { play("notify"); }, []);

  function next() {
    if (step >= STEPS.length - 1) { finish(); return; }
    play("click");
    setStep(step + 1);
  }
  function prev() { if (step > 0) { play("click"); setStep(step - 1); } }
  function finish() { dismissTutorial(); play("matchFound"); onClose && onClose(); }

  const s = STEPS[step];

  return (
    <div className="tutorial-overlay" role="dialog" aria-label="Tutorial">
      <div className="tutorial-modal">
        <div className="tutorial-progress">
          {STEPS.map((_, i) => (
            <span key={i} className={`tutorial-dot ${i === step ? "active" : ""} ${i < step ? "done" : ""}`} />
          ))}
        </div>
        <h2 className="tutorial-title">{s.title}</h2>
        <div className="tutorial-body">{s.body}</div>
        <div className="tutorial-actions">
          <button className="btn btn-outline" onClick={finish}>Skip</button>
          <div className="tutorial-nav">
            {step > 0 && <button className="btn btn-outline" onClick={prev}>◀ Back</button>}
            <button className="btn btn-gold" onClick={next}>
              {step === STEPS.length - 1 ? "Let's go!" : "Next ▶"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
