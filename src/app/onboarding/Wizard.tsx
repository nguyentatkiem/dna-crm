"use client";

import { useEffect, useState } from "react";
import { Icon, Logo } from "@/components/Icon";
import { CHANNELS, CYCLES, DNA_HINTS, INDUSTRIES, KPI_CHOICES, TEAM_SIZES, type Dna, type IndustryKey } from "@/lib/dna";
import type { WorkspaceConfig } from "@/lib/config/schema";
import { color } from "@/lib/colors";
import { recipe } from "@/lib/recipe";
import { AGENTS } from "@/lib/agents";

const STEPS = ["Ngành nghề", "Doanh nghiệp", "Khách hàng", "Quy trình bán", "Đội ngũ", "Mục tiêu"];
const GEN_STEPS = ["Đọc DNA doanh nghiệp", "Chọn mẫu ngành và thuật ngữ", "Biến quy trình bán thành các giai đoạn", "Tạo trường dữ liệu cho từng bảng", "Đề xuất công thức tự động hoá", "Bật đội AI Agent phù hợp"];
const MODULES: [keyof WorkspaceConfig["modules"], string][] = [
  ["appointments", "Lịch hẹn"],
  ["products", "Sản phẩm"],
  ["invoices", "Hoá đơn"],
  ["loyalty", "Tích điểm"],
  ["tickets", "CSKH / Ticket"],
];

type Draft = { configId: string; config: WorkspaceConfig; source: "ai" | "template" };

