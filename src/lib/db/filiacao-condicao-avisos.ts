import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { cpfConfiavel, grafiasDoCpf } from "@/lib/cpf"
import { texto } from "@/lib/db/comum"
import { contextoDoTenant } from "@/lib/db/comunicacao-mensagens"
import { avisarFiliado, type AvisoPortal } from "@/lib/db/portal-avisos"
import { lerConfigPortal } from "@/lib/db/portal-partes"
import { type ContextoEmail } from "@/lib/email"
import { botaoEmail, paragrafo, textoSuave, tituloEmail } from "@/lib/email-layout"
import { ORDEM_DESFILIACAO, ORDEM_FILIACAO, ORDEM_FILIACAO_COLETIVA } from "@/lib/filiacao"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * DECISÕES SOBRE A FILIAÇÃO QUE A PESSOA PRECISA SABER (A58): a filiação
 * ficou ativa, a desfiliação foi concluída. Os pontos que levam a condição a
 * Ativo/Inativo (avançar etapa, conferência da remessa, maturação da
 * coletiva) passam as mudanças para cá; só as transições que fecham uma
 * trilha viram aviso:
 *
 * - de uma etapa da filiação (individual ou coletiva) para Ativo → boas-vindas;
 * - de uma etapa da desfiliação para Inativo → desfiliação concluída.
 *
 * Inativar quem estava Ativo e parou de pagar NÃO é desfiliação pedida pela
 * pessoa: não avisa. Também não avisa quem tem outro cadastro Ativo do mesmo
 * CPF — para essa pessoa nada mudou. Uma vez por fato: o texto leva a data e
 * o `umaVez` do aviso não o repete.
 *
 * Evento "filiacao" (Filiação e oposição): sino + e-mail conforme a
 * preferência. Quem foi desfiliado não entra mais no portal, então o e-mail é
 * o canal que conta; o sino fica como registro.
 */

export type MudancaDeCondicao = { id: string; anterior: string | null; nova: string }

type Ambiente = {
  client?: SupabaseClient
  tenantId?: string
  contexto?: ContextoEmail
  /** Tick sem requisição do tenant: a identidade do e-mail vem do próprio tenant (A19). */
  foraDaRequisicao?: boolean
}

const RUMO_A_ATIVO = new Set<string>([...ORDEM_FILIACAO, ...ORDEM_FILIACAO_COLETIVA].filter((c) => c !== "Ativo"))
const RUMO_A_INATIVO = new Set<string>(ORDEM_DESFILIACAO.filter((c) => c !== "Inativo"))

const PREFERENCIAS =
  "Você pode escolher quais avisos recebe por e-mail em Portal → Avisos → Preferências."

/**
 * "11/10/2026" no fuso de São Paulo. Data pura passa direto — inclusive a que
 * a maturação da coletiva grava (`ativo_em: hoje`) e volta do banco como
 * meia-noite UTC: convertida para São Paulo, viraria o dia anterior.
 */
function dataBR(valor: string | null): string {
  const v = valor ?? new Date().toISOString()
  const soData = /^(\d{4})-(\d{2})-(\d{2})(T00:00:00(\.0+)?(Z|\+00(:00)?))?$/.exec(v)
  if (soData) return `${soData[3]}/${soData[2]}/${soData[1]}`
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(v))
}

