import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { cpfConfiavel } from "@/lib/cpf"
import { esquemaAusente, hojeSP, lerEmLotes, texto } from "@/lib/db/comum"
import { CONDICAO_ATIVO } from "@/lib/db/filiacao-ativos"
import { avisarFiliado } from "@/lib/db/portal-avisos"
import { estadoDaParte, opcoesDaParte } from "@/lib/db/portal-partes"
import { type ContextoEmail } from "@/lib/email"
import { formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * AVISOS DA CONTRIBUIÇÃO (avaliação do portal, onda 2 — A20 e A102).
 *
 * - **Não localizada na remessa** (A20): quem paga em folha só descobria a
 *   falta abrindo "Minha contribuição". Aqui a mesma régua da página
 *   (`faltasRecentes` em carteirinha.ts) vira lista para a gestão conferir e,
 *   num segundo passo, aviso no sino e por e-mail. Nada dispara sozinho na
 *   importação: as remessas não são fechadas no sistema, e uma relação
 *   importada pela metade avisaria gente em dia.
 * - **Pix vencendo** (A102): lembrete alguns dias antes do vencimento da
 *   cobrança aberta (3 por padrão; Filiados › Área do associado › Contribuição
 *   muda ou desliga), para rodar num tick diário fora de requisição.
 *
 * Tudo recebe o ambiente (client, tenant, contexto do e-mail) como
 * `cobrancas.ts` e `avisarFiliado`: dentro da requisição, o padrão é o
 * tenant dela; num tick, quem chama passa o service client e o tenant da
 * volta do laço — e então todas as leituras filtram o tenant à mão.
 */

type Ambiente = { client?: SupabaseClient; tenantId?: string; contexto?: ContextoEmail }

async function ambiente(a: Ambiente) {
  return { client: a.client ?? (await createAdminClient()), tenantId: a.tenantId ?? (await tenantAtual()), contexto: a.contexto }
}

/** Link dos dois avisos: a página onde a pessoa vê a falta e o Pix em aberto. */
const LINK_CONTRIBUICAO = "/portal/contribuicao"

/** Quantos avisos saem ao mesmo tempo (cada um grava no sino e pode mandar e-mail). */
const AVISOS_EM_PARALELO = 5

/**
 * Teto de avisos por clique: cada um grava no sino e pode mandar e-mail, e a
 * ação tem tempo limitado. O que passar fica para o próximo clique — quem já
 * foi avisado não recebe de novo, então repetir continua de onde parou.
 */
export const AVISOS_POR_VEZ = 150

/** As competências que "Minha contribuição" confere (`faltasRecentes`, carteirinha.ts). */
const JANELA_COMPETENCIAS = 6

/** MM/AAAA de uma competência AAAAMM. */
function rotuloOrdem(ordem: number): string {
  return `${String(ordem % 100).padStart(2, "0")}/${Math.floor(ordem / 100)}`
}

/** Competência AAAAMM de uma data ISO (AAAA-MM-DD…). */
function ordemDaData(data: string): number {
  return Number(data.slice(0, 4)) * 100 + Number(data.slice(5, 7))
}

/** MM/AAAA de uma competência AAAA-MM (a das cobranças). */
function rotuloCompetencia(c: string): string {
  return `${c.slice(5, 7)}/${c.slice(0, 4)}`
}

/** "a, b e c" */
function juntar(itens: string[]): string {
  return itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`
}

async function emParalelo<T, R>(itens: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = []
  for (let i = 0; i < itens.length; i += AVISOS_EM_PARALELO) {
    saida.push(...(await Promise.all(itens.slice(i, i + AVISOS_EM_PARALELO).map(fn))))
  }
  return saida
}

/**
 * `cpf|texto` dos avisos de contribuição já gravados cujo texto começa por
 * `prefixo` — para separar "já avisado" de "não gravou" sem depender do
 * `false` de `avisarFiliado` (que diz as duas coisas). Lê só os avisos do
 * mesmo assunto, nunca o histórico inteiro. Sem a tabela, vazio (não há aviso
 * algum); outro erro sobe — na falta da remessa, o `umaVez` só barra o texto
 * idêntico, e o nome das fontes pode ter mudado desde o primeiro aviso.
 */
async function avisosJaDados(
  client: SupabaseClient,
  tenantId: string,
  prefixo: string,
  desde?: string
): Promise<Set<string>> {
  try {
    const linhas = await lerEmLotes<{ cpf: string; texto: string }>((de, ate) => {
      let q = client
        .from("portal_avisos")
        .select("id, cpf, texto")
        .eq("emp_proprietaria_id", tenantId)
        .eq("evento", "contribuicao")
        .eq("link", LINK_CONTRIBUICAO)
        .like("texto", `${prefixo}%`)
      if (desde) q = q.gte("created_at", desde)
      return q.order("id").range(de, ate)
    })
    return new Set(linhas.map((l) => `${l.cpf}|${l.texto}`))
  } catch (e) {
    if (esquemaAusente(e as { code?: string })) return new Set()
    throw e
  }
}

// ── A20: contribuição não localizada na remessa ──────────────────────────────

/** Por que a pessoa em falta não recebe o aviso agora (null = recebe). */
export type MotivoSemAviso = "sem_cpf" | "ja_avisado" | "suspensao"

export type FaltaNaRemessa = {
  /** O cadastro ativo da pessoa (para o link da ficha no painel). */
  filiacaoId: string
  /** null = cadastro sem CPF válido: aparece na conferência, mas não dá para avisar. */
  cpf: string | null
  nome: string | null
  matricula: string | null
  /** E-mail de contato pela regra de `contatoDoFiliado` (poupa a busca no aviso). */
  email: string | null
  /** Fontes que mandaram a remessa e por onde a contribuição dela deveria ter vindo. */
  fontes: string[]
  semAviso: MotivoSemAviso | null
}

export type ConferenciaFaltas = {
  remessaId: string
  /** MM/AAAA */
  competencia: string
  /** Por que a conferência não vale para esta remessa (tipo, competência em curso ou antiga). */
  naoSeAplica: string | null
  /** Fontes com linhas na remessa — as únicas conferidas. */
  fontesConferidas: number
  /** Ativos sem contribuição nesta competência, por nome. */
  emFalta: FaltaNaRemessa[]
  /** Ativos que pagam por Pix e ficaram fora (o caso deles é cobrança). */
  porPix: number
}

type Cadastro = {
  id: string
  cpf: string | null
  nome_completo: string | null
  matricula_sindical: string | null
  filiacao_condicao: string | null
  filiacao_excluida: boolean | null
  anonimizada_em: string | null
  forma_recebimento: string | null
  mesclado_em: string | null
  email_pessoal: string | null
  email_corporativo: string | null
  updated_at: string | null
}

/** A régua de filiacao-ativos.ts: condição Ativo, fora dos excluídos e dos anonimizados. */
function cadastroAtivo(c: Cadastro): boolean {
  return c.filiacao_condicao === CONDICAO_ATIVO && c.filiacao_excluida !== true && !c.anonimizada_em
}

/** O começo fixo do aviso de falta: com a competência, é o que faz dele "uma vez por pessoa e remessa". */
function prefixoFalta(competencia: string): string {
  return `Não encontramos sua contribuição de ${competencia} na remessa`
}

function textoFalta(competencia: string, fontes: string[]): string {
  // Mesma frase da página ("a remessa de 09/2026 da fonte pagadora X"): o nome
  // da fonte vem depois de "fonte pagadora", sem errar o gênero ("da INSS").
  const daFonte =
    fontes.length === 0
      ? "da sua fonte pagadora"
      : `${fontes.length === 1 ? "da fonte pagadora" : "das fontes pagadoras"} ${juntar(fontes)}`
  return `${prefixoFalta(competencia)} ${daFonte}. Se o desconto apareceu no seu contracheque, avise o sindicato.`
}

/**
 * Quem está em falta na remessa — só lê. A régua é a de "Minha contribuição"
 * (`faltasRecentes`, carteirinha.ts), aplicada à entidade inteira:
 *
 * - só remessa Associativa de competência já vencida e dentro das 6 mais
 *   recentes — a janela em que a página aponta falta (a do mês chega depois
 *   da folha; a baixa de um Pix cria a remessa adiantada);
 * - só as fontes pagadoras que têm linhas NESTA remessa — fonte que ainda não
 *   mandou é "ainda não chegou", não falta;
 * - a pessoa (pelo CPF, que junta os cadastros dela) precisa ter um cadastro
 *   ATIVO com vínculo aberto numa dessas fontes, iniciado ANTES da
 *   competência (a remessa do mês da filiação não é falta de ninguém);
 * - não pode constar em nenhuma remessa associativa da competência — pelo
 *   `filiado_id` de qualquer cadastro dela ou, na falta dele, pelo CPF da
 *   linha (na dúvida, conta como presente: menos aviso, nunca alarme falso);
 * - quem paga por Pix fica fora: a falta dele é a cobrança vencida.
 *
 * Mais conservadora que a página em dois pontos, porque aqui o resultado vira
 * aviso: só conta o vínculo de um cadastro ATIVO (o de um registro antigo que
 * ficou aberto não diz por onde a pessoa paga hoje), e quem tem efeito
 * suspensivo vigente na inadimplência (a gestão já sabe por que ela não está
 * na remessa) aparece na lista, mas não é avisado. Também marca quem já
 * recebeu o aviso desta competência.
 *
 * Lê tudo em lotes: o PostgREST corta em 1.000 linhas.
 */
export async function conferirFaltasDaRemessa(remessaId: string, amb: Ambiente = {}): Promise<ConferenciaFaltas | { erro: string }> {
  const { client, tenantId } = await ambiente(amb)
  const { data: remessa, error: eRem } = await client
    .from("filiacao_recebe_remessa")
    .select("id, tipo, ordem")
    .eq("id", remessaId)
    .eq("emp_proprietaria_id", tenantId)
    .maybeSingle()
  if (eRem) return { erro: `Não foi possível ler a remessa: ${eRem.message}` }
  if (!remessa) return { erro: "Remessa não encontrada." }
  const ordem = remessa.ordem === null || remessa.ordem === undefined ? null : Number(remessa.ordem)
  const base: ConferenciaFaltas = {
    remessaId,
    competencia: ordem ? rotuloOrdem(ordem) : "—",
    naoSeAplica: null,
    fontesConferidas: 0,
    emFalta: [],
    porPix: 0,
  }
  if (remessa.tipo !== "Associativa") {
    return { ...base, naoSeAplica: "A conferência vale para remessas associativas — é por elas que a contribuição do filiado chega." }
  }
  if (!ordem) return { ...base, naoSeAplica: "A remessa não tem competência (mês e ano) definida." }
  const hoje = hojeSP()
  const ordemHoje = ordemDaData(hoje)
  if (ordem >= ordemHoje) {
    return { ...base, naoSeAplica: `A competência ${rotuloOrdem(ordem)} ainda não terminou — o desconto do mês só chega depois da folha.` }
  }

  try {
    // A janela da página: as 6 competências associativas vencidas mais recentes.
    const { data: recentes, error: eRec } = await client
      .from("filiacao_recebe_remessa")
      .select("id, ordem")
      .eq("emp_proprietaria_id", tenantId)
      .eq("tipo", "Associativa")
      .not("ordem", "is", null)
      .lt("ordem", ordemHoje)
      .order("ordem", { ascending: false })
      .order("id", { ascending: true })
      .limit(40)
    if (eRec) throw new Error(eRec.message)
    const janela = [...new Set((recentes ?? []).map((r) => Number(r.ordem)))].slice(0, JANELA_COMPETENCIAS)
    if (!janela.includes(ordem)) {
      return {
        ...base,
        naoSeAplica: `O portal só aponta faltas nas ${JANELA_COMPETENCIAS} competências mais recentes (${janela.map(rotuloOrdem).join(", ")}) — avisar sobre ${rotuloOrdem(ordem)} agora confundiria mais do que ajudaria.`,
      }
    }

    // Remessas associativas da mesma competência (a das fontes e a do Pix):
    // constar em qualquer uma delas é ter pago o mês.
    const { data: daOrdem, error: eOrdem } = await client
      .from("filiacao_recebe_remessa")
      .select("id")
      .eq("emp_proprietaria_id", tenantId)
      .eq("ordem", ordem)
      .or("tipo.eq.Associativa,tipo.is.null")
    if (eOrdem) throw new Error(eOrdem.message)
    const idsDaOrdem = [...new Set([remessaId, ...(daOrdem ?? []).map((r) => String(r.id))])]

    // Uma remessa por vez, pelo índice (como `lancamentosDaRemessa`, receitas.ts):
    // ordenar por remessa_id primeiro evita a varredura da PK; com o cache
    // frio o primeiro lote pode estourar o tempo — repetir aquece.
    type Linha = { remessa_id: string; filiado_id: string | null; fonte_pg_id: string | null; cpf: string | null }
    const linhas: Linha[] = []
    for (const rid of idsDaOrdem) {
      linhas.push(
        ...(await lerEmLotes<Linha>(async (de, ate) => {
          for (let tentativa = 1; ; tentativa++) {
            const r = await client
              .from("filiacao_recebe")
              .select("id, remessa_id, filiado_id, fonte_pg_id, cpf")
              .eq("remessa_id", rid)
              .eq("emp_proprietaria_id", tenantId)
              .order("remessa_id", { ascending: true })
              .order("id", { ascending: true })
              .range(de, ate)
            if (!r.error || tentativa >= 3 || !r.error.message.includes("timeout")) return r
          }
        }))
      )
    }

    const fontes = [...new Set(linhas.filter((l) => l.remessa_id === remessaId).map((l) => texto(l.fonte_pg_id)).filter((v): v is string => !!v))]
    // Sem fonte nas linhas não há com quem comparar — não é "ninguém em falta".
    if (fontes.length === 0) {
      return { ...base, naoSeAplica: "A remessa ainda não tem lançamentos com fonte pagadora: não há com quem comparar." }
    }

    // Vínculos em aberto nas fontes que mandaram a remessa.
    type Vinculo = { filiado_id: string; fonte_pagadora_id: string; data_filiacao: string | null; filiacao_data_adesao: string | null }
    const vinculos: Vinculo[] = []
    for (let i = 0; i < fontes.length; i += 100) {
      const fatia = fontes.slice(i, i + 100)
      vinculos.push(
        ...(await lerEmLotes<Vinculo>((de, ate) =>
          client
            .from("filiacao_vinculos")
            .select("id, filiado_id, fonte_pagadora_id, data_filiacao, filiacao_data_adesao")
            .eq("emp_proprietaria_id", tenantId)
            .in("fonte_pagadora_id", fatia)
            .not("filiado_id", "is", null)
            .is("data_desfiliacao", null)
            .is("filiacao_data_saida", null)
            .order("id")
            .range(de, ate)
        ))
      )
    }

    // Todos os cadastros, inclusive excluídos: a linha da remessa pode estar
    // pendurada em qualquer registro da pessoa (mesmo mapa da inadimplência).
    const cadastros = await lerEmLotes<Cadastro>((de, ate) =>
      client
        .from("filiacoes")
        .select(
          "id, cpf, nome_completo, matricula_sindical, filiacao_condicao, filiacao_excluida, anonimizada_em, forma_recebimento, mesclado_em, email_pessoal, email_corporativo, updated_at"
        )
        .eq("emp_proprietaria_id", tenantId)
        .order("id")
        .range(de, ate)
    )
    const porId = new Map(cadastros.map((c) => [String(c.id), c]))
    // A pessoa é o CPF válido; sem ele (CPF "0" juntaria centenas), o próprio cadastro.
    const chaveDe = (c: Cadastro) => cpfConfiavel(c.cpf) ?? `id:${c.id}`
    const registrosPorChave = new Map<string, Cadastro[]>()
    for (const c of cadastros) {
      const k = chaveDe(c)
      registrosPorChave.set(k, [...(registrosPorChave.get(k) ?? []), c])
    }

    const presentes = new Set<string>()
    for (const l of linhas) {
      const c = l.filiado_id ? porId.get(String(l.filiado_id)) : undefined
      if (c) presentes.add(chaveDe(c))
      const cpfLinha = cpfConfiavel(l.cpf)
      if (cpfLinha) presentes.add(cpfLinha)
    }

    // Pessoa → fonte → competência em que o vínculo começou (null = sem data:
    // na dúvida, a fonte vale desde sempre, como em `fontesAbertas`).
    const fontesDaPessoa = new Map<string, Map<string, number | null>>()
    for (const v of vinculos) {
      const c = porId.get(String(v.filiado_id))
      if (!c || !cadastroAtivo(c)) continue
      const k = chaveDe(c)
      const inicio = texto(v.data_filiacao) ?? texto(v.filiacao_data_adesao)
      const desde = inicio ? ordemDaData(inicio) : null
      const mapa = fontesDaPessoa.get(k) ?? new Map<string, number | null>()
      const fonte = String(v.fonte_pagadora_id)
      if (!mapa.has(fonte)) mapa.set(fonte, desde)
      else {
        const atual = mapa.get(fonte) ?? null
        mapa.set(fonte, atual === null || desde === null ? null : Math.min(atual, desde))
      }
      fontesDaPessoa.set(k, mapa)
    }

    // Efeito suspensivo vigente na inadimplência (todas as remessas ou a Associativa), por CPF.
    type Suspensao = { cpf: string | null; alvo: string | null; vigencia_ate: string | null }
    let suspensas: Suspensao[] = []
    try {
      suspensas = await lerEmLotes<Suspensao>((de, ate) =>
        client
          .from("filiacao_suspensoes")
          .select("id, cpf, alvo, vigencia_ate")
          .eq("emp_proprietaria_id", tenantId)
          .eq("escopo", "inadimplencia")
          .is("revogada_em", null)
          .order("id")
          .range(de, ate)
      )
    } catch (e) {
      // Sem a tabela não há suspensão; outro erro não pode virar aviso indevido.
      if (!esquemaAusente(e as { code?: string })) throw e
    }
    const comSuspensao = new Set(
      suspensas
        .filter((s) => (!s.vigencia_ate || s.vigencia_ate >= hoje) && (s.alvo === null || s.alvo === remessa.tipo))
        .map((s) => cpfConfiavel(s.cpf))
        .filter((c): c is string => !!c)
    )

    const competencia = rotuloOrdem(ordem)
    const jaAvisados = await avisosJaDados(client, tenantId, prefixoFalta(competencia))
    const cpfsJaAvisados = new Set([...jaAvisados].map((x) => x.slice(0, x.indexOf("|"))))

    const { data: emp } = await client.from("empresa").select("id, nome_fantasia, nome_razao").in("id", fontes)
    // Sem espaço nas pontas: o nome entra no meio da frase do aviso ("…PETROBRAS . Se…").
    const nomeFonte = new Map((emp ?? []).map((e) => [String(e.id), (texto(e.nome_fantasia) ?? texto(e.nome_razao))?.trim() ?? null]))

    let porPix = 0
    const emFalta: FaltaNaRemessa[] = []
    for (const [k, mapa] of fontesDaPessoa) {
      const registros = registrosPorChave.get(k) ?? []
      // Mesma régua da página e das cobranças: cadastro Ativo com forma pix, fora dos mesclados.
      if (registros.some((r) => r.filiacao_excluida !== true && r.forma_recebimento === "pix" && r.filiacao_condicao === CONDICAO_ATIVO && !r.mesclado_em)) {
        porPix++
        continue
      }
      if (presentes.has(k)) continue
      const devidas = [...mapa].filter(([, desde]) => desde === null || ordem > desde).map(([fonte]) => fonte)
      if (devidas.length === 0) continue

      const ativos = registros.filter(cadastroAtivo)
      // Contato pela regra de `contatoDoFiliado`: não excluídos, do mais recente para o mais antigo.
      const recentes = registros
        .filter((r) => r.filiacao_excluida !== true)
        .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
      const principal = ativos.find((r) => texto(r.nome_completo)) ?? ativos[0]
      const cpf = k.startsWith("id:") ? null : k
      emFalta.push({
        filiacaoId: String(principal.id),
        cpf,
        nome: texto(principal.nome_completo) ?? recentes.map((r) => texto(r.nome_completo)).find(Boolean) ?? null,
        matricula: texto(principal.matricula_sindical),
        email: recentes.map((r) => texto(r.email_pessoal) ?? texto(r.email_corporativo)).find(Boolean)?.trim() ?? null,
        fontes: [...new Set(devidas.map((f) => nomeFonte.get(f)).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b, "pt-BR")),
        semAviso: !cpf ? "sem_cpf" : comSuspensao.has(cpf) ? "suspensao" : cpfsJaAvisados.has(cpf) ? "ja_avisado" : null,
      })
    }
    emFalta.sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))
    return { ...base, fontesConferidas: fontes.length, emFalta, porPix }
  } catch (e) {
    return { erro: `Não foi possível conferir a remessa: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export type ResultadoAvisoFaltas = {
  competencia: string
  /** Em falta (todos, inclusive os que não recebem aviso). */
  emFalta: number
  /** Avisos gravados agora (sino). */
  avisados: number
  /** Desses, quantos o provedor de e-mail aceitou. */
  porEmail: number
  /** Já tinham recebido o aviso desta competência: não recebem de novo. */
  jaAvisados: number
  /** Sem CPF válido no cadastro: o aviso do portal é pelo CPF. */
  semCpf: number
  /** Com efeito suspensivo vigente na inadimplência: ficam fora. */
  comSuspensao: number
  /** Não gravou (tabela ausente, erro ou repetido no meio do caminho). */
  falhas: number
  /** Ficaram para o próximo clique (teto por vez). */
  restantes: number
  /** A conferência usada, com quem acabou de ser avisado marcado como tal. */
  conferencia: ConferenciaFaltas
}

/**
 * Avisa quem está em falta na remessa (a mesma conferência de
 * `conferirFaltasDaRemessa`, refeita na hora — a lista pode ter mudado desde
 * a tela): sino sempre, e-mail conforme a preferência do evento
 * "contribuicao". Uma vez por pessoa e competência; no máximo
 * `AVISOS_POR_VEZ` por chamada (repetir continua de onde parou).
 */
export async function avisarFaltasDaRemessa(remessaId: string, amb: Ambiente = {}): Promise<ResultadoAvisoFaltas | { erro: string }> {
  const { client, tenantId, contexto } = await ambiente(amb)
  // O aviso leva a "Minha contribuição": com a parte desabilitada no portal,
  // avisarFiliado descartaria um a um e a tela contaria tudo como falha.
  const parte = await estadoDaParte("contribuicao", amb.client || amb.tenantId ? { client, tenantId } : undefined).catch(
    () => "habilitada"
  )
  if (parte === "desabilitada") {
    return {
      erro: "A Contribuição está desabilitada em Filiados › Área do associado: o aviso levaria a uma página que o associado não vê. Habilite a parte para avisar.",
    }
  }
  const conferencia = await conferirFaltasDaRemessa(remessaId, { client, tenantId })
  if ("erro" in conferencia) return conferencia
  if (conferencia.naoSeAplica) return { erro: conferencia.naoSeAplica }

  const { competencia, emFalta } = conferencia
  const avisaveis = emFalta.filter((f): f is FaltaNaRemessa & { cpf: string } => f.semAviso === null && !!f.cpf)
  const agora = avisaveis.slice(0, AVISOS_POR_VEZ)

  const resultados = await emParalelo(agora, (f) =>
    avisarFiliado(
      {
        cpf: f.cpf,
        nome: f.nome,
        email: f.email,
        evento: "contribuicao",
        assunto: `Sua contribuição de ${competencia} não foi localizada`,
        texto: textoFalta(competencia, f.fontes),
        link: LINK_CONTRIBUICAO,
        umaVez: true,
      },
      { client, tenantId, contexto }
    )
  )
  const avisadosAgora = new Set(agora.filter((_, i) => resultados[i]).map((f) => f.cpf))
  const conta = (m: MotivoSemAviso) => emFalta.filter((f) => f.semAviso === m).length
  return {
    competencia,
    emFalta: emFalta.length,
    avisados: avisadosAgora.size,
    porEmail: resultados.filter((r) => r === "email").length,
    jaAvisados: conta("ja_avisado"),
    semCpf: conta("sem_cpf"),
    comSuspensao: conta("suspensao"),
    falhas: resultados.filter((r) => r === false).length,
    restantes: avisaveis.length - agora.length,
    conferencia: {
      ...conferencia,
      emFalta: emFalta.map((f) => (f.cpf && avisadosAgora.has(f.cpf) ? { ...f, semAviso: "ja_avisado" as const } : f)),
    },
  }
}

// ── A102: lembrete do Pix perto do vencimento ────────────────────────────────

/**
 * Dias antes do vencimento em que sai o lembrete, quando a entidade não
 * escolheu outro (Área do associado › Contribuição › "Lembrete do Pix antes
 * do vencimento"; 0 desliga).
 */
const DIAS_ANTES_DO_VENCIMENTO = 3

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export type ResultadoLembretesPix = {
  /** Cobranças abertas na janela do lembrete. */
  vencendo: number
  avisados: number
  porEmail: number
  /** Já tinham o lembrete desta cobrança (ou de outra igual da mesma pessoa). */
  jaAvisados: number
  /** Pulados: sem CPF válido, cadastro que não paga mais por Pix ou cobrança recém-gerada. */
  pulados: number
  falhas: number
  erro?: string
}

/**
 * Lembrete do Pix (A102), para o tick diário — roda FORA de requisição:
 * passe o service client, o tenant da volta do laço e o contexto do e-mail
 * (`contextoDoTenant`), como no tick das cobranças. O contexto é obrigatório:
 * sem ele o e-mail tiraria entidade e origem da requisição (achado A19).
 * Idempotente: o texto
 * nomeia competência, valor e vencimento, e `umaVez` não o repete — rodar
 * duas vezes no dia (ou todo dia da janela) avisa uma vez por cobrança.
 *
 * A janela vai de hoje até N dias à frente (`lembrete_pix_dias` da
 * Contribuição na Área do associado, lido com o client e o tenant recebidos;
 * 3 por padrão, 0 não lembra): se o tick falhar num dia, o do dia seguinte
 * ainda lembra. Ficam de fora a cobrança gerada há menos de dois
 * dias (o aviso "disponível para pagamento" acabou de sair com a mesma data)
 * e a de quem já não está na régua da geração (Ativo, forma pix, não
 * excluído nem mesclado): para esses, quem resolve é a equipe.
 */
export async function lembretesPixVencendo(amb: { client: SupabaseClient; tenantId: string; contexto: ContextoEmail }): Promise<ResultadoLembretesPix> {
  const { client, tenantId, contexto } = amb
  const vazio: ResultadoLembretesPix = { vencendo: 0, avisados: 0, porEmail: 0, jaAvisados: 0, pulados: 0, falhas: 0 }
  const diasAntes = await opcoesDaParte("contribuicao", { client, tenantId })
    .then((o) => o.lembrete_pix_dias)
    .catch(() => DIAS_ANTES_DO_VENCIMENTO)
  if (diasAntes <= 0) return vazio
  const hoje = hojeSP()
  type Linha = {
    id: string
    cpf: string | null
    competencia: string
    valor: number
    vencimento: string
    created_at: string | null
    filiacao: unknown
  }
  type Pessoa = {
    cpf?: string | null
    nome_completo?: string | null
    email_pessoal?: string | null
    email_corporativo?: string | null
    filiacao_condicao?: string | null
    filiacao_excluida?: boolean | null
    forma_recebimento?: string | null
    mesclado_em?: string | null
  }
  let cobrancas: Linha[]
  try {
    cobrancas = await lerEmLotes<Linha>((de, ate) =>
      client
        .from("filiacao_cobrancas")
        .select(
          "id, cpf, competencia, valor, vencimento, created_at, filiacao:filiacao_id (cpf, nome_completo, email_pessoal, email_corporativo, filiacao_condicao, filiacao_excluida, forma_recebimento, mesclado_em)"
        )
        .eq("emp_proprietaria_id", tenantId)
        .eq("situacao", "aberta")
        .gte("vencimento", hoje)
        .lte("vencimento", somarDias(hoje, diasAntes))
        .order("id")
        .range(de, ate)
    )
  } catch (e) {
    const erro = e as { code?: string; message?: string }
    return { ...vazio, erro: esquemaAusente(erro) ? "sem tabela de cobranças" : (erro.message ?? "erro ao ler as cobranças") }
  }
  if (cobrancas.length === 0) return vazio

  const recem = Date.now() - 2 * 24 * 60 * 60 * 1000
  const lembretes: { cpf: string; nome: string | null; email: string | null; texto: string; assunto: string }[] = []
  let pulados = 0
  for (const c of cobrancas) {
    const f = (Array.isArray(c.filiacao) ? c.filiacao[0] : c.filiacao) as Pessoa | null
    const cpf = cpfConfiavel(f?.cpf) ?? cpfConfiavel(c.cpf)
    const criada = c.created_at ? Date.parse(c.created_at) : Number.NaN
    const naRegua =
      !!f && f.filiacao_condicao === CONDICAO_ATIVO && f.filiacao_excluida !== true && f.forma_recebimento === "pix" && !f.mesclado_em
    if (!cpf || !naRegua || (Number.isFinite(criada) && criada > recem)) {
      pulados++
      continue
    }
    const competencia = rotuloCompetencia(String(c.competencia))
    const vence = String(c.vencimento).slice(0, 10)
    const ddmm = `${vence.slice(8, 10)}/${vence.slice(5, 7)}`
    lembretes.push({
      cpf,
      nome: texto(f.nome_completo),
      email: (texto(f.email_pessoal) ?? texto(f.email_corporativo))?.trim() ?? null,
      assunto: `Sua contribuição de ${competencia} vence em ${ddmm}`,
      texto: `Sua contribuição de ${competencia} (${formatarMoeda(Number(c.valor))}) vence em ${ddmm} — pague por Pix no portal.`,
    })
  }

  // Um lembrete anterior da mesma cobrança só pode ter saído dentro da janela.
  // A cobrança é por cadastro: quem tem dois cadastros Pix ativos pode ter
  // duas com o mesmo texto, e os dois avisos sairiam juntos no mesmo bloco
  // (o `umaVez` só enxerga o que já foi gravado) — o Set junta as duas.
  // Aqui a leitura é só atalho: o texto é único por cobrança, e o `umaVez`
  // barra a repetição mesmo sem ela.
  const ja = await avisosJaDados(client, tenantId, "Sua contribuição de ", `${somarDias(hoje, -(diasAntes + 2))}T00:00:00Z`).catch(
    () => new Set<string>()
  )
  const vistos = new Set<string>()
  const novos = lembretes.filter((l) => {
    const chave = `${l.cpf}|${l.texto}`
    if (ja.has(chave) || vistos.has(chave)) return false
    vistos.add(chave)
    return true
  })
  const resultados = await emParalelo(novos, (l) =>
    avisarFiliado(
      { cpf: l.cpf, nome: l.nome, email: l.email, evento: "contribuicao", assunto: l.assunto, texto: l.texto, link: LINK_CONTRIBUICAO, umaVez: true },
      { client, tenantId, contexto }
    )
  )
  return {
    vencendo: cobrancas.length,
    avisados: resultados.filter(Boolean).length,
    porEmail: resultados.filter((r) => r === "email").length,
    jaAvisados: lembretes.length - novos.length,
    pulados,
    falhas: resultados.filter((r) => r === false).length,
  }
}
