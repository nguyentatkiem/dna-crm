import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { allow, getAccess } from "@/lib/permissions";
import { getPref } from "@/lib/prefs";
import { Icon } from "@/components/Icon";
import type { FieldAccessPref } from "@/lib/field-access";
import type { FormLayoutPref } from "@/lib/form-layout";
import { FieldsSettings } from "./FieldsSettings";

export const dynamic = "force-dynamic";

/** Cài đặt → Trường & bố cục: phân quyền theo trường và bố cục form hồ sơ cho từng bảng. */
export default async function FieldsPage({ searchParams }: { searchParams: Promise<{ tab?: string; object?: string }> }) {
  const { user, workspace, config } = await requireApp();
  const sp = await searchParams;
  if (!allow(await getAccess(user.id, workspace.id), "settings_manage")) {
    return (
      <div className="canvas px-4 pb-16 pt-6 sm:px-8">
        <div className="card mx-auto mt-10 grid max-w-md place-items-center gap-3 p-8 text-center">
          <Icon name="lock" size={28} className="text-ink-2" />
          <h1 className="text-[18px] font-semibold">Chỉ chủ workspace xem được trang này</h1>
          <p className="text-[14px] text-ink-2">Trang này quyết định quản lý và nhân viên được sửa, chỉ xem hay không thấy từng trường dữ liệu.</p>
          <Link href="/w/settings" className="btn-outline">
            Về Cài đặt
          </Link>
        </div>
      </div>
    );
  }
  const [access, layouts] = await Promise.all([getPref<FieldAccessPref>(workspace.id, "fieldAccess", {}), getPref<FormLayoutPref>(workspace.id, "formLayout", {})]);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <nav className="mb-2 text-[13px] text-ink-2">
        <Link href="/w/settings" className="hover:text-primary hover:underline">
          Cài đặt
        </Link>{" "}
        / Trường & bố cục
      </nav>
      <h1 className="flex items-center gap-2 text-[26px] font-semibold">
        <Icon name="layout" size={24} className="text-primary" /> Trường & bố cục
      </h1>
      <p className="mt-1 max-w-2xl text-ink-2">Chọn ai được sửa, chỉ xem hoặc không thấy từng trường, và sắp xếp các trường thành từng phần trong hồ sơ. Chủ workspace luôn thấy và sửa được mọi trường.</p>
      <FieldsSettings
        objects={config.objects.map((o) => ({ key: o.key, label: o.label, fields: o.fields.map((f) => ({ key: f.key, label: f.label, type: f.type })) }))}
        access={access}
        layouts={layouts}
        initialTab={sp.tab === "layout" ? "layout" : "access"}
        initialObject={config.objects.some((o) => o.key === sp.object) ? sp.object! : config.objects[0]?.key ?? "contacts"}
      />
    </div>
  );
}
