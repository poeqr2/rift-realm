// /root/rift-realm/client/src/components/Board.jsx

import React from "react";

const COLS = 5; // A-E
const ROWS = 2; // 1-2
const COL_LABELS = ["A", "B", "C", "D", "E"];

function HpBar({ current, max }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
  const color = pct > 50 ? "#4ade80" : pct > 25 ? "#facc15" : "#f87171";
  return (
    <div
      style={{
        width: "100%",
        height: "4px",
        background: "#1f2937",
        borderRadius: "2px",
        overflow: "hidden",
        marginTop: "2px",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: "2px",
          transition: "width 0.4s ease, background 0.4s ease",
        }}
      />
    </div>
  );
}

export default function Board({ units = [], isPlayer, onPlace }) {
  // Build a lookup: "x,y" -> placed unit object
  const placed = {};
  units.forEach((entry) => {
    placed[`${entry.x},${entry.y}`] = entry;
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      {/* Board label */}
      <div
        style={{
          textAlign: "center",
          fontSize: "12px",
          fontWeight: "bold",
          color: isPlayer ? "#a78bfa" : "#f87171",
          letterSpacing: "2px",
          textTransform: "uppercase",
          marginBottom: "4px",
        }}
      >
        {isPlayer ? "⚔ Your Side" : "☠ Enemy Side"}
      </div>

      {/* Column headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, 72px)`,
          gap: "4px",
          paddingLeft: "4px",
        }}
      >
        {COL_LABELS.map((label) => (
          <div
            key={label}
            style={{
              textAlign: "center",
              fontSize: "10px",
              color: "#6b7280",
              fontWeight: "bold",
            }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Grid rows */}
      {Array.from({ length: ROWS }, (_, rowIdx) => (
        <div
          key={rowIdx}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          {/* Row label */}
          <div
            style={{
              width: "16px",
              fontSize: "10px",
              color: "#6b7280",
              fontWeight: "bold",
              textAlign: "center",
              flexShrink: 0,
            }}
          >
            {rowIdx + 1}
          </div>

          {/* Cells */}
          {Array.from({ length: COLS }, (_, colIdx) => {
            const key = `${colIdx},${rowIdx}`;
            const entry = placed[key];
            const isEmpty = !entry;
            const isClickable = isEmpty && !!onPlace;

            return (
              <div
                key={key}
                onClick={() => isClickable && onPlace(colIdx, rowIdx)}
                style={{
                  width: "72px",
                  height: "72px",
                  background: entry
                    ? isPlayer
                      ? "rgba(124, 58, 237, 0.25)"
                      : "rgba(239, 68, 68, 0.2)"
                    : "rgba(15, 10, 30, 0.7)",
                  border: entry
                    ? isPlayer
                      ? "1px solid rgba(139, 92, 246, 0.7)"
                      : "1px solid rgba(239, 68, 68, 0.5)"
                    : "1px solid rgba(75, 85, 99, 0.4)",
                  borderRadius: "8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: isClickable ? "pointer" : "default",
                  transition: "background 0.2s, border-color 0.2s, transform 0.15s",
                  position: "relative",
                  boxShadow: entry
                    ? isPlayer
                      ? "inset 0 0 12px rgba(139, 92, 246, 0.2)"
                      : "inset 0 0 12px rgba(239, 68, 68, 0.15)"
                    : "none",
                }}
                onMouseEnter={(e) => {
                  if (isClickable) {
                    e.currentTarget.style.background = "rgba(124, 58, 237, 0.15)";
                    e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.6)";
                    e.currentTarget.style.transform = "scale(1.04)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (isClickable) {
                    e.currentTarget.style.background = "rgba(15, 10, 30, 0.7)";
                    e.currentTarget.style.borderColor = "rgba(75, 85, 99, 0.4)";
                    e.currentTarget.style.transform = "scale(1)";
                  }
                }}
              >
                {entry ? (
                  <>
                    {/* Attack glow animation class applied externally via id */}
                    <div
                      id={`cell-${entry.unit?.id ?? key}`}
                      style={{
                        fontSize: "28px",
                        lineHeight: 1,
                        filter: "drop-shadow(0 0 6px rgba(167, 139, 250, 0.5))",
                      }}
                    >
                      {entry.unit?.emoji ?? "❓"}
                    </div>
                    <div
                      style={{
                        fontSize: "9px",
                        color: "#d1d5db",
                        marginTop: "2px",
                        maxWidth: "68px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        textAlign: "center",
                      }}
                    >
                      {entry.unit?.name}
                    </div>
                    <div style={{ width: "90%", marginTop: "2px" }}>
                      <HpBar
                        current={entry.currentHp ?? entry.unit?.hp ?? 0}
                        max={entry.unit?.hp ?? 1}
                      />
                    </div>
                  </>
                ) : (
                  isClickable && (
                    <div
                      style={{
                        fontSize: "20px",
                        color: "rgba(107, 114, 128, 0.4)",
                        userSelect: "none",
                      }}
                    >
                      +
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
