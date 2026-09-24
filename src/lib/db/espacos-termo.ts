import "server-only"

import { esquemaAusente, texto } from "@/lib/db/comum"
import { obterSolicitacao } from "@/lib/db/espacos-esteira"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { codigoVersao, renderizarTermo, type DadosTermo } from "@/lib/espacos-termo"
import { totalExigencias } from "@/lib/espacos-constantes"
import { formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Cessão de espaços — fase 4: o modelo do termo (versionado) e o termo de cada
 * cessão (renderizado e congelado). Ver supabase/cessao-termo.sql.
 */

export const AVISO_SQL_TERMO =
  "Termo de cessão ainda não configurado — rode supabase/cessao-termo.sql no SQL Editor do Supabase."

export type VersaoTermo = {
  id: string
  texto: string | null
  codigo: string | null
  emVigor: boolean
  created_at: string | null
}

export async function listarVersoesTermo(): Promise<{
  versoes: VersaoTermo[]
  esquemaPronto: boolean
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("cessao_termos")
    .select("id, texto, codigo, em_vigor, created_at")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("em_vigor", { ascending: false })
    .order("created_at", { ascending: false, nullsFirst: false })
  if (error) {
    if (esquemaAusente(error)) return { versoes: [], esquemaPronto: false }
    throw new Error(`Falha ao listar as versões do termo: ${error.message}`)
  }
  return {
    esquemaPronto: true,
    versoes: (data ?? []).map((v) => ({
      id: String(v.id),
      texto: texto(v.texto),
      codigo: texto(v.codigo),
      emVigor: v.em_vigor === true,
      created_at: texto(v.created_at),
    })),
  }
}

export async function termoVigente(): Promise<VersaoTermo | null> {
  const { versoes } = await listarVersoesTermo()
  return versoes.find((v) => v.emVigor) ?? null
}

/**
 * Salvar SEMPRE cria uma versão nova — não se edita um texto que já pode ter
 * sido usado numa cessão. A nova entra em vigor e a anterior vira histórico.
 */
export async function salvarVersaoTermo(
  textoNovo: string,
  usuarioId: string
): Promise<{ erro?: string; id?: string }> {
  if (!textoNovo.trim()) return { erro: "O texto do termo não pode ficar vazio." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  await admin
    .from("cessao_termos")
    .update({ em_vigor: false, updated_at: new Date().toISOString() })
    .eq("emp_proprietaria_id", emp)
    .eq("em_vigor", true)

  const { data, error } = await admin
    .from("cessao_termos")
    .insert({
      texto: textoNovo.trim(),
      codigo: codigoVersao(),
      em_vigor: true,
      criado_por_id: usuarioId,
      emp_proprietaria_id: emp,
    })
    .select("id")
    .single()
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_TERMO }
    return { erro: `Não foi possível salvar: ${error.message}` }
  }
  return { id: String(data.id) }
}

