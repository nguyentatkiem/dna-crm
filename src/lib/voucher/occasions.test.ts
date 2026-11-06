import { describe, expect, it } from "vitest";
import { isAnniversaryToday, parseDayMonth } from "./occasions";

describe("isAnniversaryToday", () => {
  const today = new Date(2026, 10, 6); // 06/11/2026
  it("đọc nhiều định dạng", () => {
    expect(isAnniversaryToday("1990-11-06", today)).toBe(true);
    expect(isAnniversaryToday("1990-11-06T00:00:00.000Z".slice(0, 10), today)).toBe(true);
    expect(isAnniversaryToday("06/11/1990", today)).toBe(true);
    expect(isAnniversaryToday("6-11-1990", today)).toBe(true);
    expect(isAnniversaryToday("06/11", today)).toBe(true);
    expect(isAnniversaryToday("11/06/1990", today)).toBe(false); // DD/MM, không phải MM/DD
    expect(isAnniversaryToday("", today)).toBe(false);
    expect(isAnniversaryToday("abc", today)).toBe(false);
  });
  it("trước n ngày", () => {
    expect(isAnniversaryToday("1990-11-09", today, 3)).toBe(true);
    expect(isAnniversaryToday("1990-11-06", today, 3)).toBe(false);
    expect(isAnniversaryToday("1990-01-02", new Date(2026, 11, 30), 3)).toBe(true); // qua năm mới
  });
  it("29/02 năm không nhuận tính 28/02", () => {
    expect(isAnniversaryToday("2000-02-29", new Date(2027, 1, 28))).toBe(true);
    expect(isAnniversaryToday("2000-02-29", new Date(2028, 1, 28))).toBe(false);
    expect(isAnniversaryToday("2000-02-29", new Date(2028, 1, 29))).toBe(true);
  });
  it("ngày không tồn tại", () => {
    expect(parseDayMonth("31/04/2000")).toBeNull();
    expect(parseDayMonth("2000-13-01")).toBeNull();
  });
});
