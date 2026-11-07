"use client";

// Bảng phím tắt — liệt kê đúng các phím tắt đang có trong app (bảng lệnh, hộp thư, bảng, trợ lý, hướng dẫn).
import { useEffect, useState } from "react";
import { Drawer } from "../ui/Drawer";

type Row = [keys: string[][], text: string];

export default function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  const [mod, setMod] = useState("Ctrl");
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    setMod(/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl");
    setMobile(window.matchMedia("(max-width: 767px)").matches);
  }, []);

  const groups: { title: string; rows: Row[] }[] = [
    {
      title: "Mọi nơi",
      rows: [
        [[[mod, "K"]], "Mở bảng lệnh: tìm khách, trang, hành động"],
        [[["↑"], ["↓"]], "Chọn kết quả trong bảng lệnh"],
        [[["Enter"]], "Mở kết quả đang chọn"],
        [[["Esc"]], "Đóng bảng lệnh, hộp thoại, hồ sơ đang mở hoặc Trợ lý AI"],
      ],
    },
    {
      title: "Hộp thư",
      rows: [
        [[["↑"], ["↓"]], "Chọn hội thoại (hoặc j / k)"],
        [[["Enter"]], "Mở hội thoại đang chọn"],
        [[["e"]], "Đánh dấu hội thoại đã xong"],
        [[["/"]], "Nhảy tới ô trả lời (chưa mở hội thoại: ô tìm kiếm)"],
        [[["/"]], "Gõ ở đầu ô soạn: chọn mẫu trả lời nhanh (↑ ↓ chọn, Enter hoặc Tab để chèn)"],
        [[["Enter"]], "Gửi tin nhắn"],
        [[["Shift", "Enter"]], "Xuống dòng trong tin nhắn"],
      ],
    },
    {
      title: "Bảng & hồ sơ",
      rows: [
        [[["Enter"]], "Lưu ô đang sửa; trên thẻ Kanban: mở hồ sơ"],
        [[[mod, "Enter"]], "Gửi cập nhật trong hồ sơ (gõ @ để nhắc tên đồng đội)"],
        [[["Esc"]], "Huỷ sửa ô, đóng hồ sơ"],
        [[["Chuột phải"]], "Menu thao tác nhanh của một dòng"],
      ],
    },
    {
      title: "Trợ lý AI",
      rows: [
        [[["Enter"]], "Gửi câu hỏi"],
        [[["Shift", "Enter"]], "Xuống dòng"],
      ],
    },
    {
      title: "Khi xem hướng dẫn",
      rows: [
        [[["→"]], "Bước tiếp"],
        [[["←"]], "Quay lại"],
        [[["Esc"]], "Thoát hướng dẫn"],
      ],
    },
  ];

  return (
    <Drawer open onClose={onClose} side={mobile ? "bottom" : "right"} width={440} title="Phím tắt" subtitle={mobile ? "Phím tắt dùng khi có bàn phím (máy tính, iPad)." : "Dùng bàn phím để làm nhanh hơn."}>
      <div className="grid gap-5 px-5 py-4">
        {groups.map((g) => (
          <section key={g.title}>
            <h3 className="section-title mb-1.5">{g.title}</h3>
            <dl className="grid divide-y divide-[var(--line-soft)]">
              {g.rows.map(([keys, text], i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <dt className="flex w-[118px] flex-none flex-wrap items-center gap-1">
                    {keys.map((combo, j) => (
                      <span key={j} className="inline-flex items-center gap-0.5">
                        {j > 0 && <span className="px-0.5 text-[11px] text-ink-2">/</span>}
                        {combo.map((k, n) => (
                          <span key={n} className="inline-flex items-center gap-0.5">
                            {n > 0 && <span className="text-[11px] text-ink-2">+</span>}
                            <kbd className="kbd" suppressHydrationWarning>
                              {k}
                            </kbd>
                          </span>
                        ))}
                      </span>
                    ))}
                  </dt>
                  <dd className="min-w-0 flex-1 text-[13.5px]">{text}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Drawer>
  );
}
