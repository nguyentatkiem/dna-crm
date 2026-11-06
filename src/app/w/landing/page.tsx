import Link from "next/link";
import { headers } from "next/headers";
import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, getRole } from "@/lib/permissions";
import { ago } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { themeColor } from "@/app/lp/model";
import { CopyLink, CreateButtons } from "./ListActions";

const rate = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "–");

export default async function LandingListPage() {
  const { user, workspace } = await requireApp();
  const manage = can(await getRole(user.id, workspace.id), "manage_marketing");
  const pages = await db.landingPage.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" } });
  const h = await headers();
  const origin = process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const views = pages.reduce((s, p) => s + p.views, 0);
  const conv = pages.reduce((s, p) => s + p.conversions, 0);

  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold">Landing page</h1>
          <p className="mt-1 max-w-3xl text-ink-2">Dựng trang thu lead trong vài phút. Khách để lại thông tin sẽ vào thẳng CRM với nguồn “Landing page”, kèm chiến dịch từ utm_campaign.</p>
        </div>
        {manage && <CreateButtons aiOn={!!process.env.ANTHROPIC_API_KEY} />}
      </div>

      {!!pages.length && (
        <section className="mt-5 grid grid-cols-3 gap-3 sm:max-w-xl">
          {[
            ["Lượt xem", views.toLocaleString("vi-VN")],
            ["Đăng ký", conv.toLocaleString("vi-VN")],
            ["Tỉ lệ chuyển đổi", rate(conv, views)],
          ].map(([k, v]) => (
            <div key={k} className="card p-3">
              <p className="text-[12.5px] text-ink-2">{k}</p>
              <p className="tnum mt-0.5 text-[22px] font-semibold">{v}</p>
            </div>
          ))}
        </section>
      )}

      <section className="mt-4 grid gap-3">
        {!pages.length && (
          <div className="card grid place-items-center gap-2 px-6 py-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-primary-selected text-primary">
              <Icon name="page" />
            </span>
            <h2 className="text-[17px] font-semibold">Chưa có landing page</h2>
            <p className="max-w-lg text-[14px] text-ink-2">Bấm “AI tạo trang” để có ngay trang thu lead viết theo DNA doanh nghiệp, sửa lại vài chữ rồi xuất bản.</p>
          </div>
        )}
        {pages.map((p) => {
          const url = `${origin}/lp/${p.slug}`;
          return (
            <article key={p.id} className="card grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-1 h-8 w-1.5 flex-none rounded-full" style={{ background: themeColor(p.theme) }} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/w/landing/${p.id}`} className="min-w-0 truncate text-[15.5px] font-semibold hover:underline">
                      {p.title}
                    </Link>
                    {p.published ? <span className="badge-success">Đang chạy</span> : <span className="badge">Nháp</span>}
                  </div>
                  <p className="mt-0.5 truncate text-[13px] text-ink-2">
                    /lp/{p.slug} · sửa {ago(p.updatedAt)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 md:justify-end">
                <dl className="flex gap-5 text-center text-[12px] text-ink-2">
                  <div>
                    <dd className="tnum text-[16px] font-semibold text-ink">{p.views}</dd>
                    <dt>lượt xem</dt>
                  </div>
                  <div>
                    <dd className="tnum text-[16px] font-semibold text-ink">{p.conversions}</dd>
                    <dt>đăng ký</dt>
                  </div>
                  <div>
                    <dd className="tnum text-[16px] font-semibold text-ink">{rate(p.conversions, p.views)}</dd>
                    <dt>chuyển đổi</dt>
                  </div>
                </dl>
                <div className="flex items-center gap-1">
                  {p.published && <CopyLink url={url} />}
                  {p.published && (
                    <a href={`/lp/${p.slug}`} target="_blank" rel="noreferrer" className="btn-ghost h-8 px-2" title="Mở trang">
                      <Icon name="open" size={15} />
                    </a>
                  )}
                  <Link href={`/w/landing/${p.id}`} className="btn-outline h-8 px-2.5">
                    <Icon name="edit" size={15} /> {manage ? "Sửa" : "Xem"}
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
