"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  chaveParecida,
  configIAParaChamada,
  obterConfigIA,
  registrarEventoGestaoIA,
  registrarTesteChaveIA,
  removerChaveIA,
  salvarChaveIA,
  salvarPreferenciasIA,
} from "@/lib/db/ia-config"
import { testarChaveIA } from "@/lib/ia"
import { MODULOS_IA } from "@/lib/ia-processos"
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
