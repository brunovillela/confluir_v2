import "server-only"

import type { SessaoPainel } from "@/lib/auth"
import { alcadaDe } from "@/lib/db/avisos"
import { departamentosCoordenados } from "@/lib/db/coordenador"
import { obterPerfil } from "@/lib/db/perfil"
import { diretoriaDoUsuario } from "@/lib/db/perfil-diretor"
import { EVENTOS_TELEGRAM, eventoPermitido, type EventoTelegram, type PerfilDeAvisos } from "@/lib/telegram-eventos"

/**
 * Os avisos que a pessoa pode ligar (07/10/2026): os das áreas em que tem
 * permissão, os de coordenação se coordena um departamento e os sobre si
 * conforme seja funcionário ou diretor. A tela só mostra estes e a gravação
 * só aceita estes.
 */
export async function avisosPermitidos(sessao: SessaoPainel): Promise<EventoTelegram[]> {
  const usuarioId = sessao.usuario.id as string
  const [perfil, coordena] = await Promise.all([
    obterPerfil(usuarioId).catch(() => null),
    departamentosCoordenados(usuarioId).catch(() => []),
  ])
  const diretoria = await diretoriaDoUsuario(usuarioId, perfil?.cpf ?? null).catch(() => null)
  const perfilAvisos: PerfilDeAvisos = {
    permissoes: sessao.permissoes,
    coordenador: coordena.length > 0,
    alcada: alcadaDe(sessao.permissoes) > 0,
    funcionario: Boolean(perfil?.funcionarioAtivo),
    diretor: Boolean(diretoria),
  }
  return EVENTOS_TELEGRAM.map((e) => e.chave).filter((chave) => eventoPermitido(chave, perfilAvisos))
}
