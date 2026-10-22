import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { after } from "next/server"

import {
  derivarModalidade,
  horaCurta,
  temVotoOnline,
} from "@/lib/assembleias-constantes"
import { cpfConfiavel, formatarCpf, grafiasDoCpf } from "@/lib/cpf"
import { colunasSala, janelaDaAssembleia, situacaoDaAssembleia } from "@/lib/db/assembleias-horarios"
import { esquemaAusente, hojeSP, lerEmLotes, texto } from "@/lib/db/comum"
import { CONDICAO_ATIVO } from "@/lib/db/filiacao-ativos"
import { emailContatoEntidade, nomeEntidade } from "@/lib/db/organizacao"
import { avisarFiliado, type ResultadoAviso } from "@/lib/db/portal-avisos"
import { bloqueioDaParte, estadoDaParte, opcoesDaParte } from "@/lib/db/portal-partes"
import {
  assuntoAvisoAptos,
  montarEmailAvisoAptos,
  type DadosAvisoAptos,
  type DestinatarioAviso,
} from "@/lib/email-aviso-aptos"
import { enviarEmail, type ContextoEmail } from "@/lib/email"
import { botaoEmail, escaparHtml, paragrafo, textoSuave, tituloEmail } from "@/lib/email-layout"
import { formatarData } from "@/lib/formato"
import { normalizarPreferenciasPortal } from "@/lib/portal-avisos-eventos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * Aviso por e-mail aos aptos de uma rodada ("você está habilitado a votar").
 *
 * O envio é em LOTES: cada chamada processa até `limite` aptos pendentes
 * (aviso_email_em nulo) e marca cada um — enviado, sem e-mail, e-mail repetido,
 * e-mail desligado pela pessoa ou falha do provedor. A tela chama de novo até
 * zerar; se a pessoa fechar a página, o próximo clique continua de onde parou.
 * Quem entra na lista depois fica pendente e recebe só o dele. Colunas:
 * supabase/aptos-aviso-email.sql.
 *
 * Para onde vai: o e-mail corporativo do apto (a pessoa entra por ele); sem
 * ele, o e-mail do filiado dono do CPF (entra pelo CPF). Sem nenhum dos dois,
 * o apto fica marcado como "sem e-mail". Filiado que desligou "Votações" nas
 * preferências do portal não recebe o e-mail (A120) — fica só o sino —, a
 * não ser que o e-mail seja o caminho do voto dele: há voto pela internet e
 * o portal não lhe mostra a cédula. Aí o link de voto sai mesmo assim, como
 * promete Avisos → Preferências ("links de voto chegam sempre").
 *
 * Depois da abertura (avaliação do portal, A49): lembrete nas últimas 24 h a
 * quem ainda não votou (`lembretesUltimoDiaVotacao`, tick diário) e aviso do
 * resultado quando a apuração é encerrada (`agendarAvisoDoResultado`, com o
 * tick `lembretesResultadoVotacao` terminando o que sobrar). Esses dois saem
 * por `avisarFiliado` — sino sempre, e-mail conforme a preferência.
 */

export type ResumoAvisoAptos = {
  /** false = falta rodar supabase/aptos-aviso-email.sql. */
  esquemaPronto: boolean
  total: number
  enviados: number
  pendentes: number
  semEmail: number
  duplicados: number
  /** Filiados que desligaram o e-mail de "Votações" no portal (ficam só com o sino). */
  desligados: number
  falhas: number
  ultimoEnvio: string | null
}

export type ResultadoLoteAviso = {
  processados: number
  enviados: number
  semEmail: number
  duplicados: number
  /** E-mail não enviado porque o filiado desligou "Votações" nas preferências. */
  desligados: number
  falhas: number
  /** Avisados pelo contato escolhido no link geral (e-mail pessoal/Telegram). */
  contatos?: number
  restantes: number
}

/** Marca em `aviso_email_erro` do apto cujo e-mail a pessoa desligou (A120). */
const ERRO_PREFERENCIA = "preferencia"

async function contar(
  rodadaId: string,
  filtro: (q: ReturnType<typeof base>) => ReturnType<typeof base>,
  client?: SupabaseClient
): Promise<number> {
  const { count } = await filtro(base(client ?? (await createAdminClient()), rodadaId))
  return count ?? 0
}

/**
 * Fora de requisição (tick do envio automático, fase 2 de 16/10/2026): o
 * service client, o tenant e o contexto do e-mail vão explícitos — ali
 * `tenantAtual()` e `origemAtual()` não valem.
 */
export type AmbienteEnvio = { client: SupabaseClient; tenantId: string; contexto: ContextoEmail }

function base(admin: SupabaseClient, rodadaId: string) {
  return admin
    .from("voto_assembleias_aptos")
    .select("id", { count: "exact", head: true })
    .eq("rod_assembleia_id", rodadaId)
}

export async function resumoAvisoAptos(rodadaId: string): Promise<ResumoAvisoAptos> {
  const admin = await createAdminClient()
  const sonda = await admin
    .from("voto_assembleias_aptos")
    .select("aviso_email_em")
    .eq("rod_assembleia_id", rodadaId)
    .not("aviso_email_em", "is", null)
    .order("aviso_email_em", { ascending: false })
    .limit(1)
  if (sonda.error) {
    if (esquemaAusente(sonda.error) || sonda.error.code === "42703") {
      return { esquemaPronto: false, total: 0, enviados: 0, pendentes: 0, semEmail: 0, duplicados: 0, desligados: 0, falhas: 0, ultimoEnvio: null }
    }
    throw new Error(`Falha ao ler os avisos: ${sonda.error.message}`)
  }
  const [total, pendentes, enviados, semEmail, duplicados, desligados, falhas] = await Promise.all([
    contar(rodadaId, (q) => q),
    contar(rodadaId, (q) => q.is("aviso_email_em", null)),
    contar(rodadaId, (q) => q.not("aviso_email_em", "is", null).is("aviso_email_erro", null)),
    contar(rodadaId, (q) => q.eq("aviso_email_erro", "sem_email")),
    contar(rodadaId, (q) => q.eq("aviso_email_erro", "duplicado")),
    contar(rodadaId, (q) => q.eq("aviso_email_erro", ERRO_PREFERENCIA)),
    contar(rodadaId, (q) => q.eq("aviso_email_erro", "falha")),
  ])
  return {
    esquemaPronto: true,
    total,
    pendentes,
    enviados,
    semEmail,
    duplicados,
    desligados,
    falhas,
    ultimoEnvio: (sonda.data?.[0]?.aviso_email_em as string | undefined) ?? null,
  }
}

