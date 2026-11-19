"use client"

import { useState } from "react"
import { Download, FileSpreadsheet, FileText } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import {
  OPCOES_PADRAO,
  QUEM_NA_RELACAO,
  urlRelacao,
  type OpcoesRelacao,
  type QuemNaRelacao,
} from "@/lib/eventos-relacao-opcoes"

/**
 * "Baixar confirmados…" (19/11/2026): um painel só no lugar de um botão por
 * recorte. Os três formatos são links comuns montados com as opções — nada de
 * JavaScript no download, o navegador baixa (Excel) ou abre (PDF) sozinho.
 */
export function BaixarRelacao({
  eventoId,
  confirmados,
  listaEspera,
}: {
  eventoId: string
  confirmados: number
  listaEspera: number
}) {
  const [o, setO] = useState<OpcoesRelacao>(OPCOES_PADRAO)
  const muda = (p: Partial<OpcoesRelacao>) => setO((atual) => ({ ...atual, ...p }))

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download />
          Baixar confirmados…
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Baixar a relação</DialogTitle>
          <DialogDescription>
            Para levar a sistemas que não conversam com o Confluir. {confirmados}{" "}
            confirmado(s){listaEspera > 0 ? `, ${listaEspera} na lista de espera` : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="relacao-quem">Quem entra</Label>
            <SelectNativo
              id="relacao-quem"
              value={o.quem}
              onChange={(e) => muda({ quem: e.target.value as QuemNaRelacao })}
            >
              {QUEM_NA_RELACAO.map((q) => (
                <option key={q.valor} value={q.valor}>
                  {q.rotulo}
                </option>
              ))}
            </SelectNativo>
          </div>

          <div className="grid gap-3">
            {listaEspera > 0 && (
              <Opcao
                id="relacao-espera"
                marcado={o.espera}
                aoMudar={(v) => muda({ espera: v })}
                rotulo="Incluir a lista de espera"
                ajuda="Aparece marcada como lista de espera, separada dos confirmados."
              />
            )}
            <Opcao
              id="relacao-cpf"
              marcado={o.cpfParcial}
              aoMudar={(v) => muda({ cpfParcial: v })}
              rotulo="CPF parcial (***.456.789-**)"
              ajuda="Basta para conferir na porta. Use quando o arquivo vai a terceiro."
            />
            <Opcao
              id="relacao-contato"
              marcado={!o.contato}
              aoMudar={(v) => muda({ contato: !v })}
              rotulo="Sem e-mail e telefone"
              ajuda="Para quem só precisa saber quem vem."
            />
          </div>

          <div className="grid gap-2 border-t pt-4 sm:grid-cols-3">
            <Button asChild size="sm">
              <a href={urlRelacao(eventoId, "xlsx", o)} download>
                <FileSpreadsheet />
                Excel
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={urlRelacao(eventoId, "pdf", o)} target="_blank" rel="noopener noreferrer">
                <FileText />
                PDF
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a
                href={urlRelacao(eventoId, "assinatura", o)}
                target="_blank"
                rel="noopener noreferrer"
                title="PDF com coluna de assinatura, para a lista de presença em papel"
              >
                <FileText />
                P/ assinatura
              </a>
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            O arquivo leva dado pessoal. Mande só o necessário e apague quando o
            evento acabar. Cada download fica registrado na Auditoria.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Opcao({
  id,
  marcado,
  aoMudar,
  rotulo,
  ajuda,
}: {
  id: string
  marcado: boolean
  aoMudar: (v: boolean) => void
  rotulo: string
  ajuda: string
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Checkbox id={id} checked={marcado} onCheckedChange={(v) => aoMudar(v === true)} className="mt-0.5" />
      <div className="grid gap-0.5">
        <Label htmlFor={id} className="font-normal">
          {rotulo}
        </Label>
        <span className="text-muted-foreground text-xs">{ajuda}</span>
      </div>
    </div>
  )
}
