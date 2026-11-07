import { describe, expect, it } from "vitest";
import { cassoSignature, parseCasso, parseSepay, parseVnDate, verifyCasso, verifySepay } from "@/lib/pay/providers";

const H = (o: Record<string, string>) => new Headers(o);

describe("SePay", () => {
  const body = { id: 92704, gateway: "Vietcombank", transactionDate: "2026-11-07 09:15:00", accountNumber: "0071000123456", code: null, content: "DH20260004 chuyen tien", transferType: "in", transferAmount: 1250000, accumulated: 19077000, subAccount: null, referenceCode: "MBVCB.3278614", description: "" };
  it("xác thực Apikey", () => {
    expect(verifySepay(H({ authorization: "Apikey abc123" }), "abc123")).toBe(true);
    expect(verifySepay(H({ authorization: "apikey abc123" }), "abc123")).toBe(true);
    expect(verifySepay(H({ authorization: "Apikey abc124" }), "abc123")).toBe(false);
    expect(verifySepay(H({}), "abc123")).toBe(false);
    expect(verifySepay(H({ authorization: "Apikey " }), "")).toBe(false);
  });
  it("đọc giao dịch", () => {
    const [t] = parseSepay(body);
    expect(t).toMatchObject({ provider: "sepay", externalId: "92704", amount: 1250000, content: "DH20260004 chuyen tien", accountNo: "0071000123456" });
    expect(t.at.toISOString()).toBe("2026-11-07T02:15:00.000Z");
    expect(parseSepay({ ...body, transferType: "out" })[0].amount).toBe(-1250000);
    expect(parseSepay({})).toEqual([]);
  });
});

describe("Casso", () => {
  const v2 = { error: 0, data: { id: 1234, reference: "FT26311", description: "MBVCB.1.DH20260004.CT", amount: 500000, runningBalance: 1, transactionDateTime: "2026-11-07 10:00:00", accountNumber: "0071000123456", bankName: "Vietcombank" } };
  it("chữ ký V2", () => {
    const t = String(Date.now());
    const sig = cassoSignature(v2, "s3cret", t);
    expect(verifyCasso(H({ "x-casso-signature": `t=${t},v1=${sig}` }), v2, "s3cret")).toBe(true);
    expect(verifyCasso(H({ "x-casso-signature": `t=${t},v1=${sig}` }), { ...v2, data: { ...v2.data, amount: 9 } }, "s3cret")).toBe(false);
    const old = String(Date.now() - 3600_000);
    expect(verifyCasso(H({ "x-casso-signature": `t=${old},v1=${cassoSignature(v2, "s3cret", old)}` }), v2, "s3cret")).toBe(false);
  });
  it("Secure-Token và Apikey", () => {
    expect(verifyCasso(H({ "secure-token": "s3cret" }), v2, "s3cret")).toBe(true);
    expect(verifyCasso(H({ "secure-token": "nope" }), v2, "s3cret")).toBe(false);
    expect(verifyCasso(H({ authorization: "Apikey s3cret" }), v2, "s3cret")).toBe(true);
    expect(verifyCasso(H({ "secure-token": "x" }), v2, "")).toBe(false);
  });
  it("đọc V2 (object) và V1 (mảng)", () => {
    expect(parseCasso(v2)[0]).toMatchObject({ externalId: "1234", amount: 500000, content: "MBVCB.1.DH20260004.CT" });
    const v1 = { error: 0, data: [{ id: 1, tid: "TF1", description: "DH20260005", amount: 100000, when: "2026-11-07 08:00:00", bank_sub_acc_id: "123" }, { id: 2, description: "x", amount: -5, when: "" }] };
    const l = parseCasso(v1);
    expect(l.map((x) => x.externalId)).toEqual(["1", "2"]);
    expect(l[0].accountNo).toBe("123");
    expect(l[1].amount).toBe(-5);
  });
  it("ngày giờ Việt Nam", () => expect(parseVnDate("2026-01-02 07:00:00").toISOString()).toBe("2026-01-02T00:00:00.000Z"));
});