/** O conteúdo comum a todos os e-mails da rodada. Erro quando não dá para avisar. */
export async function dadosDoAviso(
  rodadaId: string,
  amb?: AmbienteEnvio
): Promise<{ dados?: DadosAvisoAptos; erro?: string }> {
  const admin = amb?.client ?? (await createAdminClient())
  const emp = amb?.tenantId ?? (await tenantAtual())
  const { data: rodada } = await admin
    .from("voto_rod_assembleias")
    .select("id, nome_assembleia, inicio, termino, campanha:campanha_id (tema)")
    .eq("id", rodadaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!rodada) return { erro: "Rodada não encontrada." }
  const termino = rodada.termino as string | null
  if (termino && termino.slice(0, 10) < hojeSP()) {
    return { erro: "O período desta rodada já terminou — não há mais o que avisar." }
  }

  const { data: assembleias } = await admin
    .from("voto_assembleias")
    .select(
      "id, nome_assembleia, online, urnas_de_votacao, data_inicio, data_termino, hora_inicio, hora_termino, created_at" +
        (amb ? await colunasSalaDe(amb.client) : await colunasSala())
    )
    .eq("rod_assembleia_id", rodadaId)
    .eq("emp_proprietaria_id", emp)
    .order("data_inicio", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
  // Select montado (sala só depois do SQL): tipo solto de propósito.
  const lista = ((assembleias ?? []) as unknown as Record<string, unknown>[]).map((a) => ({
    id: String(a.id),
    nome: (a.nome_assembleia as string | null) ?? null,
    modalidade: derivarModalidade(a),
    data_inicio: (a.data_inicio as string | null) ?? null,
    data_termino: (a.data_termino as string | null) ?? null,
    hora_inicio: horaCurta((a.hora_inicio as string | null) ?? null),
    hora_termino: horaCurta((a.hora_termino as string | null) ?? null),
    sala_link: (a.sala_link as string | null) ?? null,
    sala_data: (a.sala_data as string | null) ?? null,
    sala_hora: horaCurta((a.sala_hora as string | null) ?? null),
  }))
  if (lista.length === 0) {
    return { erro: "Cadastre ao menos uma assembleia na rodada antes de avisar os aptos." }
  }

  const online = lista.find((a) => temVotoOnline(a.modalidade))
  const origem = amb?.contexto.origem ?? (await origemAtual())
  const campanha = rodada.campanha as { tema?: string | null } | { tema?: string | null }[] | null
  const tema = Array.isArray(campanha) ? campanha[0]?.tema : campanha?.tema
  // Sem voto pela internet, o botão leva à Votação do portal; desabilitada na
  // Área do associado (cairia em "indisponível"), à entrada do portal.
  const votacaoNoPortal =
    Boolean(online) ||
    (await estadoDaParte("votacao", { client: admin, tenantId: emp }).catch(() => "habilitada")) !== "desabilitada"
  return {
    dados: {
      rodadaNome: (rodada.nome_assembleia as string | null) ?? "Rodada de assembleias",
      campanhaTema: tema ?? null,
      inicio: (rodada.inicio as string | null) ?? null,
      termino,
      assembleias: lista.map(({ nome, modalidade, data_inicio, data_termino, hora_inicio, hora_termino, sala_link, sala_data, sala_hora }) => ({
        nome,
        modalidade,
        data_inicio,
        data_termino,
        hora_inicio,
        hora_termino,
        sala_link,
        sala_data,
        sala_hora,
      })),
      link: online ? `${origem}/votar/${online.id}` : votacaoNoPortal ? `${origem}/portal/votacao` : `${origem}/portal`,
      assembleiaOnlineId: online?.id ?? null,
      temOnline: Boolean(online),
      temPresencial: lista.some((a) => a.modalidade !== "online"),
    },
  }
}

/** Colunas da sala virtual pelo client dado (fora de requisição o cache de colunasSala não serve). */
async function colunasSalaDe(client: SupabaseClient): Promise<string> {
  const { error } = await client.from("voto_assembleias").select("sala_link").limit(1)
  return error ? "" : ", sala_link, sala_data, sala_hora"
}

/** Envia o e-mail de exemplo (porta do e-mail corporativo) para um endereço. */
export async function enviarAvisoTeste(
  rodadaId: string,
  destino: { email: string; nome: string | null }
): Promise<{ erro?: string }> {
  const { dados, erro } = await dadosDoAviso(rodadaId)
  if (!dados) return { erro }
  // O teste mostra o e-mail como ele chega, com o botão do link pessoal — mas
  // o token é de um apto que não existe: clicar não vota por ninguém.
  const { gerarTokenAcesso } = await import("@/lib/acesso-eleitor")
  const origem = await origemAtual()
  const linkPessoal = dados.assembleiaOnlineId
    ? `${origem}/votar/${dados.assembleiaOnlineId}/entrar?t=${encodeURIComponent(
        gerarTokenAcesso("00000000-0000-4000-8000-000000000000", dados.assembleiaOnlineId)
      )}`
    : null
  const ok = await enviarEmail({
    email: destino.email,
    nome: destino.nome,
    assunto: `[Teste] ${assuntoAvisoAptos(dados)}`,
    html: montarEmailAvisoAptos(dados, { ...destino, porta: "email", linkPessoal }),
  })
  return ok ? {} : { erro: "O provedor de e-mail não aceitou o envio (ou o envio não está configurado)." }
}

type AptoPendente = {
  id: string
  cpf: string | null
  nome_completo: string | null
  email_corporativo: string | null
  assembleia_id: string | null
}

const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Processa até `limite` aptos pendentes da rodada. */
export async function enviarLoteAviso(
  rodadaId: string,
  limite = 60,
  amb?: AmbienteEnvio
): Promise<{ resultado?: ResultadoLoteAviso; erro?: string }> {
  if (!process.env.BREVO_API_KEY || !process.env.EMAIL_REMETENTE) {
    return { erro: "O envio de e-mails não está configurado neste ambiente." }
  }
  const { dados, erro } = await dadosDoAviso(rodadaId, amb)
  if (!dados) return { erro }

  const admin = amb?.client ?? (await createAdminClient())
  const emp = amb?.tenantId ?? (await tenantAtual())
  const { data, error } = await admin
    .from("voto_assembleias_aptos")
    .select("id, cpf, nome_completo, email_corporativo, assembleia_id")
    .eq("rod_assembleia_id", rodadaId)
    .eq("emp_proprietaria_id", emp)
    .is("aviso_email_em", null)
    .order("id")
    .limit(limite)
  if (error) {
    if (esquemaAusente(error) || error.code === "42703") {
      return { erro: "Falta rodar o SQL supabase/aptos-aviso-email.sql." }
    }
    return { erro: `Falha ao ler os aptos: ${error.message}` }
  }
  const aptos = (data ?? []) as AptoPendente[]

  // E-mail do filiado para quem só tem CPF.
  const cpfs = [
    ...new Set(
      aptos
        .filter((a) => !a.email_corporativo)
        .map((a) => cpfConfiavel(a.cpf))
        .filter((c): c is string => Boolean(c))
    ),
  ]
  const emailPorCpf = new Map<string, string>()
  if (cpfs.length) {
    const { data: filiados } = await admin
      .from("filiacoes")
      .select("cpf, email_pessoal, email_corporativo, updated_at")
      .eq("emp_proprietaria_id", emp)
      .in("cpf", cpfs.flatMap((c) => [c, formatarCpf(c)]))
      .not("filiacao_excluida", "is", true)
      .order("updated_at", { ascending: false, nullsFirst: false })
    for (const f of filiados ?? []) {
      const cpf = cpfConfiavel(f.cpf as string)
      const email = ((f.email_pessoal ?? f.email_corporativo) as string | null)?.trim().toLowerCase()
      if (cpf && email && EMAIL_VALIDO.test(email) && !emailPorCpf.has(cpf)) emailPorCpf.set(cpf, email)
    }
  }

  // Link pessoal: abre a cédula direto, sem depender do código por e-mail.
  const { gerarTokenAcesso } = await import("@/lib/acesso-eleitor")
  const origem = amb?.contexto.origem ?? (await origemAtual())
  const links = (aptoId: string): { pessoal: string | null; naoSouEu: string | null } => {
    if (!dados.assembleiaOnlineId) return { pessoal: null, naoSouEu: null }
    const t = encodeURIComponent(gerarTokenAcesso(aptoId, dados.assembleiaOnlineId))
    const base = `${origem}/votar/${dados.assembleiaOnlineId}`
    return { pessoal: `${base}/entrar?t=${t}`, naoSouEu: `${base}/nao-sou-eu?t=${t}` }
  }

  // Destino de cada apto.
  const planos = aptos.map((a) => {
    const corporativo = a.email_corporativo?.trim().toLowerCase() ?? ""
    if (EMAIL_VALIDO.test(corporativo)) {
      return {
        apto: a,
        destino: {
          nome: a.nome_completo,
          email: corporativo,
          porta: "email",
          linkPessoal: links(a.id).pessoal,
          linkNaoSouEu: links(a.id).naoSouEu,
        } as DestinatarioAviso,
      }
    }
    const cpf = cpfConfiavel(a.cpf)
    const doFiliado = cpf ? emailPorCpf.get(cpf) : undefined
    return {
      apto: a,
      destino: doFiliado
        ? ({
            nome: a.nome_completo,
            email: doFiliado,
            porta: "cpf",
            linkPessoal: links(a.id).pessoal,
            linkNaoSouEu: links(a.id).naoSouEu,
          } as DestinatarioAviso)
        : null,
    }
  })

  // O mesmo e-mail não recebe duas vezes na rodada.
  const emails = [...new Set(planos.map((p) => p.destino?.email).filter((e): e is string => Boolean(e)))]
  const jaAvisados = new Set<string>()
  if (emails.length) {
    const { data: avisados } = await admin
      .from("voto_assembleias_aptos")
      .select("aviso_email_para")
      .eq("emp_proprietaria_id", emp)
      .eq("rod_assembleia_id", rodadaId)
      .is("aviso_email_erro", null)
      .in("aviso_email_para", emails)
    for (const a of avisados ?? []) jaAvisados.add(String(a.aviso_email_para))
  }

  // Quem desligou "Votações" nas preferências do portal não recebe o e-mail
  // (A120), salvo quando ele é o caminho do voto (abaixo) — a chave da
  // preferência é o CPF, então vale para as duas portas. Sem conseguir
  // conferir, o lote para: mandar por cima da escolha da pessoa é pior do que
  // tentar de novo.
  const cpfsDoLote = [
    ...new Set(aptos.map((a) => cpfConfiavel(a.cpf)).filter((c): c is string => Boolean(c))),
  ]
  let desligaram: Set<string>
  try {
    desligaram = await desligaramEmailDeVotacao({ client: admin, tenantId: emp }, cpfsDoLote)
  } catch (e) {
    return { erro: `Não foi possível conferir as preferências de aviso: ${(e as Error).message}` }
  }
  // Para quem o portal mostra a cédula online (A59): o sino leva até ela, e
  // só então o e-mail desligado não faz falta. Na dúvida (leitura falhou),
  // ninguém vê — o link de voto sai e o sino vai para a lista.
  const veACedula = dados.assembleiaOnlineId
    ? await portalMostraACedula({ client: admin, tenantId: emp }, dados.assembleiaOnlineId, cpfsDoLote).catch(
        () => new Map<string, Filiado>()
      )
    : new Map<string, Filiado>()
  const naCedula = (a: AptoPendente, cpf: string | null): boolean =>
    cpf !== null &&
    Boolean(dados.assembleiaOnlineId) &&
    veACedula.has(cpf) &&
    (!a.assembleia_id || a.assembleia_id === dados.assembleiaOnlineId)
  // E-mail desligado só pesa quando não é o caminho do voto: sem voto pela
  // internet (o e-mail não leva link de voto) ou com a cédula no portal.
  const respeitaPreferencia = (a: AptoPendente, cpf: string | null): boolean =>
    cpf !== null && desligaram.has(cpf) && (!dados.assembleiaOnlineId || naCedula(a, cpf))

  const resultado: ResultadoLoteAviso = {
    processados: aptos.length,
    enviados: 0,
    semEmail: 0,
    duplicados: 0,
    desligados: 0,
    falhas: 0,
    restantes: 0,
  }
  const marcacoes: { ids: string[]; para: string | null; erro: string | null }[] = []
  const envios: { id: string; destino: DestinatarioAviso }[] = []
  const vistosNoLote = new Set<string>()
  for (const { apto, destino } of planos) {
    const cpf = cpfConfiavel(apto.cpf)
    if (!destino) {
      resultado.semEmail++
      marcacoes.push({ ids: [apto.id], para: null, erro: "sem_email" })
    } else if (respeitaPreferencia(apto, cpf)) {
      resultado.desligados++
      marcacoes.push({ ids: [apto.id], para: destino.email, erro: ERRO_PREFERENCIA })
    } else if (jaAvisados.has(destino.email) || vistosNoLote.has(destino.email)) {
      resultado.duplicados++
      marcacoes.push({ ids: [apto.id], para: destino.email, erro: "duplicado" })
    } else {
      vistosNoLote.add(destino.email)
      envios.push({ id: apto.id, destino })
    }
  }

  // Envia em paralelo, poucos por vez (o provedor limita a taxa).
  const assunto = assuntoAvisoAptos(dados)
  const PARALELO = 6
  for (let i = 0; i < envios.length; i += PARALELO) {
    const fatia = envios.slice(i, i + PARALELO)
    const oks = await Promise.all(
      fatia.map((e) =>
        enviarEmail({
          email: e.destino.email,
          nome: e.destino.nome,
          assunto,
          html: montarEmailAvisoAptos(dados, e.destino),
          contexto: amb?.contexto,
        })
      )
    )
    fatia.forEach((e, j) => {
      if (oks[j]) resultado.enviados++
      else resultado.falhas++
      marcacoes.push({ ids: [e.id], para: e.destino.email, erro: oks[j] ? null : "falha" })
    })
  }

  // Sino do portal para todo apto com CPF do lote (o e-mail já é o aviso).
  // Leva à cédula quando o portal a mostra para a pessoa (A59); senão, à
  // lista de votações. Um só por pessoa e rodada: o texto é o da rodada, e
  // quem já o recebeu (inclusive com o link antigo, para a lista) não ganha
  // outro no "Reenviar a quem não votou".
  const textoSino = `Votação aberta: ${dados.rodadaNome}${dados.termino ? ` (até ${formatarData(dados.termino)})` : ""}. Você está apto a votar.`
  // Client novo: o do começo do lote pode ter vencido durante os envios (JWT de 60 s).
  const dbSino = { client: amb?.client ?? (await createAdminClient()), tenantId: emp }
  const jaTemSino = await cpfsComAviso(dbSino, textoSino, cpfsDoLote).catch(() => new Set<string>())
  for (const a of aptos) {
    const cpf = cpfConfiavel(a.cpf)
    if (!cpf || jaTemSino.has(cpf)) continue
    jaTemSino.add(cpf)
    await avisarFiliado({
      cpf,
      evento: "votacao",
      texto: textoSino,
      link: naCedula(a, cpf) ? `/portal/votacao/${dados.assembleiaOnlineId}` : "/portal/votacao",
      soSino: true,
      umaVez: true,
      nome: a.nome_completo,
    }, amb)
  }

  // Grava as marcas agrupadas por (para, erro).
  const agora = new Date().toISOString()
  const grupos = new Map<string, { ids: string[]; para: string | null; erro: string | null }>()
  for (const m of marcacoes) {
    const chave = `${m.para ?? ""}|${m.erro ?? ""}`
    const g = grupos.get(chave)
    if (g) g.ids.push(...m.ids)
    else grupos.set(chave, { ...m, ids: [...m.ids] })
  }
  // A escrita vai pelo JWT do tenant, que vence em 60 s: e-mails e sinos do
  // lote podem passar disso, e uma marca perdida reenviaria o e-mail no
  // próximo clique. Client novo para gravar.
  const gravar = amb?.client ?? (await createAdminClient())
  for (const g of grupos.values()) {
    await gravar
      .from("voto_assembleias_aptos")
      .update({ aviso_email_em: agora, aviso_email_para: g.para, aviso_email_erro: g.erro })
      .eq("emp_proprietaria_id", emp)
      .in("id", g.ids)
    // Primeiro envio que saiu: nunca é zerado pelo reenvio (fase 2). Sem a
    // coluna (antes de supabase/votacao-aviso-fase2.sql), a escrita falha e
    // nada muda.
    if (g.erro === null) {
      await gravar
        .from("voto_assembleias_aptos")
        .update({ aviso_primeiro_em: agora })
        .eq("emp_proprietaria_id", emp)
        .in("id", g.ids)
        .is("aviso_primeiro_em", null)
    }
  }

  resultado.restantes = await contar(rodadaId, (q) => q.eq("emp_proprietaria_id", emp).is("aviso_email_em", null), gravar)

  // Também pelo canal que o apto escolheu no link geral — e-mail pessoal ou
  // Telegram (fase 1 do plano de 21/10/2026). Falha aqui não derruba o lote
  // do corporativo; o tick tenta de novo.
  const { enviarLoteAvisoContato } = await import("@/lib/db/votacao-aviso-contato")
  const contato = await enviarLoteAvisoContato(rodadaId, limite, amb).catch(() => ({ resultado: undefined }))
  if (contato.resultado) {
    resultado.processados += contato.resultado.processados
    resultado.contatos = contato.resultado.enviados
    resultado.restantes += contato.resultado.restantes
  }
  return { resultado }
}

/** Devolve à fila os aptos cujo envio falhou (ou todos, para reenviar). */
export async function reabrirAvisos(
  rodadaId: string,
  quais: "falhas" | "todos" | "nao_votaram"
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  let q = admin
    .from("voto_assembleias_aptos")
    .update({ aviso_email_em: null, aviso_email_para: null, aviso_email_erro: null })
    .eq("rod_assembleia_id", rodadaId)
    .eq("emp_proprietaria_id", await tenantAtual())
  q =
    quais === "falhas"
      ? q.eq("aviso_email_erro", "falha")
      : quais === "nao_votaram"
        ? q.not("aviso_email_em", "is", null).is("hora_voto", null)
        : q.not("aviso_email_em", "is", null)
  const { error } = await q
  if (error) return { erro: `Não foi possível reabrir: ${error.message}` }
  // O reenvio vale também para o contato escolhido no link geral (fase 1, 21/10/2026).
  if (quais !== "falhas") {
    const { reabrirAvisosContato } = await import("@/lib/db/votacao-aviso-contato")
    return reabrirAvisosContato(rodadaId, "nao_votaram")
  }
  return {}
}

/**
 * Reenvia a UM eleitor o e-mail com o link pessoal de voto — o mesmo formato
 * do aviso da rodada.
 *
 * Por que não mandamos um código aqui (23/09/2026): a Microsoft descarta em
 * silêncio o e-mail curto com o código (22 pedidos, 0 entregas), enquanto o
 * e-mail do aviso, pelo mesmo remetente e no mesmo minuto, entrega (11 de 14).
 * O conteúdo é que pesa — então a porta de entrada passa a ser o link.
 */
export async function enviarLinkDeVoto(
  assembleiaId: string,
  apto: { id: string; nome: string | null; email: string }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: assembleia } = await admin
    .from("voto_assembleias")
    .select("rod_assembleia_id")
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  const rodadaId = (assembleia?.rod_assembleia_id as string | null) ?? null
  if (!rodadaId) return { erro: "Assembleia sem rodada vinculada." }

  const { dados, erro } = await dadosDoAviso(rodadaId)
  if (!dados) return { erro }

  const { gerarTokenAcesso } = await import("@/lib/acesso-eleitor")
  const origem = await origemAtual()
  const t = encodeURIComponent(gerarTokenAcesso(apto.id, assembleiaId))
  const base = `${origem}/votar/${assembleiaId}`

  const ok = await enviarEmail({
    email: apto.email,
    nome: apto.nome,
    assunto: assuntoAvisoAptos(dados),
    html: montarEmailAvisoAptos(dados, {
      nome: apto.nome,
      email: apto.email,
      porta: "email",
      linkPessoal: `${base}/entrar?t=${t}`,
      linkNaoSouEu: `${base}/nao-sou-eu?t=${t}`,
    }),
  })
  return ok ? {} : { erro: "Não foi possível enviar o e-mail. Tente de novo." }
}

