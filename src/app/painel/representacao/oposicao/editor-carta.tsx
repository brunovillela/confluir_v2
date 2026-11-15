"use client"

import { useActionState, useMemo, useRef, useState } from "react"
import { FileText, Loader2, RotateCw, Scale } from "lucide-react"

import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  conferirModeloCarta,
  MAX_CARTA_MODELO,
  montarCarta,
  REFERENCIAS_CARTA,
  valoresDeExemplo,
  type ValoresCarta,
} from "@/lib/oposicao-carta"

import { salvarCartaAction } from "./actions"

/**
 * O texto da carta de oposição com as referências (14/11/2026): o modelo, a
 * lista de referências (clicar insere no cursor), a conferência enquanto se
 * digita e a prévia com dados de exemplo. Serve ao padrão da entidade e ao
 * texto da campanha.
 */
export function EditorCarta({
  campanhaId = null,
  inicial,
  proprio,
  podeEditar,
  rotuloRestaurar,
  exemplo,
  pdfHref,
}: {
  campanhaId?: string | null
  /** O texto que vale agora neste nível (o próprio ou o herdado). */
  inicial: string
  /** Este nível tem texto próprio (dá para voltar ao de cima). */
  proprio: boolean
  podeEditar: boolean
  /** "Voltar ao texto padrão do sistema" / "Voltar a usar o texto da entidade". */
  rotuloRestaurar: string
  /** Valores reais para a prévia (entidade, campanha, desconto, declaração). */
  exemplo: ValoresCarta
  /** O PDF de exemplo da versão salva. */
  pdfHref: string
}) {
  const [estado, acao, pendente] = useActionState(salvarCartaAction, {})
  const envio = useEnvioFormulario(acao, estado)
  const [modelo, setModelo] = useState(inicial)
  const [semMatricula, setSemMatricula] = useState(false)
  const [semEmpresa, setSemEmpresa] = useState(false)
  const campo = useRef<HTMLTextAreaElement>(null)

  const erros = useMemo(() => conferirModeloCarta(modelo), [modelo])
  const previa = useMemo(() => {
    const v = { ...valoresDeExemplo({ matricula: semMatricula, empresa: semEmpresa }) }
    for (const [k, val] of Object.entries(exemplo)) if (val) v[k] = val
    if (exemplo.DETALHE_DESCONTO) v.DESCONTO = `de ${exemplo.DETALHE_DESCONTO}`
    return montarCarta(modelo, v)
  }, [modelo, semMatricula, semEmpresa, exemplo])
  const alterado = modelo.trim() !== inicial.trim()

  function inserir(chave: string) {
    const el = campo.current
    const ref = `[${chave}]`
    if (!el) {
      setModelo((m) => m + ref)
      return
    }
    const ini = el.selectionStart ?? modelo.length
    const fim = el.selectionEnd ?? modelo.length
    const novo = modelo.slice(0, ini) + ref + modelo.slice(fim)
    setModelo(novo)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(ini + ref.length, ini + ref.length)
    })
  }

  return (
    <div className="grid gap-6">
      <Alert variant="warning">
        <Scale />
        <AlertDescription>
          A carta é o documento que o trabalhador assina. Mude o texto só com a recomendação do jurídico da entidade.
          Cada alteração fica registrada com o autor e a data; quem já se opôs mantém a carta que registrou.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-2">
        <form action={acao} {...envio} className="grid content-start gap-3">
          {campanhaId && <input type="hidden" name="campanha_id" value={campanhaId} />}
          <Label htmlFor="carta_modelo">Texto da carta (modelo)</Label>
          <Textarea
            ref={campo}
            id="carta_modelo"
            name="carta_modelo"
            rows={16}
            maxLength={MAX_CARTA_MODELO}
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            readOnly={!podeEditar}
            className="font-mono text-xs leading-relaxed"
          />
          <ul className="text-muted-foreground grid gap-1 text-xs">
            <li>Linha em branco separa os parágrafos.</li>
            <li>
              <code>[NOME_COMPLETO]</code> e as outras referências viram os dados de cada pessoa.
            </li>
            <li>
              <code>{"{, matrícula [MATRICULA]}"}</code>: trecho entre chaves é opcional e some quando o dado falta.
            </li>
            <li>
              <code>**OPOSIÇÃO**</code> sai em negrito. Um parágrafo só com <code>[DECLARACAO]</code> sai em destaque.
            </li>
            <li>O título, o protocolo, a data e a assinatura ficam fora do texto e sempre saem.</li>
          </ul>

          {erros.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <ul className="grid gap-1">
                  {erros.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          {estado.ok && (
            <Alert className="border-success/40 text-success-fg">
              <AlertDescription>{estado.ok}</AlertDescription>
            </Alert>
          )}

          {podeEditar && (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pendente || erros.length > 0 || !alterado}>
                {pendente && <Loader2 className="animate-spin" />}
                Salvar texto
              </Button>
              {alterado && (
                <Button type="button" variant="ghost" onClick={() => setModelo(inicial)} disabled={pendente}>
                  Desfazer as mudanças
                </Button>
              )}
              {proprio && !alterado && (
                <Button type="submit" variant="outline" name="restaurar" value="1" disabled={pendente}>
                  <RotateCw />
                  {rotuloRestaurar}
                </Button>
              )}
            </div>
          )}
        </form>

        <div className="grid content-start gap-3">
          <p className="text-sm font-medium">Referências</p>
          <div className="grid gap-1.5">
            {REFERENCIAS_CARTA.map((r) => (
              <div key={r.chave} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                {podeEditar ? (
                  <button
                    type="button"
                    onClick={() => inserir(r.chave)}
                    className="bg-muted hover:bg-accent rounded px-1.5 py-0.5 font-mono"
                    title="Inserir no cursor"
                  >
                    [{r.chave}]
                  </button>
                ) : (
                  <code className="bg-muted rounded px-1.5 py-0.5">[{r.chave}]</code>
                )}
                <span className="text-muted-foreground">{r.descricao}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium">Prévia com dados de exemplo{alterado ? " (ainda não salva)" : ""}</p>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox checked={semMatricula} onCheckedChange={(v) => setSemMatricula(v === true)} />
              Sem matrícula
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={semEmpresa} onCheckedChange={(v) => setSemEmpresa(v === true)} />
              Sem empresa
            </label>
            <Button variant="outline" size="sm" asChild>
              <a href={pdfHref} target="_blank" rel="noreferrer">
                <FileText />
                PDF de exemplo (texto salvo)
              </a>
            </Button>
          </div>
        </div>
        <div className="bg-background mx-auto grid w-full max-w-2xl gap-3 rounded-md border p-6 text-sm leading-relaxed shadow-sm">
          <p className="text-center font-semibold">CARTA DE OPOSIÇÃO À CONTRIBUIÇÃO ASSISTENCIAL</p>
          {previa.map((p, i) => (
            <p
              key={i}
              className={
                p.destaque ? "bg-muted rounded p-3 text-xs whitespace-pre-wrap" : "text-justify whitespace-pre-line"
              }
            >
              {p.trechos.map((t, j) => (t.negrito ? <strong key={j}>{t.texto}</strong> : <span key={j}>{t.texto}</span>))}
            </p>
          ))}
          <p className="text-muted-foreground text-xs">Protocolo: 1234</p>
          <p>14 de novembro de 2026.</p>
        </div>
      </div>
    </div>
  )
}
