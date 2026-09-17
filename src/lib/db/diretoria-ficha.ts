import "server-only"

import { cpfConfiavel, grafiasDoCpf } from "@/lib/cpf"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { invalidarCacheCadastrosPendentes } from "@/lib/db/filiacao-cadastros-pendentes"
import {
  listarContatosEmergencia,
  salvarContatoEmergencia,
} from "@/lib/db/filiacao-contatos-emergencia"
import { urlArquivoVeiculos } from "@/lib/db/veiculos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Ficha do integrante de mandato (Institucional › Diretoria).
 *
 * Regra (Bruno, 17/09/2026): o que já existe em outro cadastro é REFLETIDO
 * aqui, não redigitado; o que só existe no institucional fica no institucional.
 *
 * - Integrante com FILIAÇÃO: nascimento, e-mail, telefone, endereço, dados
 *   bancários e contato de emergência são os da filiação. Editar na ficha
 *   grava na filiação (com registro no prontuário). Os vínculos empregatícios
 *   aparecem como estão na filiação, só para consulta.
 * - Só do institucional: camisa, tipo sanguíneo e acessibilidade — ficam em
 *   `diretoria_ficha`, como sempre.
 * - Integrante SEM filiação (convidado, diretor de outra base): a ficha guarda
 *   tudo em `diretoria_ficha`, como antes.
 * - CNH: vem do cadastro de condutores (Veículos), só para consulta.
 */

export type FichaDiretor = {
  data_nascimento: string | null
  email_particular: string | null
  telefone_particular: string | null
  telefone_whatsapp: boolean
  tamanho_camisa: string | null
  tipo_sanguineo: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  tipo_vinculo: string | null
  empregador_id: string | null
  matricula_empregador: string | null
  base_operacional: string | null
  banco: string | null
  agencia: string | null
  conta_corrente: string | null
  pix: string | null
  tipo_chave_pix: string | null
  tem_restricao: boolean
  restricao_descricao: string | null
  contato_emergencia: string | null
  telefone_emergencia: string | null
}

const CAMPOS_TEXTO: (keyof FichaDiretor)[] = [
  "data_nascimento", "email_particular", "telefone_particular", "tamanho_camisa",
  "tipo_sanguineo", "cep", "logradouro", "numero", "complemento", "bairro",
  "cidade", "estado", "tipo_vinculo", "empregador_id", "matricula_empregador",
  "base_operacional", "banco", "agencia", "conta_corrente", "pix",
  "tipo_chave_pix", "restricao_descricao", "contato_emergencia",
  "telefone_emergencia",
]

/** Campos que, para quem tem filiação, moram na filiação. */
export const CAMPOS_DA_FILIACAO: (keyof FichaDiretor)[] = [
  "data_nascimento", "email_particular", "telefone_particular", "telefone_whatsapp",
  "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "estado",
  "banco", "agencia", "conta_corrente", "pix", "tipo_chave_pix",
  "contato_emergencia", "telefone_emergencia",
]

/** Vínculo com a fonte pagadora — para quem tem filiação, vem de lá. */
const CAMPOS_VINCULO: (keyof FichaDiretor)[] = [
  "tipo_vinculo", "empregador_id", "matricula_empregador", "base_operacional",
]

const ROTULO: Partial<Record<keyof FichaDiretor, string>> = {
  data_nascimento: "nascimento",
  email_particular: "e-mail",
  telefone_particular: "telefone",
  telefone_whatsapp: "WhatsApp",
  cep: "CEP",
  logradouro: "logradouro",
  numero: "número",
  complemento: "complemento",
  bairro: "bairro",
  cidade: "cidade",
  estado: "UF",
}

/** Coluna de `filiacoes` de cada campo pessoal/endereço da ficha. */
const COLUNA_FILIACAO: Partial<Record<keyof FichaDiretor, string>> = {
  data_nascimento: "nascimento_data",
  email_particular: "email_pessoal",
  telefone_particular: "telefone_1",
  telefone_whatsapp: "telefone_1_whatsapp",
  cep: "endereco_cep",
  logradouro: "endereco_logradouro",
  numero: "endereco_numero",
  complemento: "endereco_complemento",
  bairro: "endereco_bairro",
  cidade: "endereco_cidade",
  estado: "endereco_estado",
}

export type VinculoDaFiliacao = {
  empresa: string | null
  matricula: string | null
  lotacao: string | null
  regime: string | null
  desde: string | null
}

export type CnhDoIntegrante = {
  numero: string | null
  categoria: string | null
  validade: string | null
  vencida: boolean
  autorizado: boolean
  arquivoUrl: string | null
}

