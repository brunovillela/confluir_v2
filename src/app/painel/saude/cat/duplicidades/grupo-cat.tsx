"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import { Link2, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { CatResumo, TipoGrupoCat } from "@/lib/cat-classificacao"
import { type EstadoForm } from "@/lib/contas"
import { formatarData } from "@/lib/formato"

import { descartarCopiasAction, ignorarGrupoCatAction, vincularAtualizacaoAction } from "./actions"

/**
 * Um grupo: escolhe-se a CAT que fica (ou a de origem) e o que fazer com as
 * outras — descartar como cópia, ligar como atualização ou "não é".
 */
export function GrupoCatAcoes({
  tipo,
  chave,
  cats,
}: {
  tipo: TipoGrupoCat
  chave: string
  cats: CatResumo[]
}) {
  const [escolhida, setEscolhida] = useState(cats[0]?.id ?? "")
  const [ignorando, setIgnorando] = useState(false)
  // Resolvido, o grupo sai da lista na hora (revalidação) — o aviso vai em toast.
  const comAviso =
    (acao: (p: EstadoForm, f: FormData) => Promise<EstadoForm>) => async (prev: EstadoForm, formData: FormData) => {
      const r = await acao(prev, formData)
      if (r.ok) toast.success(r.ok)
      return r
    }
  const [estDescarte, descartar, pDescarte] = useActionState<EstadoForm, FormData>(comAviso(descartarCopiasAction), {})
  const [estVinculo, vincular, pVinculo] = useActionState<EstadoForm, FormData>(comAviso(vincularAtualizacaoAction), {})
  const [estIgnorar, ignorar, pIgnorar] = useActionState<EstadoForm, FormData>(comAviso(ignorarGrupoCatAction), {})
  const todos = cats.map((c) => c.id).join(",")
  const feito = estDescarte.ok ?? estVinculo.ok ?? estIgnorar.ok
  const erro = estDescarte.erro ?? estVinculo.erro ?? estIgnorar.erro
  const rotuloEscolha = tipo === "atualizacao" ? "Origem" : tipo === "numero" ? "Fica" : "Fica / origem"

  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">{rotuloEscolha}</TableHead>
              <TableHead>Número</TableHead>
              <TableHead>Acidentado</TableHead>
              <TableHead>Acidente</TableHead>
              <TableHead className="hidden md:table-cell">Tipo</TableHead>
              <TableHead className="hidden lg:table-cell">Empregador</TableHead>
              <TableHead className="hidden lg:table-cell">CID</TableHead>
              <TableHead className="hidden md:table-cell">Lançada em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cats.map((c) => (
              <TableRow key={c.id} className={c.id === escolhida ? "bg-muted/40" : undefined}>
                <TableCell>
                  <input
                    type="radio"
                    name={`escolha-${tipo}-${chave}`}
                    checked={c.id === escolhida}
                    onChange={() => setEscolhida(c.id)}
                    disabled={Boolean(feito)}
                    aria-label={`Escolher a CAT ${c.numero ?? "sem número"}`}
                    className="accent-primary"
                  />
                </TableCell>
                <TableCell className="font-medium tabular-nums">
                  <Link href={`/painel/saude/cat/${c.id}`} target="_blank" className="hover:underline">
                    {c.numero ?? "sem número"}
                  </Link>
                </TableCell>
                <TableCell className="max-w-56 truncate">{c.nome ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatarData(c.dataAcidente)}
                  {c.houveMorte && (
                    <Badge variant="outline" className="border-warning/40 text-warning-fg ml-1.5">
                      óbito
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">{c.tipo ?? "—"}</TableCell>
                <TableCell className="hidden max-w-48 truncate lg:table-cell">{c.empregador ?? "—"}</TableCell>
                <TableCell className="hidden lg:table-cell">{c.cid ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">{formatarData(c.criadoEm)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {feito ? (
        <p className="text-success-fg text-sm">{feito}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {tipo !== "atualizacao" && (
            <form
              action={descartar}
              onSubmit={(e) => {
                if (!confirm("Manter a CAT marcada e descartar as outras como cópia? Elas saem das listas, mas não são apagadas."))
                  e.preventDefault()
              }}
            >
              <input type="hidden" name="manter" value={escolhida} />
              <input type="hidden" name="cats" value={todos} />
              <Button type="submit" size="sm" disabled={pDescarte}>
                {pDescarte ? <Loader2 className="animate-spin" /> : <Trash2 />}
                É a mesma CAT: manter a marcada
              </Button>
            </form>
          )}
          {tipo !== "numero" && (
            <form action={vincular}>
              <input type="hidden" name="origem" value={escolhida} />
              <input type="hidden" name="cats" value={todos} />
              <Button type="submit" size="sm" variant={tipo === "atualizacao" ? "default" : "outline"} disabled={pVinculo}>
                {pVinculo ? <Loader2 className="animate-spin" /> : <Link2 />}
                É atualização: ligar à marcada como origem
              </Button>
            </form>
          )}
          {!ignorando && (
            <Button size="sm" variant="ghost" onClick={() => setIgnorando(true)}>
              {tipo === "atualizacao" ? "Não é atualização" : "Não é duplicidade"}
            </Button>
          )}
        </div>
      )}
      {ignorando && !feito && (
        <form action={ignorar} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="tipo" value={tipo} />
          <input type="hidden" name="chave" value={chave} />
          <input type="hidden" name="cats" value={todos} />
          <Input name="motivo" placeholder="Por quê? (ex.: dois acidentes no mesmo dia)" className="h-8 w-full sm:w-80" />
          <Button type="submit" size="sm" variant="outline" disabled={pIgnorar}>
            {pIgnorar && <Loader2 className="animate-spin" />}
            Confirmar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setIgnorando(false)}>
            Voltar
          </Button>
        </form>
      )}
      {erro && <p className="text-destructive text-sm">{erro}</p>}
    </div>
  )
}