export function Wizard({ initial, isEdit, userName }: { initial: Dna; isEdit: boolean; userName: string }) {
  const [dna, setDna] = useState<Dna>(initial);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"form" | "gen" | "preview">("form");
  const [genAt, setGenAt] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [modules, setModules] = useState<WorkspaceConfig["modules"] | null>(null);
  const [autoOn, setAutoOn] = useState<boolean[]>([]);
  const [sample, setSample] = useState(!isEdit);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Dna>(k: K, v: Dna[K]) => setDna((d) => ({ ...d, [k]: v }));
  const toggleIn = (k: "channels" | "kpis", v: string) => set(k, dna[k].includes(v) ? dna[k].filter((x) => x !== v) : [...dna[k], v]);
  const pickIndustry = (k: IndustryKey) => setDna((d) => ({ ...d, industry: k, ...DNA_HINTS[k] }));

  useEffect(() => {
    if (phase !== "gen") return;
    const t = setInterval(() => setGenAt((x) => Math.min(x + 1, GEN_STEPS.length - 1)), 700);
    return () => clearInterval(t);
  }, [phase]);

  async function generate() {
    setPhase("gen");
    setGenAt(0);
    setError("");
    const res = await fetch("/api/dna", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dna) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Không sinh được cấu hình");
      setPhase("form");
      return;
    }
    setDraft(data);
    setModules(data.config.modules);
    setAutoOn(data.config.automations.map(() => true));
    setPhase("preview");
  }

  async function apply() {
    if (!draft) return;
    setBusy(true);
    const res = await fetch("/api/config/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configId: draft.configId, modules, automations: autoOn, sample }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Không áp dụng được");
      setBusy(false);
      return;
    }
    window.location.href = data.redirect;
  }

  const ind = INDUSTRIES[dna.industry];

  return (
    <div className="min-h-screen bg-bg">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2 font-title text-[17px] font-semibold">
          <Logo /> DNA CRM
        </div>
        {isEdit && (
          <a href="/w" className="btn-ghost">
            Quay lại CRM
          </a>
        )}
      </header>

      {phase === "form" && (
        <main className="mx-auto grid max-w-[1120px] gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-lg bg-surface p-6 shadow-card sm:p-8">
            <ol className="mb-6 flex gap-1.5" aria-label="Tiến độ">
              {STEPS.map((s, i) => (
                <li key={s} title={s} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-primary" : i === step ? "bg-primary opacity-40" : "bg-line-soft"}`} />
              ))}
            </ol>
            <p className="label">
              Bước {step + 1}/6 · {STEPS[step]}
            </p>

            {step === 0 && (
              <Q title={`Chào ${userName}, doanh nghiệp của bạn thuộc ngành nào?`} sub="Đây là gen gốc. Hệ thống lấy mẫu ngành rồi tinh chỉnh theo các câu trả lời tiếp theo.">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(Object.keys(INDUSTRIES) as IndustryKey[]).map((k) => (
                    <button key={k} type="button" onClick={() => pickIndustry(k)} className={`grid gap-1 rounded-lg border p-4 text-left transition ${dna.industry === k ? "border-primary bg-primary-selected ring-1 ring-primary" : "border-line hover:border-primary"}`}>
                      <span className={`mb-1 grid h-9 w-9 place-items-center rounded-md text-[12px] font-bold ${dna.industry === k ? "bg-primary text-white" : "bg-surface-2"}`}>{INDUSTRIES[k].mark}</span>
                      <b className="text-[15px]">{INDUSTRIES[k].label}</b>
                      <span className="text-[13px] text-ink-2">{INDUSTRIES[k].desc}</span>
                    </button>
                  ))}
                </div>
              </Q>
            )}
            {step === 1 && (
              <Q title="Giới thiệu doanh nghiệp" sub="Dùng để đặt tên gọi và danh mục sản phẩm trong CRM.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Tên doanh nghiệp">
                    <input id="dna-name" className="input" value={dna.businessName} onChange={(e) => set("businessName", e.target.value)} />
                  </Field>
                  <Field label="Mô hình">
                    <Chips options={["B2C", "B2B", "Cả hai"]} isOn={(o) => dna.model === o} onPick={(o) => set("model", o as Dna["model"])} />
                  </Field>
                </div>
                <Field label="Sản phẩm / dịch vụ chính">
                  <textarea id="dna-products" className="textarea min-h-24" value={dna.products} onChange={(e) => set("products", e.target.value)} />
                </Field>
              </Q>
            )}
            {step === 2 && (
              <Q title="Khách hàng của bạn là ai?" sub="Lead Qualifier dựa vào đây để chấm điểm, Sales Coach dựa vào đây để chọn giọng văn.">
                <Field label="Chân dung khách hàng mục tiêu">
                  <textarea id="dna-target" className="textarea min-h-24" value={dna.targetCustomer} onChange={(e) => set("targetCustomer", e.target.value)} />
                </Field>
                <Field label="Khách đến từ kênh nào? (chọn nhiều)">
                  <Chips options={CHANNELS} isOn={(o) => dna.channels.includes(o)} onPick={(o) => toggleIn("channels", o)} />
                </Field>
              </Q>
            )}
            {step === 3 && (
              <Q title="Quy trình bán hàng" sub="Viết như đang kể cho nhân viên mới. AI sẽ biến nó thành các giai đoạn trong bảng.">
                <Field label="Các bước từ lúc có khách đến khi chốt">
                  <textarea id="dna-steps" className="textarea min-h-24" value={dna.salesSteps} onChange={(e) => set("salesSteps", e.target.value)} />
                </Field>
                <Field label="Chu kỳ bán trung bình">
                  <Chips options={CYCLES} isOn={(o) => dna.salesCycle === o} onPick={(o) => set("salesCycle", o)} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Toggle label="Khách có mua lại / tái sử dụng?" on={dna.repeatPurchase} onChange={(v) => set("repeatPurchase", v)} />
                  <Toggle label="Có đặt lịch hẹn với khách?" on={dna.hasAppointments} onChange={(v) => set("hasAppointments", v)} />
                </div>
              </Q>
            )}
            {step === 4 && (
              <Q title="Đội ngũ bán hàng" sub="Dùng để phân quyền và chia khách tự động.">
                <Field label="Quy mô đội">
                  <Chips options={TEAM_SIZES} isOn={(o) => dna.teamSize === o} onPick={(o) => set("teamSize", o)} />
                </Field>
                <Field label="Tên thành viên (cách nhau bằng dấu phẩy)">
                  <input id="dna-team" className="input" value={dna.teamMembers} onChange={(e) => set("teamMembers", e.target.value)} />
                </Field>
              </Q>
            )}
            {step === 5 && (
              <Q title="Bạn muốn CRM giúp gì nhất?" sub="Quyết định dashboard và các AI Agent được bật sẵn.">
                <Field label="Chỉ số quan trọng">
                  <Chips options={KPI_CHOICES} isOn={(o) => dna.kpis.includes(o)} onPick={(o) => toggleIn("kpis", o)} />
                </Field>
                <Field label="Điều đang làm bạn đau đầu">
                  <textarea id="dna-pain" className="textarea min-h-24" value={dna.painPoints} onChange={(e) => set("painPoints", e.target.value)} />
                </Field>
              </Q>
            )}

            {error && <p className="mt-4 rounded bg-[#ffe0e5] px-3 py-2 text-[13px] text-[#a01c32]">{error}</p>}
            <div className="mt-8 flex justify-between gap-3">
              <button type="button" className="btn-outline" disabled={step === 0} onClick={() => setStep(step - 1)}>
                Quay lại
              </button>
              {step < 5 ? (
                <button type="button" className="btn-primary" disabled={step === 1 && !dna.businessName.trim()} onClick={() => setStep(step + 1)}>
                  Tiếp tục
                </button>
              ) : (
                <button type="button" className="btn-primary" onClick={generate}>
                  <Icon name="spark" size={16} /> Để AI dựng CRM cho tôi
                </button>
              )}
            </div>
          </section>

          <aside className="h-fit rounded-lg bg-surface p-5 shadow-card lg:sticky lg:top-6">
            <p className="label">DNA đang hình thành</p>
            <h3 className="mt-1 text-[17px] font-semibold">{dna.businessName || "Doanh nghiệp của bạn"}</h3>
            <dl className="mt-3 grid gap-2.5 text-[13px]">
              <Gene k="Ngành" v={ind.label} />
              <Gene k="Mô hình" v={`${dna.model} · ${dna.salesCycle}`} />
              <Gene k="Kênh" v={dna.channels.join(", ") || "Chưa chọn"} />
              <Gene k="Quy trình" v={dna.salesSteps} />
              <Gene k="Đội" v={`${dna.teamSize} · ${dna.teamMembers}`} />
              <Gene k="Mục tiêu" v={dna.kpis.join(", ")} />
            </dl>
          </aside>
        </main>
      )}

      {phase === "gen" && (
        <main className="mx-auto grid max-w-[520px] gap-4 px-4 py-16">
          <p className="label">DNA Architect đang làm việc</p>
          <h1 className="text-[26px] font-semibold">Đang dựng CRM cho {dna.businessName}</h1>
          <ul className="grid gap-2">
            {GEN_STEPS.map((g, i) => (
              <li key={g} className={`flex items-center gap-3 rounded-lg bg-surface px-4 py-3 shadow-card transition-opacity ${i <= genAt ? "opacity-100" : "opacity-40"}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${i < genAt ? "bg-[#00c875]" : i === genAt ? "animate-pulse bg-primary" : "bg-line"}`} />
                {g}
              </li>
            ))}
          </ul>
        </main>
      )}

      {phase === "preview" && draft && modules && (
        <main className="mx-auto grid max-w-[1180px] gap-5 px-4 pb-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="label">
                Cấu hình v{draft.config.version} · {draft.source === "ai" ? "AI tinh chỉnh từ DNA" : "Template ngành (chưa bật AI)"}
              </p>
              <h1 className="mt-1 text-[28px] font-semibold">CRM của {draft.config.businessName} đã sẵn sàng</h1>
              <p className="mt-1 text-ink-2">Bật, tắt từng phần rồi áp dụng. Bạn sửa DNA và sinh lại được bất cứ lúc nào.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-outline" onClick={() => setPhase("form")}>
                Sửa DNA
              </button>
              <button className="btn-primary" onClick={apply} disabled={busy}>
                {busy ? "Đang áp dụng..." : "Áp dụng và vào CRM"}
              </button>
            </div>
          </div>
          {error && <p className="rounded bg-[#ffe0e5] px-3 py-2 text-[13px] text-[#a01c32]">{error}</p>}

          <div className="grid gap-4 lg:grid-cols-3">
            {draft.config.objects
              .filter((o) => o.key !== "appointments" || modules.appointments)
              .map((o) => (
                <div key={o.key} className="card grid content-start gap-3 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[16px] font-semibold">Bảng “{o.label}”</h3>
                    <span className="text-[12px] text-ink-2">{o.fields.length} trường</span>
                  </div>
                  <div>
                    <p className="label mb-1.5">{o.statusLabel}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {o.statuses.map((s) => (
                        <span key={s.key} className="rounded px-2.5 py-1 text-[12.5px]" style={{ background: color(s.color).bg, color: color(s.color).fg }}>
                          {s.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="label mb-1.5">Trường dữ liệu</p>
                    <ul className="grid gap-1 text-[13.5px]">
                      {o.fields.map((f) => (
                        <li key={f.key} className="flex justify-between">
                          <span>{f.label}</span>
                          <span className="font-mono text-[11px] text-ink-2">{f.type}</span>
                        </li>
                      ))}
                      {o.amountLabel && (
                        <li className="flex justify-between">
                          <span>{o.amountLabel}</span>
                          <span className="font-mono text-[11px] text-ink-2">money</span>
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="card p-5">
              <h3 className="mb-3 text-[16px] font-semibold">Công thức tự động hoá</h3>
              <ul className="grid gap-2">
                {draft.config.automations.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded border border-line-soft px-3 py-2.5">
                    <span className="text-[14px]">
                      {recipe(a, draft.config).map((p, j) => (p.strong ? <b key={j} className="underline decoration-line underline-offset-4">{p.text}</b> : <span key={j}>{p.text}</span>))}
                    </span>
                    <Switch on={autoOn[i]} onChange={(v) => setAutoOn(autoOn.map((x, k) => (k === i ? v : x)))} label="Bật công thức" />
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid content-start gap-4">
              <div className="card p-5">
                <h3 className="mb-3 text-[16px] font-semibold">Module</h3>
                <ul className="grid gap-2.5">
                  {MODULES.map(([k, label]) => (
                    <li key={k} className="flex items-center justify-between">
                      <span>{label}</span>
                      <Switch on={modules[k]} onChange={(v) => setModules({ ...modules, [k]: v })} label={label} disabled={k === "appointments" && !draft.config.objects.some((o) => o.key === "appointments")} />
                    </li>
                  ))}
                </ul>
              </div>
              <div className="card p-5">
                <h3 className="mb-3 text-[16px] font-semibold">AI Agent bật sẵn</h3>
                <ul className="grid gap-1.5 text-[14px]">
                  {AGENTS.filter((a) => draft.config.agents.includes(a.key)).map((a) => (
                    <li key={a.key} className="flex justify-between">
                      <span>{a.name}</span>
                      <span className="text-[12px] text-ink-2">{a.phase}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {!isEdit && (
                <label className="card flex items-center gap-3 p-4 text-[14px]">
                  <input id="opt-sample" type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                  Thêm dữ liệu mẫu để thử ngay (xoá được sau)
                </label>
              )}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

function Q({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 grid gap-5">
      <div>
        <h1 className="text-[24px] font-semibold leading-tight">{title}</h1>
        <p className="mt-1 text-ink-2">{sub}</p>
      </div>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[14px] font-medium">{label}</span>
      {children}
    </label>
  );
}
function Chips({ options, isOn, onPick }: { options: string[]; isOn: (o: string) => boolean; onPick: (o: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o} type="button" className={`chip ${isOn(o) ? "chip-on" : ""}`} onClick={() => onPick(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}
function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border border-line-soft px-3 py-2.5">
      <span>{label}</span>
      <Switch on={on} onChange={onChange} label={label} />
    </div>
  );
}
export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 flex-none rounded-full transition-colors disabled:opacity-40 ${on ? "bg-[#00c875]" : "bg-line"}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
  );
}
function Gene({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-2 border-t border-line-soft pt-2.5">
      <dt className="text-ink-2">{k}</dt>
      <dd className="break-words">{v}</dd>
    </div>
  );
}
