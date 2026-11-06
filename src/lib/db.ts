import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };

/** Client gốc, thấy cả mục trong thùng rác. Chỉ dùng cho sao lưu và trang Thùng rác. */
export const dbRaw = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = dbRaw;

const READS = new Set(["findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow", "count", "aggregate", "groupBy"]);

/** Thêm điều kiện mặc định vào where, trừ khi câu truy vấn đã tự nói rõ trường đó. */
function withDefault(args: unknown, field: string, value: unknown) {
  const a = (args ?? {}) as { where?: Record<string, unknown> };
  if (a.where && field in a.where) return a;
  return { ...a, where: { ...(a.where ?? {}), [field]: value } };
}

/**
 * Client dùng trong toàn app: mặc định ẩn mục đã vào thùng rác (deletedAt) và việc của các mục đó (inTrash).
 * Muốn xem cả thùng rác thì ghi rõ trong where, ví dụ { deletedAt: { not: null } }.
 */
export const db = dbRaw.$extends({
  name: "trash",
  query: {
    record: {
      $allOperations({ operation, args, query }) {
        return query((READS.has(operation) ? withDefault(args, "deletedAt", null) : args) as typeof args);
      },
    },
    task: {
      $allOperations({ operation, args, query }) {
        return query((READS.has(operation) ? withDefault(args, "inTrash", false) : args) as typeof args);
      },
    },
  },
});

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
