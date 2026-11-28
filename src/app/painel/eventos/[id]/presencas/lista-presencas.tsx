"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { confirmar } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import type { PessoaNoLancamento } from "@/lib/db/eventos-presencas-manual"
import { formatarCnpjCpf, formatarDataHora } from "@/lib/formato"

import { salvarPresencasAction } from "./actions"

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()

const ORIGEM: Record<string, string> = { qr: "QR na porta", busca: "busca na porta", manual: "lançada depois" }

/**
 * A lista do dia: marca quem veio, desmarca o que foi marcado por engano e
 * salva tudo de uma vez. Nada é gravado até "Salvar".
 */
export function ListaPresencas({
  eventoId,
  diaId,
  pessoas,
}: {
  eventoId: string
  diaId: string
  pessoas: PessoaNoLancamento[]
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [busca, setBusca] = useState("")
  const [marcado, setMarcado] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(pessoas.map((p) => [p.inscricaoId, p.presente]))
  )

  const visiveis = useMemo(() => {
    const termo = semAcento(busca)
    const digitos = busca.replace(/\D/g, "")
    if (!termo) return pessoas
    return pessoas.filter((p) => {
      const nome = semAcento(p.nome ?? "")
      if (termo.split(" ").every((pal) => nome.includes(pal))) return true
      return digitos.length >= 3 && (p.cpf ?? "").includes(digitos)
    })
  }, [busca, pessoas])

  const marcar = pessoas.filter((p) => !p.presente && marcado[p.inscricaoId]).map((p) => p.inscricaoId)
  const retirar = pessoas.filter((p) => p.presente && !marcado[p.inscricaoId]).map((p) => p.inscricaoId)
  const presentesAgora = pessoas.filter((p) => marcado[p.inscricaoId]).length
  const mudou = marcar.length + retirar.length > 0

  function marcarVisiveis(v: boolean) {
    setMarcado((atual) => {
      const novo = { ...atual }
      for (const p of visiveis) {
        // Só quem está confirmado ganha presença; desmarcar vale para todos.
        if (v && p.situacao !== "confirmada") continue
        novo[p.inscricaoId] = v
      }
      return novo
    })
  }

  async function salvar() {
    if (retirar.length > 0) {
      const ok = await confirmar({
        titulo: `Retirar ${retirar.length === 1 ? "1 presença" : `${retirar.length} presenças`}?`,
        descricao:
          "A presença sai da relação e dos indicadores. Fica registrado quem retirou e quando. A anotação no prontuário do filiado, se já houver, não é apagada.",
      })
      if (!ok) return
    }
    iniciar(async () => {
      const r = await salvarPresencasAction({ eventoId, diaId, marcar, retirar })
      if (r.erro) {
        toast.error(r.erro)
        return
      }
      const partes = [
        r.lancadas ? `${r.lancadas} presença(s) lançada(s)` : null,
        r.retiradas ? `${r.retiradas} retirada(s)` : null,
      ].filter(Boolean)
      toast.success(partes.length ? `${partes.join(", ")}.` : "Nada mudou.")
      router.refresh()
    })
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou CPF"
            className="pl-8"
            aria-label="Buscar por nome ou CPF"
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => marcarVisiveis(true)}>
          Marcar {busca ? "os listados" : "todos"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => marcarVisiveis(false)}>
          Desmarcar {busca ? "os listados" : "todos"}
        </Button>
      </div>

      <div className="divide-y rounded-md border">
        {visiveis.length === 0 && (
          <p className="text-muted-foreground p-4 text-sm">Ninguém encontrado com essa busca.</p>
        )}
        {visiveis.map((p) => {
          const id = `pres-${p.inscricaoId}`
          const podeMarcar = p.situacao === "confirmada" || p.presente
          const alterado = marcado[p.inscricaoId] !== p.presente
          return (
            <label
              key={p.inscricaoId}
              htmlFor={id}
              className={`flex items-start gap-3 px-3 py-2.5 ${podeMarcar ? "cursor-pointer" : "opacity-60"} ${alterado ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}
            >
              <Checkbox
                id={id}
                checked={!!marcado[p.inscricaoId]}
                disabled={!podeMarcar || pendente}
                onCheckedChange={(v) => setMarcado((a) => ({ ...a, [p.inscricaoId]: v === true }))}
                className="mt-0.5"
              />
              <span className="grid flex-1 gap-0.5">
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  {p.nome ?? "(sem nome)"}
                  {p.filiado && <Badge variant="secondary">filiado</Badge>}
                  {p.convidado && <Badge variant="outline">convidado</Badge>}
                  {p.situacao !== "confirmada" && <Badge variant="outline">{p.situacao.replace("_", " ")}</Badge>}
                </span>
                <span className="text-muted-foreground text-xs">
                  {p.cpf ? formatarCnpjCpf(p.cpf) : "sem CPF"}
                  {p.presente &&
                    ` · presente (${ORIGEM[p.metodo ?? ""] ?? p.metodo}${p.confirmadaEm ? `, ${formatarDataHora(p.confirmadaEm)}` : ""}${p.confirmadaPorNome ? `, por ${p.confirmadaPorNome}` : ""})`}
                  {alterado && (marcado[p.inscricaoId] ? " · será lançada" : " · será retirada")}
                </span>
              </span>
            </label>
          )
        })}
      </div>

      <div className="bg-background sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t py-3">
        <span className="text-muted-foreground text-sm">
          {presentesAgora} de {pessoas.length} marcados
          {mudou && ` · ${marcar.length} a lançar, ${retirar.length} a retirar`}
        </span>
        <div className="flex gap-2">
          {mudou && (
            <Button
              type="button"
              variant="ghost"
              disabled={pendente}
              onClick={() => setMarcado(Object.fromEntries(pessoas.map((p) => [p.inscricaoId, p.presente])))}
            >
              Desfazer marcações
            </Button>
          )}
          <Button type="button" disabled={!mudou || pendente} onClick={salvar}>
            {pendente ? "Salvando…" : "Salvar presenças"}
          </Button>
        </div>
      </div>
    </div>
  )
}
