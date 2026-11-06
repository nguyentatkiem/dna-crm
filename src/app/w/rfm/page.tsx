import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { allow, getAccess, recordScope } from "@/lib/permissions";
import { summarizeRfm } from "@/lib/c360/rfm";
import { rfmPref, rfmRows } from "@/lib/c360/rfm-data";
import { Icon } from "@/components/Icon";
import { RfmClient } from "./RfmClient";

export const dynamic = "force-dynamic";

export default async function RfmPage() {
  const ctx = await requireApp();
  const wid = ctx.workspace.id;
  const acc = await getAccess(ctx.user.id, wid);
  const [{ rows, contacts, months }, pref, scope] = await Promise.all([rfmRows(wid), rfmPref(wid), recordScope(ctx)]);
  // Nhân viên bị giới hạn "chỉ thấy khách của mình" chỉ thấy khách trong phạm vi.
  const visible = new Set((await db.record.findMany({ where: { ...scope, objectKey: "contacts" }, select: { id: true } })).map((r) => r.id));
  const mine = rows.filter((r) => visible.has(r.id));
  const customers = mine.map((r) => ({ ...r, title: contacts.get(r.id)?.title ?? "", owner: contacts.get(r.id)?.ownerName ?? "" }));
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <h1 className="flex items-center gap-2 text-[26px] font-semibold">
        <Icon name="pie" size={24} className="text-primary" /> Phân tích RFM
      </h1>
      <p className="mt-1 max-w-3xl text-ink-2">
        Chia khách theo ba câu hỏi: mua gần đây không (R), mua thường xuyên không (F), chi bao nhiêu (M) — tính từ đơn đã hoàn tất hoặc đã thanh toán đủ trong {months} tháng qua. Mỗi nhóm có gợi ý chăm sóc riêng.
      </p>
      <RfmClient
        summary={summarizeRfm(mine)}
        customers={customers}
        totalContacts={visible.size}
        lastRun={pref.lastRun ? new Date(pref.lastRun).toISOString() : null}
        canRecompute={allow(acc, "segment_manage")}
        canBroadcast={allow(acc, "broadcast_send")}
      />
    </div>
  );
}
