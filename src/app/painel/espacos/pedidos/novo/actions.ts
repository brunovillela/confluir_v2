"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import {
  entidadeParaRegistro,
  filiadoParaRegistro,
  publicoDoEspaco,
  registrarPedidoPelaEquipe,
} from "@/lib/db/espacos-solicitacao"
import { tenantAtual } from "@/lib/tenant"

export type EstadoRegistro = { erro?: string }

const txt = (fd: FormData, nome: string) => String(fd.get(nome) ?? "").trim()
const sim = (fd: FormData, nome: string) => fd.get(nome) === "on"

/**
 * Pedido registrado pela equipe. Quem pede é um filiado (dados do cadastro),
 * uma entidade (nome da linha de `empresa` + a pessoa de contato) ou alguém
 * avulso (tudo digitado).
 */
export async function registrarPedidoEquipeAction(
  _prev: EstadoRegistro,
  fd: FormData
): Promise<EstadoRegistro> {
  const sessao = await requirePermissao("espacos", ["espacos_gestao"])
  const tenantId = await tenantAtual()
  const espacoId = txt(fd, "espaco_id")
  if (!espacoId) return { erro: "Escolha o espaço." }
  const publico = await publicoDoEspaco(espacoId, tenantId)
  if (!publico) return { erro: "Espaço não encontrado." }

  const tipo = txt(fd, "tipo_solicitante")
  let nome = txt(fd, "nome")
  let cpf: string | null = txt(fd, "cpf") || null
  let email: string | null = txt(fd, "email") || null
  let telefone: string | null = txt(fd, "telefone") || null
  let entidade: string | null = txt(fd, "entidade") || null

  if (tipo === "filiado") {
    const id = txt(fd, "filiado_id")
    if (!id) return { erro: "Escolha o filiado." }
    const f = await filiadoParaRegistro(id, tenantId)
    if (!f) return { erro: "Filiado não encontrado." }
    if (publico === "filiados" && !f.ativo) {
      return { erro: "Este espaço é só para filiados, e a filiação desta pessoa não está ativa." }
    }
    nome = f.nome ?? nome
    cpf = f.cpf
    // O que a equipe digitou vale sobre o cadastro (telefone novo, outro e-mail).
    email = email ?? f.email
    telefone = telefone ?? f.telefone
  } else if (publico === "filiados") {
    return { erro: "Este espaço é cedido só a filiados — escolha o filiado." }
  } else if (tipo === "entidade") {
    const id = txt(fd, "empresa_id")
    if (!id) return { erro: "Escolha a entidade." }
    const e = await entidadeParaRegistro(id, tenantId)
    if (!e) return { erro: "Entidade não encontrada." }
    entidade = e.nome
    email = email ?? e.email
    if (!nome) return { erro: "Informe a pessoa de contato da entidade." }
  }

  const publicoBruto = txt(fd, "publico_estimado")
  const { erro, id, numero } = await registrarPedidoPelaEquipe(
    {
      espacoId,
      nome,
      cpf,
      email,
      telefone,
      entidade,
      representanteNome: txt(fd, "representante_nome") || null,
      representanteTelefone: txt(fd, "representante_telefone") || null,
      inicio: txt(fd, "inicio"),
      termino: txt(fd, "termino"),
      montagemInicio: txt(fd, "montagem_inicio") || null,
      desmontagemTermino: txt(fd, "desmontagem_termino") || null,
      finalidade: txt(fd, "finalidade"),
      publicoEstimado: publicoBruto ? Number(publicoBruto) : null,
      respostas: {
        infantil: sim(fd, "tem_infantil"),
        idoso: sim(fd, "tem_idoso"),
        mobilidade: sim(fd, "tem_mobilidade"),
        bebida: sim(fd, "tem_bebida"),
        estresse: sim(fd, "tem_estresse"),
      },
      observacoes: txt(fd, "observacoes") || null,
    },
    {
      canal: txt(fd, "canal"),
      usuarioId: sessao.usuario.id as string,
      avisarSolicitante: sim(fd, "avisar_solicitante"),
    },
    tenantId
  )
  if (erro) return { erro }
  revalidatePath("/painel/espacos/pedidos")
  redirect(`/painel/espacos/pedidos/${id}?registrado=${numero}`)
}
