"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { FiliadoPicker, type SugestaoFiliado } from "@/components/filiado-picker"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Textarea } from "@/components/ui/textarea"
import { TIPOS_REEMBOLSO } from "@/lib/reembolsos-tipos"
import type { ReembolsoLinha } from "@/lib/db/filiacao-reembolsos-edicao"

import { atualizarReembolsoAction, criarReembolsoAction } from "./actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

export type OpcaoProjeto = { id: string; titulo: string }

const ENDPOINT = "/painel/filiados/reembolsos/busca-filiado"

/**
 * Lançar ou editar um reembolso. Ao criar, o valor vem preenchido da
 * configuração e a ordem de pagamento nasce junto. Ao editar com a ordem já
 * paga, valor e data ficam travados — o dinheiro já saiu.
 */
export function ReembolsoForm({
  projetos,
  filiadoInicial,
  reembolso,
  comprovanteUrl,
  voltarPara,
}: {
  projetos: OpcaoProjeto[]
  /** Pré-seleção vinda do perfil do filiado. */
  filiadoInicial?: SugestaoFiliado | null
  reembolso?: ReembolsoLinha
  /** Link assinado do comprovante já anexado (a nota fiscal da ordem). */
  comprovanteUrl?: string | null
  voltarPara: string
}) {
  const [estado, formAction, pendente] = useActionState(
    reembolso ? atualizarReembolsoAction : criarReembolsoAction,
    {}
  )
  const envio = useEnvioFormulario(formAction, estado)
  const paga = reembolso?.ordem?.situacao === "Paga"
  const hoje = new Date().toISOString().slice(0, 10)

  return (
    <form action={formAction} {...envio} className="grid gap-4">
      {reembolso && <input type="hidden" name="reembolso_id" value={reembolso.id} />}
      {reembolso?.filiadoId && <input type="hidden" name="filiado_id" value={reembolso.filiadoId} />}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{reembolso ? "Reembolso" : "Novo reembolso"}</CardTitle>
          <CardDescription>
            {reembolso
              ? "A ordem de pagamento acompanha a edição enquanto não estiver paga."
              : "O lançamento gera a ordem de pagamento em autorização e registra no prontuário."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {reembolso ? (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Filiado</Label>
              <p className="text-sm">
                {reembolso.filiadoNome ?? "—"}
                {reembolso.filiadoId && (
                  <Link href={`/painel/filiados/${reembolso.filiadoId}`} className="text-muted-foreground ml-2 text-xs underline">
                    abrir perfil
                  </Link>
                )}
              </p>
            </div>
          ) : (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Filiado *</Label>
              <FiliadoPicker
                endpoint={ENDPOINT}
                inicial={filiadoInicial ?? null}
                placeholder="Busque o filiado por nome, CPF ou matrícula"
              />
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="data">Data de referência *</Label>
            <Input
              id="data"
              name="data"
              type="date"
              defaultValue={(reembolso?.data ?? hoje).slice(0, 10)}
              required
              disabled={paga}
            />
            {paga && <input type="hidden" name="data" value={(reembolso?.data ?? hoje).slice(0, 10)} />}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="valor">Valor *</Label>
            <Input
              id="valor"
              name="valor"
              inputMode="decimal"
              defaultValue={reembolso?.valor != null ? reembolso.valor.toFixed(2).replace(".", ",") : ""}
              placeholder="0,00"
              required
              disabled={paga}
            />
            {paga && reembolso?.valor != null && (
              <input type="hidden" name="valor" value={reembolso.valor.toFixed(2)} />
            )}
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="tipo">Tipo *</Label>
            <SelectNativo id="tipo" name="tipo" required defaultValue={reembolso?.tipo ?? ""}>
              <option value="" disabled>
                Escolha o tipo
              </option>
              {TIPOS_REEMBOLSO.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.rotulo}
                </option>
              ))}
            </SelectNativo>
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="justificativa">Justificativa *</Label>
            <Textarea
              id="justificativa"
              name="justificativa"
              rows={2}
              defaultValue={reembolso?.justificativa ?? ""}
              placeholder="Ex.: 25% do desconto salarial da greve de março"
              required
            />
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="projeto_id">Projeto</Label>
            <Select name="projeto_id" defaultValue={reembolso?.projetoId ?? "sem_projeto"}>
              <SelectTrigger id="projeto_id" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sem_projeto">Sem projeto</SelectItem>
                {projetos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.titulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Liga o gasto ao projeto (campanha, ato, congresso) para o Financeiro apurar por projeto.
            </p>
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="comprovante">
              {comprovanteUrl ? "Trocar o comprovante" : "Comprovante"}
            </Label>
            <Input
              id="comprovante"
              name="comprovante"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
            />
            <p className="text-muted-foreground text-xs">
              Nota fiscal, recibo ou outro comprovante da despesa (PDF ou imagem). Vai como a nota
              fiscal da ordem de pagamento.
              {comprovanteUrl && (
                <>
                  {" "}
                  <a href={comprovanteUrl} target="_blank" rel="noreferrer" className="underline">
                    Ver o comprovante atual
                  </a>
                </>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" asChild>
          <Link href={voltarPara}>Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {reembolso ? "Salvar alterações" : "Lançar reembolso"}
        </Button>
      </div>
    </form>
  )
}
