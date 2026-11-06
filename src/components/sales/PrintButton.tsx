"use client";

import { Icon } from "@/components/Icon";

export function PrintButton({ label = "In / Lưu PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn-primary" onClick={() => window.print()}>
      <Icon name="download" size={15} /> {label}
    </button>
  );
}
