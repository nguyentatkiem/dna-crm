"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { COLOR_KEYS, FIELD_TYPES, type ColorKey, type FieldDef, type ObjectDef, type WorkspaceConfig } from "@/lib/config/schema";
import { color } from "@/lib/colors";
import { slug } from "@/lib/config/templates";
import { Icon } from "@/components/Icon";

const TYPE_LABEL: Record<FieldDef["type"], string> = {
  text: "Chữ",
  longtext: "Đoạn văn",
  phone: "Số điện thoại",
  email: "Email",
  number: "Số",
  money: "Tiền",
  date: "Ngày",
  select: "Nhãn chọn",
  rating: "Đánh giá sao",
};

const uniqueKey = (label: string, taken: string[]) => {
  const base = slug(label);
  let k = base;
  for (let i = 2; taken.includes(k); i++) k = `${base}_${i}`;
  return k;
};

/** Sửa tên bảng, trạng thái (tên, màu) và trường dữ liệu ngay trên giao diện. */
export function FieldEditor({ config }: { config: WorkspaceConfig }) {
  const router = useRouter();
  const [objects, setObjects] = useState<ObjectDef[]>(config.objects);
  const [tab, setTab] = useState(config.objects[0].key);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const o = objects.find((x) => x.key === tab)!;
  const dirty = JSON.stringify(objects) !== JSON.stringify(config.objects);

  const update = (patch: Partial<ObjectDef>) => setObjects((os) => os.map((x) => (x.key === tab ? { ...x, ...patch } : x)));

  async function save() {
    setBusy(true);
    const res = await fetch("/api/config/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objects }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? `Đã lưu thành cấu hình v${d.version}` : d.error ?? "Không lưu được");
    if (res.ok) router.refresh();
  }

  return (
    <section className="card mt-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold">Bảng, trạng thái và cột</h2>
          <p className="mt-1 text-[14px] text-ink-2">Đổi tên, đổi màu, thêm hoặc bớt mà không cần chạy lại DNA. Mỗi lần lưu là một phiên bản mới.</p>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-[13px] text-ink-2">{msg}</span>}
          {dirty && (
            <button type="button" className="btn-ghost" onClick={() => setObjects(config.objects)}>
              Huỷ thay đổi
            </button>
          )}
          <button type="button" className="btn-primary" disabled={!dirty || busy} onClick={save}>
            {busy ? "Đang lưu..." : "Lưu thay đổi"}
          </button>
        </div>
      </div>

      <div className="mt-4 flex gap-1 border-b border-line-soft">
        {objects.map((x) => (
          <button key={x.key} type="button" onClick={() => setTab(x.key)} className={`-mb-px h-9 border-b-2 px-3 text-[14px] ${tab === x.key ? "border-primary" : "border-transparent text-ink-2 hover:text-ink"}`}>
            {x.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-6 xl:grid-cols-2">
        <div className="grid content-start gap-3">
          <label className="grid gap-1">
            <span className="label">Tên bảng</span>
            <input id={`ed-label-${o.key}`} value={o.label} onChange={(e) => update({ label: e.target.value, itemLabel: e.target.value })} className="input" />
          </label>
          <label className="grid gap-1">
            <span className="label">Tên cột trạng thái</span>
            <input id={`ed-status-${o.key}`} value={o.statusLabel} onChange={(e) => update({ statusLabel: e.target.value })} className="input" />
          </label>
          <p className="label mt-2">Trạng thái (thứ tự = thứ tự nhóm)</p>
          <ul className="grid gap-1.5">
            {o.statuses.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2">
                <select
                  id={`ed-sc-${s.key}`}
                  aria-label="Màu"
                  value={s.color}
                  onChange={(e) => update({ statuses: o.statuses.map((x, k) => (k === i ? { ...x, color: e.target.value as ColorKey } : x)) })}
                  className="h-9 w-24 rounded border-0 px-2 text-[13px]"
                  style={{ background: color(s.color).bg, color: color(s.color).fg }}
                >
                  {COLOR_KEYS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input id={`ed-sl-${s.key}`} value={s.label} onChange={(e) => update({ statuses: o.statuses.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} className="input h-9" />
                <button type="button" aria-label="Lên" disabled={i === 0} className="btn-ghost h-9 w-8 justify-center p-0" onClick={() => { const a = [...o.statuses]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; update({ statuses: a }); }}>
                  <Icon name="chevron" size={15} className="rotate-180" />
                </button>
                <button type="button" aria-label="Xoá trạng thái" disabled={o.statuses.length <= 2} className="btn-ghost h-9 w-8 justify-center p-0 text-[#df2f4a]" onClick={() => update({ statuses: o.statuses.filter((_, k) => k !== i) })}>
                  <Icon name="trash" size={15} />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-ghost w-fit text-primary" onClick={() => update({ statuses: [...o.statuses, { key: uniqueKey("Trạng thái mới", o.statuses.map((s) => s.key)), label: "Trạng thái mới", color: "gray" }] })}>
            <Icon name="plus" size={16} /> Thêm trạng thái
          </button>
          <p className="text-[12.5px] text-ink-2">Mục đang ở trạng thái bị xoá sẽ chuyển về trạng thái đầu tiên.</p>
        </div>

        <div className="grid content-start gap-3">
          <p className="label">Cột dữ liệu</p>
          <ul className="grid gap-2">
            {o.fields.map((f, i) => (
              <li key={f.key} className="grid gap-1.5 rounded border border-line-soft p-2.5">
                <div className="flex items-center gap-2">
                  <input id={`ed-fl-${f.key}`} value={f.label} onChange={(e) => update({ fields: o.fields.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} className="input h-9" />
                  <span className="whitespace-nowrap rounded bg-surface-2 px-2 py-1 text-[12px] text-ink-2">{TYPE_LABEL[f.type]}</span>
                  <button type="button" aria-label="Xoá cột" className="btn-ghost h-9 w-8 justify-center p-0 text-[#df2f4a]" onClick={() => update({ fields: o.fields.filter((_, k) => k !== i) })}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
                {f.type === "select" && (
                  <input
                    id={`ed-fo-${f.key}`}
                    defaultValue={f.options.map((x) => x.label).join(", ")}
                    onBlur={(e) => {
                      const labels = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                      const keys: string[] = [];
                      const opts = labels.map((l, k) => {
                        const old = f.options.find((x) => x.label === l);
                        const key = old?.key ?? uniqueKey(l, keys);
                        keys.push(key);
                        return { key, label: l, color: old?.color ?? COLOR_KEYS[k % 8] };
                      });
                      update({ fields: o.fields.map((x, k) => (k === i ? { ...x, options: opts } : x)) });
                    }}
                    className="input h-8 text-[13px]"
                    placeholder="Các lựa chọn, cách nhau bằng dấu phẩy"
                  />
                )}
              </li>
            ))}
          </ul>
          <AddField
            onAdd={(label, type) =>
              update({ fields: [...o.fields, { key: uniqueKey(label, o.fields.map((f) => f.key)), label, type, options: type === "select" ? [{ key: "lua_chon_1", label: "Lựa chọn 1", color: "blue" }] : [] }] })
            }
          />
        </div>
      </div>
    </section>
  );
}

function AddField({ onAdd }: { onAdd: (label: string, type: FieldDef["type"]) => void }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldDef["type"]>("text");
  return (
    <div className="flex flex-wrap gap-2">
      <input id="ed-new-field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Tên cột mới" className="input h-9 min-w-0 flex-1" />
      <select id="ed-new-type" value={type} onChange={(e) => setType(e.target.value as FieldDef["type"])} className="h-9 rounded border border-line bg-surface px-2 text-[14px]">
        {FIELD_TYPES.map((t) => (
          <option key={t} value={t}>
            {TYPE_LABEL[t]}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn-outline h-9"
        disabled={!label.trim()}
        onClick={() => {
          onAdd(label.trim(), type);
          setLabel("");
        }}
      >
        <Icon name="plus" size={16} /> Thêm cột
      </button>
    </div>
  );
}
