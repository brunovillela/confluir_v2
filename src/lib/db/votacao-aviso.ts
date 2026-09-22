import "server-only"

import {
  derivarModalidade,
  temVotoOnline,
} from "@/lib/assembleias-constantes"
import { cpfConfiavel, formatarCpf } from "@/lib/cpf"
import { esquemaAusente } from "@/lib/db/comum"
import {
  assuntoAvisoAptos,
  montarEmailAvisoAptos,
  type DadosAvisoAptos,
  type DestinatarioAviso,
} from "@/lib/email-aviso-aptos"
import { enviarEmail } from "@/lib/email"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * Aviso por e-mail aos aptos de uma rodada ("você está habilitado a votar").
 *
 * O envio é em LOTES: cada chamada processa até `limite` aptos pendentes
 * (aviso_email_em nulo) e marca cada um — enviado, sem e-mail, e-mail repetido
 * ou falha do provedor. A tela chama de novo até zerar; se a pessoa fechar a
 * página, o próximo clique continua de onde parou. Quem entra na lista depois
 * fica pendente e recebe só o dele. Colunas: supabase/aptos-aviso-email.sql.
 *
 * Para onde vai: o e-mail corporativo do apto (a pessoa entra por ele); sem
 * ele, o e-mail do filiado dono do CPF (entra pelo CPF). Sem nenhum dos dois,
 * o apto fica marcado como "sem e-mail".
 */

export type ResumoAvisoAptos = {
  /** false = falta rodar supabase/aptos-aviso-email.sql. */
  esquemaPronto: boolean
  total: number
  enviados: number
  pendentes: number
  semEmail: number
  duplicados: number
  falhas: number
  ultimoEnvio: string | null
}

export type ResultadoLoteAviso = {
  processados: number
  enviados: number
  semEmail: number
  duplicados: number
  falhas: number
  restantes: number
}

async function contar(
  rodadaId: string,
  filtro: (q: ReturnType<typeof base>) => ReturnType<typeof base>
): Promise<number> {
  const { count } = await filtro(base(await createAdminClient(), rodadaId))
  return count ?? 0
}

function base(admin: Awaited<ReturnType<typeof createAdminClient>>, rodadaId: string) {
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
      return { esquemaPronto: false, total: 0, enviados: 0, pendentes: 0, semEmail: 0, duplicados: 0, falhas: 0, ultimoEnvio: null }
    }
    throw new Error(`Falha ao ler os avisos: ${sonda.error.message}`)
  }
  const [total, pendentes, enviados, semEmail, duplicados, falhas] = await Promise.all([
    contar(rodadaId, (q) => q),
    contar(rodadaId, (q) => q.is("aviso_email_em", null)),
    contar(rodadaId, (q) => q.not("aviso_email_em", "is", null).is("aviso_email_erro", null)),
    contar(rodadaId, (q) => q.eq("aviso_email_erro", "sem_email")),
    contar(rodadaId, (q) => q.eq("aviso_email_erro", "duplicado")),
    contar(rodadaId, (q) => q.eq("aviso_email_erro", "falha")),
  ])
  return {
    esquemaPronto: true,
    total,
    pendentes,
    enviados,
    semEmail,
    duplicados,
    falhas,
    ultimoEnvio: (sonda.data?.[0]?.aviso_email_em as string | undefined) ?? null,
  }
}

