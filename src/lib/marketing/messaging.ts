// Gửi tin ra ngoài qua Zalo OA, Zalo ZNS, SMS, email, Messenger. Module Marketing hoàn thiện file này.
export type Channel = "zalo" | "zns" | "sms" | "email" | "messenger";
export type SendInput = { channel: Channel; recordId?: string; sequenceId?: string; to?: string; subject?: string; body: string; templateId?: string; params?: Record<string, string> };
export type SendResult = { ok: boolean; error?: string; skipped?: boolean };

export async function sendMessage(_workspaceId: string, _input: SendInput): Promise<SendResult> {
  return { ok: false, error: "Chưa cài đặt" };
}
