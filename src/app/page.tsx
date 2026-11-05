import Link from "next/link";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Icon, Logo } from "@/components/Icon";
import { ProductPreview } from "@/components/AuthShell";

const MODULES = [
  { icon: "chat", color: "#579bfc", title: "Hộp thư đa kênh", desc: "Zalo OA, Messenger, website về một hộp thư. AI soạn sẵn câu trả lời, gắn tin nhắn vào đúng khách." },
  { icon: "headset", color: "#00c875", title: "Telesales & power dialer", desc: "Gọi ngay trên trình duyệt, tự quay số kế tiếp, ghi âm, chép lời và chấm điểm từng cuộc gọi." },
  { icon: "megaphone", color: "#fdab3d", title: "Marketing & ROAS", desc: "Ghép chi phí Facebook, Google Ads với lead và đơn chốt. Biết chiến dịch nào lời, chiến dịch nào lỗ." },
  { icon: "board", color: "#0073ea", title: "Bảng Work OS", desc: "Bảng, Kanban, lịch, Gantt, cột công thức và tài liệu gắn từng khách, quen tay như bảng tính." },
  { icon: "chart", color: "#0086c0", title: "Dashboard & tự động hoá", desc: "Kéo thả báo cáo riêng. Đặt luật “Khi… thì…” để tự giao việc, gửi tin chăm sóc, đổi trạng thái." },
  { icon: "trend", color: "#a25ddc", title: "Dự báo chốt đơn", desc: "Học từ các deal đã đóng để ước tính % khả năng chốt và doanh thu kỳ vọng theo tháng." },
  { icon: "shield", color: "#df2f4a", title: "Phân quyền & nhật ký", desc: "Chủ, quản lý, nhân viên. Nhân viên chỉ thấy khách của mình, mọi thay đổi đều được ghi lại." },
  { icon: "server", color: "#676879", title: "Tự host, tự sao lưu", desc: "Chạy trên máy chủ của bạn bằng Docker, sao lưu tự động. Dữ liệu khách không rời khỏi doanh nghiệp." },
];

const STEPS = [
  { n: "1", title: "Điền DNA doanh nghiệp", desc: "Ngành, sản phẩm, quy trình bán hàng, cách bạn gọi khách. Mất khoảng 5 phút." },
  { n: "2", title: "AI dựng CRM cho bạn", desc: "Bảng, trường dữ liệu, giai đoạn, KPI và tự động hoá được thiết kế đúng ngành." },
  { n: "3", title: "Đội agent bắt tay làm", desc: "Chấm điểm khách, nhắc gọi lại, tóm tắt mỗi sáng, phân tích quảng cáo." },
];

const INDUSTRIES = ["Spa & thẩm mỹ", "Đào tạo", "Bất động sản", "Bán lẻ online", "Nha khoa", "Dịch vụ B2B"];

