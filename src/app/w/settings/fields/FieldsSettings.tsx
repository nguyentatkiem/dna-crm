"use client";

import { useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { ACCESS, ACCESS_LABEL, type Access, type FieldAccessPref, type FieldRules } from "@/lib/field-access";
import { OTHER_TITLE, type FormLayout, type FormLayoutPref, type Section } from "@/lib/form-layout";
import { saveFieldAccess, saveFormLayout } from "./actions";

type Obj = { key: string; label: string; fields: { key: string; label: string; type: string }[] };
type Tab = "access" | "layout";

const ACCESS_HINT: Record<Access, string> = { edit: "Xem và sửa", read: "Thấy nhưng không sửa được", hidden: "Không thấy cột, ô và giá trị (cả khi xuất Excel, tìm kiếm)" };

export function FieldsSettings({ objects, access, layouts, initialTab, initialObject }: { objects: Obj[]; access: FieldAccessPref; layouts: FormLayoutPref; initialTab: Tab; initialObject: string }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [objKey, setObjKey] = useState(initialObject);
  const obj = objects.find((o) => o.key === objKey) ?? objects[0];
  const go = (t: Tab, o = objKey) => {
    setTab(t);
    setObjKey(o);
    const u = new URL(window.location.href);
    u.searchParams.set("tab", t);
    u.searchParams.set("object", o);
    window.history.replaceState(null, "", u.toString());
  };
  if (!obj) return <p className="mt-6 text-ink-2">Chưa có bảng nào.</p>;
  return (
    <div className="mt-5 max-w-5xl">
      <div className="flex flex-wrap items-center gap-3 border-b border-line-soft">
        {(
          [
            ["access", "Phân quyền trường", "lock"],
            ["layout", "Bố cục hồ sơ", "layout"],
          ] as const
        ).map(([k, label, icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => go(k)} className={`-mb-px flex h-9 items-center gap-1.5 border-b-2 px-3 text-[14px] ${tab === k ? "border-primary text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
            <Icon name={icon} size={15} /> {label}
          </button>
        ))}
        <label className="mb-1.5 ml-auto flex items-center gap-2 text-[13.5px] text-ink-2">
          Bảng
          <select className="input h-8 w-48" value={obj.key} onChange={(e) => go(tab, e.target.value)}>
            {objects.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {tab === "access" ? <AccessMatrix key={obj.key} obj={obj} initial={access[obj.key] ?? {}} /> : <LayoutEditor key={obj.key} obj={obj} initial={layouts[obj.key] ?? null} />}
    </div>
  );
}

function useSaver() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn().catch(() => ({ ok: false, error: "Không lưu được, thử lại sau" }));
      setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? "Không lưu được" });
    });
  return { pending, msg, run };
}

function AccessMatrix({ obj, initial }: { obj: Obj; initial: FieldRules }) {
  const [rules, setRules] = useState<FieldRules>(initial);
  const s = useSaver();
  const set = (key: string, role: "manager" | "member", v: Access) =>
    setRules((r) => {
      const cur = { ...r[key], [role]: v };
      // Quản lý bị giới hạn thì nhân viên cũng ít nhất như vậy.
      const rank = { edit: 0, read: 1, hidden: 2 };
      if (role === "manager" && rank[v] > rank[cur.member ?? "edit"]) cur.member = v;
      return { ...r, [key]: cur };
    });
  const limited = obj.fields.filter((f) => (rules[f.key]?.manager ?? "edit") !== "edit" || (rules[f.key]?.member ?? "edit") !== "edit").length;
  const cell = (key: string, role: "manager" | "member", label: string) => {
    const v = rules[key]?.[role] ?? "edit";
    return (
      <select aria-label={label} title={ACCESS_HINT[v]} className={`input h-8 ${v === "hidden" ? "text-[#c4213a]" : v === "read" ? "text-[#b37400]" : ""}`} value={v} onChange={(e) => set(key, role, e.target.value as Access)}>
        {ACCESS.map((a) => (
          <option key={a} value={a}>
            {ACCESS_LABEL[a]}
          </option>
        ))}
      </select>
    );
  };
  return (
    <div className="mt-4 grid gap-4">
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[520px] text-[14px]">
          <thead>
            <tr className="border-b border-line-soft text-left text-[12.5px] text-ink-2">
              <th className="px-4 py-2.5 font-medium">Trường</th>
              <th className="w-40 px-3 py-2.5 font-medium">Chủ</th>
              <th className="w-44 px-3 py-2.5 font-medium">Quản lý</th>
              <th className="w-44 px-3 py-2.5 font-medium">Nhân viên</th>
            </tr>
          </thead>
          <tbody>
            {obj.fields.map((f) => (
              <tr key={f.key} className="border-b border-line-soft last:border-0">
                <td className="px-4 py-2">
                  {f.label} <span className="text-[12px] text-ink-2">· {f.key}</span>
                </td>
                <td className="px-3 py-2 text-[13px] text-ink-2">Luôn sửa được</td>
                <td className="px-3 py-2">{cell(f.key, "manager", `${f.label} – quản lý`)}</td>
                <td className="px-3 py-2">{cell(f.key, "member", `${f.label} – nhân viên`)}</td>
              </tr>
            ))}
            {!obj.fields.length && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-ink-2">
                  Bảng này chưa có trường tuỳ chỉnh.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ul className="grid gap-1 text-[12.5px] text-ink-2">
        {ACCESS.map((a) => (
          <li key={a}>
            <b className="font-medium text-ink">{ACCESS_LABEL[a]}:</b> {ACCESS_HINT[a]}.
          </li>
        ))}
        <li>Tên, trạng thái, người phụ trách luôn hiện với mọi người. Che số điện thoại/email theo kiểu ••• nằm ở Cài đặt → Bảo mật dữ liệu.</li>
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={s.pending} onClick={() => s.run(() => saveFieldAccess(obj.key, rules), `Đã lưu phân quyền trường bảng “${obj.label}”${limited ? ` (${limited} trường bị giới hạn)` : ""}.`)}>
          {s.pending ? "Đang lưu…" : "Lưu phân quyền"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setRules({})}>
          Cho sửa tất cả
        </button>
        {s.msg && <span role="status" className={`text-[13.5px] ${s.msg.ok ? "text-[#00a35f]" : "text-[#c4213a]"}`}>{s.msg.text}</span>}
      </div>
    </div>
  );
}

type Drag = { key: string } | null;
const HIDDEN = -1;
const LOOSE = -2;

function LayoutEditor({ obj, initial }: { obj: Obj; initial: FormLayout | null }) {
  const [sections, setSections] = useState<Section[]>(() => initial?.sections.map((x) => ({ ...x, fields: x.fields.filter((k) => obj.fields.some((f) => f.key === k)) })) ?? []);
  const [hidden, setHidden] = useState<string[]>(() => (initial?.hidden ?? []).filter((k) => obj.fields.some((f) => f.key === k)));
  const [drag, setDrag] = useState<Drag>(null);
  const [over, setOver] = useState<number | null>(null);
  const s = useSaver();
  const label = (k: string) => obj.fields.find((f) => f.key === k)?.label ?? k;
  const loose = useMemo(() => obj.fields.map((f) => f.key).filter((k) => !hidden.includes(k) && !sections.some((x) => x.fields.includes(k))), [obj.fields, hidden, sections]);

  /** Đưa trường tới phần `to` (HIDDEN = ẩn khỏi form, LOOSE = chưa xếp), chèn trước `before` nếu có. */
  function move(key: string, to: number, before?: string) {
    setSections((ss) =>
      ss.map((x, i) => {
        const rest = x.fields.filter((k) => k !== key);
        if (i !== to) return { ...x, fields: rest };
        const at = before ? rest.indexOf(before) : -1;
        return { ...x, fields: at >= 0 ? [...rest.slice(0, at), key, ...rest.slice(at)] : [...rest, key] };
      }),
    );
    setHidden((h) => (to === HIDDEN ? [...h.filter((k) => k !== key), key] : h.filter((k) => k !== key)));
  }
  const dropProps = (to: number) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!drag) return;
      e.preventDefault();
      setOver(to);
    },
    onDragLeave: () => setOver((o) => (o === to ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (drag) move(drag.key, to);
      setDrag(null);
      setOver(null);
    },
  });
  const targets = [...sections.map((x, i) => ({ to: i, label: `Phần: ${x.title || "Chưa đặt tên"}` })), { to: LOOSE, label: `Chưa xếp (hiện ở “${OTHER_TITLE}”)` }, { to: HIDDEN, label: "Ẩn khỏi hồ sơ" }];
  const where = (k: string) => (hidden.includes(k) ? HIDDEN : sections.findIndex((x) => x.fields.includes(k)));

  const chip = (k: string, sectionIdx: number) => (
    <li
      key={k}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", k);
        setDrag({ key: k });
      }}
      onDragEnd={() => {
        setDrag(null);
        setOver(null);
      }}
      onDragOver={(e) => drag && sectionIdx >= 0 && e.preventDefault()}
      onDrop={(e) => {
        if (!drag || sectionIdx < 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (drag.key !== k) move(drag.key, sectionIdx, k);
        setDrag(null);
        setOver(null);
      }}
      className={`flex h-9 cursor-grab items-center gap-2 rounded-md border border-line-soft bg-surface px-2 text-[13.5px] active:cursor-grabbing ${drag?.key === k ? "opacity-40" : ""}`}
    >
      <Icon name="grip" size={14} className="flex-none text-ink-2" />
      <span className="min-w-0 flex-1 truncate">{label(k)}</span>
      <select aria-label={`Chuyển ${label(k)} tới`} className="h-7 max-w-[130px] rounded border border-line-soft bg-surface-2 px-1 text-[12px] text-ink-2" value={String(where(k) < 0 && !hidden.includes(k) ? LOOSE : where(k))} onChange={(e) => move(k, Number(e.target.value))}>
        {targets.map((t) => (
          <option key={t.to} value={t.to}>
            {t.label}
          </option>
        ))}
      </select>
    </li>
  );

  return (
    <div className="mt-4 grid gap-4">
      <p className="text-[13px] text-ink-2">Kéo trường vào từng phần (hoặc dùng ô “Chuyển tới”). Trường chưa xếp hiện ở phần “{OTHER_TITLE}” cuối hồ sơ. Chưa có phần nào thì hồ sơ hiện danh sách phẳng như cũ.</p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid content-start gap-3">
          {sections.map((x, i) => (
            <section key={i} {...dropProps(i)} className={`card p-3 ${over === i ? "ring-2 ring-primary/40" : ""}`}>
              <div className="mb-2 flex items-center gap-2">
                <input className="input h-8 min-w-0 flex-1 font-semibold" value={x.title} maxLength={80} placeholder="Tên phần, ví dụ: Liên hệ" onChange={(e) => setSections((ss) => ss.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} aria-label="Tên phần" />
                <label className="flex items-center gap-1 text-[12.5px] text-ink-2" title="Phần này đóng sẵn khi mở hồ sơ">
                  <input type="checkbox" checked={!!x.collapsed} onChange={(e) => setSections((ss) => ss.map((y, j) => (j === i ? { ...y, collapsed: e.target.checked } : y)))} /> Thu gọn
                </label>
                <button type="button" className="btn-ghost h-8 w-8 justify-center p-0" disabled={i === 0} aria-label="Đưa phần lên" onClick={() => setSections((ss) => { const n = [...ss]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}>
                  ↑
                </button>
                <button type="button" className="btn-ghost h-8 w-8 justify-center p-0" aria-label="Xoá phần" title="Xoá phần (trường trở về “Chưa xếp”)" onClick={() => setSections((ss) => ss.filter((_, j) => j !== i))}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
              <ul className="grid min-h-10 gap-1.5">
                {x.fields.map((k) => chip(k, i))}
                {!x.fields.length && <li className="grid h-10 place-items-center rounded-md border border-dashed border-line text-[12.5px] text-ink-2">Kéo trường vào đây</li>}
              </ul>
            </section>
          ))}
          <button type="button" className="btn-outline w-fit" onClick={() => setSections((ss) => [...ss, { title: ss.length ? "Phần mới" : "Thông tin chính", fields: [] }])}>
            <Icon name="plus" size={14} /> Thêm phần
          </button>
        </div>
        <div className="grid content-start gap-3">
          <section {...dropProps(LOOSE)} className={`card p-3 ${over === LOOSE ? "ring-2 ring-primary/40" : ""}`}>
            <h3 className="mb-2 text-[13px] font-semibold">Chưa xếp · hiện ở “{OTHER_TITLE}”</h3>
            <ul className="grid min-h-10 gap-1.5">
              {loose.map((k) => chip(k, LOOSE))}
              {!loose.length && <li className="text-[12.5px] text-ink-2">Mọi trường đã được xếp.</li>}
            </ul>
          </section>
          <section {...dropProps(HIDDEN)} className={`card p-3 ${over === HIDDEN ? "ring-2 ring-primary/40" : ""}`}>
            <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
              <Icon name="eye" size={14} /> Ẩn khỏi hồ sơ
            </h3>
            <ul className="grid min-h-10 gap-1.5">
              {hidden.map((k) => chip(k, HIDDEN))}
              {!hidden.length && <li className="text-[12.5px] text-ink-2">Kéo trường vào đây để không hiện trong tab Thông tin (vẫn có cột trên bảng).</li>}
            </ul>
          </section>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={s.pending} onClick={() => s.run(() => saveFormLayout(obj.key, { sections, hidden }), `Đã lưu bố cục hồ sơ bảng “${obj.label}”.`)}>
          {s.pending ? "Đang lưu…" : "Lưu bố cục"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setSections([]);
            setHidden([]);
          }}
        >
          Về dạng phẳng
        </button>
        {s.msg && <span role="status" className={`text-[13.5px] ${s.msg.ok ? "text-[#00a35f]" : "text-[#c4213a]"}`}>{s.msg.text}</span>}
      </div>
    </div>
  );
}
