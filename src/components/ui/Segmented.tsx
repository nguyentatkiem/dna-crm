"use client";

/** Nút chọn dạng phân đoạn (Ngày/Tuần/Tháng...). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className = "",
  label,
}: {
  options: { key: T; label: React.ReactNode }[];
  value: T;
  onChange: (key: T) => void;
  size?: "sm" | "md";
  className?: string;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`segmented ${className}`}>
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={o.key === value} onClick={() => onChange(o.key)} className={size === "sm" ? "!h-6 !px-2 !text-[12px]" : ""}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
