/**
 * Slides para TV — tipos e regras PURAS.
 *
 * Fora do `server-only`: os formulários usam os rótulos, e a tela pública
 * monta a linha do tempo e as animações a partir daqui (testável isolado).
 *
 * Leitura e gravação: src/lib/db/comunicacao-slides.ts
 * Tela pública: src/app/tv/[slug]/page.tsx
 * SQL: supabase/comunicacao-slides-tv.sql
 */

export type Orientacao = "horizontal" | "vertical"
export type Giro = "nao" | "horario" | "anti_horario"
export type Ajuste = "cobrir" | "conter"

export const ORIENTACOES: { chave: Orientacao; rotulo: string; detalhe: string }[] = [
  { chave: "horizontal", rotulo: "Horizontal", detalhe: "TV deitada · 16:9 · 1920 × 1080" },
  { chave: "vertical", rotulo: "Vertical", detalhe: "TV em pé · 9:16 · 1080 × 1920" },
]

export const GIROS: { chave: Giro; rotulo: string; detalhe: string }[] = [
  {
    chave: "nao",
    rotulo: "Não girar",
    detalhe: "O navegador da TV já mostra a tela na mesma orientação do conjunto.",
  },
  {
    chave: "horario",
    rotulo: "Girar 90° no sentido horário",
    detalhe: "Para TV montada em pé cujo navegador continua deitado.",
  },
  {
    chave: "anti_horario",
    rotulo: "Girar 90° no sentido anti-horário",
    detalhe: "O mesmo, para a TV montada do outro lado.",
  },
]

export const AJUSTES: { chave: Ajuste; rotulo: string; detalhe: string }[] = [
  { chave: "cobrir", rotulo: "Preencher a tela", detalhe: "Corta as sobras da imagem." },
  { chave: "conter", rotulo: "Imagem inteira", detalhe: "Sem cortes, com fundo desfocado." },
]

export const DURACAO_MINIMA = 4
export const DURACAO_MAXIMA = 300
export const DURACAO_PADRAO = 10
export const TITULO_MAX = 90
export const DESCRICAO_MAX = 240
export const FAIXA_QUANTIDADE_MAX = 20
/** Segundos da transição entre slides. */
export const TRANSICAO = 1
/** Velocidade da faixa, em px do palco por segundo. */
export const VELOCIDADE_FAIXA = 110

export function ehOrientacao(v: unknown): v is Orientacao {
  return v === "horizontal" || v === "vertical"
}
export function ehGiro(v: unknown): v is Giro {
  return v === "nao" || v === "horario" || v === "anti_horario"
}
export function ehAjuste(v: unknown): v is Ajuste {
  return v === "cobrir" || v === "conter"
}

/** Tamanho do palco em px: tudo é desenhado nele e escalado para a tela. */
export function palcoDa(orientacao: Orientacao): { largura: number; altura: number } {
  return orientacao === "vertical"
    ? { largura: 1080, altura: 1920 }
    : { largura: 1920, altura: 1080 }
}

/** Número inteiro no intervalo, ou null (vazio / inválido). */
export function inteiroEntre(v: unknown, min: number, max: number): number | null {
  const s = String(v ?? "").trim()
  if (s === "") return null
  const n = Number(s)
  if (!Number.isInteger(n) || n < min || n > max) return null
  return n
}

export type SlideTv = {
  id: string
  ordem: number
  titulo: string | null
  descricao: string | null
  imagemUrl: string | null
  imagemCaminho: string | null
  ajuste: Ajuste
  /** null = a duração padrão do conjunto. */
  duracaoSegundos: number | null
  exibirDe: string | null
  exibirAte: string | null
  ativo: boolean
}

export type SituacaoSlide = "no_ar" | "oculto" | "agendado" | "encerrado"

/** Situação do slide hoje (AAAA-MM-DD, fuso de São Paulo). */
export function situacaoDoSlide(
  s: Pick<SlideTv, "ativo" | "exibirDe" | "exibirAte">,
  hoje: string
): SituacaoSlide {
  if (!s.ativo) return "oculto"
  if (s.exibirDe && hoje < s.exibirDe) return "agendado"
  if (s.exibirAte && hoje > s.exibirAte) return "encerrado"
  return "no_ar"
}

export const ROTULO_SITUACAO_SLIDE: Record<SituacaoSlide, string> = {
  no_ar: "No ar",
  oculto: "Oculto",
  agendado: "Agendado",
  encerrado: "Encerrado",
}

