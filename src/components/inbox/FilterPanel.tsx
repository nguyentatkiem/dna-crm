"use client";

import { Icon } from "@/components/Icon";
import { DEFAULT_QUERY, type InboxQuery } from "@/lib/inbox-query";
import type { InboxTag } from "@/lib/quick-replies";
import { CH, TagChip } from "./shared";

export type PostOpt = { postId: string; label: string; live: boolean };

type Props = {
  q: InboxQuery;
  onChange: (patch: Partial<InboxQuery>) => void;
  tags: InboxTag[];
  team: string[];
  me: string;
  posts: PostOpt[];
  channels: string[];
  onClose: () => void;
};

function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k || "all"} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)} className={`h-7 rounded-full border px-2.5 text-[12.5px] ${value === k ? "border-primary bg-primary-selected text-ink" : "border-line-soft text-ink-2 hover:bg-hover"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

const Row = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="border-b border-line-soft px-3 py-2.5 last:border-0">
    <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-2">{title}</div>
    {children}
  </div>
);

/** Bảng lọc nâng cao: các điều kiện ghép AND với nhau. */
export function FilterPanel({ q, onChange, tags, team, me, posts, channels, onClose }: Props) {
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const tagState = (k: string) => (q.tags.includes(k) ? "in" : q.notTags.includes(k) ? "out" : "");
  const cycleTag = (k: string) => {
    const s = tagState(k);
    // Bấm lần lượt: có thẻ → không có thẻ → bỏ lọc.
    if (s === "") onChange({ tags: [...q.tags, k] });
    else if (s === "in") onChange({ tags: q.tags.filter((x) => x !== k), notTags: [...q.notTags, k] });
    else onChange({ notTags: q.notTags.filter((x) => x !== k) });
  };
  const members = [...new Set([me, ...team].filter(Boolean))];
  return (
    <div className="absolute inset-x-2 top-full z-30 mt-1 max-h-[min(70vh,560px)] overflow-y-auto rounded-lg border border-line bg-surface shadow-lg" role="dialog" aria-label="Bộ lọc nâng cao">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line-soft bg-surface px-3 py-2">
        <b className="flex-1 text-[13.5px]">Bộ lọc</b>
        <button
          type="button"
          className="text-[12.5px] text-primary hover:underline"
          onClick={() => {
            const { kind, page, q: text, limit } = q;
            onChange({ ...DEFAULT_QUERY, kind, page, q: text, limit });
          }}
        >
          Xoá lọc
        </button>
        <button type="button" className="btn-ghost h-7 w-7 justify-center px-0" onClick={onClose} aria-label="Đóng bộ lọc">
          <Icon name="x" size={14} />
        </button>
      </div>

      <Row title="Đọc & trả lời">
        <Seg
          label="Trạng thái đọc"
          value={q.read}
          onChange={(read) => onChange({ read })}
          options={[
            ["", "Tất cả"],
            ["unread", "Chưa đọc"],
            ["unreplied", "Chưa trả lời"],
            ["read_unreplied", "Đã đọc, chưa trả lời"],
          ]}
        />
        <div className="mt-2">
          <Seg
            label="Sắp xếp"
            value={q.sort}
            onChange={(sort) => onChange({ sort })}
            options={[
              ["newest", "Mới nhất trước"],
              ["oldest_wait", "Đợi lâu nhất trước"],
            ]}
          />
        </div>
      </Row>

      <Row title="Trạng thái hội thoại">
        <Seg
          label="Trạng thái"
          value={q.status}
          onChange={(status) => onChange({ status })}
          options={[
            ["open", "Đang mở"],
            ["done", "Đã xong"],
            ["all", "Cả hai"],
          ]}
        />
      </Row>

      <Row title="Số điện thoại">
        <Seg
          label="Số điện thoại"
          value={q.phone}
          onChange={(phone) => onChange({ phone })}
          options={[
            ["", "Tất cả"],
            ["has", "Có SĐT"],
            ["none", "Chưa có SĐT"],
          ]}
        />
      </Row>

      <Row title="Thẻ">
        {tags.length ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => {
                const s = tagState(t.key);
                return (
                  <button key={t.key} type="button" onClick={() => cycleTag(t.key)} className={`rounded-full p-0.5 ${s === "in" ? "ring-2 ring-primary" : s === "out" ? "opacity-60 ring-2 ring-danger" : ""}`} aria-pressed={s !== ""} title={s === "in" ? "Có thẻ này" : s === "out" ? "Không có thẻ này" : "Bấm để lọc"}>
                    <span className="flex items-center gap-0.5">
                      {s === "out" && <span className="text-[11px] font-bold text-danger">≠</span>}
                      <TagChip tag={t} small />
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11.5px] text-ink-2">Bấm một lần: có thẻ · hai lần: không có thẻ · ba lần: bỏ.</p>
            {q.tags.length > 1 && (
              <div className="mt-1.5">
                <Seg
                  label="Kiểu khớp thẻ"
                  value={q.tagMode}
                  onChange={(tagMode) => onChange({ tagMode })}
                  options={[
                    ["any", "Có một trong các thẻ"],
                    ["all", "Có tất cả các thẻ"],
                  ]}
                />
              </div>
            )}
          </>
        ) : (
          <p className="text-[12.5px] text-ink-2">Chưa có thẻ nào.</p>
        )}
      </Row>

      <Row title="Người phụ trách">
        <div className="flex flex-wrap gap-1">
          {[...members, ""].map((m) => (
            <button
              key={m || "-"}
              type="button"
              aria-pressed={q.assignees.includes(m)}
              onClick={() => onChange({ assignees: toggle(q.assignees, m) })}
              className={`h-7 rounded-full border px-2.5 text-[12.5px] ${q.assignees.includes(m) ? "border-primary bg-primary-selected text-ink" : "border-line-soft text-ink-2 hover:bg-hover"}`}
            >
              {m === "" ? "Chưa giao" : m === me ? `${m} (bạn)` : m}
            </button>
          ))}
        </div>
      </Row>

      {channels.length > 1 && (
        <Row title="Kênh">
          <Seg label="Kênh" value={q.channel} onChange={(channel) => onChange({ channel })} options={[["", "Mọi kênh"], ...channels.map((c) => [c, CH[c]?.label ?? c] as [string, string])]} />
        </Row>
      )}

      <Row title="Nguồn khách">
        <Seg
          label="Nguồn"
          value={q.source}
          onChange={(source) => onChange({ source })}
          options={[
            ["", "Tất cả"],
            ["post", "Bài viết"],
            ["ad", "Quảng cáo"],
            ["website", "Website"],
            ["ref", "Link m.me"],
          ]}
        />
        {posts.length > 0 && (
          <select className="input mt-2 h-8 text-[13px]" value={q.post} onChange={(e) => onChange({ post: e.target.value })} aria-label="Bài viết cụ thể">
            <option value="">Mọi bài viết</option>
            {posts.map((p) => (
              <option key={p.postId} value={p.postId}>
                {p.live ? "[Live] " : ""}
                {p.label}
              </option>
            ))}
          </select>
        )}
        {q.post && !posts.some((p) => p.postId === q.post) && (
          <p className="mt-1.5 flex items-center gap-1 text-[12px] text-ink-2">
            Bài viết: <code className="truncate">{q.post}</code>
            <button type="button" className="text-primary hover:underline" onClick={() => onChange({ post: "" })}>
              bỏ
            </button>
          </p>
        )}
      </Row>

      <Row title="Khoảng thời gian">
        <Seg
          label="Theo"
          value={q.dateField}
          onChange={(dateField) => onChange({ dateField })}
          options={[
            ["updated", "Cập nhật"],
            ["created", "Tạo"],
          ]}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-[12px] text-ink-2">
            Từ ngày
            <input type="date" className="input mt-0.5 h-8 text-[13px]" value={q.from} max={q.to || undefined} onChange={(e) => onChange({ from: e.target.value })} />
          </label>
          <label className="text-[12px] text-ink-2">
            Đến ngày
            <input type="date" className="input mt-0.5 h-8 text-[13px]" value={q.to} min={q.from || undefined} onChange={(e) => onChange({ to: e.target.value })} />
          </label>
        </div>
      </Row>

      <Row title="Bình luận">
        <div className="grid gap-2">
          <Seg
            label="Nhắn riêng"
            value={q.privateReplied}
            onChange={(privateReplied) => onChange({ privateReplied })}
            options={[
              ["", "Tất cả"],
              ["no", "Chưa nhắn riêng"],
              ["yes", "Đã nhắn riêng"],
            ]}
          />
          <Seg
            label="Livestream"
            value={q.live}
            onChange={(live) => onChange({ live })}
            options={[
              ["", "Mọi bài"],
              ["live", "Từ livestream"],
              ["notlive", "Không livestream"],
            ]}
          />
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={q.orderMarked} onChange={(e) => onChange({ orderMarked: e.target.checked })} /> Đã đánh dấu tạo đơn
          </label>
        </div>
      </Row>
    </div>
  );
}
