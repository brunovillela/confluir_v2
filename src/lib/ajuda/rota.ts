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
  "/painel/perfil": "/painel/ajuda/introducao/meu-perfil",
  "/painel/perfil/avisos": "/painel/ajuda/introducao/avisos",
  "/painel/perfil/telegram": "/painel/ajuda/introducao/telegram",
  "/painel/novidades": "/painel/ajuda/introducao/suporte",
  "/painel/solicitar-veiculo": "/painel/ajuda/veiculos/agendamentos",
  "/painel/institucional/lgpd": "/painel/ajuda/institucional/lgpd",
  "/painel/gestao/controle-acesso": "/painel/ajuda/gestao/controle-acesso",
  "/painel/representacao/congressos": "/painel/ajuda/representacao/congressos",
  "/painel/gestao/auditoria": "/painel/ajuda/gestao/auditoria",
  "/painel/hospedagem/mapa": "/painel/ajuda/hospedagem/demanda-garantida",
  "/painel/hospedagem/nao-comparecimentos": "/painel/ajuda/hospedagem/demanda-garantida",
  "/painel/perfil/reembolsos": "/painel/ajuda/pessoal/reembolsos",
  "/painel/perfil/veiculos": "/painel/ajuda/introducao/meu-perfil",
  "/painel/perfil/contracheques": "/painel/ajuda/pessoal/contracheques",
  "/painel/financeiro/contas-bancarias": "/painel/ajuda/financeiro/ordens",
  "/painel/institucional/ramais": "/painel/ajuda/institucional",
  "/painel/institucional/linhas": "/painel/ajuda/institucional",
  "/painel/notificacoes": "/painel/ajuda/introducao/avisos",
  "/painel/pessoal/aso": "/painel/ajuda/pessoal/atestados-aso",
  "/painel/pessoal/atestados": "/painel/ajuda/pessoal/atestados-aso",
  "/painel/pessoal/niveis": "/painel/ajuda/pessoal/anuenios-niveis",
  "/painel/pessoal/atribuicoes": "/painel/ajuda/pessoal/atribuicoes-sst",
  "/painel/pessoal/contracheques": "/painel/ajuda/pessoal/contracheques",
  "/painel/pessoal/ponto": "/painel/ajuda/pessoal/ponto",
  "/painel/pessoal/plano-saude": "/painel/ajuda/pessoal/plano-saude",
  "/painel/filiados/solicitacoes": "/painel/ajuda/filiados/solicitacoes",
  "/painel/filiados/atendimentos": "/painel/ajuda/filiados/atendimentos",
  "/painel/filiados/receitas": "/painel/ajuda/filiados/receitas",
  "/painel/filiados/receitas/controle": "/painel/ajuda/filiados/controle-envio",
  "/painel/filiados/duplicidades": "/painel/ajuda/filiados/duplicidades",
  "/painel/filiados/saude-cadastros/atualizar": "/painel/ajuda/filiados/atualizar-por-lista",
  "/painel/filiados/termos": "/painel/ajuda/filiados/termos",
  "/painel/filiados/acompanhamento": "/painel/ajuda/filiados/acompanhamento",
  "/painel/representacao/filiacao-coletiva": "/painel/ajuda/representacao/filiacao-coletiva",
  "/painel/financeiro/caixas": "/painel/ajuda/financeiro/caixa",
  "/painel/financeiro/centros-custo": "/painel/ajuda/financeiro/centros-custo",
  "/painel/financeiro/cartoes": "/painel/ajuda/financeiro/cartoes",
  "/painel/financeiro/tributos": "/painel/ajuda/financeiro/tributos",
  "/painel/saude/indicadores": "/painel/ajuda/saude/indicadores",
  "/painel/compras/nova": "/painel/ajuda/compras/comprar",
  "/painel/compras/contratos": "/painel/ajuda/compras/contratos",
  "/painel/compras/contratos/minutas": "/painel/ajuda/compras/minutas",
  "/painel/institucional/viagens/faturas": "/painel/ajuda/viagens/faturas",
  "/painel/veiculos/checklists": "/painel/ajuda/veiculos/checklist",
  "/painel/hospedagem/servicos": "/painel/ajuda/hospedagem/reservas",
  "/painel/juridico/homologacoes": "/painel/ajuda/juridico/homologacoes",
  "/painel/juridico/processos": "/painel/ajuda/juridico/processos",
  "/painel/juridico/reembolsos": "/painel/ajuda/juridico/reembolsos",
  "/painel/comunicacao/resumo": "/painel/ajuda/noticias/resumo-ia",
  "/painel/comunicacao/qrcodes": "/painel/ajuda/noticias/qrcodes",
  "/painel/comunicacao/slides": "/painel/ajuda/noticias/slides-tv",
  "/painel/comunicacao/links": "/painel/ajuda/noticias/pagina-links",
  "/painel/comunicacao/mensagens": "/painel/ajuda/noticias/mala-direta",
  "/painel/eventos/lgpd": "/painel/ajuda/eventos/dados-participantes",
  // Pente fino de 26/11/2026: telas que caíam no índice da área ou no artigo
  // errado. `:id` casa com o identificador do registro (ver casaPrefixo).
  "/painel/representacao/votacoes/urnas": "/painel/ajuda/representacao/votacao-presencial",
  "/painel/filiados/:id": "/painel/ajuda/filiados/perfil",
  "/painel/filiados/:id/lgpd": "/painel/ajuda/filiados/perfil#lgpd",
  "/painel/filiados/:id/prontuario": "/painel/ajuda/filiados/prontuarios",
  "/painel/filiados/prontuarios": "/painel/ajuda/filiados/prontuarios",
  "/painel/filiados/saude-cadastros": "/painel/ajuda/filiados/cadastros-pendentes",
  "/painel/filiados/divergencias-votacao": "/painel/ajuda/filiados/cadastros-pendentes",
  "/painel/filiados/inadimplentes": "/painel/ajuda/filiados/direitos",
  "/painel/filiados/coletivas": "/painel/ajuda/representacao/filiacao-coletiva",
  "/painel/pessoal/funcionarios": "/painel/ajuda/pessoal/funcionarios",
  "/painel/pessoal/:id": "/painel/ajuda/pessoal/funcionarios",
  "/painel/pessoal/anuenios": "/painel/ajuda/pessoal/anuenios-niveis",
  "/painel/pessoal/carreira": "/painel/ajuda/pessoal/anuenios-niveis",
  "/painel/pessoal/contabilidade": "/painel/ajuda/pessoal/movimento-folha",
  "/painel/saude/agenda": "/painel/ajuda/saude/atendimentos",
  "/painel/saude/assistidos": "/painel/ajuda/saude/atendimentos",
  "/painel/saude/profissionais": "/painel/ajuda/saude/atendimentos",
  "/painel/perfil/ferias": "/painel/ajuda/pessoal/ferias",
  "/painel/perfil/faltas": "/painel/ajuda/pessoal/faltas",
  "/painel/perfil/ponto": "/painel/ajuda/pessoal/ponto",
  "/painel/perfil/carreira": "/painel/ajuda/pessoal/anuenios-niveis",
  "/painel/perfil/asos": "/painel/ajuda/pessoal/atestados-aso",
  "/painel/perfil/ausencias": "/painel/ajuda/pessoal/atestados-aso",
  "/painel/perfil/treinamentos": "/painel/ajuda/pessoal/treinamentos",
  "/painel/perfil/informes": "/painel/ajuda/pessoal/informes",
  "/painel/perfil/plano-saude": "/painel/ajuda/pessoal/plano-saude",
  "/painel/perfil/diarias": "/painel/ajuda/pessoal/diarias",
  "/painel/perfil/caixa": "/painel/ajuda/financeiro/caixa",
  "/painel/perfil/despesas-caixa": "/painel/ajuda/financeiro/caixa",
  "/painel/perfil/cartao": "/painel/ajuda/financeiro/cartoes",
  "/painel/perfil/viagens": "/painel/ajuda/viagens",
  "/painel/perfil/tarefas": "/painel/ajuda/ferramentas/projetos",
  "/painel/financeiro/auditoria": "/painel/ajuda/financeiro/auditoria",
  "/painel/financeiro/multas": "/painel/ajuda/veiculos/infracoes",
  "/painel/financeiro/ordens/devolvidas": "/painel/ajuda/financeiro",
  "/painel/devolvidas": "/painel/ajuda/financeiro",
  "/painel/estornos": "/painel/ajuda/financeiro/estornos",
  "/painel/pedidos": "/painel/ajuda/ferramentas/projetos",
  "/painel/compras/:id": "/painel/ajuda/compras/comprar",
  "/painel/compras/processos": "/painel/ajuda/compras/comprar",
  "/painel/compras/minhas": "/painel/ajuda/compras/comprar",
  "/painel/compras/comprador": "/painel/ajuda/compras/comprar",
  "/painel/compras/avaliacoes": "/painel/ajuda/compras/comprar",
  "/painel/compras/recebimentos": "/painel/ajuda/compras/comprar",
  "/painel/compras/notas-a-receber": "/painel/ajuda/compras/comprar",
  "/painel/compras/rpa": "/painel/ajuda/compras/comprar",
  "/painel/gestao/email": "/painel/ajuda/gestao/email",
  "/painel/institucional/atas": "/painel/ajuda/institucional/diretoria",
  "/painel/institucional/deliberacoes": "/painel/ajuda/institucional/diretoria",
  "/painel/institucional/viagens/solicitacoes": "/painel/ajuda/viagens/atendimento",
  "/painel/institucional/viagens/configuracoes": "/painel/ajuda/viagens/atendimento",
  "/painel/comunicacao/textos": "/painel/ajuda/noticias/assistente-redacao",
  "/painel/eventos/novo": "/painel/ajuda/eventos/criar",
  "/painel/eventos/:id": "/painel/ajuda/eventos/inscricoes",
  "/painel/eventos/:id/editar": "/painel/ajuda/eventos/criar",
  "/painel/eventos/:id/campos": "/painel/ajuda/eventos/criar",
  "/painel/eventos/:id/convidados": "/painel/ajuda/eventos/convidados",
  "/painel/eventos/configuracao": "/painel/ajuda/eventos/dados-participantes",
  "/painel/ferramentas/demandas": "/painel/ajuda/ferramentas/projetos",
  "/painel/ferramentas/tarefas": "/painel/ajuda/ferramentas/projetos",
  "/painel/ferramentas/anomalias": "/painel/ajuda/ferramentas/projetos",
  "/painel/ferramentas/automacoes": "/painel/ajuda/ferramentas/projetos",
  "/painel/ferramentas/modelos": "/painel/ajuda/ferramentas/projetos",
  "/painel/ferramentas/paineis": "/painel/ajuda/ferramentas/projetos",
  "/painel/patrimonio/novo": "/painel/ajuda/patrimonio/itens",
  "/painel/patrimonio/:id": "/painel/ajuda/patrimonio/itens",
  "/painel/hospedagem/cupons": "/painel/ajuda/hospedagem/reservas",
  "/painel/veiculos/contratos": "/painel/ajuda/veiculos/infracoes",
  "/painel/veiculos/:id/movimentacao": "/painel/ajuda/veiculos/agendamentos",
  "/painel/veiculos/:id/manutencoes": "/painel/ajuda/veiculos/manutencoes",
  "/painel/veiculos/:id/checklist": "/painel/ajuda/veiculos/checklist",
  "/painel/veiculos/:id/abastecimentos": "/painel/ajuda/veiculos/abastecimentos",
  "/painel/veiculos/:id/infracoes": "/painel/ajuda/veiculos/infracoes",
  // Congressos: cada fase do evento tem o seu artigo.
  "/painel/representacao/congressos/:id/credenciamento": "/painel/ajuda/representacao/congressos-dia",
  "/painel/representacao/congressos/:id/porta": "/painel/ajuda/representacao/congressos-dia",
  "/painel/representacao/congressos/:id/sala": "/painel/ajuda/representacao/congressos-dia",
  "/painel/representacao/congressos/:id/telao": "/painel/ajuda/representacao/congressos-plenaria",
  "/painel/representacao/congressos/:id/grupos": "/painel/ajuda/representacao/congressos-relatoria",
  "/painel/representacao/congressos/:id/consolidacao": "/painel/ajuda/representacao/congressos-relatoria",
  "/painel/representacao/congressos/:id/propostas": "/painel/ajuda/representacao/congressos-relatoria",
  "/painel/representacao/congressos/:id/assistente": "/painel/ajuda/representacao/congressos-relatoria",
  "/painel/representacao/congressos/:id/plenaria": "/painel/ajuda/representacao/congressos-plenaria",
  "/painel/representacao/congressos/:id/mocoes": "/painel/ajuda/representacao/congressos-plenaria",
  "/painel/representacao/congressos/:id/resolucoes": "/painel/ajuda/representacao/congressos-encerramento",
  "/painel/representacao/congressos/:id/eleicao": "/painel/ajuda/representacao/congressos-encerramento",
  "/painel/representacao/congressos/:id/certificados": "/painel/ajuda/representacao/congressos-encerramento",
}

