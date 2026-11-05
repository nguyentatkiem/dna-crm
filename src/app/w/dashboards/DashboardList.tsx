"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { ago } from "@/lib/format";
import { LIBRARY, TEMPLATES, type WidgetType } from "./catalog";

type Row = { id: string; name: string; isDefault: boolean; widgets: number; types: WidgetType[]; updatedAt: string };

const json = (body: unknown) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function DashboardList({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");

  async function create(body: Record<string, unknown>, tag: string) {
    setBusy(tag);
    setMsg("");
    const res = await fetch("/api/dashboards", { method: "POST", ...json(body) });
    const d = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setMsg(d.error ?? "Không tạo được dashboard");
    if (body.duplicateOf) {
      setRows((rs) => [...rs, { ...d, types: rs.find((r) => r.id === body.duplicateOf)?.types ?? [] }]);
      return setMsg(`Đã nhân bản thành “${d.name}”.`);
    }
    router.push(`/w/dashboards/${d.id}${body.template === "blank" ? "?edit=1" : ""}`);
  }
  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/dashboards/${id}`, { method: "PATCH", ...json(body) });
    if (!res.ok) setMsg((await res.json().catch(() => ({}))).error ?? "Không lưu được");
    return res.ok;
  }
  async function rename(r: Row) {
    const n = name.trim();
    setRenaming(null);
    if (!n || n === r.name) return;
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, name: n } : x)));
    await patch(r.id, { name: n });
  }
  async function makeDefault(r: Row) {
    setRows((rs) => rs.map((x) => ({ ...x, isDefault: x.id === r.id })));
    await patch(r.id, { isDefault: true });
  }
  async function remove(r: Row) {
    if (!confirm(`Xoá dashboard “${r.name}”? Không hoàn tác được.`)) return;
    const res = await fetch(`/api/dashboards/${r.id}`, { method: "DELETE" });
    if (!res.ok) return setMsg("Không xoá được dashboard");
    setRows((rs) => {
      const left = rs.filter((x) => x.id !== r.id);
      if (r.isDefault && left.length && !left.some((x) => x.isDefault)) left[0] = { ...left[0], isDefault: true };
      return left;
    });
  }

  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold">Dashboard</h1>
          <p className="mt-1 max-w-2xl text-ink-2">Tự chọn widget: doanh thu, phễu, cuộc gọi, chi phí quảng cáo, mục tiêu tháng... Mỗi người chỉ thấy số liệu trong phạm vi quyền của mình.</p>
        </div>
        <button className="btn-primary" onClick={() => create({ template: "blank" }, "blank")} disabled={!!busy}>
          <Icon name="plus" size={16} /> Dashboard trống
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (prompt.trim().length >= 3) create({ prompt }, "ai");
        }}
        className="mt-5 flex flex-wrap items-center gap-2 rounded-lg border border-[#d9c5f0] bg-surface-2 p-3"
      >
        <Icon name="spark" size={18} className="ml-1 text-[#a25ddc]" />
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="AI tạo dashboard, ví dụ: dashboard cho trưởng phòng telesales"
          aria-label="Mô tả dashboard cần tạo"
          className="h-9 min-w-0 flex-1 basis-56 bg-transparent px-2 text-[14px] outline-none placeholder:text-ink-2"
        />
        <button className="btn-primary" disabled={!!busy || prompt.trim().length < 3}>
          {busy === "ai" ? "Đang dựng..." : "AI tạo dashboard"}
        </button>
      </form>
      {msg && <p className="mt-2 text-[13px] text-ink-2">{msg}</p>}

      <section className="mt-6">
        <p className="label">Bắt đầu từ mẫu</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {TEMPLATES.map((t) => (
            <button key={t.key} type="button" disabled={!!busy} onClick={() => create({ template: t.key }, t.key)} className="card flex min-w-0 items-center gap-3 p-3 text-left hover:border-primary hover:shadow-card disabled:opacity-60">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-primary-selected text-primary">
                <Icon name={t.key === "telesales" ? "headset" : t.key === "marketing" ? "megaphone" : "chart"} size={18} />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{busy === t.key ? "Đang tạo..." : t.name}</span>
                <span className="block text-[12.5px] text-ink-2">{t.widgets.length} widget dựng sẵn</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <p className="label">Dashboard của bạn</p>
        {rows.length === 0 ? (
          <div className="card mt-2 grid place-items-center gap-2 p-10 text-center">
            <Icon name="chart" size={28} className="text-ink-2" />
            <p className="font-medium">Chưa có dashboard nào</p>
            <p className="max-w-md text-[13.5px] text-ink-2">Chọn một mẫu bên trên, gõ mô tả để AI dựng giúp, hoặc tạo dashboard trống rồi kéo widget vào.</p>
          </div>
        ) : (
          <ul className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => (
              <li key={r.id} className="card flex min-w-0 flex-col p-4">
                <div className="flex min-w-0 items-start gap-2">
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-surface-2 text-primary">
                    <Icon name="layout" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    {renaming === r.id ? (
                      <input
                        autoFocus
                        className="input h-8"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => rename(r)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") rename(r);
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        aria-label="Tên dashboard"
                      />
                    ) : (
                      <Link href={`/w/dashboards/${r.id}`} className="block truncate text-[15.5px] font-semibold hover:text-primary">
                        {r.name}
                      </Link>
                    )}
                    <p className="mt-0.5 text-[12.5px] text-ink-2">
                      {r.widgets} widget · sửa {ago(r.updatedAt)}
                    </p>
                  </div>
                  {r.isDefault ? (
                    <span className="flex-none rounded-full bg-[#00c875]/15 px-2 py-0.5 text-[11.5px] font-medium text-[#00a35f]">Mặc định</span>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {r.types.map((t) => (
                    <span key={t} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11.5px] text-ink-2">
                      {LIBRARY.find((l) => l.type === t)?.label ?? t}
                    </span>
                  ))}
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-line-soft pt-3 text-[13px]">
                  <Link href={`/w/dashboards/${r.id}`} className="btn-ghost h-7 px-2 text-[13px]">
                    Mở
                  </Link>
                  <button
                    type="button"
                    className="btn-ghost h-7 px-2 text-[13px]"
                    onClick={() => {
                      setName(r.name);
                      setRenaming(r.id);
                    }}
                  >
                    <Icon name="edit" size={14} /> Đổi tên
                  </button>
                  <button type="button" className="btn-ghost h-7 px-2 text-[13px]" onClick={() => create({ duplicateOf: r.id }, "dup")}>
                    <Icon name="copy" size={14} /> Nhân bản
                  </button>
                  {!r.isDefault && (
                    <button type="button" className="btn-ghost h-7 px-2 text-[13px]" onClick={() => makeDefault(r)}>
                      Đặt mặc định
                    </button>
                  )}
                  <button type="button" className="btn-ghost ml-auto h-7 px-2 text-[13px] text-[#df2f4a]" onClick={() => remove(r)} aria-label={`Xoá ${r.name}`}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
