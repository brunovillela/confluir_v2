"use client"

import { useId, useRef, useState, type ChangeEvent, type FormEvent } from "react"
import { Camera } from "lucide-react"

import { Button } from "@/components/ui/button"
import { avisarArquivoTrocado } from "@/components/ui/campo-arquivo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LIMITE_ENVIO, prepararArquivo } from "@/lib/arquivo-envio"

// Anexo das solicitações de atendimento — o mesmo campo no portal (filiado) e
// no painel (resposta da equipe), porque os dois gravam por guardarAnexo
// (lib/db/portal-atendimentos.ts) e esbarram no mesmo teto.

// O que o seletor oferece. `image/*` (e não só as extensões) é o que faz o
// celular oferecer a câmera ao lado da galeria e dos arquivos (A98); `.pdf`
// com o tipo junto, porque alguns Android só reconhecem um dos dois.
const ACEITA = "image/*,application/pdf,.pdf,.docx,.xlsx,.txt"
// O que de fato passa — por extensão e por tipo: foto do celular nem sempre
// chega com a extensão esperada, e `image/*` no seletor não quer dizer que
// HEIC ou BMP sirvam.
const ACEITA_CONFERENCIA =
  ".pdf,.jpg,.jpeg,.png,.webp,.gif,.docx,.xlsx,.txt,application/pdf,image/jpeg,image/png,image/webp,image/gif"
// Word e Excel só nos formatos novos: quem tem .doc/.xls precisa saber por que o "Word" foi recusado.
const ERRO_TIPO =
  "Este tipo de arquivo não é aceito. Envie PDF, foto (JPG, PNG, WEBP ou GIF), Word (.docx), Excel (.xlsx) ou texto (.txt)."

/**
 * Teto do anexo. O arquivo viaja no corpo da server action, que o Next corta
 * em 4 MB NO TOTAL (next.config.ts) — e o corpo leva também o texto. Mesmo
 * valor de MAX_ANEXO em lib/db/portal-atendimentos.ts e do artigo de ajuda.
 */
const LIMITE_ANEXO = 3.5 * 1024 * 1024
const LIMITE_ROTULO = "3,5 MB"

/** "6,2 MB", arredondado para cima — 3,52 MB não pode aparecer como "3,5 MB". */
function emMB(bytes: number): string {
  return `${(Math.ceil((bytes / (1024 * 1024)) * 10) / 10).toLocaleString("pt-BR")} MB`
}

/**
 * Anexo conferido no navegador ANTES do envio: foto grande é reduzida ali
 * mesmo e o que ainda passa do teto é recusado junto ao campo, sem enviar. Se
 * fosse, o envio estouraria o corpo da action com um erro genérico e o
 * formulário voltaria em branco.
 */
