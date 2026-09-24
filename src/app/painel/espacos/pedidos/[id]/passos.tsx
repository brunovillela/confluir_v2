"use client"

import { useActionState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatarDataHora, formatarMoeda } from "@/lib/formato"

import {
  agendarVisitaAction,
  assumirAction,
  autorizarAction,
  cancelarAction,
  confirmarAction,
  custeioAction,
  dispensarVisitaAction,
  pagamentoAction,
  recusarAction,
  registrarVisitaAction,
} from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

function Aviso({ estado }: { estado: { erro?: string; ok?: string } }) {
  if (estado.erro) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{estado.erro}</AlertDescription>
      </Alert>
    )
  }
  if (estado.ok) {
    return (
      <Alert variant="success">
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  }
  return null
}

export function Assumir({ id }: { id: string }) {
  const [estado, acao, pendente] = useActionState(assumirAction, {})
  return (
    <form action={acao} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <Aviso estado={estado} />
      <p className="text-muted-foreground text-sm">
        Ninguém assumiu este pedido ainda. Assumir marca seu nome nele e leva
        para análise.
      </p>
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Assumir o pedido
        </Button>
      </div>
    </form>
  )
}

export function Visita({
  id,
  visita,
  responsaveis,
  podeGerir,
}: {
  id: string
  visita: {
    exigida: boolean
    facultativa: boolean
    dispensada: boolean
    agendadaEm: string | null
    responsavelNome: string | null
    responsavelId: string | null
    realizadaEm: string | null
    parecer: string | null
  }
  responsaveis: { id: string; nome: string; vinculo: string }[]
  podeGerir: boolean
}) {
  const [agenda, agendar, agendando] = useActionState(agendarVisitaAction, {})
  const [registro, registrar, registrando] = useActionState(registrarVisitaAction, {})

  if (visita.dispensada && !visita.agendadaEm) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visita técnica</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Dispensada para este espaço.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Visita técnica</CardTitle>
          <Badge variant="outline" className={visita.exigida ? "border-warning/40 text-warning-fg" : "text-muted-foreground"}>
            {visita.exigida ? "obrigatória" : "facultativa"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {visita.realizadaEm ? (
          <div className="grid gap-1 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="text-success size-4" />
              Realizada em {formatarDataHora(visita.realizadaEm)}
            </p>
            {visita.responsavelNome && (
              <p className="text-muted-foreground text-xs">
                Responsável: {visita.responsavelNome}
              </p>
            )}
            {visita.parecer && (
              <p className="mt-1 whitespace-pre-line">{visita.parecer}</p>
            )}
          </div>
        ) : visita.agendadaEm ? (
          <>
            <p className="text-sm">
              Agendada para <strong>{formatarDataHora(visita.agendadaEm)}</strong>
              {visita.responsavelNome ? ` · ${visita.responsavelNome}` : ""}
            </p>
            {podeGerir && (
              <form action={registrar} className="grid gap-2">
                <input type="hidden" name="id" value={id} />
                <Aviso estado={registro} />
                <div className="grid gap-1.5">
                  <Label htmlFor="parecer">Parecer da visita</Label>
                  <Textarea
                    id="parecer"
                    name="parecer"
                    rows={3}
                    placeholder="O que foi combinado, o que o solicitante precisa providenciar…"
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={registrando}>
                    {registrando && <Loader2 className="animate-spin" />}
                    Registrar visita realizada
                  </Button>
                </div>
              </form>
            )}
          </>
        ) : (
          podeGerir && (
            <form action={agendar} className="grid gap-3">
              <input type="hidden" name="id" value={id} />
              <Aviso estado={agenda} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="quando">Data e hora *</Label>
                  <Input id="quando" name="quando" type="datetime-local" required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="responsavel">Responsável</Label>
                  <select
                    id="responsavel"
                    name="responsavel"
                    className={SELECT}
                    defaultValue={visita.responsavelId ?? ""}
                  >
                    <option value="">A definir</option>
                    {responsaveis.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nome} — {r.vinculo}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="submit" size="sm" disabled={agendando}>
                  {agendando && <Loader2 className="animate-spin" />}
                  Agendar e avisar
                </Button>
              </div>
            </form>
          )
        )}
        {/* Fora do formulário acima: <form> dentro de <form> é inválido, e o
            navegador descarta o interno — o botão acabaria submetendo o outro. */}
        {podeGerir && visita.facultativa && !visita.agendadaEm && !visita.realizadaEm && (
          <div className="flex justify-end">
            <ButtonDispensar id={id} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ButtonDispensar({ id }: { id: string }) {
  return (
    <form action={dispensarVisitaAction}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" size="sm">
        Dispensar a visita
      </Button>
    </form>
  )
}

export function Autorizacao({
  id,
  autorizacao,
  podeAutorizar,
}: {
  id: string
  autorizacao: {
    situacao: "pendente" | "autorizada" | "negada"
    porNome: string | null
    em: string | null
    parecer: string | null
  }
  podeAutorizar: boolean
}) {
  const [estado, acao, pendente] = useActionState(autorizarAction, {})
  const decidida = autorizacao.situacao !== "pendente"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Autorização</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {decidida ? (
          <div className="grid gap-1 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Badge
                variant="outline"
                className={
                  autorizacao.situacao === "autorizada"
                    ? "border-success/40 text-success-fg"
                    : "border-destructive/40 text-destructive"
                }
              >
                {autorizacao.situacao === "autorizada" ? "Autorizada" : "Negada"}
              </Badge>
              {autorizacao.porNome && (
                <span className="text-muted-foreground text-xs">
                  por {autorizacao.porNome} · {formatarDataHora(autorizacao.em)}
                </span>
              )}
            </p>
            {autorizacao.parecer && (
              <p className="whitespace-pre-line">{autorizacao.parecer}</p>
            )}
          </div>
        ) : !podeAutorizar ? (
          <p className="text-muted-foreground text-sm">
            Aguardando a avaliação de quem tem a permissão de autorizar.
          </p>
        ) : (
          <form action={acao} className="grid gap-2">
            <input type="hidden" name="id" value={id} />
            <Aviso estado={estado} />
            <div className="grid gap-1.5">
              <Label htmlFor="parecer_aut">Parecer</Label>
              <Textarea
                id="parecer_aut"
                name="parecer"
                rows={3}
                placeholder="Obrigatório ao negar — o texto vai para o solicitante."
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="submit"
                name="decisao"
                value="negada"
                variant="outline"
                size="sm"
                disabled={pendente}
              >
                Negar
              </Button>
              <Button type="submit" name="decisao" value="autorizada" size="sm" disabled={pendente}>
                {pendente && <Loader2 className="animate-spin" />}
                Autorizar
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

export function Custeio({
  id,
  custeio,
  podeGerir,
}: {
  id: string
  custeio: {
    valor: number | null
    observacao: string | null
    pagoEm: string | null
    itens: { id: string; descricao: string | null; valor: number }[]
  }
  podeGerir: boolean
}) {
  const [estado, acao, pendente] = useActionState(custeioAction, {})
  const linhas =
    custeio.itens.length > 0
      ? custeio.itens
      : [{ id: "novo-1", descricao: "", valor: 0 }]

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Custeio</CardTitle>
          {custeio.pagoEm && (
            <Badge variant="outline" className="border-success/40 text-success-fg">
              pago em {formatarDataHora(custeio.pagoEm)}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!podeGerir ? (
          <p className="text-sm">
            {custeio.valor === null
              ? "Sem custeio lançado."
              : `Total ${formatarMoeda(custeio.valor)}`}
          </p>
        ) : (
          <form action={acao} className="grid gap-3">
            <input type="hidden" name="id" value={id} />
            <Aviso estado={estado} />
            <div className="grid gap-2">
              {linhas.map((i, n) => (
                <div key={i.id} className="flex flex-wrap items-end gap-2">
                  <div className="grid min-w-48 flex-1 gap-1.5">
                    <Label htmlFor={`d${n}`}>Item</Label>
                    <Input
                      id={`d${n}`}
                      name="item_descricao"
                      defaultValue={i.descricao ?? ""}
                      placeholder="Limpeza, som, segurança…"
                    />
                  </div>
                  <div className="grid w-36 gap-1.5">
                    <Label htmlFor={`v${n}`}>Valor (R$)</Label>
                    <Input
                      id={`v${n}`}
                      name="item_valor"
                      type="number"
                      step="0.01"
                      min={0}
                      defaultValue={i.valor || ""}
                    />
                  </div>
                </div>
              ))}
              {/* Uma linha em branco a mais, para acrescentar sem recarregar. */}
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid min-w-48 flex-1 gap-1.5">
                  <Label htmlFor="d-novo">Novo item</Label>
                  <Input id="d-novo" name="item_descricao" placeholder="—" />
                </div>
                <div className="grid w-36 gap-1.5">
                  <Label htmlFor="v-novo">Valor (R$)</Label>
                  <Input id="v-novo" name="item_valor" type="number" step="0.01" min={0} />
                </div>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="observacao">Observação</Label>
              <Input
                id="observacao"
                name="observacao"
                defaultValue={custeio.observacao ?? ""}
                placeholder="Prazo, forma de pagamento…"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {custeio.valor === null
                  ? "Sem custeio"
                  : `Total ${formatarMoeda(custeio.valor)}`}
              </span>
              <Button type="submit" size="sm" disabled={pendente}>
                {pendente && <Loader2 className="animate-spin" />}
                Salvar custeio
              </Button>
            </div>
          </form>
        )}
        {/* Fora do formulário do custeio — form aninhado é descartado pelo
            navegador, e o clique iria parar no formulário de cima. */}
        {podeGerir &&
          custeio.valor !== null &&
          custeio.valor > 0 &&
          !custeio.pagoEm && (
            <div className="flex justify-end">
              <MarcarPago id={id} />
            </div>
          )}
      </CardContent>
    </Card>
  )
}

function MarcarPago({ id }: { id: string }) {
  return (
    <form action={pagamentoAction}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" size="sm">
        Marcar como pago
      </Button>
    </form>
  )
}

export function Fechamento({
  id,
  pendencias,
  encerrado,
  podeGerir,
}: {
  id: string
  pendencias: string[]
  encerrado: boolean
  podeGerir: boolean
}) {
  const [conf, confirmar, confirmando] = useActionState(confirmarAction, {})
  const [rec, recusar, recusando] = useActionState(recusarAction, {})
  const [can, cancelar, cancelando] = useActionState(cancelarAction, {})
  if (!podeGerir || encerrado) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Fechamento</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Aviso estado={conf} />
        <Aviso estado={rec} />
        <Aviso estado={can} />
        {pendencias.length > 0 ? (
          <Alert variant="warning">
            <AlertDescription>
              Para confirmar a cessão, falta: {pendencias.join("; ")}.
            </AlertDescription>
          </Alert>
        ) : (
          <form action={confirmar}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" disabled={confirmando}>
              {confirmando && <Loader2 className="animate-spin" />}
              Confirmar a cessão
            </Button>
          </form>
        )}

        <div className="grid gap-2 border-t pt-3 sm:grid-cols-2">
          <form action={recusar} className="grid gap-1.5">
            <input type="hidden" name="id" value={id} />
            <Label htmlFor="motivo_rec">Recusar — motivo</Label>
            <Input id="motivo_rec" name="motivo" placeholder="Vai para o solicitante" />
            <Button type="submit" variant="outline" size="sm" disabled={recusando}>
              Recusar pedido
            </Button>
          </form>
          <form action={cancelar} className="grid gap-1.5">
            <input type="hidden" name="id" value={id} />
            <Label htmlFor="motivo_can">Cancelar — motivo</Label>
            <Input id="motivo_can" name="motivo" placeholder="Opcional" />
            <Button type="submit" variant="ghost" size="sm" disabled={cancelando}>
              Cancelar pedido
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  )
}