export type EntradaAjuda = [prefixo: string, href: string]

/**
 * Segmento `:id` casa com o identificador de um registro (uuid, número,
 * protocolo): qualquer segmento com algum dígito. Nome de rota não tem dígito,
 * então `/painel/filiados/:id` não engole `/painel/filiados/coletivas`.
 */
const SEGMENTO_ID = ":id"
const pareceId = (segmento: string) => /\d/.test(segmento)

/** Ordem de prioridade: mais segmentos primeiro; empate, mais segmentos fixos. */
function pesoDoPrefixo(prefixo: string): [number, number] {
  const segs = prefixo.split("/").filter(Boolean)
  return [segs.length, segs.filter((s) => s !== SEGMENTO_ID).length]
}

/** Pares (prefixo de rota, link do artigo), do prefixo mais específico ao mais geral. */
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
  return [...pares.entries()].sort((a, b) => {
    const [sa, fa] = pesoDoPrefixo(a[0])
    const [sb, fb] = pesoDoPrefixo(b[0])
    return sb - sa || fb - fa || b[0].length - a[0].length
  })
}

/** O caminho começa pelo prefixo (segmento a segmento; `:id` casa com identificador). */
function casaPrefixo(prefixo: string, pathname: string): boolean {
  const p = prefixo.split("/").filter(Boolean)
  const c = pathname.split("/").filter(Boolean)
  if (c.length < p.length) return false
  return p.every((seg, i) => (seg === SEGMENTO_ID ? pareceId(c[i]) : seg === c[i]))
}

/** Artigo da rota: o prefixo mais específico que casa (a home só casa exata). */
export function ajudaDaRota(mapa: EntradaAjuda[], pathname: string): string {
  for (const [prefixo, href] of mapa) {
    if (prefixo === "/painel") {
      if (pathname === "/painel") return href
      continue
    }
    if (casaPrefixo(prefixo, pathname)) return href
  }
  return "/painel/ajuda"
}
