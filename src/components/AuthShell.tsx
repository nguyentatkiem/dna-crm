import Link from "next/link";
import { Icon, Logo } from "./Icon";

const GROUPS = [
  { group: "Tư vấn", color: "#fdab3d", rows: [["Nguyễn Thị Lan", "LT", "#579bfc", "4,5 tr", 82], ["Trần Minh Khoa", "MĐ", "#a25ddc", "2,8 tr", 64]] },
  { group: "Đặt lịch", color: "#0086c0", rows: [["Lê Thu Hà", "HN", "#00c875", "6,2 tr", 91], ["Phạm Quốc Bảo", "LT", "#579bfc", "3,1 tr", 48]] },
  { group: "Hoàn tất", color: "#00c875", rows: [["Hoàng Ngọc Mai", "MĐ", "#a25ddc", "9,0 tr", 100]] },
] as const;

/** Ảnh minh hoạ sản phẩm vẽ bằng CSS (không cần file ảnh): khung app, KPI, bảng kiểu Work OS. */
export function ProductPreview({ className = "" }: { className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-line-soft bg-bg shadow-lg ${className}`} aria-hidden="true">
      <div className="flex h-8 items-center gap-1.5 border-b border-line-soft bg-surface px-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="mx-auto flex h-5 w-48 items-center justify-center rounded bg-surface-2 text-[10px] text-ink-2">crm.doanhnghiep.vn</span>
      </div>
      <div className="flex">
        <div className="hidden w-[132px] flex-none flex-col gap-1 p-2.5 text-[11px] sm:flex">
          {[
            ["home", "Trang chủ", true],
            ["chat", "Hộp thư", false],
            ["users", "Khách hàng", false],
            ["deals", "Liệu trình", false],
            ["phone", "Telesales", false],
            ["megaphone", "Marketing", false],
            ["chart", "Dashboard", false],
          ].map(([icon, label, on]) => (
            <span key={label as string} className={`flex h-6 items-center gap-1.5 rounded px-1.5 ${on ? "bg-primary-selected font-medium" : "text-ink-2"}`}>
              <Icon name={icon as string} size={12} /> {label}
              {label === "Hộp thư" && <span className="ml-auto rounded-full bg-danger px-1 text-[9px] font-semibold text-white">3</span>}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1 rounded-tl-lg bg-surface p-3.5">
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Doanh thu", "128 tr", "#00c875", "M0 18 L10 14 L20 15 L30 9 L40 11 L50 5 L60 6"],
              ["Khách mới", "46", "#a25ddc", "M0 16 L10 12 L20 13 L30 10 L40 7 L50 8 L60 3"],
              ["ROAS", "4,2x", "#fdab3d", "M0 14 L10 15 L20 11 L30 12 L40 8 L50 9 L60 6"],
            ].map(([l, v, c, d]) => (
              <div key={l} className="rounded-lg border border-line-soft p-2">
                <p className="text-[9.5px] text-ink-2">{l}</p>
                <p className="font-title text-[14px] font-semibold">{v}</p>
                <svg viewBox="0 0 60 20" className="mt-0.5 h-4 w-full" preserveAspectRatio="none">
                  <path d={d} fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3 border-b border-line-soft pb-1.5 text-[11px] text-ink-2">
            <span className="font-title text-[13px] font-semibold text-ink">Liệu trình</span>
            <span className="border-b-2 border-primary pb-1 text-ink">Bảng chính</span>
            <span className="pb-1">Kanban</span>
            <span className="pb-1">Gantt</span>
          </div>
          {GROUPS.map((g) => (
            <div key={g.group} className="mt-2">
              <p className="mb-0.5 text-[11px] font-semibold" style={{ color: g.color }}>
                {g.group}
              </p>
              {g.rows.map(([name, ini, ac, amount, score]) => (
                <div key={name} className="flex h-6 items-center border-b border-line-soft text-[10.5px]" style={{ borderLeft: `4px solid ${g.color}` }}>
                  <span className="min-w-0 flex-1 truncate px-2">{name}</span>
                  <span className="grid w-8 place-items-center">
                    <span className="grid h-4 w-4 place-items-center rounded-full text-[7px] font-bold text-white" style={{ background: ac }}>
                      {ini}
                    </span>
                  </span>
                  <span className="grid h-full w-16 place-items-center text-white" style={{ background: g.color }}>
                    {g.group}
                  </span>
                  <span className="hidden w-12 text-right tnum sm:block">{amount}</span>
                  <span className="w-10 px-1.5">
                    <span className="block h-1 overflow-hidden rounded bg-surface-2">
                      <span className="block h-full rounded bg-success" style={{ width: `${score}%` }} />
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const POINTS = [
  ["dna", "Trả lời vài câu về doanh nghiệp, hệ thống tự dựng bảng, giai đoạn và báo cáo đúng ngành."],
  ["chat", "Hộp thư Zalo, Messenger, website và telesales có ghi âm, chấm điểm trong một nơi."],
  ["bot", "Đội AI Agent chấm điểm khách, gợi ý bước tiếp theo, dự báo doanh thu."],
];

/** Khung chung cho kích hoạt/đăng nhập: form bên trái, minh hoạ sản phẩm bên phải. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col px-5 py-6 sm:px-12 sm:py-8">
        <Link href="/" className="flex w-fit items-center gap-2 font-title text-[18px] font-semibold">
          <Logo /> DNA CRM
        </Link>
        <div className="anim-slide-up mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center gap-6 py-10">
          <div>
            <h1 className="text-[28px] font-semibold leading-tight">{title}</h1>
            <p className="mt-2 text-ink-2">{subtitle}</p>
          </div>
          {children}
        </div>
        <p className="text-[12px] text-ink-2">Dữ liệu nằm trên máy chủ của bạn. Không chia sẻ cho bên thứ ba.</p>
      </div>
      <div className="relative hidden overflow-hidden bg-bg lg:flex lg:flex-col lg:justify-center lg:px-12 lg:py-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary opacity-[0.12] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-accent opacity-[0.14] blur-3xl" />
        <ProductPreview className="relative w-full max-w-[680px]" />
        <ul className="relative mt-8 grid max-w-[680px] gap-3">
          {POINTS.map(([icon, text]) => (
            <li key={icon} className="flex items-start gap-3 text-[14.5px]">
              <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-surface text-primary shadow-sm">
                <Icon name={icon} size={16} />
              </span>
              <span className="pt-1 text-ink">{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
