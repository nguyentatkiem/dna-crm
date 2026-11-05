"use client";

import Link from "next/link";
import { useState } from "react";
import { AGENT_CATEGORIES, AGENTS, AUTONOMY, STATUS_LABEL, type AgentStatus } from "@/lib/agents";
import { Switch } from "@/app/onboarding/Wizard";
import { Icon } from "@/components/Icon";
import { Tabs } from "@/components/ui/Tabs";
import { Segmented } from "@/components/ui/Segmented";
import { EmptyState } from "@/components/ui/EmptyState";

type S = Record<string, { enabled: boolean; autonomy: string }>;

const STATUS_CLASS: Record<AgentStatus, string> = { live: "badge-success", beta: "badge-info", soon: "badge" };

export function AgentGrid({ initial }: { initial: S }) {
  const [s, setS] = useState(initial);
  const [tab, setTab] = useState("all");
  const [error, setError] = useState("");

  async function save(key: string, patch: Partial<S[string]>) {
    const before = s[key];
    setS((x) => ({ ...x, [key]: { ...x[key], ...patch } }));
    setError("");
    const res = await fetch("/api/agents", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, ...patch }) }).catch(() => null);
    if (!res?.ok) {
      setS((x) => ({ ...x, [key]: before }));
      setError("Chưa lưu được thay đổi, thử lại sau.");
    }
  }

  const list = AGENTS.filter((a) => (tab === "all" ? true : tab === "on" ? s[a.key]?.enabled && a.live : a.category === tab));
  const tabs = [
    { key: "all", label: "Tất cả", count: AGENTS.length },
    { key: "on", label: "Đang bật", count: AGENTS.filter((a) => s[a.key]?.enabled && a.live).length },
    ...AGENT_CATEGORIES.map((c) => ({ key: c.key, label: c.label, count: AGENTS.filter((a) => a.category === c.key).length })),
  ];

  return (
    <div className="mt-6">
      <Tabs items={tabs} value={tab} onChange={setTab} />
      {error && <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
      {list.length === 0 && <EmptyState icon="bot" title="Chưa bật agent nào" desc="Chọn tab Tất cả và bật agent bạn muốn dùng." />}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((a) => {
          const st = s[a.key] ?? { enabled: false, autonomy: "suggest" };
          const on = st.enabled && a.live;
          return (
            <article key={a.key} className={`card card-hover relative flex min-w-0 flex-col gap-3 overflow-hidden p-4 ${a.live ? "" : "bg-surface-2"}`}>
              <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: on ? a.color : "transparent" }} />
              <header className="flex items-start gap-3">
                <span className="relative grid h-11 w-11 flex-none place-items-center rounded-xl" style={{ background: `${a.color}1f`, color: a.color }}>
                  <Icon name={a.icon} size={21} />
                  {on && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-surface bg-success" />}
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-[15px]">{a.name}</b>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className={STATUS_CLASS[a.status]}>{STATUS_LABEL[a.status]}</span>
                    <span className="text-[11.5px] text-ink-2">{AGENT_CATEGORIES.find((c) => c.key === a.category)?.label}</span>
                  </span>
                </div>
                <Switch on={st.enabled && a.live} onChange={(v) => save(a.key, { enabled: v })} label={`Bật ${a.name}`} disabled={!a.live} />
              </header>
              <p className="flex-1 text-[13.5px] leading-relaxed text-ink-2">{a.desc}</p>
              <footer className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
                {a.live ? (
                  <Segmented size="sm" label={`Mức tự chủ của ${a.name}`} options={AUTONOMY.map((o) => ({ key: o.key, label: o.label }))} value={st.autonomy} onChange={(v) => save(a.key, { autonomy: v })} />
                ) : (
                  <span className="text-[12.5px] text-ink-2">Đang phát triển</span>
                )}
                {a.key === "copilot" ? (
                  <button type="button" onClick={() => window.dispatchEvent(new Event("copilot:open"))} className="ml-auto inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                    Mở <Icon name="open" size={13} />
                  </button>
                ) : a.href && a.live ? (
                  <Link href={a.href} className="ml-auto inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                    Mở <Icon name="open" size={13} />
                  </Link>
                ) : null}
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
