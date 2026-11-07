// Tạo dữ liệu qua API của chính app (cùng phiên trình duyệt), nhanh hơn bấm giao diện ở bước chuẩn bị.
import { expect, type APIRequestContext } from "@playwright/test";

export async function api<T = Record<string, unknown>>(req: APIRequestContext, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, data?: unknown): Promise<T> {
  const r = await req.fetch(url, { method, data, headers: data ? { "Content-Type": "application/json" } : undefined });
  const body = await r.text();
  expect(r.ok(), `${method} ${url} → ${r.status()} ${body.slice(0, 300)}`).toBeTruthy();
  return (body ? JSON.parse(body) : {}) as T;
}

export const createContact = (req: APIRequestContext, title: string, extra: { status?: string; data?: Record<string, string | number> } = {}) =>
  api<{ id: string; title: string }>(req, "POST", "/api/records", { objectKey: "contacts", title, ...extra });

export type Product = { id: string; name: string; price: number; vat: number; unit: string; stock?: number };
export const createProduct = (req: APIRequestContext, name: string, o: { price?: number; vat?: number; trackStock?: boolean; openingStock?: number } = {}) =>
  api<Product>(req, "POST", "/api/products", { name, price: o.price ?? 1_000_000, vat: o.vat ?? 10, unit: "cái", trackStock: o.trackStock ?? false, openingStock: o.openingStock });

/** Đơn hàng mới (trạng thái Mới) gồm một dòng sản phẩm. */
export const createOrder = (req: APIRequestContext, customerName: string, p: Product, qty = 1) =>
  api<{ id: string; number: string; total: number }>(req, "POST", "/api/orders", {
    customerName,
    items: [{ productId: p.id, code: "", name: p.name, unit: p.unit, qty, price: p.price, discountPct: 0, vatPct: p.vat }],
  });
