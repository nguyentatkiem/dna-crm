"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { ChannelBadge } from "./shared";

export type Setup = { zaloUrl: string; fbUrl: string; zalo: boolean; messenger: boolean };

function CopyUrl({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="mt-2 flex min-w-0 items-center gap-1.5">
      <code className="min-w-0 flex-1 truncate rounded border border-line-soft bg-surface-2 px-2 py-1.5 text-[12px]">{url}</code>
      <button
        type="button"
        className="btn-outline h-8 flex-none px-2 text-[12.5px]"
        onClick={() => {
          navigator.clipboard?.writeText(url).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }}
      >
        <Icon name={done ? "check" : "copy"} size={13} /> {done ? "Đã chép" : "Chép"}
      </button>
    </div>
  );
}

export function SetupGuide({ setup }: { setup: Setup }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
      <div data-tour="inbox-setup" className="mx-auto max-w-2xl">
        <Icon name="inbox" size={30} className="text-primary" />
        <h2 className="mt-2 text-[22px] font-semibold">Gom tin Zalo OA và Messenger về một chỗ</h2>
        <p className="mt-1 text-ink-2">Bật webhook tin nhắn ở hai nền tảng, khách nhắn là tin hiện ngay tại đây, tự gắn với hồ sơ khách và báo cho người phụ trách.</p>

        <section className="card mt-5 p-4">
          <div className="flex items-center gap-2">
            <ChannelBadge channel="zalo" />
            <b>Zalo Official Account</b>
            {setup.zalo && <span className="ml-auto text-[12px] text-success">Đã có token</span>}
          </div>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13.5px]">
            <li>Vào developers.zalo.me → ứng dụng của bạn → Webhook, dán URL bên dưới.</li>
            <li>
              Bật các sự kiện: <code>user_send_text</code>, <code>user_send_image</code>, <code>user_send_file</code>, <code>user_send_sticker</code>, <code>user_send_location</code>, <code>follow</code> và <code>oa_send_text</code>.
            </li>
            <li>Ở trang Nguồn khách → Zalo OA: điền App ID, OA Secret Key (kiểm tra chữ ký) và Access/Refresh token để trả lời từ CRM.</li>
          </ol>
          <CopyUrl url={setup.zaloUrl} />
        </section>

        <section className="card mt-3 p-4">
          <div className="flex items-center gap-2">
            <ChannelBadge channel="messenger" />
            <b>Facebook Messenger</b>
            {setup.messenger && <span className="ml-auto text-[12px] text-success">Đã có Page token</span>}
          </div>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13.5px]">
            <li>Meta for Developers → App → Messenger → Cài đặt webhook: dán URL bên dưới và Verify token (đặt ở trang Nguồn khách).</li>
            <li>
              Đăng ký Trang với các trường <code>messages</code>, <code>messaging_postbacks</code> (thêm <code>message_echoes</code> nếu muốn thấy cả tin trả lời từ Meta Business Suite).
            </li>
            <li>Cấp Page Access Token có quyền pages_messaging. Facebook chỉ cho trả lời trong 24 giờ kể từ tin cuối của khách.</li>
          </ol>
          <CopyUrl url={setup.fbUrl} />
        </section>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/w/sources" className="btn-primary">
            <Icon name="settings" size={15} /> Mở trang Nguồn khách để điền khoá
          </Link>
          <Link href="/w/inbox/pages" className="btn-outline">
            <Icon name="page" size={15} /> Kết nối fanpage (tin nhắn + bình luận)
          </Link>
        </div>
      </div>
    </div>
  );
}
