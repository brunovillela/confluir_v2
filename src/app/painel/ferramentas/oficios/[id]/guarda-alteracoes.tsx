"use client"

import { useState, type FormEvent } from "react"
import { Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formularioOficioAlterado, salvarFormularioOficio } from "@/lib/oficio-alteracoes"

/**
 * Segura o envio para assinatura e a emissão quando o formulário do ofício,
 * mais acima na página, tem alteração não salva: as duas ações usam a versão
 * salva, e a pessoa mandaria o texto antigo sem perceber.
 */
export function useGuardaAlteracoes() {
  const [bloqueado, setBloqueado] = useState(false)

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (!formularioOficioAlterado()) {
      setBloqueado(false)
      return
    }
    e.preventDefault()
    setBloqueado(true)
  }

  const aviso = bloqueado ? (
    <div className="border-warning/40 bg-warning/10 grid w-full gap-2 rounded-md border px-3 py-2 text-sm">
      <p>
        Há alterações no ofício que ainda não foram salvas. O envio usa a versão salva: salve
        primeiro e depois clique de novo.
      </p>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            salvarFormularioOficio()
            setBloqueado(false)
          }}
        >
          <Save />
          Salvar alterações
        </Button>
      </div>
    </div>
  ) : null

  return { onSubmit, aviso }
}
