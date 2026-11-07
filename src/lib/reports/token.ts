// Link tải báo cáo ký bằng jose (HS256), hết hạn sau 7 ngày. Dữ liệu được tính lại lúc tải theo phạm vi của người tạo.
import { SignJWT, jwtVerify } from "jose";

const AUD = "report-dl";
const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("Thiếu SESSION_SECRET");
  return new TextEncoder().encode(s);
};

export type DlClaims = { rid: string; wid: string; uid: string };

export async function signDownload(c: DlClaims, ttl = "7d") {
  return new SignJWT(c).setProtectedHeader({ alg: "HS256" }).setAudience(AUD).setIssuedAt().setExpirationTime(ttl).sign(secret());
}

export async function verifyDownload(token: string): Promise<DlClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: AUD });
    if (typeof payload.rid !== "string" || typeof payload.wid !== "string" || typeof payload.uid !== "string") return null;
    return { rid: payload.rid, wid: payload.wid, uid: payload.uid };
  } catch {
    return null;
  }
}
