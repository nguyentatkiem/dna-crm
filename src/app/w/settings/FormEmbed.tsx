"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

export function FormEmbed({ formKey }: { formKey: string }) {
  const [origin, setOrigin] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const url = `${origin}/f/${formKey}`;
  const embed = `<iframe src="${url}" style="width:100%;max-width:480px;height:640px;border:0" title="Form liên hệ"></iframe>`;
  async function copy(t: string, label: string) {
    try {
      await navigator.clipboard.writeText(t);
      setMsg(`Đã sao chép ${label}`);
    } catch {
      setMsg("Hãy bôi đen và sao chép thủ công");
    }
  }
  return (
    <section className="card mt-4 p-5">
      <h2 className="text-[16px] font-semibold">Form thu lead</h2>
      <p className="mt-1 text-[14px] text-ink-2">Gắn link vào fanpage, bio TikTok hoặc nhúng vào website. Khách điền xong sẽ tự vào bảng khách, được chấm điểm và chạy tự động hoá.</p>
      <div className="mt-3 grid gap-2">
        <div className="flex flex-wrap items-center gap-2 rounded bg-surface-2 p-2.5">
          <Icon name="link" size={16} className="text-ink-2" />
          <code className="min-w-0 flex-1 break-all text-[12.5px]">{url}</code>
          <a href={`/f/${formKey}`} target="_blank" rel="noreferrer" className="btn-ghost h-7 text-[13px]">
            Mở thử
          </a>
          <button type="button" className="btn-outline h-7 text-[13px]" onClick={() => copy(url, "link")}>
            Sao chép link
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded bg-surface-2 p-2.5">
          <code className="min-w-0 flex-1 break-all text-[12px] text-ink-2">{embed}</code>
          <button type="button" className="btn-outline h-7 text-[13px]" onClick={() => copy(embed, "mã nhúng")}>
            Sao chép mã nhúng
          </button>
        </div>
      </div>
      {msg && <p className="mt-2 text-[13px] text-ink-2">{msg}</p>}
      <p className="mt-2 text-[12.5px] text-ink-2">Lưu ý: link chỉ dùng được từ bên ngoài khi bạn đã đưa CRM lên server có tên miền (xem README).</p>
    </section>
  );
}