/** O conteúdo comum a todos os e-mails da rodada. Erro quando não dá para avisar. */
export async function dadosDoAviso(
  rodadaId: string
): Promise<{ dados?: DadosAvisoAptos; erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: rodada } = await admin
    .from("voto_rod_assembleias")
    .select("id, nome_assembleia, inicio, termino, campanha:campanha_id (tema)")
    .eq("id", rodadaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!rodada) return { erro: "Rodada não encontrada." }
  const termino = rodada.termino as string | null
  if (termino && termino.slice(0, 10) < new Date().toISOString().slice(0, 10)) {
    return { erro: "O período desta rodada já terminou — não há mais o que avisar." }
  }

  const { data: assembleias } = await admin
    .from("voto_assembleias")
    .select("id, nome_assembleia, online, urnas_de_votacao, data_inicio, data_termino, created_at")
    .eq("rod_assembleia_id", rodadaId)
    .eq("emp_proprietaria_id", emp)
    .order("data_inicio", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
  const lista = (assembleias ?? []).map((a) => ({
    id: String(a.id),
    nome: (a.nome_assembleia as string | null) ?? null,
    modalidade: derivarModalidade(a),
    data_inicio: (a.data_inicio as string | null) ?? null,
    data_termino: (a.data_termino as string | null) ?? null,
  }))
  if (lista.length === 0) {
    return { erro: "Cadastre ao menos uma assembleia na rodada antes de avisar os aptos." }
  }

  const online = lista.find((a) => temVotoOnline(a.modalidade))
  const origem = await origemAtual()
  const campanha = rodada.campanha as { tema?: string | null } | { tema?: string | null }[] | null
  const tema = Array.isArray(campanha) ? campanha[0]?.tema : campanha?.tema
  return {
    dados: {
      rodadaNome: (rodada.nome_assembleia as string | null) ?? "Rodada de assembleias",
      campanhaTema: tema ?? null,
      inicio: (rodada.inicio as string | null) ?? null,
      termino,
      assembleias: lista.map(({ nome, modalidade, data_inicio, data_termino }) => ({
        nome,
        modalidade,
        data_inicio,
        data_termino,
      })),
      link: online ? `${origem}/votar/${online.id}` : `${origem}/portal/votacao`,
      assembleiaOnlineId: online?.id ?? null,
      temOnline: Boolean(online),
      temPresencial: lista.some((a) => a.modalidade !== "online"),
    },
  }
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
}

const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Processa até `limite` aptos pendentes da rodada. */
export async function enviarLoteAviso(
  rodadaId: string,
  limite = 60
): Promise<{ resultado?: ResultadoLoteAviso; erro?: string }> {
  if (!process.env.BREVO_API_KEY || !process.env.EMAIL_REMETENTE) {
    return { erro: "O envio de e-mails não está configurado neste ambiente." }
  }
  const { dados, erro } = await dadosDoAviso(rodadaId)
  if (!dados) return { erro }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("voto_assembleias_aptos")
    .select("id, cpf, nome_completo, email_corporativo")
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
  const origem = await origemAtual()
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
      .eq("rod_assembleia_id", rodadaId)
      .is("aviso_email_erro", null)
      .in("aviso_email_para", emails)
    for (const a of avisados ?? []) jaAvisados.add(String(a.aviso_email_para))
  }

  const resultado: ResultadoLoteAviso = {
    processados: aptos.length,
    enviados: 0,
    semEmail: 0,
    duplicados: 0,
    falhas: 0,
    restantes: 0,
  }
  const marcacoes: { ids: string[]; para: string | null; erro: string | null }[] = []
  const envios: { id: string; destino: DestinatarioAviso }[] = []
  const vistosNoLote = new Set<string>()
  for (const { apto, destino } of planos) {
    if (!destino) {
      resultado.semEmail++
      marcacoes.push({ ids: [apto.id], para: null, erro: "sem_email" })
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
        })
      )
    )
    fatia.forEach((e, j) => {
      if (oks[j]) resultado.enviados++
      else resultado.falhas++
      marcacoes.push({ ids: [e.id], para: e.destino.email, erro: oks[j] ? null : "falha" })
    })
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
  for (const g of grupos.values()) {
    await admin
      .from("voto_assembleias_aptos")
      .update({ aviso_email_em: agora, aviso_email_para: g.para, aviso_email_erro: g.erro })
      .in("id", g.ids)
  }

  resultado.restantes = await contar(rodadaId, (q) => q.is("aviso_email_em", null))
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
  return error ? { erro: `Não foi possível reabrir: ${error.message}` } : {}
}
