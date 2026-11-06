// Dữ liệu mẫu Bán hàng: sản phẩm theo ngành, báo giá, đơn hàng, phiếu thu, hợp đồng.
import { db } from "@/lib/db";
import { nextNumber } from "@/lib/counter";
import { COMPANY_DEFAULT, getPref, setPref, type Company } from "@/lib/prefs";
import { customerOf, type CustomerCard } from "./customers";
import { totals, type Line } from "./lines";
import { activeConfig, completeIfReady, recalcPaid } from "./service";

// [mã, tên, đơn vị, nhóm, giá, VAT %, bảo hành tháng]
type P = [string, string, string, string, number, number, number];

const SETS: Record<string, P[]> = {
  spa: [
    ["CSD01", "Chăm sóc da cơ bản (1 buổi)", "buổi", "Chăm sóc da", 450_000, 8, 0],
    ["CSD10", "Liệu trình chăm sóc da 10 buổi", "gói", "Chăm sóc da", 3_900_000, 8, 0],
    ["TM08", "Liệu trình trị mụn 8 buổi", "gói", "Trị liệu", 4_200_000, 8, 0],
    ["TL01", "Triệt lông nách (1 lần)", "lần", "Triệt lông", 300_000, 8, 0],
    ["TL12", "Gói triệt lông toàn thân 12 lần", "gói", "Triệt lông", 12_000_000, 8, 0],
    ["GDS01", "Gội đầu dưỡng sinh", "lần", "Thư giãn", 180_000, 8, 0],
    ["MSG90", "Massage body đá nóng 90 phút", "lần", "Thư giãn", 550_000, 8, 0],
    ["SR-C", "Serum Vitamin C 30ml", "chai", "Mỹ phẩm", 690_000, 10, 0],
    ["KCN50", "Kem chống nắng SPF50", "tuýp", "Mỹ phẩm", 420_000, 10, 0],
    ["THE5", "Thẻ thành viên 5 triệu", "thẻ", "Thẻ trả trước", 5_000_000, 0, 0],
  ],
  bds: [
    ["CH2PN", "Căn hộ 2PN 68m² – Tháp A", "căn", "Căn hộ", 3_200_000_000, 10, 0],
    ["CH3PN", "Căn hộ 3PN 92m² – Tháp B", "căn", "Căn hộ", 4_550_000_000, 10, 0],
    ["SH01", "Shophouse 5x20m", "căn", "Nhà phố", 12_500_000_000, 10, 0],
    ["DAT100", "Đất nền 100m² phân khu C", "lô", "Đất nền", 1_850_000_000, 0, 0],
    ["PDV", "Phí dịch vụ môi giới", "gói", "Dịch vụ", 30_000_000, 10, 0],
    ["PQL", "Phí quản lý 12 tháng", "năm", "Dịch vụ", 18_000_000, 10, 0],
    ["CHO", "Chỗ đỗ ô tô hầm B2", "chỗ", "Tiện ích", 350_000_000, 10, 0],
    ["NT-CB", "Gói nội thất cơ bản", "gói", "Nội thất", 150_000_000, 10, 12],
  ],
  edu: [
    ["IELTS-F", "IELTS Foundation (3 tháng)", "khoá", "Tiếng Anh", 7_500_000, 0, 0],
    ["IELTS-65", "IELTS cấp tốc 6.5+", "khoá", "Tiếng Anh", 12_000_000, 0, 0],
    ["GT-KIDS", "Tiếng Anh thiếu nhi (48 buổi)", "khoá", "Thiếu nhi", 6_200_000, 0, 0],
    ["TOEIC", "Luyện thi TOEIC 650+", "khoá", "Tiếng Anh", 5_500_000, 0, 0],
    ["KN-GT", "Kỹ năng giao tiếp công sở", "khoá", "Kỹ năng", 3_000_000, 0, 0],
    ["1KEM1", "Học kèm 1-1 (10 buổi)", "gói", "Kèm riêng", 4_500_000, 0, 0],
    ["GTRINH", "Bộ giáo trình", "bộ", "Học liệu", 450_000, 5, 0],
    ["THITHU", "Thi thử có chấm chữa", "lần", "Dịch vụ", 300_000, 0, 0],
  ],
  retail: [
    ["AT-01", "Áo thun cotton basic", "cái", "Thời trang", 199_000, 10, 0],
    ["QJ-02", "Quần jean slim fit", "cái", "Thời trang", 459_000, 10, 0],
    ["GS-03", "Giày sneaker trắng", "đôi", "Giày dép", 890_000, 10, 6],
    ["TX-04", "Túi xách da mini", "cái", "Phụ kiện", 650_000, 10, 6],
    ["DH-05", "Đồng hồ dây kim loại", "cái", "Phụ kiện", 1_490_000, 10, 12],
    ["BL-06", "Balo laptop chống nước", "cái", "Phụ kiện", 520_000, 10, 12],
    ["NH-07", "Nón lưỡi trai", "cái", "Phụ kiện", 150_000, 10, 0],
    ["VC-08", "Phí vận chuyển nội thành", "đơn", "Dịch vụ", 30_000, 10, 0],
    ["GQ-09", "Gói quà tặng", "gói", "Dịch vụ", 25_000, 10, 0],
  ],
  b2b: [
    ["TV-01", "Tư vấn chiến lược (ngày công)", "ngày", "Tư vấn", 8_000_000, 10, 0],
    ["TK-WEB", "Thiết kế website doanh nghiệp", "gói", "Phát triển", 35_000_000, 10, 12],
    ["APP", "Phát triển ứng dụng di động", "gói", "Phát triển", 120_000_000, 10, 12],
    ["SEO-3", "Dịch vụ SEO 3 tháng", "gói", "Marketing", 24_000_000, 10, 0],
    ["ADS-M", "Quản lý quảng cáo (tháng)", "tháng", "Marketing", 9_000_000, 10, 0],
    ["HOST", "Hosting doanh nghiệp (năm)", "năm", "Hạ tầng", 3_600_000, 10, 0],
    ["BT-NAM", "Bảo trì hệ thống (năm)", "năm", "Hỗ trợ", 18_000_000, 10, 0],
    ["DT", "Đào tạo sử dụng (buổi)", "buổi", "Đào tạo", 4_000_000, 10, 0],
    ["LIC", "Bản quyền phần mềm (user/năm)", "user", "Phần mềm", 1_200_000, 10, 0],
  ],
  dental: [
    ["KHAM", "Khám và tư vấn", "lần", "Khám", 100_000, 0, 0],
    ["CVR", "Cạo vôi răng", "lần", "Điều trị", 300_000, 0, 0],
    ["TT", "Trám răng thẩm mỹ", "răng", "Điều trị", 500_000, 0, 6],
    ["NR", "Nhổ răng khôn", "răng", "Phẫu thuật", 2_000_000, 0, 0],
    ["IMP", "Cấy ghép Implant", "trụ", "Phục hình", 18_000_000, 0, 120],
    ["SU", "Bọc răng sứ Zirconia", "răng", "Phục hình", 5_500_000, 0, 60],
    ["NIENG", "Niềng răng mắc cài", "ca", "Chỉnh nha", 35_000_000, 0, 0],
    ["TAY", "Tẩy trắng răng", "lần", "Thẩm mỹ", 2_500_000, 0, 0],
  ],
  fnb: [
    ["SET4", "Set menu 4 người", "set", "Set menu", 1_290_000, 8, 0],
    ["SET10", "Set tiệc 10 người", "bàn", "Tiệc", 3_900_000, 8, 0],
    ["LAU", "Lẩu hải sản (lớn)", "nồi", "Món chính", 590_000, 8, 0],
    ["BUFFET", "Buffet trưa", "suất", "Buffet", 259_000, 8, 0],
    ["NUOC", "Nước ép trái cây", "ly", "Đồ uống", 55_000, 8, 0],
    ["BIA", "Bia thùng 24 lon", "thùng", "Đồ uống", 420_000, 10, 0],
    ["PHONG", "Phí phòng VIP", "lần", "Dịch vụ", 500_000, 8, 0],
    ["TRANG", "Trang trí tiệc sinh nhật", "gói", "Dịch vụ", 800_000, 8, 0],
  ],
  auto: [
    ["SDN-AT", "Sedan hạng B bản AT", "xe", "Xe mới", 589_000_000, 10, 36],
    ["SUV-7", "SUV 7 chỗ bản cao cấp", "xe", "Xe mới", 1_099_000_000, 10, 36],
    ["XM-TG", "Xe máy tay ga 125cc", "xe", "Xe máy", 46_000_000, 10, 36],
    ["BD10", "Bảo dưỡng cấp 10.000 km", "lần", "Dịch vụ", 1_200_000, 10, 0],
    ["PHIM", "Dán phim cách nhiệt", "bộ", "Phụ kiện", 6_500_000, 10, 24],
    ["CAM", "Camera hành trình", "bộ", "Phụ kiện", 2_900_000, 10, 12],
    ["LOP", "Lốp xe (1 chiếc)", "chiếc", "Phụ tùng", 2_100_000, 10, 12],
    ["BHVC", "Bảo hiểm vật chất 1 năm", "năm", "Bảo hiểm", 9_800_000, 0, 0],
    ["DK", "Phí đăng ký, biển số (hỗ trợ)", "gói", "Dịch vụ", 3_000_000, 0, 0],
  ],
  insurance: [
    ["NT-20", "Bảo hiểm nhân thọ 20 năm", "hợp đồng", "Nhân thọ", 24_000_000, 0, 0],
    ["SK-VIP", "Bảo hiểm sức khoẻ VIP (năm)", "năm", "Sức khoẻ", 15_500_000, 0, 0],
    ["SK-CB", "Bảo hiểm sức khoẻ cơ bản (năm)", "năm", "Sức khoẻ", 4_800_000, 0, 0],
    ["GD", "Gói bảo vệ gia đình", "năm", "Nhân thọ", 36_000_000, 0, 0],
    ["XE", "Bảo hiểm ô tô (năm)", "năm", "Tài sản", 8_900_000, 10, 0],
    ["NHA", "Bảo hiểm nhà ở (năm)", "năm", "Tài sản", 2_400_000, 10, 0],
    ["DL", "Bảo hiểm du lịch quốc tế", "chuyến", "Du lịch", 650_000, 0, 0],
    ["HT", "Bảo hiểm hưu trí", "năm", "Nhân thọ", 30_000_000, 0, 0],
  ],
  interior: [
    ["KS", "Khảo sát và đo đạc", "lần", "Thiết kế", 1_000_000, 10, 0],
    ["TK3D", "Thiết kế 3D (m² sàn)", "m²", "Thiết kế", 180_000, 10, 0],
    ["TB-BEP", "Tủ bếp gỗ MDF chống ẩm", "md", "Thi công", 4_500_000, 10, 24],
    ["TU-AO", "Tủ áo kịch trần", "m²", "Thi công", 3_200_000, 10, 24],
    ["SAN", "Sàn gỗ công nghiệp 12mm", "m²", "Vật liệu", 420_000, 10, 60],
    ["SON", "Sơn hoàn thiện nội thất", "m²", "Thi công", 95_000, 10, 12],
    ["TRAN", "Trần thạch cao", "m²", "Thi công", 260_000, 10, 12],
    ["SOFA", "Sofa góc vải nỉ", "bộ", "Nội thất rời", 14_900_000, 10, 12],
    ["DEN", "Gói đèn trang trí", "gói", "Điện", 8_500_000, 10, 12],
  ],
};

