"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  apagarRegistroSaude,
  cadastrarDependente,
  contratoDoProduto,
  obterContratoSaude,
  salvarBeneficiario,
  salvarContratoSaude,
  salvarCoparticipacao,
  salvarProdutoSaude,
  salvarRegraCusteio,
  salvarRegraDependente,
  salvarTabelaSaude,
} from "@/lib/db/plano-saude"
import { avisosTabelaANS, CONDICOES_TITULAR, lerValor } from "@/lib/plano-saude"

/** Plano de saúde dos funcionários (24/11/2026): só a gestão do Pessoal. */
async function exigir() {
  return requirePermissao("pessoal_gestao")
}

const BASE = "/painel/pessoal/plano-saude"
const t = (f: FormData, k: string) => String(f.get(k) ?? "").trim()
const opc = (f: FormData, k: string) => t(f, k) || null
const data = (f: FormData, k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(t(f, k)) ? t(f, k) : null)
const inteiro = (f: FormData, k: string) => (t(f, k) === "" ? null : Number.parseInt(t(f, k), 10))
const varios = (f: FormData, k: string) => {
  const v = f.getAll(k).map(String).filter(Boolean)
  return v.length ? v : null
}

/** Formulário de edição manda tem_ativo: aí a caixa desmarcada desativa. Na criação, ativo. */
const ativo = (f: FormData) => (f.get("tem_ativo") ? f.get("ativo") === "on" : true)

function voltar(contratoId: string | null, ancora: string, extras = "salvo=1"): never {
  revalidatePath(BASE)
  revalidatePath(`${BASE}/mes`)
  if (contratoId) revalidatePath(`${BASE}/${contratoId}`)
  redirect(`${contratoId ? `${BASE}/${contratoId}` : BASE}?${extras}#${ancora}`)
}

// ── Contrato ────────────────────────────────────────────────────────────────

export async function salvarContratoAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  const sessao = await exigir()
  const id = opc(f, "id")
  const nome = t(f, "nome")
  const operadora = t(f, "operadora")
  if (!nome) return { erro: "Dê um nome ao contrato.", campo: "nome" }
  if (!operadora) return { erro: "Informe a operadora.", campo: "operadora" }
  const mes = inteiro(f, "mes_aniversario")
  if (mes !== null && (!Number.isFinite(mes) || mes < 1 || mes > 12)) return { erro: "Mês de aniversário inválido.", campo: "mes_aniversario" }
  const inicio = data(f, "inicio")
  const fim = data(f, "fim")
  if (inicio && fim && fim < inicio) return { erro: "O fim vem antes do início.", campo: "fim" }
  const r = await salvarContratoSaude(
    id,
    {
      nome,
      operadora,
      registro_ans_operadora: opc(f, "registro_ans_operadora"),
      contrato_id: opc(f, "contrato_id"),
      tipo_contratacao: t(f, "tipo_contratacao") || "coletivo_empresarial",
      mes_aniversario: mes,
      faixa_muda: t(f, "faixa_muda") === "mes_aniversario" ? "mes_aniversario" : "mes_seguinte",
      coparticipacao: f.get("coparticipacao") === "on",
      inicio,
      fim,
      observacoes: opc(f, "observacoes"),
      ativo: ativo(f),
    },
    sessao.usuario.id as string
  )
  if (r.erro) return { erro: r.erro }
  voltar(r.id!, "contrato")
}

export async function apagarContratoAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  await exigir()
  const id = t(f, "id")
  const c = await obterContratoSaude(id)
  if (!c) return { erro: "Contrato não encontrado." }
  if (c.beneficiarios.length) return { erro: "O contrato tem beneficiários registrados: desative-o em vez de apagar." }
  const r = await apagarRegistroSaude("contrato", id)
  if (r.erro) return { erro: r.erro }
  revalidatePath(BASE)
  redirect(`${BASE}?apagado=1`)
}

// ── Produto ─────────────────────────────────────────────────────────────────

async function contratoValido(contratoId: string): Promise<boolean> {
  return Boolean(contratoId && (await obterContratoSaude(contratoId)))
}

export async function salvarProdutoAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  await exigir()
  const contratoId = t(f, "contrato_id")
  if (!(await contratoValido(contratoId))) return { erro: "Contrato não encontrado." }
  const nome = t(f, "nome")
  if (!nome) return { erro: "Dê um nome ao produto.", campo: "nome" }
  const acomodacao = t(f, "acomodacao")
  const r = await salvarProdutoSaude(opc(f, "id"), {
    contrato_id: contratoId,
    nome,
    registro_ans: opc(f, "registro_ans"),
    acomodacao: acomodacao === "enfermaria" || acomodacao === "apartamento" ? acomodacao : null,
    abrangencia: opc(f, "abrangencia"),
    ativo: ativo(f),
  })
  if (r.erro) return { erro: r.erro }
  voltar(contratoId, "produtos")
}

