"use client"

import { useActionState, useState } from "react"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { type EstadoForm } from "@/lib/contas"
import { NAO_E_DA_ENTIDADE, VINCULOS_INSTITUICAO } from "@/lib/vinculos-instituicao"

import { classificarPessoaAction } from "../actions"

const rotulo = (v: string) => (v === NAO_E_DA_ENTIDADE ? "Não é da entidade" : v)

/**
 * Classificação de uma pessoa. "Não é da entidade" com vínculo trabalhista
 * pede a confirmação da exclusão do vínculo antes de enviar.
 */
export function ClassificarForm({
  usuarioId,
  atual,
  sugestao,
  vinculosEntidade,
}: {
  usuarioId: string
  atual: string | null
  sugestao: string | null
  vinculosEntidade: number
}) {
  // O aviso sai por toast, antes do re-render: classificada, a pessoa pode sair
  // do filtro atual e este cartão (com a mensagem) deixa de existir.
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(async (anterior, dados) => {
    const r = await classificarPessoaAction(anterior, dados)
    if (r.ok) toast.success(r.ok)
    return r
  }, {})
  const [valor, setValor] = useState(atual ?? "")
  const excluindo = valor === NAO_E_DA_ENTIDADE && vinculosEntidade > 0

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="usuario_id" value={usuarioId} />
      <div className="flex gap-2">
        <select
          name="classificacao"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          aria-label="Classificação"
          className="border-input bg-background h-9 min-w-0 flex-1 rounded-md border px-2 text-sm"
        >
          {!atual && (
            <option value="" disabled>
              Sem classificação
            </option>
          )}
          {VINCULOS_INSTITUICAO.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
          <option value={NAO_E_DA_ENTIDADE}>Não é da entidade</option>
        </select>
        <Button type="submit" size="sm" disabled={pendente || !valor || valor === (atual ?? "")}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
      </div>
      {sugestao && sugestao !== valor && (
        <button
          type="button"
          onClick={() => setValor(sugestao)}
          className="text-primary justify-self-start text-xs underline-offset-2 hover:underline"
        >
          Sugestão: {rotulo(sugestao)}
        </button>
      )}
      {excluindo && (
        <label className="border-destructive/40 flex items-start gap-2 rounded-md border p-2 text-xs">
          <input type="checkbox" name="excluir_vinculos" required className="mt-0.5 size-4" />
          <span>
            Excluir {vinculosEntidade === 1 ? "o vínculo trabalhista" : `os ${vinculosEntidade} vínculos trabalhistas`} com
            a entidade — a pessoa sai do Pessoal. Não vale para quem tem contracheque, ponto ou férias.
          </span>
        </label>
      )}
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
    </form>
  )
}
