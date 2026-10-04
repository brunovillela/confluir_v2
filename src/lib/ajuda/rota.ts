import { AREAS_AJUDA } from "@/lib/ajuda/manifesto"
import { MODULOS } from "@/lib/permissoes"

/**
 * AJUDA LIGADA À TELA (onda 2, U11): de que artigo do manual fala a rota em
 * que a pessoa está. Regra geral: área do manual = segmento do módulo
 * (`/painel/<area>`), artigo = subárea (`/painel/<area>/<artigo>`) quando essa
 * rota existe em MODULOS. O que foge à regra (nomes diferentes, áreas
 * agrupadas) está em EXTRAS. O cliente escolhe o prefixo mais longo que casa
 * com o caminho atual; sem casamento, cai no índice do manual.
 */

/** Área do manual → módulo do painel, quando o nome não é o mesmo. */
const BASE_DA_AREA: Record<string, string | null> = {
  introducao: "/painel",
  noticias: "/painel/comunicacao",
  viagens: "/painel/institucional/viagens",
  "fluxos-publicos": null,
}

/** Rotas que falam de um artigo cujo slug não é o segmento da rota. */
const EXTRAS: Record<string, string> = {
  "/conta/seguranca": "/painel/ajuda/introducao/seguranca",
  "/painel/indicadores": "/painel/ajuda/introducao/indicadores",
  "/painel/diretor": "/painel/ajuda/introducao/celular",
  "/painel/indicadores/churn": "/painel/ajuda/introducao/indicadores",
  "/painel/indicadores/custos": "/painel/ajuda/introducao/indicadores",
  "/painel/financeiro/contabil": "/painel/ajuda/financeiro/gerencial",
  "/painel/aprovar": "/painel/ajuda/introducao/celular",
  "/painel/perfil/avisos": "/painel/ajuda/introducao/avisos",
  "/painel/notificacoes": "/painel/ajuda/introducao/avisos",
  "/painel/pessoal/aso": "/painel/ajuda/pessoal/atestados-aso",
  "/painel/pessoal/atestados": "/painel/ajuda/pessoal/atestados-aso",
  "/painel/pessoal/niveis": "/painel/ajuda/pessoal/anuenios-niveis",
  "/painel/pessoal/atribuicoes": "/painel/ajuda/pessoal/atribuicoes-sst",
  "/painel/pessoal/contracheques": "/painel/ajuda/pessoal/contracheques",
  "/painel/pessoal/ponto": "/painel/ajuda/pessoal/ponto",
  "/painel/filiados/solicitacoes": "/painel/ajuda/filiados/solicitacoes",
  "/painel/filiados/atendimentos": "/painel/ajuda/filiados/atendimentos",
  "/painel/filiados/receitas": "/painel/ajuda/filiados/receitas",
  "/painel/filiados/duplicidades": "/painel/ajuda/filiados/duplicidades",
  "/painel/filiados/termos": "/painel/ajuda/filiados/termos",
  "/painel/filiados/importar": "/painel/ajuda/filiados/importar",
  "/painel/filiados/acompanhamento": "/painel/ajuda/filiados/acompanhamento",
  "/painel/filiados/lista": "/painel/ajuda/filiados/perfil",
  "/painel/representacao/votacoes": "/painel/ajuda/representacao/votacao-presencial",
  "/painel/representacao/filiacao-coletiva": "/painel/ajuda/representacao/filiacao-coletiva",
  "/painel/financeiro/caixas": "/painel/ajuda/financeiro/caixa",
  "/painel/financeiro/centros-custo": "/painel/ajuda/financeiro/centros-custo",
  "/painel/financeiro/cartoes": "/painel/ajuda/financeiro/cartoes",
  "/painel/saude/indicadores": "/painel/ajuda/saude/indicadores",
  "/painel/compras/nova": "/painel/ajuda/compras/comprar",
  "/painel/compras/contratos": "/painel/ajuda/compras/contratos",
  "/painel/compras/contratos/minutas": "/painel/ajuda/compras/minutas",
  "/painel/institucional/viagens/faturas": "/painel/ajuda/viagens/faturas",
  "/painel/veiculos/checklists": "/painel/ajuda/veiculos/checklist",
  "/painel/espacos/configuracao": "/painel/ajuda/espacos/publico",
  "/painel/hospedagem/servicos": "/painel/ajuda/hospedagem/reservas",
  "/painel/juridico/homologacoes": "/painel/ajuda/juridico/homologacoes",
  "/painel/juridico/processos": "/painel/ajuda/juridico/processos",
  "/painel/juridico/reembolsos": "/painel/ajuda/juridico/reembolsos",
  "/painel/comunicacao/resumo": "/painel/ajuda/noticias/resumo-ia",
  "/painel/comunicacao/qrcodes": "/painel/ajuda/noticias/qrcodes",
  "/painel/comunicacao/slides": "/painel/ajuda/noticias/slides-tv",
  "/painel/comunicacao/links": "/painel/ajuda/noticias/pagina-links",
  "/painel/comunicacao/mensagens": "/painel/ajuda/noticias/mala-direta",
  "/painel/comunicacao/aniversariantes": "/painel/ajuda/noticias/mala-direta",
  "/painel/eventos/lgpd": "/painel/ajuda/eventos/dados-participantes",
}

export type EntradaAjuda = [prefixo: string, href: string]

/** Pares (prefixo de rota, link do artigo), do prefixo mais longo ao mais curto. */
export function mapaAjuda(): EntradaAjuda[] {
  const rotas = new Set(MODULOS.map((m) => m.href))
  const pares = new Map<string, string>()
  for (const area of AREAS_AJUDA) {
    if (!area.disponivel) continue
    const base = area.slug in BASE_DA_AREA ? BASE_DA_AREA[area.slug] : `/painel/${area.slug}`
    if (!base) continue
    pares.set(base, `/painel/ajuda/${area.slug}`)
    for (const artigo of area.artigos) {
      if (artigo.slug === "index") continue
      const rota = `${base}/${artigo.slug}`
      if (rotas.has(rota)) pares.set(rota, `/painel/ajuda/${area.slug}/${artigo.slug}`)
    }
  }
  for (const [rota, href] of Object.entries(EXTRAS)) pares.set(rota, href)
  // O índice do painel fala da introdução, mas só na home exata.
  return [...pares.entries()].sort((a, b) => b[0].length - a[0].length)
}

/** Artigo da rota: o prefixo mais longo que casa (a home só casa exata). */
export function ajudaDaRota(mapa: EntradaAjuda[], pathname: string): string {
  for (const [prefixo, href] of mapa) {
    if (prefixo === "/painel") {
      if (pathname === "/painel") return href
      continue
    }
    if (pathname === prefixo || pathname.startsWith(`${prefixo}/`)) return href
  }
  return "/painel/ajuda"
}
