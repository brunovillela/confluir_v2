"use client"

import { useEffect, useRef, type CSSProperties } from "react"
import {
  ArrowRight,
  ArrowUpRight,
  BedDouble,
  Boxes,
  Briefcase,
  Building2,
  Car,
  HeartPulse,
  Layers,
  Megaphone,
  Scale,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Send,
  Users,
  Vote,
  Wallet,
  Wrench,
} from "lucide-react"

/**
 * Landing pública (confluir.online). O app do tenant vive no subdomínio, então
 * as portas de entrada apontam para lá — mantém a sessão e os links de e-mail no
 * mesmo host. Trocar quando houver mais de um tenant.
 */
const APP = "https://sindipetronf.confluir.online"

const MODULOS = [
  { ic: Users, t: "Filiados", d: "Cadastro, vínculos, situação e contribuições dos associados." },
  { ic: Wallet, t: "Financeiro", d: "Ordens de pagamento, caixa, centros de custo e receitas." },
  { ic: Briefcase, t: "Pessoal", d: "Contracheques, ponto, férias, ASOs e reembolsos." },
  { ic: ShoppingCart, t: "Compras", d: "Solicitações, cotações e aprovação por alçada." },
  { ic: Car, t: "Veículos", d: "Frota, agendamentos, abastecimentos e infrações." },
  { ic: Scale, t: "Jurídico", d: "Homologações e processos, com trilha completa." },
  { ic: HeartPulse, t: "Saúde", d: "CATs, CIPA e atendimentos com sigilo clínico." },
  { ic: Vote, t: "Assembleias", d: "Campanhas, rodadas e votação online por CPF." },
  { ic: Boxes, t: "Patrimônio", d: "Bens, recintos, notas fiscais e cautelas." },
  { ic: Megaphone, t: "Comunicação", d: "Notícias e resumos de imprensa por IA." },
  { ic: BedDouble, t: "Hospedagem", d: "Hotéis parceiros, tarifas, cupons e faturamento." },
  { ic: Wrench, t: "Ferramentas", d: "Projetos, demandas, documentos, agenda e ofícios." },
]

const PORTAS = [
  {
    ic: ShieldCheck,
    t: "Área Administrativa",
    d: "Para funcionários e diretoria. Acesso ao painel completo de gestão, conforme as permissões de cada pessoa.",
    cta: "Entrar no painel",
    href: `${APP}/login`,
  },
  {
    ic: Users,
    t: "Portal do Associado",
    d: "Para filiados. Contracheques, férias, cupons, notícias, agenda e serviços — o sindicato no seu bolso.",
    cta: "Acessar o portal",
    href: `${APP}/portal`,
  },
  {
    ic: BedDouble,
    t: "Área do Hotel",
    d: "Para hotéis parceiros. Reservas, cupons de filiados e faturamento das hospedagens.",
    cta: "Entrar como parceiro",
    href: `${APP}/hotel`,
  },
]

const SHOTS = [
  { src: "/ajuda/veiculos/painel.png", alt: "Gestão de Veículos — frota, situação e condutores" },
  { src: "/ajuda/saude/cat.png", alt: "Saúde e Segurança do Trabalho — registro de CAT" },
]

