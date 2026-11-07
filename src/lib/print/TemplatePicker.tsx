"use client";
// Ô chọn mẫu in trên trang in (đổi ?t= và tải lại bản in).
import { usePathname, useRouter } from "next/navigation";
import type { TemplateLite } from "./server";

export function TemplatePicker({ templates, current }: { templates: TemplateLite[]; current: string }) {
  const router = useRouter();
  const path = usePathname();
  if (!templates.length) return null;
  return (
    <label className="flex items-center gap-2 text-[13px] text-ink-2">
      Mẫu in
      <select className="input h-8 w-auto text-[13px]" value={current} onChange={(e) => router.replace(`${path}?t=${encodeURIComponent(e.target.value)}`)}>
        <option value="builtin">Mẫu gốc</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
            {t.isDefault ? " (mặc định)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
