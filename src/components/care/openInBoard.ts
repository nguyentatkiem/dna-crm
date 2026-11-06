import { readLS, writeLS } from "@/components/board/ls";
import type { Filter } from "@/components/board/filters";

/** Ghi bộ lọc vào tuỳ chọn bảng trên máy rồi mở bảng, để bảng hiện đúng nhóm khách. */
export function openInBoard(objectKey: string, filters: Filter[], mode: "and" | "or") {
  const key = `board:${objectKey}`;
  writeLS(key, { ...readLS<Record<string, unknown>>(key, {}), filters, mode });
  window.location.href = `/w/b/${objectKey}`;
}
