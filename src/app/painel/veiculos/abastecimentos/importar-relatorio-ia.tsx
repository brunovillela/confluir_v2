"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { List, Loader2, RotateCcw, Save, Sparkles } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import type { SituacaoLinha } from "@/lib/db/veiculos-abastecimentos-ia"

import type { Opcao } from "./abastecimento-forms"
import { lerRelatorioAbastecimentosIa, registrarAbastecimentosIa } from "./ia-actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full max-w-sm truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const dataBR = (iso: string) => iso.split("-").reverse().join("/")

const SITUACAO: Record<SituacaoLinha, { rotulo: string; classe: string }> = {
  ok: { rotulo: "Lançar", classe: "border-success/40 text-success-fg" },
  sem_veiculo: { rotulo: "Lançar sem veículo", classe: "border-warning/50 text-warning-fg" },
  duplicado: { rotulo: "Já lançado", classe: "text-muted-foreground" },
  repetido: { rotulo: "Repetido no arquivo", classe: "text-muted-foreground" },
}

/**
 * Relatório de abastecimento lido pela IA — fatura do cartão-combustível,
 * extrato do posto ou cupom, em PDF (mesmo escaneado), Excel, CSV ou foto.
 * Mostra o que foi lido, casado e já lançado antes de gravar. A placa fora da
 * frota também é lançada — sem veículo, para vincular depois na edição.
 */
