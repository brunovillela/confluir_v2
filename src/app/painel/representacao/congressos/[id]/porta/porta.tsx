"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { CheckCircle2, CloudOff, Loader2, LogOut, Search } from "lucide-react"

import { LeitorQr } from "@/components/leitor-qr"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { PessoaMesa } from "@/lib/db/congressos-dia"
import { semAcento } from "@/lib/texto"

import { presencaAction, saidaAction } from "../../dia-actions"

export type LinhaPorta = {
  id: string
  nome: string
  papel: string | null
  cor: string | null
  base: string | null
  entrada: string | null
  saida: string | null
}

type Pendente = { participanteId?: string; texto?: string; entradaEm: string }

/**
 * Porta da sessão: lê o crachá (a câmera fica ligada para a fila andar), busca
 * por nome e faz a chamada pela lista. Sem conexão, o registro fica guardado
 * no aparelho com o horário e sobe sozinho quando a rede volta.
 */
export function Porta({
  congressoId,
  sessaoId,
  linhas: iniciais,
  registraSaida,
}: {
  congressoId: string
  sessaoId: string
  linhas: LinhaPorta[]
  registraSaida: boolean
}) {
  const chave = `cgr-porta-${sessaoId}`
  const [linhas, setLinhas] = useState(iniciais)
  const [filtro, setFiltro] = useState("")
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro" | "info"; texto: string } | null>(null)
  const [candidatos, setCandidatos] = useState<PessoaMesa[]>([])
  // A fila guardada no aparelho é lida uma vez, na montagem (no servidor não há localStorage).
  const [fila, setFila] = useState<Pendente[]>(() => {
    if (typeof window === "undefined") return []
    try {
      return JSON.parse(localStorage.getItem(chave) ?? "[]") as Pendente[]
    } catch {
      return []
    }
  })
  const [ocupado, iniciar] = useTransition()
  const enviando = useRef(false)

  const guardarFila = useCallback(
    (f: Pendente[]) => {
      setFila(f)
      try {
        localStorage.setItem(chave, JSON.stringify(f))
      } catch {
        // sem armazenamento
      }
    },
    [chave]
  )

  const marcar = useCallback((id: string, entrada: string) => {
    setLinhas((l) => l.map((x) => (x.id === id ? { ...x, entrada: x.entrada ?? entrada, saida: null } : x)))
  }, [])

  const registrar = useCallback(
    async (p: { participanteId?: string; texto?: string }, entradaEm?: string): Promise<boolean> => {
      try {
        const r = await presencaAction({ congressoId, sessaoId, ...p, metodo: p.participanteId ? "chamada" : "porta", entradaEm })
        if (r.candidatos) {
          setCandidatos(r.candidatos)
          setAviso(r.candidatos.length ? null : { tipo: "info", texto: "Ninguém encontrado." })
          return true
        }
        if (r.erro) {
          setAviso({ tipo: "erro", texto: r.erro })
          return true
        }
        const alvo = r.participanteId ?? p.participanteId
        if (alvo) marcar(alvo, entradaEm ?? new Date().toISOString())
        setCandidatos([])
        setAviso({ tipo: r.jaEstava ? "info" : "ok", texto: r.jaEstava ? `${r.nome} já estava na sessão.` : `${r.nome}: presença registrada.` })
        return true
      } catch {
        return false
      }
    },
    [congressoId, sessaoId, marcar]
  )

  async function registrarOuGuardar(p: { participanteId?: string; texto?: string }) {
    const entradaEm = new Date().toISOString()
    const ok = await registrar(p)
    if (!ok) {
      guardarFila([...fila, { ...p, entradaEm }])
      if (p.participanteId) marcar(p.participanteId, entradaEm)
      setAviso({ tipo: "info", texto: "Sem conexão: registro guardado no aparelho. Sobe sozinho quando a rede voltar." })
    }
  }

  // Esvazia a fila quando a conexão volta.
  useEffect(() => {
    if (!fila.length) return
    const tentar = async () => {
      if (enviando.current || !navigator.onLine) return
      enviando.current = true
      const resto: Pendente[] = []
      for (const item of fila) {
        const ok = await registrar(item, item.entradaEm)
        if (!ok) resto.push(item)
      }
      guardarFila(resto)
      enviando.current = false
    }
    const t = setInterval(tentar, 10000)
    window.addEventListener("online", tentar)
    return () => {
      clearInterval(t)
      window.removeEventListener("online", tentar)
    }
  }, [fila, registrar, guardarFila])

  const visiveis = useMemo(() => {
    const n = semAcento(filtro)
    return linhas.filter((l) => !n || semAcento(`${l.nome} ${l.base ?? ""}`).includes(n))
  }, [linhas, filtro])
  const presentes = linhas.filter((l) => l.entrada && !l.saida).length

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-2xl font-semibold tabular-nums">{presentes}</span>
        <span className="text-muted-foreground">presentes de {linhas.length} credenciados</span>
        {fila.length > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
            <CloudOff className="size-4" />
            {fila.length} aguardando conexão
          </span>
        )}
      </div>
      <LeitorQr rotulo="Ler crachás" continuo aoLer={(t) => registrarOuGuardar({ texto: t })} />
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (filtro.trim().length >= 3) iniciar(() => registrarOuGuardar({ texto: filtro }))
        }}
      >
        <Input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar a lista ou buscar por nome/CPF" className="h-11 max-w-md text-base" />
        <Button type="submit" variant="outline" className="h-11" disabled={ocupado}>
          {ocupado ? <Loader2 className="animate-spin" /> : <Search />}
          Buscar
        </Button>
      </form>
      {aviso && (
        <Alert variant={aviso.tipo === "erro" ? "destructive" : "default"}>
          <AlertDescription className={aviso.tipo === "ok" ? "text-emerald-700 dark:text-emerald-400" : undefined}>{aviso.texto}</AlertDescription>
        </Alert>
      )}
      {candidatos.length > 0 && (
        <div className="grid gap-2 rounded-lg border p-3">
          <div className="text-sm font-medium">Quem é?</div>
          {candidatos.map((c) => (
            <Button key={c.id} variant="outline" className="justify-start" onClick={() => iniciar(() => registrarOuGuardar({ participanteId: c.id }))}>
              {c.nome}
              {c.base ? ` · ${c.base}` : ""}
              {!c.credenciadoEm ? " (não credenciado)" : ""}
            </Button>
          ))}
        </div>
      )}
      <div className="divide-y rounded-lg border">
        {visiveis.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate font-medium">{l.nome}</div>
              <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <span className="size-2.5 rounded-full" style={{ background: l.cor ?? "transparent" }} />
                {l.papel ?? "—"}
                {l.base ? ` · ${l.base}` : ""}
              </div>
            </div>
            {l.entrada && !l.saida ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" />
                  {new Date(l.entrada).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
                </span>
                {registraSaida && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Registrar saída de ${l.nome}`}
                    onClick={() =>
                      iniciar(async () => {
                        const r = await saidaAction({ congressoId, sessaoId, participanteId: l.id })
                        if (r.erro) return setAviso({ tipo: "erro", texto: r.erro })
                        setLinhas((x) => x.map((y) => (y.id === l.id ? { ...y, saida: new Date().toISOString() } : y)))
                      })
                    }
                  >
                    <LogOut />
                  </Button>
                )}
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => iniciar(() => registrarOuGuardar({ participanteId: l.id }))}>
                {l.saida ? "Voltou" : "Presente"}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
