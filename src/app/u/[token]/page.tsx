import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { CHANNEL_LABEL, type MsgChannel } from "@/lib/marketing/shared";
import { maskAddress, verifyUnsubToken } from "@/lib/marketing/tokens";

export const metadata: Metadata = { title: "Ngừng nhận tin", robots: { index: false } };
export const dynamic = "force-dynamic";

type P = { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> };

/** Huỷ nhận tin bằng nút bấm (không huỷ khi chỉ mở link, vì máy quét email hay tự mở link). */
async function unsubscribe(form: FormData) {
  "use server";
  const p = verifyUnsubToken(String(form.get("token") ?? ""));
  if (!p) return;
  const ws = await db.workspace.findUnique({ where: { id: p.workspaceId }, select: { id: true } });
  if (!ws) return;
  await db.unsubscribe.upsert({
    where: { workspaceId_channel_address: { workspaceId: p.workspaceId, channel: p.channel, address: p.address } },
    create: { workspaceId: p.workspaceId, channel: p.channel, address: p.address },
    update: {},
  });
  revalidatePath(`/u/${String(form.get("token"))}`);
}

async function resubscribe(form: FormData) {
  "use server";
  const p = verifyUnsubToken(String(form.get("token") ?? ""));
  if (!p) return;
  await db.unsubscribe.deleteMany({ where: { workspaceId: p.workspaceId, channel: p.channel, address: p.address } });
  revalidatePath(`/u/${String(form.get("token"))}`);
}

export default async function UnsubPage({ params }: P) {
  const { token } = await params;
  const p = verifyUnsubToken(decodeURIComponent(token));
  const ws = p ? await db.workspace.findUnique({ where: { id: p.workspaceId }, select: { name: true } }) : null;
  const row = p && ws ? await db.unsubscribe.findUnique({ where: { workspaceId_channel_address: { workspaceId: p.workspaceId, channel: p.channel, address: p.address } } }) : null;
  const ch = p ? (CHANNEL_LABEL[p.channel as MsgChannel] ?? p.channel) : "";

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f6f7fb", padding: 16, fontFamily: "Figtree, Arial, sans-serif", color: "#323338" }}>
      <div style={{ width: "100%", maxWidth: 440, background: "#fff", borderRadius: 12, padding: 28, boxShadow: "0 4px 24px rgba(0,0,0,.08)", textAlign: "center" }}>
        {!p || !ws ? (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Link không hợp lệ</h1>
            <p style={{ color: "#676879", marginTop: 8 }}>Link huỷ nhận tin bị sai hoặc đã bị chỉnh sửa. Hãy mở lại link trong tin nhắn gốc.</p>
          </>
        ) : row ? (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Bạn đã ngừng nhận tin</h1>
            <p style={{ color: "#676879", marginTop: 8 }}>
              {ws.name} sẽ không gửi {ch} tới <b>{maskAddress(p.address)}</b> nữa.
            </p>
            <form action={resubscribe} style={{ marginTop: 20 }}>
              <input type="hidden" name="token" value={decodeURIComponent(token)} />
              <button type="submit" style={{ background: "none", border: 0, color: "#0073ea", cursor: "pointer", fontSize: 14 }}>
                Bấm nhầm? Nhận tin lại
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Ngừng nhận tin từ {ws.name}?</h1>
            <p style={{ color: "#676879", marginTop: 8 }}>
              Bạn sẽ không nhận {ch} quảng cáo tới <b>{maskAddress(p.address)}</b> nữa. Tin về đơn hàng, lịch hẹn của bạn vẫn có thể được gửi.
            </p>
            <form action={unsubscribe} style={{ marginTop: 20 }}>
              <input type="hidden" name="token" value={decodeURIComponent(token)} />
              <button type="submit" style={{ background: "#d83a52", color: "#fff", border: 0, borderRadius: 6, padding: "10px 20px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                Ngừng nhận tin
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