export default async function Home() {
  const ctx = await getContext();
  if (ctx) redirect(ctx.workspace.onboarded ? "/w" : "/onboarding");
  const firstRun = (await db.user.count()) === 0;
  const cta = firstRun ? { href: "/register", label: "Bắt đầu cài đặt" } : { href: "/login", label: "Đăng nhập" };

  return (
    <div className="min-h-[100dvh] bg-surface">
      <header className="sticky top-0 z-30 border-b border-line-soft bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-title text-[17px] font-semibold">
            <Logo size={26} /> DNA CRM
          </Link>
          <nav className="ml-6 hidden gap-5 text-[14px] text-ink-2 md:flex">
            <a href="#tinh-nang" className="hover:text-ink">
              Tính năng
            </a>
            <a href="#cach-lam" className="hover:text-ink">
              Cách hoạt động
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {!firstRun && (
              <Link href="/login" className="btn-ghost hidden sm:inline-flex">
                Đăng nhập
              </Link>
            )}
            <Link href={cta.href} className="btn-primary">
              {firstRun ? "Bắt đầu" : "Vào CRM"}
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-bg">
        <div className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-primary opacity-[0.1] blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-accent opacity-[0.12] blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:py-20">
          <div className="anim-slide-up min-w-0">
            <span className="badge-accent h-7 px-3 text-[12.5px]">
              <Icon name="spark" size={13} /> CRM tự may đo bằng AI
            </span>
            <h1 className="mt-4 text-[34px] font-semibold leading-[1.15] sm:text-[46px]">
              Một CRM hiểu đúng <span className="bg-gradient-to-r from-[#0073ea] to-[#a25ddc] bg-clip-text text-transparent">DNA doanh nghiệp</span> của bạn
            </h1>
            <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-ink-2 sm:text-[17px]">
              Trả lời vài câu về cách bạn bán hàng. DNA CRM tự dựng bảng, giai đoạn, báo cáo và đội AI Agent: từ hộp thư, telesales đến quảng cáo và dự báo doanh thu.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={cta.href} className="btn-primary h-11 px-5 text-[15px]">
                {cta.label} <Icon name="chevron" size={16} className="-rotate-90" />
              </Link>
              <a href="#tinh-nang" className="btn-outline h-11 bg-surface px-5 text-[15px]">
                Xem tính năng
              </a>
            </div>
            <div className="mt-7 flex flex-wrap gap-2">
              {INDUSTRIES.map((x) => (
                <span key={x} className="rounded-full border border-line-soft bg-surface px-3 py-1 text-[12.5px] text-ink-2">
                  {x}
                </span>
              ))}
            </div>
          </div>
          <div className="relative min-w-0">
            <ProductPreview className="anim-pop" />
            <div className="absolute -bottom-5 -left-3 hidden w-60 rounded-xl border border-line-soft bg-surface p-3 shadow-lg sm:block">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-accent">
                <Icon name="spark" size={13} /> Daily Briefing
              </p>
              <p className="mt-1 text-[12.5px] leading-snug">
                Hôm nay có <b>5 khách nóng</b> cần gọi và <b>2 hẹn gọi lại</b>. Chiến dịch “Ưu đãi tháng 11” đang có ROAS <b>4,2x</b>.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="tinh-nang" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16 sm:px-6">
        <p className="section-title text-primary">Tính năng</p>
        <h2 className="mt-2 max-w-2xl text-[28px] font-semibold leading-tight sm:text-[34px]">Mọi thứ đội bán hàng cần, trong một nơi</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m) => (
            <article key={m.title} className="card card-hover p-5">
              <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `${m.color}1f`, color: m.color }}>
                <Icon name={m.icon} size={20} />
              </span>
              <h3 className="mt-4 text-[16px] font-semibold">{m.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{m.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="cach-lam" className="scroll-mt-16 border-y border-line-soft bg-surface-2">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="section-title text-primary">Cách hoạt động</p>
          <h2 className="mt-2 text-[28px] font-semibold sm:text-[34px]">Sẵn sàng trong buổi sáng</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="card p-5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-primary font-title text-[15px] font-semibold text-white">{s.n}</span>
                <h3 className="mt-4 text-[16px] font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0073ea] to-[#a25ddc] px-6 py-10 text-white sm:px-10">
          <h2 className="max-w-xl text-[26px] font-semibold leading-tight sm:text-[30px]">Bắt đầu với DNA của bạn, không cần lập trình</h2>
          <p className="mt-2 max-w-xl text-white/85">Chưa có khoá AI vẫn chạy đầy đủ bằng luật mẫu. Thêm khoá Claude khi bạn sẵn sàng.</p>
          <Link href={cta.href} className="mt-6 inline-flex h-11 items-center gap-1.5 rounded-md bg-white px-5 text-[15px] font-semibold text-[#0060b9] hover:bg-white/90">
            {cta.label} <Icon name="chevron" size={16} className="-rotate-90" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-line-soft">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-6 text-[13px] text-ink-2 sm:px-6">
          <Logo size={20} /> DNA CRM · CRM đa ngành tự host cho doanh nghiệp Việt
          <Link href={cta.href} className="ml-auto hover:text-ink">
            {cta.label}
          </Link>
        </div>
      </footer>
    </div>
  );
}