/**
 * O link pessoal de um apto + uma mensagem pronta para colar no WhatsApp ou no
 * Telegram. Serve para quando o e-mail não chega: a secretaria manda o link
 * por outro caminho, sem que ninguém precise de código.
 */
export async function linkPessoalDoApto(aptoId: string): Promise<{
  link?: string
  mensagem?: string
  nome?: string | null
  erro?: string
}> {
  const admin = await createAdminClient()
  const { data: apto } = await admin
    .from("voto_assembleias_aptos")
    .select("id, nome_completo, rod_assembleia_id, assembleia_id, hora_voto")
    .eq("id", aptoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!apto) return { erro: "Eleitor não encontrado." }
  if (apto.hora_voto) return { erro: "Este eleitor já votou — o link não abre mais a cédula." }

  const rodadaId = (apto.rod_assembleia_id as string | null) ?? null
  if (!rodadaId) return { erro: "Eleitor sem rodada vinculada." }
  const { dados, erro } = await dadosDoAviso(rodadaId)
  if (!dados) return { erro }
  const assembleiaId = (apto.assembleia_id as string | null) ?? dados.assembleiaOnlineId
  if (!assembleiaId) {
    return { erro: "Esta rodada não tem assembleia online — não há link de voto." }
  }

  const { gerarTokenAcesso } = await import("@/lib/acesso-eleitor")
  const origem = await origemAtual()
  const link = `${origem}/votar/${assembleiaId}/entrar?t=${encodeURIComponent(
    gerarTokenAcesso(String(apto.id), assembleiaId)
  )}`
  const nome = (apto.nome_completo as string | null) ?? null
  const primeiro = nome ? nome.trim().split(/\s+/)[0] : null
  const mensagem =
    `${primeiro ? `Olá, ${primeiro}! ` : "Olá! "}` +
    `Você está habilitado a votar na ${dados.rodadaNome}. ` +
    `Este link é pessoal e abre a sua cédula direto, sem código — não repasse a ninguém:\n${link}` +
    dados.assembleias
      .filter((a) => a.sala_link)
      .map(
        (a) =>
          `\n\nReunião por vídeo (não é onde se vota)${a.sala_data ? ` em ${formatarData(a.sala_data)}` : ""}${a.sala_hora ? ` às ${a.sala_hora}` : ""}: ${a.sala_link}`
      )
      .join("")
  return { link, mensagem, nome }
}