const GENERIC: P[] = [
  ["SP01", "Sản phẩm tiêu chuẩn", "cái", "Sản phẩm", 500_000, 10, 12],
  ["SP02", "Sản phẩm cao cấp", "cái", "Sản phẩm", 1_500_000, 10, 12],
  ["GOI-CB", "Gói dịch vụ cơ bản", "gói", "Dịch vụ", 2_000_000, 10, 0],
  ["GOI-NC", "Gói dịch vụ nâng cao", "gói", "Dịch vụ", 5_000_000, 10, 0],
  ["TV", "Tư vấn (giờ)", "giờ", "Dịch vụ", 300_000, 10, 0],
  ["LD", "Lắp đặt tại nhà", "lần", "Dịch vụ", 250_000, 10, 0],
  ["BT", "Bảo trì định kỳ (năm)", "năm", "Dịch vụ", 1_200_000, 10, 0],
  ["VC", "Phí vận chuyển", "đơn", "Khác", 30_000, 10, 0],
];

const day = (n: number) => new Date(Date.now() + n * 864e5);
const line = (p: P, qty = 1, discountPct = 0, productId?: string): Line => ({ productId, code: p[0], name: p[1], unit: p[2], qty, price: p[4], discountPct, vatPct: p[5] });

/**
 * Tạo dữ liệu mẫu bán hàng cho workspace. An toàn khi gọi lại: đã có sản phẩm thì bỏ qua.
 * Trả về số lượng đã tạo.
 */
