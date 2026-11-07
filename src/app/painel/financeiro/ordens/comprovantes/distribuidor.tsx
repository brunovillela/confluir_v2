"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { CheckCircle2, ExternalLink, FileUp, Loader2, Search, XCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { atribuirOrdens, PONTOS_CONFIANCA, type Sugestao } from "@/lib/comprovantes-casamento"
import type { OrdemResumo } from "@/lib/db/comprovantes-distribuicao"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { cn } from "@/lib/utils"
import { parseValorBR } from "@/lib/valores"

import {
  buscarOrdemAction,
  lerComprovantesAction,
  vincularComprovantesAction,
  type ItemLido,
  type ResultadoVinculo,
} from "./actions"

const SELECT =
  "border-input bg-background h-9 w-full truncate rounded-md border px-2 text-sm [color-scheme:light] dark:[color-scheme:dark]"

function confianca(pontos: number): { rotulo: string; classe: string } {
  if (pontos >= 100) return { rotulo: "alta", classe: "text-success-fg" }
  if (pontos >= PONTOS_CONFIANCA) return { rotulo: "média", classe: "text-info-fg" }
  return { rotulo: "baixa", classe: "text-warning-fg" }
}

function rotuloOrdem(o: OrdemResumo): string {
  return [o.codigo ?? "ordem", o.favorecido ?? o.descricao ?? "—", formatarMoeda(o.valor), o.situacao].filter(Boolean).join(" · ")
}

type Ajuste = { data: string; valor: string }

