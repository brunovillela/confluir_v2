"use client"

import { startTransition, useActionState, useState } from "react"
import { Landmark, Loader2, Pencil, Plus, QrCode, Trash2, X } from "lucide-react"

import { CamposDadosBancarios } from "@/components/dados-bancarios-campos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { type EstadoForm } from "@/lib/contas"
import { rotuloTipoConta } from "@/lib/contracheques-constantes"
import { lerDocumentoTitular } from "@/lib/cpf"
import type { DadoBancarioFiliado } from "@/lib/db/filiacao-dados-bancarios"

import { excluirDadoBancarioFiliadoAction, salvarDadoBancarioFiliadoAction } from "./dados-bancarios-actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

/**
 * Contas e chaves Pix do filiado, uma por linha, com lápis e lixeira — o
 * formulário abre no lugar da linha. O principal é o que o reembolso usa
 * primeiro ao montar a ordem de pagamento.
 */
export function DadosBancariosFiliado({
  filiadoId,
  dados,
  podeEditar,
  cpfFiliado,
}: {
  filiadoId: string
  dados: DadoBancarioFiliado[]
  podeEditar: boolean
  cpfFiliado: string | null
}) {
  const [editando, setEditando] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)
  const [estadoExclusao, acaoExcluir, excluindo] = useActionState(excluirDadoBancarioFiliadoAction, {})
  const envio = useEnvioFormulario(acaoExcluir, estadoExclusao)
  const titularSugerido = lerDocumentoTitular(cpfFiliado).documento

  return (
    <div className="grid gap-3">
      {estadoExclusao.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estadoExclusao.erro}</AlertDescription>
        </Alert>
      )}
      {dados.length === 0 && !novo && (
        <p className="text-muted-foreground text-sm">Nenhuma conta ou chave Pix cadastrada.</p>
      )}

      {dados.map((d) =>
        editando === d.id ? (
          <DadoForm
            key={d.id}
            filiadoId={filiadoId}
            dado={d}
            titularSugerido={titularSugerido}
            aoFechar={() => setEditando(null)}
          />
        ) : (
          <div key={d.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
            <div className="grid min-w-0 gap-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {d.principal && <Badge>Principal</Badge>}
                <Badge variant="outline">{d.preferePix && d.pix ? "Pagar por Pix" : d.conta ? "Pagar na conta" : "Pix"}</Badge>
                {d.favorecido && <span className="text-muted-foreground break-words">Favorecido: {d.favorecido}</span>}
              </div>
              {d.pix && (
                <span className="inline-flex items-center gap-1.5 break-all">
                  <QrCode className="text-muted-foreground size-3.5 shrink-0" />
                  {d.pixTipo ? `${d.pixTipo}: ` : ""}
                  {d.pix}
                </span>
              )}
              {(d.conta || d.agencia) && (
                <span className="inline-flex items-center gap-1.5 break-words">
                  <Landmark className="text-muted-foreground size-3.5 shrink-0" />
                  {[
                    [d.banco, d.bancoCodigo ? `(${d.bancoCodigo})` : null].filter(Boolean).join(" ") || "Banco não informado",
                    d.agencia ? `ag. ${d.agencia}` : null,
                    d.conta ? `${rotuloTipoConta(d.tipoConta)?.toLowerCase() ?? "conta"} ${d.conta}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </div>
            {podeEditar && (
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Editar dado bancário"
                  onClick={() => {
                    setNovo(false)
                    setEditando(d.id)
                  }}
                >
                  <Pencil />
                </Button>
                <form action={acaoExcluir} {...envio}>
                  <input type="hidden" name="filiado_id" value={filiadoId} />
                  <input type="hidden" name="dado_id" value={d.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Excluir dado bancário"
                    disabled={excluindo}
                    className="text-destructive hover:text-destructive"
                    onClick={(e) => confirmarEnvio(e, "Excluir esta conta/chave Pix do filiado?")}
                  >
                    <Trash2 />
                  </Button>
                </form>
              </div>
            )}
          </div>
        )
      )}

      {podeEditar &&
        (novo ? (
          <DadoForm filiadoId={filiadoId} titularSugerido={titularSugerido} aoFechar={() => setNovo(false)} />
        ) : (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditando(null)
                setNovo(true)
              }}
            >
              <Plus />
              Adicionar conta ou Pix
            </Button>
          </div>
        ))}
    </div>
  )
}

function DadoForm({
  filiadoId,
  dado,
  titularSugerido,
  aoFechar,
}: {
  filiadoId: string
  dado?: DadoBancarioFiliado
  titularSugerido: string | null
  aoFechar: () => void
}) {
  const [estado, formAction, pendente] = useActionState(async (prev: EstadoForm, formData: FormData) => {
    const r = await salvarDadoBancarioFiliadoAction(prev, formData)
    if (r.ok) aoFechar()
    return r
  }, {})
  const p = dado ? `db-${dado.id}` : "db-novo"

  return (
    // Envio por startTransition: com `action={formAction}` o React 19
    // reinicia o formulário depois de um erro e o que foi digitado some.
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        startTransition(() => formAction(fd))
      }}
      className="bg-muted/30 grid gap-3 rounded-lg border p-3"
    >
      <input type="hidden" name="filiado_id" value={filiadoId} />
      {dado && <input type="hidden" name="dado_id" value={dado.id} />}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <CamposDadosBancarios prefixo={p} valores={dado ?? null} titularSugerido={titularSugerido} />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="principal" defaultChecked={dado?.principal ?? false} />
        Principal (o reembolso usa este primeiro)
      </label>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={aoFechar}>
          <X />
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {dado ? "Salvar" : "Adicionar"}
        </Button>
      </div>
    </form>
  )
}
