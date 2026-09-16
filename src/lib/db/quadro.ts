import "server-only"

import { cpfConfiavel } from "@/lib/cpf"
import { texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import {
  NAO_E_DA_ENTIDADE,
  VINCULOS_DE_TRABALHO,
  VINCULOS_INSTITUICAO,
} from "@/lib/vinculos-instituicao"

/**
 * Quadro da entidade: quem é funcionário, diretor, prestador, aprendiz ou
 * estagiário. Duas fontes dizem isso e divergiam:
 *
 * - `usuarios.vinculo_instituicao` — a classificação (painel, caixa, convites);
 * - `vinculos_trabalhistas` com `empregador_id` = a entidade — o módulo Pessoal.
 *
 * Varredura de 16/09/2026 (Sindipetro-NF): trabalhadores de fontes pagadoras
 * (Baker Hughes, Halliburton, SLB, GT Química…) que entraram no cadastro de
 * usuários por votarem apareciam classificados como funcionários ou
 * prestadores, e alguns com vínculo trabalhista apontando para o sindicato —
 * com a matrícula da empresa deles. A tela junta as duas fontes por pessoa e
 * aponta o que não bate; a classificação corrige as duas.
 */

export type VinculoEntidade = {
  id: string
  cargo: string | null
  lotacao: string | null
  matricula: string | null
  contrato: string | null
  admissao: string | null
  demissao: string | null
}

export type VinculoExterno = { empresa: string; cargo: string | null; matricula: string | null }

export type PessoaQuadro = {
  usuarioId: string
  nome: string | null
  email: string | null
  classificacao: string | null
  inativo: boolean
  /** Cadastro excluído que ainda tem vínculo aberto com a entidade (segue ativo no Pessoal). */
  excluido: boolean
  temLogin: boolean
  temAcesso: boolean
  filiado: boolean
  vinculosEntidade: VinculoEntidade[]
  outrasEmpresas: VinculoExterno[]
  /** Tem contracheque, ponto ou férias no Pessoal: prova que trabalha na entidade. */
  temRegistrosPessoal: boolean
  /** O que não bate — a pessoa vai para "A conferir". */
  alertas: string[]
  /** Classificação que os dados indicam, quando há alerta (ou NAO_E_DA_ENTIDADE). */
  sugestao: string | null
}

/** Matrícula comparável: sem zeros à esquerda; "0" e vazia não contam. */
const matriculaUtil = (m: string | null) => (m ?? "").trim().replace(/^0+/, "") || null

async function emLotes<T>(
  ids: string[],
  consulta: (lote: string[]) => PromiseLike<{ data: T[] | null }>
): Promise<T[]> {
  const saida: T[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await consulta(ids.slice(i, i + 200))
    saida.push(...(data ?? []))
  }
  return saida
}

export async function listarQuadro(): Promise<PessoaQuadro[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const [{ data: classificados }, { data: vinculosEnt }] = await Promise.all([
    admin
      .from("usuarios")
      .select("id")
      .eq("emp_proprietaria_id", emp)
      .not("vinculo_instituicao", "is", null)
      .not("deletado", "is", true),
    admin
      .from("vinculos_trabalhistas")
      .select("id, trabalhador_id, cargo, lotacao, matricula, contrato_trabalho, contrato_admissao, contrato_demissao")
      .eq("empregador_id", emp),
  ])
  const ids = [
    ...new Set([
      ...(classificados ?? []).map((u) => String(u.id)),
      ...(vinculosEnt ?? []).map((v) => texto(v.trabalhador_id)).filter((v): v is string => Boolean(v)),
    ]),
  ]
  if (ids.length === 0) return []

  const [usuarios, externos, acessos, contracheques, ponto, ferias] = await Promise.all([
    emLotes(ids, (l) =>
      admin
        .from("usuarios")
        .select("id, nome_completo, nome_guerra, email, cpf, vinculo_instituicao, inativo, deletado, auth_user_id")
        .in("id", l)
    ),
    emLotes(ids, (l) =>
      admin
        .from("vinculos_trabalhistas")
        .select("trabalhador_id, empregador_id, cargo, matricula")
        .in("trabalhador_id", l)
        .neq("empregador_id", emp)
    ),
    emLotes(ids, (l) => admin.from("permissoes").select("usuario_id").eq("emp_proprietaria_id", emp).in("usuario_id", l)),
    emLotes(ids, (l) => admin.from("pessoal_contracheques").select("funcionario_id").in("funcionario_id", l)),
    emLotes(ids, (l) => admin.from("pessoal_registro_ponto").select("funcionario_id").in("funcionario_id", l)),
    emLotes(ids, (l) => admin.from("pessoal_ferias").select("trabalhador_id").in("trabalhador_id", l)),
  ])

  const empresaIds = [...new Set(externos.map((e) => texto(e.empregador_id)).filter((v): v is string => Boolean(v)))]
  const empresas = await emLotes(empresaIds, (l) => admin.from("empresa").select("id, nome_fantasia, nome_razao").in("id", l))
  const nomeEmpresa = new Map(empresas.map((e) => [String(e.id), texto(e.nome_fantasia) ?? texto(e.nome_razao) ?? "empresa"]))

  const cpfs = usuarios.map((u) => cpfConfiavel(texto(u.cpf))).filter((v): v is string => Boolean(v))
  const filiacoes = await emLotes(cpfs, (l) =>
    admin.from("filiacoes").select("cpf").eq("emp_proprietaria_id", emp).in("cpf", l).not("filiacao_excluida", "is", true)
  )
  const cpfsFiliados = new Set(filiacoes.map((f) => String(f.cpf)))
  const comAcesso = new Set(acessos.map((a) => String(a.usuario_id)))
  const registros = new Map<string, number>()
  for (const r of [...contracheques, ...ponto]) registros.set(String(r.funcionario_id), (registros.get(String(r.funcionario_id)) ?? 0) + 1)
  for (const r of ferias) registros.set(String(r.trabalhador_id), (registros.get(String(r.trabalhador_id)) ?? 0) + 1)

  const comVinculoAberto = new Set(
    (vinculosEnt ?? []).filter((v) => !v.contrato_demissao).map((v) => String(v.trabalhador_id))
  )
  return usuarios
    // Excluído só aparece se ainda está ativo no Pessoal — é o que precisa de conserto.
    .filter((u) => u.deletado !== true || comVinculoAberto.has(String(u.id)))
    .map((u) => {
      const id = String(u.id)
      const classificacao = texto(u.vinculo_instituicao)
      const vinculosEntidade: VinculoEntidade[] = (vinculosEnt ?? [])
        .filter((v) => v.trabalhador_id === id)
        .map((v) => ({
          id: String(v.id),
          cargo: texto(v.cargo),
          lotacao: texto(v.lotacao),
          matricula: texto(v.matricula),
          contrato: texto(v.contrato_trabalho),
          admissao: texto(v.contrato_admissao),
          demissao: texto(v.contrato_demissao),
        }))
      const outrasEmpresas: VinculoExterno[] = externos
        .filter((e) => e.trabalhador_id === id)
        .map((e) => ({
          empresa: nomeEmpresa.get(String(e.empregador_id)) ?? "empresa",
          cargo: texto(e.cargo),
          matricula: texto(e.matricula),
        }))
      const temRegistrosPessoal = (registros.get(id) ?? 0) > 0

      const excluido = u.deletado === true
      const alertas: string[] = []
      if (excluido) {
        alertas.push("Cadastro excluído, mas o vínculo com a entidade segue aberto — aparece como ativo no Pessoal")
      }
      const matriculasExternas = new Set(outrasEmpresas.map((e) => matriculaUtil(e.matricula)).filter(Boolean))
      const repetida = vinculosEntidade.find((v) => matriculaUtil(v.matricula) && matriculasExternas.has(matriculaUtil(v.matricula)))
      if (repetida) {
        const empresa = outrasEmpresas.find((e) => matriculaUtil(e.matricula) === matriculaUtil(repetida.matricula))?.empresa
        alertas.push(`O vínculo com a entidade tem a matrícula ${repetida.matricula}, a mesma da ${empresa}`)
      }
      // Só vínculo ABERTO: quem já saiu (demissão registrada) não precisa de classificação.
      if (vinculosEntidade.some((v) => !v.demissao) && !classificacao && !excluido) {
        alertas.push("Está ativo no Pessoal (vínculo trabalhista com a entidade), mas não tem classificação")
      }
      if (
        classificacao &&
        classificacao !== "Diretor(a)" &&
        vinculosEntidade.length === 0 &&
        outrasEmpresas.length > 0
      ) {
        alertas.push(`Classificado como ${classificacao}, mas só tem vínculo com ${outrasEmpresas.map((e) => e.empresa).join(", ")}`)
      }
      if (classificacao && VINCULOS_DE_TRABALHO.includes(classificacao) && vinculosEntidade.length === 0 && outrasEmpresas.length === 0) {
        alertas.push(`Classificado como ${classificacao}, sem vínculo trabalhista com a entidade`)
      }
      const chaves = vinculosEntidade.map((v) => `${v.matricula ?? ""}|${v.cargo ?? ""}|${v.admissao ?? ""}`)
      if (new Set(chaves).size < chaves.length) alertas.push("Vínculo com a entidade repetido")

      // Sugestão só onde há o que conferir. Contracheque, ponto ou férias
      // provam que trabalha aqui; matrícula de outra empresa, que não.
      let sugestao: string | null = null
      if (alertas.length > 0 && !excluido) {
        const contratos = vinculosEntidade.map((v) => `${v.contrato ?? ""} ${v.cargo ?? ""}`.toLowerCase()).join(" ")
        const classePeloContrato = contratos.includes("aprendiz")
          ? "Jovem aprendiz"
          : contratos.includes("estág") || contratos.includes("estagi")
            ? "Estagiário(a)"
            : null
        if (temRegistrosPessoal) {
          sugestao = classificacao ?? classePeloContrato ?? "Funcionário(a)"
        } else if (classificacao === "Diretor(a)") {
          // Diretor é petroleiro de alguma empresa por definição: nunca sugerir tirá-lo.
          sugestao = null
        } else if (repetida || (vinculosEntidade.length === 0 && outrasEmpresas.length > 0)) {
          sugestao = NAO_E_DA_ENTIDADE
        } else if (vinculosEntidade.length > 0 && !classificacao) {
          sugestao = classePeloContrato ?? (outrasEmpresas.length > 0 ? NAO_E_DA_ENTIDADE : null)
        }
      }

      return {
        usuarioId: id,
        nome: texto(u.nome_completo) ?? texto(u.nome_guerra),
        email: texto(u.email),
        classificacao,
        inativo: u.inativo === true,
        excluido,
        temLogin: Boolean(u.auth_user_id),
        temAcesso: comAcesso.has(id),
        filiado: cpfsFiliados.has(cpfConfiavel(texto(u.cpf)) ?? "-"),
        vinculosEntidade,
        outrasEmpresas,
        temRegistrosPessoal,
        alertas,
        sugestao,
      }
    })
    .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))
}

