"use client"

import { startTransition, useActionState, useState } from "react"
import Link from "next/link"
import { Loader2, UserPlus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { formatarCpf } from "@/lib/cpf"
import { FILIACAO_CONDICOES } from "@/lib/filiacao"

import { cadastrarNaoEncontradosAction, type EstadoCadastroLista } from "../actions"

export type NaoEncontradoTela = {
  linha: number
  nome: string | null
  cpf: string | null
  matricula: string | null
  cargo: string | null
  cadastradoId: string | null
}

/**
 * Quem está na lista e não tem cadastro: a pergunta "deseja cadastrar?". A
 * lista do empregador traz também quem não é filiado — por isso nada vem
 * marcado e a condição sindical é escolhida aqui.
 */
export function NaoEncontrados({
  loteId,
  itens,
  fonteNome,
  podeCadastrar,
  semFonte,
}: {
  loteId: string
  itens: NaoEncontradoTela[]
  fonteNome: string | null
  podeCadastrar: boolean
  /** Lista enviada sem fonte pagadora: não há onde abrir o vínculo. */
  semFonte: boolean
}) {
  const pendentes = itens.filter((i) => !i.cadastradoId)
  const [marcados, setMarcados] = useState<Set<number>>(new Set())
  const [condicao, setCondicao] = useState<string>("Ativo")
  const [estado, acao, gravando] = useActionState<EstadoCadastroLista, FormData>(cadastrarNaoEncontradosAction, {})

  const enviar = () => {
    const fd = new FormData()
    fd.set("lote_id", loteId)
    fd.set("condicao", condicao)
    for (const l of marcados) fd.append("linha", String(l))
    startTransition(() => acao(fd))
    setMarcados(new Set())
  }

  return (
    <div className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            {estado.ok}
            {estado.erros?.length ? ` Não deu certo: ${estado.erros.join("; ")}` : ""}
          </AlertDescription>
        </Alert>
      )}

      {pendentes.length > 0 && podeCadastrar && (
        <div className="bg-muted/30 flex flex-wrap items-end gap-3 rounded-lg border p-3">
          <p className="w-full text-sm">
            <strong>Deseja cadastrar {pendentes.length === 1 ? "esta pessoa" : "estas pessoas"}?</strong>{" "}
            Marque quem cadastrar: cada uma vira um cadastro com os dados da lista e um vínculo em
            aberto em {fonteNome ?? "na fonte"}. A lista da empresa pode trazer quem não é filiado —
            escolha a condição sindical.
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="condicao-novos">Condição dos novos cadastros</Label>
            <SelectNativo id="condicao-novos" value={condicao} onChange={(e) => setCondicao(e.target.value)} className="w-64">
              {FILIACAO_CONDICOES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectNativo>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setMarcados(new Set(pendentes.map((p) => p.linha)))}>
            Marcar todos
          </Button>
          <Button type="button" onClick={enviar} disabled={gravando || marcados.size === 0}>
            {gravando ? <Loader2 className="animate-spin" /> : <UserPlus />}
            Cadastrar {marcados.size || ""} marcado(s)
          </Button>
        </div>
      )}
      {pendentes.length > 0 && semFonte && (
        <p className="text-muted-foreground text-sm">
          Para cadastrar quem não foi encontrado, envie a lista com a fonte pagadora escolhida.
        </p>
      )}

      <ul className="divide-y rounded-lg border">
        {itens.map((i) => (
          <li key={i.linha} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
            {podeCadastrar && !i.cadastradoId && (
              <Checkbox
                checked={marcados.has(i.linha)}
                onCheckedChange={(v) =>
                  setMarcados((atual) => {
                    const novo = new Set(atual)
                    if (v === true) novo.add(i.linha)
                    else novo.delete(i.linha)
                    return novo
                  })
                }
                aria-label={`Cadastrar ${i.nome ?? `a linha ${i.linha}`}`}
              />
            )}
            <span className="font-medium">{i.nome ?? "(sem nome)"}</span>
            <span className="text-muted-foreground font-mono text-xs">{i.cpf ? formatarCpf(i.cpf) : "sem CPF"}</span>
            {i.matricula && <span className="text-muted-foreground text-xs">matrícula {i.matricula}</span>}
            {i.cargo && <span className="text-muted-foreground text-xs">{i.cargo}</span>}
            <span className="text-muted-foreground text-xs">linha {i.linha}</span>
            {i.cadastradoId && (
              <Link href={`/painel/filiados/${i.cadastradoId}`} target="_blank">
                <Badge variant="success" className="hover:underline">
                  cadastrado
                </Badge>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
