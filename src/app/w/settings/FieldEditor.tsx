"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { COLOR_KEYS, FIELD_TYPES, type ColorKey, type FieldDef, type ObjectDef, type WorkspaceConfig } from "@/lib/config/schema";
import { color } from "@/lib/colors";
import { slug } from "@/lib/config/templates";
import { Icon } from "@/components/Icon";
import { BUILTIN_REFS, evalFormula, formatFormulaValue, isMoneyFormula, validateFormula, type FormulaRecord } from "@/lib/formula";
import { vnd } from "@/lib/format";

const TYPE_LABEL: Record<FieldDef["type"], string> = {
  text: "Chữ",
  longtext: "Đoạn văn",
  formula: "Công thức",
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
    for (const x of objects)
      for (const f of x.fields)
        if (f.type === "formula") {
          const e = validateFormula(f.formula ?? "", x, f.key);
          if (e) {
            setTab(x.key);
            setMsg(`Cột “${f.label}” (${x.label}): ${e}`);
            return;
          }
        }
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
                {f.type === "formula" && <FormulaInput obj={o} field={f} onChange={(formula) => update({ fields: o.fields.map((x, k) => (k === i ? { ...x, formula } : x)) })} />}
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
              update({
                fields: [
                  ...o.fields,
                  { key: uniqueKey(label, o.fields.map((f) => f.key)), label, type, options: type === "select" ? [{ key: "lua_chon_1", label: "Lựa chọn 1", color: "blue" }] : [], ...(type === "formula" ? { formula: o.amountLabel ? "{gia_tri} * 0.1" : "" } : {}) },
                ],
              })
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

// Bản ghi mẫu để xem trước công thức: lấy mục đầu tiên của bảng, không có thì dựng giá trị giả theo kiểu trường.
const sampleCache = new Map<string, Promise<FormulaRecord | null>>();
function loadSample(key: string) {
  if (!sampleCache.has(key))
    sampleCache.set(
      key,
      fetch(`/api/records?object=${key}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: FormulaRecord[]) => rows[0] ?? null)
        .catch(() => null),
    );
  return sampleCache.get(key)!;
}

function fakeRecord(obj: ObjectDef): FormulaRecord {
  const data: Record<string, string | number> = {};
  for (const f of obj.fields) {
    if (f.type === "number" || f.type === "rating") data[f.key] = 3;
    else if (f.type === "money") data[f.key] = 1_500_000;
    else if (f.type === "date") data[f.key] = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
    else if (f.type === "select") data[f.key] = f.options[0]?.label ?? "";
    else if (f.type !== "formula") data[f.key] = `${f.label} mẫu`;
  }
  return { title: `${obj.itemLabel} mẫu`, status: obj.statuses[0]?.key ?? "", ownerName: "Bạn", amount: 10_000_000, score: 65, winProb: 55, createdAt: new Date(Date.now() - 3 * 864e5).toISOString(), data };
}

const EXAMPLES = ["{gia_tri} * {kha_nang_chot} / 100", 'IF({diem} >= 70, "Nóng", "Theo dõi")', "DAYS(TODAY(), {tao_luc})", "ROUND({gia_tri} * 0.08, 0)"];

/** Ô nhập công thức: chèn trường, kiểm tra cú pháp, xem trước trên bản ghi mẫu. */
function FormulaInput({ obj, field, onChange }: { obj: ObjectDef; field: FieldDef; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [sample, setSample] = useState<FormulaRecord | null>(null);
  const [real, setReal] = useState(false);
  useEffect(() => {
    let alive = true;
    loadSample(obj.key).then((r) => {
      if (!alive) return;
      setSample(r ?? fakeRecord(obj));
      setReal(!!r);
    });
    return () => {
      alive = false;
    };
  }, [obj]);
  const src = field.formula ?? "";
  const err = src.trim() ? validateFormula(src, obj, field.key) : "Nhập biểu thức, ví dụ {so_luong} * {don_gia}";
  const res = !err && sample ? evalFormula(src, sample, obj, [field.key]) : null;
  const money = isMoneyFormula(field, obj);

  const insert = (text: string) => {
    const el = ref.current;
    const a = el?.selectionStart ?? src.length;
    const b = el?.selectionEnd ?? src.length;
    const next = src.slice(0, a) + text + src.slice(b);
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(a + text.length, a + text.length);
    });
  };
  const refs = [...BUILTIN_REFS.filter((b) => obj.amountLabel || (b.key !== "gia_tri" && b.key !== "kha_nang_chot")).filter((b) => obj.key === "contacts" || b.key !== "diem"), ...obj.fields.filter((f) => f.key !== field.key).map((f) => ({ key: f.key, label: f.label }))];

  return (
    <div className="grid gap-1.5 rounded bg-surface-2 p-2">
      <label className="grid gap-1">
        <span className="flex items-center gap-1 text-[12px] text-ink-2">
          <Icon name="formula" size={13} /> Biểu thức (kiểu Excel)
        </span>
        <textarea
          ref={ref}
          id={`ed-ff-${field.key}`}
          value={src}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          rows={2}
          placeholder="{so_luong} * {don_gia}"
          className={`textarea font-mono text-[13px] ${err && src.trim() ? "border-[#df2f4a]" : ""}`}
        />
      </label>
      <div className="flex flex-wrap gap-1" aria-label="Chèn trường">
        {refs.map((r) => (
          <button key={r.key} type="button" onClick={() => insert(`{${r.key}}`)} className="rounded border border-line-soft bg-surface px-1.5 py-0.5 text-[12px] hover:border-primary" title={`Chèn {${r.key}}`}>
            {r.label}
          </button>
        ))}
        {["IF(", "ROUND(", "SUM(", "DAYS(", "TODAY()", "CONCAT("].map((fn) => (
          <button key={fn} type="button" onClick={() => insert(fn)} className="rounded border border-line-soft bg-surface px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2 hover:border-primary">
            {fn}
          </button>
        ))}
      </div>
      {err ? (
        <p className={`text-[12.5px] ${src.trim() ? "text-[#df2f4a]" : "text-ink-2"}`}>{err}</p>
      ) : res ? (
        <p className="text-[12.5px]">
          <span className="text-[#00a35c]">✓ Hợp lệ.</span> <span className="text-ink-2">Thử trên {real ? `“${sample?.title}”` : "dữ liệu giả"}:</span>{" "}
          {res.ok ? <b className="tnum">{formatFormulaValue(res.value, { money, vnd }) || "(trống)"}</b> : <b className="text-[#df2f4a]" title={res.error}>#LỖI · {res.error}</b>}
        </p>
      ) : null}
      {!src.trim() && (
        <p className="flex flex-wrap gap-1 text-[12px] text-ink-2">
          Ví dụ:
          {EXAMPLES.map((x) => (
            <button key={x} type="button" className="font-mono text-primary hover:underline" onClick={() => onChange(x)}>
              {x}
            </button>
          ))}
        </p>
      )}
    </div>
  );
}
