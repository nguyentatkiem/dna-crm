"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * Nút "Cài app": Android/Chrome/Edge dùng hộp cài đặt của trình duyệt (beforeinstallprompt);
 * iPhone/iPad hiện hướng dẫn Chia sẻ → Thêm vào MH chính. Đã cài (chạy standalone) thì ẩn.
 */
export function InstallAppButton({ className = "btn-outline", compact = false }: { className?: string; compact?: boolean }) {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
      setShow(true);
    };
    const onInstalled = () => {
      setShow(false);
      setEvt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (isIos()) {
      setIos(true);
      setShow(true);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!show) return null;

  async function install() {
    if (evt) {
      await evt.prompt();
      const { outcome } = await evt.userChoice;
      if (outcome === "accepted") setShow(false);
      setEvt(null);
      return;
    }
    if (ios) setHelp(true);
  }

  return (
    <>
      <button type="button" className={className} onClick={install} aria-label="Cài DNA CRM lên điện thoại">
        <Icon name="download" size={15} />
        {!compact && <span>Cài app</span>}
      </button>
      {help && (
        <div className="fixed inset-0 z-50 grid items-end bg-overlay p-3 sm:place-items-center" role="dialog" aria-modal="true" aria-labelledby="ios-install-title" onClick={() => setHelp(false)}>
          <div className="card anim-fade w-full max-w-sm p-5 shadow-panel" onClick={(e) => e.stopPropagation()}>
            <h2 id="ios-install-title" className="text-[17px] font-semibold">
              Cài DNA CRM lên iPhone/iPad
            </h2>
            <ol className="mt-3 grid list-decimal gap-2 pl-5 text-[14px]">
              <li>Mở trang này bằng <b>Safari</b>.</li>
              <li>
                Bấm nút <b>Chia sẻ</b> <span aria-hidden>(ô vuông có mũi tên lên)</span> ở thanh dưới.
              </li>
              <li>
                Chọn <b>Thêm vào MH chính</b> rồi bấm <b>Thêm</b>.
              </li>
            </ol>
            <p className="mt-3 text-[13px] text-ink-2">Từ iOS 16.4, app đã cài nhận được thông báo đẩy khi bạn bật trong app.</p>
            <button className="btn-primary mt-4 w-full justify-center" onClick={() => setHelp(false)}>
              Đã hiểu
            </button>
          </div>
        </div>
      )}
    </>
  );
}
