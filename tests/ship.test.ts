import { describe, expect, it } from "vitest";
import { demoFee, ghnOrderBody, ghnStatus, ghtkFeeQuery, ghtkOrderBody, ghtkStatus, vtpOrderBody, vtpStatus } from "@/lib/ship/carriers";
import { parseShipHook, hookToken } from "@/lib/ship/hooks";
import { SHIP_DEFAULT } from "@/lib/ship/settings";
import type { ShipInput } from "@/lib/ship/types";

const input: ShipInput = {
  orderNumber: "DH-2026-0004",
  from: { name: "Shop A", phone: "0900000001", address: "1 Lê Lợi", province: "Hồ Chí Minh", district: "Quận 1", ward: "Phường Bến Nghé" },
  to: { name: "Nguyễn Văn B", phone: "0912345678", address: "12 Trần Phú", province: "Hà Nội", district: "Quận Ba Đình", ward: "Phường Điện Biên" },
  items: [{ name: "Serum", code: "SR1", qty: 2, weightGram: 250, price: 300000 }],
  weightGram: 500,
  cod: 450000,
  value: 600000,
  note: "Gọi trước khi giao",
};

describe("GHN", () => {
  it("body tạo đơn", () => {
    const b = ghnOrderBody(input, SHIP_DEFAULT.ghn);
    expect(b).toMatchObject({ client_order_code: "DH-2026-0004", to_name: "Nguyễn Văn B", to_phone: "0912345678", to_province_name: "Hà Nội", to_district_name: "Quận Ba Đình", to_ward_name: "Phường Điện Biên", cod_amount: 450000, weight: 500, service_type_id: 2, required_note: "KHONGCHOXEMHANG", payment_type_id: 1 });
    expect(b.items[0]).toMatchObject({ name: "Serum", quantity: 2, weight: 250 });
  });
  it("map trạng thái", () => {
    expect(ghnStatus("ready_to_pick")).toBe("created");
    expect(ghnStatus("picking")).toBe("picking");
    expect(ghnStatus("transporting")).toBe("delivering");
    expect(ghnStatus("delivered")).toBe("delivered");
    expect(ghnStatus("returned")).toBe("returned");
    expect(ghnStatus("cancel")).toBe("cancelled");
    expect(ghnStatus("lost")).toBe("failed");
  });
});

describe("GHTK", () => {
  it("body tạo đơn: kg, pick_money = COD", () => {
    const b = ghtkOrderBody(input, SHIP_DEFAULT.ghtk);
    expect(b.products[0]).toMatchObject({ weight: 0.25, quantity: 2 });
    expect(b.order).toMatchObject({ id: "DH-2026-0004", pick_money: 450000, province: "Hà Nội", district: "Quận Ba Đình", hamlet: "Khác", transport: "road" });
    expect(ghtkFeeQuery(input, SHIP_DEFAULT.ghtk).get("weight")).toBe("500");
  });
  it("map status_id", () => {
    expect(ghtkStatus(-1)).toBe("cancelled");
    expect(ghtkStatus(2)).toBe("created");
    expect(ghtkStatus(12)).toBe("picking");
    expect(ghtkStatus(4)).toBe("delivering");
    expect(ghtkStatus(5)).toBe("delivered");
    expect(ghtkStatus(21)).toBe("returned");
  });
});

describe("Viettel Post", () => {
  it("body + trạng thái", () => {
    const b = vtpOrderBody(input, SHIP_DEFAULT.vtp);
    expect(b).toMatchObject({ ORDER_NUMBER: "DH-2026-0004", MONEY_COLLECTION: 450000, PRODUCT_WEIGHT: 500, ORDER_SERVICE: "VCN", PRODUCT_QUANTITY: 2 });
    expect(b.RECEIVER_ADDRESS).toBe("12 Trần Phú, Phường Điện Biên, Quận Ba Đình, Hà Nội");
    expect(vtpStatus(501)).toBe("delivered");
    expect(vtpStatus(504)).toBe("returned");
    expect(vtpStatus(107)).toBe("cancelled");
    expect(vtpStatus(500)).toBe("delivering");
  });
});

describe("webhook", () => {
  it("đọc từng hãng", () => {
    expect(parseShipHook("ghn", { OrderCode: "GAB1", Status: "delivered" })).toMatchObject({ trackingCode: "GAB1", status: "delivered" });
    expect(parseShipHook("ghtk", { label_id: "S1.A1", status_id: 5, reason: "" })).toMatchObject({ trackingCode: "S1.A1", status: "delivered" });
    expect(parseShipHook("vtp", { DATA: { ORDER_NUMBER: "123", ORDER_STATUS: 501, STATUS_NAME: "Phát thành công" }, TOKEN: "t" })).toMatchObject({ trackingCode: "123", status: "delivered" });
    expect(parseShipHook("demo", { trackingCode: "DEMO1", status: "picking" })?.status).toBe("picking");
    expect(parseShipHook("ghn", {})).toBeNull();
    expect(parseShipHook("xx", { a: 1 })).toBeNull();
  });
  it("token", () => {
    expect(hookToken(new URL("http://x/?token=abc"), new Headers(), {})).toBe("abc");
    expect(hookToken(new URL("http://x/"), new Headers({ "x-webhook-token": "h" }), {})).toBe("h");
    expect(hookToken(new URL("http://x/"), new Headers(), { TOKEN: "b" })).toBe("b");
  });
});

it("phí demo", () => {
  expect(demoFee(500)).toBe(22000);
  expect(demoFee(1000)).toBe(22000);
  expect(demoFee(1001)).toBe(27000);
  expect(demoFee(2000)).toBe(32000);
});