export function Landing() {
  const auraA = useRef<HTMLDivElement>(null)
  const auraB = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const flowRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    // Reveal on scroll
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in")
            io.unobserve(e.target)
          }
        }
      },
      { threshold: 0.16 }
    )
    document.querySelectorAll(".lp .reveal").forEach((el) => io.observe(el))

    // Parallax das auras + estado da nav
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const y = window.scrollY
        if (navRef.current) navRef.current.dataset.scrolled = String(y > 24)
        if (reduce) return
        if (auraA.current) auraA.current.style.transform = `translate3d(0, ${y * 0.18}px, 0)`
        if (auraB.current) auraB.current.style.transform = `translate3d(0, ${y * -0.12}px, 0)`
        if (contentRef.current) {
          contentRef.current.style.transform = `translate3d(0, ${y * 0.08}px, 0)`
          contentRef.current.style.opacity = String(Math.max(0, 1 - y / 620))
        }
      })
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })

    // Correntes que convergem sutilmente para o cursor
    const cleanupCanvas = setupFlow(flowRef.current, reduce)

    return () => {
      window.removeEventListener("scroll", onScroll)
      io.disconnect()
      cleanupCanvas()
    }
  }, [])

  return (
    <div className="lp">
      {/* Navegação */}
      <nav ref={navRef} className="lp-nav" data-scrolled="false">
        <div className="wrap row">
          <a href="#topo" aria-label="Confluir" style={{ display: "inline-flex" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-confluir-completa-dark.png" alt="Confluir" style={{ height: 46, width: "auto" }} />
          </a>
          <div className="links">
            <a className="nav-anchor" href="#recursos">Recursos</a>
            <a className="nav-anchor" href="#diferenciais">Diferenciais</a>
            <a className="nav-anchor" href="#portas">Portas de entrada</a>
            <a className="btn" href="#portas">Acessar <ArrowRight size={16} /></a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header id="topo" className="lp-hero">
        <div className="bg" aria-hidden>
          <div ref={auraA} className="aura a" />
          <div ref={auraB} className="aura b" />
          <div className="grid-floor" />
        </div>
        <canvas ref={flowRef} className="streams" aria-hidden />
        <div className="wrap">
          <div ref={contentRef} className="content">
            <span className="badge"><span className="dot" /> Plataforma de gestão sindical</span>
            <h1 className="display">
              Toda a gestão do seu<br />sindicato <span className="flame-text">conflui aqui.</span>
            </h1>
            <p className="lede" style={{ marginTop: "1.6rem" }}>
              Filiados, financeiro, pessoal, jurídico, saúde, assembleias e muito mais —
              reunidos em um único sistema, com portal do associado, votação online e
              inteligência artificial embarcada.
            </p>
            <div className="cta-row">
              <a className="btn" href="#portas">Escolher minha entrada <ArrowRight size={17} /></a>
              <a className="btn ghost" href="#recursos">Conhecer os recursos</a>
            </div>
          </div>
        </div>
        <div className="scroll-hint" aria-hidden>
          <span>Role para explorar</span>
          <span className="bar" />
        </div>
      </header>

      {/* Números */}
      <section className="lp-stats">
        <div className="wrap">
          <div className="grid">
            {[
              ["12", "áreas integradas", true],
              ["3", "portas de acesso", false],
              ["100%", "em nuvem, sem instalar", false],
              ["LGPD", "por concepção", false],
            ].map(([n, l, destaque], i) => (
              <div className="cell reveal" style={{ "--d": `${i * 80}ms` } as CSSProperties} key={l as string}>
                <div className="num">{destaque ? <b>{n}</b> : n}</div>
                <div className="lbl">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Banda clara: Recursos + vitrine de telas */}
      <div className="band-light">
        <div className="band-fade top" aria-hidden />

        <section id="recursos" className="lp-section">
          <div className="wrap">
            <div className="head reveal">
              <span className="eyebrow">O que há dentro</span>
              <h2>Um sistema, todas as frentes do sindicato.</h2>
              <p className="sub">
                Cada área do dia a dia sindical tem seu módulo — desenhado para uso
                intenso, com tabelas densas, filtros poderosos e ações rápidas.
              </p>
            </div>
            <div className="lp-modules">
              {MODULOS.map((m, i) => {
                const Ic = m.ic
                return (
                  <article className="lp-mod reveal" style={{ "--d": `${(i % 4) * 70}ms` } as CSSProperties} key={m.t}>
                    <div className="ic"><Ic size={22} strokeWidth={1.75} /></div>
                    <h3>{m.t}</h3>
                    <p>{m.d}</p>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section id="veja" className="lp-section lp-shots">
          <div className="wrap">
            <div className="head reveal">
              <span className="eyebrow">O sistema em ação</span>
              <h2>Bonito de usar — todos os dias.</h2>
              <p className="sub">
                Uma interface pensada para uso intenso: densa onde precisa, clara onde
                importa, e coerente de ponta a ponta. Algumas telas reais do sistema.
              </p>
            </div>
            <div className="shot-feature reveal">
              <div className="shot">
                <div className="bar">
                  <i /><i /><i />
                  <span className="addr">sindicato.confluir.online/painel/financeiro</span>
                </div>
                <div className="frame">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/ajuda/financeiro/painel.png" alt="Painel Financeiro do Confluir — indicadores, ordens de pagamento e caixa" loading="lazy" />
                  <span className="redact" aria-hidden />
                </div>
              </div>
            </div>
            <div className="shot-grid">
              {SHOTS.map((s, i) => (
                <div className="shot reveal" style={{ "--d": `${i * 90}ms` } as CSSProperties} key={s.src}>
                  <div className="bar"><i /><i /><i /></div>
                  <div className="frame">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.src} alt={s.alt} loading="lazy" />
                    <span className="redact" aria-hidden />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="band-fade bot" aria-hidden />
      </div>

      {/* Diferenciais */}
      <section id="diferenciais" className="lp-section">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">Por que Confluir</span>
            <h2>O que nos torna diferentes.</h2>
            <p className="sub">
              Não é um pacote de telas soltas. É uma plataforma coesa, pensada para
              a realidade de sindicatos — e à frente do que se usa por aí.
            </p>
          </div>
          <div className="lp-bento">
            <article className="tile feature span-3 tall reveal">
              <span className="orb" aria-hidden />
              <div className="ic"><Layers size={30} strokeWidth={1.6} /></div>
              <h3>Tudo-em-um, de verdade</h3>
              <p>
                Um só login, um só banco, uma só experiência. Filiação, finanças,
                pessoal, jurídico e saúde conversam entre si — o dado entra uma vez e
                flui por todo o sistema.
              </p>
            </article>
            <article className="tile span-3 reveal" style={{ "--d": "80ms" } as CSSProperties}>
              <div className="ic"><Sparkles size={26} strokeWidth={1.6} /></div>
              <h3>Inteligência artificial embarcada</h3>
              <p>
                Resumos de imprensa, redação de ofícios, leitura de documentos e
                recebimentos — a IA acelera o trabalho repetitivo.
              </p>
            </article>
            <article className="tile span-3 reveal">
              <div className="ic"><Vote size={26} strokeWidth={1.6} /></div>
              <h3>Portal do associado + votação online</h3>
              <p>
                O filiado acessa seus dados e serviços, e vota em assembleias com
                autenticação por CPF — transparente e auditável.
              </p>
            </article>
            <article className="tile span-2 reveal">
              <div className="ic"><Send size={24} strokeWidth={1.6} /></div>
              <h3>Assistente no Telegram</h3>
              <p>Contracheque, férias e avisos direto no chat.</p>
            </article>
            <article className="tile span-2 reveal" style={{ "--d": "80ms" } as CSSProperties}>
              <div className="ic"><Building2 size={24} strokeWidth={1.6} /></div>
              <h3>Multi-organização</h3>
              <p>Cada entidade no seu subdomínio, isolada e segura.</p>
            </article>
            <article className="tile span-2 reveal" style={{ "--d": "160ms" } as CSSProperties}>
              <div className="ic"><ShieldCheck size={24} strokeWidth={1.6} /></div>
              <h3>Segurança e LGPD</h3>
              <p>Isolamento por organização, trilhas e sigilo clínico.</p>
            </article>
          </div>
        </div>
      </section>

      {/* Portas de entrada */}
      <section id="portas" className="lp-section">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">Escolha sua entrada</span>
            <h2>Por onde você acessa?</h2>
            <p className="sub">Cada público tem sua porta. Escolha a sua para continuar.</p>
          </div>
          <div className="lp-doors">
            {PORTAS.map((p, i) => {
              const Ic = p.ic
              return (
                <a className="lp-door reveal" style={{ "--d": `${i * 90}ms` } as CSSProperties} href={p.href} key={p.t}>
                  <div className="ic"><Ic size={28} strokeWidth={1.7} /></div>
                  <h3>{p.t}</h3>
                  <p>{p.d}</p>
                  <span className="go">{p.cta} <ArrowUpRight size={18} /></span>
                </a>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="lp-cta reveal">
            <span className="eyebrow">Pronto para começar</span>
            <h2 style={{ marginTop: "0.8rem" }}>
              A gestão do seu sindicato, <span className="flame-text">sem atrito.</span>
            </h2>
            <p>
              Entre pela sua porta e descubra um jeito mais fluido de administrar,
              atender e representar.
            </p>
            <div className="cta-row">
              <a className="btn" href="#portas">Escolher minha entrada <ArrowRight size={17} /></a>
            </div>
          </div>
        </div>
      </section>

      {/* Rodapé */}
      <footer className="lp-foot">
        <div className="wrap">
          <div className="top">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-confluir-completa-dark.png" alt="Confluir" style={{ height: 40, width: "auto" }} />
              <p className="tagline">
                Plataforma de gestão organizacional para sindicatos. Onde as frentes
                do dia a dia confluem em um só lugar.
              </p>
            </div>
            <div className="cols">
              <div className="col">
                <h4>Plataforma</h4>
                <a href="#recursos">Recursos</a>
                <a href="#diferenciais">Diferenciais</a>
                <a href="#portas">Portas de entrada</a>
              </div>
              <div className="col">
                <h4>Acesso</h4>
                <a href={`${APP}/login`}>Área administrativa</a>
                <a href={`${APP}/portal`}>Portal do associado</a>
                <a href={`${APP}/hotel`}>Área do hotel</a>
              </div>
            </div>
          </div>
          <div className="base">
            <span>© {new Date().getFullYear()} Confluir. Todos os direitos reservados.</span>
            <span>Feito para representar, atender e gerir.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

/** Canvas do hero: correntes de Bézier que convergem, sutis, para o cursor. */
function setupFlow(cv: HTMLCanvasElement | null, reduce: boolean): () => void {
  if (!cv || !cv.getContext) return () => {}
  const cx = cv.getContext("2d")
  if (!cx) return () => {}
  let W = 0
  let H = 0
  const seeds: [number, number][] = [
    [0.1, 0], [0.28, 0], [0.46, 0], [0.64, 0], [0.82, 0],
    [0, 0.16], [0, 0.42], [0, 0.68], [0, 0.92],
    [1, 0.16], [1, 0.42], [1, 0.68], [1, 0.92],
    [0.22, 1], [0.44, 1], [0.62, 1], [0.82, 1],
  ]
  const lines = seeds.map((s, i) => ({
    x: s[0], y: s[1], phase: (i * 0.137) % 1, speed: 0.04 + (i % 5) * 0.008,
    dir: i % 2 ? 1 : -1, amp1: 0.55 + (i % 3) * 0.2, amp2: 0.5 + (i % 4) * 0.16,
    w1: 0.5 + (i % 3) * 0.12, w2: 0.42 + (i % 4) * 0.1,
  }))
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const r = cv.getBoundingClientRect()
    W = r.width
    H = r.height
    cv.width = Math.round(W * dpr)
    cv.height = Math.round(H * dpr)
    cx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  const tgt = { x: 0, y: 0 }
  const aim = { x: 0, y: 0 }
  let has = false
  let init = false
  let caf = 0
  const onMove = (e: MouseEvent) => {
    const r = cv.getBoundingClientRect()
    aim.x = e.clientX - r.left
    aim.y = e.clientY - r.top
    has = true
  }
  const onOut = (e: MouseEvent) => {
    if (!e.relatedTarget) has = false
  }
  const cb = (
    p: number, x0: number, y0: number, x1: number, y1: number,
    x2: number, y2: number, x3: number, y3: number
  ): [number, number] => {
    const u = 1 - p, A = u * u * u, B = 3 * u * u * p, C = 3 * u * p * p, D = p * p * p
    return [A * x0 + B * x1 + C * x2 + D * x3, A * y0 + B * y1 + C * y2 + D * y3]
  }
  const frame = (ts: number) => {
    const rect = cv.getBoundingClientRect()
    if (rect.bottom < -60) {
      caf = requestAnimationFrame(frame)
      return
    }
    const dx = has ? aim.x : W * 0.5
    const dy = has ? aim.y : H * 0.42
    if (!init) {
      tgt.x = dx
      tgt.y = dy
      init = true
    }
    tgt.x += (dx - tgt.x) * 0.07
    tgt.y += (dy - tgt.y) * 0.07
    const t = ts * 0.001
    cx.clearRect(0, 0, W, H)
    for (const l of lines) {
      const ax = l.x * W, ay = l.y * H
      const vx = tgt.x - ax, vy = tgt.y - ay, len = Math.hypot(vx, vy) || 1
      const nx = -vy / len, ny = vx / len, amp = Math.min(len * 0.28, 190)
      const b1 = Math.sin(t * l.w1 + l.phase * 6.283) * amp * l.amp1 * l.dir
      const b2 = Math.sin(t * l.w2 + 1.7 + l.phase * 6.283) * amp * l.amp2 * l.dir
      const c1x = ax + vx * 0.33 + nx * b1, c1y = ay + vy * 0.33 + ny * b1
      const c2x = ax + vx * 0.66 + nx * b2, c2y = ay + vy * 0.66 + ny * b2
      cx.beginPath()
      cx.moveTo(ax, ay)
      cx.bezierCurveTo(c1x, c1y, c2x, c2y, tgt.x, tgt.y)
      cx.strokeStyle = "rgba(150,168,212,0.06)"
      cx.lineWidth = 1
      cx.stroke()
      const base = (t * l.speed + l.phase) % 1
      for (let k = 0; k < 9; k++) {
        const p = base - k * 0.014
        if (p < 0 || p > 1) continue
        const pt = cb(p, ax, ay, c1x, c1y, c2x, c2y, tgt.x, tgt.y)
        const a = 1 - k / 9
        cx.beginPath()
        cx.arc(pt[0], pt[1], 1.5 * (1 - k / 13), 0, 6.2832)
        cx.fillStyle = `rgba(255,${Math.round(142 - k * 2)},95,${(a * 0.3).toFixed(3)})`
        cx.fill()
      }
    }
    const g = cx.createRadialGradient(tgt.x, tgt.y, 0, tgt.x, tgt.y, 20)
    g.addColorStop(0, "rgba(255,150,110,0.34)")
    g.addColorStop(0.4, "rgba(255,87,34,0.14)")
    g.addColorStop(1, "rgba(255,87,34,0)")
    cx.fillStyle = g
    cx.beginPath()
    cx.arc(tgt.x, tgt.y, 20, 0, 6.2832)
    cx.fill()
    cx.fillStyle = "rgba(255,87,34,0.6)"
    cx.beginPath()
    cx.arc(tgt.x, tgt.y, 2.2, 0, 6.2832)
    cx.fill()
    caf = requestAnimationFrame(frame)
  }
  window.addEventListener("resize", resize)
  window.addEventListener("mousemove", onMove, { passive: true })
  window.addEventListener("mouseout", onOut, { passive: true })
  if (reduce) {
    tgt.x = W * 0.5
    tgt.y = H * 0.42
    cx.clearRect(0, 0, W, H)
    for (const l of lines) {
      const ax = l.x * W, ay = l.y * H
      cx.beginPath()
      cx.moveTo(ax, ay)
      cx.lineTo(tgt.x, tgt.y)
      cx.strokeStyle = "rgba(150,168,212,0.12)"
      cx.lineWidth = 1
      cx.stroke()
    }
    cx.fillStyle = "#ff5722"
    cx.beginPath()
    cx.arc(tgt.x, tgt.y, 4, 0, 6.2832)
    cx.fill()
  } else {
    caf = requestAnimationFrame(frame)
  }
  return () => {
    if (caf) cancelAnimationFrame(caf)
    window.removeEventListener("resize", resize)
    window.removeEventListener("mousemove", onMove)
    window.removeEventListener("mouseout", onOut)
  }
}
