"use client"

import { useActionState, useState } from "react"
import { Bot, Loader2, RefreshCw, Save, ScanText } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { type EstadoForm } from "@/lib/contas"
import type { FaixasHE } from "@/lib/faixas-he"
import { formatarMoeda } from "@/lib/formato"
import { hhmm } from "@/lib/horas"
import type { LinhaHE, SituacaoLeitura } from "@/lib/ponto-horas-pagas"

import { aplicarHorasPagasAction, interpretarAmbiguasAction, lerDeNovoAction, lerEscaneadosAction } from "./actions"

function Retorno({ estado }: { estado: EstadoForm }) {
  if (estado.erro)
    return (
      <Alert variant="destructive">
        <AlertDescription>{estado.erro}</AlertDescription>
      </Alert>
    )
  if (estado.ok) return <p className="text-success-fg text-sm">{estado.ok}</p>
  return null
}

const SITUACAO: Record<SituacaoLeitura, { rotulo: string; variante: "outline" | "warning" | "destructive" }> = {
  lido: { rotulo: "lido", variante: "outline" },
  ambigua: { rotulo: "linha a conferir", variante: "warning" },
  sem_contracheque: { rotulo: "sem contracheque na remessa", variante: "warning" },
  sem_arquivo: { rotulo: "contracheque sem PDF", variante: "warning" },
  sem_texto: { rotulo: "escaneado (sem texto)", variante: "warning" },
  erro: { rotulo: "erro na leitura", variante: "destructive" },
}

export type LinhaTela = {
  registroId: string
  nome: string
  situacao: SituacaoLeitura
  erro?: string
  linhas: LinhaHE[]
  atual: { horas1: number | null; horas2: number | null; valor1: number | null; valor2: number | null; doContracheque: string | null }
  novo: { horas1: number | null; horas2: number | null; valor1: number | null; valor2: number | null }
  diferente: boolean
  podeAplicar: boolean
}

const h = (v: number | null) => (v === null ? "—" : hhmm(v))
const r$ = (v: number | null) => (v === null ? "—" : formatarMoeda(v))

