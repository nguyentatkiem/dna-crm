import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { db, parseJson } from "@/lib/db";
import { INDUSTRIES, type Dna } from "@/lib/dna";
import { ago } from "@/lib/format";
import { SettingsActions } from "./SettingsActions";
import { Members } from "./Members";
import { FormEmbed } from "./FormEmbed";
import { FieldEditor } from "./FieldEditor";

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
        <div className="flex flex-wrap gap-2">
          <Link href="/w/settings/audit" className="btn-outline">
            Nhật ký thao tác
          </Link>
          <Link href="/w/settings/backup" className="btn-outline">
            Sao lưu & khôi phục
          </Link>
          <Link href="/onboarding" className="btn-primary">
            Sửa DNA và sinh lại
          </Link>
        </div>
      </div>

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

      <Members />
      <FormEmbed formKey={workspace.formKey} />
      <FieldEditor config={config} />

      <section className="card mt-4 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-[16px] font-semibold">Dữ liệu mẫu</h2>
          <p className="mt-1 text-[14px] text-ink-2">{sampleCount ? `Đang có ${sampleCount} mục mẫu. Xoá đi khi bạn bắt đầu nhập dữ liệu thật.` : "Không còn dữ liệu mẫu."}</p>
        </div>
        {sampleCount > 0 && <SettingsActions mode="clear-sample" />}
      </section>
    </div>
  );
}
