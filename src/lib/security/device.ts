/** Tên thiết bị dễ đọc từ User-Agent, vd. "Chrome trên Windows". */
export function deviceOf(ua: string) {
  const u = String(ua ?? "");
  if (!u) return "Thiết bị không rõ";
  const os = /iPhone/.test(u)
    ? "iPhone"
    : /iPad/.test(u)
      ? "iPad"
      : /Android/.test(u)
        ? "Android"
        : /Windows/.test(u)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(u)
            ? "macOS"
            : /Linux/.test(u)
              ? "Linux"
              : "";
  const br = /Edg\//.test(u)
    ? "Edge"
    : /OPR\/|Opera/.test(u)
      ? "Opera"
      : /CocCoc|coc_coc/i.test(u)
        ? "Cốc Cốc"
        : /Zalo/i.test(u)
          ? "Zalo"
          : /FBAN|FBAV/.test(u)
            ? "Facebook"
            : /Firefox\//.test(u)
              ? "Firefox"
              : /Chrome\/|CriOS/.test(u)
                ? "Chrome"
                : /Safari\//.test(u)
                  ? "Safari"
                  : /node|undici|curl|tsx/i.test(u)
                    ? "Công cụ dòng lệnh"
                    : "Trình duyệt";
  return os ? `${br} trên ${os}` : br;
}
