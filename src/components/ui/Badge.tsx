export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const TONE: Record<Tone, string> = {
  neutral: "badge",
  success: "badge-success",
  warning: "badge-warning",
  danger: "badge-danger",
  info: "badge-info",
  accent: "badge-accent",
};

/** Nhãn nhỏ dạng viên. `color` (mã hex) để tô màu status tuỳ ý. */
export function Badge({ tone = "neutral", color, dot, children, className = "" }: { tone?: Tone; color?: string; dot?: boolean; children: React.ReactNode; className?: string }) {
  if (color) {
    return (
      <span className={`badge text-white ${className}`} style={{ background: color }}>
        {children}
      </span>
    );
  }
  return (
    <span className={`${TONE[tone]} ${className}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
