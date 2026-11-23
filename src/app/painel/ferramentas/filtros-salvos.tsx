"use client"

import Link from "next/link"
import { useActionState, useState, useTransition } from "react"
import { Bookmark, BookmarkPlus, Loader2, Users, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { type EstadoForm } from "@/lib/contas"
import { type PaginaFiltro } from "@/lib/ferramentas-acompanhamento"
import { cn } from "@/lib/utils"

import { excluirFiltroAction, salvarFiltroAction } from "./filtros-actions"

export type AtalhoFiltro = {
  id: string
  nome: string
  consulta: string
  /** Atalho pronto do sistema (não se apaga). */
  fixo?: boolean
  compartilhado?: boolean
  meu?: boolean
  autorNome?: string | null
}

/**
 * Filtros salvos (Onda 4): os atalhos de um clique acima dos filtros. O
 * atual fica marcado; "Salvar este filtro" guarda a consulta da página com um
 * nome (o mesmo nome substitui), só para você ou para a equipe.
 */
export function FiltrosSalvos({
  pagina,
  consultaAtual,
  atalhos,
}: {
  pagina: PaginaFiltro
  /** A consulta da página em forma canônica (consultaCanonica). */
  consultaAtual: string
  atalhos: AtalhoFiltro[]
}) {
  const [estado, salvar, salvando] = useActionState<EstadoForm, FormData>(salvarFiltroAction, {})
  // Aberto enquanto o estado da ação é o de quando abriu (ou deu erro): salvou, fecha.
  const [abertoEm, setAbertoEm] = useState<EstadoForm | null>(null)
  const aberto = abertoEm !== null && (abertoEm === estado || Boolean(estado.erro))
  const setAberto = (v: boolean) => setAbertoEm(v ? estado : null)
  const [apagando, iniciar] = useTransition()
  const [erroApagar, setErroApagar] = useState<string | null>(null)
  const jaSalvo = atalhos.some((a) => a.consulta === consultaAtual)

  const base = `/painel/ferramentas/${pagina}`
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Bookmark className="text-muted-foreground size-4" aria-hidden />
        <span className="text-muted-foreground mr-1 text-xs">Atalhos:</span>
        {atalhos.map((a) => {
          const ativo = a.consulta === consultaAtual
          return (
            <span
              key={a.id}
              className={cn(
                "inline-flex items-center rounded-full border text-xs",
                ativo ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
              )}
            >
              <Link
                href={a.consulta ? `${base}?${a.consulta}` : base}
                className="inline-flex items-center gap-1 py-1 pr-1 pl-2.5"
                aria-current={ativo ? "true" : undefined}
                title={a.autorNome ? `Compartilhado por ${a.autorNome}` : a.compartilhado ? "Compartilhado com a equipe" : undefined}
              >
                {a.compartilhado && <Users className="size-3" aria-label="compartilhado" />}
                {a.nome}
              </Link>
              {a.meu ? (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive rounded-full p-1 pr-1.5"
                  aria-label={`Apagar o atalho ${a.nome}`}
                  disabled={apagando}
                  onClick={() => {
                    if (!window.confirm(`Apagar o atalho "${a.nome}"?`)) return
                    setErroApagar(null)
                    iniciar(async () => {
                      const r = await excluirFiltroAction(a.id)
                      if (r.erro) setErroApagar(r.erro)
                    })
                  }}
                >
                  <X className="size-3" />
                </button>
              ) : (
                <span className="pr-1.5" />
              )}
            </span>
          )
        })}
        {consultaAtual && !jaSalvo && !aberto && (
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAberto(true)}>
            <BookmarkPlus />
            Salvar este filtro
          </Button>
        )}
        {erroApagar && <span className="text-destructive text-xs">{erroApagar}</span>}
      </div>
      {aberto && (
        <form action={salvar} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="pagina" value={pagina} />
          <input type="hidden" name="consulta" value={consultaAtual} />
          <Input name="nome" required maxLength={60} placeholder="Nome do atalho (ex.: Jurídico atrasado)" className="h-8 w-64 max-w-full text-sm" autoFocus />
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" name="compartilhado" value="1" className="accent-primary size-3.5" />
            Mostrar para a equipe
          </label>
          <Button type="submit" size="sm" disabled={salvando}>
            {salvando && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
            Cancelar
          </Button>
          {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
        </form>
      )}
    </div>
  )
}
