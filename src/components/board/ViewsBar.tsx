"use client";

import { useState } from "react";
import type { ViewDTO } from "@/lib/views";
import { Icon } from "../Icon";
import { usePopover } from "./cells";

export type ViewMeta = { name: string; shared: boolean; isDefault: boolean };

/** Thanh "Dạng xem: … ▾": chọn dạng xem mặc định / của tôi / được chia sẻ, lưu mới, lưu thay đổi, sửa, xoá, sao chép link. */
export function ViewsBar({
  views,
  active,
  dirty,
  onPick,
  onCreate,
  onEdit,
  onDelete,
  onSaveState,
  onRevert,
  onCopyLink,
}: {
  views: ViewDTO[];
  active: ViewDTO | null;
  dirty: boolean;
  onPick: (id: string | null) => void;
  onCreate: (m: ViewMeta) => Promise<string | null>;
  onEdit: (id: string, m: Partial<ViewMeta>) => Promise<string | null>;
  onDelete: (v: ViewDTO) => void;
  onSaveState: () => void;
  onRevert: () => void;
  onCopyLink: () => void;
}) {
  const p = usePopover();
  const [dialog, setDialog] = useState<{ edit: ViewDTO | null } | null>(null);
  const mine = views.filter((v) => v.mine);
  const shared = views.filter((v) => !v.mine && v.shared);
  const pick = (id: string | null) => {
    p.setOpen(false);
    onPick(id);
  };
  const row = (v: ViewDTO) => (
    <div key={v.id} className={`group/v flex h-8 items-center gap-1 rounded px-1 hover:bg-hover ${active?.id === v.id ? "bg-primary-selected" : ""}`}>
      <button type="button" role="menuitemradio" aria-checked={active?.id === v.id} onClick={() => pick(v.id)} className="flex min-w-0 flex-1 items-center gap-2 px-1 text-left text-[13.5px]">
        <Icon name={v.shared ? "users" : "layout"} size={14} className="flex-none text-ink-2" />
        <span className="truncate">{v.name}</span>
        {v.isDefault && <span className="flex-none rounded bg-surface-2 px-1 text-[11px] text-ink-2">mặc định</span>}
        {!v.mine && <span className="flex-none truncate text-[11.5px] text-ink-2">· {v.ownerName}</span>}
      </button>
      {v.canEdit && (
        <>
          <button type="button" aria-label={`Sửa dạng xem ${v.name}`} onClick={() => { p.setOpen(false); setDialog({ edit: v }); }} className="grid h-6 w-6 flex-none place-items-center rounded text-ink-2 opacity-0 hover:bg-surface hover:text-ink focus:opacity-100 group-hover/v:opacity-100 max-md:opacity-100">
            <Icon name="edit" size={13} />
          </button>
          <button type="button" aria-label={`Xoá dạng xem ${v.name}`} onClick={() => { p.setOpen(false); onDelete(v); }} className="grid h-6 w-6 flex-none place-items-center rounded text-ink-2 opacity-0 hover:bg-surface hover:text-[#df2f4a] focus:opacity-100 group-hover/v:opacity-100 max-md:opacity-100">
            <Icon name="trash" size={13} />
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div ref={p.ref} className="relative">
        <button type="button" className="btn-ghost max-w-[260px]" aria-haspopup="menu" aria-expanded={p.open} onClick={() => p.setOpen(!p.open)}>
          <Icon name={active?.shared ? "users" : "layout"} size={16} />
          <span className="text-ink-2 max-sm:hidden">Dạng xem:</span>
          <b className="truncate font-medium">{active?.name ?? "Mặc định"}</b>
          {dirty && <span className="h-1.5 w-1.5 flex-none rounded-full bg-[#fdab3d]" title="Có thay đổi chưa lưu" />}
          <Icon name="chevron" size={14} className="flex-none" />
        </button>
        {p.open && (
          <div role="menu" aria-label="Dạng xem" className="anim-fade absolute left-0 top-full z-40 mt-1 max-h-[70vh] w-72 overflow-y-auto rounded-lg bg-surface p-1.5 shadow-panel">
            <button type="button" role="menuitemradio" aria-checked={!active} onClick={() => pick(null)} className={`flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[13.5px] hover:bg-hover ${!active ? "bg-primary-selected" : ""}`}>
              <Icon name="table" size={14} className="text-ink-2" /> Mặc định
              <span className="ml-auto text-[11.5px] text-ink-2">lưu trên máy này</span>
            </button>
            {mine.length > 0 && <p className="px-2 pb-0.5 pt-2 text-[11.5px] font-medium uppercase tracking-wide text-ink-2">Của tôi</p>}
            {mine.map(row)}
            {shared.length > 0 && <p className="px-2 pb-0.5 pt-2 text-[11.5px] font-medium uppercase tracking-wide text-ink-2">Chia sẻ với đội</p>}
            {shared.map(row)}
            <div className="my-1 h-px bg-line-soft" />
            <button type="button" role="menuitem" onClick={() => { p.setOpen(false); setDialog({ edit: null }); }} className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[13.5px] text-primary hover:bg-hover">
              <Icon name="plus" size={14} /> Lưu dạng xem mới…
            </button>
          </div>
        )}
      </div>
      {active && dirty && active.canEdit && (
        <button type="button" className="btn-outline h-8 text-[13px]" onClick={onSaveState}>
          Lưu thay đổi
        </button>
      )}
      {active && dirty && (
        <button type="button" className="btn-ghost h-8 text-[13px]" onClick={onRevert}>
          Hoàn tác
        </button>
      )}
      {!active && (
        <button type="button" className="btn-ghost h-8 text-[13px] max-sm:hidden" onClick={() => setDialog({ edit: null })}>
          Lưu dạng xem
        </button>
      )}
      {active && (
        <button type="button" className="btn-ghost h-8 w-8 justify-center p-0" aria-label="Sao chép link dạng xem" title="Sao chép link dạng xem" onClick={onCopyLink}>
          <Icon name="link" size={15} />
        </button>
      )}
      {dialog && <ViewDialog edit={dialog.edit} onClose={() => setDialog(null)} onSubmit={(m) => (dialog.edit ? onEdit(dialog.edit.id, m) : onCreate(m))} />}
    </div>
  );
}

function ViewDialog({ edit, onClose, onSubmit }: { edit: ViewDTO | null; onClose: () => void; onSubmit: (m: ViewMeta) => Promise<string | null> }) {
  const [name, setName] = useState(edit?.name ?? "");
  const [shared, setShared] = useState(edit?.shared ?? false);
  const [isDefault, setIsDefault] = useState(edit?.isDefault ?? false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const canDefault = !edit || edit.mine;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr("Hãy đặt tên dạng xem");
    setBusy(true);
    const er = await onSubmit({ name: name.trim(), shared, isDefault: canDefault && isDefault });
    setBusy(false);
    if (er) setErr(er);
    else onClose();
  }
  return (
    <div className="anim-fade fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <form role="dialog" onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onClose())} aria-label={edit ? "Sửa dạng xem" : "Lưu dạng xem"} onSubmit={submit} onClick={(e) => e.stopPropagation()} className="anim-pop grid w-full max-w-sm gap-3 rounded-xl bg-surface p-5 shadow-panel">
        <h2 className="text-[16px] font-semibold">{edit ? "Sửa dạng xem" : "Lưu dạng xem"}</h2>
        {!edit && <p className="text-[13px] text-ink-2">Lưu kiểu xem, cột, thứ tự và độ rộng cột, bộ lọc, nhóm, sắp xếp, độ cao dòng, tô màu và ô tìm kiếm hiện tại.</p>}
        <label className="grid gap-1">
          <span className="text-[12.5px] text-ink-2">Tên dạng xem</span>
          <input autoFocus className="input" value={name} maxLength={60} placeholder="Ví dụ: Khách nóng của tôi" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={shared} disabled={!!edit && !edit.mine} onChange={(e) => setShared(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
          Chia sẻ với cả đội
        </label>
        {canDefault && (
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            Mở sẵn dạng xem này khi tôi vào bảng
          </label>
        )}
        {err && <p className="text-[13px] text-[#df2f4a]">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Huỷ
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy ? "Đang lưu…" : edit ? "Lưu" : "Lưu dạng xem"}
          </button>
        </div>
      </form>
    </div>
  );
}
