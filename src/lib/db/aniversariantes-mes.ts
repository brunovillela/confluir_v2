import "server-only"

import { cpfConfiavel, grafiasDoCpf } from "@/lib/cpf"
import { lerEmLotes } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { VINCULOS_INSTITUICAO } from "@/lib/vinculos-instituicao"

/**
 * Aniversariantes de um mês, numa lista só: o quadro da entidade (diretores,
 * funcionários, prestadores, aprendizes e estagiários — `usuarios.
 * vinculo_instituicao`) e os filiados ativos. Quem é as duas coisas (o
 * diretor que é filiado) aparece uma vez, com os dois rótulos, casado pelo
 * CPF. Fica em Comunicação, ao lado do parabéns do dia.
 *
 * Data de nascimento do quadro: a do cadastro de usuário; sem ela, a da ficha
 * de filiação com o mesmo CPF (muitos diretores só a têm lá).
 */

export type AniversarianteMes = {
  chave: string
  nome: string
  dia: number
  /** Idade que completa no ano consultado (null sem ano de nascimento). */
  idade: number | null
  /** Rótulos: os vínculos com a entidade e "Filiado(a)". */
  quem: string[]
  equipe: boolean
  filiado: boolean
  filiacaoId: string | null
}

type Linha = { id: string; cpf: string | null; nome_completo: string | null; nascimento_dia: number | null }

const anoDe = (...datas: (string | null | undefined)[]) => {
  const d = datas.find((x) => x && /^\d{4}-/.test(x))
  return d ? Number(d.slice(0, 4)) : null
}

export async function aniversariantesDoMes(ano: number, mes: number): Promise<AniversarianteMes[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const [quadro, filiados] = await Promise.all([
    // O quadro inteiro (dezenas): o mês é filtrado depois, com a data da filiação como reserva.
    lerEmLotes<Linha & { nome_guerra: string | null; vinculo_instituicao: string | null; nascimento_mes: number | null; data_nascimento: string | null; nascimento_data: string | null }>(
      (de, ate) =>
        admin
          .from("usuarios")
          .select("id, cpf, nome_completo, nome_guerra, vinculo_instituicao, nascimento_dia, nascimento_mes, data_nascimento, nascimento_data")
          .eq("emp_proprietaria_id", emp)
          .in("vinculo_instituicao", [...VINCULOS_INSTITUICAO])
          .not("inativo", "is", true)
          .not("deletado", "is", true)
          .order("id")
          .range(de, ate)
    ),
    lerEmLotes<Linha & { nascimento_data: string | null }>((de, ate) =>
      admin
        .from("filiacoes")
        .select("id, cpf, nome_completo, nascimento_dia, nascimento_data")
        .eq("emp_proprietaria_id", emp)
        .eq("filiacao_condicao", "Ativo")
        .not("filiacao_excluida", "is", true)
        .eq("nascimento_mes", mes)
        .order("id")
        .range(de, ate)
    ),
  ])

  // Sem data no usuário: a da ficha de filiação do mesmo CPF (qualquer situação).
  // O CPF pode estar com ou sem pontuação em cada tabela: busca nas duas formas.
  const semData = [
    ...new Set(
      quadro
        .filter((u) => !u.nascimento_mes || !u.nascimento_dia)
        .flatMap((u) => {
          const d = cpfConfiavel(u.cpf)
          return d ? grafiasDoCpf(d) : []
        })
    ),
  ]
  const daFicha = new Map<string, { mes: number; dia: number; data: string | null }>()
  for (let i = 0; i < semData.length; i += 100) {
    const { data } = await admin
      .from("filiacoes")
      .select("cpf, nascimento_mes, nascimento_dia, nascimento_data")
      .eq("emp_proprietaria_id", emp)
      .in("cpf", semData.slice(i, i + 100))
      .not("nascimento_mes", "is", null)
    for (const f of data ?? []) {
      const k = cpfConfiavel(f.cpf as string | null)
      if (k && f.nascimento_dia) daFicha.set(k, { mes: f.nascimento_mes as number, dia: f.nascimento_dia as number, data: f.nascimento_data as string | null })
    }
  }
  const equipe = quadro
    .map((u) => {
      if (u.nascimento_mes && u.nascimento_dia) return u
      const f = daFicha.get(cpfConfiavel(u.cpf) ?? "")
      return f ? { ...u, nascimento_mes: f.mes, nascimento_dia: f.dia, nascimento_data: u.nascimento_data ?? f.data } : u
    })
    .filter((u) => u.nascimento_mes === mes)

  const pessoas = new Map<string, AniversarianteMes>()
  const juntar = (chave: string, novo: AniversarianteMes) => {
    const atual = pessoas.get(chave)
    if (!atual) return pessoas.set(chave, novo)
    for (const q of novo.quem) if (!atual.quem.includes(q)) atual.quem.push(q)
    atual.equipe ||= novo.equipe
    atual.filiado ||= novo.filiado
    atual.filiacaoId ??= novo.filiacaoId
    atual.idade ??= novo.idade
  }

  for (const u of equipe) {
    if (!u.nascimento_dia) continue
    const nasc = anoDe(u.nascimento_data, u.data_nascimento)
    juntar(cpfConfiavel(u.cpf) ?? `u:${u.id}`, {
      chave: `u:${u.id}`,
      nome: u.nome_completo ?? u.nome_guerra ?? "(sem nome)",
      dia: u.nascimento_dia,
      idade: nasc ? ano - nasc : null,
      quem: u.vinculo_instituicao ? [u.vinculo_instituicao] : [],
      equipe: true,
      filiado: false,
      filiacaoId: null,
    })
  }
  for (const f of filiados) {
    if (!f.nascimento_dia) continue
    const nasc = anoDe(f.nascimento_data)
    // Um filiado com mais de um cadastro (mesmo CPF) conta uma vez.
    juntar(cpfConfiavel(f.cpf) ?? `f:${f.id}`, {
      chave: `f:${f.id}`,
      nome: f.nome_completo ?? "(sem nome)",
      dia: f.nascimento_dia,
      idade: nasc ? ano - nasc : null,
      quem: ["Filiado(a)"],
      equipe: false,
      filiado: true,
      filiacaoId: f.id,
    })
  }

  return [...pessoas.values()].sort((a, b) => a.dia - b.dia || a.nome.localeCompare(b.nome, "pt-BR"))
}