// ── Leituras em lote (lote do aviso, lembrete e resultado) ───────────────────

/**
 * Ambiente dos avisos de votação fora do caminho comum. No tick diário (fora
 * de requisição) quem chama passa o service client, o tenant da volta do laço
 * e o contexto do e-mail, como em cobrancas.ts — ali `tenantAtual()` e
 * `origemAtual()` não valem, e toda leitura abaixo filtra o tenant à mão.
 * Sem `client` (depois da resposta, no `after` do encerramento), cada etapa
 * abre um client do tenant novo: o JWT dele vale 60 s, menos do que o envio
 * de centenas de avisos leva.
 */
export type AmbienteVotacao = { client?: SupabaseClient; tenantId: string; contexto: ContextoEmail }

type Leitura = { client: SupabaseClient; tenantId: string }

async function leitura(amb: AmbienteVotacao): Promise<Leitura> {
  return { client: amb.client ?? (await createAdminClient()), tenantId: amb.tenantId }
}

/** Quantos avisos saem ao mesmo tempo (cada um grava no sino e pode mandar e-mail). */
const AVISOS_EM_PARALELO = 5

async function emParalelo<T, R>(itens: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = []
  for (let i = 0; i < itens.length; i += AVISOS_EM_PARALELO) {
    saida.push(...(await Promise.all(itens.slice(i, i + AVISOS_EM_PARALELO).map(fn))))
  }
  return saida
}

