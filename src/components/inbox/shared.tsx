"use client";

// Thành phần nhỏ và tiện ích dùng chung cho Hộp thư.
import { Avatar } from "@/components/Avatar";
import { color } from "@/lib/colors";
import type { InboxTag } from "@/lib/quick-replies";
import type { InboxItem } from "@/lib/inbox-types";

export type Perms = { assign: boolean; moderate: boolean; manageQuick: boolean; salesCreate: boolean; stats: boolean; settings: boolean; quality: boolean; rescore: boolean };

export const CH: Record<string, { label: string; bg: string; letter: string }> = {
  zalo: { label: "Zalo", bg: "#0068ff", letter: "Z" },
  messenger: { label: "Messenger", bg: "#0084ff", letter: "m" },
  facebook: { label: "Facebook", bg: "#1877f2", letter: "f" },
  instagram: { label: "Instagram", bg: "#d62976", letter: "ig" },
  whatsapp: { label: "WhatsApp", bg: "#1da851", letter: "wa" },
  shopee: { label: "Shopee", bg: "#ee4d2d", letter: "S" },
  tiktok: { label: "TikTok Shop", bg: "#25262b", letter: "tt" },
};
export const chOf = (c: string) => CH[c] ?? { label: c || "Kênh", bg: "#676879", letter: (c[0] ?? "?").toUpperCase() };

/** Lỗi API có mã HTTP để phân biệt 404 (tính năng chưa có) với lỗi nghiệp vụ. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public json: boolean,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  let j: unknown = null;
  let isJson = false;
  try {
    j = await res.json();
    isJson = true;
  } catch {
    j = null;
  }
  if (!res.ok) throw new ApiError((j as { error?: string } | null)?.error ?? `Lỗi ${res.status}`, res.status, isJson);
  return j as T;
}

/** Thời gian ngắn cho danh sách: vừa xong / 5 phút / 2 giờ / Hôm qua / 12/10. */
export function short(at: string) {
  const d = new Date(at);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d >= today) return `${Math.floor(s / 3600)} giờ`;
  if (d.getTime() >= today.getTime() - 864e5) return "Hôm qua";
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

export function dayLabel(at: string) {
  const d = new Date(at);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d >= today) return "Hôm nay";
  if (d.getTime() >= today.getTime() - 864e5) return "Hôm qua";
  return d.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" });
}

export const hhmm = (at: string) => new Date(at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

export function ChannelBadge({ channel, small, page }: { channel: string; small?: boolean; page?: string }) {
  const c = chOf(channel);
  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden rounded font-semibold text-white ${page ? "shrink" : "flex-none"} ${small ? "px-1 text-[10px] leading-[16px]" : "px-1.5 text-[11px] leading-[18px]"}`} style={{ background: c.bg }}>
      <span className="flex-none">{c.label}</span>
      {page && <span className="min-w-0 truncate font-normal opacity-90">· {page}</span>}
    </span>
  );
}

export function Face({ c, size = 36 }: { c: Pick<InboxItem, "name" | "avatar" | "channel">; size?: number }) {
  const ch = chOf(c.channel);
  return (
    <span className="relative inline-block flex-none" style={{ width: size, height: size }}>
      {c.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.avatar} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
      ) : (
        <Avatar name={c.name} size={size} />
      )}
      <span className="absolute -bottom-0.5 -right-0.5 grid h-[15px] min-w-[15px] place-items-center rounded-full border-2 border-surface px-[1px] text-[8px] font-bold text-white" style={{ background: ch.bg }} title={ch.label} aria-hidden="true">
        {ch.letter}
      </span>
    </span>
  );
}

export function TagChip({ tag, onRemove, small }: { tag: InboxTag; onRemove?: () => void; small?: boolean }) {
  const c = color(tag.color);
  return (
    <span className={`inline-flex max-w-[140px] flex-none items-center gap-0.5 rounded-full font-medium ${small ? "px-1.5 text-[10.5px] leading-[16px]" : "px-2 text-[12px] leading-[20px]"}`} style={{ background: c.bg, color: c.fg }}>
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} className="-mr-1 ml-0.5 grid h-4 w-4 place-items-center rounded-full hover:bg-black/15" aria-label={`Gỡ thẻ ${tag.name}`}>
          ×
        </button>
      )}
    </span>
  );
}

/** Ảnh đại diện người phụ trách, có chấm xanh khi đang trực. */
export function StaffAvatar({ name, size = 18, online }: { name: string; size?: number; online?: boolean }) {
  return (
    <span className="relative inline-flex flex-none" title={online ? `${name} · đang trực` : name}>
      <Avatar name={name} size={size} />
      {online && <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-surface bg-success" aria-label="đang trực" />}
    </span>
  );
}

export function AngryBadge({ small }: { small?: boolean }) {
  return <span className={`badge-danger flex-none ${small ? "text-[10px]" : "text-[11px]"}`} title="Phát hiện khách có cảm xúc tiêu cực">Khách đang bực</span>;
}

/** Ô màu chọn từ bảng màu chung. */
export function ColorDots({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  const keys = ["green", "orange", "red", "blue", "purple", "darkblue", "grass", "sky", "berry", "pink", "yellow", "gray"];
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={label}>
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          aria-label={k}
          onClick={() => onChange(k)}
          className={`h-5 w-5 rounded-full ring-offset-2 ring-offset-surface ${value === k ? "ring-2 ring-ink" : ""}`}
          style={{ background: color(k).bg }}
        />
      ))}
    </div>
  );
}

/** Có đang gõ trong ô nhập không (để phím tắt không cướp phím). */
export const typing = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
};
