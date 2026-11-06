// Phân quyền v2 (phần thuần, dùng được cả trình duyệt lẫn server):
// danh mục quyền theo mô-đun, mặc định của vai trò có sẵn, vai trò tự tạo (Pref "roles"),
// phạm vi dữ liệu (own / team / all) và cách tính quyền thực tế của một người.
import { z } from "zod";

export type BuiltinRole = "owner" | "manager" | "member";
export const BUILTIN_ROLES: BuiltinRole[] = ["owner", "manager", "member"];
export const BUILTIN_LABEL: Record<BuiltinRole, string> = { owner: "Chủ", manager: "Quản lý", member: "Nhân viên" };
export const BUILTIN_COLOR: Record<BuiltinRole, string> = { owner: "#a25ddc", manager: "#0086c0", member: "#579bfc" };
export const isBuiltin = (k: string | null | undefined): k is BuiltinRole => k === "owner" || k === "manager" || k === "member";

export type Scope = "own" | "team" | "all";
export const SCOPES: Scope[] = ["own", "team", "all"];
export const SCOPE_LABEL: Record<Scope, string> = { own: "Chỉ khách của mình", team: "Của cả đội", all: "Toàn bộ" };
export const SCOPE_HINT: Record<Scope, string> = {
  own: "Chỉ thấy mục mình phụ trách (và mục chưa giao nếu bật).",
  team: "Thấy mục của mình và của mọi người cùng đội (theo Phòng ban / đội).",
  all: "Thấy toàn bộ dữ liệu của doanh nghiệp.",
};

type Def = { key: string; label: string; hint: string; manager: boolean; member: boolean; ownerOnly?: boolean };
type Mod = { key: string; label: string; actions: Def[] };

/**
 * Danh mục quyền. Mặc định manager/member giữ đúng hành vi trước khi có phân quyền v2.
 * ownerOnly = chỉ chủ có, không cấp được cho vai trò khác (chống tự nâng quyền).
 */
