"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { confirmar } from "@/components/ui/confirmacao"
import { SelectNativo } from "@/components/ui/select-nativo"
import { MOTIVOS_DESFILIACAO, rotuloMotivoDesfiliacao } from "@/lib/churn-constantes"
import { formatarData } from "@/lib/formato"

import { definirMotivoEmLoteAction } from "./actions"

export type LinhaSemMotivo = {
  vinculoId: string
  filiadoId: string
  nome: string | null
  fonte: string | null
  saida: string | null
}

const POR_PAGINA = 50

/**
 * Vínculos encerrados sem motivo, com marcação e um motivo para todos os
 * marcados (lista do churn e Cadastros pendentes). Grava só onde ainda não
 * há motivo; cada um ganha a anotação no prontuário.
 */
export function MotivoEmLote({ itens }: { itens: LinhaSemMotivo[] }) {
  const router = useRouter()
  const [fonte, setFonte] = useState("")
  const [pagina, setPagina] = useState(0)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [motivo, setMotivo] = useState("")
  const [mensagem, setMensagem] = useState<{ ok?: string; erro?: string }>({})
  const [gravando, iniciar] = useTransition()

  const fontes = useMemo(
    () => [...new Set(itens.map((i) => i.fonte ?? "(sem fonte)"))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [itens]
  )
  const filtrados = fonte ? itens.filter((i) => (i.fonte ?? "(sem fonte)") === fonte) : itens
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const naPagina = filtrados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)
  const todosDaPagina = naPagina.length > 0 && naPagina.every((i) => marcados.has(i.vinculoId))

  const alternar = (ids: string[], ligar: boolean) =>
    setMarcados((atual) => {
      const novo = new Set(atual)
      for (const id of ids) {
        if (ligar) novo.add(id)
        else novo.delete(id)
      }
      return novo
    })

  const aplicar = async () => {
    if (!motivo || marcados.size === 0) return
    const ok = await confirmar({
      titulo: `Registrar "${rotuloMotivoDesfiliacao(motivo)}" em ${marcados.size} vínculo(s)?`,
      descricao: "Só os vínculos ainda sem motivo recebem o registro; cada filiado ganha a anotação no prontuário.",
      confirmar: "Registrar",
    })
    if (!ok) return
    iniciar(async () => {
      const r = await definirMotivoEmLoteAction([...marcados], motivo)
      setMensagem(r)
      if (r.ok) {
        setMarcados(new Set())
        router.refresh()
      }
    })
  }

  if (itens.length === 0) {
    return <p className="text-muted-foreground text-sm">Nenhum vínculo encerrado sem motivo.</p>
  }

  return (
    <div className="grid gap-3">
      {mensagem.erro && (
        <Alert variant="destructive">
          <AlertDescription>{mensagem.erro}</AlertDescription>
        </Alert>
      )}
      {mensagem.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{mensagem.ok}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {fontes.length > 1 && (
          <SelectNativo
            aria-label="Filtrar por fonte pagadora"
            value={fonte}
            onChange={(e) => {
              setFonte(e.target.value)
              setPagina(0)
            }}
            className="w-56"
          >
            <option value="">Todas as fontes ({itens.length})</option>
            {fontes.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </SelectNativo>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={() => alternar(filtrados.map((i) => i.vinculoId), true)}>
          Marcar todos ({filtrados.length})
        </Button>
        {marcados.size > 0 && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setMarcados(new Set())}>
            Desmarcar
          </Button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SelectNativo aria-label="Motivo da desfiliação" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-60">
            <option value="" disabled>
              Motivo para os marcados…
            </option>
            {MOTIVOS_DESFILIACAO.map((m) => (
              <option key={m.chave} value={m.chave}>
                {m.rotulo}
              </option>
            ))}
          </SelectNativo>
          <Button type="button" size="sm" onClick={aplicar} disabled={gravando || !motivo || marcados.size === 0}>
            {gravando ? <Loader2 className="animate-spin" /> : <Check />}
            Registrar em {marcados.size}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-left text-xs">
            <tr>
              <th className="w-10 px-3 py-2">
                <Checkbox
                  checked={todosDaPagina}
                  onCheckedChange={(v) => alternar(naPagina.map((i) => i.vinculoId), v === true)}
                  aria-label="Marcar os desta página"
                />
              </th>
              <th className="px-3 py-2 font-medium">Filiado</th>
              <th className="px-3 py-2 font-medium">Fonte pagadora</th>
              <th className="px-3 py-2 font-medium">Desfiliação</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {naPagina.map((i) => (
              <tr key={i.vinculoId}>
                <td className="px-3 py-2">
                  <Checkbox
                    checked={marcados.has(i.vinculoId)}
                    onCheckedChange={(v) => alternar([i.vinculoId], v === true)}
                    aria-label={`Marcar ${i.nome ?? "o vínculo"}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <Link href={`/painel/filiados/${i.filiadoId}`} className="font-medium underline-offset-4 hover:underline">
                    {i.nome ?? "(sem nome)"}
                  </Link>
                </td>
                <td className="text-muted-foreground px-3 py-2">{i.fonte ?? "—"}</td>
                <td className="text-muted-foreground px-3 py-2 whitespace-nowrap tabular-nums">{formatarData(i.saida)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
    </div>
  )
}
