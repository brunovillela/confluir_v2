"use client"

import { startTransition, useActionState, useState } from "react"
import { Loader2, RotateCcw, Save } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { type EstadoForm } from "@/lib/contas"
import {
  definicaoDaParte,
  estadosPermitidos,
  mensagemDaSituacao,
  ROTULO_ESTADO_PARTE,
  type ChaveParte,
  type DefinicaoParte,
  type EstadoParte,
  type OpcaoParte,
} from "@/lib/portal-partes-constantes"
import { cn } from "@/lib/utils"

import { salvarParteAction } from "./actions"

export type ValorOpcao = boolean | string | number | string[]

/** O que está gravado para a parte, já pronto para o formulário. */
export type InicialParte = {
  /** O que vale hoje (com a volta automática já alcançada, "habilitada"). */
  estado: EstadoParte
  mensagem: string | null
  /** Só quando ainda está por vir (data passada não volta ao campo). */
  retornoPrevisto: string | null
  opcoes: Record<string, ValorOpcao>
}

/** Cor da escolha marcada: a mesma do selo de cada estado. */
const COR_ESCOLHA: Record<EstadoParte, string> = {
  habilitada: "has-[:checked]:border-success/50 has-[:checked]:bg-success/10",
  suspensa: "has-[:checked]:border-warning/50 has-[:checked]:bg-warning/10",
  desabilitada: "has-[:checked]:border-destructive/50 has-[:checked]:bg-destructive/5",
}

function efeitoDoEstado(def: DefinicaoParte, estado: EstadoParte): string {
  if (estado === "suspensa") return def.efeitoSuspensa ?? ""
  if (estado === "desabilitada") return def.efeitoDesabilitada ?? ""
  return def.chave === "portal"
    ? "O portal funciona normalmente, com cada parte no estado escolhido abaixo."
    : "Funciona normalmente para o associado."
}

function Recado({ erro, ok }: { erro?: string; ok?: string }) {
  if (!erro && !ok) return null
  return (
    <Alert variant={erro ? "destructive" : "success"}>
      <AlertDescription className="text-sm">{erro ?? ok}</AlertDescription>
    </Alert>
  )
}

/**
 * Uma parte do portal: o estado (só os que a parte admite), o aviso ao
 * associado e a volta automática quando não está habilitada, e as opções do
 * catálogo. Aviso e volta ficam só ESCONDIDOS quando a parte está habilitada
 * — continuam no formulário, então trocar de estado não perde o que foi
 * escrito (molde da Condicao em direitos/condicoes-hospedagem.tsx).
 */