export const MODULES = [
  {
    key: "records",
    label: "Khách & bảng",
    actions: [
      { key: "record_edit_others", label: "Sửa mục của người khác", hint: "Sửa khách, giao dịch do người khác phụ trách (trong phạm vi được xem).", manager: true, member: true },
      { key: "record_assign", label: "Giao / đổi người phụ trách", hint: "Đổi người phụ trách của khách, giao dịch.", manager: true, member: true },
      { key: "record_bulk_edit", label: "Sửa hàng loạt", hint: "Chọn nhiều dòng để đổi trạng thái, người phụ trách cùng lúc.", manager: true, member: true },
      { key: "record_delete", label: "Xoá khách, liệu trình, lịch hẹn", hint: "Chuyển mục vào thùng rác.", manager: true, member: false },
      { key: "record_export", label: "Xuất dữ liệu ra Excel", hint: "Tải bảng khách, giao dịch về máy.", manager: true, member: false },
      { key: "record_import", label: "Nhập dữ liệu từ Excel", hint: "Thêm hàng loạt mục từ file Excel / CSV.", manager: true, member: false },
      { key: "record_merge", label: "Gộp hồ sơ trùng", hint: "Gộp các khách trùng SĐT / email thành một.", manager: true, member: false },
      { key: "task_view_others", label: "Xem việc của người khác", hint: "Xem danh sách việc của cả nhóm ở “Việc của tôi”.", manager: true, member: false },
      { key: "view_manage_shared", label: "Sửa dạng xem dùng chung", hint: "Sửa, xoá dạng xem bảng do người khác chia sẻ.", manager: true, member: false },
    ],
  },
  {
    key: "sales",
    label: "Bán hàng",
    actions: [
      { key: "sales_create", label: "Tạo báo giá, đơn hàng", hint: "Lập báo giá và đơn hàng mới.", manager: true, member: true },
      { key: "order_edit", label: "Cập nhật đơn hàng", hint: "Đổi trạng thái, hạn thanh toán, dòng hàng của đơn trong phạm vi được xem.", manager: true, member: true },
      { key: "quote_approve", label: "Duyệt báo giá", hint: "Duyệt hoặc trả lại báo giá đang chờ duyệt.", manager: true, member: false },
      { key: "sales_view_all", label: "Xem chứng từ của mọi người", hint: "Thấy mọi báo giá, đơn, hợp đồng dù phạm vi dữ liệu bị giới hạn.", manager: true, member: false },
      { key: "sales_edit_others", label: "Sửa chứng từ của người khác", hint: "Sửa báo giá, đơn hàng, hợp đồng do người khác lập.", manager: true, member: false },
      { key: "order_cancel_paid", label: "Huỷ đơn đã thu tiền", hint: "Huỷ đơn hàng đã có phiếu thu.", manager: true, member: false },
      { key: "payment_record", label: "Ghi nhận thu tiền", hint: "Tạo phiếu thu cho đơn hàng.", manager: true, member: true },
      { key: "payment_delete", label: "Xoá phiếu thu", hint: "Xoá phiếu thu nhập nhầm.", manager: true, member: false },
      { key: "debt_view", label: "Xem công nợ", hint: "Mở trang Công nợ phải thu.", manager: true, member: true },
      { key: "product_manage", label: "Quản lý sản phẩm & giá", hint: "Thêm, sửa, xoá sản phẩm và bảng giá.", manager: true, member: false },
      { key: "contract_manage", label: "Tạo, sửa hợp đồng", hint: "Lập hợp đồng và cập nhật hợp đồng của mình.", manager: true, member: true },
      { key: "sales_delete", label: "Xoá báo giá, đơn, hợp đồng", hint: "Xoá chứng từ bán hàng.", manager: true, member: false },
    ],
  },
  {
    key: "care",
    label: "Chăm sóc",
    actions: [
      { key: "ticket_view_all", label: "Xem mọi phiếu hỗ trợ", hint: "Thấy phiếu của mọi người dù phạm vi dữ liệu bị giới hạn.", manager: true, member: false },
      { key: "ticket_assign", label: "Giao phiếu cho người khác", hint: "Đổi người xử lý, đội nhận phiếu.", manager: true, member: true },
      { key: "ticket_close", label: "Đóng phiếu", hint: "Chuyển phiếu sang Đã xử lý / Đã đóng.", manager: true, member: true },
      { key: "ticket_delete", label: "Xoá phiếu hỗ trợ", hint: "Xoá hẳn phiếu hỗ trợ.", manager: true, member: false },
      { key: "care_settings", label: "Cài đặt SLA & tích điểm", hint: "Sửa thời hạn xử lý phiếu, quy tắc tích điểm, hạng thành viên.", manager: true, member: false },
      { key: "loyalty_adjust", label: "Cộng / trừ điểm tay", hint: "Điều chỉnh điểm tích luỹ của khách.", manager: true, member: false },
      { key: "warranty_manage", label: "Quản lý bảo hành", hint: "Tạo, sửa phiếu bảo hành.", manager: true, member: true },
      { key: "voucher_manage", label: "Quản lý voucher", hint: "Tạo chương trình, phát mã cho cả nhóm, huỷ mã.", manager: true, member: false },
      { key: "survey_manage", label: "Quản lý khảo sát", hint: "Tạo, sửa, gửi khảo sát cho cả nhóm khách.", manager: true, member: false },
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    actions: [
      { key: "marketing_manage", label: "Chiến dịch & chuỗi chăm sóc", hint: "Sửa chuỗi tin tự động, kênh gửi (Zalo, SMS, email).", manager: true, member: false },
      { key: "broadcast_send", label: "Gửi tin hàng loạt", hint: "Soạn, hẹn giờ và gửi tin cho nhóm khách.", manager: true, member: false },
      { key: "landing_manage", label: "Trang đích (landing)", hint: "Tạo, sửa, xuất bản landing page.", manager: true, member: false },
      { key: "segment_manage", label: "Quản lý nhóm khách", hint: "Sửa, xoá nhóm khách của người khác; tính lại RFM.", manager: true, member: false },
      { key: "ads_manage", label: "Chi phí quảng cáo", hint: "Kết nối, nhập và đồng bộ chi phí quảng cáo.", manager: true, member: false },
    ],
  },
  {
    key: "telesales",
    label: "Telesales",
    actions: [
      { key: "calls_review", label: "Chấm điểm & duyệt cuộc gọi", hint: "Chấm lại cuộc gọi của nhân viên.", manager: true, member: false },
      { key: "calls_listen_others", label: "Nghe ghi âm của người khác", hint: "Xem cuộc gọi, nghe ghi âm của người khác trong phạm vi.", manager: true, member: true },
      { key: "calls_coach", label: "Phiếu chấm & bài học", hint: "Sửa phiếu chấm điểm cuộc gọi, duyệt bài học rút ra.", manager: false, member: false },
      { key: "calls_delete", label: "Xoá cuộc gọi", hint: "Xoá cuộc gọi và ghi âm.", manager: false, member: false },
    ],
  },
  {
    key: "perf",
    label: "Hiệu suất",
    actions: [
      { key: "perf_view_team", label: "Xem KPI, hiệu suất của đội", hint: "Xem chỉ số của người khác (theo phạm vi dữ liệu).", manager: true, member: false },
      { key: "kpi_set", label: "Đặt chỉ tiêu KPI", hint: "Đặt, sao chép chỉ tiêu cho người và đội.", manager: true, member: false },
      { key: "perf_review", label: "Đánh giá nhân viên", hint: "Chấm phiếu đánh giá định kỳ.", manager: true, member: false },
      { key: "perf_view_commission", label: "Xem hoa hồng của người khác", hint: "Xem bảng hoa hồng của cả đội.", manager: true, member: false },
      { key: "perf_manage_rules", label: "Tiêu chí & quy tắc hoa hồng", hint: "Sửa bộ tiêu chí đánh giá, quy tắc hoa hồng, mở khoá phiếu đã chốt.", manager: false, member: false },
      { key: "teams_manage", label: "Phòng ban / đội", hint: "Tạo, sửa đội và phân luồng phiếu.", manager: true, member: false },
    ],
  },
  {
    key: "system",
    label: "Hệ thống",
    actions: [
      { key: "company_edit", label: "Thông tin doanh nghiệp", hint: "Sửa thông tin in trên báo giá, đơn, hợp đồng.", manager: true, member: false },
      { key: "settings_manage", label: "Cài đặt nâng cao", hint: "Quyền trường, bảo mật dữ liệu, luật chấm điểm khách.", manager: false, member: false },
      { key: "integrations_manage", label: "Kết nối & tổng đài", hint: "Sửa kết nối nguồn khách, tổng đài SIP.", manager: false, member: false },
      { key: "automations_manage", label: "Tự động hoá", hint: "Tạo, sửa luật tự động hoá.", manager: true, member: false },
      { key: "feed_moderate", label: "Quản lý bảng tin", hint: "Đăng thông báo, ghim bài, xoá bài của người khác.", manager: true, member: false },
      { key: "audit_view", label: "Xem nhật ký thao tác", hint: "Xem và tải nhật ký của cả workspace.", manager: true, member: false },
      { key: "trash_restore", label: "Thùng rác: khôi phục", hint: "Xem thùng rác và khôi phục mục đã xoá.", manager: true, member: false },
      { key: "trash_purge", label: "Thùng rác: xoá vĩnh viễn", hint: "Xoá hẳn mục trong thùng rác.", manager: true, member: false },
      { key: "backup_manage", label: "Sao lưu & khôi phục", hint: "Tải bản sao lưu, khôi phục dữ liệu.", manager: false, member: false, ownerOnly: true },
      { key: "members_manage", label: "Mời, xoá thành viên", hint: "Tạo link mời, đổi vai trò, đặt lại mật khẩu.", manager: false, member: false, ownerOnly: true },
      { key: "roles_manage", label: "Quản lý vai trò", hint: "Tạo, sửa vai trò và quyền.", manager: false, member: false, ownerOnly: true },
    ],
  },
] as const satisfies readonly Mod[];

export type Perm = (typeof MODULES)[number]["actions"][number]["key"];
const DEFS: Def[] = MODULES.flatMap((m) => m.actions as readonly Def[]);
export const ALL_PERMS = DEFS.map((d) => d.key) as Perm[];
export const PERM_LABEL = Object.fromEntries(DEFS.map((d) => [d.key, d.label])) as Record<Perm, string>;
export const OWNER_ONLY = new Set<Perm>(DEFS.filter((d) => d.ownerOnly).map((d) => d.key as Perm));
export const isPerm = (k: unknown): k is Perm => typeof k === "string" && (ALL_PERMS as string[]).includes(k);
/** Quyền cấp được cho vai trò khác chủ. */
export const GRANTABLE = ALL_PERMS.filter((p) => !OWNER_ONLY.has(p));

export const DEFAULT_ACTIONS: Record<"manager" | "member", Perm[]> = {
  manager: DEFS.filter((d) => d.manager).map((d) => d.key as Perm),
  member: DEFS.filter((d) => d.member).map((d) => d.key as Perm),
};

// ---------- Pref "roles" ----------

export const RoleKey = z.string().regex(/^r_[a-z0-9_]{1,40}$/);
const ScopeZ = z.enum(["own", "team", "all"]);
export const CustomRole = z.object({
  key: RoleKey,
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#579bfc"),
  base: z.enum(["manager", "member"]).default("member"),
  actions: z.array(z.string()).default([]),
  scope: ScopeZ.default("own"),
  unassigned: z.boolean().default(true),
});
export type CustomRole = z.infer<typeof CustomRole>;
export const RoleOverride = z.object({ actions: z.array(z.string()).optional(), scope: ScopeZ.optional(), unassigned: z.boolean().optional() });
export type RoleOverride = z.infer<typeof RoleOverride>;
export type RolesPref = { roles?: CustomRole[]; overrides?: { manager?: RoleOverride; member?: RoleOverride } };

/** Chỉ giữ quyền hợp lệ, cấp được, không trùng, theo thứ tự danh mục. */
export const cleanActions = (xs: readonly string[] | undefined): Perm[] => {
  const s = new Set(xs ?? []);
  return GRANTABLE.filter((p) => s.has(p));
};

/** Đọc Pref "roles" an toàn: bỏ vai trò hỏng, quyền lạ. */
export function normalizeRolesPref(raw: unknown): Required<RolesPref> & { overrides: { manager?: RoleOverride; member?: RoleOverride } } {
  const r = (raw && typeof raw === "object" ? raw : {}) as RolesPref;
  const roles: CustomRole[] = [];
  const seen = new Set<string>();
  for (const x of Array.isArray(r.roles) ? r.roles : []) {
    const p = CustomRole.safeParse(x);
    if (!p.success || seen.has(p.data.key)) continue;
    seen.add(p.data.key);
    roles.push({ ...p.data, actions: cleanActions(p.data.actions) });
  }
  const ov = (k: "manager" | "member") => {
    const p = RoleOverride.safeParse(r.overrides?.[k] ?? {});
    if (!p.success) return undefined;
    return { ...p.data, ...(p.data.actions ? { actions: cleanActions(p.data.actions) } : {}) };
  };
  return { roles, overrides: { manager: ov("manager"), member: ov("member") } };
}

// ---------- Định nghĩa vai trò thực tế ----------

export type RoleDef = { key: string; name: string; color: string; base: BuiltinRole; builtin: boolean; actions: Perm[]; scope: Scope; unassigned: boolean };

/** Mọi vai trò của workspace: Chủ, Quản lý, Nhân viên (đã áp chỉnh sửa) rồi vai trò tự tạo. */
export function roleDefs(pref: RolesPref | null | undefined, legacyOwnOnly = false): RoleDef[] {
  const p = normalizeRolesPref(pref);
  const ov = p.overrides;
  const builtin = (k: "manager" | "member", scope: Scope): RoleDef => ({
    key: k,
    name: BUILTIN_LABEL[k],
    color: BUILTIN_COLOR[k],
    base: k,
    builtin: true,
    actions: (ov[k]?.actions as Perm[] | undefined) ?? DEFAULT_ACTIONS[k],
    scope: ov[k]?.scope ?? scope,
    unassigned: ov[k]?.unassigned ?? true,
  });
  return [
    { key: "owner", name: BUILTIN_LABEL.owner, color: BUILTIN_COLOR.owner, base: "owner", builtin: true, actions: [...ALL_PERMS], scope: "all", unassigned: true },
    builtin("manager", "all"),
    // Tương thích cài đặt cũ "Nhân viên chỉ thấy khách của mình".
    builtin("member", legacyOwnOnly ? "own" : "all"),
    ...p.roles.map((r) => ({ key: r.key, name: r.name, color: r.color, base: r.base, builtin: false, actions: r.actions as Perm[], scope: r.scope, unassigned: r.unassigned })),
  ];
}

// ---------- Quyền thực tế của một người ----------

export type Access = {
  /** Khoá vai trò lưu trong Membership.role. */
  role: string;
  roleName: string;
  color: string;
  /** Vai trò có sẵn tương ứng: dùng cho quyền theo trường, che SĐT/email và code cũ. */
  base: BuiltinRole;
  isOwner: boolean;
  /** false = vai trò không còn tồn tại (bị xoá / gõ sai) → quyền tối thiểu. */
  known: boolean;
  actions: Set<Perm>;
  scope: Scope;
  /** Phạm vi "own"/"team" có gồm mục chưa ai phụ trách không. */
  unassigned: boolean;
  userId: string;
  userName: string;
  /** Tên những người cùng đội (gồm chính mình). Chỉ dùng khi scope = "team". */
  teamNames: string[];
};

export type ResolveInput = {
  roleKey: string | null | undefined;
  pref?: RolesPref | null;
  legacyOwnOnly?: boolean;
  user: { id: string; name: string };
  /** Các đội (tên trưởng nhóm + thành viên) để tính phạm vi "team". */
  teams?: { leader: string; members: string[] }[];
};

/** Tính quyền thực tế (thuần). Vai trò lạ → không quyền nào, chỉ thấy mục của mình. */
export function resolveAccess(i: ResolveInput): Access {
  const defs = roleDefs(i.pref, i.legacyOwnOnly);
  const def = defs.find((d) => d.key === i.roleKey);
  const me = i.user.name;
  const mates = new Set<string>([me]);
  for (const t of i.teams ?? []) {
    const all = [t.leader, ...t.members].filter(Boolean);
    if (all.includes(me)) all.forEach((n) => mates.add(n));
  }
  const base = { userId: i.user.id, userName: me, teamNames: [...mates] };
  if (!def) {
    return { ...base, role: String(i.roleKey ?? ""), roleName: "Vai trò không xác định", color: "#c4c4c4", base: "member", isOwner: false, known: false, actions: new Set(), scope: "own", unassigned: false };
  }
  const isOwner = def.key === "owner";
  const actions = new Set<Perm>(isOwner ? ALL_PERMS : def.actions.filter((a) => !OWNER_ONLY.has(a)));
  return { ...base, role: def.key, roleName: def.name, color: def.color, base: def.base, isOwner, known: true, actions, scope: isOwner ? "all" : def.scope, unassigned: def.unassigned };
}

/** Có quyền không. Chủ luôn có mọi quyền. */
export const allow = (a: Pick<Access, "isOwner" | "actions"> | null | undefined, p: Perm) => !!a && (a.isOwner || a.actions.has(p));

/** Danh sách người mà phạm vi này thấy được; null = thấy hết. */
export function visibleOwners(a: Pick<Access, "scope" | "userName" | "teamNames">): string[] | null {
  if (a.scope === "all") return null;
  if (a.scope === "team") return [...new Set([a.userName, ...a.teamNames])];
  return [a.userName];
}

/** Một mục do `owner` phụ trách có nằm trong phạm vi không ("" = chưa giao). */
export function ownerVisible(a: Pick<Access, "scope" | "userName" | "teamNames" | "unassigned">, owner: string | null | undefined) {
  const names = visibleOwners(a);
  if (!names) return true;
  if (!owner) return a.unassigned;
  return names.includes(owner);
}

/** Điều kiện lọc theo một cột tên người (Prisma where); null = không cần lọc. */
export function ownerWhere<K extends string>(a: Pick<Access, "scope" | "userName" | "teamNames" | "unassigned">, field: K): { OR: Record<K, string | { in: string[] }>[] } | null {
  const names = visibleOwners(a);
  if (!names) return null;
  const or: Record<K, string | { in: string[] }>[] = [{ [field]: names.length === 1 ? names[0] : { in: names } } as Record<K, string | { in: string[] }>];
  if (a.unassigned) or.push({ [field]: "" } as Record<K, string>);
  return { OR: or };
}

/** Bảng ✓/– cho trang Thành viên và màn so sánh vai trò. */
export function permissionMatrix(defs: RoleDef[]) {
  return MODULES.map((m) => ({
    key: m.key,
    label: m.label,
    actions: (m.actions as readonly Def[]).map((d) => ({ key: d.key, label: d.label, hint: d.hint, ownerOnly: !!d.ownerOnly, roles: Object.fromEntries(defs.map((r) => [r.key, r.key === "owner" || (!d.ownerOnly && r.actions.includes(d.key as Perm))])) as Record<string, boolean> })),
  }));
}

/** Khoá vai trò mới từ tên: "Kế toán" → "r_ke_toan" (thêm số nếu trùng). */
export function roleKeyFrom(name: string, taken: Iterable<string>) {
  const slug =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) || "vai_tro";
  const used = new Set(taken);
  let k = `r_${slug}`;
  for (let i = 2; used.has(k) || isBuiltin(k); i++) k = `r_${slug}_${i}`;
  return k;
}

/** Khác biệt quyền giữa hai bản (cho nhật ký). */
export function actionDiff(before: readonly string[], after: readonly string[]) {
  const b = new Set(before);
  const a = new Set(after);
  return { added: after.filter((x) => !b.has(x)), removed: before.filter((x) => !a.has(x)) };
}