/** Um slide precisa de imagem ou de título para ter o que mostrar. */
export function slideTemConteudo(s: Pick<SlideTv, "titulo" | "imagemUrl">): boolean {
  return Boolean(s.imagemUrl || (s.titulo && s.titulo.trim()))
}

export function duracaoDoSlide(s: Pick<SlideTv, "duracaoSegundos">, padrao: number): number {
  return s.duracaoSegundos ?? padrao
}

/**
 * Animação de opacidade de cada slide, em CSS puro — a tela roda mesmo em
 * navegador de TV antigo, sem depender do JavaScript da aplicação.
 *
 * O slide 0 é a base, sempre visível. Cada slide k ≥ 1 fica por cima (z-index
 * k): entra com fade no seu início e some de uma vez quando o seguinte já o
 * cobriu por inteiro. O último sai com fade no fim do ciclo, revelando o
 * slide 0 — é o que fecha o laço sem piscar.
 *
 * Devolve, por slide, os keyframes (null para a base) e a duração do ciclo.
 */
export function animacaoDosSlides(duracoes: number[]): {
  ciclo: number
  keyframes: (string | null)[]
} {
  const ciclo = duracoes.reduce((s, d) => s + d, 0)
  if (duracoes.length <= 1) return { ciclo, keyframes: duracoes.map(() => null) }

  const fade = Math.min(TRANSICAO, Math.min(...duracoes) / 4)
  const p = (t: number) => `${Math.round((t / ciclo) * 1_000_000) / 10_000}%`
  const inicios: number[] = []
  let acumulado = 0
  for (const d of duracoes) {
    inicios.push(acumulado)
    acumulado += d
  }

  const keyframes = duracoes.map((_, k) => {
    if (k === 0) return null
    const entra = inicios[k]
    const passos = [`0%{opacity:0}`, `${p(entra)}{opacity:0}`, `${p(entra + fade)}{opacity:1}`]
    if (k < duracoes.length - 1) {
      const coberto = inicios[k + 1] + fade
      passos.push(`${p(coberto)}{opacity:1}`, `${p(coberto + 0.01)}{opacity:0}`, `100%{opacity:0}`)
    } else {
      passos.push(`${p(ciclo - fade)}{opacity:1}`, `100%{opacity:0}`)
    }
    return passos.join("")
  })
  return { ciclo, keyframes }
}

/** Mensagens fixas (uma por linha) seguidas das manchetes, sem repetição. */
export function itensDaFaixa(textoFixo: string | null, manchetes: string[]): string[] {
  const vistos = new Set<string>()
  const itens: string[] = []
  const fixos = (textoFixo ?? "").split(/\r?\n/)
  for (const bruto of [...fixos, ...manchetes]) {
    const item = bruto.replace(/\s+/g, " ").trim()
    const chave = item.toLocaleLowerCase("pt-BR")
    if (!item || vistos.has(chave)) continue
    vistos.add(chave)
    itens.push(item)
  }
  return itens
}

/**
 * Duração estimada de uma volta da faixa, antes de a tela medir a largura
 * real (≈ 24 px por caractere na fonte da faixa, mais o separador).
 */
export function duracaoEstimadaDaFaixa(itens: string[]): number {
  const caracteres = itens.reduce((s, i) => s + i.length + 6, 0)
  return Math.max(20, Math.round((caracteres * 24) / VELOCIDADE_FAIXA))
}

/** "no ar" quando alguma TV conferiu o link nos últimos 3 minutos. */
export function descreverUltimoAcesso(
  iso: string | null,
  agora: Date
): { noAr: boolean; rotulo: string } {
  if (!iso) return { noAr: false, rotulo: "Nenhuma TV abriu este link ainda" }
  const minutos = Math.floor((agora.getTime() - new Date(iso).getTime()) / 60_000)
  if (minutos < 3) return { noAr: true, rotulo: "Uma TV está exibindo agora" }
  if (minutos < 60) return { noAr: false, rotulo: `Última conexão de TV há ${minutos} min` }
  const horas = Math.floor(minutos / 60)
  if (horas < 48) return { noAr: false, rotulo: `Última conexão de TV há ${horas} h` }
  return { noAr: false, rotulo: `Última conexão de TV há ${Math.floor(horas / 24)} dias` }
}
