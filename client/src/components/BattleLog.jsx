// /root/rift-realm/client/src/components/BattleLog.jsx

import React, { useEffect, useRef, useState } from "react";

function EventLine({ event, isNew }) {
  const { actor, action, target, damage, healed } = event;

  let color = "#d1d5db";
  let icon = "•";
  let text = "";

  if (action === "attack" || damage > 0) {
    color = "#fca5a5";
    icon = "⚔";
    text = `${actor} attacks ${target} for ${damage} dmg`;
  } else if (action === "heal" || healed > 0) {
    color = "#86efac";
    icon = "✦";
    text = `${actor} heals ${target} for ${healed}`;
  } else if (action === "skill") {
    color = "#c4b5fd";
    icon = "✸";
    text = `${actor} uses skill on ${target}${damage ? ` (${damage} dmg)` : ""}${healed ? ` (+${healed} hp)` : ""}`;
  } else if (action === "death") {
    color = "#9ca3af";
    icon = "💀";
    text = `${actor} is defeated`;
  } else {
    text = `${actor} ${action}${target ? ` → ${target}` : ""}`;
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "6px",
        padding: "2px 0",
        color,
        fontSize: "12px",
        animation: isNew ? "fadeSlideIn 0.3s ease forwards" : "none",
        opacity: isNew ? 0 : 1,
      }}
    >
      <span style={{ flexShrink: 0, fontSize: "11px" }}>{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function TickBlock({ tick, events, isLatest }) {
  return (
    <div
      style={{
        marginBottom: "8px",
        borderLeft: `2px solid ${isLatest ? "#7c3aed" : "#374151"}`,
        paddingLeft: "8px",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          color: isLatest ? "#a78bfa" : "#6b7280",
          fontWeight: "bold",
          marginBottom: "3px",
          letterSpacing: "1px",
        }}
      >
        TICK {tick}
      </div>
      {events.map((ev, i) => (
        <EventLine key={i} event={ev} isNew={isLatest} />
      ))}
    </div>
  );
}

export default function BattleLog({ log = [] }) {
  const bottomRef = useRef(null);
  const [prevLen, setPrevLen] = useState(0);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
    setPrevLen(log.length);
  }, [log]);

  return (
    <div
      style={{
        background: "rgba(10, 7, 20, 0.85)",
        border: "1px solid #374151",
        borderRadius: "10px",
        padding: "12px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontSize: "12px",
          fontWeight: "bold",
          color: "#a78bfa",
          letterSpacing: "2px",
          textTransform: "uppercase",
          marginBottom: "10px",
          borderBottom: "1px solid #374151",
          paddingBottom: "6px",
          flexShrink: 0,
        }}
      >
        📜 Battle Log
      </div>

      <div
        style={{
          overflowY: "auto",
          flex: 1,
          paddingRight: "4px",
          scrollbarWidth: "thin",
          scrollbarColor: "#4c1d95 transparent",
        }}
      >
        <style>{`
          @keyframes fadeSlideIn {
            from { opacity: 0; transform: translateX(-6px); }
            to   { opacity: 1; transform: translateX(0); }
          }
        `}</style>

        {log.length === 0 && (
          <div
            style={{
              color: "#4b5563",
              fontSize: "12px",
              textAlign: "center",
              marginTop: "20px",
            }}
          >
            Awaiting battle...
          </div>
        )}

        {log.map((entry, idx) => (
          <TickBlock
            key={entry.tick ?? idx}
            tick={entry.tick ?? idx + 1}
            events={entry.events ?? []}
            isLatest={idx >= prevLen - 1}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