/** Soma o que `avisarFiliado` devolveu: `false` aqui é falha (os repetidos já saíram antes). */
function contabilizar(
  resultados: ResultadoAviso[],
  r: { avisados: number; porEmail: number; falhas: number }
): void {
  for (const x of resultados) {
    if (!x) r.falhas++
    else {
      r.avisados++
      if (x === "email") r.porEmail++
    }
  }
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Mesma frase do e-mail padrão de `avisarFiliado`. */
const RODAPE_PREFERENCIAS =
  "Você pode escolher quais avisos recebe por e-mail em Portal → Avisos → Preferências."

/**
 * CPFs que desligaram o e-mail de "Votações" nas preferências do portal
 * (A120). Sem a tabela (supabase/portal-avisos.sql), ninguém desligou.
 */
async function desligaramEmailDeVotacao(db: Leitura, cpfs: string[]): Promise<Set<string>> {
  const saida = new Set<string>()
  for (let i = 0; i < cpfs.length; i += 200) {
    const { data, error } = await db.client
      .from("portal_avisos_preferencias")
      .select("cpf, email_prefs")
      .eq("emp_proprietaria_id", db.tenantId)
      .in("cpf", cpfs.slice(i, i + 200))
    if (error) {
      if (esquemaAusente(error)) return saida
      throw new Error(error.message)
    }
    for (const p of data ?? []) {
      if (!normalizarPreferenciasPortal(p.email_prefs).votacao) saida.add(String(p.cpf))
    }
  }
  return saida
}

/** CPFs (dentre `cpfs`) que já têm no sino um aviso de votação com exatamente este texto. */
async function cpfsComAviso(db: Leitura, textoAviso: string, cpfs: string[]): Promise<Set<string>> {
  const saida = new Set<string>()
  for (let i = 0; i < cpfs.length; i += 200) {
    const { data, error } = await db.client
      .from("portal_avisos")
      .select("cpf")
      .eq("emp_proprietaria_id", db.tenantId)
      .eq("evento", "votacao")
      .eq("texto", textoAviso)
      .in("cpf", cpfs.slice(i, i + 200))
    if (error) throw new Error(error.message)
    for (const a of data ?? []) saida.add(String(a.cpf))
  }
  return saida
}

/**
 * CPFs que já receberam no sino o aviso deste item (`link`) cujo texto começa
 * por `prefixo` — a trava de "uma vez por pessoa e assembleia". Não depende do
 * texto inteiro: a hora do encerramento muda com uma prorrogação, e o
 * `umaVez` de avisarFiliado (texto + link) deixaria passar um segundo aviso.
 */
async function cpfsJaAvisados(db: Leitura, link: string, prefixo: string): Promise<Set<string>> {
  try {
    const linhas = await lerEmLotes<{ cpf: string }>((de, ate) =>
      db.client
        .from("portal_avisos")
        .select("id, cpf")
        .eq("emp_proprietaria_id", db.tenantId)
        .eq("evento", "votacao")
        .eq("link", link)
        .like("texto", `${prefixo}%`)
        .order("id")
        .range(de, ate)
    )
    return new Set(linhas.map((l) => String(l.cpf)))
  } catch (e) {
    // Sem a tabela não há aviso algum (e avisarFiliado também não grava).
    if (esquemaAusente(e as { code?: string })) return new Set()
    throw e
  }
}

type Filiado = { nome: string | null; email: string | null; ativo: boolean; filiacoes: string[] }

/**
 * Cadastro de cada CPF pela régua de `buscarFiliadoPorCpf` (contas.ts):
 * registros não excluídos, o mais recente primeiro; o portal só abre para
 * filiação ativa. Nome e e-mail seguem `contatoDoFiliado` e vão prontos para
 * avisarFiliado (poupa uma busca por pessoa).
 */
async function filiadosDosCpfs(db: Leitura, cpfs: string[]): Promise<Map<string, Filiado>> {
  const mapa = new Map<string, Filiado>()
  for (let i = 0; i < cpfs.length; i += 150) {
    const { data, error } = await db.client
      .from("filiacoes")
      .select("id, cpf, nome_completo, email_pessoal, email_corporativo, filiacao_condicao, updated_at")
      .eq("emp_proprietaria_id", db.tenantId)
      .in("cpf", cpfs.slice(i, i + 150).flatMap(grafiasDoCpf))
      .not("filiacao_excluida", "is", true)
      .order("updated_at", { ascending: false, nullsFirst: false })
    if (error) throw new Error(`Falha ao ler os cadastros: ${error.message}`)
    for (const f of data ?? []) {
      const cpf = cpfConfiavel(f.cpf as string | null)
      if (!cpf) continue
      const atual = mapa.get(cpf) ?? { nome: null, email: null, ativo: false, filiacoes: [] }
      atual.filiacoes.push(String(f.id))
      atual.nome ??= texto(f.nome_completo)
      atual.email ??= (texto(f.email_pessoal) ?? texto(f.email_corporativo))?.trim() ?? null
      if (f.filiacao_condicao === CONDICAO_ATIVO) atual.ativo = true
      mapa.set(cpf, atual)
    }
  }
  return mapa
}

/** Empregador da assembleia — o dela ou, sem ele, o da rodada (como assembleiasDoFiliado). */
/**
 * Empregadores da assembleia: o dela, o da rodada ou — sem nenhum dos dois,
 * como em tudo o que o painel cria desde 09/2026 — as fontes da campanha
 * (voto_campanha_fontes). Mesma régua de `assembleiasDoFiliado`
 * (votacao-portal.ts, onda 3) — mudou lá, muda aqui.
 */
async function empregadoresDaAssembleia(db: Leitura, assembleiaId: string): Promise<string[]> {
  const { data: a } = await db.client
    .from("voto_assembleias")
    .select("empresa_id, rod_assembleia_id, campanha_id")
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", db.tenantId)
    .maybeSingle()
  if (!a) return []
  const propria = texto(a.empresa_id)
  if (propria) return [propria]
  let campanha = texto(a.campanha_id)
  if (texto(a.rod_assembleia_id)) {
    const { data: rod } = await db.client
      .from("voto_rod_assembleias")
      .select("empresa_id, campanha_id")
      .eq("id", a.rod_assembleia_id)
      .eq("emp_proprietaria_id", db.tenantId)
      .maybeSingle()
    const daRodada = texto(rod?.empresa_id)
    if (daRodada) return [daRodada]
    campanha = campanha ?? texto(rod?.campanha_id)
  }
  if (!campanha) return []
  const { data: fontes } = await db.client
    .from("voto_campanha_fontes")
    .select("empresa_id")
    .eq("campanha_id", campanha)
  return [...new Set((fontes ?? []).map((f) => texto(f.empresa_id)).filter((e): e is string => Boolean(e)))]
}

/**
 * Dos `cpfs`, os filiados para quem o portal mostra a cédula desta
 * assembleia: filiação ativa e o empregador dela ATIVO no vínculo (sem
 * desfiliação nem demissão). É a régua de `empregadoresAtivos` /
 * `assembleiasDoFiliado` (votacao-portal.ts), refeita em lote e com o
 * ambiente recebido — mudou lá, muda aqui. Sem ela o aviso levaria a uma
 * cédula que responde "você não está apto". Assembleia sem empregador (nem
 * da assembleia, nem da rodada, nem fonte da campanha) não aparece no
 * portal: ninguém.
 *
 * Área do associado (Filiados): com a Votação suspensa ou desabilitada no
 * portal — ou o portal em consulta/fora do ar —, a cédula do portal não
 * recebe voto: ninguém. Aí tudo segue o caminho das assembleias fora do
 * portal — o e-mail leva o link pessoal (/votar) mesmo a quem desligou o
 * e-mail de Votações, o sino vai para a lista (e nem grava, com a parte
 * desabilitada) e o lembrete do último dia não sai. Lida pelo client e
 * tenant recebidos (vale no tick); falha sobe, e quem chama trata como hoje.
 */
async function portalMostraACedula(
  db: Leitura,
  assembleiaId: string,
  cpfs: string[]
): Promise<Map<string, Filiado>> {
  const saida = new Map<string, Filiado>()
  if (await bloqueioDaParte("votacao", db)) return saida
  const empresas = await empregadoresDaAssembleia(db, assembleiaId)
  if (empresas.length === 0 || cpfs.length === 0) return saida
  const filiados = await filiadosDosCpfs(db, cpfs)
  const cpfDaFiliacao = new Map<string, string>()
  for (const [cpf, f] of filiados) {
    if (f.ativo) for (const id of f.filiacoes) cpfDaFiliacao.set(id, cpf)
  }
  const ids = [...cpfDaFiliacao.keys()]
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.client
      .from("filiacao_vinculos")
      .select("filiado_id, data_desfiliacao, data_saida_demissao")
      .in("filiado_id", ids.slice(i, i + 200))
      .in("fonte_pagadora_id", empresas)
    if (error) throw new Error(`Falha ao ler os vínculos: ${error.message}`)
    for (const v of data ?? []) {
      if (texto(v.data_desfiliacao) || texto(v.data_saida_demissao)) continue
      const cpf = cpfDaFiliacao.get(String(v.filiado_id))
      const f = cpf ? filiados.get(cpf) : undefined
      if (cpf && f) saida.set(cpf, f)
    }
  }
  return saida
}

const COLUNAS_APTO =
  "id, cpf, email_corporativo, assembleia_id, rod_assembleia_id, hora_voto, presenca_em, presenca_urna_id"

type LinhaApto = {
  id: string
  cpf: string | null
  email_corporativo: string | null
  assembleia_id: string | null
  rod_assembleia_id: string | null
  hora_voto: string | null
  presenca_em: string | null
  presenca_urna_id: string | null
}

/**
 * As linhas de apto da rodada (ou amarradas à assembleia) com o CPF de quem o
 * portal reconhece nelas — pelo CPF da lista ou pelo e-mail de votação
 * verificado, as duas portas de assembleiasDoFiliado e minhasVotacoes. Uma
 * linha pode servir a dois CPFs (o da lista e o de quem verificou aquele
 * e-mail), como lá. Paginado: há rodadas com dezenas de milhares de aptos.
 */
