"use client";

import { useState } from "react";

type Tone = "positive" | "neutral" | "stressed";
type Tier = "Ground" | "Flow" | "Gold" | "Sun";

interface Props {
  tone: Tone;
  qScore: number;
  tier: Tier;
  task: string;
  runAt: string;
}

const tierStyles: Record<Tier, string> = {
  Ground: "bg-black/70 text-white border-white/10",
  Flow: "bg-blue-500/20 text-white border-blue-400/30",
  Gold: "bg-amber-400/20 text-black border-amber-300/40",
  Sun: "bg-yellow-300 text-black border-yellow-500/40",
};

export default function QScoreCard({ tone, qScore, tier, task, runAt }: Props) {
  const [done, setDone] = useState(false);

  return (
    <div className={`rounded-2xl p-4 border shadow-xl ${tierStyles[tier]}`}>
      <div className="flex items-center justify-between">
        <div className="text-sm opacity-70">
          {new Date(runAt).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-white/20 capitalize">
          {tone}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="text-4xl font-extrabold">{qScore}</div>
        <div>
          <div className="text-sm opacity-80">Q-Score</div>
          <div className="text-xs">Ranger: <b>{tier}</b></div>
        </div>
      </div>

      <div className="mt-4 text-sm">
        <b>Daily Task:</b> {task}
      </div>

      <button
        onClick={() => setDone(true)}
        className={`mt-4 w-full rounded-xl px-3 py-2 font-semibold transition ${
          done
            ? "bg-green-500 text-white"
            : "bg-white/90 text-black hover:bg-white"
        }`}
      >
        {done ? "✅ Done" : "Mark as Done"}
      </button>
    </div>
  );
}
