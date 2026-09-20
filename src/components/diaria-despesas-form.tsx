"use client"

import { useActionState, useState } from "react"
import { Loader2, Paperclip, Plus, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import { formatarMoeda } from "@/lib/formato"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none"

export type DespesaNaTela = {
  id: string
  tipoNome: string | null
  descricao: string | null
  valor: number
  comprovanteUrl: string | null
}

/**
 * Despesas extras de uma diária ainda em avaliação. Serve às duas portas (a
 * do diretor e a do funcionário) — quem chama passa as ações do seu módulo.
 */
export function DespesasDaDiaria({
  solicitacaoId,
  despesas,
  tipos,
  acaoAdicionar,
  acaoRemover,
}: {
  solicitacaoId: string
  despesas: DespesaNaTela[]
  tipos: { id: string; nome: string; exigeComprovante: boolean }[]
  acaoAdicionar: (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>
  acaoRemover: (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, adicionar, pendente] = useActionState<EstadoForm, FormData>(
    async (prev, formData) => {
      const r = await acaoAdicionar(prev, formData)
      if (r.ok) setAberto(false)
      return r
    },
    {}
  )
  const [estadoRemocao, remover, removendo] = useActionState<EstadoForm, FormData>(acaoRemover, {})
  const total = despesas.reduce((s, d) => s + d.valor, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Despesas extras</CardTitle>
        <CardDescription>
          Hospedagem, alimentação, passagem — cada uma vai para a conta contábil dela, dentro da
          mesma ordem de pagamento.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {despesas.length > 0 ? (
          <ul className="grid gap-1 text-sm">
            {despesas.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  {d.tipoNome ?? "Despesa"}
                  {d.descricao && <span className="text-muted-foreground"> — {d.descricao}</span>}
                  {d.comprovanteUrl && (
                    <a
                      href={d.comprovanteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary ml-2 inline-flex items-center gap-1 hover:underline"
                    >
                      <Paperclip className="size-3" />
                      comprovante
                    </a>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{formatarMoeda(d.valor)}</span>
                  <form action={remover}>
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="solicitacao_id" value={solicitacaoId} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      disabled={removendo}
                      aria-label="Excluir despesa"
                    >
                      {removendo ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    </Button>
                  </form>
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-2 border-t pt-2 font-medium">
              <span>Total das despesas</span>
              <span className="tabular-nums">{formatarMoeda(total)}</span>
            </li>
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Nenhuma despesa extra lançada.</p>
        )}

        {estadoRemocao.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estadoRemocao.erro}</AlertDescription>
          </Alert>
        )}

        {aberto ? (
          <form action={adicionar} className="grid gap-4 border-t pt-4">
            <input type="hidden" name="solicitacao_id" value={solicitacaoId} />
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="tipo_id">Tipo</Label>
                <select id="tipo_id" name="tipo_id" className={SELECT} defaultValue="" required>
                  <option value="">Escolha…</option>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="valor">Valor</Label>
                <Input id="valor" name="valor" inputMode="decimal" placeholder="0,00" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="comprovante">Comprovante</Label>
                <Input
                  id="comprovante"
                  name="comprovante"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="descricao">Descrição (opcional)</Label>
              <Input
                id="descricao"
                name="descricao"
                placeholder="Ex.: hotel em Macaé, 2 diárias"
              />
            </div>

            {estado.erro && (
              <Alert variant="destructive">
                <AlertDescription>{estado.erro}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={pendente}>
                {pendente && <Loader2 className="animate-spin" />}
                Lançar despesa
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAberto(true)}
              disabled={tipos.length === 0}
            >
              <Plus />
              Lançar despesa
            </Button>
            {tipos.length === 0 && (
              <p className="text-muted-foreground mt-2 text-xs">
                Nenhum tipo de despesa cadastrado — rode supabase/diarias-diretoria.sql.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
