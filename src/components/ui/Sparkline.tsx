"use client";

import { useId } from "react";

/** Biểu đồ mini (không trục) cho ô KPI. SVG thuần, không kéo thư viện biểu đồ vào trang. */
export function Sparkline({ data, color = "#0073ea", height = 36 }: { data: number[]; color?: string; height?: number }) {
  const id = useId().replace(/:/g, "");
  const W = 100;
  const H = 40;
  const vals = data.length === 1 ? [data[0], data[0]] : data;
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pts = vals.map((v, i) => [(i / Math.max(vals.length - 1, 1)) * W, H - 2 - ((v - min) / span) * (H - 4)] as const);
  // Đường cong mượt kiểu monotone đơn giản: điểm điều khiển nằm giữa hai điểm.
  const line = pts.reduce((d, [x, y], i) => {
    if (!i) return `M${x},${y}`;
    const [px, py] = pts[i - 1];
    const mx = (px + x) / 2;
    return `${d} C${mx},${py} ${mx},${y} ${x},${y}`;
  }, "");
  return (
    <div style={{ height }} aria-hidden="true">
      {vals.length > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%">
          <defs>
            <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#sp-${id})`} />
          <path d={line} fill="none" stroke={color} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}
