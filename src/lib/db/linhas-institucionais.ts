import "server-only"
import { texto } from "@/lib/db/comum"
import { pessoasParaDepartamento } from "@/lib/db/departamentos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Linhas institucionais — os celulares da entidade: número, operadora, chip
 * (ICCID) e com quem a linha está. Irmão dos e-mails institucionais, no
 * Institucional. Tabela `linhas_institucionais` (supabase/linhas-institucionais.sql);
 * as 51 linhas do Bubble vieram por scripts/migrar-linhas-bubble.mjs, sem
 * responsável (lá não havia esse campo).
 */

export type LinhaInstitucional = {
  id: string
  numero: string
  operadora: string | null
  chip: string | null
  usuarioId: string | null
  responsavelNome: string | null
  observacao: string | null
}

export type ResponsavelLinha = { id: string; nome: string; origem: string }

const digitos = (v: string) => v.replace(/\D/g, "")

function nomeUsuario(u: Record<string, unknown> | undefined): string | null {
  if (!u) return null
  return (
    [u.nome_completo, u.nome_guerra].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    ) ?? null
  )
}

export async function listarLinhasInstitucionais(busca?: string): Promise<LinhaInstitucional[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("linhas_institucionais")
    .select("id, numero, operadora, chip, usuario_id, observacao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("numero", { ascending: true })
    .limit(1000)
  if (error) throw new Error(`Falha ao listar as linhas institucionais: ${error.message}`)

  const linhas = (data ?? []) as Record<string, unknown>[]
  const usuarioIds = [...new Set(linhas.map((l) => texto(l.usuario_id)).filter(Boolean))] as string[]
  const nomes = new Map<string, string>()
  if (usuarioIds.length) {
    const { data: us } = await admin
      .from("usuarios")
      .select("id, nome_completo, nome_guerra")
      .in("id", usuarioIds)
    for (const u of (us ?? []) as Record<string, unknown>[]) {
      const nome = nomeUsuario(u)
      if (nome) nomes.set(String(u.id), nome)
    }
  }

  const termo = (busca ?? "").trim().toLocaleLowerCase("pt-BR")
  const termoDigitos = digitos(termo)
  return linhas
    .map((l) => {
      const usuarioId = texto(l.usuario_id)
      return {
        id: String(l.id),
        numero: String(l.numero ?? ""),
        operadora: texto(l.operadora),
        chip: texto(l.chip),
        usuarioId,
        responsavelNome: usuarioId ? (nomes.get(usuarioId) ?? null) : null,
        observacao: texto(l.observacao),
      }
    })
    .filter(
      (l) =>
        !termo ||
        (termoDigitos.length >= 3 &&
          (l.numero.includes(termoDigitos) || (l.chip ?? "").includes(termoDigitos))) ||
        (l.operadora ?? "").toLocaleLowerCase("pt-BR").includes(termo) ||
        (l.responsavelNome ?? "").toLocaleLowerCase("pt-BR").includes(termo)
    )
}

/**
 * Quem pode ficar com uma linha: funcionários ativos e diretores do mandato
 * vigente com conta de usuário. Quem já está com uma linha e saiu do quadro
 * continua na lista — senão, salvar a linha o tiraria sem ninguém ver.
 */
export async function opcoesResponsaveisLinha(
  atuais: LinhaInstitucional[]
): Promise<ResponsavelLinha[]> {
  const pessoas = await pessoasParaDepartamento()
  const opcoes = new Map<string, ResponsavelLinha>()
  for (const p of pessoas) {
    if (!p.usuarioId) continue
    opcoes.set(p.usuarioId, {
      id: p.usuarioId,
      nome: p.nome,
      origem: p.origem === "diretor" ? "Diretoria" : "Funcionários",
    })
  }
  for (const l of atuais) {
    if (l.usuarioId && !opcoes.has(l.usuarioId)) {
      opcoes.set(l.usuarioId, {
        id: l.usuarioId,
        nome: l.responsavelNome ?? "(sem nome)",
        origem: "Fora do quadro atual",
      })
    }
  }
  return [...opcoes.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

export type DadosLinha = {
  numero: string
  operadora: string | null
  chip: string | null
  usuarioId: string | null
  observacao: string | null
}

type Admin = Awaited<ReturnType<typeof createAdminClient>>

/** Normaliza e valida; devolve o registro pronto ou o erro. */
async function preparar(
  admin: Admin,
  empId: string,
  dados: DadosLinha,
  ignorarId?: string
): Promise<{ erro: string } | { registro: Record<string, string | null> }> {
  const numero = digitos(dados.numero)
  if (numero.length < 10 || numero.length > 11) {
    return { erro: "Informe o número com DDD (10 ou 11 dígitos)." }
  }
  const chip = dados.chip ? digitos(dados.chip) || null : null
  let q = admin
    .from("linhas_institucionais")
    .select("id")
    .eq("emp_proprietaria_id", empId)
    .eq("numero", numero)
  if (ignorarId) q = q.neq("id", ignorarId)
  const { data } = await q.limit(1)
  if ((data ?? []).length > 0) return { erro: "Essa linha já está cadastrada." }
  return {
    registro: {
      numero,
      operadora: dados.operadora?.trim() || null,
      chip,
      usuario_id: dados.usuarioId,
      observacao: dados.observacao?.trim() || null,
    },
  }
}

export async function criarLinhaInstitucional(dados: DadosLinha): Promise<{ erro?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const r = await preparar(admin, empId, dados)
  if ("erro" in r) return r
  const { error } = await admin
    .from("linhas_institucionais")
    .insert({ ...r.registro, emp_proprietaria_id: empId })
  if (error) return { erro: `Falha ao cadastrar a linha: ${error.message}` }
  return {}
}

export async function atualizarLinhaInstitucional(
  id: string,
  dados: DadosLinha
): Promise<{ erro?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const r = await preparar(admin, empId, dados, id)
  if ("erro" in r) return r
  const { error } = await admin
    .from("linhas_institucionais")
    .update({ ...r.registro, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Falha ao salvar a linha: ${error.message}` }
  return {}
}

export async function excluirLinhaInstitucional(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("linhas_institucionais")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao excluir a linha: ${error.message}` }
  return {}
}
