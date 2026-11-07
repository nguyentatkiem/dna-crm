import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { db, parseJson } from "@/lib/db";
import { INDUSTRIES, type Dna } from "@/lib/dna";
import { ago } from "@/lib/format";
import { SettingsActions } from "./SettingsActions";
import { Members } from "./Members";
import { FormEmbed } from "./FormEmbed";
import { FieldEditor } from "./FieldEditor";
import { PushToggle } from "@/components/pwa/PushToggle";
import { Icon } from "@/components/Icon";

const SETTING_GROUPS: { title: string; icon: string; items: { href: string; label: string; hint: string }[] }[] = [
  {
    title: "Doanh nghiệp & đội",
    icon: "users",
    items: [
      { href: "/w/settings/company", label: "Thông tin doanh nghiệp", hint: "Tên, MST, địa chỉ in trên chứng từ" },
      { href: "/w/settings/roles", label: "Vai trò & quyền", hint: "Ai được xem, sửa, xuất gì" },
      { href: "/w/settings/teams", label: "Phòng ban / đội", hint: "Đội, trưởng nhóm, phân luồng phiếu" },
      { href: "/w/settings/tutorial", label: "Hướng dẫn người mới", hint: "Tiến độ làm quen của từng người" },
    ],
  },
  {
    title: "Bán hàng",
    icon: "cart",
    items: [
      { href: "/w/settings/payments", label: "Thanh toán & giao hàng", hint: "VietQR, đối soát, hoá đơn, vận chuyển" },
      { href: "/w/settings/price-tiers", label: "Giá theo hạng", hint: "Giá riêng cho khách thân thiết" },
      { href: "/w/settings/print-templates", label: "Mẫu in", hint: "Báo giá, đơn hàng, hợp đồng" },
      { href: "/w/settings/scoring", label: "Chấm điểm khách", hint: "Điểm theo hồ sơ và hành vi" },
    ],
  },
  {
    title: "Dữ liệu & giao diện",
    icon: "database",
    items: [
      { href: "/w/settings/fields", label: "Quyền & bố cục trường", hint: "Ẩn, chỉ xem, sắp xếp trường hồ sơ" },
      { href: "/w/settings/privacy", label: "Bảo mật dữ liệu", hint: "Che SĐT/email, giới hạn xuất" },
      { href: "/w/settings/backup", label: "Sao lưu & khôi phục", hint: "Tự sao lưu, lưu ra ngoài máy chủ" },
      { href: "/w/trash", label: "Thùng rác", hint: "Khôi phục mục đã xoá" },
    ],
  },
  {
    title: "Hệ thống & bảo mật",
    icon: "shield",
    items: [
      { href: "/w/settings/health", label: "Kiểm tra kết nối", hint: "Kênh, thanh toán, AI, lỗi hệ thống" },
      { href: "/w/settings/security", label: "Bảo mật tài khoản", hint: "Xác thực 2 lớp, phiên đăng nhập" },
      { href: "/w/settings/audit", label: "Nhật ký thao tác", hint: "Ai đã làm gì, lúc nào" },
      { href: "/w/inbox/pages", label: "Kênh kết nối", hint: "Fanpage, Instagram, WhatsApp, sàn TMĐT" },
    ],
  },
];

export default async function SettingsPage() {
  const { workspace, config, configVersion } = await requireApp();
  const [dnaRow, versions, sampleCount] = await Promise.all([
    db.dna.findFirst({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" } }),
    db.workspaceConfig.findMany({ where: { workspaceId: workspace.id }, orderBy: { version: "desc" }, take: 10 }),
    db.activity.count({ where: { body: "Dữ liệu mẫu để bạn thử hệ thống", record: { workspaceId: workspace.id } } }),
  ]);
  const dna = parseJson<Dna | null>(dnaRow?.dataJson, null);

  return (
    <div className="canvas px-6 pb-16 pt-6 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold">DNA & Cấu hình</h1>
          <p className="mt-1 text-ink-2">Sửa DNA để DNA Architect sinh cấu hình mới. Dữ liệu cũ được giữ nguyên.</p>
        </div>
        <Link href="/onboarding" className="btn-primary">
          Sửa DNA và sinh lại
        </Link>
      </div>

      <nav aria-label="Các mục cài đặt" className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {SETTING_GROUPS.map((g) => (
          <section key={g.title} className="card p-4">
            <h2 className="mb-2 flex items-center gap-2 text-[14px] font-semibold">
              <Icon name={g.icon} size={16} className="text-ink-2" /> {g.title}
            </h2>
            <ul className="grid gap-0.5">
              {g.items.map((it) => (
                <li key={it.href}>
                  <Link href={it.href} className="block rounded-md px-2 py-1.5 hover:bg-hover">
                    <span className="block text-[14px] font-medium">{it.label}</span>
                    <span className="block text-[12.5px] text-ink-2">{it.hint}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 text-[16px] font-semibold">DNA hiện tại</h2>
          {dna ? (
            <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[14px]">
              <dt className="text-ink-2">Ngành</dt>
              <dd>{INDUSTRIES[dna.industry].label}</dd>
              <dt className="text-ink-2">Doanh nghiệp</dt>
              <dd>{dna.businessName} · {dna.model}</dd>
              <dt className="text-ink-2">Sản phẩm</dt>
              <dd>{dna.products}</dd>
              <dt className="text-ink-2">Khách mục tiêu</dt>
              <dd>{dna.targetCustomer}</dd>
              <dt className="text-ink-2">Kênh</dt>
              <dd>{dna.channels.join(", ")}</dd>
              <dt className="text-ink-2">Quy trình bán</dt>
              <dd>{dna.salesSteps}</dd>
              <dt className="text-ink-2">Đội ngũ</dt>
              <dd>{config.team.join(", ")}</dd>
            </dl>
          ) : (
            <p className="text-ink-2">Chưa có DNA.</p>
          )}
        </section>
        <section className="card p-5">
          <h2 className="mb-3 text-[16px] font-semibold">Lịch sử phiên bản cấu hình</h2>
          <ul className="grid divide-y divide-[var(--line-soft)]">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                <span>
                  <b className="font-mono">v{v.version}</b> <span className="text-ink-2">· {v.source === "ai" ? "AI tinh chỉnh" : "Template ngành"} · {ago(v.createdAt)}</span>
                </span>
                {v.version === configVersion ? <span className="rounded-full bg-[#d6f5e6] px-2.5 py-0.5 text-[12px] text-[#037f4c]">Đang dùng</span> : <SettingsActions mode="restore" configId={v.id} />}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <PushToggle className="card mt-4 p-4" />
      <Members />
      <FormEmbed formKey={workspace.formKey} />
      <FieldEditor config={config} />

      <section id="sample-data" className="card mt-4 flex scroll-mt-4 flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-[16px] font-semibold">Dữ liệu mẫu</h2>
          <p className="mt-1 text-[14px] text-ink-2">{sampleCount ? `Đang có ${sampleCount} mục mẫu. Xoá đi khi bạn bắt đầu nhập dữ liệu thật.` : "Không còn dữ liệu mẫu."}</p>
        </div>
        {sampleCount > 0 && <SettingsActions mode="clear-sample" />}
      </section>
    </div>
  );
}
