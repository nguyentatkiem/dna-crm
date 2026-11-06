import type { Block } from "./model";
import { LeadForm } from "./LeadForm";

/** Vẽ các khối landing page. Dùng ở trang công khai và khung xem trước trong trình sửa (preview = form không gửi). */
export function LpBlocks({ blocks, color, slug, preview }: { blocks: Block[]; color: string; slug: string; preview?: boolean }) {
  return (
    <div className="bg-white text-[#1f2430]" style={{ ["--lp" as string]: color }}>
      {blocks.map((b) => (
        <BlockView key={b.id} b={b} color={color} slug={slug} preview={preview} />
      ))}
      {!blocks.length && <p className="px-6 py-20 text-center text-[#8a8fa3]">Trang chưa có nội dung.</p>}
    </div>
  );
}

const wrap = "mx-auto w-full max-w-[880px] px-5";

function Btn({ text, href, color }: { text: string; href: string; color: string }) {
  if (!text) return null;
  return (
    <a href={href} className="inline-flex h-12 items-center justify-center rounded-lg px-6 text-[16px] font-semibold text-white shadow-sm" style={{ background: color }}>
      {text}
    </a>
  );
}

function BlockView({ b, color, slug, preview }: { b: Block; color: string; slug: string; preview?: boolean }) {
  switch (b.type) {
    case "hero":
      return (
        <section className="relative overflow-hidden" style={{ background: `linear-gradient(160deg, ${color}1f, #ffffff 70%)` }}>
          <div className={`${wrap} grid gap-6 py-12 sm:py-16 ${b.image ? "md:grid-cols-[1.1fr_1fr] md:items-center" : "text-center"}`}>
            <div className="min-w-0">
              <h1 className="break-words text-[30px] font-bold leading-tight sm:text-[42px]">{b.title}</h1>
              {b.subtitle && <p className="mt-3 whitespace-pre-line break-words text-[17px] leading-relaxed text-[#4b5068]">{b.subtitle}</p>}
              <div className="mt-6">
                <Btn text={b.button} href={b.href} color={color} />
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {b.image && <img src={b.image} alt="" className="w-full rounded-2xl object-cover shadow-lg" loading="eager" />}
          </div>
        </section>
      );
    case "benefits":
      return (
        <section className="py-10 sm:py-14">
          <div className={wrap}>
            {b.title && <h2 className="break-words text-center text-[24px] font-bold sm:text-[30px]">{b.title}</h2>}
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {b.items.filter(Boolean).map((it, i) => (
                <li key={i} className="flex items-start gap-3 rounded-xl border border-[#e6e9f2] p-4 text-[16px] leading-snug">
                  <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full text-[13px] font-bold text-white" style={{ background: color }} aria-hidden="true">
                    ✓
                  </span>
                  <span className="min-w-0 break-words">{it}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      );
    case "image":
      if (!b.url) return null;
      return (
        <section className="py-6">
          <figure className={wrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.url} alt={b.alt} loading="lazy" className="w-full rounded-2xl object-cover" />
            {b.caption && <figcaption className="mt-2 text-center text-[14px] text-[#8a8fa3]">{b.caption}</figcaption>}
          </figure>
        </section>
      );
    case "testimonial":
      return (
        <section className="py-10">
          <figure className={`${wrap} max-w-[680px] text-center`}>
            <blockquote className="whitespace-pre-line break-words text-[19px] italic leading-relaxed text-[#2f3447]">“{b.quote}”</blockquote>
            <figcaption className="mt-4 text-[15px]">
              <b className="font-semibold">{b.author}</b>
              {b.role && <span className="text-[#8a8fa3]"> · {b.role}</span>}
            </figcaption>
          </figure>
        </section>
      );
    case "form":
      return (
        <section id="dang-ky" className="scroll-mt-4 py-10 sm:py-14" style={{ background: `${color}0f` }}>
          <div className={`${wrap} max-w-[520px]`}>
            <div className="rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,.08)] sm:p-7">
              {b.title && <h2 className="break-words text-center text-[22px] font-bold sm:text-[26px]">{b.title}</h2>}
              {b.subtitle && <p className="mt-2 text-center text-[15px] text-[#4b5068]">{b.subtitle}</p>}
              <div className="mt-5">
                <LeadForm slug={slug} fields={b.fields} button={b.button} thanks={b.thanks} color={color} preview={preview} />
              </div>
            </div>
          </div>
        </section>
      );
    case "faq":
      return (
        <section className="py-10 sm:py-14">
          <div className={`${wrap} max-w-[720px]`}>
            {b.title && <h2 className="break-words text-center text-[24px] font-bold sm:text-[30px]">{b.title}</h2>}
            <div className="mt-6 grid gap-2">
              {b.items.map((it, i) => (
                <details key={i} className="group rounded-xl border border-[#e6e9f2] px-4 py-3">
                  <summary className="cursor-pointer list-none break-words text-[16px] font-semibold">
                    <span className="mr-2 inline-block transition-transform group-open:rotate-45" style={{ color }} aria-hidden="true">
                      +
                    </span>
                    {it.q}
                  </summary>
                  <p className="mt-2 whitespace-pre-line break-words text-[15px] leading-relaxed text-[#4b5068]">{it.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      );
    case "cta":
      return (
        <section className="py-12" style={{ background: color }}>
          <div className={`${wrap} text-center text-white`}>
            <h2 className="break-words text-[24px] font-bold sm:text-[30px]">{b.title}</h2>
            {b.subtitle && <p className="mt-2 text-[16px] opacity-90">{b.subtitle}</p>}
            {b.button && (
              <a href={b.href} className="mt-6 inline-flex h-12 items-center justify-center rounded-lg bg-white px-6 text-[16px] font-semibold shadow-sm" style={{ color }}>
                {b.button}
              </a>
            )}
          </div>
        </section>
      );
  }
}
