import { readLS, writeLS, type Filter } from "@/components/board/model";

/** Ghi bộ lọc vào tuỳ chọn bảng trên máy rồi mở bảng, để bảng hiện đúng nhóm khách. */
export function openInBoard(objectKey: string, filters: Filter[], mode: "and" | "or") {
  const key = `board:${objectKey}`;
  writeLS(key, { ...readLS<Record<string, unknown>>(key, {}), filters, mode });
  window.location.href = `/w/b/${objectKey}`;
}
