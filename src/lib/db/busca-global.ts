import "server-only"

import type { SessaoPainel } from "@/lib/auth"
import { sugerirUsuarios } from "@/lib/db/acessos"
import { texto } from "@/lib/db/comum"
import { sugerirFiliados } from "@/lib/db/filiados"
import { formatarCpf } from "@/lib/cpf"
import { formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"

/**
 * BUSCA GLOBAL (onda 2, U4): um termo, vários cadastros — filiados,
 * fornecedores, usuários do painel, ordens de pagamento, contratos e
 * veículos — cada grupo só para quem tem a permissão da tela de destino.
 * As páginas do menu são procuradas no cliente (lista vem do layout).
 *
 * Cada grupo é uma consulta curta e tolerante: erro em um não derruba os
 * outros. Nada aqui grava.
 */

export type ResultadoBusca = {
  titulo: string
  detalhe: string | null
  href: string
}

export type GrupoBusca = {
  chave: "filiados" | "fornecedores" | "usuarios" | "ordens" | "contratos" | "veiculos"
  titulo: string
  itens: ResultadoBusca[]
  /** Link "ver todos" da lista do módulo, quando existe. */
  verTodos?: string
}

const LIMITE = 6

function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

async function fornecedores(termo: string, emp: string): Promise<ResultadoBusca[]> {
  const admin = await createAdminClient()
  const digitos = termo.replace(/\D/g, "")
  let q = admin
    .from("empresa")
    .select("id, nome_fantasia, nome_razao, cnpj_cpf")
    .eq("emp_proprietaria_id", emp)
    .not("inativa", "is", true)
  if (digitos.length >= 3) q = q.ilike("cnpj_cpf", `%${digitos}%`)
  else {
    const t = `%${escaparLike(termo)}%`
    q = q.or(`nome_fantasia.ilike.${t},nome_razao.ilike.${t}`)
  }
  const { data } = await q.order("nome_fantasia", { ascending: true, nullsFirst: false }).limit(LIMITE)
  return (data ?? []).map((f) => ({
    titulo: texto(f.nome_fantasia) ?? texto(f.nome_razao) ?? "(sem nome)",
    detalhe: [texto(f.nome_fantasia) ? texto(f.nome_razao) : null, texto(f.cnpj_cpf)].filter(Boolean).join(" · ") || null,
    href: `/painel/compras/fornecedores/${f.id}`,
  }))
}

async function usuarios(termo: string): Promise<ResultadoBusca[]> {
  const sugestoes = await sugerirUsuarios(termo, LIMITE)
  if (sugestoes.length === 0) return []
  // A página do usuário é a linha de `permissoes`, não a de `usuarios`.
  const admin = await createAdminClient()
  const { data: acessos } = await admin
    .from("permissoes")
    .select("id, usuario_id")
    .in("usuario_id", sugestoes.map((s) => s.id))
  const acessoPor = new Map((acessos ?? []).map((a) => [String(a.usuario_id), String(a.id)]))
  return sugestoes
    .filter((s) => acessoPor.has(s.id))
    .map((s) => ({
      titulo: s.nome_completo ?? "(sem nome)",
      detalhe: s.cpf ? formatarCpf(s.cpf) : null,
      href: `/painel/institucional/usuarios/${acessoPor.get(s.id)}`,
    }))
}

async function ordens(termo: string, emp: string): Promise<ResultadoBusca[]> {
  const admin = await createAdminClient()
  const t = `%${escaparLike(termo)}%`
  const { data } = await admin
    .from("ordens_pagamento")
    .select("id, codigo, descricao, situacao, valor_inicial_cobranca")
    .eq("emp_proprietaria_id", emp)
    .not("excluido", "is", true)
    .or(`codigo.ilike.${t},descricao.ilike.${t}`)
    .order("created_at", { ascending: false })
    .limit(LIMITE)
  return (data ?? []).map((o) => ({
    titulo: `${texto(o.codigo) ?? "Ordem"} — ${(texto(o.descricao) ?? "").slice(0, 80)}`,
    detalhe: [texto(o.situacao), o.valor_inicial_cobranca != null ? formatarMoeda(Number(o.valor_inicial_cobranca)) : null].filter(Boolean).join(" · ") || null,
    href: `/painel/financeiro/ordens/${o.id}`,
  }))
}

async function contratos(termo: string, emp: string): Promise<ResultadoBusca[]> {
  const admin = await createAdminClient()
  const t = `%${escaparLike(termo)}%`
  const { data } = await admin
    .from("contratos")
    .select("id, codigo, objeto, vigencia_termino")
    .eq("emp_proprietaria_id", emp)
    .or(`codigo.ilike.${t},objeto.ilike.${t}`)
    .order("created_at", { ascending: false })
    .limit(LIMITE)
  return (data ?? []).map((c) => ({
    titulo: `${texto(c.codigo) ?? "Contrato"} — ${(texto(c.objeto) ?? "").slice(0, 80)}`,
    detalhe: c.vigencia_termino ? `vigência até ${String(c.vigencia_termino).slice(0, 10).split("-").reverse().join("/")}` : null,
    href: `/painel/compras/contratos/${c.id}`,
  }))
}

async function veiculos(termo: string, emp: string): Promise<ResultadoBusca[]> {
  const admin = await createAdminClient()
  const t = `%${escaparLike(termo.replace(/[\s-]/g, ""))}%`
  const { data } = await admin
    .from("veiculos")
    .select("id, placa, marca_modelo, inativo")
    .eq("emp_proprietaria_id", emp)
    .or(`placa.ilike.${t},marca_modelo.ilike.%${escaparLike(termo)}%`)
    .order("placa", { ascending: true })
    .limit(LIMITE)
  return (data ?? []).map((v) => ({
    titulo: `${texto(v.placa) ?? "sem placa"} — ${texto(v.marca_modelo) ?? ""}`.trim(),
    detalhe: v.inativo ? "inativo" : null,
    href: `/painel/veiculos/${v.id}`,
  }))
}

export async function buscarGlobal(sessao: SessaoPainel, busca: string): Promise<GrupoBusca[]> {
  const termo = busca.trim()
  if (termo.length < 2) return []
  const emp = await tenantAtual()
  const p = sessao.permissoes
  const pode = (chave: string, alternativas: string[] = []) => podeAcessar(p, chave, alternativas)

  const tarefas: { grupo: Omit<GrupoBusca, "itens">; buscar: () => Promise<ResultadoBusca[]> }[] = []
  if (pode("filiacao_filiados", ["filiacao_gestao", "filiacao_receitas"])) {
    tarefas.push({
      grupo: { chave: "filiados", titulo: "Filiados", verTodos: `/painel/filiados/lista?busca=${encodeURIComponent(termo)}` },
      buscar: async () =>
        (await sugerirFiliados(termo, LIMITE)).map((f) => ({
          titulo: f.nome_completo ?? "(sem nome)",
          detalhe: [f.cpf ? formatarCpf(f.cpf) : null, f.matricula_sindical ? `matrícula ${f.matricula_sindical}` : null, f.filiacao_condicao].filter(Boolean).join(" · ") || null,
          href: `/painel/filiados/${f.id}`,
        })),
    })
  }
  if (pode("aquisicoes_fornecedores", ["aquisicoes_compras_edicao"])) {
    tarefas.push({
      grupo: { chave: "fornecedores", titulo: "Fornecedores", verTodos: `/painel/compras/fornecedores/lista?busca=${encodeURIComponent(termo)}` },
      buscar: () => fornecedores(termo, emp),
    })
  }
  if (pode("permissoes", ["configuracoes"])) {
    tarefas.push({ grupo: { chave: "usuarios", titulo: "Usuários do painel" }, buscar: () => usuarios(termo) })
  }
  if (pode("financeiro_pagamento", ["financeiro_leitura"])) {
    tarefas.push({ grupo: { chave: "ordens", titulo: "Ordens de pagamento" }, buscar: () => ordens(termo, emp) })
  }
  if (pode("aquisicoes_contratos", ["aquisicoes_contratos_edicao"])) {
    tarefas.push({ grupo: { chave: "contratos", titulo: "Contratos" }, buscar: () => contratos(termo, emp) })
  }
  if (pode("veiculos", ["veiculos_gestao", "veiculos_recepcao"])) {
    tarefas.push({ grupo: { chave: "veiculos", titulo: "Veículos" }, buscar: () => veiculos(termo, emp) })
  }

  const resultados = await Promise.all(tarefas.map((t) => t.buscar().catch(() => [] as ResultadoBusca[])))
  return tarefas
    .map((t, i) => ({ ...t.grupo, itens: resultados[i] }))
    .filter((g) => g.itens.length > 0)
}

/** Casamento das páginas do menu com o termo (sem acento), para o cliente. */
export function casaComTermo(termo: string, ...campos: (string | null | undefined)[]): boolean {
  const t = semAcento(termo)
  return campos.some((c) => c && semAcento(c).includes(t))
}
