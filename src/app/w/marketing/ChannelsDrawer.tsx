"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Drawer, SecretField, Steps } from "./Drawer";

type View = Record<string, Record<string, string>>;
type Ch = "zns" | "sms" | "email";

const SMS_PROVIDERS: [string, string][] = [
  ["esms", "eSMS.vn"],
  ["speedsms", "SpeedSMS"],
  ["http", "HTTP tuỳ biến (nhà cung cấp khác)"],
];

export function ChannelsButton({ initial, dryRun }: { initial: View; dryRun: boolean }) {
  const [open, setOpen] = useState(false);
  const ready = (["zns", "sms", "email"] as Ch[]).filter((c) => Object.keys(initial[c] ?? {}).length > 0).length;
  return (
    <>
      <button type="button" className="btn-outline" onClick={() => setOpen(true)}>
        <Icon name="send" size={16} /> Kênh gửi tin <span className="tnum text-ink-2">{ready}/3</span>
      </button>
      {open && <ChannelsDrawer initial={initial} dryRun={dryRun} onClose={() => setOpen(false)} />}
    </>
  );
}

function ChannelsDrawer({ initial, dryRun, onClose }: { initial: View; dryRun: boolean; onClose: () => void }) {
  const [view, setView] = useState(initial);
  const [tab, setTab] = useState<Ch>("zns");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const cur = view[tab] ?? {};
  const set = (k: string) => (v: string) => setVals((s) => ({ ...s, [k]: v }));
  const provider = vals.provider ?? view.sms?.provider ?? "";

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/marketing/channels", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: tab, values: vals }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error });
    setView(j);
    setVals({});
    setMsg({ ok: true, text: "Đã lưu cấu hình." });
  }
  async function test() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/marketing/channels/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: tab, to }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error });
    setMsg(j.ok && !j.skipped ? { ok: true, text: "Đã gửi tin thử. Kiểm tra máy/hộp thư của bạn." } : { ok: !!j.ok, text: j.error ?? "Không gửi được" });
  }

  return (
    <Drawer
      title="Kênh gửi tin"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-primary" onClick={save} disabled={busy || !Object.values(vals).some((v) => v.trim())}>
            Lưu
          </button>
          <span className="flex-1" />
          <input className="input h-8 w-[200px] max-w-full" value={to} onChange={(e) => setTo(e.target.value)} placeholder={tab === "email" ? "Email nhận thử" : "SĐT nhận thử"} aria-label="Người nhận tin thử" />
          <button type="button" className="btn-outline" onClick={test} disabled={busy || !to.trim()}>
            Gửi thử
          </button>
          {msg && <p className={`w-full text-[13px] ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
        </>
      }
    >
      {dryRun && <p className="rounded bg-warning-soft px-3 py-2 text-[13px] text-warning">Đang bật MESSAGING_DRY_RUN=1: mọi tin chỉ ghi vào nhật ký, không gửi thật.</p>}
      <div className="flex gap-1 rounded border border-line p-0.5" role="tablist">
        {(
          [
            ["zns", "Zalo ZNS"],
            ["sms", "SMS"],
            ["email", "Email"],
          ] as [Ch, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`flex-1 rounded px-3 py-1.5 text-[13.5px] ${tab === k ? "bg-primary text-white" : "hover:bg-hover"}`}
            onClick={() => {
              setTab(k);
              setVals({});
              setMsg(null);
            }}
          >
            {label} {Object.keys(view[k] ?? {}).length > 0 && "✓"}
          </button>
        ))}
      </div>

      {tab === "zns" && (
        <>
          <p className={`rounded px-3 py-2 text-[13px] ${view.zalo?.accessToken ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
            {view.zalo?.accessToken ? "Đã có Access Token Zalo OA, ZNS dùng chung token này." : (
              <>
                ZNS dùng Access Token của Zalo OA. Hãy kết nối Zalo OA ở{" "}
                <Link href="/w/sources" className="underline">
                  Nguồn khách
                </Link>{" "}
                trước.
              </>
            )}
          </p>
          <Steps
            items={[
              <>Vào <b>account.zalo.cloud</b> → ZNS → đăng ký mẫu tin (template) và chờ Zalo duyệt (thường 1–2 ngày làm việc).</>,
              <>Đặt tên tham số trong mẫu trùng biến của CRM: <b>ten</b>, <b>ten_doanh_nghiep</b>, <b>so_dien_thoai</b>, <b>nguoi_phu_trach</b>.</>,
              <>Nạp tiền ví ZNS, rồi dán <b>Template ID</b> mặc định bên dưới. Mỗi bước trong kịch bản có thể dùng template khác.</>,
            ]}
          />
          <SecretField label="Template ID mặc định" value={vals.defaultTemplateId ?? ""} saved={cur.defaultTemplateId} onChange={set("defaultTemplateId")} secret={false} placeholder="Ví dụ 231245" />
        </>
      )}

      {tab === "sms" && (
        <>
          <label className="grid gap-1">
            <span className="label">Nhà cung cấp</span>
            <select className="input" value={provider} onChange={(e) => set("provider")(e.target.value)}>
              <option value="">Chọn nhà cung cấp…</option>
              {SMS_PROVIDERS.map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {provider === "esms" && (
            <>
              <Steps items={["Đăng nhập esms.vn → Quản lý API → sao chép API Key và Secret Key.", "Đăng ký Brandname (tên người gửi) với eSMS; khi chưa có, eSMS gửi bằng đầu số mặc định.", "Tin chăm sóc khách là SMS loại 2 (CSKH): nội dung phải đăng ký mẫu với nhà mạng."]} />
              <SecretField label="API Key" value={vals.apiKey ?? ""} saved={cur.apiKey} onChange={set("apiKey")} />
              <SecretField label="Secret Key" value={vals.secretKey ?? ""} saved={cur.secretKey} onChange={set("secretKey")} />
            </>
          )}
          {provider === "speedsms" && (
            <>
              <Steps items={["Đăng nhập speedsms.vn → Cài đặt → API → sao chép Access Token.", "Đăng ký Brandname nếu muốn hiện tên doanh nghiệp."]} />
              <SecretField label="Access Token" value={vals.apiKey ?? ""} saved={cur.apiKey} onChange={set("apiKey")} />
            </>
          )}
          {provider === "http" && (
            <>
              <p className="text-[13px] text-ink-2">CRM gửi POST JSON {"{ to, text }"} tới URL dưới đây, kèm header Authorization: Bearer &lt;API Key&gt; nếu có. Máy chủ trả mã 2xx là thành công.</p>
              <SecretField label="URL nhận tin" value={vals.url ?? ""} saved={cur.url} onChange={set("url")} secret={false} placeholder="https://..." />
              <SecretField label="API Key (tuỳ chọn)" value={vals.apiKey ?? ""} saved={cur.apiKey} onChange={set("apiKey")} />
            </>
          )}
          {provider && provider !== "http" && <SecretField label="Brandname" value={vals.brandname ?? ""} saved={cur.brandname} onChange={set("brandname")} secret={false} />}
          <p className="text-[12px] text-ink-2">SMS nên viết không dấu để không bị tính gấp đôi. Tham số API có thể đổi theo nhà cung cấp: kiểm tra lại tài liệu trước khi chạy thật.</p>
        </>
      )}

      {tab === "email" && (
        <>
          <Steps
            items={[
              <>Gmail/Google Workspace: bật xác minh 2 bước → <b>myaccount.google.com/apppasswords</b> → tạo “Mật khẩu ứng dụng”. Máy chủ smtp.gmail.com, cổng 465.</>,
              <>Dịch vụ khác (Zoho, Mailgun, Amazon SES…): lấy thông tin SMTP trong trang quản trị của họ.</>,
            ]}
          />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
            <SecretField label="Máy chủ SMTP" value={vals.host ?? ""} saved={cur.host} onChange={set("host")} secret={false} placeholder="smtp.gmail.com" />
            <SecretField label="Cổng" value={vals.port ?? ""} saved={cur.port} onChange={set("port")} secret={false} placeholder="465" />
          </div>
          <SecretField label="Tài khoản" value={vals.user ?? ""} saved={cur.user} onChange={set("user")} secret={false} placeholder="ban@doanhnghiep.vn" />
          <SecretField label="Mật khẩu ứng dụng" value={vals.pass ?? ""} saved={cur.pass} onChange={set("pass")} />
          <SecretField label="Người gửi hiển thị" value={vals.from ?? ""} saved={cur.from} onChange={set("from")} secret={false} placeholder="Spa An Nhiên <ban@doanhnghiep.vn>" />
        </>
      )}
    </Drawer>
  );
}
