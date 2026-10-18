import type { Metadata } from "next"
import { Handshake } from "lucide-react"

import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import { EstadoVazio } from "@/components/portal/estado-vazio"
import { paginaIndisponivel } from "@/components/portal/guarda-parte"
import { hojeSP } from "@/lib/db/comum"
import { listarConvenios, type Convenio, type UnidadeConvenio } from "@/lib/db/filiacao-convenios"
import { configDaParte } from "@/lib/db/portal-partes"
import { formatarData, formatarTelefone } from "@/lib/formato"
import { opcoesPadrao } from "@/lib/portal-partes-constantes"
import { semAcento } from "@/lib/texto"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import {
  ConveniosLista,
  type ContatoAcionavel,
  type ConvenioPortal,
  type GrupoConvenios,
  type UnidadePortal,
} from "./convenios-lista"

export const metadata: Metadata = { title: "Convênios" }

/** A partir de quantos convênios a busca aparece: com menos, tudo cabe na tela. */
const MINIMO_PARA_BUSCA = 6

// ── Contatos que viram link (A43) ─────────────────────────────────────────

/**
 * `tel:` dos dígitos crus (o texto formatado não serve de href). DDD + número
 * ganha +55; 0800/0300 e números sem DDD vão como estão; menos de 8 dígitos
 * não é número que se disque.
 */
function hrefTelefone(bruto: string): string | null {
  const d = bruto.replace(/\D/g, "")
  if ((d.length === 10 || d.length === 11) && !d.startsWith("0")) return `tel:+55${d}`
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return `tel:+${d}`
  // Mais de 13 dígitos são dois números no mesmo campo: discar a soma não
  // liga para nenhum, então fica só o texto.
  return d.length >= 8 && d.length <= 13 ? `tel:${d}` : null
}

/** 0800 123 4567 em vez do "(08) 00123-4567" que a máscara de celular faria. */
function textoTelefone(bruto: string): string {
  const d = bruto.replace(/\D/g, "")
  if (d.length === 11 && /^0[3589]00/.test(d)) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`
  return formatarTelefone(bruto)
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function hrefSite(bruto: string | null): string | null {
  const s = bruto?.trim()
  if (!s) return null
  try {
    const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`)
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null
  } catch {
    return null
  }
}

function hrefMapa(endereco: string | null): string | null {
  if (!endereco) return null
  // A linha do endereço separa com "—" e "·"; para a busca do mapa, vírgulas.
  const consulta = endereco.replace(/\s+[—·]\s+/g, ", ")
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`
}

function paraUnidade(u: UnidadeConvenio): UnidadePortal {
  const telefones: ContatoAcionavel[] = u.telefones
    .filter((t) => t.trim())
    .map((t) => ({ texto: textoTelefone(t), href: hrefTelefone(t) }))
  const emails: ContatoAcionavel[] = u.emails
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e) => ({ texto: e, href: RE_EMAIL.test(e) ? `mailto:${e}` : null }))
  return {
    id: u.id,
    nome: u.nome,
    online: u.online,
    presencial: u.presencial,
    endereco: u.endereco,
    mapa: hrefMapa(u.endereco),
    telefones,
    emails,
    site: hrefSite(u.site),
  }
}

// ── Validade (A163) ───────────────────────────────────────────────────────

function diasAte(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000)
}

function paraConvenio(c: Convenio, hoje: string): ConvenioPortal {
  const faltam = c.dataTermino ? diasAte(hoje, c.dataTermino) : null
  return {
    id: c.id,
    conveniador: c.conveniador,
    infoSumarias: c.infoSumarias,
    infoVantagens: c.infoVantagens,
    arquivoUrl: c.arquivoUrl,
    logoUrl: c.fotoUrl,
    validade: c.dataTermino ? `Válido até ${formatarData(c.dataTermino)}` : null,
    terminaEmBreve:
      faltam === null || faltam < 0 || faltam >= 30
        ? null
        : faltam === 0
          ? "Termina hoje"
          : faltam === 1
            ? "Termina amanhã"
            : `Termina em ${faltam} dias`,
    unidades: c.unidades.map(paraUnidade),
    busca: semAcento(
      [
        c.conveniador,
        c.categoria,
        c.infoSumarias,
        c.infoVantagens,
        ...c.unidades.flatMap((u) => [u.nome, u.endereco]),
      ]
        .filter(Boolean)
        .join(" ")
    ),
  }
}

/** "Ótica e Óculos" → "cat-otica-e-oculos"; repetida, ganha sufixo. */
function ancora(categoria: string, usadas: Set<string>): string {
  const base = `cat-${semAcento(categoria).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "outros"}`
  let id = base
  for (let i = 2; usadas.has(id); i++) id = `${base}-${i}`
  usadas.add(id)
  return id
}

/**
 * Os convênios que o sindicato negocia para o associado, por categoria, com
 * as unidades onde ele é atendido. Só os vigentes: convênio encerrado não
 * pode aparecer como promessa.
 *
 * Área do associado: desabilitada, o layout mostra "indisponível" e esta
 * página (que renderiza junto) não lê nada; suspensa, só a faixa do layout
 * (aqui não há o que gravar). A orientação do topo é configurável.
 */
export default async function PortalConveniosPage() {
  // Desabilitada: o "indisponível" antes de qualquer leitura.
  const indisponivel = await paginaIndisponivel("convenios")
  if (indisponivel) return indisponivel
  const [, parte] = await Promise.all([
    requireVisualizacaoPortal(),
    // Na dúvida, a parte vale, com a orientação padrão.
    configDaParte("convenios").catch(() => null),
  ])
  const { texto_topo } = parte?.opcoes ?? opcoesPadrao("convenios")
  // Logos só aqui: a casca do portal também lista os convênios, mas só para
  // saber se há algum — não precisa assinar imagem.
  const convenios = await listarConvenios({ somenteVigentes: true, logos: true })
  const hoje = hojeSP()

  // A lista vem por categoria, com as sem categoria por último (A164): a
  // ordem do Map é a de chegada, e "Outros" fecha a página.
  const porCategoria = new Map<string, ConvenioPortal[]>()
  for (const c of convenios) {
    const chave = c.categoria?.trim() || "Outros"
    porCategoria.set(chave, [...(porCategoria.get(chave) ?? []), paraConvenio(c, hoje)])
  }
  const usadas = new Set<string>()
  const grupos: GrupoConvenios[] = [...porCategoria.entries()].map(([categoria, lista]) => ({
    id: ancora(categoria, usadas),
    categoria,
    convenios: lista,
  }))

  return (
    <>
      <CabecalhoPagina
        secao="/portal/convenios"
        titulo="Convênios"
        // Em branco no painel: sem orientação.
        subtitulo={texto_topo || undefined}
      />

      {convenios.length === 0 ? (
        <EstadoVazio cartao icone={Handshake} titulo="Nenhum convênio vigente no momento." />
      ) : (
        <ConveniosLista grupos={grupos} comBusca={convenios.length >= MINIMO_PARA_BUSCA} />
      )}
    </>
  )
}