// ── Tabela de preço ─────────────────────────────────────────────────────────

export async function salvarTabelaAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  const sessao = await exigir()
  const produtoId = t(f, "produto_id")
  const contratoId = await contratoDoProduto(produtoId)
  if (!contratoId) return { erro: "Produto não encontrado." }
  const inicio = data(f, "vigencia_inicio")
  if (!inicio) return { erro: "Informe o início da vigência.", campo: "vigencia_inicio" }
  const fim = data(f, "vigencia_fim")
  if (fim && fim < inicio) return { erro: "O fim vem antes do início.", campo: "vigencia_fim" }
  const precos = Array.from({ length: 10 }, (_, i) => lerValor(t(f, `preco_${i}`)))
  if (precos.some((p) => p === null || p < 0)) return { erro: "Informe o preço das 10 faixas.", campo: "preco_0" }
  const avisos = avisosTabelaANS(precos as number[])
  if (avisos.length && f.get("aceitar_avisos") !== "on") {
    return { erro: `${avisos.join(" ")} Confira os valores ou marque "Gravar mesmo assim".`, campo: "aceitar_avisos" }
  }
  const pct = lerValor(t(f, "percentual"))
  const r = await salvarTabelaSaude(
    opc(f, "id"),
    {
      produto_id: produtoId,
      vigencia_inicio: inicio,
      vigencia_fim: fim,
      motivo: t(f, "motivo") || "inicial",
      percentual: pct,
      precos,
      observacao: opc(f, "observacao"),
    },
    sessao.usuario.id as string
  )
  if (r.erro) return { erro: r.erro }
  voltar(contratoId, "tabelas")
}

// ── Regras ──────────────────────────────────────────────────────────────────

export async function salvarRegraCusteioAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  await exigir()
  const contratoId = t(f, "contrato_id")
  if (!(await contratoValido(contratoId))) return { erro: "Contrato não encontrado." }
  const nome = t(f, "nome")
  if (!nome) return { erro: "Dê um nome à regra.", campo: "nome" }
  const modo = t(f, "modo") === "valor_fixo" ? "valor_fixo" : "percentual"
  const pct = lerValor(t(f, "entidade_percentual"))
  const valor = lerValor(t(f, "entidade_valor"))
  if (modo === "percentual" && (pct === null || pct < 0 || pct > 100)) {
    return { erro: "Informe o percentual pago pela entidade (0 a 100).", campo: "entidade_percentual" }
  }
  if (modo === "valor_fixo" && (valor === null || valor < 0)) return { erro: "Informe o valor pago pela entidade.", campo: "entidade_valor" }
  const copart = lerValor(t(f, "copart_funcionario_percentual"))
  if (copart !== null && (copart < 0 || copart > 100)) return { erro: "Percentual da coparticipação entre 0 e 100.", campo: "copart_funcionario_percentual" }
  const idadeMin = inteiro(f, "idade_min")
  const idadeMax = inteiro(f, "idade_max")
  if (idadeMin !== null && idadeMax !== null && idadeMax < idadeMin) return { erro: "Idade máxima menor que a mínima.", campo: "idade_max" }
  const inicio = data(f, "vigencia_inicio")
  const fim = data(f, "vigencia_fim")
  if (inicio && fim && fim < inicio) return { erro: "O fim vem antes do início.", campo: "vigencia_fim" }
  const condicoes = varios(f, "condicoes")?.filter((c) => CONDICOES_TITULAR.some((x) => x.chave === c)) ?? null
  const r = await salvarRegraCusteio(opc(f, "id"), {
    contrato_id: contratoId,
    nome,
    prioridade: inteiro(f, "prioridade") ?? 100,
    vigencia_inicio: inicio,
    vigencia_fim: fim,
    beneficiarios: varios(f, "beneficiarios"),
    condicoes: condicoes?.length ? condicoes : null,
    produtos: varios(f, "produtos"),
    cargos: varios(f, "cargos"),
    departamentos: varios(f, "departamentos"),
    funcionarios: varios(f, "funcionarios"),
    idade_min: idadeMin,
    idade_max: idadeMax,
    modo,
    entidade_percentual: modo === "percentual" ? pct : null,
    entidade_valor: modo === "valor_fixo" ? valor : null,
    entidade_teto: lerValor(t(f, "entidade_teto")),
    copart_funcionario_percentual: copart,
    copart_limite_mensal: lerValor(t(f, "copart_limite_mensal")),
    clausula: opc(f, "clausula"),
    ativo: ativo(f),
  })
  if (r.erro) return { erro: r.erro }
  voltar(contratoId, "custeio")
}

