import "server-only"

import { obterPerfil } from "@/lib/db/perfil"
import { diretoriaDoUsuario } from "@/lib/db/perfil-diretor"

/**
 * Quem cuida da própria conta no Meu perfil: funcionário do sindicato (com
 * vínculo, mesmo desligado — pode haver acerto a receber) ou integrante da
 * diretoria do mandato vigente. Devolve o CPF para sugerir o titular.
 */
export async function contaPropriaPermitida(usuarioId: string): Promise<{ pode: boolean; cpf: string | null }> {
  const perfil = await obterPerfil(usuarioId)
  if (!perfil) return { pode: false, cpf: null }
  if (perfil.ehFuncionario) return { pode: true, cpf: perfil.cpf }
  const diretoria = await diretoriaDoUsuario(usuarioId, perfil.cpf).catch(() => null)
  return { pode: Boolean(diretoria), cpf: perfil.cpf }
}
