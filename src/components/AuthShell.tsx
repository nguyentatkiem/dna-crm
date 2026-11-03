import { Logo } from "./Icon";

const PREVIEW = [
  { group: "Tư vấn", color: "#fdab3d", rows: [["Nguyễn Thị Lan", "Tư vấn", "#fdab3d"], ["Trần Minh Khoa", "Tư vấn", "#fdab3d"]] },
  { group: "Đặt lịch", color: "#0086c0", rows: [["Lê Thu Hà", "Đặt lịch", "#0086c0"], ["Phạm Quốc Bảo", "Đặt lịch", "#0086c0"]] },
  { group: "Hoàn tất", color: "#00c875", rows: [["Hoàng Ngọc Mai", "Hoàn tất", "#00c875"]] },
];

/** Khung chung cho kích hoạt/đăng nhập: form bên trái, bản xem trước board bên phải. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center gap-2 font-title text-[18px] font-semibold">
          <Logo /> DNA CRM
        </div>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center gap-6 py-10">
          <div>
            <h1 className="text-[28px] font-semibold leading-tight">{title}</h1>
            <p className="mt-2 text-ink-2">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-bg lg:block">
        <div className="absolute left-12 top-16 w-[620px] rounded-lg bg-surface p-5 shadow-panel">
          <div className="font-title text-[18px] font-semibold">Liệu trình</div>
          <div className="mt-1 flex gap-4 border-b border-line-soft pb-2 text-[13px] text-ink-2">
            <span className="border-b-2 border-primary pb-2 text-ink">Bảng chính</span>
            <span>Kanban</span>
          </div>
          {PREVIEW.map((g) => (
            <div key={g.group} className="mt-4">
              <div className="mb-1 text-[14px] font-semibold" style={{ color: g.color }}>
                {g.group}
              </div>
              {g.rows.map(([name, st, c]) => (
                <div key={name} className="flex h-9 items-center border-b border-line-soft" style={{ borderLeft: `6px solid ${g.color}` }}>
                  <span className="flex-1 px-3">{name}</span>
                  <span className="grid h-full w-32 place-items-center text-[13px] text-white" style={{ background: c }}>
                    {st}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="absolute bottom-10 left-12 max-w-md text-[15px] text-ink-2">
          Trả lời vài câu về doanh nghiệp. Hệ thống tự dựng bảng, giai đoạn bán hàng, báo cáo và đội AI Agent cho đúng ngành của bạn.
        </p>
      </div>
    </div>
  );
}
