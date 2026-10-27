"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Check, Loader2, Trash2, Undo2 } from "lucide-react"

import { CamposPeriodo } from "@/components/campos-periodo"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  alternarAutorizacaoGozo,
  atualizarGozoAction,
  criarGozoAction,
  enviarAvisoFeriasAction,
  excluirGozoAction,
} from "../actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

export type GozoFormDados = {
  id: string
  inicio: string | null
  dias: number | null
  autorizador_observacoes: string | null
  temAviso: boolean
}

export function GozoForm({
  periodoId,
  saldo,
  jaTemGozos,
  gozo,
}: {
  periodoId: string
  saldo: number
  jaTemGozos: boolean
  gozo?: GozoFormDados
}) {
  const [estado, formAction, pendente] = useActionState(
    gozo ? atualizarGozoAction : criarGozoAction,
    {}
  )
  const envio1 = useEnvioFormulario(formAction, estado)

  // jaTemGozos = a gravação resultará em férias divididas (2+ partes).
  const divisao = jaTemGozos

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {gozo ? "Editar gozo" : "Adicionar gozo"}
        </CardTitle>
        <CardDescription>
          Saldo de descanso: {saldo} dia{saldo === 1 ? "" : "s"}. Regras CLT:
          até 3 gozos, um deles ≥ 14 dias e os demais ≥ 5; o início não pode
          cair na sexta, no sábado nem nos 2 dias antes de feriado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} {...envio1} className="grid gap-4">
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <input type="hidden" name="periodo_id" value={periodoId} />
          {gozo && <input type="hidden" name="id" value={gozo.id} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <CamposPeriodo
              rotuloDias="Dias corridos *"
              placeholderDias="Ex.: 14"
              inicioPadrao={gozo?.inicio}
              diasPadrao={gozo?.dias}
            />
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="aviso">
                Aviso de férias (PDF{gozo?.temAviso ? " — substitui o atual" : ", opcional"})
              </Label>
              <Input id="aviso" name="aviso" type="file" accept="application/pdf" />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="autorizador_observacoes">Observações</Label>
              <Input
                id="autorizador_observacoes"
                name="autorizador_observacoes"
                placeholder="Ex.: primeira parcela das férias"
                defaultValue={gozo?.autorizador_observacoes ?? ""}
              />
            </div>
            {divisao && (
              <div className="grid content-end pb-1 sm:col-span-2">
                <label className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Checkbox name="divisao_acordada" />
                  O funcionário concordou com a divisão das férias
                  (formalizada por escrito) *
                </label>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            {gozo && (
              <Button variant="ghost" asChild>
                <Link href={`/painel/pessoal/ferias/${periodoId}`}>
                  Cancelar
                </Link>
              </Button>
            )}
            <Button type="submit" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              {gozo ? "Salvar gozo" : "Adicionar gozo"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function AutorizarGozoBotao({
  periodoId,
  gozoId,
  autorizado,
  temAbono = false,
}: {
  periodoId: string
  gozoId: string
  autorizado: boolean
  /** O gozo tem abono pecuniário solicitado — autorizar confirma a venda de 1/3. */
  temAbono?: boolean
}) {
  const [estado, formAction, pendente] = useActionState(
    alternarAutorizacaoGozo,
    {}
  )

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const pergunta = autorizado
          ? "Desfazer a autorização deste gozo?"
          : temAbono
            ? "Autorizar este gozo E confirmar a venda de 1/3 (abono pecuniário)? O funcionário será avisado por notificação e email."
            : "Autorizar este gozo de férias? O funcionário será avisado por notificação e email."
        confirmarEnvio(e, pergunta)}}
      className="inline-flex items-center"
    >
      <input type="hidden" name="periodo_id" value={periodoId} />
      <input type="hidden" name="id" value={gozoId} />
      <input type="hidden" name="autorizar" value={autorizado ? "false" : "true"} />
      {estado.erro && (
        <span className="text-destructive mr-1 text-xs">{estado.erro}</span>
      )}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        className="h-7 px-2"
      >
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : autorizado ? (
          <>
            <Undo2 />
            Desfazer
          </>
        ) : (
          <>
            <Check />
            Autorizar
          </>
        )}
      </Button>
    </form>
  )
}

export function ExcluirGozoBotao({
  periodoId,
  gozoId,
}: {
  periodoId: string
  gozoId: string
}) {
  const [estado, formAction, pendente] = useActionState(excluirGozoAction, {})

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        confirmarEnvio(e, "Excluir este gozo de férias?")}}
      className="inline-flex items-center"
    >
      <input type="hidden" name="periodo_id" value={periodoId} />
      <input type="hidden" name="id" value={gozoId} />
      {estado.erro && (
        <span className="text-destructive mr-1 text-xs">{estado.erro}</span>
      )}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        className="text-destructive hover:text-destructive h-7 px-2"
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
    </form>
  )
}

/**
 * Situação do aviso de férias do gozo (assinatura do funcionário) e o botão
 * de enviar/reenviar. Só para gozo autorizado — autorizar já envia sozinho.
 */
export function AvisoFeriasSituacao({
  periodoId,
  gozoId,
  autorizado,
  situacao,
  quando,
  motivoRecusa,
}: {
  periodoId: string
  gozoId: string
  autorizado: boolean
  situacao: "pendente" | "assinado" | "recusado" | "cancelado" | null
  quando: string | null
  motivoRecusa: string | null
}) {
  const [estado, acao, pendente] = useActionState(enviarAvisoFeriasAction, {})
  const envio2 = useEnvioFormulario(acao, estado)
  if (!autorizado) return null
  const rotulo =
    situacao === "assinado"
      ? { texto: `Assinado${quando ? ` em ${quando}` : ""}`, classe: "text-success-fg" }
      : situacao === "pendente"
        ? { texto: "Aguardando assinatura", classe: "text-warning-fg" }
        : situacao === "recusado"
          ? { texto: `Não assinado${motivoRecusa ? `: ${motivoRecusa}` : ""}`, classe: "text-destructive" }
          : { texto: "Aviso não enviado", classe: "text-muted-foreground" }
  const botao = situacao === "pendente" ? "Reenviar link" : situacao === "assinado" ? null : "Enviar aviso"
  return (
    <div className="mt-1 grid gap-0.5">
      <span className={`text-xs ${rotulo.classe}`}>{rotulo.texto}</span>
      {botao && (
        <form action={acao} {...envio2}>
          <input type="hidden" name="gozo_id" value={gozoId} />
          <input type="hidden" name="periodo_id" value={periodoId} />
          {situacao === "pendente" && <input type="hidden" name="reenviar" value="1" />}
          <Button type="submit" variant="link" size="sm" className="h-auto p-0 text-xs" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            {botao}
          </Button>
        </form>
      )}
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      {estado.ok && <span className="text-success-fg text-xs">{estado.ok}</span>}
    </div>
  )
}
