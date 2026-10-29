"use client"

import { startTransition, useActionState, useMemo, useState } from "react"
import Link from "next/link"
import { Check, Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { confirmar } from "@/components/ui/confirmacao"
import { exibirValor, ROTULOS_CAMPO } from "@/lib/atualizacao-lista"
import { type EstadoForm } from "@/lib/contas"

import { aplicarLoteAction } from "../actions"

export type CampoPrevia = { seq: number; campo: string; anterior: string | null; novo: string | null; marcadoPadrao: boolean }
export type PessoaPrevia = {
  filiadoId: string
  nome: string | null
  via: "cpf" | "matricula" | "nome_nascimento" | "nome"
  linha: number | null
  campos: CampoPrevia[]
}

const POR_PAGINA = 50
const ROTULO_VIA = {
  cpf: "pelo CPF",
  matricula: "pela matrícula",
  nome_nascimento: "pelo nome e nascimento",
  nome: "sugestão pelo nome",
} as const

type Filtro = "todos" | "trocas" | "nome"

/**
 * Prévia campo a campo: campo vazio no cadastro vem marcado (só completa);
 * valor diferente e pessoa achada só pelo nome vêm desmarcados.
 */
export function Previa({ loteId, pessoas }: { loteId: string; pessoas: PessoaPrevia[] }) {
  const padrao = useMemo(
    () => new Set(pessoas.flatMap((p) => p.campos.filter((c) => c.marcadoPadrao).map((c) => c.seq))),
    [pessoas]
  )
  const [marcados, setMarcados] = useState<Set<number>>(padrao)
  const [filtro, setFiltro] = useState<Filtro>("todos")
  const [pagina, setPagina] = useState(0)
  const [estado, acao, gravando] = useActionState<EstadoForm, FormData>(aplicarLoteAction, {})

  const visiveis = pessoas.filter((p) =>
    filtro === "nome" ? p.via === "nome" : filtro === "trocas" ? p.campos.some((c) => c.anterior !== null) : true
  )
  const paginas = Math.max(1, Math.ceil(visiveis.length / POR_PAGINA))
  const naPagina = visiveis.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)
  const todos = pessoas.flatMap((p) => p.campos.map((c) => c.seq))
  const pessoasMarcadas = pessoas.filter((p) => p.campos.some((c) => marcados.has(c.seq))).length

  const alternar = (seqs: number[], ligar: boolean) =>
    setMarcados((atual) => {
      const novo = new Set(atual)
      for (const s of seqs) {
        if (ligar) novo.add(s)
        else novo.delete(s)
      }
      return novo
    })

  const aplicar = async () => {
    const ok = await confirmar({
      titulo: `Aplicar ${marcados.size} alteração(ões) em ${pessoasMarcadas} cadastro(s)?`,
      descricao: "Os campos marcados são gravados agora. O lote pode ser desfeito depois.",
      confirmar: "Aplicar",
    })
    if (!ok) return
    const fd = new FormData()
    fd.set("lote_id", loteId)
    fd.set("seqs", JSON.stringify([...marcados]))
    startTransition(() => acao(fd))
  }

  return (
    <div className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["todos", `Todos (${pessoas.length})`],
              ["trocas", `Com troca de valor (${pessoas.filter((p) => p.campos.some((c) => c.anterior !== null)).length})`],
              ["nome", `Sugestões pelo nome (${pessoas.filter((p) => p.via === "nome").length})`],
            ] as const
          ).map(([chave, rotulo]) => (
            <Button
              key={chave}
              type="button"
              size="sm"
              variant={filtro === chave ? "default" : "outline"}
              onClick={() => {
                setFiltro(chave)
                setPagina(0)
              }}
            >
              {rotulo}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={() => setMarcados(new Set(padrao))}>
            Só completar vazios
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMarcados(new Set(todos))}>
            Marcar tudo
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMarcados(new Set())}>
            Desmarcar tudo
          </Button>
        </div>
      </div>

      <div className="grid gap-3">
        {naPagina.map((p) => {
          const seqs = p.campos.map((c) => c.seq)
          const todosMarcados = seqs.every((s) => marcados.has(s))
          return (
            <div key={p.filiadoId} className="rounded-lg border">
              <div className="bg-muted/40 flex flex-wrap items-center gap-2 border-b px-3 py-2">
                <Checkbox
                  checked={todosMarcados ? true : seqs.some((s) => marcados.has(s)) ? "indeterminate" : false}
                  onCheckedChange={(v) => alternar(seqs, v === true)}
                  aria-label={`Marcar todos os campos de ${p.nome ?? "esta pessoa"}`}
                />
                <Link
                  href={`/painel/filiados/${p.filiadoId}`}
                  target="_blank"
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {p.nome ?? "(sem nome)"}
                </Link>
                <Badge variant={p.via === "nome" ? "warning" : "outline"}>{ROTULO_VIA[p.via]}</Badge>
                {p.linha && <span className="text-muted-foreground text-xs">linha {p.linha} da lista</span>}
              </div>
              <ul className="divide-y">
                {p.campos.map((c) => (
                  <li key={c.seq} className="grid grid-cols-[auto_minmax(8rem,12rem)_1fr] items-start gap-3 px-3 py-2 text-sm">
                    <Checkbox
                      checked={marcados.has(c.seq)}
                      onCheckedChange={(v) => alternar([c.seq], v === true)}
                      aria-label={`Atualizar ${ROTULOS_CAMPO[c.campo] ?? c.campo}`}
                      className="mt-0.5"
                    />
                    <span className="text-muted-foreground">{ROTULOS_CAMPO[c.campo] ?? c.campo}</span>
                    <span className="min-w-0 break-words">
                      {c.anterior === null ? (
                        <span className="text-muted-foreground">vazio → </span>
                      ) : (
                        <span className="text-muted-foreground line-through">{exibirValor(c.campo, c.anterior)}</span>
                      )}
                      {c.anterior !== null && <span className="text-muted-foreground"> → </span>}
                      <span className="font-medium">{exibirValor(c.campo, c.novo)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
        {naPagina.length === 0 && <p className="text-muted-foreground text-sm">Nada neste filtro.</p>}
      </div>

      {paginas > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button type="button" size="sm" variant="outline" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>
            Anterior
          </Button>
          <span className="text-muted-foreground tabular-nums">
            {pagina + 1} de {paginas}
          </span>
          <Button type="button" size="sm" variant="outline" disabled={pagina >= paginas - 1} onClick={() => setPagina(pagina + 1)}>
            Próxima
          </Button>
        </div>
      )}

      <div className="bg-background sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t py-3">
        <span className="text-muted-foreground text-sm">
          {marcados.size} campo(s) marcado(s) em {pessoasMarcadas} cadastro(s)
        </span>
        <Button type="button" onClick={aplicar} disabled={gravando || marcados.size === 0}>
          {gravando ? <Loader2 className="animate-spin" /> : <Check />}
          Aplicar os marcados
        </Button>
      </div>
    </div>
  )
}