export async function seedSales(workspaceId: string) {
  if (await db.product.count({ where: { workspaceId } })) return { skipped: true, products: 0, quotes: 0, orders: 0, contracts: 0 };
  const ws = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (!ws) throw new Error("Không tìm thấy workspace");
  const cfg = await activeConfig(workspaceId);
  const set = SETS[ws.industry] ?? GENERIC;

  const owner = await db.membership.findFirst({ where: { workspaceId, role: "owner" }, include: { user: true } });
  const me = owner?.user.name ?? cfg?.team?.[0] ?? "Bạn";

  const products: { id: string }[] = [];
  for (const p of set) {
    products.push(await db.product.create({ data: { workspaceId, code: p[0], name: p[1], unit: p[2], category: p[3], price: p[4], vat: p[5], warrantyMonths: p[6], description: "" } }));
  }
  const L = (i: number, qty = 1, disc = 0) => line(set[i % set.length], qty, disc, products[i % set.length].id);

  // Thông tin doanh nghiệp để trang in có tiêu đề (chỉ điền khi còn trống).
  const company = await getPref<Company>(workspaceId, "company", COMPANY_DEFAULT);
  if (!company.name) {
    await setPref<Company>(workspaceId, "company", { ...company, name: cfg?.businessName || ws.name, address: "123 Nguyễn Trãi, Quận 1, TP. Hồ Chí Minh", phone: "028 3812 3456", email: "lienhe@example.vn", taxCode: "0312345678", bank: "Vietcombank – STK 0071 0012 34567 – CN Sài Gòn" });
  }

  // Khách lấy từ giao dịch có sẵn (để báo giá gắn với giao dịch), thiếu thì lấy từ bảng khách.
  const deals = await db.record.findMany({ where: { workspaceId, objectKey: "deals" }, orderBy: { createdAt: "asc" }, take: 6 });
  const contacts = await db.record.findMany({ where: { workspaceId, objectKey: "contacts" }, orderBy: { createdAt: "asc" }, take: 6 });
  const people: CustomerCard[] = [];
  if (cfg) for (const d of deals) people.push(await customerOf(workspaceId, cfg, d));
  if (cfg) for (const c of contacts) if (people.length < 6) people.push(await customerOf(workspaceId, cfg, c));
  const names = ["Nguyễn Văn An", "Trần Thị Bình", "Lê Hoàng Cường", "Phạm Thu Dung", "Võ Minh Em", "Đặng Gia Hân"];
  while (people.length < 6) people.push({ contactId: null, recordId: null, name: names[people.length], phone: `09${String(10000000 + people.length * 1234567).slice(0, 8)}`, email: "" });

  const mkQuote = async (who: CustomerCard, lines: Line[], discount: number, extra: Record<string, unknown>) => {
    const t = totals(lines, discount);
    return db.quote.create({
      data: {
        workspaceId,
        number: await nextNumber(workspaceId, "BG"),
        recordId: who.recordId,
        contactId: who.contactId,
        customerName: who.name,
        customerPhone: who.phone,
        customerEmail: who.email,
        itemsJson: JSON.stringify(lines),
        ...t,
        validUntil: day(15),
        terms: company.quoteTerms || COMPANY_DEFAULT.quoteTerms,
        createdBy: me,
        ...extra,
      },
    });
  };

  const q1 = await mkQuote(people[0], [L(1), L(7, 2)], 100_000, { title: "Gói chính + sản phẩm đi kèm", status: "accepted", approvedBy: me, approvedAt: day(-6), viewedAt: day(-5), acceptedAt: day(-5), acceptedName: people[0].name, createdAt: day(-7) });
  const q2 = await mkQuote(people[1], [L(2), L(5, 3, 10)], 0, { title: "Báo giá theo yêu cầu", status: "sent", approvedBy: me, approvedAt: day(-2), viewedAt: day(-1), createdAt: day(-3) });
  await mkQuote(people[2], [L(4)], 0, { title: "Gói ưu đãi tháng này", status: "pending", createdAt: day(-1) });
  await mkQuote(people[3], [L(0, 2), L(3)], 0, { title: "Báo giá nháp", status: "draft" });

  // Đơn 1: từ báo giá đã chấp nhận, hoàn tất, đã thu đủ.
  const o1 = await db.order.create({
    data: { workspaceId, number: await nextNumber(workspaceId, "DH"), recordId: q1.recordId, contactId: q1.contactId, quoteId: q1.id, customerName: q1.customerName, customerPhone: q1.customerPhone, status: "done", itemsJson: q1.itemsJson, discount: q1.discount, subtotal: q1.subtotal, vatTotal: q1.vatTotal, total: q1.total, createdBy: me, createdAt: day(-5) },
  });
  await db.quote.update({ where: { id: q1.id }, data: { orderId: o1.id } });
  const half = Math.round(o1.total / 2);
  await db.payment.createMany({
    data: [
      { workspaceId, orderId: o1.id, amount: half, method: "transfer", paidAt: day(-5), note: "Đặt cọc 50%", createdBy: me },
      { workspaceId, orderId: o1.id, amount: o1.total - half, method: "cash", paidAt: day(-2), note: "Thanh toán phần còn lại", createdBy: me },
    ],
  });
  await recalcPaid(o1.id);
  await completeIfReady(o1.id);

  // Đơn 2: thu một phần, quá hạn thanh toán.
  const l2 = [L(2), L(8, 2)];
  const o2 = await db.order.create({ data: { workspaceId, number: await nextNumber(workspaceId, "DH"), recordId: people[4].recordId, contactId: people[4].contactId, customerName: people[4].name, customerPhone: people[4].phone, status: "confirmed", itemsJson: JSON.stringify(l2), ...totals(l2, 0), dueAt: day(-4), createdBy: me, createdAt: day(-12) } });
  await db.payment.create({ data: { workspaceId, orderId: o2.id, amount: Math.round(o2.total * 0.3), method: "transfer", paidAt: day(-12), note: "Đặt cọc 30%", createdBy: me } });
  await recalcPaid(o2.id);

  // Đơn 3: mới tạo từ báo giá đã gửi, chưa thu.
  const o3 = await db.order.create({ data: { workspaceId, number: await nextNumber(workspaceId, "DH"), recordId: q2.recordId, contactId: q2.contactId, quoteId: q2.id, customerName: q2.customerName, customerPhone: q2.customerPhone, status: "new", itemsJson: q2.itemsJson, discount: q2.discount, subtotal: q2.subtotal, vatTotal: q2.vatTotal, total: q2.total, dueAt: day(10), createdBy: me } });
  await db.quote.update({ where: { id: q2.id }, data: { orderId: o3.id } });

  await db.contract.create({ data: { workspaceId, number: await nextNumber(workspaceId, "HD"), recordId: q1.recordId, contactId: q1.contactId, orderId: o1.id, title: `Hợp đồng dịch vụ – ${q1.customerName}`, customerName: q1.customerName, value: o1.total, status: "active", signedAt: day(-355), startAt: day(-355), endAt: day(10), remindDays: 30, note: "Sắp hết hạn, cần gọi gia hạn", createdBy: me } });
  await db.contract.create({ data: { workspaceId, number: await nextNumber(workspaceId, "HD"), recordId: people[4].recordId, contactId: people[4].contactId, orderId: o2.id, title: `Hợp đồng cung cấp – ${people[4].name}`, customerName: people[4].name, value: o2.total, status: "active", signedAt: day(-12), startAt: day(-12), endAt: day(353), remindDays: 30, createdBy: me } });

  return { skipped: false, products: products.length, quotes: 4, orders: 3, contracts: 2 };
}