export function ImportarRelatorioAbastecimentoIa({ veiculos }: { veiculos: Opcao[] }) {
  const [estado, lerAction, lendo] = useActionState(lerRelatorioAbastecimentosIa, {})
  const [veiculoPadrao, setVeiculoPadrao] = useState("")
  const [gravando, setGravando] = useState(false)
  const [erroGravar, setErroGravar] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{
    importados: number
    ignorados: number
    semVeiculo: number
    semCondutor: number
  } | null>(null)

  async function confirmar() {
    if (!estado.linhas) return
    setGravando(true)
    setErroGravar(null)
    const r = await registrarAbastecimentosIa(estado.linhas, veiculoPadrao || null, estado.arquivoNome ?? "")
    setGravando(false)
    if (r.erro) {
      setErroGravar(r.erro)
      return
    }
    setResultado({
      importados: r.importados ?? 0,
      ignorados: r.ignorados ?? 0,
      semVeiculo: r.semVeiculo ?? 0,
      semCondutor: r.semCondutor ?? 0,
    })
  }

  if (resultado) {
    return (
      <Alert variant="success">
        <AlertDescription>
          <p className="font-medium">
            {resultado.importados.toLocaleString("pt-BR")} abastecimento
            {resultado.importados === 1 ? " lançado" : "s lançados"}.
          </p>
          <p className="mt-0.5 text-sm">
            {resultado.semVeiculo > 0 &&
              `${resultado.semVeiculo.toLocaleString("pt-BR")} sem veículo identificado — vincule na lista (filtro "Sem veículo"). `}
            {resultado.semCondutor > 0 &&
              `${resultado.semCondutor.toLocaleString("pt-BR")} com condutor não identificado. `}
            {resultado.ignorados > 0 &&
              `${resultado.ignorados.toLocaleString("pt-BR")} já lançado(s) ou repetido(s) ficaram de fora. `}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <Link
              href={resultado.semVeiculo > 0 ? "/painel/veiculos/abastecimentos?veiculo=sem" : "/painel/veiculos/abastecimentos"}
              className="inline-flex items-center gap-1 font-medium underline"
            >
              <List className="size-4" />
              {resultado.semVeiculo > 0 ? "Ver os sem veículo" : "Ver na lista"}
            </Link>
            <button type="button" className="underline" onClick={() => window.location.reload()}>
              Ler outro relatório
            </button>
          </div>
        </AlertDescription>
      </Alert>
    )
  }

  if (estado.linhas) {
    const linhas = estado.linhas
    const semVeiculo = linhas.filter((l) => l.situacao === "sem_veiculo")
    const ok = linhas.filter((l) => l.situacao === "ok" || l.situacao === "sem_veiculo")
    const jaLancadas = linhas.filter((l) => l.situacao === "duplicado" || l.situacao === "repetido").length
    const comAlerta = ok.filter((l) => l.veiculoId && l.alertas.length > 0).length
    const placasFora = [...new Set(semVeiculo.map((l) => l.placa ?? "sem placa"))]
    return (
      <div className="grid gap-3">
        <Alert variant="warning">
          <AlertDescription>
            <p className="font-medium">
              A IA leu {linhas.length.toLocaleString("pt-BR")} abastecimento
              {linhas.length === 1 ? "" : "s"} · {ok.length.toLocaleString("pt-BR")} para lançar ·{" "}
              {brl(ok.reduce((s, l) => s + l.valor, 0))} ·{" "}
              {ok.reduce((s, l) => s + l.litros, 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L
            </p>
            <p className="mt-0.5 text-sm">
              {jaLancadas > 0 && `${jaLancadas} já lançado(s) ou repetido(s) — ficam de fora. `}
              {semVeiculo.length > 0 &&
                `${semVeiculo.length} com placa fora da frota (${placasFora.slice(0, 6).join(", ")}${placasFora.length > 6 ? "…" : ""}) — entram sem veículo, com a placa guardada para vincular depois. `}
              {comAlerta > 0 && `${comAlerta} com ponto a conferir. `}
              {estado.descartadas ? `${estado.descartadas} linha(s) descartada(s) por falta de data, litros ou valor. ` : ""}
              Confira o total com a fatura antes de confirmar — a IA pode errar valores ou pular linhas.
            </p>
          </AlertDescription>
        </Alert>

        <div className="max-h-96 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Posto e combustível</TableHead>
                <TableHead className="text-right">Litros</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Km</TableHead>
                <TableHead>Condutor</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.slice(0, 300).map((l, i) => (
                <TableRow key={i} className={l.situacao === "ok" || l.situacao === "sem_veiculo" ? undefined : "opacity-60"}>
                  <TableCell className="whitespace-nowrap">
                    {dataBR(l.data)}
                    {l.hora ? ` ${l.hora}` : ""}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {l.veiculoRotulo ?? <span className="text-warning-fg">{l.placa ?? "sem placa"} · não identificado</span>}
                  </TableCell>
                  <TableCell className="max-w-44">
                    <span className="line-clamp-1" title={[l.posto, l.cidade].filter(Boolean).join(" · ")}>
                      {l.posto ?? "—"}
                    </span>
                    <span className="text-muted-foreground line-clamp-1 text-xs">
                      {[l.combustivel, l.cidade].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.litros.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">{brl(l.valor)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.hodometro?.toLocaleString("pt-BR") ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-36">
                    <span className="line-clamp-1">
                      {l.condutorNome ?? <span className="text-muted-foreground">{l.condutor ? "—" : "não informado"}</span>}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-44 max-w-64 whitespace-normal">
                    <div className="flex flex-col items-start gap-1">
                      <Badge variant="outline" className={`whitespace-nowrap ${SITUACAO[l.situacao].classe}`}>
                        {SITUACAO[l.situacao].rotulo}
                      </Badge>
                      {l.alertas.map((a) => (
                        <span key={a} className="text-warning-fg text-xs leading-snug">
                          {a}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {linhas.length > 300 && (
            <p className="text-muted-foreground p-2 text-center text-xs">
              … e mais {(linhas.length - 300).toLocaleString("pt-BR")} linha(s)
            </p>
          )}
        </div>

        {erroGravar && (
          <Alert variant="destructive">
            <AlertDescription>{erroGravar}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={confirmar} disabled={gravando || ok.length === 0}>
            {gravando ? <Loader2 className="animate-spin" /> : <Save />}
            {gravando ? "Lançando…" : `Confirmar e lançar ${ok.length.toLocaleString("pt-BR")}`}
          </Button>
          <Button variant="ghost" onClick={() => window.location.reload()} disabled={gravando}>
            <RotateCcw />
            Cancelar / outro arquivo
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form action={lerAction} className="grid max-w-2xl gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="arquivo-abastecimento-ia">Relatório (PDF, Excel, CSV ou foto)</Label>
        <Input
          id="arquivo-abastecimento-ia"
          name="arquivo"
          type="file"
          required
          accept=".pdf,application/pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.csv,text/csv,image/jpeg,image/png,image/webp"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="veiculo_padrao">Veículo, se o relatório não trouxer a placa</Label>
        <select
          id="veiculo_padrao"
          name="veiculo_padrao"
          value={veiculoPadrao}
          onChange={(e) => setVeiculoPadrao(e.target.value)}
          className={SELECT}
        >
          <option value="">— o relatório traz a placa —</option>
          {veiculos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.rotulo}
            </option>
          ))}
        </select>
      </div>
      <p className="text-muted-foreground text-xs">
        A IA lê a fatura do cartão-combustível, o extrato do posto ou o cupom em qualquer
        layout — inclusive PDF escaneado e foto. O sistema casa a placa com a frota (aceita
        placa antiga e Mercosul), identifica o condutor pelo nome e separa o que já foi
        lançado. Você confere antes de gravar.
      </p>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={lendo}>
          {lendo ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {lendo ? "Lendo o relatório…" : "Ler relatório com IA"}
        </Button>
      </div>
    </form>
  )
}
