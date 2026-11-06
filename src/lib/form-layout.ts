// Bố cục form hồ sơ (Pref "formLayout"): nhóm trường thành từng phần, ẩn trường khỏi form. Thuần.
import { z } from "zod";

export const Section = z.object({ title: z.string().trim().max(80), fields: z.array(z.string().max(80)).max(200), collapsed: z.boolean().optional() });
export type Section = z.infer<typeof Section>;
export const FormLayout = z.object({ sections: z.array(Section).max(30), hidden: z.array(z.string().max(80)).max(200).optional() });
export type FormLayout = z.infer<typeof FormLayout>;
export type FormLayoutPref = Record<string, FormLayout>;

export const OTHER_TITLE = "Khác";

/**
 * Chia trường theo bố cục: mỗi phần giữ thứ tự đã kéo, bỏ trường không còn trong bảng / bị ẩn;
 * trường chưa xếp vào phần nào dồn vào phần "Khác" ở cuối. Không có bố cục → một phần duy nhất (form phẳng như cũ).
 */
export function layoutSections<F extends { key: string }>(fields: F[], layout: FormLayout | null | undefined): { title: string; fields: F[]; collapsed: boolean }[] {
  if (!layout?.sections?.length) return [{ title: "", fields, collapsed: false }];
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const hidden = new Set(layout.hidden ?? []);
  const used = new Set<string>();
  const out = layout.sections.map((s) => {
    const list: F[] = [];
    for (const k of s.fields) {
      const f = byKey.get(k);
      if (!f || used.has(k) || hidden.has(k)) continue;
      used.add(k);
      list.push(f);
    }
    return { title: s.title || "Chưa đặt tên", fields: list, collapsed: !!s.collapsed };
  });
  const rest = fields.filter((f) => !used.has(f.key) && !hidden.has(f.key));
  if (rest.length) out.push({ title: OTHER_TITLE, fields: rest, collapsed: false });
  return out.filter((s) => s.fields.length);
}

/** Làm sạch bố cục trước khi lưu: bỏ key lạ, bỏ trùng giữa các phần. */
export function cleanLayout(layout: FormLayout, fieldKeys: string[]): FormLayout {
  const ok = new Set(fieldKeys);
  const seen = new Set<string>();
  const sections = layout.sections.map((s) => ({
    title: s.title.trim() || "Chưa đặt tên",
    fields: s.fields.filter((k) => ok.has(k) && !seen.has(k) && (seen.add(k), true)),
    ...(s.collapsed ? { collapsed: true } : {}),
  }));
  const hidden = [...new Set((layout.hidden ?? []).filter((k) => ok.has(k)))];
  return { sections, ...(hidden.length ? { hidden } : {}) };
}