export function AplicarHorasPagasForm({
  remessaId,
  cc,
  linhas,
  faixas,
  bloqueada,
}: {
  remessaId: string
  cc: string
  linhas: LinhaTela[]
  faixas: FaixasHE
  bloqueada: boolean
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(aplicarHorasPagasAction, {})
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(linhas.filter((l) => l.podeAplicar && l.diferente).map((l) => l.registroId)))
  const aplicaveis = linhas.filter((l) => l.podeAplicar)
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) =>
      confirmarEnvio(
        e,
        `Gravar as horas extras pagas de ${marcados.size} registro(s)? As horas pagas digitadas antes são substituídas pelas do contracheque, e o saldo remanescente é refeito.`
      ),
  })
  const alterna = (id: string) =>
    setMarcados((m) => {
      const n = new Set(m)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <form action={formAction} {...envio} className="grid gap-3">
      <Retorno estado={estado} />
      <input type="hidden" name="remessa_id" value={remessaId} />
      <input type="hidden" name="cc" value={cc} />
      {[...marcados].map((id) => (
        <input key={id} type="hidden" name="registro" value={id} />
      ))}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  aria-label="Marcar todos"
                  disabled={bloqueada || !aplicaveis.length}
                  checked={aplicaveis.length > 0 && aplicaveis.every((l) => marcados.has(l.registroId))}
                  onChange={(e) => setMarcados(new Set(e.target.checked ? aplicaveis.map((l) => l.registroId) : []))}
                />
              </TableHead>
              <TableHead>Funcionário</TableHead>
              <TableHead>No contracheque</TableHead>
              <TableHead className="text-right">Pagas hoje</TableHead>
              <TableHead className="text-right">Pelo contracheque</TableHead>
              <TableHead className="text-right">Valor pago</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => {
              const s = SITUACAO[l.situacao]
              return (
                <TableRow key={l.registroId} className={l.podeAplicar && l.diferente ? "" : "text-muted-foreground"}>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Gravar ${l.nome}`}
                      disabled={bloqueada || !l.podeAplicar}
                      checked={marcados.has(l.registroId)}
                      onChange={() => alterna(l.registroId)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {l.nome}
                    {l.podeAplicar && !l.diferente && <div className="text-xs font-normal">já está igual</div>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {l.situacao !== "lido" && (
                      <Badge variant={s.variante} className="mb-1">
                        {s.rotulo}
                      </Badge>
                    )}
                    {l.erro && <div className="text-xs">{l.erro}</div>}
                    {l.situacao === "lido" && l.linhas.length === 0 && <span className="text-xs">nenhuma hora extra</span>}
                    <ul className="grid gap-0.5 text-xs">
                      {l.linhas.map((x, i) => (
                        <li key={i} className={x.ambigua ? "text-warning-fg" : ""}>
                          <span className="font-mono">{x.texto}</span>
                          {x.ambigua ? (
                            " — não deu para ler horas e valor"
                          ) : (
                            <>
                              {" → "}
                              {x.tipo === "horas" ? `${h(x.horas)} · ` : ""}
                              {r$(x.valor)} na faixa {x.faixa === 1 ? faixas["70"] : faixas["100"]}
                              {x.origem === "ia" && " (IA, só a linha)"}
                              {x.origem === "imagem" && " (IA, por imagem)"}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                  <TableCell className="text-right text-sm whitespace-nowrap">
                    {faixas["70"]}: {h(l.atual.horas1)}
                    <br />
                    {faixas["100"]}: {h(l.atual.horas2)}
                  </TableCell>
                  <TableCell className="text-right text-sm whitespace-nowrap">
                    {l.podeAplicar ? (
                      <>
                        <span className={l.novo.horas1 !== l.atual.horas1 ? "font-semibold" : ""}>
                          {faixas["70"]}: {h(l.novo.horas1)}
                        </span>
                        <br />
                        <span className={l.novo.horas2 !== l.atual.horas2 ? "font-semibold" : ""}>
                          {faixas["100"]}: {h(l.novo.horas2)}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm whitespace-nowrap">
                    {l.podeAplicar ? (
                      <>
                        {r$(l.novo.valor1)}
                        <br />
                        {r$(l.novo.valor2)}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {!bloqueada && (
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="recalcular" defaultChecked />
            Recalcular os saldos nas remessas seguintes de cada pessoa
          </label>
          <Button type="submit" disabled={pendente || marcados.size === 0}>
            {pendente ? <Loader2 className="animate-spin" /> : <Save />}
            Gravar horas pagas ({marcados.size})
          </Button>
        </div>
      )}
    </form>
  )
}

function BotaoAcao({
  acao,
  remessaId,
  cc,
  rotulo,
  icone,
  confirmar,
  variante = "outline",
}: {
  acao: (p: EstadoForm, f: FormData) => Promise<EstadoForm>
  remessaId: string
  cc: string
  rotulo: string
  icone: "ia" | "imagem" | "reler"
  confirmar: string
  variante?: "outline" | "ghost"
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(acao, {})
  const envio = useEnvioFormulario(formAction, estado, { antes: (e) => confirmarEnvio(e, confirmar) })
  const Icone = icone === "ia" ? Bot : icone === "imagem" ? ScanText : RefreshCw
  return (
    <form action={formAction} {...envio} className="grid gap-1">
      <input type="hidden" name="remessa_id" value={remessaId} />
      <input type="hidden" name="cc" value={cc} />
      <div>
        <Button type="submit" variant={variante} disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Icone />}
          {rotulo}
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

export function InterpretarAmbiguasBotao({ remessaId, cc, quantas }: { remessaId: string; cc: string; quantas: number }) {
  return (
    <BotaoAcao
      acao={interpretarAmbiguasAction}
      remessaId={remessaId}
      cc={cc}
      icone="ia"
      rotulo={`Interpretar ${quantas} linha(s) com a IA`}
      confirmar={`Mandar à IA só ${quantas} linha(s) de hora extra (código, descrição, horas e valor), sem nome nem CPF?`}
    />
  )
}

export function LerEscaneadosBotao({ remessaId, cc, quantos }: { remessaId: string; cc: string; quantos: number }) {
  return (
    <BotaoAcao
      acao={lerEscaneadosAction}
      remessaId={remessaId}
      cc={cc}
      icone="imagem"
      rotulo={`Ler ${quantos} escaneado(s) por imagem`}
      confirmar={`Mandar à IA o contracheque INTEIRO de ${quantos} pessoa(s) — nome, CPF, salário e todos os descontos — para achar as horas extras?`}
    />
  )
}

export function LerDeNovoBotao({ remessaId, cc }: { remessaId: string; cc: string }) {
  return (
    <BotaoAcao
      acao={lerDeNovoAction}
      remessaId={remessaId}
      cc={cc}
      icone="reler"
      variante="ghost"
      rotulo="Ler de novo"
      confirmar="Descartar o que foi lido destes contracheques (inclusive o que a IA interpretou) e ler de novo pelo texto?"
    />
  )
}
