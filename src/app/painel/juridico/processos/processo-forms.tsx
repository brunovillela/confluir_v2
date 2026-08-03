"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Save, Search, Upload, UserPlus, X } from "lucide-react"

import { EmpresaCombobox, type EmpresaOpcao } from "@/components/empresa-combobox"
import type { SugestaoFiliado } from "@/components/filiado-picker"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatarCpf } from "@/lib/cpf"
import {
  STATUS_PROCESSO,
  TIPOS_PROCESSO,
} from "@/lib/juridico-constantes"
import { useActionState } from "react"

import { atualizarProcessoAction, criarProcessoAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type OpcaoResponsavel = { id: string; nome: string }
export type FiliadoInicial = { id: string; nome: string | null; cpf: string | null }

/**
 * Seletor de VÁRIOS filiados: busca por nome/CPF/matrícula (3+ caracteres) e
 * acumula chips, cada um com um input hidden `filiado_id`. A action lê todos
 * via formData.getAll("filiado_id"). Mesmo debounce/abort do FiliadoPicker.
 */
function MultiFiliadoPicker({
  endpoint,
  inicial = [],
}: {
  endpoint: string
  inicial?: FiliadoInicial[]
}) {
  const [selecionados, setSelecionados] = useState<FiliadoInicial[]>(inicial)
  const [termo, setTermo] = useState("")
  const [sugestoes, setSugestoes] = useState<SugestaoFiliado[]>([])
  const [aberto, setAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requisicao = useRef<AbortController | null>(null)

  function aoDigitar(valor: string) {
    setTermo(valor)
    if (timer.current) clearTimeout(timer.current)
    requisicao.current?.abort()
    const q = valor.trim()
    if (q.length < 3) {
      setSugestoes([])
      setAberto(false)
      setCarregando(false)
      return
    }
    setCarregando(true)
    timer.current = setTimeout(async () => {
      const controlador = new AbortController()
      requisicao.current = controlador
      try {
        const r = await fetch(`${endpoint}?q=${encodeURIComponent(q)}`, {
          signal: controlador.signal,
        })
        const { sugestoes: s } = (await r.json()) as {
          sugestoes: SugestaoFiliado[]
        }
        setSugestoes(s)
        setAberto(true)
        setCarregando(false)
      } catch {
        // requisição substituída por outra digitação
      }
    }, 300)
  }

  useEffect(() => {
    const req = requisicao
    const t = timer
    return () => {
      if (t.current) clearTimeout(t.current)
      req.current?.abort()
    }
  }, [])

  useEffect(() => {
    function aoClicar(e: MouseEvent) {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener("mousedown", aoClicar)
    return () => document.removeEventListener("mousedown", aoClicar)
  }, [])

  function adicionar(s: SugestaoFiliado) {
    setSelecionados((atual) =>
      atual.some((f) => f.id === s.id)
        ? atual
        : [...atual, { id: s.id, nome: s.nome_completo, cpf: s.cpf }]
    )
    setTermo("")
    setSugestoes([])
    setAberto(false)
  }

  return (
    <div className="grid gap-2">
      {selecionados.map((f) => (
        <div
          key={f.id}
          className="border-input flex items-center gap-3 rounded-md border px-3 py-2"
        >
          <input type="hidden" name="filiado_id" value={f.id} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {f.nome ?? "(sem nome)"}
          </span>
          <span className="text-muted-foreground hidden font-mono text-xs sm:inline">
            {f.cpf ? formatarCpf(f.cpf) : ""}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Remover filiado"
            onClick={() =>
              setSelecionados((atual) => atual.filter((x) => x.id !== f.id))
            }
          >
            <X />
          </Button>
        </div>
      ))}

      <div ref={caixa} className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        {carregando && (
          <Loader2 className="text-muted-foreground absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin" />
        )}
        <Input
          value={termo}
          onChange={(e) => aoDigitar(e.target.value)}
          onFocus={() => sugestoes.length > 0 && setAberto(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault()
            if (e.key === "Escape") setAberto(false)
          }}
          placeholder="Adicionar filiado por nome, CPF ou matrícula"
          className="pl-8"
          aria-label="Buscar filiado"
          role="combobox"
          aria-expanded={aberto}
        />
        {aberto && (
          <div className="bg-popover text-popover-foreground absolute z-50 mt-1 w-full overflow-hidden rounded-md border shadow-md">
            {sugestoes.length === 0 ? (
              <p className="text-muted-foreground px-3 py-2.5 text-sm">
                Nenhum filiado encontrado para “{termo.trim()}”.
              </p>
            ) : (
              <ul>
                {sugestoes.map((s) => {
                  const jaTem = selecionados.some((f) => f.id === s.id)
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        disabled={jaTem}
                        onClick={() => adicionar(s)}
                        className="hover:bg-muted/60 flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors disabled:opacity-50"
                      >
                        <UserPlus className="text-muted-foreground size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {s.nome_completo ?? "(sem nome)"}
                        </span>
                        <span className="text-muted-foreground hidden font-mono text-xs sm:inline">
                          {s.cpf ? formatarCpf(s.cpf) : ""}
                          {jaTem && <> · já adicionado</>}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

type ValoresIniciais = {
  id: string
  numero_processo: string | null
  tipo: string | null
  coletivo: boolean | null
  status_processo: string | null
  data_abertura: string | null
  parte_assessorada: string | null
  outras_partes: string[] | null
  observacoes: string | null
  assessoria_id: string | null
  responsavel_id: string | null
  filiados: FiliadoInicial[]
}

function CamposProcesso({
  buscaFiliadoEndpoint,
  responsaveis,
  escritorios,
  inicial,
}: {
  buscaFiliadoEndpoint: string
  responsaveis: OpcaoResponsavel[]
  escritorios: EmpresaOpcao[]
  inicial?: ValoresIniciais
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="numero_processo">Número do processo *</Label>
          <Input
            id="numero_processo"
            name="numero_processo"
            required
            defaultValue={inicial?.numero_processo ?? ""}
            placeholder="0000000-00.0000.0.00.0000"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="data_abertura">Data de abertura</Label>
          <Input
            id="data_abertura"
            name="data_abertura"
            type="date"
            defaultValue={inicial?.data_abertura ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="tipo">Área do direito</Label>
          <select
            id="tipo"
            name="tipo"
            defaultValue={inicial?.tipo ?? ""}
            className={SELECT}
          >
            <option value="">Não informada</option>
            {TIPOS_PROCESSO.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="status_processo">Status</Label>
          <select
            id="status_processo"
            name="status_processo"
            defaultValue={inicial?.status_processo ?? ""}
            className={SELECT}
          >
            <option value="">Não informado</option>
            {STATUS_PROCESSO.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="coletivo">Natureza</Label>
          <select
            id="coletivo"
            name="coletivo"
            defaultValue={inicial?.coletivo ? "sim" : "nao"}
            className={SELECT}
          >
            <option value="nao">Individual</option>
            <option value="sim">Coletivo</option>
          </select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="responsavel_id">Responsável pelo acompanhamento</Label>
        <select
          id="responsavel_id"
          name="responsavel_id"
          defaultValue={inicial?.responsavel_id ?? ""}
          className={SELECT}
        >
          <option value="">Não atribuído</option>
          {responsaveis.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="assessoria_id">Escritório responsável</Label>
        <EmpresaCombobox
          empresas={escritorios}
          name="assessoria_id"
          defaultId={inicial?.assessoria_id ?? undefined}
        />
        <p className="text-muted-foreground text-xs">
          Escritório de advocacia que conduz o caso — é o favorecido dos
          reembolsos deste processo.
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label>Filiados envolvidos</Label>
        <MultiFiliadoPicker
          endpoint={buscaFiliadoEndpoint}
          inicial={inicial?.filiados ?? []}
        />
        <p className="text-muted-foreground text-xs">
          Adicione um ou mais filiados. Em processos coletivos, informe também a
          parte assessorada abaixo.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="parte_assessorada">Parte assessorada</Label>
          <Input
            id="parte_assessorada"
            name="parte_assessorada"
            defaultValue={inicial?.parte_assessorada ?? ""}
            placeholder="Ex.: categoria, grupo ou nome"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="outras_partes">Parte(s) contrária(s)</Label>
          <Textarea
            id="outras_partes"
            name="outras_partes"
            rows={2}
            defaultValue={(inicial?.outras_partes ?? []).join("\n")}
            placeholder="Uma por linha"
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea
          id="observacoes"
          name="observacoes"
          rows={3}
          defaultValue={inicial?.observacoes ?? ""}
          placeholder="Objeto do processo, andamento resumido, anotações internas…"
        />
      </div>
    </div>
  )
}

export function NovoProcessoForm({
  buscaFiliadoEndpoint,
  responsaveis,
  escritorios,
}: {
  buscaFiliadoEndpoint: string
  responsaveis: OpcaoResponsavel[]
  escritorios: EmpresaOpcao[]
}) {
  const [estado, formAction, pendente] = useActionState(criarProcessoAction, {})
  return (
    <form action={formAction} className="grid max-w-3xl gap-4">
      <CamposProcesso
        buscaFiliadoEndpoint={buscaFiliadoEndpoint}
        responsaveis={responsaveis}
        escritorios={escritorios}
      />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar processo
        </Button>
      </div>
    </form>
  )
}

export function EditarProcessoForm({
  buscaFiliadoEndpoint,
  responsaveis,
  escritorios,
  inicial,
}: {
  buscaFiliadoEndpoint: string
  responsaveis: OpcaoResponsavel[]
  escritorios: EmpresaOpcao[]
  inicial: ValoresIniciais
}) {
  const [estado, formAction, pendente] = useActionState(
    atualizarProcessoAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="id" value={inicial.id} />
      <CamposProcesso
        buscaFiliadoEndpoint={buscaFiliadoEndpoint}
        responsaveis={responsaveis}
        escritorios={escritorios}
        inicial={inicial}
      />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Upload />}
          Salvar alterações
        </Button>
      </div>
    </form>
  )
}
