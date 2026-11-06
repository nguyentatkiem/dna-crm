import { tickSequences } from "./marketing/sequences";
import { syncAdSpend } from "./marketing/ads";
import { tickReminders } from "./notify";
import { refreshPredictions } from "./predict";
import { autoBackup } from "./backup";
import { tickDateAutomations } from "./automation";
import { purgeExpired } from "./trash";

type Job = { name: string; everyMin: number; run: () => Promise<void> };

/** Việc chạy nền khi CRM chạy trên máy/VPS (npm start, Docker). Không cần cron ngoài. */
export const JOBS: Job[] = [
  { name: "Kịch bản chăm sóc", everyMin: 1, run: tickSequences },
  { name: "Nhắc việc", everyMin: 5, run: tickReminders },
  { name: "Dự báo chốt", everyMin: 60, run: () => refreshPredictions() },
  { name: "Chi phí quảng cáo", everyMin: 360, run: () => syncAdSpend() },
  { name: "Sao lưu", everyMin: 60, run: autoBackup },
  { name: "Tự động hoá theo ngày", everyMin: 60, run: () => tickDateAutomations() },
  { name: "Dọn thùng rác", everyMin: 360, run: () => purgeExpired() },
];

const g = globalThis as unknown as { crmJobs?: { started: boolean; last: Record<string, number>; running: Set<string> } };

export async function runDueJobs(now = Date.now()) {
  const st = (g.crmJobs ??= { started: true, last: {}, running: new Set() });
  for (const j of JOBS) {
    if (st.running.has(j.name)) continue;
    if (now - (st.last[j.name] ?? 0) < j.everyMin * 60_000) continue;
    st.last[j.name] = now;
    st.running.add(j.name);
    j.run()
      .catch((e) => console.error(`[job ${j.name}]`, e instanceof Error ? e.message : e))
      .finally(() => st.running.delete(j.name));
  }
}

export function startJobs() {
  if (g.crmJobs?.started || process.env.CRM_JOBS === "off") return;
  g.crmJobs = { started: true, last: {}, running: new Set() };
  // Chờ server khởi động xong rồi mới chạy lượt đầu.
  setTimeout(() => runDueJobs(), 20_000);
  setInterval(() => runDueJobs(), 60_000).unref?.();
}
