"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";

/** Tạo trang trống hoặc để AI dựng theo DNA. */
export function CreateButtons({ aiOn }: { aiOn: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "blank" | "ai">("");
  const [err, setErr] = useState("");
  async function create(ai: boolean) {
    setBusy(ai ? "ai" : "blank");
    setErr("");
    const r = await fetch("/api/landing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ai }) });
    const j = await r.json();
    setBusy("");
    if (!r.ok) return setErr(j.error);
    router.push(`/w/landing/${j.id}`);
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn-outline" onClick={() => create(false)} disabled={!!busy}>
        <Icon name="plus" size={16} /> {busy === "blank" ? "Đang tạo…" : "Trang trống"}
      </button>
      <button type="button" className="btn-primary" onClick={() => create(true)} disabled={!!busy} title={aiOn ? "Claude viết nội dung theo DNA doanh nghiệp" : "Chưa có ANTHROPIC_API_KEY: dựng theo mẫu từ DNA"}>
        <Icon name="spark" size={16} /> {busy === "ai" ? "AI đang viết…" : "AI tạo trang"}
      </button>
      {err && <p className="w-full text-[13px] text-danger">{err}</p>}
    </div>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost h-8 px-2"
      onClick={async (e) => {
        e.preventDefault();
        await navigator.clipboard?.writeText(url).catch(() => undefined);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      title={url}
    >
      <Icon name={done ? "check" : "copy"} size={15} /> {done ? "Đã chép" : "Chép link"}
    </button>
  );
}
