// CSS in A4: chỉ in vùng .print-area, bỏ sidebar/topbar, chữ đen nền trắng kể cả khi đang ở chế độ tối.
export const PRINT_CSS = `
@page { size: A4; margin: 14mm 12mm; }
@media print {
  html, body, #main, body > div { height: auto !important; overflow: visible !important; background: #fff !important; }
  body * { visibility: hidden; }
  .print-area, .print-area * { visibility: visible; }
  .print-area { position: absolute; left: 0; top: 0; width: 100%; max-width: none !important; border: 0 !important; padding: 0 !important; margin: 0 !important; background: #fff !important; }
  .print-area, .print-area * { color: #111 !important; border-color: #ccc !important; box-shadow: none !important; }
  .print-area .text-ink-2, .print-area .section-title { color: #555 !important; }
  .print-area tr, .print-area .sign-boxes { break-inside: avoid; }
  .no-print { display: none !important; }
}
`;
