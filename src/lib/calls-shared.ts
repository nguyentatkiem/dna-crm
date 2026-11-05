// Dùng được cả ở trình duyệt (không import node:fs).
export const OUTCOMES = [
  { key: "connected", label: "Nghe máy, đã tư vấn", color: "blue" },
  { key: "appointment", label: "Đặt được lịch hẹn", color: "purple" },
  { key: "won", label: "Chốt được", color: "green" },
  { key: "callback", label: "Hẹn gọi lại", color: "orange" },
  { key: "no_answer", label: "Không nghe máy", color: "gray" },
  { key: "busy", label: "Máy bận / thuê bao", color: "sky" },
  { key: "not_interested", label: "Không có nhu cầu", color: "red" },
  { key: "wrong", label: "Sai số", color: "berry" },
] as const;
export type OutcomeKey = (typeof OUTCOMES)[number]["key"];
export const POSITIVE = new Set<string>(["appointment", "won"]);
export const TALKED = new Set<string>(["connected", "appointment", "won", "callback", "not_interested"]);
export const outcomeOf = (k: string) => OUTCOMES.find((o) => o.key === k) ?? OUTCOMES[0];

export const scoreColor = (n: number | null) => (n == null ? "#c4c4c4" : n >= 80 ? "#00c875" : n >= 60 ? "#fdab3d" : "#df2f4a");