async function aptosComCpf(
  db: Leitura,
  alvo: { assembleiaId: string; rodadaId: string | null },
  soQuemVotou: boolean
): Promise<{ linha: LinhaApto; cpf: string }[]> {
  const escopo = alvo.rodadaId
    ? `rod_assembleia_id.eq.${alvo.rodadaId},assembleia_id.eq.${alvo.assembleiaId}`
    : `assembleia_id.eq.${alvo.assembleiaId}`
  const consulta = () => {
    const q = db.client
      .from("voto_assembleias_aptos")
      .select(COLUNAS_APTO)
      .eq("emp_proprietaria_id", db.tenantId)
      .or(escopo)
    return soQuemVotou ? q.not("hora_voto", "is", null) : q
  }

  const pares: { linha: LinhaApto; cpf: string }[] = []
  const comCpf = await lerEmLotes<LinhaApto>((de, ate) =>
    consulta().not("cpf", "is", null).order("id").range(de, ate)
  )
  for (const linha of comCpf) {
    const cpf = cpfConfiavel(linha.cpf)
    if (cpf) pares.push({ linha, cpf })
  }

  // E-mail de votação verificado → CPF de quem o verificou. Sem a tabela
  // (supabase/assembleias-portal.sql), vale só o CPF — como no portal.
  let verificados: { cpf: string | null; email: string | null }[] = []
  try {
    verificados = await lerEmLotes<{ cpf: string | null; email: string | null }>((de, ate) =>
      db.client
        .from("votacao_email_verificado")
        .select("cpf, email")
        .eq("emp_proprietaria_id", db.tenantId)
        .not("email", "is", null)
        .order("cpf")
        .range(de, ate)
    )
  } catch (e) {
    if (!esquemaAusente(e as { code?: string })) throw e
  }
  const cpfDoEmail = new Map<string, string>()
  for (const v of verificados) {
    const cpf = cpfConfiavel(v.cpf)
    if (cpf && v.email) cpfDoEmail.set(v.email, cpf)
  }
  const emails = [...cpfDoEmail.keys()]
  for (let i = 0; i < emails.length; i += 100) {
    const linhas = await lerEmLotes<LinhaApto>((de, ate) =>
      consulta().in("email_corporativo", emails.slice(i, i + 100)).order("id").range(de, ate)
    )
    for (const linha of linhas) {
      const cpf = linha.email_corporativo ? cpfDoEmail.get(linha.email_corporativo) : undefined
      if (cpf) pares.push({ linha, cpf })
    }
  }
  return pares
}

type Votacao = {
  id: string
  nome: string | null
  rodadaId: string | null
  rodadaNome: string | null
  tema: string | null
  /** A rodada tem mais de uma assembleia: o nome desta entra no aviso. */
  varias: boolean
}

function temaDaCampanha(campanha: unknown): string | null {
  const c = Array.isArray(campanha) ? campanha[0] : campanha
  return texto((c as { tema?: unknown } | null)?.tema)
}

/**
 * Como os avisos chamam a votação: "Tema — Rodada" (o aviso aos aptos já
 * usa o nome da rodada), mais a assembleia quando a rodada tem várias.
 */
function rotuloDaVotacao(v: Votacao): string {
  const base = [v.tema, v.rodadaNome].filter(Boolean).join(" — ") || v.nome || "assembleia"
  return v.varias && v.nome && v.nome !== v.rodadaNome ? `${base} · ${v.nome}` : base
}

/** "hoje às 10:00", "amanhã às 10:00" ou "em 12/10 às 10:00", no fuso de São Paulo. */
function quandoEncerra(fim: number, hoje: string): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(fim))
  const p = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((x) => x.type === tipo)?.value ?? ""
  const dia = `${p("year")}-${p("month")}-${p("day")}`
  const hora = `${p("hour")}:${p("minute")}`
  if (dia === hoje) return `hoje às ${hora}`
  if (dia === somarDias(hoje, 1)) return `amanhã às ${hora}`
  return `em ${p("day")}/${p("month")} às ${hora}`
}

/** Probe das colunas de horário (supabase/voto-horarios-comprovante.sql) com o client recebido. */
async function colunasDeHorario(db: Leitura): Promise<string> {
  const { error } = await db.client.from("voto_assembleias").select("hora_inicio").limit(1)
  return error ? "" : ", hora_inicio, hora_termino"
}

/**
 * A entidade liga carência de filiação para votar? Mesma régua de
 * `conferirCarencia` (ativa e com dias). Sem a tabela, não há carência; outro
 * erro, na dúvida, conta como ligada (o lembrete fica de fora).
 */
async function carenciaDeVotoLigada(db: Leitura): Promise<boolean> {
  const { data, error } = await db.client
    .from("filiacao_carencias")
    .select("dias, ativo")
    .eq("emp_proprietaria_id", db.tenantId)
    .eq("beneficio", "votacao")
    .maybeSingle()
  if (error) return !esquemaAusente(error)
  return data?.ativo === true && Number(data?.dias ?? 0) > 0
}

// ── Lembrete de "falta pouco" (A49) ──────────────────────────────────────────

export type ResultadoLembretesVotacao = {
  /** Assembleias com voto pela internet, abertas, que encerram nas próximas 24 h. */
  assembleias: number
  avisados: number
  porEmail: number
  /** Já tinham o lembrete desta assembleia. */
  jaAvisados: number
  /**
   * Aptos que ainda não votaram mas não veem a cédula no portal (filiação
   * não ativa, sem o empregador da assembleia no vínculo ou assembleia sem
   * empregador) — o lembrete do portal não serve a eles.
   */
  foraDoPortal: number
  /** Pleitos só de filiados com carência ligada: o portal pode recusar o voto, e aqui não se sabe a carência de cada um. */
  puladas: number
  falhas: number
  erro?: string
}

/** Janela do lembrete: as últimas 24 h da votação. Num tick diário, cai uma vez em cada uma. */
const JANELA_LEMBRETE_MS = 24 * 60 * 60 * 1000

/** Começo do texto do lembrete — a trava de "uma vez por pessoa e assembleia" procura por ele. */
const PREFIXO_LEMBRETE = "Falta pouco para votar: "

/**
 * Lembrete a quem ainda não votou (A49), para o tick diário — roda FORA de
 * requisição: passe o service client, o tenant da volta do laço e o contexto
 * do e-mail (`contextoDoTenant`), como no tick das cobranças.
 *
 * Quem recebe: apto de assembleia com voto pela internet (online ou híbrida)
 * que está ABERTA, encerra nas próximas 24 h e não teve a apuração
 * encerrada; que ainda não votou na rodada (voto único: presença na urna
 * também conta); e para quem o portal mostra a cédula (`portalMostraACedula`).
 * O aviso leva à cédula; sino sempre, e-mail conforme a preferência
 * "Votações".
 *
 * "Último dia" são as últimas 24 h, não o dia do calendário: as votações
 * reais encerram de manhã (10:00), antes do tick — no próprio dia o lembrete
 * chegaria tarde ou depois do fim. Idempotente: uma vez por pessoa e
 * assembleia (`cpfsJaAvisados` + `umaVez`), rode quantas vezes for.
 */
