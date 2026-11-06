"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Drawer } from "@/components/ui";
import { ContactPicker, type PickedContact } from "@/components/care/ContactPicker";
import { SegmentSelect } from "@/components/survey/SegmentSelect";
import { SEND_CHANNELS, SEND_LABEL, valueText, type SendChannel } from "@/lib/voucher/shared";

type Camp = { id: string; name: string; kind: string; value: number; maxDiscount: number; minOrder: number; validDays: number; active: boolean };

/**
 * Ngăn phát voucher: cho một khách (recordId cố định hoặc chọn khách) hoặc cả nhóm khách (allowSegment).
 * Có thể gửi luôn qua kênh với mẫu tin đã cài.
 */
export function IssueVoucherDrawer({ open, onClose, recordId, campaignId, allowSegment, onDone }: { open: boolean; onClose: () => void; recordId?: string; campaignId?: string; allowSegment?: boolean; onDone?: () => void }) {
  const [camps, setCamps] = useState<Camp[] | null>(null);
  const [cid, setCid] = useState(campaignId ?? "");
  const [mode, setMode] = useState<"one" | "segment">("one");
  const [contact, setContact] = useState<PickedContact | null>(null);
  const [segmentId, setSegmentId] = useState("");
  const [send, setSend] = useState<SendChannel>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    if (!open) return;
    setErr("");
    setDone("");
    if (campaignId) setCid(campaignId);
    if (camps) return;
    fetch("/api/vouchers?only=campaigns")
      .then((r) => (r.ok ? r.json() : { campaigns: [] }))
      .then((j) => {
        const cs = ((j.campaigns ?? []) as Camp[]).filter((c) => c.active);
        setCamps(cs);
        setCid((x) => x || cs[0]?.id || "");
      })
      .catch(() => setCamps([]));
  }, [open, camps, campaignId]);

  async function submit() {
    setErr("");
    const body: Record<string, unknown> = { campaignId: cid, send };
    if (mode === "segment") {
      if (!segmentId) return setErr("Chọn nhóm khách");
      body.segmentId = segmentId;
    } else {
      const rid = recordId ?? contact?.id;
      if (!rid) return setErr("Chọn khách");
      body.recordId = rid;
    }
    if (!cid) return setErr("Chọn chương trình");
    setBusy(true);
    const r = await fetch("/api/vouchers/issue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Không phát được");
    setDone(mode === "segment" ? `Đã phát ${j.issued}/${j.total} mã${j.skipped ? ` (${j.skipped} khách đã nhận đủ lượt)` : ""}.` : `Đã phát mã ${j.code}.`);
    // Mã đã phát nhưng gửi tin lỗi (chưa cấu hình kênh…): báo để nhân viên tự gửi mã cho khách.
    if (send && (j.sendError || j.sendFailed)) setErr(`${mode === "segment" ? `${j.sendFailed} khách chưa gửi được` : "Chưa gửi được"} qua ${SEND_LABEL[send]}: ${j.sendError || "lỗi không rõ"}. Hãy gửi mã cho khách bằng cách khác.`);
    onDone?.();
  }

  const c = camps?.find((x) => x.id === cid);
  return (
    <Drawer open={open} onClose={onClose} title="Phát voucher" subtitle={c ? `${valueText(c)} · hạn ${c.validDays} ngày` : undefined} width={440}>
      <div className="grid gap-3.5 px-5 py-4">
        {done ? (
          <div className="grid justify-items-center gap-3 py-8 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success">
              <Icon name="gift" size={22} />
            </span>
            <p className="font-medium">{done}</p>
            {err && <p className="text-[13px] text-warning">{err}</p>}
            <div className="flex gap-2">
              <button type="button" className="btn-outline" onClick={() => { setDone(""); setErr(""); }}>
                Phát tiếp
              </button>
              <button type="button" className="btn-ghost" onClick={onClose}>
                Đóng
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="grid gap-1">
              <span className="label">Chương trình</span>
              {camps && !camps.length ? (
                <span className="text-[13px] text-ink-2">Chưa có chương trình đang bật. Tạo ở mục Voucher.</span>
              ) : (
                <select className="input" value={cid} onChange={(e) => setCid(e.target.value)}>
                  {(camps ?? []).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
            {!recordId && allowSegment && (
              <div className="flex gap-2">
                {(["one", "segment"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 rounded-lg border px-3 py-1.5 text-[13.5px] ${mode === m ? "border-primary bg-primary-selected font-medium" : "border-line"}`}>
                    {m === "one" ? "Một khách" : "Nhóm khách"}
                  </button>
                ))}
              </div>
            )}
            {!recordId &&
              (mode === "one" ? (
                <div className="grid gap-1">
                  <span className="label">Khách</span>
                  <ContactPicker value={contact} onChange={setContact} />
                </div>
              ) : (
                <label className="grid gap-1">
                  <span className="label">Nhóm khách</span>
                  <SegmentSelect value={segmentId} onChange={setSegmentId} />
                </label>
              ))}
            <label className="grid gap-1">
              <span className="label">Gửi mã cho khách qua</span>
              <select className="input" value={send} onChange={(e) => setSend(e.target.value as SendChannel)}>
                {SEND_CHANNELS.map((x) => (
                  <option key={x} value={x}>
                    {SEND_LABEL[x]}
                  </option>
                ))}
              </select>
              <span className="text-[12px] text-ink-2">Nội dung theo mẫu tin ở trang Voucher ({"{code}"}, {"{value}"}, {"{expiresAt}"}, {"{name}"}).</span>
            </label>
            {err && (
              <p role="alert" className="text-[13px] text-danger">
                {err}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={onClose}>
                Huỷ
              </button>
              <button type="button" className="btn-primary" onClick={submit} disabled={busy || !camps?.length}>
                <Icon name="gift" size={14} /> {busy ? "Đang phát…" : "Phát mã"}
              </button>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
