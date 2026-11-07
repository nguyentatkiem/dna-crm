// Ngân hàng hỗ trợ VietQR (mã BIN theo NAPAS). Chỉ liệt kê các mã đã đối chiếu chắc chắn.
export type Bank = { code: string; bin: string; short: string; name: string };

export const BANKS: Bank[] = [
  { code: "VCB", bin: "970436", short: "Vietcombank", name: "Ngân hàng TMCP Ngoại thương Việt Nam" },
  { code: "TCB", bin: "970407", short: "Techcombank", name: "Ngân hàng TMCP Kỹ thương Việt Nam" },
  { code: "MB", bin: "970422", short: "MB Bank", name: "Ngân hàng TMCP Quân đội" },
  { code: "ACB", bin: "970416", short: "ACB", name: "Ngân hàng TMCP Á Châu" },
  { code: "VPB", bin: "970432", short: "VPBank", name: "Ngân hàng TMCP Việt Nam Thịnh Vượng" },
  { code: "BIDV", bin: "970418", short: "BIDV", name: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam" },
  { code: "ICB", bin: "970415", short: "VietinBank", name: "Ngân hàng TMCP Công thương Việt Nam" },
  { code: "VBA", bin: "970405", short: "Agribank", name: "Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam" },
  { code: "TPB", bin: "970423", short: "TPBank", name: "Ngân hàng TMCP Tiên Phong" },
  { code: "STB", bin: "970403", short: "Sacombank", name: "Ngân hàng TMCP Sài Gòn Thương Tín" },
  { code: "VIB", bin: "970441", short: "VIB", name: "Ngân hàng TMCP Quốc tế Việt Nam" },
  { code: "SHB", bin: "970443", short: "SHB", name: "Ngân hàng TMCP Sài Gòn – Hà Nội" },
  { code: "HDB", bin: "970437", short: "HDBank", name: "Ngân hàng TMCP Phát triển TP.HCM" },
  { code: "OCB", bin: "970448", short: "OCB", name: "Ngân hàng TMCP Phương Đông" },
  { code: "MSB", bin: "970426", short: "MSB", name: "Ngân hàng TMCP Hàng Hải" },
  { code: "SEAB", bin: "970440", short: "SeABank", name: "Ngân hàng TMCP Đông Nam Á" },
  { code: "LPB", bin: "970449", short: "LPBank", name: "Ngân hàng TMCP Lộc Phát Việt Nam" },
  { code: "EIB", bin: "970431", short: "Eximbank", name: "Ngân hàng TMCP Xuất Nhập khẩu Việt Nam" },
  { code: "NAB", bin: "970428", short: "Nam A Bank", name: "Ngân hàng TMCP Nam Á" },
  { code: "BAB", bin: "970409", short: "Bac A Bank", name: "Ngân hàng TMCP Bắc Á" },
  { code: "PVCB", bin: "970412", short: "PVcomBank", name: "Ngân hàng TMCP Đại Chúng Việt Nam" },
  { code: "VAB", bin: "970427", short: "VietABank", name: "Ngân hàng TMCP Việt Á" },
  { code: "ABB", bin: "970425", short: "ABBANK", name: "Ngân hàng TMCP An Bình" },
  { code: "KLB", bin: "970452", short: "KienlongBank", name: "Ngân hàng TMCP Kiên Long" },
  { code: "SCB", bin: "970429", short: "SCB", name: "Ngân hàng TMCP Sài Gòn" },
  { code: "NCB", bin: "970419", short: "NCB", name: "Ngân hàng TMCP Quốc Dân" },
  { code: "SHBVN", bin: "970424", short: "Shinhan Bank", name: "Ngân hàng TNHH MTV Shinhan Việt Nam" },
  { code: "CAKE", bin: "546034", short: "CAKE", name: "CAKE by VPBank" },
  { code: "TIMO", bin: "963388", short: "Timo", name: "Timo by Bản Việt" },
];

export const bankByBin = (bin: string) => BANKS.find((b) => b.bin === bin) ?? null;
