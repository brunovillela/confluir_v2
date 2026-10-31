"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { avisar, depoisDaResposta, usuariosComPermissao } from "@/lib/db/avisos"
import {
  atualizarDeliberacao,
  criarDeliberacao,
  excluirDeliberacao,
  nivelDoUsuario,
  obterDeliberacao,
  type DadosDeliberacao,
} from "@/lib/db/deliberacoes"
import {
  ehSigiloDeliberacao,
  ehSituacaoDeliberacao,
  nivelSigilo,
  ROTULO_SIGILO_DELIBERACAO,
  sigilosVisiveis,
  type SigiloDeliberacao,
} from "@/lib/deliberacoes-constantes"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Item existente fora do sigilo do usuário = como se não existisse (não
 * revela que há algo ali). Devolve o erro, ou o item atual se pode mexer.
 */
async function conferirAlcance(
  id: string,
  sigilos: SigiloDeliberacao[]
): Promise<{ erro: string } | { atual: NonNullable<Awaited<ReturnType<typeof obterDeliberacao>>> }> {
  const atual = await obterDeliberacao(id)
  if (!atual || !sigilos.includes(atual.sigilo)) return { erro: "Deliberação não encontrada." }
  return { atual }
}

/**
 * Avisa o novo responsável usuário (sino; e-mail, Telegram e celular conforme
 * a preferência dele). Sem o assunto — o sigilo não sai do painel —, só o
 * prazo. Melhor esforço, depois da resposta: não segura quem salvou.
 */
function avisarResponsavel(responsavelId: string, prazo: string | null, quemSalvou: string): void {
  if (responsavelId === quemSalvou) return
  depoisDaResposta(async () => {
    const pessoas = await usuariosComPermissao("deliberacoes_livre", ["deliberacoes_reservado", "deliberacoes_restrito"])
    const quem = pessoas.filter((p) => p.id === responsavelId)
    if (quem.length === 0) return
    const [a, m, d] = (prazo ?? "").split("-")
    await avisar(quem, {
      texto: prazo
        ? `Uma deliberação de ata foi atribuída a você, com prazo até ${d}/${m}/${a}.`
        : "Uma deliberação de ata foi atribuída a você.",
      link: "/painel/institucional/deliberacoes?responsavel=eu",
      evento: "deliberacao_responsavel",
      assunto: "Deliberação atribuída a você",
      exceto: quemSalvou,
    })
  })
}

function campo(fd: FormData, nome: string): string {
  return String(fd.get(nome) ?? "").trim()
}

function lerDados(fd: FormData): DadosDeliberacao | { erro: string; campo: string } {
  const assunto = campo(fd, "assunto")
  if (!assunto) return { erro: "Informe o assunto da deliberação.", campo: "assunto" }
  if (assunto.length > 200) return { erro: "O assunto passa de 200 caracteres — o detalhe vai no teor.", campo: "assunto" }
  const situacao = campo(fd, "situacao")
  const sigilo = campo(fd, "sigilo")
  if (!ehSigiloDeliberacao(sigilo)) return { erro: "Escolha o sigilo.", campo: "sigilo" }
  const prazo = campo(fd, "prazo")
  return {
    assunto,
    texto: campo(fd, "texto") || null,
    votacao: campo(fd, "votacao") || null,
    responsavel: campo(fd, "responsavel") || null,
    responsavel_id: UUID.test(campo(fd, "responsavel_id")) ? campo(fd, "responsavel_id") : null,
    prazo: /^\d{4}-\d{2}-\d{2}$/.test(prazo) ? prazo : null,
    situacao: ehSituacaoDeliberacao(situacao) ? situacao : "a_cumprir",
    sigilo,
  }
}

function revalidar(ataId: string) {
  revalidatePath(`/painel/institucional/atas/${ataId}`)
  revalidatePath("/painel/institucional/deliberacoes")
}

export async function salvarDeliberacaoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("diretoria_reunioes")
  const sigilos = sigilosVisiveis(nivelSigilo(sessao.permissoes))
  if (sigilos.length === 0) return { erro: "Seu acesso às deliberações é nenhum — peça à administração um nível de sigilo." }
  const ataId = campo(fd, "ata_id")
  const id = campo(fd, "deliberacao_id")
  if (!ataId) return { erro: "Ata inválida." }
  const dados = lerDados(fd)
  if ("erro" in dados) return dados
  if (!sigilos.includes(dados.sigilo)) {
    return { erro: "Esse grau de sigilo está acima do seu acesso às deliberações.", campo: "sigilo" }
  }
  let responsavelAnterior: string | null = null
  if (id) {
    const alcance = await conferirAlcance(id, sigilos)
    if ("erro" in alcance) return { erro: alcance.erro }
    responsavelAnterior = alcance.atual.responsavelId
  }
  // O responsável usuário precisa enxergar a deliberação — senão receberia
  // um aviso que não consegue abrir.
  if (dados.responsavel_id) {
    const nivelResp = await nivelDoUsuario(dados.responsavel_id)
    if (!sigilosVisiveis(nivelResp).includes(dados.sigilo)) {
      return {
        erro: `O responsável escolhido não tem acesso a deliberações de sigilo ${ROTULO_SIGILO_DELIBERACAO[dados.sigilo].toLowerCase()}. Escolha outra pessoa, baixe o sigilo ou peça à administração o nível dele.`,
        campo: "responsavel_id",
      }
    }
  }
  const { erro } = id
    ? await atualizarDeliberacao(id, dados, sessao.usuario.id)
    : await criarDeliberacao(ataId, dados, sessao.usuario.id)
  if (erro) return { erro }
  // Só quando o responsável muda (ou nasce com um): editar outro campo não reavisa.
  if (dados.responsavel_id && dados.responsavel_id !== responsavelAnterior) {
    avisarResponsavel(dados.responsavel_id, dados.prazo, sessao.usuario.id)
  }
  revalidar(ataId)
  redirect(`/painel/institucional/atas/${ataId}?deliberacao_salva=1#deliberacoes`)
}

export async function excluirDeliberacaoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("diretoria_reunioes")
  const ataId = campo(fd, "ata_id")
  const id = campo(fd, "deliberacao_id")
  if (!ataId || !id) return { erro: "Deliberação inválida." }
  const alcance = await conferirAlcance(id, sigilosVisiveis(nivelSigilo(sessao.permissoes)))
  if ("erro" in alcance) return { erro: alcance.erro }
  const { erro } = await excluirDeliberacao(id)
  if (erro) return { erro }
  revalidar(ataId)
  redirect(`/painel/institucional/atas/${ataId}?deliberacao_excluida=1#deliberacoes`)
}