export function FormularioParte({
  chave,
  inicial,
  amanha,
  ultimaAlteracao,
  disponivel,
  lida = true,
}: {
  chave: ChaveParte
  inicial: InicialParte
  /** AAAA-MM-DD de amanhã em São Paulo (vem do servidor: relógio no render é impuro). */
  amanha: string
  /** "Última alteração: … por …", ou null quando nunca foi gravada. */
  ultimaAlteracao: string | null
  /** false: falta rodar o SQL — dá para ver, não para salvar. */
  disponivel: boolean
  /**
   * false: a leitura da configuração falhou e o formulário mostra o padrão —
   * salvar gravaria por cima do que está guardado, então não salva.
   */
  lida?: boolean
}) {
  const def: DefinicaoParte = definicaoDaParte(chave)
  const permitidos = estadosPermitidos(def)
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(salvarParteAction, {})
  const [escolhido, setEscolhido] = useState<EstadoParte>(inicial.estado)
  const [valores, setValores] = useState<Record<string, ValorOpcao>>(inicial.opcoes)

  const id = (campo: string) => `parte-${chave}-${campo}`
  const invalido = (campo: string) => estado.erro !== undefined && estado.campo === campo
  const mudar = (opcao: string, valor: ValorOpcao) => setValores((v) => ({ ...v, [opcao]: valor }))
  const padraoDoAviso = mensagemDaSituacao(chave, { estado: escolhido, mensagem: null, retornoPrevisto: null })

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        // Pergunta só na passagem para o estado que tira a parte (ou o portal) do ar.
        if (escolhido !== inicial.estado) {
          if (escolhido === "desabilitada") {
            confirmarEnvio(e, {
              titulo: chave === "portal" ? "Tirar o portal do ar?" : `Desabilitar ${def.titulo}?`,
              descricao: def.efeitoDesabilitada ?? "",
              confirmar: chave === "portal" ? "Tirar do ar" : "Desabilitar",
              destrutivo: true,
            })
          } else if (escolhido === "suspensa" && chave === "portal") {
            confirmarEnvio(e, {
              titulo: "Pôr o portal em modo de consulta?",
              descricao: def.efeitoSuspensa ?? "",
              confirmar: "Pôr em consulta",
            })
          }
        }
        if (e.defaultPrevented) return
        // Envio pela transição, não por `action={…}`: o React 19 reinicia o
        // formulário depois de uma action de <form>, e os rádios e caixas
        // (controlados pelo estado) voltariam ao valor da primeira renderização
        // — salvar de novo sem perceber desfaria a mudança (visto no demo).
        e.preventDefault()
        const dados = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter)
        startTransition(() => formAction(dados))
      }}
    >
      <input type="hidden" name="parte" value={chave} />

      {permitidos.length > 1 ? (
        <fieldset className="grid gap-2" aria-invalid={invalido("estado") || undefined}>
          <legend className="mb-2 text-sm font-medium">Como a parte fica</legend>
          <div className="grid gap-2 lg:grid-cols-3">
            {permitidos.map((e) => (
              <label
                key={e}
                className={cn(
                  "hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  COR_ESCOLHA[e],
                  invalido("estado") && "border-destructive"
                )}
              >
                <input
                  type="radio"
                  name="estado"
                  value={e}
                  className="mt-0.5 size-4 shrink-0"
                  checked={escolhido === e}
                  onChange={() => setEscolhido(e)}
                />
                <span className="text-sm">
                  <span className="font-medium">{ROTULO_ESTADO_PARTE[e]}</span>
                  <span className="text-muted-foreground mt-0.5 block text-xs">{efeitoDoEstado(def, e)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="estado" value="habilitada" />
      )}

      {permitidos.length > 1 && (
        <div hidden={escolhido === "habilitada"} className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <div className="grid content-start gap-1.5">
            <Label htmlFor={id("mensagem")}>Mensagem ao associado (opcional)</Label>
            <Textarea
              id={id("mensagem")}
              name="mensagem"
              rows={2}
              maxLength={600}
              defaultValue={inicial.mensagem ?? ""}
              placeholder={padraoDoAviso}
            />
            <p className="text-muted-foreground text-xs">
              Em branco, o associado lê o texto de exemplo do campo. A data da volta, quando houver, entra no
              fim sozinha.
            </p>
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor={id("retorno")}>Volta automaticamente em</Label>
            <Input
              id={id("retorno")}
              name="retorno_previsto"
              type="date"
              min={amanha}
              defaultValue={inicial.retornoPrevisto ?? ""}
              aria-invalid={invalido("retorno_previsto") || undefined}
            />
            <p className="text-muted-foreground text-xs">Opcional. Sem data, fica assim até alguém mudar.</p>
          </div>
        </div>
      )}

      {def.opcoes.length > 0 && (
        <div className="grid gap-4 border-t pt-4">
          <p className="text-sm font-medium">Opções</p>
          {def.opcoes.map((o) => (
            <CampoOpcao
              key={o.chave}
              opcao={o}
              idCampo={id(o.chave)}
              valor={valores[o.chave] ?? o.padrao}
              invalido={invalido(`opcao.${o.chave}`)}
              aoMudar={(v) => mudar(o.chave, v)}
            />
          ))}
        </div>
      )}

      <Recado erro={estado.erro} ok={estado.ok} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-muted-foreground text-xs">
          {!disponivel
            ? "Salvar fica disponível depois que o banco receber a tabela da Área do associado."
            : !lida
              ? "Não foi possível ler o que está gravado: recarregue a página para salvar."
              : (ultimaAlteracao ??
                (chave === "primeiro_acesso"
                  ? "Nunca alterada: vale o padrão, com o primeiro acesso já exigido."
                  : "Nunca alterada: vale o padrão, como sempre foi."))}
        </p>
        <Button type="submit" size="sm" disabled={pendente || !disponivel || !lida}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar<span className="sr-only"> {def.titulo}</span>
        </Button>
      </div>
    </form>
  )
}

/** Um campo de opção, montado pelo tipo do catálogo (`opcao.<chave>`). */
function CampoOpcao({
  opcao: o,
  idCampo,
  valor,
  invalido,
  aoMudar,
}: {
  opcao: OpcaoParte
  idCampo: string
  valor: ValorOpcao | readonly string[]
  invalido: boolean
  aoMudar: (v: ValorOpcao) => void
}) {
  const nome = `opcao.${o.chave}`
  const ajuda = o.ajuda ? <p className="text-muted-foreground text-xs">{o.ajuda}</p> : null

  switch (o.tipo) {
    case "booleano":
      return (
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name={nome}
            className="mt-0.5 size-4 shrink-0"
            checked={valor === true}
            onChange={(e) => aoMudar(e.target.checked)}
          />
          <span className="text-sm">
            <span className="font-medium">{o.rotulo}</span>
            {o.ajuda && <span className="text-muted-foreground block text-xs">{o.ajuda}</span>}
          </span>
        </label>
      )

    case "texto": {
      const texto = typeof valor === "string" ? valor : ""
      const restaurar = o.padrao !== "" && texto !== o.padrao
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={idCampo}>{o.rotulo}</Label>
          {o.linhas ? (
            <Textarea
              id={idCampo}
              name={nome}
              rows={o.linhas}
              maxLength={o.max}
              value={texto}
              placeholder={o.placeholder}
              onChange={(e) => aoMudar(e.target.value)}
              aria-invalid={invalido || undefined}
            />
          ) : (
            <Input
              id={idCampo}
              name={nome}
              maxLength={o.max}
              value={texto}
              placeholder={o.placeholder}
              onChange={(e) => aoMudar(e.target.value)}
              aria-invalid={invalido || undefined}
            />
          )}
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0 flex-1">{ajuda}</div>
            <div className="flex shrink-0 items-center gap-3">
              {restaurar && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => aoMudar(o.padrao)}
                >
                  <RotateCcw />
                  Texto padrão
                </Button>
              )}
              {o.linhas && (
                <span className="text-muted-foreground text-xs tabular-nums">
                  {texto.length}/{o.max}
                </span>
              )}
            </div>
          </div>
        </div>
      )
    }

    case "numero":
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={idCampo}>{o.rotulo}</Label>
          <div className="flex items-center gap-2">
            <Input
              id={idCampo}
              name={nome}
              type="number"
              inputMode="numeric"
              min={o.min}
              max={o.max}
              step={1}
              className="w-24"
              value={typeof valor === "number" || typeof valor === "string" ? String(valor) : ""}
              onChange={(e) => aoMudar(e.target.value)}
              aria-invalid={invalido || undefined}
            />
            {o.unidade && <span className="text-muted-foreground text-sm">{o.unidade}</span>}
          </div>
          {ajuda}
        </div>
      )

    case "lista": {
      const marcados = new Set(Array.isArray(valor) ? valor : [])
      const cheio = o.max !== undefined && marcados.size >= o.max
      const limite =
        o.min !== undefined && o.max !== undefined
          ? `De ${o.min} a ${o.max}.`
          : o.min !== undefined
            ? `Pelo menos ${o.min}.`
            : o.max !== undefined
              ? `No máximo ${o.max}.`
              : null
      return (
        <fieldset
          className={cn("grid gap-2 rounded-lg border p-3", invalido && "border-destructive")}
          aria-invalid={invalido || undefined}
        >
          <legend className="px-1 text-sm font-medium">{o.rotulo}</legend>
          <div className={cn("grid gap-1.5 sm:grid-cols-2", o.itens.length > 6 && "lg:grid-cols-3")}>
            {o.itens.map((item) => {
              const marcado = marcados.has(item.valor)
              return (
                <label
                  key={item.valor}
                  className={cn(
                    "flex items-center gap-2 rounded px-1.5 py-1 text-sm",
                    !marcado && cheio ? "text-muted-foreground" : "hover:bg-muted/60"
                  )}
                >
                  <input
                    type="checkbox"
                    name={nome}
                    value={item.valor}
                    className="size-4 shrink-0"
                    checked={marcado}
                    disabled={!marcado && cheio}
                    onChange={(e) => {
                      const proximo = new Set(marcados)
                      if (e.target.checked) proximo.add(item.valor)
                      else proximo.delete(item.valor)
                      // Na ordem do catálogo, a mesma em que o portal mostra.
                      aoMudar(o.itens.map((i) => i.valor).filter((v) => proximo.has(v)))
                    }}
                  />
                  {item.rotulo}
                </label>
              )
            })}
          </div>
          <p className="text-muted-foreground text-xs">
            {o.ajuda ?? limite}{" "}
            <span className="tabular-nums">
              ({marcados.size} {marcados.size === 1 ? "marcado" : "marcados"})
            </span>
          </p>
        </fieldset>
      )
    }
  }
}
