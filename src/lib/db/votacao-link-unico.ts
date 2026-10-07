import "server-only"

import { cache } from "react"

import { derivarModalidade, horaCurta } from "@/lib/assembleias-constantes"
import { limparCpf, validarCpf } from "@/lib/cpf"
import { colunasHorario, colunasSala, janelaDaAssembleia, situacaoDaAssembleia } from "@/lib/db/assembleias-horarios"
import { escopoAptos, filtroAptos } from "@/lib/db/votacao-escopo"
import { elegibilidadePorLink } from "@/lib/db/votacao-portal"
import {
  MARCA_NAO_RECONHECE,
  nascimentoValido,
  nomeCobreLista,
  nomesConferem,
  temSobrenome,
} from "@/lib/db/votacao-primeiro-acesso"
import { enviarEmail } from "@/lib/email"
import { caixaAviso, escaparHtml, paragrafo, textoSuave, tituloEmail } from "@/lib/email-layout"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * LINK ÚNICO DE VOTAÇÃO (07/10/2026) — a página /votar, com todas as votações
 * online em andamento e futuras da entidade.
 *
 * Para quem: o trabalhador que não recebe o e-mail corporativo (os gateways
 * das empregadoras barram nossas mensagens). Ele confirma um e-mail que
 * recebe — de preferência pessoal — e se vincula ao seu registro na lista de
 * aptos pelos dados: nome completo, e-mail da empresa, CPF e nascimento.
 *
 * A diferença para o primeiro acesso do link pessoal: lá o e-mail corporativo
 * é PROVADO (o link chegou na caixa); aqui ele é só digitado. Por isso:
 *  • o nome precisa trazer todos os pedaços do nome da lista (nomeCobreLista),
 *    ou bater com a ficha de filiado do CPF (nome + nascimento);
 *  • lista sem nome completo não vincula — a pessoa procura o sindicato;
 *  • apto já vinculado a outro e-mail não troca de dono;
 *  • o e-mail corporativo recebe um alerta de que o cadastro foi feito;
 *  • o apto fica marcado `cadastro_canal = 'link_unico'` para a comissão.
 * Daí em diante o voto segue o caminho do link pessoal (sessão por apto):
 * cédula, voto secreto, voto único e comprovante são os mesmos.
 */

export const CANAL_LINK_UNICO = "link_unico"

/** As colunas do vínculo (supabase/votacao-link-unico.sql) existem? */
export const temColunasLinkUnico = cache(async (): Promise<boolean> => {
  const admin = await createAdminClient()
  const { error } = await admin.from("voto_assembleias_aptos").select("email_contato").limit(1)
  return !error
})

export type VotacaoAberta = {
  assembleiaId: string
  nome: string | null
  rodadaId: string
  rodadaNome: string | null
  tema: string | null
  empregador: string | null
  /** Momentos (ISO) da janela de votação. */
  inicio: string | null
  termino: string | null
  situacao: "aberta" | "antes"
  /** Pleito interno: só filiados, pela área do filiado. */
  somenteFiliados: boolean
  sala: { link: string; data: string | null; hora: string | null } | null
}

