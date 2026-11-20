"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  chaveParecida,
  configIAParaChamada,
  modeloValido,
  obterConfigIA,
  type PrecosModelo,
  registrarEventoGestaoIA,
  registrarTesteChaveIA,
  removerChaveIA,
  salvarChaveIA,
  salvarCotasIA,
  salvarModelosProcessoIA,
  salvarPreferenciasIA,
} from "@/lib/db/ia-config"
import { listarDepartamentosCompletos } from "@/lib/db/departamentos"
import { MODELO_IA, testarChaveIA } from "@/lib/ia"
import { MODULOS_IA, PROCESSOS_IA } from "@/lib/ia-processos"
import { tenantAtual } from "@/lib/tenant"

const ROTA = "/painel/gestao/ia"

/**
 * A chave de API chega aqui pelo formulário e daqui só sai cifrada para o
 * banco: nenhuma action devolve a chave, e a tela só conhece os 4 últimos
 * caracteres. Só quem tem a Gestão do sistema (gestao_sistema) mexe na IA.
 */

export async function salvarChaveAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("gestao_sistema")
  const chave = String(fd.get("chave") ?? "").trim()
  if (!chaveParecida(chave)) {
    return { erro: "Isso não parece uma chave da OpenAI (começa com sk- e não tem espaços).", campo: "chave" }
  }
  // Testa antes de guardar: chave recusada não substitui a que funciona.
  const config = await obterConfigIA()
  const erroTeste = await testarChaveIA(chave, config.modelo)
  if (erroTeste) return { erro: `A chave não passou no teste e não foi salva. ${erroTeste}`, campo: "chave" }
  const r = await salvarChaveIA(chave, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  await registrarTesteChaveIA(null, String(sessao.usuario.id))
  revalidatePath(ROTA)
  revalidatePath("/painel/gestao")
  return { ok: `Chave terminada em ${chave.slice(-4)} testada e guardada. A partir de agora a IA da entidade usa esta conta.` }
}

export async function testarChaveSalvaAction(): Promise<EstadoForm> {
  const sessao = await requirePermissao("gestao_sistema")
  const { config, chave } = await configIAParaChamada(await tenantAtual())
  if (!config.temChave) return { erro: "Não há chave da entidade cadastrada." }
  if (!chave) return { erro: "A chave guardada não pôde ser lida neste servidor (a chave de cifra mudou). Cadastre-a de novo." }
  const erro = await testarChaveIA(chave, config.modelo)
  await registrarTesteChaveIA(erro, String(sessao.usuario.id))
  await registrarEventoGestaoIA("chave_testada", erro ? `Falhou: ${erro}` : "Funcionou", String(sessao.usuario.id))
  revalidatePath(ROTA)
  return erro ? { erro } : { ok: "A chave respondeu. Tudo certo." }
}

export async function removerChaveAction(): Promise<EstadoForm> {
  const sessao = await requirePermissao("gestao_sistema")
  const r = await removerChaveIA(String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidatePath(ROTA)
  revalidatePath("/painel/gestao")
  return { ok: "Chave removida. A IA volta a usar a conta da plataforma." }
}

function numeroOuNulo(fd: FormData, nome: string): number | null | "invalido" {
  const bruto = String(fd.get(nome) ?? "").trim().replace(/\s/g, "").replace(",", ".")
  if (!bruto) return null
  const n = Number(bruto)
  return Number.isFinite(n) && n >= 0 ? n : "invalido"
}

export async function salvarPreferenciasAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("gestao_sistema")
  const campos = {
    limite: numeroOuNulo(fd, "limite_mensal_usd"),
    entrada: numeroOuNulo(fd, "preco_entrada"),
    cache: numeroOuNulo(fd, "preco_entrada_cache"),
    saida: numeroOuNulo(fd, "preco_saida"),
  }
  for (const [nome, v] of Object.entries(campos)) {
    if (v === "invalido") {
      const campo = { limite: "limite_mensal_usd", entrada: "preco_entrada", cache: "preco_entrada_cache", saida: "preco_saida" }[nome]
      return { erro: "Use um número (ex.: 1,25).", campo }
    }
  }
  const validos = new Set(MODULOS_IA.map((m) => m.slug))
  const ligados = new Set(fd.getAll("modulos").map(String))
  const r = await salvarPreferenciasIA(
    {
      modelo: String(fd.get("modelo") ?? "").trim() || null,
      iaAtiva: fd.get("ia_ativa") !== null,
      modulosDesligados: [...validos].filter((m) => !ligados.has(m)),
      limiteMensalUsd: campos.limite as number | null,
      bloquearNoLimite: fd.get("bloquear_no_limite") !== null,
      precoEntrada: campos.entrada as number | null,
      precoEntradaCache: campos.cache as number | null,
      precoSaida: campos.saida as number | null,
    },
    String(sessao.usuario.id)
  )
  if (r.erro) return { erro: r.erro }
  revalidatePath(ROTA)
  revalidatePath("/painel/gestao")
  return { ok: "Configuração salva." }
}

