"use client";

import { useState } from "react";
import { AGENTS, AUTONOMY } from "@/lib/agents";
import { Switch } from "@/app/onboarding/Wizard";

type S = Record<string, { enabled: boolean; autonomy: string }>;

const PHASE_COLOR: Record<string, string> = { MVP: "#00c875", V2: "#579bfc", V3: "#a25ddc" };

export function AgentGrid({ initial }: { initial: S }) {
  const [s, setS] = useState(initial);
  async function save(key: string, patch: Partial<S[string]>) {
    setS((x) => ({ ...x, [key]: { ...x[key], ...patch } }));
    await fetch("/api/agents", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, ...patch }) });
  }
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {AGENTS.map((a) => {
        const st = s[a.key];
        return (
          <article key={a.key} className={`card grid content-start gap-3 p-4 ${st.enabled && a.live ? "" : "opacity-70"}`}>
            <header className="flex items-center gap-3">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-[#323338] font-mono text-[12px] font-semibold text-white">{a.mark}</span>
              <div className="min-w-0 flex-1">
                <b className="block text-[15px]">{a.name}</b>
                <span className="text-[12px] font-medium" style={{ color: PHASE_COLOR[a.phase] }}>
                  {a.phase}
                  {!a.live && " · Sắp ra mắt"}
                </span>
              </div>
              <Switch on={st.enabled} onChange={(v) => save(a.key, { enabled: v })} label={`Bật ${a.name}`} disabled={!a.live} />
            </header>
            <p className="text-[13.5px] text-ink-2">{a.desc}</p>
            <label className="flex items-center justify-between text-[13px]">
              <span className="text-ink-2">Mức tự chủ</span>
              <select id={`aut-${a.key}`} value={st.autonomy} disabled={!a.live} onChange={(e) => save(a.key, { autonomy: e.target.value })} className="h-8 rounded border border-line bg-surface px-2">
                {AUTONOMY.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </article>
        );
      })}
    </div>
  );
}
