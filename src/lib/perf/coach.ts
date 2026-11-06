// Lời nhắc cho "Gợi ý huấn luyện bằng AI" — chỉ dùng số liệu tổng hợp, không có dữ liệu cá nhân của khách.
import { fmtValue, METRIC_DEFS, GROUP_LABEL, GROUPS } from "./metrics";
import type { PersonBoard } from "./board";

/**
 * Dựng prompt từ hồ sơ hiệu suất. Cố ý KHÔNG đưa vào: tên giao dịch tồn đọng, tiêu đề việc, tóm tắt cuộc gọi,
 * nhận xét đánh giá (có thể chứa tên/số điện thoại khách). Chỉ có con số, trung vị đội và nhãn chỉ số.
 */
export function coachPrompt(b: PersonBoard, industry = ""): { system: string; user: string } {
  const lines: string[] = [];
  for (const g of GROUPS) {
    const cs = b.cards.filter((c) => METRIC_DEFS[c.key].group === g && c.v != null);
    if (!cs.length) continue;
    lines.push(`${GROUP_LABEL[g]}:`);
    for (const c of cs) {
      const d = METRIC_DEFS[c.key];
      const dp = c.d?.pct != null ? `, so với kỳ trước ${c.d.pct > 0 ? "+" : ""}${c.d.pct}%` : "";
      lines.push(`- ${d.label}: ${fmtValue(c.key, c.v)} (đội: ${fmtValue(c.key, c.median)}${dp}; ${d.higherBetter ? "càng cao càng tốt" : "càng thấp càng tốt"})`);
    }
  }
  const f = b.funnel.map((s) => `${s.label} ${s.value}${s.conv != null ? ` (${s.conv}%)` : ""}`).join(" → ");
  const user = [
    `Kỳ: ${b.range.label}. Điểm hiệu suất ${b.score ?? "chưa có"}/100 (kỳ trước ${b.scorePrev ?? "chưa có"}), hạng ${b.rank}/${b.rankOf} trong nhóm so sánh.`,
    ...lines,
    `Phễu: ${f}.`,
    `Giao dịch tồn đọng: ${b.stale.length}. Việc quá hạn: ${b.overdueTasks.length}.`,
    `Điểm mạnh (so với đội): ${b.insights.strengths.map((s) => s.label).join(", ") || "chưa rõ"}. Cần cải thiện: ${b.insights.weaknesses.map((s) => s.label).join(", ") || "chưa rõ"}.`,
  ].join("\n");
  const system = `Bạn là huấn luyện viên bán hàng & chăm sóc khách hàng cho doanh nghiệp nhỏ Việt Nam${industry ? ` (ngành ${industry})` : ""}. Dựa CHỈ trên số liệu được cung cấp, viết bằng tiếng Việt, xưng "bạn", giọng tích cực, cụ thể:
1. Nhận định ngắn (2 câu) về hiệu suất kỳ này.
2. Ba việc nên làm trong tuần tới, mỗi việc một dòng bắt đầu bằng "• ", có con số mục tiêu đo được.
3. Một kỹ năng nên luyện và cách luyện trong 15 phút mỗi ngày.
Không bịa số liệu không có. Tối đa 180 từ, không dùng markdown tiêu đề.`;
  return { system, user };
}