/**
 * Modelo por processo. Campos: `modelo:<chave do processo>` (em branco = modelo
 * geral) e `preco:<modelo>:<entrada|cache|saida>`. Com a chave da entidade,
 * cada modelo novo é testado antes de salvar: um nome errado ou sem acesso
 * faria aquele processo falhar para todo mundo.
 */
export async function salvarModelosProcessoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("gestao_sistema")
  const validos = new Set(PROCESSOS_IA.map((p) => p.chave))
  const config = await obterConfigIA()
  const geral = config.modelo || MODELO_IA

  const modelos: Record<string, string> = {}
  for (const [nome, valor] of fd.entries()) {
    if (!nome.startsWith("modelo:")) continue
    const chave = nome.slice("modelo:".length)
    const m = String(valor).trim()
    if (!m || !validos.has(chave)) continue
    if (!modeloValido(m)) return { erro: `Nome de modelo inválido: "${m}".`, campo: nome }
    if (m !== geral) modelos[chave] = m
  }

  const usados = new Set(Object.values(modelos))
  const precos: Record<string, PrecosModelo> = {}
  for (const m of usados) {
    const lido: PrecosModelo = { entrada: null, cache: null, saida: null }
    for (const campo of ["entrada", "cache", "saida"] as const) {
      const nome = `preco:${m}:${campo}`
      const v = numeroOuNulo(fd, nome)
      if (v === "invalido") return { erro: "Use um número (ex.: 0,25).", campo: nome }
      lido[campo] = v
    }
    if ((lido.entrada === null) !== (lido.saida === null)) {
      return { erro: `Informe os preços de entrada e de saída do ${m} (ou deixe os dois em branco).`, campo: `preco:${m}:${lido.entrada === null ? "entrada" : "saida"}` }
    }
    if (lido.entrada !== null) precos[m] = lido
  }

  // Testa só os modelos que entram agora, com a chave da entidade.
  const novos = [...usados].filter((m) => !Object.values(config.modelosProcesso).includes(m))
  if (novos.length) {
    const { chave } = await configIAParaChamada(await tenantAtual())
    if (chave) {
      for (const m of novos) {
        const erro = await testarChaveIA(chave, m)
        if (erro) return { erro: `O modelo "${m}" não respondeu com a chave da entidade, e nada foi salvo. ${erro}` }
      }
    }
  }

  const r = await salvarModelosProcessoIA(modelos, precos, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidatePath(ROTA)
  const n = Object.keys(modelos).length
  const semPreco = [...usados].filter((m) => !precos[m])
  return {
    ok:
      (n === 0 ? "Todos os processos usam o modelo geral." : `${n} ${n === 1 ? "processo usa" : "processos usam"} um modelo próprio.`) +
      (semPreco.length && config.precoEntrada !== null
        ? ` Sem preço para ${semPreco.join(", ")}: o custo dessas chamadas não entra na estimativa nem no teto.`
        : ""),
  }
}

/** Cotas mensais por departamento. Campo `cota:<departamento_id>`; em branco = sem cota. */
export async function salvarCotasAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("gestao_sistema")
  const deptos = (await listarDepartamentosCompletos()).filter((d) => !d.legado)
  const nomes = new Map(deptos.map((d) => [d.id, d.nome]))
  const cotas: Record<string, number> = {}
  for (const [nome] of fd.entries()) {
    if (!nome.startsWith("cota:")) continue
    const id = nome.slice("cota:".length)
    if (!nomes.has(id)) continue
    const v = numeroOuNulo(fd, nome)
    if (v === "invalido" || v === 0) return { erro: "Use um número maior que zero (ex.: 5,00) ou deixe em branco.", campo: nome }
    if (v !== null) cotas[id] = v
  }
  const r = await salvarCotasIA(cotas, nomes, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidatePath(ROTA)
  const n = Object.keys(cotas).length
  return { ok: n ? `${n} ${n === 1 ? "departamento com cota" : "departamentos com cota"}.` : "Nenhum departamento com cota." }
}
