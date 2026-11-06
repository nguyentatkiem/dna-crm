import { z } from "zod";

/**
 * Thông báo lỗi Zod mặc định bằng tiếng Việt, dễ hiểu cho người dùng (thay cho "Too small: expected string to have >=1 characters").
 * Schema nào tự đặt message thì vẫn giữ nguyên message đó. Import một lần từ lib/http.ts (mọi API route đều dùng).
 */
const vi = z.locales.vi();
type Issue = z.core.$ZodRawIssue;

function viError(iss: Issue): string | undefined {
  switch (iss.code) {
    case "invalid_type":
      return iss.input === undefined || iss.input === null ? "Còn thiếu thông tin bắt buộc" : "Dữ liệu chưa đúng định dạng";
    case "too_small": {
      const min = Number(iss.minimum);
      if (iss.origin === "string") return min <= 1 ? "Vui lòng nhập nội dung" : `Cần ít nhất ${min} ký tự`;
      if (iss.origin === "array" || iss.origin === "set") return min <= 1 ? "Cần chọn ít nhất 1 mục" : `Cần ít nhất ${min} mục`;
      return `Giá trị phải từ ${min.toLocaleString("vi-VN")} trở lên`;
    }
    case "too_big": {
      const max = Number(iss.maximum);
      if (iss.origin === "string") return `Tối đa ${max.toLocaleString("vi-VN")} ký tự`;
      if (iss.origin === "array" || iss.origin === "set") return `Tối đa ${max.toLocaleString("vi-VN")} mục`;
      return `Giá trị tối đa ${max.toLocaleString("vi-VN")}`;
    }
    case "invalid_format":
      if (iss.format === "email") return "Email chưa đúng định dạng";
      if (iss.format === "url") return "Đường dẫn chưa đúng định dạng";
      return "Dữ liệu chưa đúng định dạng";
    case "invalid_value":
      return "Giá trị chưa hợp lệ";
    case "unrecognized_keys":
      return "Có trường dữ liệu không hỗ trợ";
    default: {
      const r = vi.localeError?.(iss);
      return typeof r === "string" ? r : (r?.message ?? "Dữ liệu chưa hợp lệ");
    }
  }
}

z.config({ localeError: viError });

export {};
