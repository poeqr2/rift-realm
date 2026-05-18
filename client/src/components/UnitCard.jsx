// /root/rift-realm/client/src/components/UnitCard.jsx

import React from "react";

function StatBar({ value, max = 100, color, label }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const colors = {
    green: "#4ade80",
    red: "#f87171",
    blue: "#60a5fa",
  };
  return (
    <div style={{ marginBottom: "4px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "10px",
          color: "#9ca3af",
          marginBottom: "2px",
        }}
      >
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div
        style={{
          width: "100%",
          height: "6px",
          background: "#1f2937",
          borderRadius: "3px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: colors[color] || colors.green,
            borderRadius: "3px",
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}

export default function UnitCard({ unit, onBuy, ownedCount }) {
  if (!unit) return null;
  const { name, emoji, cost, hp, attack, speed, skill_name } = unit;

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #1e1b2e 0%, #2d1b4e 100%)",
        border: "1px solid #4c1d95",
        borderRadius: "12px",
        padding: "14px",
        width: "160px",
        position: "relative",
        boxShadow: "0 4px 20px rgba(139, 92, 246, 0.2)",
        transition: "transform 0.2s, box-shadow 0.2s",
        cursor: onBuy ? "pointer" : "default",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = "0 8px 28px rgba(139, 92, 246, 0.4)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 4px 20px rgba(139, 92, 246, 0.2)";
      }}
    >
      {/* Owned count badge */}
      {ownedCount > 0 && (
        <div
          style={{
            position: "absolute",
            top: "8px",
            right: "8px",
            background: "#7c3aed",
            color: "#fff",
            borderRadius: "50%",
            width: "22px",
            height: "22px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            fontWeight: "bold",
            boxShadow: "0 0 8px rgba(124, 58, 237, 0.8)",
          }}
        >
          {ownedCount}
        </div>
      )}

      {/* Emoji */}
      <div
        style={{
          fontSize: "42px",
          textAlign: "center",
          marginBottom: "8px",
          filter: "drop-shadow(0 0 8px rgba(167, 139, 250, 0.6))",
        }}
      >
        {emoji}
      </div>

      {/* Name */}
      <div
        style={{
          textAlign: "center",
          fontWeight: "bold",
          fontSize: "14px",
          color: "#e9d5ff",
          marginBottom: "8px",
          letterSpacing: "0.5px",
        }}
      >
        {name}
      </div>

      {/* Skill badge */}
      {skill_name && (
        <div
          style={{
            textAlign: "center",
            marginBottom: "10px",
          }}
        >
          <span
            style={{
              background: "rgba(139, 92, 246, 0.3)",
              border: "1px solid #7c3aed",
              borderRadius: "20px",
              padding: "2px 8px",
              fontSize: "10px",
              color: "#c4b5fd",
              letterSpacing: "0.3px",
            }}
          >
            ✦ {skill_name}
          </span>
        </div>
      )}

      {/* Stat bars */}
      <div style={{ marginBottom: "10px" }}>
        <StatBar label="HP" value={hp} max={300} color="green" />
        <StatBar label="ATK" value={attack} max={100} color="red" />
        <StatBar label="SPD" value={speed} max={10} color="blue" />
      </div>

      {/* Cost + Buy */}
      {onBuy && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "8px",
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              color: "#fbbf24",
              fontWeight: "bold",
              fontSize: "14px",
            }}
          >
            🪙 {cost}
          </span>
          <button
            onClick={() => onBuy(unit)}
            style={{
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
              border: "none",
              borderRadius: "8px",
              color: "#fff",
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: "bold",
              cursor: "pointer",
              transition: "opacity 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Buy
          </button>
        </div>
      )}
    </div>
  );
}
