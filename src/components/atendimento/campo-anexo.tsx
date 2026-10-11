"use client"

import { useId, useRef, useState, type ChangeEvent, type FormEvent } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LIMITE_ENVIO, prepararArquivo } from "@/lib/arquivo-envio"

// Anexo das solicitações de atendimento — o mesmo campo no portal (filiado) e
// no painel (resposta da equipe), porque os dois gravam por guardarAnexo
// (lib/db/portal-atendimentos.ts) e esbarram no mesmo teto.

const ACEITA = ".pdf,.jpg,.jpeg,.png,.webp,.gif,.docx,.xlsx,.txt"
// Na conferência vale também o tipo: foto do celular nem sempre chega com a extensão esperada.
const ACEITA_CONFERENCIA = `${ACEITA},application/pdf,image/jpeg,image/png,image/webp,image/gif`
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

  async function aoEscolher(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget
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

  return { erro, preparando, aoEscolher, conferirEnvio }
}

export function CampoAnexo({ anexo }: { anexo: ReturnType<typeof useAnexo> }) {
  const id = useId()
  const idErro = `${id}-erro`
  const idDica = `${id}-dica`
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="anexo">Anexo (opcional)</Label>
      <Input
        id="anexo"
        name="anexo"
        type="file"
        accept={ACEITA}
        limite={`até ${LIMITE_ROTULO}`}
        onChange={anexo.aoEscolher}
        aria-invalid={anexo.erro ? true : undefined}
        aria-describedby={anexo.erro ? `${idErro} ${idDica}` : idDica}
      />
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
