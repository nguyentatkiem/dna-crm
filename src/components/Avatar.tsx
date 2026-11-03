import { avatarColor, initials } from "@/lib/colors";

export function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  if (!name) {
    return <span className="inline-block rounded-full border border-dashed border-line" style={{ width: size, height: size }} aria-label="Chưa có người phụ trách" />;
  }
  return (
    <span title={name} className="inline-grid flex-none place-items-center rounded-full font-semibold text-white" style={{ width: size, height: size, background: avatarColor(name), fontSize: size * 0.4 }}>
      {initials(name)}
    </span>
  );
}
