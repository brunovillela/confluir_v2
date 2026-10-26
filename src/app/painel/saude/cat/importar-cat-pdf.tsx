"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { ExternalLink, Loader2, RefreshCw, RotateCcw, Sparkles } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { CatForm } from "./cat-forms"
import { ClassificacaoCatAviso } from "./classificacao-cat"
import { extrairCatDePdf } from "./importar-pdf-actions"
import { LoteCatPdf, MAXIMO_LOTE } from "./lote-cat-pdf"

export function ImportarCatPdf() {
  const [estado, formAction, pendente] = useActionState(extrairCatDePdf, {})
  const [atualizandoExistente, setAtualizandoExistente] = useState(false)
  // Guardados fora do form: a action reinicia o input, e o PDF ainda vai
  // junto com a CAT quando ela for salva.
  const [arquivos, setArquivos] = useState<File[]>([])
  const [registrar, setRegistrar] = useState(false)
  const [lote, setLote] = useState<{ arquivos: File[]; registrar: boolean } | null>(null)
  const [erroLote, setErroLote] = useState<string | null>(null)

  if (lote) return <LoteCatPdf arquivos={lote.arquivos} registrar={lote.registrar} />

  if (estado.valores) {
    const c = estado.classificacao
    const duplicada = c?.classe === "duplicada"
    return (
      <div className="grid gap-4">
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            <p className="font-medium">
              Campos preenchidos pela IA — revise antes de salvar.
            </p>
            <p className="mt-0.5 text-sm">
              A IA pode errar (CBO, datas, códigos). Confira cada campo e
              corrija o que precisar; a CAT só é criada quando você clicar em
              salvar.
            </p>
            {estado.avisos && estado.avisos.length > 0 && (
              <ul className="mt-2 grid gap-0.5 text-xs">
                {estado.avisos.map((a, i) => (
                  <li key={i}>• {a}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>

        {c && (
          <ClassificacaoCatAviso classificacao={c}>
            {duplicada && (
              <p className="text-xs">
                Esta CAT não precisa ser lançada de novo.
                {estado.existente
                  ? " Se o PDF trouxer dados novos ou corrigidos, atualize a CAT que já existe."
                  : ""}
              </p>
            )}
            {c.classe === "atualizacao" && (
              <p className="text-xs">
                Ao salvar, a CAT fica ligada à CAT de origem — as duas aparecem juntas na página de cada uma.
              </p>
            )}
          </ClassificacaoCatAviso>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/painel/saude/cat/nova/pdf">
              <RotateCcw />
              Enviar outro PDF
            </Link>
          </Button>
          {duplicada && estado.existente && (
            <>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/painel/saude/cat/${estado.existente.id}`} target="_blank">
                  <ExternalLink />
                  Abrir a CAT existente
                </Link>
              </Button>
              {!atualizandoExistente && (
                <Button size="sm" onClick={() => setAtualizandoExistente(true)}>
                  <RefreshCw />
                  Atualizar a existente com o PDF
                </Button>
              )}
            </>
          )}
        </div>

        {duplicada ? (
          estado.existente &&
          atualizandoExistente && (
            <div className="grid gap-3">
              <Alert variant="info">
                <AlertDescription>
                  {estado.existente.diferentes.length === 0 ? (
                    <p>O PDF só completa campos vazios da CAT existente — nada do que já estava muda.</p>
                  ) : (
                    <>
                      <p className="font-medium">
                        Campos em que o PDF é diferente da CAT existente (já trocados abaixo — confira):
                      </p>
                      <ul className="mt-1 grid gap-0.5 text-xs sm:grid-cols-2">
                        {estado.existente.diferentes.map((d) => (
                          <li key={d}>• {d}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </AlertDescription>
              </Alert>
              <CatForm id={estado.existente.id} valores={estado.existente.valores} />
            </div>
          )
        ) : (
          <CatForm
            valores={estado.valores}
            origemId={c?.classe === "atualizacao" ? c.origemId : null}
            pedirConfirmacao={c?.classe === "possivel_duplicada"}
            arquivo={arquivos[0]}
          />
        )}
      </div>
    )
  }

  return (
    <form
      action={(fd) => {
        if (arquivos.length > MAXIMO_LOTE) {
          setErroLote(`No máximo ${MAXIMO_LOTE} PDFs por vez.`)
          return
        }
        // Vários PDFs, ou o registro sem conferência: a lista do lote.
        if (arquivos.length > 1 || registrar) {
          setLote({ arquivos, registrar })
          return
        }
        formAction(fd)
      }}
      className="grid gap-3"
    >
      <Input
        type="file"
        name="arquivo"
        accept="application/pdf"
        multiple
        required
        onChange={(e) => {
          setArquivos(Array.from(e.target.files ?? []))
          setErroLote(null)
        }}
      />
      <p className="text-muted-foreground text-xs">
        Um ou vários PDFs de CAT (até {MAXIMO_LOTE} por vez). A IA lê cada
        documento e pré-preenche os 50 campos, e compara com a base: avisa se a
        CAT já foi lançada, se é uma atualização de outra (reabertura, óbito) ou
        se pode ser duplicidade. Funciona com PDF digital e também escaneado
        (imagem) — o escaneado usa a leitura por visão e demora um pouco mais.
        Com vários PDFs, eles aparecem numa lista e você confere um a um, sem
        sair da tela.
      </p>
      <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm">
        <input
          type="checkbox"
          checked={registrar}
          onChange={(e) => setRegistrar(e.target.checked)}
          className="accent-primary mt-1"
        />
        <span>
          <strong>Registrar sem conferência</strong>
          <span className="text-muted-foreground block text-xs">
            Grava direto o que a IA leu, sem você revisar campo a campo. Cada CAT
            fica marcada &quot;sem conferência&quot;, com um alerta no topo da
            página dela, até alguém conferir com o PDF (que fica guardado na
            CAT). CATs já lançadas não entram; possível duplicidade e leitura sem
            nome ou data ficam na lista para você conferir.
          </span>
        </span>
      </label>
      {(estado.erro || erroLote) && (
        <Alert variant="destructive">
          <AlertDescription>{erroLote ?? estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {pendente
            ? "Lendo o PDF…"
            : arquivos.length > 1
              ? `Ler ${arquivos.length} PDFs com IA`
              : "Ler PDF com IA"}
        </Button>
      </div>
    </form>
  )
}