export type OrigemDaFicha = {
  /** Filiação de onde vêm os dados pessoais (null = ficha guarda tudo). */
  filiacao: { id: string; nome: string | null; matricula: string | null } | null
  vinculos: VinculoDaFiliacao[]
  /** Contatos de emergência além do primeiro (que é o editável na ficha). */
  outrosContatos: number
  /** null = não é condutor cadastrado. */
  cnh: CnhDoIntegrante | null
}

// ── Pix: a ficha e a filiação nomeiam o tipo de chave de jeitos diferentes ───

function pixParaFiliacao(tipo: string | null): string | null {
  if (!tipo) return null
  return tipo === "CPF" || tipo === "CNPJ" ? "CNPJ / CPF" : tipo
}

function pixDaFiliacao(tipo: string | null, chave: string | null): string | null {
  if (!tipo) return null
  if (tipo !== "CNPJ / CPF") return tipo
  return (chave ?? "").replace(/\D/g, "").length === 14 ? "CNPJ" : "CPF"
}

// ── Leitura ──────────────────────────────────────────────────────────────────

type Integrante = { id: string; filiacao_id: string | null; usuario_id: string | null; cpf: string | null }

async function lerIntegrante(integranteId: string): Promise<Integrante | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("diretoria_integrantes")
    .select("id, filiacao_id, usuario_id, cpf")
    .eq("id", integranteId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data) return null
  return { id: String(data.id), filiacao_id: texto(data.filiacao_id), usuario_id: texto(data.usuario_id), cpf: texto(data.cpf) }
}

/**
 * A filiação do integrante: a vinculada (seguindo mesclagens até o cadastro que
 * ficou) ou, sem vínculo, a do mesmo CPF que não foi excluída.
 */
async function filiacaoDoIntegrante(i: Integrante): Promise<Record<string, unknown> | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let id = i.filiacao_id
  for (let saltos = 0; id && saltos < 5; saltos++) {
    const { data } = await admin.from("filiacoes").select("*").eq("id", id).eq("emp_proprietaria_id", emp).maybeSingle()
    if (!data) break
    if (data.filiacao_excluida === true && data.mesclado_em_id) {
      id = String(data.mesclado_em_id)
      continue
    }
    if (data.filiacao_excluida !== true) return data
    break
  }
  const cpf = cpfConfiavel(i.cpf)
  if (!cpf) return null
  const { data } = await admin
    .from("filiacoes")
    .select("*")
    .eq("emp_proprietaria_id", emp)
    .in("cpf", grafiasDoCpf(cpf))
    .not("filiacao_excluida", "is", true)
    .order("created_at", { ascending: false })
    .limit(1)
  return data?.[0] ?? null
}

async function bancoDaFiliacao(filiacaoId: string): Promise<Record<string, unknown> | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("dados_bancarios")
    .select("id, banco, agencia, conta, pix, pix_tipo, favorito, created_at")
    .eq("filiado_id", filiacaoId)
    .order("favorito", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
  return data?.[0] ?? null
}

async function cnhDoIntegrante(i: Integrante): Promise<CnhDoIntegrante | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let usuarioId = i.usuario_id
  if (!usuarioId) {
    const cpf = cpfConfiavel(i.cpf)
    if (cpf) {
      const { data } = await admin.from("usuarios").select("id").eq("emp_proprietaria_id", emp).in("cpf", grafiasDoCpf(cpf)).limit(1)
      usuarioId = texto(data?.[0]?.id)
    }
  }
  if (!usuarioId) return null
  const { data: c, error } = await admin
    .from("veiculos_condutores")
    .select("cnh_numero, cnh_categoria, cnh_validade, cnh_arquivo_url, autorizado")
    .eq("emp_proprietaria_id", emp)
    .eq("usuario_id", usuarioId)
    .maybeSingle()
  if (error || !c) return null
  const validade = texto(c.cnh_validade)
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
  return {
    numero: texto(c.cnh_numero),
    categoria: texto(c.cnh_categoria),
    validade,
    vencida: Boolean(validade && validade < hoje),
    autorizado: c.autorizado === true,
    arquivoUrl: await urlArquivoVeiculos(texto(c.cnh_arquivo_url)).catch(() => null),
  }
}

/**
 * A ficha como deve aparecer: dados da filiação por cima (quando houver) e o
 * que só o institucional tem. Campo vazio na filiação cai no que a ficha antiga
 * tinha — ao salvar, o valor vai para a filiação.
 */
