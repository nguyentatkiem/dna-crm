import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { accessOf, allow } from "@/lib/permissions";
import { MODULES } from "@/lib/roles";
import { rolesView } from "@/app/api/roles/shared";
import { RolesClient } from "./RolesClient";

export const dynamic = "force-dynamic";

/** Vai trò & quyền: chủ tạo / sửa vai trò, mọi người xem được bảng so sánh (chỉ đọc). */
export default async function RolesPage({ searchParams }: { searchParams: Promise<{ role?: string; tab?: string }> }) {
  const ctx = await requireApp();
  const sp = await searchParams;
  const [acc, view] = await Promise.all([accessOf(ctx), rolesView(ctx.workspace.id, ctx.workspace.settingsJson)]);
  const modules = MODULES.map((m) => ({ key: m.key, label: m.label, actions: m.actions.map((a) => ({ key: a.key, label: a.label, hint: a.hint, ownerOnly: "ownerOnly" in a && !!a.ownerOnly })) }));
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <Link href="/w/settings" className="text-[13px] text-ink-2 hover:underline">
        ← Cài đặt
      </Link>
      <h1 className="mt-1 text-[26px] font-semibold">Vai trò & quyền</h1>
      <p className="mt-1 max-w-3xl text-ink-2">
        Mỗi thành viên có một vai trò. Vai trò quyết định được làm gì (từng quyền theo mô-đun) và thấy dữ liệu của ai (phạm vi). Tạo thêm vai trò như “Kế toán”, “Trưởng nhóm sale”, “CSKH” rồi gán ở trang{" "}
        <Link href="/w/settings#members" className="text-primary hover:underline">
          Thành viên
        </Link>
        .
      </p>
      <RolesClient initial={view} modules={modules} canManage={allow(acc, "roles_manage")} myRole={acc.role} initialRole={sp.role ?? ""} initialTab={sp.tab === "compare" ? "compare" : "edit"} />
    </div>
  );
}