export async function lembretesUltimoDiaVotacao(amb: {
  client: SupabaseClient
  tenantId: string
  contexto: ContextoEmail
}): Promise<ResultadoLembretesVotacao> {
  const r: ResultadoLembretesVotacao = {
    assembleias: 0,
    avisados: 0,
    porEmail: 0,
    jaAvisados: 0,
    foraDoPortal: 0,
    puladas: 0,
    falhas: 0,
  }
  const db: Leitura = { client: amb.client, tenantId: amb.tenantId }
  const hoje = hojeSP()
  const agora = Date.now()
  try {
    // A janela da assembleia cabe no período da rodada (validarJanelaDaAssembleia;
    // prorrogar estende a rodada junto): rodada já terminada não tem o que lembrar.
    // Rodada sem término (há no legado) entra: a janela vem da assembleia,
    // como no portal.
    const { data: rodadas, error } = await db.client
      .from("voto_rod_assembleias")
      .select("id, nome_assembleia, termino, apuracao_encerrada, campanha:campanha_id (tema)")
      .eq("emp_proprietaria_id", db.tenantId)
      .or(`termino.gte.${hoje},termino.is.null`)
    if (error) throw new Error(`Falha ao ler as rodadas: ${error.message}`)
    if (!rodadas?.length) return r
    const rodadaPorId = new Map(rodadas.map((x) => [String(x.id), x]))

    const { data: brutas, error: erroAssembleias } = await db.client
      .from("voto_assembleias")
      .select(
        "id, nome_assembleia, online, urnas_de_votacao, somente_filiados, data_inicio, data_termino, periodo_inicio, periodo_termino, apuracao_encerrada, rod_assembleia_id" +
          (await colunasDeHorario(db))
      )
      .eq("emp_proprietaria_id", db.tenantId)
      .in("rod_assembleia_id", [...rodadaPorId.keys()])
    if (erroAssembleias) throw new Error(`Falha ao ler as assembleias: ${erroAssembleias.message}`)
    // Select montado (horários só depois do SQL): tipo solto de propósito.
    const assembleias = (brutas ?? []) as unknown as Record<string, unknown>[]
    const porRodada = new Map<string, number>()
    for (const a of assembleias) {
      const k = String(a.rod_assembleia_id)
      porRodada.set(k, (porRodada.get(k) ?? 0) + 1)
    }

    let carencia: boolean | null = null
    for (const a of assembleias) {
      const rodadaId = String(a.rod_assembleia_id)
      const rod = rodadaPorId.get(rodadaId)
      if (!rod || a.apuracao_encerrada === true || rod.apuracao_encerrada === true) continue
      if (!temVotoOnline(derivarModalidade(a))) continue
      // A mesma janela que o portal calcula (assembleiasDoFiliado).
      const fonte = {
        data_inicio: texto(a.data_inicio) ?? texto(a.periodo_inicio),
        hora_inicio: texto(a.hora_inicio),
        data_termino: texto(a.data_termino) ?? texto(a.periodo_termino),
        hora_termino: texto(a.hora_termino),
      }
      const terminoRodada = texto(rod.termino)
      if (situacaoDaAssembleia(fonte, terminoRodada, agora) !== "aberta") continue
      const fim = janelaDaAssembleia(fonte, terminoRodada).termino
      if (fim === null || fim - agora > JANELA_LEMBRETE_MS) continue
      r.assembleias++

      // Pleito só de filiados com carência: o portal recusa o voto de quem
      // está nela, e a carência de cada um não se calcula fora de requisição.
      if (a.somente_filiados === true) {
        carencia ??= await carenciaDeVotoLigada(db)
        if (carencia) {
          r.puladas++
          continue
        }
      }

      await lembrarAssembleia(
        amb,
        {
          id: String(a.id),
          nome: texto(a.nome_assembleia),
          rodadaId,
          rodadaNome: texto(rod.nome_assembleia),
          tema: temaDaCampanha(rod.campanha),
          varias: (porRodada.get(rodadaId) ?? 0) > 1,
        },
        quandoEncerra(fim, hoje),
        r
      )
    }
  } catch (e) {
    r.erro = (e as Error).message
  }
  return r
}

async function lembrarAssembleia(
  amb: { client: SupabaseClient; tenantId: string; contexto: ContextoEmail },
  v: Votacao,
  quando: string,
  r: ResultadoLembretesVotacao
): Promise<void> {
  const db: Leitura = { client: amb.client, tenantId: amb.tenantId }
  const pessoas = new Map<string, { apto: boolean; votou: boolean }>()
  for (const { linha, cpf } of await aptosComCpf(db, { assembleiaId: v.id, rodadaId: v.rodadaId }, false)) {
    const p = pessoas.get(cpf) ?? { apto: false, votou: false }
    // Apto DESTA assembleia: amarrado a ela, ou só na rodada (votacao-escopo.ts).
    if (linha.assembleia_id === v.id || (!linha.assembleia_id && linha.rod_assembleia_id === v.rodadaId)) {
      p.apto = true
    }
    // Voto único por rodada: votou (ou passou pela urna) em qualquer linha dela.
    if (linha.hora_voto || linha.presenca_em) p.votou = true
    pessoas.set(cpf, p)
  }
  const faltam = [...pessoas].filter(([, p]) => p.apto && !p.votou).map(([cpf]) => cpf)
  if (faltam.length === 0) return

  const veem = await portalMostraACedula(db, v.id, faltam)
  r.foraDoPortal += faltam.length - veem.size
  const link = `/portal/votacao/${v.id}`
  const ja = await cpfsJaAvisados(db, link, PREFIXO_LEMBRETE)
  const novos = [...veem].filter(([cpf]) => !ja.has(cpf))
  r.jaAvisados += veem.size - novos.length
  if (novos.length === 0) return

  const rotulo = rotuloDaVotacao(v)
  const assunto = `${PREFIXO_LEMBRETE}${rotulo}`
  const textoAviso = `${PREFIXO_LEMBRETE}a votação ${rotulo} encerra ${quando}, e você ainda não votou.`
  const html =
    tituloEmail(escaparHtml(assunto)) +
    paragrafo(
      `Você está apto a votar em <strong>${escaparHtml(rotulo)}</strong> e ainda não votou. ` +
        `A votação encerra <strong>${escaparHtml(quando)}</strong>.`
    ) +
    botaoEmail(`${amb.contexto.origem}${link}`, "Abrir a cédula") +
    textoSuave(`Se você votou depois deste aviso, desconsidere. ${RODAPE_PREFERENCIAS}`)

  contabilizar(
    await emParalelo(novos, ([cpf, f]) =>
      avisarFiliado(
        { cpf, evento: "votacao", texto: textoAviso, link, assunto, html, umaVez: true, nome: f.nome, email: f.email },
        amb
      )
    ),
    r
  )
}

// ── Resultado publicado (A49) ────────────────────────────────────────────────

export type ResultadoAvisoDoResultado = {
  /** Quem votou nesta assembleia com CPF que o portal reconhece. */
  votantes: number
  avisados: number
  porEmail: number
  jaAvisados: number
  /** Votantes sem filiação ativa: o portal não abre para eles. */
  foraDoPortal: number
  falhas: number
  /** Ficaram para a próxima volta (teto por chamada). */
  restantes: number
  /** A entidade não mostra o resultado no portal (Filiados › Área do associado): ninguém é avisado. */
  resultadoOculto?: boolean
  erro?: string
}

/** Começo do texto do aviso do resultado — a trava de repetição procura por ele. */
const PREFIXO_RESULTADO = "Resultado publicado: "

/** Teto de avisos por chamada: depois da resposta e no tick o tempo é limitado; o resto fica para a próxima volta. */
const RESULTADO_POR_VEZ = 300

/**
 * Avisa quem votou nesta assembleia que o resultado saiu (A49). Recebe quem
 * vê o resultado em Votação → Minhas votações (`minhasVotacoes`):
 * participação registrada (hora_voto) por CPF ou e-mail verificado, filiação
 * ativa, e a participação mostrada NESTA assembleia — a amarrada a ela, a da
 * urna dela ou, para quem está só na rodada, a assembleia principal da rodada
 * (a online primeiro). O voto em si nunca aparece. Sino sempre; e-mail pela
 * preferência "Votações". Só age com a apuração encerrada; idempotente (uma
 * vez por pessoa e assembleia) — reabrir e encerrar de novo não repete.
 *
 * Área do associado (Filiados): com "Mostrar o resultado apurado no
 * histórico" desligada, Minhas votações não mostra o placar — nenhum aviso
 * leva a ele (vale para o encerramento e para o tick). Lida pelo client e
 * tenant da própria função; na dúvida (leitura falhou), avisa como antes.
 * Votação desabilitada já cai no portão de `avisarFiliado` (link de parte
 * desabilitada não sai).
 */
