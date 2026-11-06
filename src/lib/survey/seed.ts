// Dữ liệu mẫu cho Khảo sát & Voucher: một khảo sát NPS (~15 câu trả lời rải theo tuần), một CSAT, hai chương trình voucher.
import { db, parseJson } from "../db";
import { totals, parseLines } from "../sales/lines";
import { computeDiscount, generateCode } from "../voucher/shared";
import { defaultQuestions, npsBucket, NPS_LABEL } from "./shared";

const D = 864e5;

/** Gieo dữ liệu mẫu. Chạy lại không nhân đôi: phần khảo sát bỏ qua nếu đã có khảo sát, phần voucher bỏ qua nếu đã có chương trình. */
export async function seedSurveyVoucher(workspaceId: string): Promise<void> {
  const contacts = await db.record.findMany({ where: { workspaceId, objectKey: "contacts" }, orderBy: { createdAt: "asc" }, take: 12 });
  const now = Date.now();
  const at = (days: number, h = 10) => new Date(now - days * D + h * 36e5 - 10 * 36e5);

  if (!(await db.survey.count({ where: { workspaceId } }))) {
    const nps = await db.survey.create({ data: { workspaceId, name: "Khảo sát NPS sau liệu trình", kind: "nps", questionsJson: JSON.stringify(defaultQuestions("nps")), thankYou: "Cảm ơn bạn! Góp ý của bạn giúp chúng tôi phục vụ tốt hơn.", createdBy: "Hệ thống", createdAt: at(60) } });
    // [điểm, góp ý, ngày trước, chỉ số khách (-1 = link mở ẩn danh)]
    const plan: [number, string, number, number][] = [
      [10, "Nhân viên rất nhiệt tình, da cải thiện rõ sau 3 buổi.", 52, 0],
      [9, "Không gian sạch sẽ, thơm, sẽ giới thiệu bạn bè.", 47, 1],
      [6, "Phải chờ khá lâu dù đã đặt lịch trước.", 45, 2],
      [8, "Dịch vụ ổn, giá hơi cao so với mặt bằng.", 40, 3],
      [10, "Kỹ thuật viên tay nghề cao, rất hài lòng!", 33, 4],
      [3, "Da bị kích ứng nhẹ sau buổi đầu, chưa được tư vấn kỹ.", 30, 5],
      [9, "", 26, 6],
      [7, "Ổn, mong có thêm khung giờ buổi tối.", 22, 7],
      [10, "Lần nào đến cũng được chăm sóc chu đáo.", 19, 8],
      [9, "Gói triệt lông hiệu quả hơn mong đợi.", 15, 9],
      [5, "Lễ tân trả lời tin nhắn chậm.", 12, 10],
      [10, "Tuyệt vời, đã rủ chị gái đi cùng.", 8, 11],
      [8, "", 5, -1],
      [9, "Ưng nhất là được nhắc lịch trước một ngày.", 3, -1],
      [10, "Giá hợp lý, kết quả thấy rõ.", 1, 0],
    ];
    const last = new Map<string, { nps: number; at: Date }>();
    for (const [score, comment, ago, ci] of plan) {
      const rec = ci >= 0 ? contacts[ci % Math.max(1, contacts.length)] : undefined;
      if (ci >= 0 && !rec) continue;
      const submittedAt = at(ago, 9 + (ago % 8));
      const answers: Record<string, unknown> = { q1: score, ...(comment ? { q2: comment } : {}) };
      await db.surveyResponse.create({ data: { workspaceId, surveyId: nps.id, recordId: rec?.id ?? null, channel: rec ? (ago % 3 ? "zalo" : "sms") : "link", answersJson: JSON.stringify(answers), nps: score, comment, sentAt: new Date(submittedAt.getTime() - 5 * 36e5), submittedAt } });
      if (rec) {
        last.set(rec.id, { nps: score, at: submittedAt });
        await db.activity.create({ data: { recordId: rec.id, kind: "update", body: `Khách chấm NPS ${score} – ${NPS_LABEL[npsBucket(score)]} (“${nps.name}”)${comment ? `: “${comment}”` : ""}`, author: "Khảo sát", createdAt: submittedAt } });
      }
    }
    // Vài lời mời chưa trả lời để có tỷ lệ phản hồi.
    for (const c of contacts.slice(0, 5)) await db.surveyResponse.create({ data: { workspaceId, surveyId: nps.id, recordId: c.id, channel: "zalo", sentAt: at(2) } });
    for (const [id, v] of last) {
      const rec = contacts.find((c) => c.id === id)!;
      const data = { ...parseJson<Record<string, unknown>>(rec.dataJson, {}), _nps: v.nps, _nps_at: v.at.toISOString() };
      await db.record.update({ where: { id }, data: { dataJson: JSON.stringify(data) } });
    }

    const csat = await db.survey.create({ data: { workspaceId, name: "Đánh giá sau buổi phục vụ", kind: "csat", questionsJson: JSON.stringify(defaultQuestions("csat")), createdBy: "Hệ thống", createdAt: at(30) } });
    const cs: [number, string, string, number][] = [
      [5, "Thái độ nhân viên", "Bạn kỹ thuật viên rất dễ thương.", 20],
      [4, "Chất lượng dịch vụ", "", 14],
      [5, "Thái độ nhân viên", "Được tư vấn kỹ trước khi làm.", 9],
      [3, "Giá cả", "Mong có thêm ưu đãi cho khách quen.", 6],
      [5, "Thời gian xử lý", "Đúng giờ, không phải chờ.", 2],
    ];
    for (const [i, [rating, choice, comment, ago]] of cs.entries()) {
      const rec = contacts[(i + 3) % Math.max(1, contacts.length)];
      const submittedAt = at(ago, 15);
      await db.surveyResponse.create({ data: { workspaceId, surveyId: csat.id, recordId: rec?.id ?? null, channel: "link", answersJson: JSON.stringify({ q1: rating, q2: choice, ...(comment ? { q3: comment } : {}) }), rating, comment, sentAt: new Date(submittedAt.getTime() - 2 * 36e5), submittedAt } });
    }
  }

  if (!(await db.voucherCampaign.count({ where: { workspaceId } }))) {
    const bday = await db.voucherCampaign.create({ data: { workspaceId, name: "Sinh nhật 10%", prefix: "SN", kind: "percent", value: 10, maxDiscount: 200_000, validDays: 30, perCustomer: 1, note: "Tặng khách trong tháng sinh nhật", createdBy: "Hệ thống", createdAt: at(50) } });
    const thanks = await db.voucherCampaign.create({ data: { workspaceId, name: "Tri ân 50.000đ", prefix: "TA", kind: "amount", value: 50_000, minOrder: 300_000, validDays: 45, perCustomer: 2, note: "Khách quay lại sau 60 ngày", createdBy: "Hệ thống", createdAt: at(40) } });
    const used = new Set<string>();
    const code = (p: string) => {
      let c = generateCode(p);
      while (used.has(c)) c = generateCode(p);
      used.add(c);
      return c;
    };
    const plan: { c: typeof bday; ci: number; ago: number; status: string; reason: string }[] = [
      { c: bday, ci: 0, ago: 10, status: "issued", reason: "Sinh nhật" },
      { c: bday, ci: 4, ago: 27, status: "issued", reason: "Sinh nhật" }, // sắp hết hạn
      { c: bday, ci: 6, ago: 40, status: "expired", reason: "Sinh nhật" },
      { c: thanks, ci: 1, ago: 6, status: "issued", reason: "Tri ân khách quay lại" },
      { c: thanks, ci: 3, ago: 12, status: "issued", reason: "Thủ công" },
    ];
    for (const p of plan) {
      const rec = contacts[p.ci % Math.max(1, contacts.length)];
      if (!rec) continue;
      const createdAt = at(p.ago);
      const v = await db.voucher.create({ data: { workspaceId, campaignId: p.c.id, code: code(p.c.prefix), recordId: rec.id, status: p.status, reason: p.reason, expiresAt: new Date(createdAt.getTime() + p.c.validDays * D), sentVia: "zalo", createdAt } });
      await db.activity.create({ data: { recordId: rec.id, kind: "update", body: `Tặng voucher ${v.code} (${p.c.name})`, author: "Voucher", createdAt } });
    }
    // Một mã đã dùng: gắn vào đơn còn mới chưa thu tiền (tính lại tổng đơn cho khớp).
    const order = await db.order.findFirst({ where: { workspaceId, contactId: { not: null }, status: { in: ["new", "confirmed"] }, paid: 0, voucherCode: "" }, orderBy: { createdAt: "desc" } });
    const rec = order ? contacts.find((c) => c.id === order.contactId) ?? (await db.record.findFirst({ where: { id: order.contactId!, workspaceId } })) : contacts[2];
    if (rec) {
      const createdAt = at(20);
      const lines = order ? parseLines(order.itemsJson) : [];
      const discount = order && lines.length ? computeDiscount(thanks, order.subtotal - order.discount) : order ? 0 : 50_000;
      const v = await db.voucher.create({ data: { workspaceId, campaignId: thanks.id, code: code(thanks.prefix), recordId: rec.id, status: "used", reason: "Tri ân khách quay lại", expiresAt: new Date(createdAt.getTime() + thanks.validDays * D), usedAt: order?.createdAt ?? at(4), usedOrderId: order && discount ? order.id : null, discount, sentVia: "sms", createdAt } });
      if (order && discount) await db.order.update({ where: { id: order.id }, data: { ...totals(lines, order.discount + discount), voucherCode: v.code } });
      await db.activity.create({ data: { recordId: rec.id, kind: "update", body: `Dùng voucher ${v.code}${order ? ` cho đơn ${order.number}` : ""}, giảm ${discount.toLocaleString("vi-VN")}đ`, author: "Voucher", createdAt: order?.createdAt ?? at(4) } });
    }
  }
}