export function Distribuidor({ debitos, hoje }: { debitos: { id: string; nome: string }[]; hoje: string }) {
  const [itens, setItens] = useState<ItemLido[]>([])
  const [ordens, setOrdens] = useState<Record<string, OrdemResumo>>({})
  const [escolha, setEscolha] = useState<Record<string, string | null>>({})
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [ajustes, setAjustes] = useState<Record<string, Ajuste>>({})
  const [resultados, setResultados] = useState<Record<string, ResultadoVinculo>>({})
  const [extras, setExtras] = useState<Record<string, string[]>>({})
  const [lendo, setLendo] = useState<string[]>([])
  const [mensagens, setMensagens] = useState<{ erro: boolean; texto: string }[]>([])
  const [conta, setConta] = useState("")
  const [confirmando, iniciar] = useTransition()
  // Cópia local de cada arquivo, para abrir e conferir (o enviado fica no servidor).
  const [arquivosLocais, setArquivosLocais] = useState<Record<string, string>>({})

  async function enviar(lista: FileList | File[]) {
    const arquivos = [...lista]
    if (arquivos.length === 0) return
    setLendo((l) => [...l, ...arquivos.map((a) => a.name)])
    for (const arquivo of arquivos) {
      const fd = new FormData()
      fd.set("arquivo", arquivo)
      let r
      try {
        r = await lerComprovantesAction(fd)
      } catch {
        r = { erro: `${arquivo.name}: falha ao enviar (arquivo grande demais ou conexão).` }
      }
      setLendo((l) => {
        const i = l.indexOf(arquivo.name)
        return i < 0 ? l : [...l.slice(0, i), ...l.slice(i + 1)]
      })
      const avisos = (r.avisos ?? []).map((t) => ({ erro: false, texto: t }))
      if (r.erro) {
        setMensagens((m) => [...m, { erro: true, texto: r.erro! }, ...avisos])
        continue
      }
      if (avisos.length) setMensagens((m) => [...m, ...avisos])
      const novos = r.itens ?? []
      if (novos[0]) {
        const caminho = novos[0].caminho
        setArquivosLocais((x) => ({ ...x, [caminho]: URL.createObjectURL(arquivo) }))
      }
      setOrdens((o) => ({ ...o, ...r.ordens }))
      setItens((atuais) => [...atuais, ...novos])
      setEscolha((atual) => {
        // A ordem já escolhida para outro comprovante não entra de novo.
        const tomadas = new Set(Object.values(atual).filter((v): v is string => !!v))
        const auto = atribuirOrdens(
          novos.map((n) => ({ chave: n.chave, sugestoes: n.sugestoes.filter((s) => !tomadas.has(s.ordemId)) }))
        )
        const prox = { ...atual }
        for (const n of novos) prox[n.chave] = auto.get(n.chave) ?? null
        setMarcados((m) => {
          const s = new Set(m)
          for (const n of novos) if (prox[n.chave]) s.add(n.chave)
          return s
        })
        return prox
      })
    }
  }

  const escolhidas = Object.entries(escolha).filter(([k, v]) => v && !resultados[k]?.ok)
  const repetidas = new Set(
    escolhidas.map(([, v]) => v!).filter((v, i, a) => a.indexOf(v) !== i)
  )
  const pendentes = itens.filter((i) => !resultados[i.chave]?.ok)
  const prontos = pendentes.filter((i) => marcados.has(i.chave) && escolha[i.chave] && !repetidas.has(escolha[i.chave]!))
  const precisaConta = prontos.some((i) => ordens[escolha[i.chave]!]?.situacao !== "Paga")
  const feitos = itens.filter((i) => resultados[i.chave]?.ok).length

  function confirmar(lista: ItemLido[]) {
    const vinculos = lista.map((i) => {
      const ordemId = escolha[i.chave]!
      const aj = ajustes[i.chave]
      const valor = aj ? parseValorBR(aj.valor) : i.lido.valor
      return {
        chave: i.chave,
        caminho: i.caminho,
        paginas: i.lido.paginas,
        nomeArquivo: i.nomeArquivo,
        ordemId,
        valor: valor && valor > 0 ? valor : null,
        data: aj?.data || i.lido.data,
      }
    })
    iniciar(async () => {
      const rs = await vincularComprovantesAction(vinculos, conta || null)
      setResultados((r) => ({ ...r, ...Object.fromEntries(rs.map((x) => [x.chave, x])) }))
      setMarcados((m) => {
        const s = new Set(m)
        for (const x of rs) if (x.ok) s.delete(x.chave)
        return s
      })
    })
  }

  async function buscar(chave: string, codigo: string) {
    const r = await buscarOrdemAction(codigo)
    if (r.erro || !r.ordem) {
      setMensagens((m) => [...m, { erro: true, texto: r.erro ?? "Ordem não encontrada." }])
      return
    }
    const o = r.ordem
    setOrdens((x) => ({ ...x, [o.id]: o }))
    setExtras((x) => ({ ...x, [chave]: [...new Set([...(x[chave] ?? []), o.id])] }))
    setEscolha((x) => ({ ...x, [chave]: o.id }))
    setMarcados((m) => new Set(m).add(chave))
  }

  return (
    <div className="grid gap-4">
      <label
        className="bg-card hover:bg-muted/40 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          void enviar(e.dataTransfer.files)
        }}
      >
        <FileUp className="text-muted-foreground size-6" />
        <span className="text-sm font-medium">Arraste os comprovantes aqui ou clique para escolher</span>
        <span className="text-muted-foreground text-xs">PDF, JPG ou PNG · até 4 MB por arquivo · vários de uma vez</span>
        <input
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) void enviar(e.target.files)
            e.target.value = ""
          }}
        />
      </label>

      {lendo.length > 0 && (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Lendo {lendo.length} arquivo{lendo.length > 1 ? "s" : ""}: {lendo.join(", ")}
        </p>
      )}
      {mensagens.length > 0 && (
        <ul className="grid gap-1 text-sm">
          {mensagens.map((m, i) => (
            <li key={i} className={m.erro ? "text-destructive" : "text-warning-fg"}>
              {m.texto}
            </li>
          ))}
        </ul>
      )}

      {itens.length > 0 && (
        <div className="bg-card sticky top-14 z-10 flex flex-wrap items-end gap-3 rounded-xl border p-3 shadow-sm">
          <div className="text-sm">
            <span className="font-medium">{itens.length} comprovante{itens.length > 1 ? "s" : ""}</span>
            <span className="text-muted-foreground">
              {" "}
              · {prontos.length} marcado{prontos.length === 1 ? "" : "s"} para confirmar
              {feitos ? ` · ${feitos} vinculado${feitos > 1 ? "s" : ""}` : ""}
            </span>
          </div>
          <span className="flex-1" />
          {precisaConta && (
            <label className="grid min-w-64 gap-1 text-xs">
              Conta de onde o dinheiro saiu (para as ordens a pagar)
              <select value={conta} onChange={(e) => setConta(e.target.value)} className={SELECT}>
                <option value="">Escolha a conta de débito…</option>
                {debitos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button
            onClick={() => confirmar(prontos)}
            disabled={confirmando || prontos.length === 0 || (precisaConta && !conta)}
          >
            {confirmando ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            Confirmar marcados ({prontos.length})
          </Button>
        </div>
      )}

      <div className="grid gap-3">
        {itens.map((item) => {
          const ordemId = escolha[item.chave] ?? null
          const ordem = ordemId ? ordens[ordemId] : null
          const resultado = resultados[item.chave]
          const sugestao: Sugestao | undefined = item.sugestoes.find((s) => s.ordemId === ordemId)
          const opcoes = [...new Set([...item.sugestoes.map((s) => s.ordemId), ...(extras[item.chave] ?? [])])]
          const repetida = ordemId && repetidas.has(ordemId) && !resultado?.ok
          const aPagar = ordem && ordem.situacao !== "Paga"
          const aj = ajustes[item.chave] ?? {
            data: item.lido.data ?? hoje,
            valor: item.lido.valor?.toFixed(2).replace(".", ",") ?? "",
          }
          const url = arquivosLocais[item.caminho]
          const pagina = item.lido.paginas[0]
          return (
            <div
              key={item.chave}
              className={cn(
                "bg-card grid gap-3 rounded-xl border p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]",
                resultado?.ok && "border-success/50 bg-success/5"
              )}
            >
              <div className="flex min-w-0 gap-3">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  aria-label="Marcar para confirmar"
                  disabled={!ordemId || resultado?.ok}
                  checked={marcados.has(item.chave) && !!ordemId && !resultado?.ok}
                  onChange={() =>
                    setMarcados((m) => {
                      const s = new Set(m)
                      if (s.has(item.chave)) s.delete(item.chave)
                      else s.add(item.chave)
                      return s
                    })
                  }
                />
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {item.lido.favorecido ?? "Favorecido não lido"}
                    {item.lido.tipo && <span className="text-muted-foreground font-normal"> · {item.lido.tipo}</span>}
                  </p>
                  <p className="tabular-nums">
                    {item.lido.valor !== null ? formatarMoeda(item.lido.valor) : "valor não lido"} ·{" "}
                    {item.lido.data ? formatarData(item.lido.data) : "data não lida"}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {[item.lido.documento, item.lido.chavePix && `Pix ${item.lido.chavePix}`].filter(Boolean).join(" · ")}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {url ? (
                      <a href={pagina ? `${url}#page=${pagina}` : url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                        {item.nomeArquivo}
                        <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      item.nomeArquivo
                    )}
                    {item.totalPaginas > 1 && item.lido.paginas.length > 0 ? ` · pág. ${item.lido.paginas.join(", ")}` : ""}
                  </p>
                </div>
              </div>

              <div className="grid min-w-0 gap-2">
                {resultado?.ok ? (
                  <p className="text-success-fg flex items-center gap-2 text-sm">
                    <CheckCircle2 className="size-4" />
                    {resultado.pagou ? "Ordem paga com este comprovante: " : "Comprovante anexado à ordem "}
                    {ordem && (
                      <Link href={`/painel/financeiro/ordens/${ordem.id}`} className="font-mono underline">
                        {ordem.codigo}
                      </Link>
                    )}
                  </p>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <select
                        value={ordemId ?? ""}
                        onChange={(e) => {
                          const v = e.target.value || null
                          setEscolha((x) => ({ ...x, [item.chave]: v }))
                          setMarcados((m) => {
                            const s = new Set(m)
                            if (v) s.add(item.chave)
                            else s.delete(item.chave)
                            return s
                          })
                        }}
                        className={SELECT}
                        aria-label="Ordem"
                      >
                        <option value="">
                          {opcoes.length ? "— nenhuma: não vincular —" : "Nenhuma ordem parecida — busque pelo código"}
                        </option>
                        {opcoes.map((id) => {
                          const o = ordens[id]
                          const s = item.sugestoes.find((x) => x.ordemId === id)
                          if (!o) return null
                          return (
                            <option key={id} value={id}>
                              {rotuloOrdem(o)}
                              {s ? ` (${confianca(s.pontos).rotulo})` : " (busca manual)"}
                            </option>
                          )
                        })}
                      </select>
                      <BuscaCodigo onBuscar={(c) => buscar(item.chave, c)} />
                    </div>
                    {sugestao && (
                      <p className="text-xs">
                        <span className={cn("font-medium", confianca(sugestao.pontos).classe)}>
                          Confiança {confianca(sugestao.pontos).rotulo}
                        </span>
                        <span className="text-muted-foreground"> · {sugestao.motivos.join(", ") || "poucos sinais"}</span>
                      </p>
                    )}
                    {repetida && (
                      <p className="text-destructive text-xs">Esta ordem foi escolhida para outro comprovante também.</p>
                    )}
                    {ordem &&
                      (aPagar ? (
                        <div className="flex flex-wrap items-end gap-2 text-xs">
                          <Badge variant="warning">Fica Paga</Badge>
                          <label className="grid gap-1">
                            Data do pagamento
                            <Input
                              type="date"
                              value={aj.data}
                              onChange={(e) => setAjustes((x) => ({ ...x, [item.chave]: { ...aj, data: e.target.value } }))}
                              className="h-8 w-40"
                            />
                          </label>
                          <label className="grid gap-1">
                            Valor pago
                            <Input
                              inputMode="decimal"
                              value={aj.valor}
                              onChange={(e) => setAjustes((x) => ({ ...x, [item.chave]: { ...aj, valor: e.target.value } }))}
                              placeholder={ordem.valor?.toFixed(2).replace(".", ",") ?? ""}
                              className="h-8 w-32"
                            />
                          </label>
                          <span className="text-muted-foreground pb-2">
                            cobrado {formatarMoeda(ordem.valor)}
                            {ordem.vencimento ? `, vence ${formatarData(ordem.vencimento)}` : ""}
                          </span>
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-xs">
                          Já paga em {formatarData(ordem.dataPagamento)} — só ganha o comprovante.
                        </p>
                      ))}
                    <div className="flex items-center gap-2">
                      {resultado?.erro && (
                        <p className="text-destructive flex items-center gap-1 text-xs">
                          <XCircle className="size-3.5 shrink-0" />
                          {resultado.erro}
                        </p>
                      )}
                      <span className="flex-1" />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={confirmando || !ordemId || !!repetida || (!!aPagar && !conta)}
                        title={aPagar && !conta ? "Escolha a conta de débito no alto da página" : undefined}
                        onClick={() => confirmar([item])}
                      >
                        <CheckCircle2 />
                        Confirmar este
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BuscaCodigo({ onBuscar }: { onBuscar: (codigo: string) => Promise<void> }) {
  const [aberto, setAberto] = useState(false)
  const [codigo, setCodigo] = useState("")
  const [buscando, setBuscando] = useState(false)
  if (!aberto) {
    return (
      <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => setAberto(true)} title="Buscar outra ordem pelo código">
        <Search />
      </Button>
    )
  }
  return (
    <form
      className="flex gap-1"
      onSubmit={async (e) => {
        e.preventDefault()
        setBuscando(true)
        await onBuscar(codigo)
        setBuscando(false)
      }}
    >
      <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código da ordem" className="h-9 w-48 font-mono text-xs" autoFocus />
      <Button type="submit" size="sm" variant="secondary" className="h-9" disabled={buscando}>
        {buscando ? <Loader2 className="animate-spin" /> : "Buscar"}
      </Button>
    </form>
  )
}