export async function reativarVersaoTermo(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  await admin
    .from("cessao_termos")
    .update({ em_vigor: false })
    .eq("emp_proprietaria_id", emp)
    .eq("em_vigor", true)
  const { error } = await admin
    .from("cessao_termos")
    .update({ em_vigor: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
  return error ? { erro: `Não foi possível reativar: ${error.message}` } : {}
}

// ── O termo de uma cessão ────────────────────────────────────────────────────

const dataHora = (iso: string | null): string =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(iso))
    : ""

/** Os dados desta cessão, na forma que o termo espera. */
export async function dadosDoTermo(solicitacaoId: string): Promise<DadosTermo | null> {
  const [pedido, org] = await Promise.all([
    obterSolicitacao(solicitacaoId),
    obterOrganizacao(),
  ])
  if (!pedido) return null

  const admin = await createAdminClient()
  const { data: espaco } = await admin
    .from("cessao_espacos")
    .select("sede_id")
    .eq("id", pedido.espacoId)
    .maybeSingle()
  const { data: sede } = espaco?.sede_id
    ? await admin.from("empresa_sede").select("nome, cidade").eq("id", espaco.sede_id).maybeSingle()
    : { data: null }

  const totais = totalExigencias(pedido.exigencias)
  const listaExigencias =
    pedido.exigencias.length === 0
      ? "Não há exigências específicas de segurança para este evento."
      : pedido.exigencias
          .map(
            (e) =>
              `- ${e.motivo}: ` +
              [
                e.bombeiros > 0 &&
                  `${e.bombeiros} bombeiro${e.bombeiros === 1 ? " civil" : "s civis"}`,
                e.segurancas > 0 &&
                  `${e.segurancas} segurança${e.segurancas === 1 ? "" : "s"}`,
                e.observacao,
              ]
                .filter(Boolean)
                .join(", ")
          )
          .join("\n") +
        `\nTotal: ${totais.bombeiros} bombeiro${totais.bombeiros === 1 ? " civil" : "s civis"} e ${totais.segurancas} segurança${totais.segurancas === 1 ? "" : "s"}.`

  const custeio =
    pedido.custeio.valor === null || pedido.custeio.valor === 0
      ? "A cessão não tem custeio para o CONCESSIONÁRIO."
      : pedido.custeio.itens
          .map((i) => `- ${i.descricao ?? "Item"}: ${formatarMoeda(i.valor)}`)
          .join("\n") +
        `\nTotal: ${formatarMoeda(pedido.custeio.valor)}.` +
        (pedido.custeio.observacao ? `\n${pedido.custeio.observacao}` : "")

  const cidade = texto(sede?.cidade) ?? texto(sede?.nome) ?? ""
  const hoje = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date())

  return {
    entidade: org?.nomeRazao ?? org?.nomeFantasia ?? "a entidade",
    concessionario: pedido.entidade
      ? `${pedido.solicitante} (${pedido.entidade})`
      : pedido.solicitante,
    espaco: pedido.espacoNome,
    sede: texto(sede?.nome) ?? "",
    finalidade: pedido.finalidade ?? "",
    publico: pedido.publicoEstimado ? String(pedido.publicoEstimado) : "não informado",
    inicio: dataHora(pedido.inicio),
    termino: dataHora(pedido.termino),
    montagem: pedido.montagemInicio
      ? `Montagem liberada a partir de ${dataHora(pedido.montagemInicio)}.`
      : "",
    desmontagem: pedido.desmontagemTermino
      ? `Desmontagem até ${dataHora(pedido.desmontagemTermino)}.`
      : "",
    representante: pedido.representanteNome
      ? pedido.representanteNome +
        (pedido.representanteTelefone ? ` — ${pedido.representanteTelefone}` : "")
      : pedido.solicitante,
    responsavel_visita: pedido.visita.responsavelNome ?? "a ser designado",
    exigencias: listaExigencias,
    custeio,
    local_data: cidade ? `${cidade}, ${hoje}.` : `${hoje}.`,
  }
}

/**
 * Gera (ou regera) o termo desta cessão a partir do modelo VIGENTE e congela o
 * texto com o código da versão. Regerar é permitido enquanto ninguém assinou —
 * a fase 5 tranca isso.
 */
export async function gerarTermoDaCessao(
  solicitacaoId: string,
  usuarioId: string
): Promise<{ erro?: string; codigo?: string }> {
  const modelo = await termoVigente()
  if (!modelo?.texto) {
    return {
      erro: "Não há modelo de termo em vigor. Escreva o modelo em Cessão de espaços › Termo.",
    }
  }
  const dados = await dadosDoTermo(solicitacaoId)
  if (!dados) return { erro: "Pedido não encontrado." }

  const admin = await createAdminClient()
  const { error } = await admin
    .from("cessao_solicitacoes")
    .update({
      termo_texto: renderizarTermo(modelo.texto, dados),
      termo_codigo: modelo.codigo,
      termo_gerado_em: new Date().toISOString(),
      termo_gerado_por_id: usuarioId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", solicitacaoId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_TERMO }
    return { erro: `Não foi possível gerar o termo: ${error.message}` }
  }
  await admin.from("cessao_solicitacao_eventos").insert({
    solicitacao_id: solicitacaoId,
    tipo: "termo_gerado",
    detalhe: `Versão ${modelo.codigo}`,
    usuario_id: usuarioId,
    emp_proprietaria_id: await tenantAtual(),
  })
  return { codigo: modelo.codigo ?? undefined }
}

export type TermoDaCessao = {
  texto: string | null
  codigo: string | null
  geradoEm: string | null
  /** Preenchido quando as DUAS partes assinaram (fase 5). */
  assinadoEm: string | null
}

const VAZIO: TermoDaCessao = {
  texto: null,
  codigo: null,
  geradoEm: null,
  assinadoEm: null,
}

export async function termoDaCessao(
  solicitacaoId: string
): Promise<TermoDaCessao> {
  const admin = await createAdminClient()
  // `select("*")` de propósito: `termo_assinado_em` só existe depois do SQL da
  // assinatura, e pedir a coluna pelo nome quebraria antes disso.
  const { data, error } = await admin
    .from("cessao_solicitacoes")
    .select("*")
    .eq("id", solicitacaoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error || !data) return VAZIO
  return {
    texto: texto(data.termo_texto),
    codigo: texto(data.termo_codigo),
    geradoEm: texto(data.termo_gerado_em),
    assinadoEm: texto(data.termo_assinado_em),
  }
}
