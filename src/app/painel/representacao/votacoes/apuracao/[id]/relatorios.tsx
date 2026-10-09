"use client"

import { useState } from "react"
import { FileText, ListChecks, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  SECOES_RELATORIO,
  type SecaoRelatorio,
} from "@/lib/assembleias-relatorio-secoes"

/**
 * Os três relatórios da votação online: votantes, resultado e o completo —
 * este com um formulário para escolher o que entra.
 */
export function RelatoriosApuracao({
  assembleiaId,
  hibrida,
}: {
  assembleiaId: string
  hibrida: boolean
}) {
  const base = `/painel/representacao/votacoes/apuracao/${assembleiaId}/relatorio`
  const secoes = SECOES_RELATORIO.filter((x) => hibrida || x.chave !== "urnas")
  const [marcadas, setMarcadas] = useState<Set<SecaoRelatorio>>(
    () => new Set(secoes.map((x) => x.chave))
  )

  function alternar(chave: SecaoRelatorio, ligar: boolean) {
    setMarcadas((atual) => {
      const novo = new Set(atual)
      if (ligar) novo.add(chave)
      else novo.delete(chave)
      return novo
    })
  }

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <OpcaoRelatorio
        href={`${base}?tipo=votantes`}
        icone={<Users />}
        titulo="Relação dos votantes"
        texto="Quem votou, com CPF, matrícula, canal e horário."
      />
      <OpcaoRelatorio
        href={`${base}?tipo=resultado`}
        icone={<FileText />}
        titulo="Informações e resultado"
        texto="Dados da assembleia, comparecimento e resultado por pergunta."
      />
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="hover:bg-muted/40 grid gap-1 rounded-lg border p-3 text-left transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-medium [&_svg]:size-4">
              <ListChecks />
              Relatório completo
            </span>
            <span className="text-muted-foreground text-xs">
              Escolha as informações que entram no relatório.
            </span>
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Relatório completo</DialogTitle>
            <DialogDescription>
              Marque o que deve entrar. O PDF abre numa nova aba.
            </DialogDescription>
          </DialogHeader>
          <form action={base} method="get" target="_blank" className="grid gap-4">
            <input type="hidden" name="tipo" value="completo" />
            <div className="grid gap-2">
              {secoes.map((x) => (
                <label
                  key={x.chave}
                  className="hover:bg-muted/40 flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5"
                >
                  <Checkbox
                    checked={marcadas.has(x.chave)}
                    onCheckedChange={(v) => alternar(x.chave, v === true)}
                    className="mt-0.5"
                  />
                  <span className="grid gap-0.5">
                    <span className="text-sm font-medium">{x.rotulo}</span>
                    <span className="text-muted-foreground text-xs">{x.dica}</span>
                  </span>
                  {marcadas.has(x.chave) && (
                    <input type="hidden" name="secao" value={x.chave} />
                  )}
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={marcadas.size === 0}>
                <FileText />
                Gerar relatório
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function OpcaoRelatorio({
  href,
  icone,
  titulo,
  texto,
}: {
  href: string
  icone: React.ReactNode
  titulo: string
  texto: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="hover:bg-muted/40 grid gap-1 rounded-lg border p-3 transition-colors"
    >
      <span className="flex items-center gap-2 text-sm font-medium [&_svg]:size-4">
        {icone}
        {titulo}
      </span>
      <span className="text-muted-foreground text-xs">{texto}</span>
    </a>
  )
}
