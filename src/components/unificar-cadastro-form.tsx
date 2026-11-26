"use client"

import { useActionState } from "react"
import { Loader2, Merge } from "lucide-react"

import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import {
  unificarCadastroAction,
  type EstadoUnificacao,
} from "@/app/painel/gestao/usuarios/unificar-actions"

/** Botão "Unificar" de um outro cadastro da mesma pessoa, com confirmação. */
export function UnificarCadastroForm({
  usuarioId,
  outroId,
  voltar,
  fica,
  sai,
}: {
  usuarioId: string
  outroId: string
  voltar: string
  /** Como chamar o cadastro que fica e o que sai, para a pergunta. */
  fica: string
  sai: string
}) {
  const [estado, acao, pendente] = useActionState<EstadoUnificacao, FormData>(
    unificarCadastroAction,
    {}
  )
  const envio = useEnvioFormulario(acao, estado, {
    antes: (e) =>
      confirmarEnvio(e, {
        titulo: "Unificar os cadastros?",
        descricao: `Fica ${fica}. Tudo o que está em ${sai} (diretoria, permissões, vínculos, pedidos…) passa para ele, e ${sai} fica inativo, marcado como unificado. Não dá para desfazer pela tela.`,
        confirmar: "Unificar",
      }),
  })
  return (
    <form action={acao} {...envio} className="grid gap-1">
      <input type="hidden" name="usuario_id" value={usuarioId} />
      <input type="hidden" name="outro_id" value={outroId} />
      <input type="hidden" name="voltar" value={voltar} />
      <Button type="submit" size="sm" variant="outline" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Merge />}
        Unificar
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      {estado.ok && <span className="text-success-fg text-xs">{estado.ok}</span>}
    </form>
  )
}
