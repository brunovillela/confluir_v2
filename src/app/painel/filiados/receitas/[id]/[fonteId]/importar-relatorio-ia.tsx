"use client"

import { useActionState, useState } from "react"
import { Loader2, RotateCcw, Save, Sparkles } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatarCnpjCpf } from "@/lib/formato"

import {
  extrairContribuicoesIa,
  registrarContribuicoesIa,
} from "./ia-actions"

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export function ImportarRelatorioIa({
  remessaId,
  fonteId,
}: {
  remessaId: string
  fonteId: string
}) {
  const [estado, extrairAction, extraindo] = useActionState(
    extrairContribuicoesIa,
    {}
  )
  const [confirmando, setConfirmando] = useState(false)
  const [erroConfirm, setErroConfirm] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{
    identificados: number
    naoEncontrados: number
  } | null>(null)

  async function confirmar() {
    if (!estado.itens) return
    setConfirmando(true)
    setErroConfirm(null)
    const r = await registrarContribuicoesIa(remessaId, fonteId, estado.itens)
    setConfirmando(false)
    if (r.erro) {
      setErroConfirm(r.erro)
      return
    }
    setResultado({
      identificados: r.identificados ?? 0,
      naoEncontrados: r.naoEncontrados ?? 0,
    })
  }

  if (resultado) {
    return (
      <Alert className="border-success/40 text-success-fg">
        <AlertDescription>
          <p className="font-medium">Contribuições registradas.</p>
          <p className="mt-0.5 text-sm">
            {resultado.identificados.toLocaleString("pt-BR")} identificada
            {resultado.identificados === 1 ? "" : "s"} ·{" "}
            {resultado.naoEncontrados.toLocaleString("pt-BR")} não encontrada
            {resultado.naoEncontrados === 1 ? "" : "s"} no cadastro. Recarregue a
            página para ver a relação atualizada.
          </p>
        </AlertDescription>
      </Alert>
    )
  }

  if (estado.itens) {
    const itens = estado.itens
    return (
      <div className="grid gap-3">
        <Alert className="border-warning/40">
          <AlertDescription>
            <p className="font-medium">
              A IA leu {itens.length.toLocaleString("pt-BR")} contribuição
              {itens.length === 1 ? "" : "ões"} · total{" "}
              {brl(estado.totalValor ?? 0)}
            </p>
            <p className="mt-0.5 text-sm">
              {(estado.casados ?? 0).toLocaleString("pt-BR")} casada
              {estado.casados === 1 ? "" : "s"} com filiado ·{" "}
              {(estado.naoCasados ?? 0).toLocaleString("pt-BR")} não encontrada
              {estado.naoCasados === 1 ? "" : "s"}
              {estado.descartadas
                ? ` · ${estado.descartadas.toLocaleString("pt-BR")} linha(s) descartada(s)`
                : ""}
              . Confira o total com o depósito antes de confirmar — a IA pode
              errar valores ou pular linhas.
            </p>
          </AlertDescription>
        </Alert>

        <div className="max-h-72 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empregado</TableHead>
                <TableHead>Matrícula</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Filiado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.slice(0, 100).map((i, idx) => (
                <TableRow key={idx}>
                  <TableCell className="max-w-56 truncate text-sm">
                    {i.nome ?? (i.cpf ? formatarCnpjCpf(i.cpf) : "—")}
                  </TableCell>
                  <TableCell className="text-sm">
                    {i.matriculaFonte ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {brl(i.valor)}
                  </TableCell>
                  <TableCell>
                    {i.via === "nome" ? (
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        por nome — revisar
                      </span>
                    ) : i.via ? (
                      <span className="text-success-fg text-xs">
                        por {i.via === "cpf" ? "CPF" : "matrícula"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        não encontrado
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {itens.length > 100 && (
            <p className="text-muted-foreground p-2 text-center text-xs">
              … e mais {(itens.length - 100).toLocaleString("pt-BR")} linha(s)
            </p>
          )}
        </div>

        {erroConfirm && (
          <Alert variant="destructive">
            <AlertDescription>{erroConfirm}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={confirmar} disabled={confirmando}>
            {confirmando ? <Loader2 className="animate-spin" /> : <Save />}
            {confirmando
              ? "Registrando…"
              : `Confirmar e registrar ${itens.length.toLocaleString("pt-BR")}`}
          </Button>
          <Button
            variant="ghost"
            onClick={() => window.location.reload()}
            disabled={confirmando}
          >
            <RotateCcw />
            Cancelar / outro arquivo
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form action={extrairAction} className="grid gap-3">
      <input type="hidden" name="remessa_id" value={remessaId} />
      <input type="hidden" name="fonte_id" value={fonteId} />
      <div className="grid gap-1.5">
        <Label htmlFor="arquivo-ia">Relatório da empresa (CSV, Excel ou PDF)</Label>
        <Input
          id="arquivo-ia"
          name="arquivo"
          type="file"
          accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.pdf,application/pdf"
          required
        />
        <p className="text-muted-foreground text-xs">
          A IA lê o relatório em qualquer layout e identifica o filiado por nome,
          CPF ou matrícula; você confere e confirma antes de registrar. Casamentos
          &quot;por nome&quot; aparecem destacados para revisão. Aceita CSV, Excel
          e PDF — inclusive PDF escaneado (imagem), que usa leitura por visão e
          pode demorar um pouco mais.
        </p>
      </div>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={extraindo}>
          {extraindo ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {extraindo ? "Lendo o relatório…" : "Ler relatório com IA"}
        </Button>
      </div>
    </form>
  )
}
