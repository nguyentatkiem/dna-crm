"use client";

import { useState } from "react";
import type { FieldDef, ObjectDef } from "@/lib/config/schema";
import type { FieldValue, RecordDTO } from "@/lib/records";
import { evalField, isMoneyFormula } from "@/lib/formula";
import { layoutSections, type FormLayout } from "@/lib/form-layout";
import { Icon } from "../Icon";
import { FieldCell } from "./cells";

const ROW = "grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[150px_minmax(0,1fr)]";

/** Tab "Thông tin" của hồ sơ: trường chia theo phần (Bố cục hồ sơ), trường chỉ xem không sửa được. Không có bố cục → danh sách phẳng như cũ. */
export function RecordForm({ obj, record, onPatch, readOnly, layout }: { obj: ObjectDef; record: RecordDTO; onPatch: (b: { data: Record<string, FieldValue> }) => void; readOnly?: string[]; layout?: FormLayout | null }) {
  const sections = layoutSections(obj.fields, layout);
  const [closed, setClosed] = useState<Record<number, boolean>>(() => Object.fromEntries(sections.map((s, i) => [i, s.collapsed])));
  const ro = new Set(readOnly ?? []);
  const row = (f: FieldDef) => {
    const locked = ro.has(f.key);
    const cell = <FieldCell field={f} value={record.data[f.key]} onSave={(v) => onPatch({ data: { [f.key]: v } })} form computed={f.type === "formula" ? evalField(f, record, obj) : undefined} money={f.type === "formula" && isMoneyFormula(f, obj)} />;
    return (
      <div key={f.key} className={ROW}>
        <dt className="flex items-center gap-1 text-[13.5px] text-ink-2">
          {f.label}
          {locked && (
            <span title="Chỉ xem">
              <Icon name="lock" size={12} />
            </span>
          )}
        </dt>
        <dd className={`h-9 ${locked ? "cursor-not-allowed" : ""}`} title={f.type === "formula" ? `Công thức: ${f.formula ?? ""}` : locked ? "Chỉ xem: bạn không được sửa trường này" : undefined}>
          {locked ? (
            <div inert className="h-full">
              {cell}
            </div>
          ) : (
            cell
          )}
        </dd>
      </div>
    );
  };
  if (sections.length === 1 && !sections[0].title) return <>{sections[0].fields.map(row)}</>;
  return (
    <>
      {sections.map((s, i) => (
        <section key={`${s.title}-${i}`} className={i ? "border-t border-line-soft pt-3" : ""}>
          <button type="button" className="mb-2 flex w-full items-center gap-1.5 text-left text-[13px] font-semibold uppercase tracking-wide text-ink-2 hover:text-ink" aria-expanded={!closed[i]} onClick={() => setClosed((c) => ({ ...c, [i]: !c[i] }))}>
            <Icon name="chevron" size={15} className={closed[i] ? "-rotate-90" : ""} />
            {s.title}
            <span className="font-normal normal-case tracking-normal">· {s.fields.length}</span>
          </button>
          {!closed[i] && <div className="grid gap-3">{s.fields.map(row)}</div>}
        </section>
      ))}
    </>
  );
}
