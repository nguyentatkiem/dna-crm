# Đề xuất nâng cấp DNA CRM lên tầm Work OS + CRM Agent

Tài liệu này gồm:
- **Mục 1**: những gì bản hiện tại đã làm;
- **Mục 2**: kiến trúc;
- **Mục 3**: các repo, SDK và API mã nguồn mở nên ghép vào (đã kiểm tra giấy phép và mức độ hoạt động, tháng 11/2026);
- **Mục 4**: lộ trình để đạt độ "đồ sộ" của một Work OS như monday.com.

---

## 1. Đã có trong bản này

| Mảng | Đã làm |
|---|---|
| **Telesales** | Hàng gọi ưu tiên, bàn gọi (bấm giờ, kịch bản, 8 loại kết quả, hẹn gọi lại thành việc), tải ghi âm, danh sách cuộc gọi, bảng xếp hạng |
| **Ghi nhận & chấm điểm cuộc gọi** | Chép lời qua máy chủ chuẩn OpenAI (faster-whisper/speaches, whisper.cpp) hoặc FPT.AI. Claude chấm theo phiếu có trọng số, trích bằng chứng, có bản luật khi chưa có key. Điểm thấp thì tự giao việc luyện |
| **Feedback loop** | Quản lý chấm lại → làm chuẩn chấm cho AI. So sánh tiêu chí thắng/thua + độ lệch AI → bài học, trọng số mới, đoạn kịch bản mới → chủ duyệt → phiếu chấm có phiên bản |
| **Nguồn Ads** | Facebook Lead Ads, Google Ads lead form, TikTok Lead Ads (qua webhook trực tiếp hoặc Zapier/Make/n8n) |
| **Zalo OA** | Webhook follow / nhắn tin / gửi thông tin → khách. Nhắn lại khách qua OA API v3, tự làm mới token |
| **TMĐT** | Haravan, Sapo, Shopify, WooCommerce (kiểm tra HMAC); Shopee, Lazada, TikTok Shop (push đơn hàng) |
| **Organic / website** | Webhook chung cho Ladipage, WordPress, n8n, Make, Pancake... Form CRM ghi `utm_*`, `gclid`/`fbclid`/`ttclid`, referrer |
| **Tổng đài** | Webhook chung (Stringee, OMICall, VoIP24h, FreeSWITCH/Asterisk): khớp khách, tải ghi âm, chép lời, chấm |
| **Báo cáo nguồn** | Lead theo kênh, nguồn, chiến dịch → nóng, gọi được, hẹn/chốt, doanh thu đơn |

---

## 2. Kiến trúc

```
 Facebook / Google / TikTok Ads ─┐
 Zalo OA (webhook v3) ───────────┤
 Shopee / Lazada / TikTok Shop ──┤   /api/hooks/{hookKey}/{nguồn}
 Haravan / Sapo / Shopify / Woo ─┼──► verify chữ ký → parse → Lead chuẩn hoá
 Website, Ladipage, n8n, Make ───┘         │
                                            ▼
                         ingestLead: chống trùng (mã sự kiện), chuẩn hoá SĐT,
                         gộp khách cũ, gắn _kenh/_nguon/_chien_dich, tạo đơn
                                            │
                                            ▼
              Bảng Khách / Bán hàng ── Lead Qualifier ── Tự động hoá ── Telesales
                                                                          │
 Tổng đài (Stringee, OMICall...) ── /api/hooks/{hookKey}/call ────────────┤
 Nhân viên ghi tay + tải ghi âm ── /api/calls ────────────────────────────┤
                                                                          ▼
                          Chép lời (speaches / whisper.cpp / FPT.AI)
                                            │
                                            ▼
              Call Analyst (Claude, structured output) ── điểm, bằng chứng, việc luyện
                                            │
                Quản lý chấm lại ───────────┤
                                            ▼
              Vòng phản hồi: thống kê thắng/thua + độ lệch → Bài học → Chủ duyệt
                                            │
                                            ▼
                              Phiếu chấm + kịch bản phiên bản mới
```

---

## 3. Repo / SDK / API nên ghép vào

