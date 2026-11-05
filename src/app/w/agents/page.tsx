import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { AGENTS } from "@/lib/agents";
import { ago } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Stat } from "@/components/ui/Stat";
import { EmptyState } from "@/components/ui/EmptyState";
import { AgentGrid } from "./AgentGrid";

export default async function AgentsPage() {
  const { workspace } = await requireApp();
  const dayAgo = new Date(Date.now() - 864e5);
  const [settings, logs, today] = await Promise.all([
    db.agentSetting.findMany({ where: { workspaceId: workspace.id } }),
    db.agentLog.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.agentLog.count({ where: { workspaceId: workspace.id, createdAt: { gte: dayAgo } } }),
  ]);
  const state = Object.fromEntries(
    AGENTS.map((a) => {
      const s = settings.find((x) => x.agentKey === a.key);
      return [a.key, { enabled: s?.enabled ?? false, autonomy: s?.autonomy ?? "suggest" }];
    }),
  );
  const enabled = AGENTS.filter((a) => a.live && state[a.key].enabled).length;
  const aiOn = !!process.env.ANTHROPIC_API_KEY;
  const byKey = new Map(AGENTS.map((a) => [a.name, a]));

  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-semibold sm:text-[26px]">Đội AI Agent</h1>
          <p className="mt-1 max-w-3xl text-ink-2">Bật, tắt và chọn mức tự chủ cho từng agent. Agent không bao giờ tự gửi tin ra ngoài khi đang ở mức “Chỉ gợi ý”.</p>
        </div>
        <span className={aiOn ? "badge-success h-7 px-3 text-[12.5px]" : "badge-warning h-7 px-3 text-[12.5px]"}>
          <Icon name={aiOn ? "check" : "lock"} size={13} />
          {aiOn ? "Đã kết nối Claude" : "Chạy bằng luật mẫu"}
        </span>
      </div>
      {!aiOn && (
        <p className="mt-3 max-w-3xl rounded-lg border border-warning-soft bg-warning-soft px-3 py-2 text-[13px] text-ink">
          Chưa có ANTHROPIC_API_KEY: các agent vẫn chạy bằng luật mẫu (chấm điểm, gợi ý, tóm tắt cơ bản). Thêm khoá vào file .env để dùng AI thật.
        </p>
      )}

      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Đang bật" value={`${enabled}/${AGENTS.filter((a) => a.live).length}`} hint="agent sẵn sàng" icon="bot" tone="#00c875" />
        <Stat label="Đang thử nghiệm" value={AGENTS.filter((a) => a.status === "beta").length} hint="cho module mới" icon="spark" tone="#579bfc" />
        <Stat label="Sắp ra mắt" value={AGENTS.filter((a) => a.status === "soon").length} hint="trong lộ trình" icon="clock" tone="#a25ddc" />
        <Stat label="Hoạt động 24 giờ" value={today} hint="lượt ghi nhật ký" icon="history" tone="#fdab3d" />
      </section>

      <AgentGrid initial={state} />

      <section className="card mt-6 p-5">
        <h2 className="mb-3 text-[16px] font-semibold">Nhật ký agent</h2>
        {logs.length === 0 && <EmptyState compact icon="history" title="Chưa có hoạt động" desc="Khi agent chấm điểm, tạo việc hay soạn tin, nhật ký sẽ hiện ở đây." />}
        <ul className="grid divide-y divide-[var(--line-soft)]">
          {logs.map((l) => {
            const a = byKey.get(l.agent);
            return (
              <li key={l.id} className="flex items-start gap-3 py-2.5 text-[13.5px]">
                <span className="grid h-7 w-7 flex-none place-items-center rounded-lg" style={{ background: `${a?.color ?? "#a25ddc"}1f`, color: a?.color ?? "#a25ddc" }}>
                  <Icon name={a?.icon ?? "bot"} size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <b>{l.agent}</b> <span className="text-[12px] text-ink-2">· {ago(l.createdAt)}</span>
                  <span className="block">{l.message}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