export async function avisarMudancasDeCondicao(
  mudancas: MudancaDeCondicao[],
  amb: Ambiente = {}
): Promise<{ boasVindas: number; desfiliacoes: number }> {
  const resultado = { boasVindas: 0, desfiliacoes: 0 }
  const ativados = new Set(
    mudancas.filter((m) => m.nova === "Ativo" && RUMO_A_ATIVO.has(m.anterior ?? "")).map((m) => m.id)
  )
  const desfiliados = new Set(
    mudancas.filter((m) => m.nova === "Inativo" && RUMO_A_INATIVO.has(m.anterior ?? "")).map((m) => m.id)
  )
  if (ativados.size === 0 && desfiliados.size === 0) return resultado

  const client = amb.client ?? (await createAdminClient())
  const tenantId = amb.tenantId ?? (await tenantAtual())
  const contexto = amb.contexto ?? (amb.foraDaRequisicao ? await contextoDoTenant(tenantId, client) : undefined)
  const origem = contexto?.origem ?? (await origemAtual().catch(() => ""))

  type Linha = {
    id: string
    cpf: string | null
    nome_completo: string | null
    email_pessoal: string | null
    email_corporativo: string | null
    filiacao_condicao: string | null
    ativo_em: string | null
    inativo_em: string | null
  }
  const ids = [...ativados, ...desfiliados]
  const linhas: Linha[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await client
      .from("filiacoes")
      .select("id, cpf, nome_completo, email_pessoal, email_corporativo, filiacao_condicao, ativo_em, inativo_em")
      .eq("emp_proprietaria_id", tenantId)
      .in("id", ids.slice(i, i + 100))
      .not("filiacao_excluida", "is", true)
    linhas.push(...((data ?? []) as Linha[]))
  }

  // Outro cadastro Ativo do mesmo CPF (fora destas ativações): para essa
  // pessoa a filiação não começou nem acabou agora.
  const cpfs = [...new Set(linhas.map((l) => cpfConfiavel(l.cpf)).filter((c): c is string => Boolean(c)))]
  const grafias = cpfs.flatMap((c) => grafiasDoCpf(c))
  const comOutroAtivo = new Set<string>()
  for (let i = 0; i < grafias.length; i += 200) {
    const { data } = await client
      .from("filiacoes")
      .select("id, cpf")
      .eq("emp_proprietaria_id", tenantId)
      .in("cpf", grafias.slice(i, i + 200))
      .eq("filiacao_condicao", "Ativo")
      .not("filiacao_excluida", "is", true)
    for (const f of data ?? []) {
      if (ativados.has(String(f.id))) continue
      const cpf = cpfConfiavel(f.cpf as string | null)
      if (cpf) comOutroAtivo.add(cpf)
    }
  }

  // Filiados › Área do associado: as boas-vindas só prometem o que o portal
  // mostra (Carteirinha e Contribuição podem estar desabilitadas). Na dúvida, vale.
  const partes = ativados.size > 0 ? await lerConfigPortal({ client, tenantId }).catch(() => null) : null
  const comCarteirinha = partes?.partes.carteirinha.estado !== "desabilitada"
  const comContribuicao = partes?.partes.contribuicao.estado !== "desabilitada"
  const oQueFaz = [
    comContribuicao ? "acompanha a sua contribuição" : null,
    comCarteirinha ? "vê a carteirinha" : null,
    "usa os serviços para associados",
  ].filter((t): t is string => t !== null)
  // "a, b e c"
  const noPortal =
    oQueFaz.length === 1 ? oQueFaz[0] : `${oQueFaz.slice(0, -1).join(", ")} e ${oQueFaz[oQueFaz.length - 1]}`

  const avisos: { tipo: keyof typeof resultado; aviso: AvisoPortal }[] = []
  const vistos = new Set<string>()
  for (const l of linhas) {
    const cpf = cpfConfiavel(l.cpf)
    if (!cpf || comOutroAtivo.has(cpf) || vistos.has(cpf)) continue
    const email = (texto(l.email_pessoal) ?? texto(l.email_corporativo))?.trim() ?? null
    const nome = texto(l.nome_completo)

    // A condição gravada tem de ser a que mudou: outra ação pode ter passado à frente.
    if (ativados.has(l.id) && l.filiacao_condicao === "Ativo") {
      vistos.add(cpf)
      const desde = dataBR(l.ativo_em)
      avisos.push({
        tipo: "boasVindas",
        aviso: {
          cpf,
          nome,
          email,
          evento: "filiacao",
          umaVez: true,
          link: "/portal/inicio",
          assunto: "Boas-vindas: sua filiação está ativa",
          texto: `Sua filiação está ativa desde ${desde}. Boas-vindas! ${
            comCarteirinha
              ? "No portal você encontra sua carteirinha e os serviços para associados."
              : "No portal você encontra os serviços para associados."
          }`,
          html:
            tituloEmail("Boas-vindas!") +
            paragrafo(`Sua filiação a {ENTIDADE} está ativa desde <strong>${desde}</strong>.`) +
            paragrafo(`No portal do associado você ${noPortal}.`) +
            (origem ? botaoEmail(`${origem}/portal/inicio`, "Entrar no portal") : "") +
            textoSuave(PREFERENCIAS),
        },
      })
    } else if (desfiliados.has(l.id) && l.filiacao_condicao === "Inativo") {
      vistos.add(cpf)
      const em = dataBR(l.inativo_em)
      avisos.push({
        tipo: "desfiliacoes",
        aviso: {
          cpf,
          nome,
          email,
          evento: "filiacao",
          umaVez: true,
          link: "/portal/cadastro",
          assunto: "Sua desfiliação foi concluída",
          texto: `Sua desfiliação foi concluída em ${em}. A mensalidade deixa de ser cobrada; se ainda aparecer desconto no contracheque, procure a entidade.`,
          // Sem botão para o portal: quem foi desfiliado não entra mais nele.
          html:
            tituloEmail("Desfiliação concluída") +
            paragrafo(`Sua desfiliação de {ENTIDADE} foi concluída em <strong>${em}</strong>. O que muda:`) +
            paragrafo(
              "• a mensalidade deixa de ser cobrada — se ainda aparecer desconto no contracheque, procure a entidade;<br>" +
                "• o acesso ao portal do associado e aos serviços para associados se encerra;<br>" +
                "• se quiser voltar a se filiar, é só procurar a entidade."
            ),
        },
      })
    }
  }

  // Cinco por vez: um lote da conferência ou da coletiva pode ter centenas.
  for (let i = 0; i < avisos.length; i += 5) {
    const lote = avisos.slice(i, i + 5)
    const saidas = await Promise.all(lote.map((a) => avisarFiliado(a.aviso, { client, tenantId, contexto })))
    saidas.forEach((ok, j) => {
      if (ok) resultado[lote[j].tipo]++
    })
  }
  return resultado
}
