import { db, parseJson } from "./db";
import type { WorkspaceConfig } from "./config/schema";
import { currentPeriod, memberNames, teamOf, type Metric } from "./kpi";

/**
 * Dữ liệu mẫu Đợt 4 (quản trị đội): chỉ tiêu KPI tháng này cho từng người + cả công ty,
 * và 5 bài trên bảng tin (thông báo đã ghim, khoe đơn, bài có cảm xúc và bình luận).
 * Chạy lại nhiều lần không sinh trùng: đã có bài thì bỏ qua bảng tin, chỉ tiêu chỉ điền ô trống.
 */
export async function seedAdmin(workspaceId: string) {
  const cfgRow = await db.workspaceConfig.findFirst({ where: { workspaceId, isActive: true } });
  const cfg = parseJson<WorkspaceConfig | null>(cfgRow?.configJson, null);
  const owner = await db.membership.findFirst({ where: { workspaceId, role: "owner" }, select: { user: { select: { name: true } } } });
  const boss = owner?.user.name ?? "Quản lý";
  const people = teamOf(cfg ?? { team: [] }, await memberNames(workspaceId)).filter((n) => n !== boss);
  const period = currentPeriod();

  // Chỉ tiêu: mỗi người một mức, cả công ty = tổng (tỉ lệ chốt giữ 40%).
  const per: Record<Metric, number> = { revenue: 60_000_000, won_deals: 6, new_contacts: 15, calls: 80, win_rate: 40, tickets_resolved: 10 };
  const cells: { who: string; metric: Metric; target: number }[] = [];
  people.forEach((who, i) => {
    const k = 1 + (i % 3) * 0.25; // mỗi người chỉ tiêu khác nhau một chút
    for (const [m, v] of Object.entries(per) as [Metric, number][]) cells.push({ who, metric: m, target: m === "win_rate" ? v : Math.round(v * k) });
  });
  for (const m of Object.keys(per) as Metric[]) {
    const sum = cells.filter((c) => c.metric === m).reduce((s, c) => s + c.target, 0);
    cells.push({ who: "", metric: m, target: m === "win_rate" ? per.win_rate : Math.max(sum, per[m]) });
  }
  const have = new Set((await db.kpiTarget.findMany({ where: { workspaceId, period }, select: { who: true, metric: true } })).map((r) => `${r.who}|${r.metric}`));
  const newCells = cells.filter((c) => !have.has(`${c.who}|${c.metric}`));
  if (newCells.length) await db.kpiTarget.createMany({ data: newCells.map((c) => ({ workspaceId, period, ...c })) });

  // Bảng tin.
  // Bỏ qua bài "chốt đơn" do dữ liệu mẫu bán hàng tự đăng trước đó.
  if (await db.post.count({ where: { workspaceId, kind: { not: "win" } } })) return { targets: newCells.length, posts: 0 };
  const a = people[0] ?? boss;
  const b = people[1] ?? boss;
  const c = people[2] ?? a;
  const ago = (h: number) => new Date(Date.now() - h * 3600e3);
  const posts: { author: string; body: string; kind: string; channel: string; pinned?: boolean; reactions?: Record<string, string[]>; at: Date; comments?: { author: string; body: string; at: Date }[] }[] = [
    {
      author: boss,
      kind: "announcement",
      channel: "chung",
      pinned: true,
      body: `Chào cả nhà! Chỉ tiêu tháng ${period.slice(5)}/${period.slice(0, 4)} đã lên trang KPI. Mỗi thứ Hai hệ thống sẽ nhắc ai đang chậm nhịp. Cố lên nhé 💪`,
      reactions: { "👍": [a, b] },
      at: ago(72),
      comments: [{ author: a, body: `Đã xem, em sẽ bám sát ạ. @${boss} cho em xin thêm data khách cũ nhé.`, at: ago(70) }],
    },
    {
      author: b,
      kind: "win",
      channel: "chung",
      body: "🎉 Vừa chốt gói liệu trình 12 buổi cho chị Mai Anh, 18,5 triệu. Cảm ơn team tư vấn đã hỗ trợ!",
      reactions: { "🎉": [boss, a, c], "👏": [boss], "❤️": [a] },
      at: ago(26),
      comments: [
        { author: boss, body: `Quá đỉnh @${b}! Chia sẻ kịch bản chốt cho mọi người học hỏi nhé.`, at: ago(25) },
        { author: c, body: "Chúc mừng chị 🎉", at: ago(24) },
      ],
    },
    {
      author: a,
      kind: "post",
      channel: "chung",
      body: `Mẹo nhỏ: khách hỏi giá qua Zalo thì gọi lại trong 5 phút, tỉ lệ đặt lịch cao hơn hẳn. @${c} thử áp dụng xem sao.`,
      reactions: { "👍": [boss, b] },
      at: ago(8),
    },
    {
      author: c,
      kind: "post",
      channel: "telesales",
      body: "Ca chiều nay ai trực hotline thay mình 30 phút được không? Mình đi gặp khách VIP.",
      reactions: { "👍": [a] },
      at: ago(4),
      comments: [{ author: a, body: "Để mình trực cho, cứ đi đi.", at: ago(3.5) }],
    },
    {
      author: boss,
      kind: "post",
      channel: "chung",
      body: "Thứ Sáu này 17h họp tổng kết tuần, cả nhà chuẩn bị số liệu cuộc gọi và khách mới nhé.",
      reactions: { "👍": [a, b, c], "❤️": [b] },
      at: ago(1),
    },
  ];
  for (const p of posts) {
    // Bỏ khoá rỗng và tên trùng.
    const reactions = Object.fromEntries(Object.entries(p.reactions ?? {}).map(([e, w]) => [e, [...new Set(w)]]).filter(([e, w]) => (w as string[]).length && ["👍", "❤️", "🎉", "👏", "😂"].includes(e as string)));
    await db.post.create({
      data: {
        workspaceId,
        author: p.author,
        body: p.body,
        kind: p.kind,
        channel: p.channel,
        pinned: !!p.pinned,
        reactionsJson: JSON.stringify(reactions),
        createdAt: p.at,
        comments: { create: (p.comments ?? []).map((cm) => ({ author: cm.author, body: cm.body, createdAt: cm.at })) },
      },
    });
  }
  return { targets: newCells.length, posts: posts.length };
}