export async function salvarRegraDependenteAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  await exigir()
  const contratoId = t(f, "contrato_id")
  if (!(await contratoValido(contratoId))) return { erro: "Contrato não encontrado." }
  const grau = t(f, "grau")
  if (!grau) return { erro: "Escolha o grau.", campo: "grau" }
  const r = await salvarRegraDependente(opc(f, "id"), {
    contrato_id: contratoId,
    grau,
    permitido: f.get("permitido") === "on",
    idade_limite: inteiro(f, "idade_limite"),
    idade_limite_estudante: inteiro(f, "idade_limite_estudante"),
    observacao: opc(f, "observacao"),
  })
  if (r.erro) return { erro: r.erro }
  voltar(contratoId, "dependentes")
}

// ── Beneficiários ───────────────────────────────────────────────────────────

export async function salvarBeneficiarioAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  const sessao = await exigir()
  const id = opc(f, "id")
  const produtoId = t(f, "produto_id")
  const contratoId = await contratoDoProduto(produtoId)
  if (!contratoId) return { erro: "Escolha o produto.", campo: "produto_id" }
  const titularId = t(f, "titular_id")
  if (!titularId) return { erro: "Escolha o titular.", campo: "titular_id" }
  const inclusao = data(f, "inclusao")
  if (!inclusao) return { erro: "Informe a data de inclusão.", campo: "inclusao" }
  const exclusao = data(f, "exclusao")
  if (exclusao && exclusao < inclusao) return { erro: "A exclusão vem antes da inclusão.", campo: "exclusao" }
  const tipo = t(f, "tipo")
  if (!["titular", "dependente", "agregado"].includes(tipo)) return { erro: "Tipo inválido." }

  const dados: Record<string, unknown> = {
    produto_id: produtoId,
    titular_id: titularId,
    tipo,
    carteirinha: opc(f, "carteirinha"),
    inclusao,
    exclusao,
    motivo_exclusao: exclusao ? opc(f, "motivo_exclusao") : null,
    estudante_ate: data(f, "estudante_ate"),
    observacao: opc(f, "observacao"),
  }
  if (tipo === "titular") {
    const condicao = t(f, "condicao")
    dados.condicao = CONDICOES_TITULAR.some((c) => c.chave === condicao) ? condicao : "ativo"
  } else if (tipo === "dependente") {
    let dependenteId = opc(f, "dependente_id")
    if (dependenteId === "novo" || !dependenteId) {
      const nome = t(f, "novo_nome")
      const grau = t(f, "novo_grau")
      const nascimento = data(f, "novo_nascimento")
      if (!nome || !grau || !nascimento) {
        return { erro: "Escolha um dependente do cadastro ou informe nome, grau e nascimento do novo.", campo: "dependente_id" }
      }
      const r = await cadastrarDependente(titularId, { nome, grau, nascimento, cpf: opc(f, "novo_cpf")?.replace(/\D/g, "") || null })
      if (r.erro) return { erro: r.erro }
      dependenteId = r.id!
    }
    dados.dependente_id = dependenteId
  } else {
    const nome = t(f, "nome")
    const nascimento = data(f, "nascimento")
    if (!nome || !nascimento) return { erro: "Informe o nome e o nascimento do agregado.", campo: "nome" }
    dados.nome = nome
    dados.nascimento = nascimento
    dados.cpf = opc(f, "cpf")?.replace(/\D/g, "") || null
    dados.grau = opc(f, "grau") ?? "Agregado"
  }
  const r = await salvarBeneficiario(id, dados, sessao.usuario.id as string)
  if (r.erro) return { erro: r.erro }
  voltar(contratoId, "beneficiarios")
}

// ── Apagar ──────────────────────────────────────────────────────────────────

const ANCORA = { produto: "produtos", tabela: "tabelas", regra: "custeio", regra_dependente: "dependentes", beneficiario: "beneficiarios" } as const

export async function apagarItemAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  await exigir()
  const tipo = t(f, "tipo") as keyof typeof ANCORA
  const contratoId = t(f, "contrato_id")
  if (!(tipo in ANCORA) || !(await contratoValido(contratoId))) return { erro: "Registro inválido." }
  const r = await apagarRegistroSaude(tipo, t(f, "id"))
  if (r.erro) return { erro: r.erro }
  voltar(contratoId, ANCORA[tipo], "apagado=1")
}

// ── Coparticipação ──────────────────────────────────────────────────────────

export async function salvarCoparticipacaoAction(_p: EstadoForm, f: FormData): Promise<EstadoForm> {
  const sessao = await exigir()
  const contratoId = t(f, "contrato_id")
  const competencia = t(f, "competencia")
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) return { erro: "Mês inválido." }
  if (!(await contratoValido(contratoId))) return { erro: "Contrato não encontrado." }
  const valor = lerValor(t(f, "valor"))
  if (valor !== null && valor < 0) return { erro: "Valor inválido." }
  const r = await salvarCoparticipacao(contratoId, t(f, "titular_id"), competencia, valor, sessao.usuario.id as string)
  if (r.erro) return { erro: r.erro }
  revalidatePath(`${BASE}/mes`)
  return { ok: "Coparticipação gravada." }
}