export function useAnexo() {
  const [erro, setErro] = useState<string | null>(null)
  const [preparando, setPreparando] = useState(false)
  // Cada escolha tem a sua vez: resultado de uma escolha anterior não vale.
  const vez = useRef(0)

  async function preparar(input: HTMLInputElement) {
    const minha = ++vez.current
    const original = input.files?.[0]
    setErro(null)
    setPreparando(Boolean(original))
    if (!original) return
    let r: { erro?: string } = {}
    try {
      r = await prepararArquivo(input, {
        aceita: ACEITA_CONFERENCIA,
        erroTipo: ERRO_TIPO,
        limite: LIMITE_ANEXO,
        erroLimite: `O arquivo escolhido tem ${emMB(original.size)} e o anexo aceita até ${LIMITE_ROTULO}. Envie uma versão menor: se for um documento digitalizado, digitalize em resolução mais baixa ou só as páginas necessárias.`,
      })
    } catch {
      // Falha inesperada no preparo: o envio ainda passa pela conferência do onSubmit.
    }
    if (minha !== vez.current) return
    setPreparando(false)
    setErro(r.erro ?? null)
  }

  function aoEscolher(e: ChangeEvent<HTMLInputElement>) {
    void preparar(e.currentTarget)
  }

  /**
   * Foto do atalho "Tirar foto": vai para o campo do anexo (é ele que segue no
   * envio) e passa pela mesma preparação de uma escolha comum.
   */
  function aoFotografar(e: ChangeEvent<HTMLInputElement>, campo: HTMLInputElement | null) {
    const foto = e.currentTarget.files?.[0]
    e.currentTarget.value = ""
    if (!foto || !campo) return
    try {
      const dt = new DataTransfer()
      dt.items.add(foto)
      campo.files = dt.files
    } catch {
      setErro("Não deu para usar a foto por este atalho. Toque em “Escolha um arquivo” e escolha a câmera por lá.")
      return
    }
    avisarArquivoTrocado(campo)
    void preparar(campo)
  }

  /** Última conferência, no envio: foto ainda em preparo, anexo ou envio grandes demais. */
  function conferirEnvio(e: FormEvent<HTMLFormElement>) {
    let motivo: string | null = null
    if (preparando) {
      motivo = "Aguarde o anexo terminar de ser preparado e envie de novo."
    } else {
      let total = 0
      let anexo = 0
      for (const [nome, valor] of new FormData(e.currentTarget)) {
        const tamanho = typeof valor === "string" ? new Blob([valor]).size : valor.size
        total += tamanho
        if (nome === "anexo") anexo = tamanho
      }
      if (anexo > LIMITE_ANEXO) {
        motivo = `O anexo passa de ${LIMITE_ROTULO}. Tire o arquivo ou escolha uma versão menor.`
      } else if (total > LIMITE_ENVIO) {
        motivo = "Junto com o texto, o anexo passa do limite de envio. Envie um arquivo menor ou encurte a mensagem."
      }
    }
    // Sem preventDefault o React segue com a action; com ele, nada sai e nada se apaga.
    if (motivo) e.preventDefault()
    setErro(motivo)
  }

  return { erro, preparando, aoEscolher, aoFotografar, conferirEnvio }
}

export function CampoAnexo({
  anexo,
  apoio,
}: {
  anexo: ReturnType<typeof useAnexo>
  /** O documento que resolve o pedido (ex.: o contracheque, na contribuição). */
  apoio?: string | null
}) {
  const id = useId()
  const idErro = `${id}-erro`
  const idDica = `${id}-dica`
  const idApoio = `${id}-apoio`
  const campo = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const descritores = [anexo.erro ? idErro : null, apoio ? idApoio : null, idDica].filter(Boolean).join(" ")
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="anexo">Anexo (opcional)</Label>
      {apoio && (
        <p id={idApoio} className="text-sm">
          {apoio}
        </p>
      )}
      <Input
        ref={campo}
        id="anexo"
        name="anexo"
        type="file"
        accept={ACEITA}
        limite={`até ${LIMITE_ROTULO}`}
        onChange={anexo.aoEscolher}
        aria-invalid={anexo.erro ? true : undefined}
        aria-describedby={descritores}
      />
      {/* Atalho para a câmera só no toque (A98). O `capture` mora num campo à
          parte, sem nome — no campo do anexo ele esconderia a galeria e os
          arquivos; a foto tirada aqui é passada para o campo do anexo. */}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(e) => anexo.aoFotografar(e, campo.current)}
      />
      <div className="hidden pointer-coarse:block">
        <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => camera.current?.click()}>
          <Camera />
          Tirar foto do documento
        </Button>
      </div>
      {anexo.erro && (
        <p id={idErro} role="alert" className="text-destructive text-xs">
          {anexo.erro}
        </p>
      )}
      <p id={idDica} aria-live="polite" className="text-muted-foreground text-xs">
        {anexo.preparando
          ? "Preparando o anexo para o envio…"
          : "Foto grande, como a do celular, é reduzida automaticamente antes do envio."}
      </p>
    </div>
  )
}
