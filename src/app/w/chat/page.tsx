import { requireApp } from "@/lib/auth";
import { ChatApp } from "./ChatApp";

export const metadata = { title: "Chat nội bộ" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { user, config } = await requireApp();
  const { t } = await searchParams;
  const label = (k: string, fallback: string) => config.objects.find((o) => o.key === k)?.label ?? fallback;
  const attachTabs = [
    { key: "contacts", label: label("contacts", "Khách"), kind: "record" as const, object: "contacts" },
    ...(config.objects.some((o) => o.key === "deals") ? [{ key: "deals", label: label("deals", "Giao dịch"), kind: "record" as const, object: "deals" }] : []),
    { key: "orders", label: "Đơn", kind: "order" as const },
    { key: "tasks", label: "Việc", kind: "task" as const },
    { key: "tickets", label: "Phiếu", kind: "ticket" as const },
  ];
  return <ChatApp me={{ id: user.id, name: user.name }} initialThread={t && /^[a-zA-Z0-9_-]{1,64}$/.test(t) ? t : null} attachTabs={attachTabs} />;
}
