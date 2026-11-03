import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { AGENTS } from "@/lib/agents";
import { ago } from "@/lib/format";
import { AgentGrid } from "./AgentGrid";

export default async function AgentsPage() {
  const { workspace } = await requireApp();
  const [settings, logs] = await Promise.all([
    db.agentSetting.findMany({ where: { workspaceId: workspace.id } }),
    db.agentLog.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  const state = Object.fromEntries(AGENTS.map((a) => {
    const s = settings.find((x) => x.agentKey === a.key);
    return [a.key, { enabled: s?.enabled ?? false, autonomy: s?.autonomy ?? "suggest" }];
  }));
  const aiOn = !!process.env.ANTHROPIC_API_KEY;

  return (
    <div className="canvas px-6 pb-16 pt-6 sm:px-8">
      <h1 className="text-[26px] font-semibold">Đội AI Agent</h1>
      <p className="mt-1 max-w-3xl text-ink-2">Bật, tắt và chọn mức tự chủ cho từng agent. Agent không bao giờ tự gửi tin ra ngoài khi đang ở mức “Chỉ gợi ý”.</p>
      <p className={`mt-3 inline-flex rounded px-3 py-1.5 text-[13px] ${aiOn ? "bg-[#d6f5e6] text-[#037f4c]" : "bg-[#fff0d6] text-[#8a5a00]"}`}>
        {aiOn ? "Đã kết nối Claude: các agent dùng AI thật." : "Chưa có ANTHROPIC_API_KEY: các agent đang chạy bằng luật mẫu."}
      </p>
      <AgentGrid initial={state} />
      <section className="card mt-6 p-5">
        <h2 className="mb-3 text-[16px] font-semibold">Nhật ký agent</h2>
        {logs.length === 0 && <p className="text-ink-2">Chưa có hoạt động.</p>}
        <ul className="grid divide-y divide-[var(--line-soft)]">
          {logs.map((l) => (
            <li key={l.id} className="grid grid-cols-[110px_160px_minmax(0,1fr)] gap-3 py-2.5 text-[13.5px] max-sm:grid-cols-1 max-sm:gap-0.5">
              <span className="text-ink-2">{ago(l.createdAt)}</span>
              <b>{l.agent}</b>
              <span>{l.message}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
