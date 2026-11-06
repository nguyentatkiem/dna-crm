"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Drawer } from "@/components/ui";
import { PRIORITIES, PRIORITY_LABEL, type Priority } from "@/lib/care/shared";
import { ContactPicker, type PickedContact } from "./ContactPicker";

type Props = { recordId?: string; conversationId?: string; callId?: string; defaultSubject?: string; className?: string; label?: string; onCreated?: (t: { id: string; number: string }) => void };

/**
 * Nút "Tạo phiếu hỗ trợ" gắn được ở hộp thư, trang cuộc gọi, bảng khách.
 * Có conversationId/callId thì máy chủ tự chép nội dung và gắn khách từ đó.
 */
export function CreateTicketButton({ recordId, conversationId, callId, defaultSubject = "", className = "btn-outline", label = "Tạo phiếu hỗ trợ", onCreated }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState<string[]>([]);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [assignee, setAssignee] = useState("");
  const [contact, setContact] = useState<PickedContact | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ id: string; number: string } | null>(null);
  const linked = !!(recordId || conversationId || callId);

  useEffect(() => {
    if (!open || team.length) return;
    fetch("/api/tickets/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        setTeam(j.team ?? []);
        setAssignee((a) => a || j.me || "");
      })
      .catch(() => undefined);
  }, [open, team.length]);

  function reset() {
    setSubject(defaultSubject);
    setBody("");
    setPriority("normal");
    setContact(null);
    setErr("");
    setDone(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() && !conversationId && !callId) return setErr("Nhập tiêu đề phiếu");
    setBusy(true);
    setErr("");
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body, priority, assignee, recordId: recordId ?? contact?.id ?? null, fromConversationId: conversationId, fromCallId: callId }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Không tạo được phiếu");
    setDone({ id: j.id, number: j.number });
    onCreated?.({ id: j.id, number: j.number });
  }

  return (
    <>
      <button type="button" className={className} onClick={() => { reset(); setOpen(true); }}>
        <Icon name="ticket" size={15} /> {label}
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Phiếu hỗ trợ mới"
        subtitle={conversationId ? "Nội dung sẽ chép 10 tin nhắn gần nhất của hội thoại" : callId ? "Nội dung sẽ chép tóm tắt và ghi chú cuộc gọi" : undefined}
        width={480}
      >
        {done ? (
          <div className="grid place-items-center gap-3 px-5 py-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success">
              <Icon name="check" size={22} />
            </span>
            <p className="font-medium">Đã tạo phiếu {done.number}</p>
            <div className="flex gap-2">
              <button type="button" className="btn-primary" onClick={() => router.push(`/w/tickets/${done.id}`)}>
                Mở phiếu
              </button>
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                Đóng
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-3.5 px-5 py-4">
            <label className="grid gap-1">
              <span className="label">Tiêu đề{conversationId || callId ? " (để trống để tự đặt)" : ""}</span>
              <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} autoFocus placeholder="Ví dụ: Khách báo kích ứng sau liệu trình" />
            </label>
            <label className="grid gap-1">
              <span className="label">Mô tả</span>
              <textarea className="textarea min-h-[110px]" value={body} onChange={(e) => setBody(e.target.value)} maxLength={20000} placeholder="Khách cần gì, đã thử gì…" />
            </label>
            {!linked && (
              <div className="grid gap-1">
                <span className="label">Khách</span>
                <ContactPicker value={contact} onChange={setContact} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1">
                <span className="label">Mức ưu tiên</span>
                <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="label">Người xử lý</span>
                <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">Chưa giao</option>
                  {[...new Set([...team, ...(assignee && !team.includes(assignee) ? [assignee] : [])])].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {err && (
              <p role="alert" className="text-[13px] text-danger">
                {err}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                Huỷ
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? "Đang tạo…" : "Tạo phiếu"}
              </button>
            </div>
          </form>
        )}
      </Drawer>
    </>
  );
}
