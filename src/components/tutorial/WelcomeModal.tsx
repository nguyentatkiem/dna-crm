"use client";

// Lời chào lần đầu vào /w: chào theo tên, vai trò, ngành; ba lựa chọn bắt đầu.
import { useRef } from "react";
import { toast } from "../ui/Toast";
import { Icon } from "../Icon";
import { lowerTerm, MAIN_TOUR } from "@/lib/tutorial/tours";
import { tutorial, useTutorial } from "./store";
import { useDialog } from "./useDialog";

export default function WelcomeModal() {
  const t = useTutorial();
  const box = useRef<HTMLDivElement>(null);
  const b = t.boot!;
  const lead = b.isOwner || b.base === "manager";
  const c = lowerTerm(b.term.contact);
  const first = b.userName.trim().split(/\s+/).pop() || b.userName;
  const main = t.tours.find((x) => x.id === MAIN_TOUR);

  const close = (then?: () => void) => {
    void tutorial.patch({ welcomeSeen: true });
    tutorial.open(null);
    then?.();
  };
  const explore = () =>
    close(() => toast("Cần xem lại? Bấm nút ? trên thanh trên cùng để mở hướng dẫn bất cứ lúc nào."));
  useDialog(box, explore);

  const choices = [
    { icon: "map", title: `Đi một vòng (${main?.minutes ?? 2} phút)`, text: "Xem nhanh các khu chính, từng bước một.", primary: true, on: () => close(() => tutorial.begin(MAIN_TOUR)) },
    { icon: "check", title: "Xem việc cần làm", text: lead ? `Kết nối kênh, nhập ${c}, mời đội…` : `Việc của tôi, trả lời tin nhắn, gọi ${c}…`, on: () => close(() => tutorial.open("checklist")) },
    { icon: "eye", title: "Tôi tự khám phá", text: "Bạn luôn mở lại được từ nút ?.", on: explore },
  ];

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center sm:p-4">
      <div className="anim-fade absolute inset-0 bg-overlay" onClick={explore} aria-hidden="true" />
      <div ref={box} data-tut-box="" role="dialog" aria-modal="true" aria-labelledby="tut-welcome-h" tabIndex={-1} className="anim-slide-up relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-lg outline-none sm:max-w-[520px] sm:rounded-2xl sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 flex-none place-items-center rounded-xl text-white" style={{ background: "linear-gradient(135deg,#0073ea,#a25ddc)" }}>
            <Icon name="dna" size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="tut-welcome-h" className="font-title text-[20px] font-semibold leading-tight">
              Chào {first}, mừng bạn đến DNA CRM!
            </h2>
            <p className="mt-1 text-[14px] text-ink-2">
              Bạn đang ở <b className="font-medium text-ink">{b.workspace}</b>
              {b.industry ? ` (${b.industry})` : ""} với vai trò <b className="font-medium text-ink">{b.roleName}</b>.
            </p>
          </div>
          <button type="button" onClick={explore} className="btn-ghost h-8 w-8 flex-none justify-center p-0 text-ink-2" aria-label="Đóng">
            <Icon name="x" />
          </button>
        </div>
        <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2.5 text-[13.5px] leading-relaxed text-ink-2">
          {lead
            ? `Mỗi ${c} là một hồ sơ: tin nhắn, cuộc gọi, đơn hàng đều gom về đó. Bắt đầu bằng ba việc: kết nối kênh, đưa danh sách ${c} vào và mời đội của bạn.`
            : `Mỗi ngày bạn chủ yếu dùng ba chỗ: Việc của tôi, Hộp thư để trả lời ${c}, và Telesales để gọi điện. Cập nhật hồ sơ ${c} sau mỗi lần trao đổi để cả đội cùng nắm.`}
        </p>
        <div className="mt-4 grid gap-2">
          {choices.map((x) => (
            <button
              key={x.title}
              type="button"
              onClick={x.on}
              className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${x.primary ? "border-primary bg-primary-selected hover:brightness-[0.98]" : "border-line-soft hover:bg-hover"}`}
            >
              <span className={`grid h-9 w-9 flex-none place-items-center rounded-full ${x.primary ? "bg-primary text-white" : "bg-surface-2 text-ink-2"}`}>
                <Icon name={x.icon} size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-semibold">{x.title}</span>
                <span className="block truncate text-[12.5px] text-ink-2">{x.text}</span>
              </span>
              <Icon name="chevron" size={16} className="flex-none -rotate-90 text-ink-2" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