function txt(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

/** Valor entre aspas para filtro do PostgREST (e-mail pode ter "+" ou "."). */
function aspas(v: string): string {
  return `"${v.replace(/"/g, "")}"`
}

function hojeSP(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
}

/** As votações com voto online, em andamento ou futuras, da entidade. */
export const votacoesAbertas = cache(async (): Promise<VotacaoAberta[]> => {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: rodadas } = await admin
    .from("voto_rod_assembleias")
    .select("id, nome_assembleia, termino, empresa_id, campanha_id, apuracao_encerrada")
    .eq("emp_proprietaria_id", emp)
    .gte("termino", hojeSP())
  const vivas = (rodadas ?? []).filter((r) => r.apuracao_encerrada !== true)
  if (vivas.length === 0) return []

  const { data: brutas } = await admin
    .from("voto_assembleias")
    .select(
      "id, nome_assembleia, online, urnas_de_votacao, somente_filiados, data_inicio, data_termino, periodo_inicio, periodo_termino, apuracao_encerrada, empresa_id, campanha_id, rod_assembleia_id" +
        (await colunasHorario()) +
        (await colunasSala())
    )
    .eq("emp_proprietaria_id", emp)
    .in(
      "rod_assembleia_id",
      vivas.map((r) => r.id)
    )
    .eq("online", true)
  const assembleias = ((brutas ?? []) as unknown as Record<string, unknown>[]).filter(
    (a) => a.apuracao_encerrada !== true
  )
  if (assembleias.length === 0) return []

  const rodadaPor = new Map(vivas.map((r) => [String(r.id), r]))
  const empresaIds = [
    ...new Set(
      assembleias
        .map((a) => txt(a.empresa_id) ?? txt(rodadaPor.get(String(a.rod_assembleia_id))?.empresa_id))
        .filter((v): v is string => Boolean(v))
    ),
  ]
  const campanhaIds = [
    ...new Set(
      assembleias
        .map((a) => txt(a.campanha_id) ?? txt(rodadaPor.get(String(a.rod_assembleia_id))?.campanha_id))
        .filter((v): v is string => Boolean(v))
    ),
  ]
  const [empresas, campanhas] = await Promise.all([
    empresaIds.length
      ? admin.from("empresa").select("id, nome_fantasia, nome_razao").in("id", empresaIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    campanhaIds.length
      ? admin.from("voto_campanha").select("id, tema").in("id", campanhaIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])
  const nomeEmpresa = new Map(
    (empresas.data ?? []).map((e) => [String(e.id), txt(e.nome_fantasia) ?? txt(e.nome_razao)])
  )
  const temaCampanha = new Map((campanhas.data ?? []).map((c) => [String(c.id), txt(c.tema)]))

  const lista: VotacaoAberta[] = []
  for (const a of assembleias) {
    const rod = rodadaPor.get(String(a.rod_assembleia_id))
    if (!rod) continue
    const fonte = {
      data_inicio: txt(a.data_inicio) ?? txt(a.periodo_inicio),
      hora_inicio: txt(a.hora_inicio),
      data_termino: txt(a.data_termino) ?? txt(a.periodo_termino),
      hora_termino: txt(a.hora_termino),
    }
    const terminoRodada = txt(rod.termino)
    const situacao = situacaoDaAssembleia(fonte, terminoRodada)
    if (situacao === "encerrada") continue
    if (derivarModalidade(a) !== "online" && derivarModalidade(a) !== "hibrida") continue
    const janela = janelaDaAssembleia(fonte, terminoRodada)
    const empId = txt(a.empresa_id) ?? txt(rod.empresa_id)
    const campId = txt(a.campanha_id) ?? txt(rod.campanha_id)
    const salaLink = txt(a.sala_link)
    lista.push({
      assembleiaId: String(a.id),
      nome: txt(a.nome_assembleia),
      rodadaId: String(rod.id),
      rodadaNome: txt(rod.nome_assembleia),
      tema: campId ? (temaCampanha.get(campId) ?? null) : null,
      empregador: empId ? (nomeEmpresa.get(empId) ?? null) : null,
      inicio: janela.inicio === null ? null : new Date(janela.inicio).toISOString(),
      termino: janela.termino === null ? null : new Date(janela.termino).toISOString(),
      situacao,
      somenteFiliados: a.somente_filiados === true,
      sala: salaLink ? { link: salaLink, data: txt(a.sala_data), hora: horaCurta(txt(a.sala_hora)) } : null,
    })
  }
  return lista.sort((x, y) => (x.inicio ?? "").localeCompare(y.inicio ?? ""))
})

export type VinculoDaSessao = {
  aptoId: string
  jaVotou: boolean
  /** Elegível agora pela lista (null = não pode votar nesta assembleia). */
  elegivel: boolean
}

/**
 * O apto de quem está na sessão, em cada votação aberta: pelo e-mail
 * confirmado no link único (`email_contato`), pelo e-mail corporativo da
 * própria sessão (quando ele chegou) ou pelo CPF da conta de filiado.
 */
export async function vinculosDaSessao(
  sessao: { email: string | null; cpf: string | null },
  votacoes: VotacaoAberta[]
): Promise<Map<string, VinculoDaSessao>> {
  const mapa = new Map<string, VinculoDaSessao>()
  const email = sessao.email?.trim().toLowerCase() ?? null
  if (!email && !sessao.cpf) return mapa
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const comContato = await temColunasLinkUnico()
  const filtros = [
    ...(email ? [`email_corporativo.eq.${aspas(email)}`] : []),
    ...(email && comContato ? [`email_contato.eq.${aspas(email)}`] : []),
    ...(sessao.cpf ? [`cpf.eq.${aspas(sessao.cpf)}`] : []),
  ]
  for (const v of votacoes) {
    const { data } = await admin
      .from("voto_assembleias_aptos")
      .select("id, conflito_motivo")
      .eq("emp_proprietaria_id", emp)
      .or(filtroAptos(await escopoAptos(v.assembleiaId), filtros))
      .limit(5)
    const apto = (data ?? []).find((a) => a.conflito_motivo !== MARCA_NAO_RECONHECE)
    if (!apto) continue
    const eleg = await elegibilidadePorLink(String(apto.id), v.assembleiaId)
    mapa.set(v.assembleiaId, {
      aptoId: String(apto.id),
      jaVotou: Boolean(eleg?.jaVotou),
      elegivel: Boolean(eleg),
    })
  }
  return mapa
}

type AptoCandidato = {
  id: string
  cpf: string | null
  nome_completo: string | null
  email_corporativo: string | null
  email_contato?: string | null
  hora_voto: string | null
  presenca_em: string | null
  rod_assembleia_id: string | null
  assembleia_id: string | null
  conflito_motivo: string | null
}

export type ResultadoVinculo = {
  /** Quantas votações (rodadas) ficaram ligadas a este e-mail. */
  vinculadas: number
  erro?: string
  /** A falha veio da conferência com a lista (conta para a trava de tentativas). */
  naoConferiu?: boolean
}

const ERRO_NAO_CONFERE =
  "Os dados informados não conferem com a lista de aptos. Confira o nome completo (como está no seu crachá ou contracheque) e o e-mail da empresa. Se continuar, procure o sindicato."

/**
 * Vincula o e-mail confirmado na sessão ao registro da pessoa na lista de
 * aptos de cada votação aberta. Conferência por rodada — a pessoa pode estar
 * em mais de uma.
 */
export async function vincularPorLinkUnico(dados: {
  emailSessao: string
  cpf: string
  nome: string
  nascimento: string
  emailEmpresa: string
}): Promise<ResultadoVinculo> {
  const cpf = limparCpf(dados.cpf)
  const nome = dados.nome.trim().replace(/\s+/g, " ")
  const emailSessao = dados.emailSessao.trim().toLowerCase()
  const emailEmpresa = dados.emailEmpresa.trim().toLowerCase()
  if (!validarCpf(cpf)) return { vinculadas: 0, erro: "CPF inválido — confira os números." }
  if (nome.split(" ").filter((p) => p.length > 1).length < 2) {
    return { vinculadas: 0, erro: "Informe o nome completo, com sobrenome." }
  }
  if (!nascimentoValido(dados.nascimento)) {
    return { vinculadas: 0, erro: "Informe uma data de nascimento válida." }
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailEmpresa)) {
    return { vinculadas: 0, erro: "Informe o e-mail da empresa (o que a empresa passou ao sindicato)." }
  }
  if (!(await temColunasLinkUnico())) {
    return { vinculadas: 0, erro: "O cadastro pelo link único ainda não está disponível. Procure o sindicato." }
  }

  const votacoes = await votacoesAbertas()
  if (votacoes.length === 0) return { vinculadas: 0, erro: "Não há votação online aberta no momento." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const assembleiaIds = [...new Set(votacoes.map((v) => v.assembleiaId))]
  const rodadaIds = [...new Set(votacoes.map((v) => v.rodadaId))]
  // Escopo (assembleia OU só a rodada) × alternativa (e-mail da empresa OU
  // CPF), num .or só — duas chamadas de .or no mesmo pedido são ambíguas.
  const escopos = [
    `assembleia_id.in.(${assembleiaIds.join(",")})`,
    `assembleia_id.is.null,rod_assembleia_id.in.(${rodadaIds.join(",")})`,
  ]
  const alternativas = [`email_corporativo.eq.${aspas(emailEmpresa)}`, `cpf.eq.${aspas(cpf)}`]
  const filtro = escopos.flatMap((e) => alternativas.map((a) => `and(${e},${a})`)).join(",")
  const { data } = await admin
    .from("voto_assembleias_aptos")
    .select(
      "id, cpf, nome_completo, email_corporativo, email_contato, hora_voto, presenca_em, rod_assembleia_id, assembleia_id, conflito_motivo"
    )
    .eq("emp_proprietaria_id", emp)
    .or(filtro)
  const candidatos = (data ?? []) as AptoCandidato[]
  if (candidatos.length === 0) {
    return {
      vinculadas: 0,
      naoConferiu: true,
      erro: "Não encontramos você na lista de aptos das votações abertas. Confira o e-mail da empresa digitado; se estiver certo, procure o sindicato.",
    }
  }

  // Ficha de filiado do CPF: o cadastro da entidade vale mais que a lista.
  const { data: filiado } = await admin
    .from("filiacoes")
    .select("nome_completo, nascimento_data")
    .eq("emp_proprietaria_id", emp)
    .eq("cpf", cpf)
    .limit(1)
    .maybeSingle()
  let filiadoConfere = false
  if (filiado) {
    const nasc = filiado.nascimento_data ? String(filiado.nascimento_data).slice(0, 10) : null
    filiadoConfere = nomesConferem(nome, txt(filiado.nome_completo)) && (!nasc || nasc === dados.nascimento)
  }

  const marcar = async (ids: string[], motivo: string) => {
    if (ids.length === 0) return
    await admin
      .from("voto_assembleias_aptos")
      .update({
        cpf_conflito: cpf,
        conflito_motivo: `Link único (${emailSessao}): ${motivo}`.slice(0, 500),
        conflito_em: new Date().toISOString(),
      })
      .in("id", ids)
  }

  // Agrupa por rodada (aptos e voto único são por rodada).
  const porRodada = new Map<string, AptoCandidato[]>()
  for (const c of candidatos) {
    const chave = c.rod_assembleia_id ?? c.assembleia_id ?? c.id
    porRodada.set(chave, [...(porRodada.get(chave) ?? []), c])
  }

  let vinculadas = 0
  let primeiraFalha: string | null = null
  const alertar = new Map<string, { email: string; nome: string | null }>()
  const agora = new Date().toISOString()

  for (const grupo of porRodada.values()) {
    const porEmail = grupo.filter((a) => (a.email_corporativo ?? "").toLowerCase() === emailEmpresa)
    const alvo = porEmail.length > 0 ? porEmail : grupo.filter((a) => limparCpf(a.cpf ?? "") === cpf)
    if (alvo.length === 0) continue
    const ids = alvo.map((a) => a.id)

    if (alvo.some((a) => a.conflito_motivo === MARCA_NAO_RECONHECE)) {
      primeiraFalha ??= "Este cadastro está bloqueado para conferência. Procure o sindicato."
      continue
    }
    if (alvo.every((a) => a.hora_voto || a.presenca_em)) {
      // Já votou: não há o que vincular (e não contamos isso a quem pergunta).
      primeiraFalha ??= ERRO_NAO_CONFERE
      continue
    }
    if (alvo.some((a) => a.email_contato && a.email_contato.toLowerCase() !== emailSessao)) {
      await marcar(ids, "registro já vinculado a outro e-mail pelo link único.")
      primeiraFalha ??= "Este registro já foi cadastrado com outro e-mail. Procure o sindicato para conferir."
      continue
    }
    if (alvo.some((a) => a.cpf && limparCpf(a.cpf) !== cpf)) {
      await marcar(ids, "CPF informado difere do CPF do registro.")
      primeiraFalha ??= ERRO_NAO_CONFERE
      continue
    }

    // Identidade: ficha de filiado (nome + nascimento) ou o nome COMPLETO da lista.
    const nomeDaLista = alvo.map((a) => a.nome_completo).find(Boolean) ?? null
    const listaConfere = Boolean(nomeDaLista && temSobrenome(nomeDaLista) && nomeCobreLista(nome, nomeDaLista))
    if (!filiadoConfere && !listaConfere) {
      const listaComparavel = Boolean(nomeDaLista && temSobrenome(nomeDaLista))
      await marcar(
        ids,
        listaComparavel
          ? `nome declarado ("${nome}") não cobre o nome da lista ("${nomeDaLista}").`
          : "a lista não tem o nome completo para conferir.",
      )
      // Lista sem nome completo: tentar de novo não resolve — só a secretaria.
      primeiraFalha ??= listaComparavel
        ? ERRO_NAO_CONFERE
        : "Não conseguimos conferir o seu nome na lista desta votação. Procure o sindicato para liberar o seu voto."
      continue
    }

    // CPF em OUTRO registro da mesma rodada: já votou → não abre; outro nome → conferência.
    const rodadaId = alvo.find((a) => a.rod_assembleia_id)?.rod_assembleia_id ?? null
    let consulta = admin
      .from("voto_assembleias_aptos")
      .select("id, nome_completo, hora_voto, presenca_em")
      .eq("emp_proprietaria_id", emp)
      .eq("cpf", cpf)
    consulta = rodadaId
      ? consulta.eq("rod_assembleia_id", rodadaId)
      : consulta.eq("assembleia_id", alvo[0].assembleia_id ?? "")
    const { data: outros } = await consulta
    const concorrentes = (outros ?? []).filter((o) => !ids.includes(String(o.id)))
    if (concorrentes.some((o) => o.hora_voto || o.presenca_em)) {
      await marcar(ids, "já havia voto para este CPF em outro registro da votação.")
      primeiraFalha ??= ERRO_NAO_CONFERE
      continue
    }
    if (
      concorrentes.length > 0 &&
      !filiadoConfere &&
      !concorrentes.some((o) => nomesConferem(nome, txt(o.nome_completo)))
    ) {
      await marcar(ids, "CPF já está em outro registro da votação com outro nome.")
      primeiraFalha ??= ERRO_NAO_CONFERE
      continue
    }

    const { error } = await admin
      .from("voto_assembleias_aptos")
      .update({
        cpf,
        nome_informado: nome,
        nascimento_informado: dados.nascimento,
        dados_informados_em: agora,
        email_contato: emailSessao,
        cadastro_canal: CANAL_LINK_UNICO,
        cadastro_em: agora,
        cpf_conflito: null,
        conflito_motivo: null,
        conflito_em: null,
        updated_at: agora,
      })
      .in("id", ids)
    if (error) {
      primeiraFalha ??= "Não foi possível salvar o seu cadastro. Tente de novo em instantes."
      continue
    }
    vinculadas++
    for (const a of alvo) {
      const corp = (a.email_corporativo ?? "").toLowerCase()
      if (corp && corp !== emailSessao) alertar.set(corp, { email: corp, nome: a.nome_completo })
    }
  }

  // Alerta no e-mail corporativo: se o gateway da empresa barrar, nada se
  // perde; se chegar, o dono verdadeiro percebe um cadastro que não fez.
  for (const destino of alertar.values()) {
    await enviarEmail({
      email: destino.email,
      nome: destino.nome,
      assunto: "Seu cadastro para votação foi feito pelo link único — {ENTIDADE}",
      html: htmlAlertaCadastro(emailSessao),
    }).catch(() => false)
  }

  if (vinculadas === 0) return { vinculadas, erro: primeiraFalha ?? ERRO_NAO_CONFERE, naoConferiu: true }
  return { vinculadas }
}

/** "a***@gmail.com": o suficiente para o dono reconhecer, sem expor o endereço. */
function mascarar(email: string): string {
  const [usuario, dominio] = email.split("@")
  if (!dominio) return email
  return `${usuario.slice(0, 1)}${"*".repeat(Math.max(usuario.length - 1, 3))}@${dominio}`
}

function htmlAlertaCadastro(emailSessao: string): string {
  return [
    tituloEmail("Cadastro para votação"),
    paragrafo(
      `Você está na lista de aptos a votar de uma votação promovida por {ENTIDADE}. Alguém se identificou como você no <strong>link único de votação</strong> e passou a receber os avisos no e-mail <strong>${escaparHtml(mascarar(emailSessao))}</strong>.`
    ),
    paragrafo("Se foi você, não precisa fazer nada — é só votar pelo link único."),
    caixaAviso(
      "<strong>Não foi você?</strong> Responda a este e-mail ou procure o sindicato o quanto antes, para conferirmos o cadastro."
    ),
    textoSuave("O voto é secreto: o sistema registra que a pessoa votou, nunca em quem votou."),
  ].join("\n")
}
