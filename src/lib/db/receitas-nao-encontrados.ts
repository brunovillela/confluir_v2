import "server-only"

import { cpfConfiavel, limparCpf, validarCpf } from "@/lib/cpf"
import { invalidarCacheCadastrosPendentes } from "@/lib/db/filiacao-cadastros-pendentes"
import { cadastrarNaFonte } from "@/lib/db/filiacao-cadastro-na-fonte"
import { buscarFontePagadora, invalidarCacheFontes } from "@/lib/db/fontes"
import { invalidarCacheRemessa, registrarFormaNoCadastro } from "@/lib/db/receitas"
import { type FormaRecebimento, formaRecebimento } from "@/lib/filiacao"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Cadastro em massa dos "Não encontrados no cadastro" de uma fonte na
 * remessa (13/10/2026). Cada lançamento marcado vira um filiado ATIVO da
 * fonte, com os dados da própria relação: o nome (digitado ou o que veio na
 * lista), o CPF quando veio e a matrícula na fonte, que vai para o vínculo.
 *
 *  - CPF que já está num cadastro: não duplica — o lançamento passa a apontar
 *    para esse cadastro, que fica Ativo e ganha o vínculo na fonte se não tiver.
 *  - Mesma pessoa em mais de uma linha marcada (mesmo CPF ou matrícula na
 *    fonte): um cadastro só, e todas as linhas apontam para ele.
 *  - Sem CPF: o cadastro nasce assim mesmo — a relação da empresa raramente
 *    traz CPF — e aparece na saúde dos cadastros como "CPF ausente".
 * O lançamento é ligado ao filiado (sai de "não encontrados") e a forma de
 * recebimento dele vai para o cadastro.
 *
 * Criar, ativar, abrir o vínculo e anotar no prontuário é o núcleo comum com a
 * lista de trabalhadores (filiacao-cadastro-na-fonte.ts); aqui ficam o
 * agrupamento das linhas, a ligação dos lançamentos e a forma de recebimento.
 */

export const MAX_CADASTRO_LOTE = 500

export type ItemCadastro = { lancamentoId: string; nome: string }

export type ResultadoCadastro = {
  criados: number
  reaproveitados: number
  erros: { nome: string; motivo: string }[]
}

type Lancamento = {
  id: string
  cpf: string | null
  fonte_pg_matricula: string | null
  forma_recebimento: string | null
}

export async function cadastrarNaoEncontrados(
  remessaId: string,
  fonteId: string,
  itens: ItemCadastro[],
  usuarioId: string | null = null
): Promise<{ resultado?: ResultadoCadastro; erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const fonte = await buscarFontePagadora(fonteId)
  if (!fonte) return { erro: "Fonte pagadora não encontrada." }

  // Relê do banco só lançamentos desta remessa e fonte que seguem sem filiado.
  const ids = [...new Set(itens.map((i) => i.lancamentoId))]
  const lancamentos = new Map<string, Lancamento>()
  for (let de = 0; de < ids.length; de += 200) {
    const { data, error } = await admin
      .from("filiacao_recebe")
      .select("id, cpf, fonte_pg_matricula, forma_recebimento")
      .in("id", ids.slice(de, de + 200))
      .eq("remessa_id", remessaId)
      .eq("fonte_pg_id", fonteId)
      .eq("emp_proprietaria_id", emp)
      .is("filiado_id", null)
    if (error) return { erro: `Falha ao ler os lançamentos: ${error.message}` }
    for (const l of data ?? []) lancamentos.set(String(l.id), l as Lancamento)
  }

  // Agrupa por pessoa: CPF válido, senão a matrícula na fonte, senão a linha.
  type Pessoa = { nome: string; cpf: string | null; matriculaFonte: string | null; lancamentos: Lancamento[] }
  const pessoas = new Map<string, Pessoa>()
  const erros: ResultadoCadastro["erros"] = []
  for (const item of itens) {
    const l = lancamentos.get(item.lancamentoId)
    const nome = item.nome.replace(/\s+/g, " ").trim().slice(0, 160)
    if (!l) {
      erros.push({ nome: nome || "—", motivo: "Lançamento não está mais entre os não encontrados." })
      continue
    }
    if (nome.length < 3) {
      erros.push({ nome: nome || "(sem nome)", motivo: "Informe o nome." })
      continue
    }
    const cpfLimpo = limparCpf(l.cpf ?? "")
    const cpf = cpfLimpo && validarCpf(cpfLimpo) ? cpfConfiavel(cpfLimpo) : null
    const matriculaFonte = (l.fonte_pg_matricula ?? "").trim() || null
    const chave = cpf ? `c:${cpf}` : matriculaFonte ? `m:${matriculaFonte}` : `l:${l.id}`
    const atual = pessoas.get(chave)
    if (atual) atual.lancamentos.push(l)
    else pessoas.set(chave, { nome, cpf, matriculaFonte, lancamentos: [l] })
  }

  const porForma = new Map<FormaRecebimento, string[]>()
  let criados = 0
  let reaproveitados = 0

  for (const p of pessoas.values()) {
    // Núcleo comum com a lista de trabalhadores: CPF existente vira Ativo (pagou).
    const r = await cadastrarNaFonte(
      { nome: p.nome, cpf: p.cpf, matriculaFonte: p.matriculaFonte },
      { fonte, condicao: "Ativo", ativarExistente: true, origem: "a relação de pagamentos da remessa", usuarioId }
    )
    if (r.erro || !r.filiadoId) {
      erros.push({ nome: p.nome, motivo: r.erro ?? "Não foi possível cadastrar." })
      continue
    }
    if (r.aviso) erros.push({ nome: p.nome, motivo: r.aviso })
    if (r.criado) criados++
    else reaproveitados++
    const filiadoId = r.filiadoId

    const { error: erroLiga } = await admin
      .from("filiacao_recebe")
      .update({ filiado_id: filiadoId })
      .in("id", p.lancamentos.map((l) => l.id))
      .is("filiado_id", null)
    if (erroLiga) erros.push({ nome: p.nome, motivo: `Cadastrado, mas o pagamento não foi ligado: ${erroLiga.message}` })

    for (const l of p.lancamentos) {
      const forma = formaRecebimento(l.forma_recebimento ?? "")
      if (forma) porForma.set(forma, [...(porForma.get(forma) ?? []), filiadoId])
    }
  }

  for (const [forma, filiados] of porForma) {
    await registrarFormaNoCadastro(remessaId, filiados, forma)
  }

  invalidarCacheRemessa(remessaId)
  invalidarCacheFontes()
  invalidarCacheCadastrosPendentes()
  return { resultado: { criados, reaproveitados, erros } }
}
