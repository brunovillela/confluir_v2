"use client"

import { useActionState, useRef, useState } from "react"
import { Loader2, Printer, ShieldAlert, Upload } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { TAMANHO_MAX_CARTA } from "@/lib/oposicao-constantes"

import { enviarDocumento } from "../../actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

export function BotaoImprimir() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => window.print()}
      className="print:hidden"
    >
      <Printer />
      Imprimir
    </Button>
  )
}

/**
 * O PDF tem assinatura digital? Toda assinatura PAdES (gov.br ou ICP-Brasil)
 * grava um `/ByteRange` em texto puro no arquivo — o trecho assinado fica de
 * fora de qualquer compressão. Sem ele, o PDF não foi assinado (a carta
 * baixada direto, um print, uma digitalização). Na dúvida (falha ao ler),
 * deixa passar: quem confere de verdade é o servidor.
 */
async function pareceAssinado(arquivo: File): Promise<boolean> {
  try {
    const texto = new TextDecoder("latin1").decode(await arquivo.arrayBuffer())
    return texto.includes("/ByteRange")
  } catch {
    return true
  }
}

/**
 * Envio da carta assinada — a primeira e a troca do arquivo (A53). O campo é
 * o `CampoArquivo` do sistema (o `Input type="file"` o desenha): área de
 * soltar, "PDF · até 4 MB" e o nome do arquivo escolhido.
 *
 * Antes de subir (07/11/2026), o navegador confere se o PDF tem assinatura
 * digital: sem ela, a pessoa vê na hora o que fazer, em vez de a carta ir
 * para a fila da entidade e voltar como "assinatura a conferir". Ela ainda
 * pode enviar mesmo assim (a decisão é da entidade).
 */
export function EnviarDocumento({
  opositorId,
  campanhaId,
  rotulo = "Enviar a carta assinada",
}: {
  opositorId: string
  campanhaId: string | null
  rotulo?: string
}) {
  const [estado, formAction, pendente] = useActionState(enviarDocumento, {})
  // Barrado aqui, antes de subir (M3): acima do limite o servidor nem recebe.
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [semAssinatura, setSemAssinatura] = useState(false)
  const [conferindo, setConferindo] = useState(false)
  // O arquivo escolhido já passou pela conferência (ou a pessoa quis enviar
  // mesmo assim): o próximo envio segue direto.
  const liberado = useRef(false)
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) => {
      const form = e.currentTarget
      const arquivo = (form.elements.namedItem("documento") as HTMLInputElement | null)?.files?.[0]
      if (arquivo && arquivo.size > TAMANHO_MAX_CARTA) {
        e.preventDefault()
        setErroLocal(
          `O arquivo tem ${(arquivo.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB; o limite é 3,8 MB. Baixe de novo a carta assinada no gov.br (o PDF dele é pequeno) — fotos e PDFs escaneados ficam grandes demais.`
        )
        return
      }
      setErroLocal(null)
      if (!arquivo || liberado.current) {
        liberado.current = false
        return
      }
      e.preventDefault()
      setConferindo(true)
      void pareceAssinado(arquivo).then((ok) => {
        setConferindo(false)
        if (ok) {
          liberado.current = true
          form.requestSubmit()
        } else {
          setSemAssinatura(true)
        }
      })
    },
  })
  const idCampo = `documento-${opositorId.slice(0, 8)}`
  const erro = erroLocal ?? estado.erro
  const ocupado = pendente || conferindo
  return (
    <form
      action={formAction} {...envio}
      className="grid gap-3 print:hidden"
    >
      <input type="hidden" name="opositor_id" value={opositorId} />
      <input type="hidden" name="campanha_id" value={campanhaId ?? ""} />
      {erro && (
        <Alert id={`${idCampo}-erro`} variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor={idCampo}>PDF assinado no gov.br</Label>
        <Input
          id={idCampo}
          name="documento"
          type="file"
          accept="application/pdf"
          required
          onChange={() => {
            setErroLocal(null)
            setSemAssinatura(false)
            liberado.current = false
          }}
          aria-describedby={erro ? `${idCampo}-erro` : semAssinatura ? `${idCampo}-aviso` : undefined}
        />
      </div>
      {semAssinatura ? (
        <Alert id={`${idCampo}-aviso`} variant="warning" role="alert">
          <ShieldAlert />
          <AlertTitle>Este PDF não está assinado</AlertTitle>
          <AlertDescription>
            <p>
              Parece ser a carta antes da assinatura (ou uma foto, print ou digitalização). Sem a assinatura do
              gov.br, a entidade pode não aceitar.
            </p>
            <p>
              Assine no Assinador gov.br e escolha aqui o arquivo que ele devolve — costuma terminar em
              “_assinado.pdf”.
            </p>
          </AlertDescription>
          <div className="col-start-2 mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                setSemAssinatura(false)
                liberado.current = true
                e.currentTarget.form?.requestSubmit()
              }}
            >
              Enviar mesmo assim
            </Button>
          </div>
        </Alert>
      ) : (
        <div>
          <Button type="submit" disabled={ocupado}>
            {ocupado ? <Loader2 className="animate-spin" /> : <Upload />}
            {conferindo ? "Conferindo o arquivo…" : rotulo}
          </Button>
        </div>
      )}
    </form>
  )
}
