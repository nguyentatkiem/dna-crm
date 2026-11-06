// Khung trang khảo sát công khai: gọn trên điện thoại, không cần đăng nhập.
export function SurveyShell({ brand, title, children }: { brand: string; title?: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-bg px-3 py-6 sm:px-4 sm:py-12">
      <div className="mx-auto w-full max-w-[560px] rounded-2xl bg-surface p-5 shadow-card sm:p-8">
        <p className="label">{brand}</p>
        {title && <h1 className="mt-1 text-[22px] font-semibold leading-tight">{title}</h1>}
        {children}
      </div>
      <p className="mt-4 text-center text-[12px] text-ink-2">Câu trả lời của bạn chỉ dùng để cải thiện dịch vụ.</p>
    </main>
  );
}

export function Invalid() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-[460px] rounded-xl bg-surface p-6 shadow-card sm:p-8">
        <h1 className="text-[22px] font-semibold">Khảo sát không còn hiệu lực</h1>
        <p className="mt-2 text-[14px] text-ink-2">Liên kết này không tồn tại hoặc khảo sát đã đóng. Cảm ơn bạn đã quan tâm!</p>
      </div>
    </main>
  );
}