export async function obterFichaDiretor(integranteId: string): Promise<FichaDiretor | null> {
  const i = await lerIntegrante(integranteId)
  if (!i) return null
  const admin = await createAdminClient()
  const { data } = await admin
    .from("diretoria_ficha")
    .select("*")
    .eq("integrante_id", integranteId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()

  const ficha = {
    telefone_whatsapp: Boolean(data?.telefone_whatsapp),
    tem_restricao: Boolean(data?.tem_restricao),
  } as FichaDiretor
  for (const c of CAMPOS_TEXTO) (ficha as Record<string, unknown>)[c] = texto(data?.[c])

  const filiacao = await filiacaoDoIntegrante(i)
  if (!filiacao) return data ? ficha : null

  for (const [campo, coluna] of Object.entries(COLUNA_FILIACAO) as [keyof FichaDiretor, string][]) {
    if (campo === "telefone_whatsapp") {
      ficha.telefone_whatsapp = filiacao[coluna] === true
    } else {
      ;(ficha as Record<string, unknown>)[campo] = texto(filiacao[coluna]) ?? ficha[campo]
    }
  }
  const banco = await bancoDaFiliacao(String(filiacao.id))
  if (banco) {
    ficha.banco = texto(banco.banco) ?? ficha.banco
    ficha.agencia = texto(banco.agencia) ?? ficha.agencia
    ficha.conta_corrente = texto(banco.conta) ?? ficha.conta_corrente
    ficha.pix = texto(banco.pix) ?? ficha.pix
    ficha.tipo_chave_pix = pixDaFiliacao(texto(banco.pix_tipo), texto(banco.pix)) ?? ficha.tipo_chave_pix
  }
  const { contatos } = await listarContatosEmergencia({ cpf: texto(filiacao.cpf), filiadoId: String(filiacao.id) })
  if (contatos[0]) {
    ficha.contato_emergencia = contatos[0].nome ?? ficha.contato_emergencia
    ficha.telefone_emergencia = contatos[0].telefone ?? ficha.telefone_emergencia
  }
  return ficha
}

/** De onde vêm os dados da ficha: a filiação, os vínculos dela e a CNH. */
export async function origemDaFicha(integranteId: string): Promise<OrigemDaFicha> {
  const vazia: OrigemDaFicha = { filiacao: null, vinculos: [], outrosContatos: 0, cnh: null }
  const i = await lerIntegrante(integranteId)
  if (!i) return vazia
  const [filiacao, cnh] = await Promise.all([filiacaoDoIntegrante(i), cnhDoIntegrante(i)])
  if (!filiacao) return { ...vazia, cnh }

  const admin = await createAdminClient()
  const filiacaoId = String(filiacao.id)
  const [{ data: vinculos }, { contatos }] = await Promise.all([
    admin
      .from("filiacao_vinculos")
      .select("fonte_pagadora_id, matricula, lotacao, regime_trabalho, data_filiacao")
      .eq("filiado_id", filiacaoId)
      .is("data_desfiliacao", null)
      .order("data_filiacao", { ascending: false, nullsFirst: false }),
    listarContatosEmergencia({ cpf: texto(filiacao.cpf), filiadoId: filiacaoId }),
  ])
  const fontes = [...new Set((vinculos ?? []).map((v) => texto(v.fonte_pagadora_id)).filter(Boolean))] as string[]
  const { data: empresas } = fontes.length
    ? await admin.from("empresa").select("id, nome_fantasia, nome_razao").in("id", fontes)
    : { data: [] as Record<string, unknown>[] }
  const nome = new Map((empresas ?? []).map((e) => [String(e.id), texto(e.nome_fantasia) ?? texto(e.nome_razao)]))

  return {
    filiacao: { id: filiacaoId, nome: texto(filiacao.nome_completo), matricula: texto(filiacao.matricula_sindical) },
    vinculos: (vinculos ?? []).map((v) => ({
      empresa: nome.get(String(v.fonte_pagadora_id)) ?? null,
      matricula: texto(v.matricula),
      lotacao: texto(v.lotacao),
      regime: texto(v.regime_trabalho),
      desde: texto(v.data_filiacao),
    })),
    outrosContatos: Math.max(0, contatos.length - 1),
    cnh,
  }
}

// ── Gravação ─────────────────────────────────────────────────────────────────

export async function salvarFichaDiretor(
  integranteId: string,
  dados: FichaDiretor,
  usuarioId: string | null = null
): Promise<{ erro?: string; filiacaoAtualizada?: string[] }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const i = await lerIntegrante(integranteId)
  if (!i) return { erro: "Diretor não encontrado." }

  const filiacao = await filiacaoDoIntegrante(i)
  const mudancas: string[] = []

  if (filiacao) {
    const filiacaoId = String(filiacao.id)

    // 1. Pessoais e endereço → filiacoes (só o que mudou).
    const patch: Record<string, unknown> = {}
    for (const [campo, coluna] of Object.entries(COLUNA_FILIACAO) as [keyof FichaDiretor, string][]) {
      const novo = campo === "telefone_whatsapp" ? dados.telefone_whatsapp : dados[campo]
      const atual = campo === "telefone_whatsapp" ? filiacao[coluna] === true : texto(filiacao[coluna])
      if (novo !== atual) {
        patch[coluna] = novo
        mudancas.push(ROTULO[campo] ?? campo)
      }
    }
    if ("nascimento_data" in patch) {
      const d = dados.data_nascimento
      patch.nascimento_dia = d ? Number(d.slice(8, 10)) : null
      patch.nascimento_mes = d ? Number(d.slice(5, 7)) : null
    }
    if (Object.keys(patch).length > 0) {
      const { error } = await admin
        .from("filiacoes")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", filiacaoId)
        .eq("emp_proprietaria_id", empId)
      if (error) return { erro: `Falha ao atualizar a filiação: ${error.message}` }
    }

    // 2. Dados bancários → o registro preferido da filiação (ou um novo).
    const banco = await bancoDaFiliacao(filiacaoId)
    const bancoNovo = {
      banco: dados.banco,
      agencia: dados.agencia,
      conta: dados.conta_corrente,
      pix: dados.pix,
      pix_tipo: pixParaFiliacao(dados.tipo_chave_pix),
    }
    const bancoAtual = {
      banco: texto(banco?.banco),
      agencia: texto(banco?.agencia),
      conta: texto(banco?.conta),
      pix: texto(banco?.pix),
      pix_tipo: texto(banco?.pix_tipo),
    }
    const bancoMudou = (Object.keys(bancoNovo) as (keyof typeof bancoNovo)[]).some((k) => bancoNovo[k] !== bancoAtual[k])
    const bancoVazio = Object.values(bancoNovo).every((v) => !v)
    if (bancoMudou && !(bancoVazio && !banco)) {
      const { error } = banco
        ? await admin.from("dados_bancarios").update(bancoNovo).eq("id", String(banco.id)).eq("filiado_id", filiacaoId)
        : await admin.from("dados_bancarios").insert({ ...bancoNovo, filiado_id: filiacaoId, favorito: true })
      if (error) return { erro: `Falha ao atualizar os dados bancários: ${error.message}` }
      mudancas.push("dados bancários")
    }

    // 3. Contato de emergência → o primeiro contato da filiação (ou um novo).
    const pessoa = { cpf: texto(filiacao.cpf), filiadoId: filiacaoId }
    const { contatos, disponivel } = await listarContatosEmergencia(pessoa)
    const primeiro = contatos[0]
    const nomeContato = dados.contato_emergencia ?? ""
    const telContato = dados.telefone_emergencia ?? ""
    const contatoMudou = nomeContato !== (primeiro?.nome ?? "") || telContato !== (primeiro?.telefone ?? "")
    if (disponivel && contatoMudou && (nomeContato || telContato)) {
      if (!nomeContato || !telContato) return { erro: "Informe nome e telefone do contato de emergência." }
      const r = await salvarContatoEmergencia({
        pessoa,
        id: primeiro?.id ?? null,
        dados: { nome: nomeContato, telefone: telContato, vinculo: primeiro?.vinculo ?? "" },
        origem: "painel",
        usuarioId,
      })
      if (r.erro) return { erro: r.erro }
      mudancas.push("contato de emergência")
    }

    if (mudancas.length > 0) {
      const agora = new Date().toISOString()
      await admin.from("filiacao_prontuario").insert({
        filiacao_id: filiacaoId,
        data: agora,
        tipo: "Atualização cadastral",
        descricao: `Cadastro atualizado pela ficha de integrante de mandato (Institucional): ${mudancas.join(", ")}.`,
        diretor_funcionario_id: usuarioId,
        emp_proprietaria_id: empId,
        created_at: agora,
        modified_at: agora,
      })
      invalidarCacheCadastrosPendentes()
    }
  }

  // 4. A ficha guarda só o que é dela. Com filiação, os campos que moram lá
  //    ficam vazios aqui — uma cópia desatualizada seria pior que nenhuma.
  const linha: Record<string, unknown> = { ...dados }
  if (filiacao) {
    for (const c of [...CAMPOS_DA_FILIACAO, ...CAMPOS_VINCULO]) linha[c] = c === "telefone_whatsapp" ? false : null
  }
  const { error } = await admin.from("diretoria_ficha").upsert(
    { integrante_id: integranteId, ...linha, emp_proprietaria_id: empId, updated_at: new Date().toISOString() },
    { onConflict: "integrante_id" }
  )
  if (error) {
    if (esquemaAusente(error)) return { erro: "Ficha ainda não configurada — rode supabase/diretoria-ficha.sql." }
    return { erro: `Falha ao salvar a ficha: ${error.message}` }
  }
  return { filiacaoAtualizada: filiacao ? mudancas : undefined }
}