/**
 * Grava a classificação. "Não é da entidade" limpa a classificação e, com
 * confirmação, exclui os vínculos trabalhistas com a entidade (tiram a pessoa
 * do Pessoal) — mas nunca de quem tem contracheque, ponto ou férias: esses
 * registros provam que ela trabalha aqui.
 */
export async function classificarPessoa(dados: {
  usuarioId: string
  classificacao: string
  excluirVinculos: boolean
}): Promise<{ erro?: string; ok?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const naoE = dados.classificacao === NAO_E_DA_ENTIDADE
  if (!naoE && !(VINCULOS_INSTITUICAO as readonly string[]).includes(dados.classificacao)) {
    return { erro: "Classificação inválida." }
  }

  const { data: pessoa } = await admin
    .from("usuarios")
    .select("id, nome_completo")
    .eq("id", dados.usuarioId)
    .eq("emp_proprietaria_id", emp)
    .not("deletado", "is", true)
    .maybeSingle()
  if (!pessoa) return { erro: "Pessoa não encontrada." }
  const primeiroNome = (texto(pessoa.nome_completo) ?? "A pessoa").split(" ")[0]

  let excluidos = 0
  if (naoE) {
    const { data: vinculos } = await admin
      .from("vinculos_trabalhistas")
      .select("id")
      .eq("trabalhador_id", dados.usuarioId)
      .eq("empregador_id", emp)
    const ids = (vinculos ?? []).map((v) => String(v.id))
    if (ids.length > 0) {
      if (!dados.excluirVinculos) {
        return { erro: `Confirme a exclusão ${ids.length === 1 ? "do vínculo" : `dos ${ids.length} vínculos`} com a entidade.` }
      }
      const [c, p, f] = await Promise.all([
        admin.from("pessoal_contracheques").select("id", { count: "exact", head: true }).eq("funcionario_id", dados.usuarioId),
        admin.from("pessoal_registro_ponto").select("id", { count: "exact", head: true }).eq("funcionario_id", dados.usuarioId),
        admin.from("pessoal_ferias").select("id", { count: "exact", head: true }).eq("trabalhador_id", dados.usuarioId),
      ])
      const registros = (c.count ?? 0) + (p.count ?? 0) + (f.count ?? 0)
      if (registros > 0) {
        return {
          erro: `${primeiroNome} tem ${registros} registro(s) de contracheque, ponto ou férias no Pessoal — trabalha ou trabalhou na entidade. O vínculo não foi excluído; se saiu, registre a demissão no Pessoal.`,
        }
      }
      const { error } = await admin
        .from("vinculos_trabalhistas")
        .delete()
        .in("id", ids)
        .eq("empregador_id", emp)
      if (error) return { erro: `Não foi possível excluir o vínculo: ${error.message}` }
      excluidos = ids.length
    }
  }

  const { error } = await admin
    .from("usuarios")
    .update({ vinculo_instituicao: naoE ? null : dados.classificacao, updated_at: new Date().toISOString() })
    .eq("id", dados.usuarioId)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }

  if (!naoE) return { ok: `${primeiroNome}: ${dados.classificacao}.` }
  return {
    ok:
      `${primeiroNome} saiu do quadro da entidade` +
      (excluidos ? ` e ${excluidos === 1 ? "o vínculo trabalhista foi excluído" : `${excluidos} vínculos trabalhistas foram excluídos`}.` : "."),
  }
}