export async function avisarResultadoPublicado(
  assembleiaId: string,
  amb: AmbienteVotacao,
  limite = RESULTADO_POR_VEZ
): Promise<ResultadoAvisoDoResultado> {
  const r: ResultadoAvisoDoResultado = {
    votantes: 0,
    avisados: 0,
    porEmail: 0,
    jaAvisados: 0,
    foraDoPortal: 0,
    falhas: 0,
    restantes: 0,
  }
  try {
    let db = await leitura(amb)
    const opcoes = await opcoesDaParte("votacao", db).catch(() => null)
    if (opcoes && !opcoes.mostrar_resultado) {
      r.resultadoOculto = true
      return r
    }
    const { data: a } = await db.client
      .from("voto_assembleias")
      .select("id, nome_assembleia, apuracao_encerrada, rod_assembleia_id")
      .eq("id", assembleiaId)
      .eq("emp_proprietaria_id", db.tenantId)
      .maybeSingle()
    if (!a || a.apuracao_encerrada !== true) return r
    const rodadaId = texto(a.rod_assembleia_id)

    let rodadaNome: string | null = null
    let tema: string | null = null
    let irmas: string[] = []
    if (rodadaId) {
      const [{ data: rod }, { data: daRodada }] = await Promise.all([
        db.client
          .from("voto_rod_assembleias")
          .select("nome_assembleia, campanha:campanha_id (tema)")
          .eq("id", rodadaId)
          .eq("emp_proprietaria_id", db.tenantId)
          .maybeSingle(),
        // Ordem de assembleiaPrincipalDasRodadas: a online primeiro, depois a mais antiga.
        db.client
          .from("voto_assembleias")
          .select("id")
          .eq("emp_proprietaria_id", db.tenantId)
          .eq("rod_assembleia_id", rodadaId)
          .order("online", { ascending: false })
          .order("created_at", { ascending: true }),
      ])
      rodadaNome = texto(rod?.nome_assembleia)
      tema = temaDaCampanha(rod?.campanha)
      irmas = (daRodada ?? []).map((x) => String(x.id))
    }
    const principal = irmas[0] ?? null

    const pares = await aptosComCpf(db, { assembleiaId, rodadaId }, true)
    // Urna da presença → assembleia: é onde Minhas votações mostra quem está só na rodada.
    const urnaIds = [
      ...new Set(
        pares
          .filter(({ linha }) => !linha.assembleia_id && linha.presenca_urna_id)
          .map(({ linha }) => String(linha.presenca_urna_id))
      ),
    ]
    const assembleiaDaUrna = new Map<string, string>()
    for (let i = 0; i < urnaIds.length; i += 200) {
      const { data: urnas } = await db.client
        .from("voto_urnas")
        .select("id, assembleia_id")
        .eq("emp_proprietaria_id", db.tenantId)
        .in("id", urnaIds.slice(i, i + 200))
      for (const u of urnas ?? []) assembleiaDaUrna.set(String(u.id), String(u.assembleia_id))
    }
    const cpfs = new Set<string>()
    for (const { linha, cpf } of pares) {
      const onde =
        texto(linha.assembleia_id) ??
        (linha.presenca_urna_id ? assembleiaDaUrna.get(String(linha.presenca_urna_id)) : undefined) ??
        (linha.rod_assembleia_id === rodadaId ? principal : null)
      if (onde === assembleiaId) cpfs.add(cpf)
    }
    r.votantes = cpfs.size
    if (cpfs.size === 0) return r

    db = await leitura(amb)
    const filiados = await filiadosDosCpfs(db, [...cpfs])
    const ativos = [...filiados].filter(([, f]) => f.ativo)
    r.foraDoPortal = cpfs.size - ativos.length
    // O resultado fica no histórico de /portal/votacao; a âncora leva ao item.
    const link = `/portal/votacao#votacao-${assembleiaId}`
    const ja = await cpfsJaAvisados(db, link, PREFIXO_RESULTADO)
    const novos = ativos.filter(([cpf]) => !ja.has(cpf))
    r.jaAvisados = ativos.length - novos.length
    const agora = novos.slice(0, Math.max(0, limite))
    r.restantes = novos.length - agora.length
    if (agora.length === 0) return r

    const rotulo = rotuloDaVotacao({
      id: assembleiaId,
      nome: texto(a.nome_assembleia),
      rodadaId,
      rodadaNome,
      tema,
      varias: irmas.length > 1,
    })
    const assunto = `${PREFIXO_RESULTADO}${rotulo}`
    const textoAviso = `${PREFIXO_RESULTADO}${rotulo}. Veja em Votação → Minhas votações.`
    const html =
      tituloEmail(escaparHtml(assunto)) +
      paragrafo(
        `A apuração de <strong>${escaparHtml(rotulo)}</strong> foi encerrada e o resultado já está no portal, ` +
          "em Votação → Minhas votações — junto, quando houver, do comprovante da sua participação."
      ) +
      botaoEmail(`${amb.contexto.origem}${link}`, "Ver o resultado") +
      textoSuave(RODAPE_PREFERENCIAS)

    // Sem client fixo (depois da resposta), cada aviso abre o seu — ver AmbienteVotacao.
    contabilizar(
      await emParalelo(agora, ([cpf, f]) =>
        avisarFiliado(
          { cpf, evento: "votacao", texto: textoAviso, link, assunto, html, umaVez: true, nome: f.nome, email: f.email },
          amb
        )
      ),
      r
    )
  } catch (e) {
    r.erro = (e as Error).message
  }
  return r
}

/**
 * No encerramento da apuração (encerrarApuracao, assembleias.ts): avisa quem
 * votou DEPOIS da resposta (`after`), para o gestor não esperar centenas de
 * e-mails. Entidade, origem e tenant são lidos aqui, ainda na requisição; o
 * client, não (o JWT do tenant vence em 60 s — ver AmbienteVotacao). O que
 * não couber nesta volta, o tick diário termina (lembretesResultadoVotacao).
 * Nunca derruba o encerramento.
 */
export async function agendarAvisoDoResultado(assembleiaId: string): Promise<void> {
  try {
    const [tenantId, entidade, emailContato, origem] = await Promise.all([
      tenantAtual(),
      nomeEntidade(),
      emailContatoEntidade(),
      origemAtual(),
    ])
    const amb: AmbienteVotacao = { tenantId, contexto: { entidade, emailContato, origem } }
    after(async () => {
      const r = await avisarResultadoPublicado(assembleiaId, amb)
      if (r.erro) console.error("[votacao] aviso do resultado:", r.erro)
    })
  } catch (e) {
    console.error("[votacao] aviso do resultado:", e)
  }
}

export type ResultadoLembretesResultado = {
  /** Apurações encerradas na janela que tinham votantes reconhecidos pelo portal. */
  assembleias: number
  avisados: number
  porEmail: number
  restantes: number
  falhas: number
  erro?: string
}

/** Por quanto tempo depois do encerramento o tick ainda completa os avisos do resultado. */
const JANELA_RESULTADO_MS = 48 * 60 * 60 * 1000

/**
 * Para o tick diário (fora de requisição; ambiente como em
 * lembretesUltimoDiaVotacao): completa o aviso de resultado das apurações
 * encerradas nas últimas 48 h — o `after` do encerramento tem tempo limitado
 * e pode não ter terminado. A marca do encerramento é o snapshot em
 * voto_resultado_final, regravado a cada encerramento; assembleia sem
 * perguntas não tem snapshot e fica só com o aviso do encerramento.
 * Idempotente: quem já foi avisado não recebe de novo.
 */
export async function lembretesResultadoVotacao(amb: {
  client: SupabaseClient
  tenantId: string
  contexto: ContextoEmail
}): Promise<ResultadoLembretesResultado> {
  const r: ResultadoLembretesResultado = { assembleias: 0, avisados: 0, porEmail: 0, restantes: 0, falhas: 0 }
  try {
    const desde = new Date(Date.now() - JANELA_RESULTADO_MS).toISOString()
    const linhas = await lerEmLotes<{ assembleia_id: string }>((de, ate) =>
      amb.client
        .from("voto_resultado_final")
        .select("id, assembleia_id")
        .eq("emp_proprietaria_id", amb.tenantId)
        .gte("created_at", desde)
        .order("id")
        .range(de, ate)
    )
    const erros: string[] = []
    for (const id of new Set(linhas.map((l) => String(l.assembleia_id)))) {
      const x = await avisarResultadoPublicado(id, amb)
      if (x.erro) erros.push(x.erro)
      if (x.votantes > 0) r.assembleias++
      r.avisados += x.avisados
      r.porEmail += x.porEmail
      r.restantes += x.restantes
      r.falhas += x.falhas
    }
    if (erros.length) r.erro = erros.join(" · ")
  } catch (e) {
    if (!esquemaAusente(e as { code?: string })) r.erro = (e as Error).message
  }
  return r
}
