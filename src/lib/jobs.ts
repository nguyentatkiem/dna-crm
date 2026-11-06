import { tickSequences } from "./marketing/sequences";
import { syncAdSpend } from "./marketing/ads";
import { tickReminders } from "./notify";
import { refreshPredictions } from "./predict";
import { autoBackup } from "./backup";
import { tickAnniversaryAutomations, tickDateAutomations, tickIdleAutomations } from "./automation";
import { purgeExpired } from "./trash";
import { tickKpi } from "./kpi";
import { tickTickets, tickWarranties } from "./care/jobs";
import { tickBroadcasts } from "./marketing/broadcast";
import { tickContracts, tickDebts } from "./sales/jobs";
import { tickBehaviorScores, tickDuplicateScan, tickRfm } from "./c360/jobs";
import { tickVouchers } from "./voucher/service";
import { tickPerfAlerts } from "./perf/alerts";
import { tickPerfDigest } from "./perf/digest";
import { tickInboxReassign, tickQuality, tickSentiment } from "./chat/jobs";

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
  { name: "Nhắc KPI hằng tuần", everyMin: 60, run: () => tickKpi() },
  { name: "Nhắc hợp đồng", everyMin: 60, run: () => tickContracts().then(() => undefined) },
  { name: "Nhắc công nợ", everyMin: 60, run: () => tickDebts().then(() => undefined) },
  { name: "Gửi hàng loạt", everyMin: 1, run: () => tickBroadcasts().then(() => undefined) },
  { name: "SLA phiếu hỗ trợ", everyMin: 5, run: () => tickTickets().then(() => undefined) },
  { name: "Bảo hành sắp hết hạn", everyMin: 360, run: () => tickWarranties().then(() => undefined) },
  { name: "Tự động hoá ngày kỷ niệm", everyMin: 60, run: () => tickAnniversaryAutomations().then(() => undefined) },
  { name: "Tự động hoá khách im lặng", everyMin: 60, run: () => tickIdleAutomations().then(() => undefined) },
  { name: "Chấm điểm theo hành vi", everyMin: 60, run: () => tickBehaviorScores().then(() => undefined) },
  { name: "Phân tích RFM", everyMin: 60, run: () => tickRfm().then(() => undefined) },
  { name: "Quét hồ sơ trùng", everyMin: 10080, run: () => tickDuplicateScan().then(() => undefined) },
  { name: "Voucher hết hạn", everyMin: 360, run: () => tickVouchers().then(() => undefined) },
  { name: "Chia lại hội thoại", everyMin: 5, run: () => tickInboxReassign().then(() => undefined) },
  { name: "Cảm xúc khách trong chat", everyMin: 5, run: () => tickSentiment().then(() => undefined) },
  { name: "Chất lượng chăm sóc chat", everyMin: 15, run: () => tickQuality().then(() => undefined) },
  { name: "Bản tin hiệu suất tuần", everyMin: 60, run: () => tickPerfDigest().then(() => undefined) },
  { name: "Cảnh báo tiến độ KPI", everyMin: 60, run: () => tickPerfAlerts().then(() => undefined) },
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
