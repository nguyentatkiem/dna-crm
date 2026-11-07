import { describe, expect, it } from "vitest";
import { amountInWordsVi, readNumberVi } from "@/lib/einvoice/words";

describe("readNumberVi", () => {
  it.each([
    [0, "không"],
    [5, "năm"],
    [10, "mười"],
    [11, "mười một"],
    [15, "mười lăm"],
    [21, "hai mươi mốt"],
    [24, "hai mươi tư"],
    [25, "hai mươi lăm"],
    [100, "một trăm"],
    [105, "một trăm linh năm"],
    [110, "một trăm mười"],
    [114, "một trăm mười bốn"],
    [1000, "một nghìn"],
    [1001, "một nghìn không trăm linh một"],
    [1010, "một nghìn không trăm mười"],
    [1250000, "một triệu hai trăm năm mươi nghìn"],
    [1000005, "một triệu không trăm linh năm"],
    [1005000, "một triệu không trăm linh năm nghìn"],
    [20500000, "hai mươi triệu năm trăm nghìn"],
    [1000000000, "một tỷ"],
    [1000000001, "một tỷ không trăm linh một"],
    [2500000000000, "hai nghìn năm trăm tỷ"],
    [123456789, "một trăm hai mươi ba triệu bốn trăm năm mươi sáu nghìn bảy trăm tám mươi chín"],
  ])("%i → %s", (n, s) => expect(readNumberVi(n)).toBe(s));
});

describe("amountInWordsVi", () => {
  it("viết hoa, thêm đồng", () => {
    expect(amountInWordsVi(1250000)).toBe("Một triệu hai trăm năm mươi nghìn đồng");
    expect(amountInWordsVi(1250000, { even: true })).toBe("Một triệu hai trăm năm mươi nghìn đồng chẵn");
    expect(amountInWordsVi(0)).toBe("Không đồng");
    expect(amountInWordsVi(1234.6)).toBe("Một nghìn hai trăm ba mươi lăm đồng");
  });
});