Ký hiệu giấy phép: ✅ MIT, Apache, BSD, ISC: được đóng gói cùng code. ⚠️ GPL, AGPL: **không** chép vào code phát cho học viên; chỉ chạy như dịch vụ riêng hoặc dùng làm tham khảo thiết kế. ❓ là thông tin chưa kiểm chứng được qua tài liệu chính thức.

### 3.1 Gọi điện / tổng đài
| Tên | Giấy phép | Dùng để | Cách ghép |
|---|---|---|---|
| [JsSIP](https://github.com/versatica/JsSIP) | ✅ MIT, còn phát hành 2026 | Softphone WebRTC ngay trong trình duyệt | npm, component phía client: thay nút "Gọi" `tel:` bằng gọi qua SIP trunk |
| [SIP.js](https://github.com/onsip/SIP.js) | ✅ MIT | SIP UA có `SimpleUser` dễ dùng | npm. Bản phát hành cuối năm 2022, ưu tiên JsSIP |
| [FreeSWITCH](https://github.com/signalwire/freeswitch) | MPL-1.1 | Tổng đài tự host, ghi âm, sự kiện ESL | Dịch vụ Docker riêng, đẩy webhook về `/call` |
| [Asterisk](https://github.com/asterisk/asterisk) | ⚠️ GPL-2.0 | Tổng đài phổ biến, ARI click-to-call | Chỉ chạy như dịch vụ riêng |
| Stringee | API thương mại | Answer URL (SCCO) + Event URL; ghi âm trả `recording_url`, lưu 30 ngày | Đã hỗ trợ qua webhook `/call`. Tiếp theo: click-to-call qua REST |
| OMICall (VIHAT) | API thương mại | Đăng ký webhook loại `call` (ringing/answered/hangup) | Webhook `/call`. ❓ Tên trường ghi âm |
| VoIP24h | API thương mại | Kéo lịch sử cuộc gọi (CDR) | ❓ Chưa có tài liệu webhook công khai: dùng tác vụ định kỳ kéo CDR |

**Đề xuất:** tách interface `CallProvider { clickToCall, parseWebhook, fetchRecording }`, làm Stringee trước, rồi đến OMICall. Dùng JsSIP làm softphone trong trình duyệt.

### 3.2 Chép lời tiếng Việt & tách người nói
| Tên | Giấy phép | Ghi chú | Cách ghép |
|---|---|---|---|
| [speaches](https://github.com/speaches-ai/speaches) | ✅ MIT | Server chuẩn OpenAI `/v1/audio/transcriptions` trên faster-whisper | **Đã hỗ trợ** qua `TRANSCRIBE_BASE_URL` |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | ✅ MIT | Whisper nhanh khoảng 4 lần | Bên trong speaches |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | ✅ MIT | Chạy CPU, có HTTP server | Thay speaches trên máy yếu |
| [PhoWhisper](https://github.com/VinAIResearch/PhoWhisper) (VinAI) | ✅ BSD-3 | Whisper tinh chỉnh cho tiếng Việt, đúng giọng vùng miền hơn | Chuyển sang CTranslate2 rồi nạp vào speaches. ❓ Chưa có bản CT2 chính thức |
| [whisperX](https://github.com/m-bain/whisperX) | ✅ BSD-2 | Thời gian từng từ + **tách người nói** (nhân viên / khách) | Dịch vụ Python riêng. Giúp tính tỷ lệ nói/nghe, ai ngắt lời |
| [pyannote-audio](https://github.com/pyannote/pyannote-audio) | ✅ MIT (model cần token HF) | Tách người nói | Dùng qua whisperX |
| FPT.AI STT | Thương mại | `POST /hmi/asr/general` | **Đã hỗ trợ** qua `FPT_AI_API_KEY` |

### 3.3 Chấm điểm cuộc gọi / conversation intelligence
- [SalesGPT](https://github.com/filip-michalsky/SalesGPT) (✅ MIT): bộ giai đoạn bán hàng Intro → Qualification → Value → Needs → Solution → Objection → Close, đã dùng làm khung cho phiếu chấm mặc định.
- [Playcall](https://github.com/Dphenomenal101/playcall) (✅ MIT, còn non): chấm theo playbook + bối cảnh khách. Chỉ tham khảo.
- **Kết luận:** chưa có dự án mã nguồn mở đủ chín để ghép. Tự xây trên Claude (đã làm) là đúng hướng.

### 3.4 Nguồn lead
| Nguồn | Cách làm | SDK |
|---|---|---|
| Facebook Lead Ads | Webhook `leadgen` + `GET /{leadgen_id}`, chữ ký `X-Hub-Signature-256`, quyền `leads_retrieval` | Gọi Graph API bằng `fetch` (SDK chính thức dùng giấy phép riêng của Meta) |
| Google Ads lead form | JSON `user_column_data`, so `google_key` | Không cần SDK |
| TikTok Lead Gen | "Custom API with Webhooks", scope `lead.read` | ❓ Cấu trúc payload chưa có tài liệu công khai đầy đủ: hiện nhận cả kiểu `field_data` lẫn trường phẳng |
| Zalo OA | Webhook v3, refresh token `oauth.zaloapp.com/v4/oa/access_token`, chữ ký `X-ZEvent-Signature` (❓ công thức theo tài liệu cộng đồng) | [`@warriorteam/redai-zalo-sdk`](https://www.npmjs.com/package/@warriorteam/redai-zalo-sdk) ✅ MIT, có OA v3 + ZNS: tham khảo hoặc dùng khi mở rộng ZNS |
| ⛔ `zca-js` | Tự động hoá **tài khoản Zalo cá nhân**, không chính thức | **Không dùng**: vi phạm điều khoản Zalo, dễ khoá tài khoản |

### 3.5 Thương mại điện tử
| Nền tảng | Webhook | SDK đề xuất |
|---|---|---|
| TikTok Shop | `Authorization` = HMAC-SHA256(app_key + body, app_secret), chống trùng theo `tts_notification_id` | `tiktok-shop` (ISC) |
| Shopee | Push mechanism trong Partner Center (❓ chữ ký) | [`@congminh1254/shopee-sdk`](https://www.npmjs.com/package/@congminh1254/shopee-sdk) ✅ MIT, TypeScript, còn cập nhật: dùng để **kéo chi tiết đơn** |
| Lazada | ❓ Tài liệu push khó truy cập | `lazada-api-client` (ISC, ít người dùng) |
| Haravan | `X-Haravan-Hmacsha256`, kiểu Shopify | Gọi REST trực tiếp |
| Sapo | `orders/create`... (❓ chữ ký) | `sapo-client-sdk` (✅ MIT) |
| Shopify | `X-Shopify-Hmac-Sha256` | `@shopify/shopify-api` (✅ MIT) |
| WooCommerce | `X-WC-Webhook-Signature` | `@woocommerce/woocommerce-rest-api` (✅ MIT) |
| Pancake POS | ❓ Header bí mật tự đặt | Dùng webhook chung |

### 3.6 Khối giao diện Work OS
| Thư viện | Giấy phép | Dùng cho |
|---|---|---|
| [dnd-kit](https://github.com/clauderic/dnd-kit) | ✅ MIT | Kéo thả Kanban, sắp xếp cột/nhóm |
| [TanStack Table + Virtual](https://tanstack.com) | ✅ MIT | Board hàng chục nghìn dòng không giật |
| [SVAR React Gantt](https://www.npmjs.com/package/@svar-ui/react-gantt) / [frappe-gantt](https://github.com/frappe/gantt) | ✅ MIT | Chế độ xem Timeline/Gantt |
| [formula.js](https://github.com/formulajs/formulajs) | ✅ MIT | Cột công thức kiểu Excel |
| HyperFormula | ⚠️ GPL-3 / thương mại | Không dùng |
| [Tiptap](https://tiptap.dev) / [Lexical](https://lexical.dev) | ✅ MIT | Cập nhật có định dạng, @mention, tài liệu (Docs) |
| [Recharts](https://recharts.org) / [ECharts](https://echarts.apache.org) | ✅ MIT / Apache | Dashboard widget |

### 3.7 CRM và AI agent để học hỏi
| Dự án | Giấy phép | Lấy gì |
|---|---|---|
| [Twenty](https://github.com/twentyhq/twenty) | ⚠️ AGPL | Thiết kế metadata cho đối tượng/trường tuỳ biến, views, workflow (chỉ tham khảo) |
| [Atomic CRM](https://github.com/marmelab/atomic-crm) | ✅ MIT | Mẫu code React + shadcn, có thể mượn code |
| [Frappe CRM](https://github.com/frappe/crm) | ⚠️ AGPL | Trải nghiệm nhật ký cuộc gọi, tích hợp tổng đài (tham khảo) |
| [Krayin](https://github.com/krayin/laravel-crm) | ✅ MIT | Ý tưởng pipeline, web form |
| [AgentSDR](https://github.com/Kandid-ai/AgentSDR) | ✅ MIT | Mẫu "AI soạn – người duyệt" trước khi gửi tin, cột làm giàu dữ liệu bằng AI |

---

## 4. Lộ trình lên tầm Work OS

### Giai đoạn 2: lõi Work OS (4–6 tuần)
1. **Board tuỳ ý**: không giới hạn 3 đối tượng; tạo board mới từ mẫu (dự án, tuyển dụng, chăm sóc sau bán).
2. **Thêm kiểu cột**: công thức (formula.js), liên kết giữa board (khách ↔ đơn ↔ lịch hẹn), file đính kèm, timeline, phụ thuộc, người nhiều lựa chọn, tag.
3. **Thêm chế độ xem**: Timeline/Gantt (SVAR), Dashboard kéo thả widget (Recharts), Form builder, Bản đồ.
4. **Tự động hoá mở rộng**: thêm trigger theo ngày đến hạn, theo lịch, khi lead từ nguồn X. Thêm action gửi Zalo OA/ZNS, gọi webhook ra ngoài, chuyển board, giao cho agent.
5. **Phân quyền**: vai trò (chủ, quản lý, nhân viên, chỉ xem), quyền theo board và theo cột (ẩn SĐT với cộng tác viên).
6. **Hiệu năng**: TanStack Virtual cho board lớn; Postgres + index JSON khi trên 50 nghìn khách.

### Giai đoạn 3: CRM Agent sâu (4–6 tuần)
1. **Sales Chat 24/7 trên Zalo OA**: Claude trả lời theo DNA, xin SĐT, đặt lịch. Mặc định ở chế độ "AI soạn, người duyệt" (mẫu AgentSDR).
2. **Tách người nói (whisperX)**: tỷ lệ nói/nghe, số câu hỏi mở, ai ngắt lời, đoạn im lặng dài. Đưa vào phiếu chấm.
3. **Softphone JsSIP + click-to-call Stringee**: gọi ngay trong CRM, tự ghi âm, không cần tải file.
4. **Chi phí quảng cáo**: kéo chi tiêu từ Marketing API của Facebook, Google, TikTok để tính **CPL, CPA, ROAS** theo chiến dịch ngay trên trang Nguồn khách.
5. **Kéo chi tiết đơn sàn** bằng Shopee SDK / TikTok Shop API: sản phẩm, giá trị, trạng thái giao hàng.
6. **Coaching theo thời gian thực**: gợi ý câu xử lý từ chối ngay trong lúc gọi (cần chép lời trực tiếp).

### Giai đoạn 4: hệ sinh thái (liên tục)
- Kho tích hợp dạng plugin (mỗi nguồn là một file trong `src/lib/sources/`, đã sẵn cấu trúc).
- Ứng dụng di động (PWA trước), thông báo đẩy khi có lead nóng.
- Docs/Wiki nội bộ cho kịch bản bán hàng và tài liệu đào tạo telesales.
- Bộ dữ liệu luyện tập: nhân viên mới tự gọi thử với "khách ảo" do Claude đóng vai, được chấm theo đúng phiếu chấm của công ty.

### Nguyên tắc khi ghép thêm repo
1. Chỉ đóng gói code ✅ MIT/Apache/BSD/ISC. Code GPL/AGPL phải chạy tách riêng.
2. Mỗi tích hợp đều có **chế độ không cần khoá** để học viên thử được ngay, và **kiểm tra chữ ký** khi đã điền khoá.
3. Mọi đầu ra AI đều qua schema (Zod), có bản luật dự phòng khi AI lỗi.
4. Tin nhắn gửi ra ngoài (Zalo, SMS, email) mặc định cần người bấm gửi, trừ khi chủ bật "Tự làm".
