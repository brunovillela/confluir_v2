"use client"

import { Fragment, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, FileSearch, Loader2, RotateCcw, Trash2 } from "lucide-react"

import { Trabalhando } from "@/components/trabalhando"
import { useLeituraEmLotes } from "@/hooks/use-leitura-em-lotes"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { confirmar } from "@/components/ui/confirmacao"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { alertasDaLeitura, type LeituraContracheque } from "@/lib/contracheque-leitura"
import { cn } from "@/lib/utils"

import {
  aplicarItensCCAction,
  associarFuncionarioCCAction,
  descartarItemCCAction,
  lerImportacaoCCAction,
} from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-8 w-full max-w-64 rounded-md border px-2 text-xs shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type ItemTelaCC = {
  id: string
  paginas: number[]
  nomeLido: string | null
  cpfLido: string | null
  funcionarioId: string | null
  funcionarioNome: string | null
  situacao: "pendente" | "lido" | "erro" | "aplicado" | "descartado"
  erro: string | null
  leitura: LeituraContracheque | null
  bloqueio: string | null
  /** Link assinado do PDF só com as páginas desta pessoa. */
  urlPdf: string | null
}

const SITUACAO: Record<ItemTelaCC["situacao"], { rotulo: string; classe: string }> = {
  pendente: { rotulo: "A ler", classe: "text-muted-foreground" },
  lido: { rotulo: "Lido", classe: "border-info/40 text-info-fg" },
  erro: { rotulo: "Erro na leitura", classe: "border-destructive/40 text-destructive" },
  aplicado: { rotulo: "Aplicado", classe: "border-success/40 text-success-fg" },
  descartado: { rotulo: "Descartado", classe: "text-muted-foreground" },
}

const moeda = (v: number | null | undefined) =>
  v === null || v === undefined ? null : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const mesAno = (c: string | null | undefined) => (c ? c.split("-").reverse().join("/") : null)

/**
 * Conferência da folha importada: lê os pendentes com a IA sozinha ao abrir
 * (em lotes, com o painel de andamento), mostra cada funcionário com os totais
 * lidos e aplica os marcados à remessa — bloqueados ao funcionário.
 */
export function ConferenciaCC({
  remessaId,
  importacaoId,
  itens,
  funcionarios,
  geraOrdem,
}: {
  remessaId: string
  importacaoId: string
  itens: ItemTelaCC[]
  funcionarios: { usuarioId: string; nome: string }[]
  geraOrdem: boolean
}) {
  const router = useRouter()
  const pendentes = itens.filter((i) => i.situacao === "pendente").length

  // ── Leitura pela IA (um lote por chamada, com novas tentativas) ──
  const { lendo, andamento, parou, ler } = useLeituraEmLotes(() => lerImportacaoCCAction(remessaId, importacaoId), pendentes)

  // ── Seleção e ações ──
  const aplicaveis = itens.filter((i) => !i.bloqueio).map((i) => i.id)
  // Com alerta (líquido que não fecha), começa desmarcado: aplica quem conferiu e marcou.
  const semAlerta = new Set(itens.filter((i) => !i.leitura || alertasDaLeitura(i.leitura).length === 0).map((i) => i.id))
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(aplicaveis.filter((id) => semAlerta.has(id))))
  // Item que fica aplicável depois (lido ou com funcionário escolhido) entra marcado, se não tiver alerta.
  const chave = aplicaveis.join(",")
  const [chaveVista, setChaveVista] = useState(chave)
  if (chave !== chaveVista) {
    setChaveVista(chave)
    setMarcados(
      (m) =>
        new Set([
          ...[...m].filter((id) => aplicaveis.includes(id)),
          ...aplicaveis.filter((id) => !chaveVista.includes(id) && semAlerta.has(id)),
        ])
    )
  }
  const selecionados = [...marcados].filter((id) => aplicaveis.includes(id))
  const alternar = (id: string) =>
    setMarcados((m) => {
      const n = new Set(m)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const [ocupado, iniciarTransicao] = useTransition()
  const [tarefa, setTarefa] = useState<{ titulo: string; detalhe?: string } | null>(null)
  const [resultado, setResultado] = useState<{ ok?: string; erro?: string; pulados?: string[] } | null>(null)
  const iniciar = (t: { titulo: string; detalhe?: string }, acao: () => Promise<void>) => {
    setTarefa(t)
    iniciarTransicao(async () => {
      try {
        await acao()
      } finally {
        setTarefa(null)
      }
    })
  }

  const totalSelecionado = itens
    .filter((i) => selecionados.includes(i.id))
    .reduce((s, i) => s + (i.leitura?.valorLiquido ?? 0), 0)

  // A confirmação vem antes da transição (dentro dela, o diálogo só apareceria no fim).
  const aplicar = async () => {
    const n = selecionados.length
    const ok = await confirmar({
      titulo: `Aplicar ${n} contracheque(s) à remessa?`,
      descricao: `Cria o contracheque de cada um com o PDF dele e o valor líquido lido (total: ${moeda(totalSelecionado)}).${
        geraOrdem ? " Cada um gera a ordem de pagamento com o líquido, como no registro manual." : ""
      } Nada é enviado ao funcionário: os contracheques ficam bloqueados até você liberar na remessa.`,
      confirmar: "Aplicar",
    })
    if (!ok) return
    iniciar(
      {
        titulo: `Aplicando ${n} contracheque(s) à remessa…`,
        detalhe: geraOrdem ? "Gravando os contracheques e gerando as ordens de pagamento." : "Gravando os contracheques.",
      },
      async () => {
        const r = await aplicarItensCCAction(remessaId, importacaoId, selecionados)
        setResultado(
          r.erro
            ? { erro: r.erro }
            : {
                ok:
                  `${r.aplicados} contracheque(s) aplicado(s) à remessa, bloqueado(s) ao funcionário — libere na remessa depois de conferir.` +
                  (r.ordens ? ` ${r.ordens} ordem(ns) de pagamento gerada(s).` : "") +
                  (r.semDadosBancarios.length
                    ? ` Sem conta nem Pix cadastrados (complete na ficha antes do pagamento): ${r.semDadosBancarios.join(", ")}.`
                    : ""),
                pulados: r.pulados,
              }
        )
        router.refresh()
      }
    )
  }

  return (
    <div className="grid gap-3">
      {lendo ? (
        <Trabalhando
          titulo={`Lendo os contracheques com a IA — ${andamento?.feitos ?? 0} de ${andamento?.total ?? pendentes} funcionário(s)`}
          detalhe="A IA lê até 4 por vez; cada lote leva cerca de um minuto. As linhas se preenchem conforme a leitura avança."
          progresso={andamento?.total ? (andamento.feitos / andamento.total) * 100 : 0}
        />
      ) : (
        pendentes > 0 && (
          <Alert className="border-info/40">
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <FileSearch className="size-4" />
              <span>{parou ?? `${pendentes} contracheque(s) a ler.`}</span>
              <Button size="sm" variant="outline" onClick={ler}>
                Ler agora
              </Button>
            </AlertDescription>
          </Alert>
        )
      )}
      {tarefa && <Trabalhando titulo={tarefa.titulo} detalhe={tarefa.detalhe} />}
      {resultado?.erro && (
        <Alert variant="destructive">
          <AlertDescription>{resultado.erro}</AlertDescription>
        </Alert>
      )}
      {resultado?.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            {resultado.ok}
            {resultado.pulados && resultado.pulados.length > 0 && (
              <ul className="text-muted-foreground mt-1 list-disc pl-5 text-xs">
                {resultado.pulados.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {selecionados.length} de {aplicaveis.length} pronto(s) para aplicar marcado(s)
          {selecionados.length > 0 && ` · ${moeda(totalSelecionado)} líquido`}
        </span>
        <Button size="sm" onClick={aplicar} disabled={ocupado || lendo || selecionados.length === 0}>
          {ocupado && <Loader2 className="animate-spin" />}
          Aplicar à remessa ({selecionados.length})
        </Button>
      </div>

      <div className={cn("overflow-x-auto rounded-lg border transition-opacity", ocupado && "pointer-events-none opacity-60")} aria-busy={ocupado}>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-8" />
              <TableHead>Pág.</TableHead>
              <TableHead>Funcionário</TableHead>
              <TableHead>Competência</TableHead>
              <TableHead className="text-right">Proventos</TableHead>
              <TableHead className="text-right">Descontos</TableHead>
              <TableHead className="text-right">Líquido</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((i) => {
              const l = i.leitura
              const podeEditar = i.situacao !== "aplicado"
              const alertas = l ? alertasDaLeitura(l) : []
              // Linha ainda na fila da IA: barras pulsando em vez de traços.
              const sendoLido = lendo && i.situacao === "pendente"
              const vazio = sendoLido ? <Skeleton className="ml-auto h-3 w-14" /> : "—"
              return (
                <Fragment key={i.id}>
                  <TableRow className={cn(i.situacao === "descartado" && "opacity-60")}>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label="Aplicar este contracheque"
                        checked={!i.bloqueio && marcados.has(i.id)}
                        disabled={Boolean(i.bloqueio) || ocupado}
                        onChange={() => alternar(i.id)}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{i.paginas.join(", ")}</TableCell>
                    <TableCell className="min-w-56">
                      {podeEditar ? (
                        <select
                          aria-label="Funcionário do cadastro"
                          className={SELECT}
                          value={i.funcionarioId ?? ""}
                          disabled={ocupado}
                          onChange={(e) => {
                            const valor = e.target.value
                            iniciar({ titulo: "Associando o funcionário…" }, async () => {
                              await associarFuncionarioCCAction(remessaId, importacaoId, i.id, valor)
                              router.refresh()
                            })
                          }}
                        >
                          <option value="">— escolha o funcionário —</option>
                          {funcionarios.map((f) => (
                            <option key={f.usuarioId} value={f.usuarioId}>
                              {f.nome}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-medium">{i.funcionarioNome}</span>
                      )}
                      {!i.funcionarioId && (
                        <span className="text-warning-fg block text-xs">
                          Não achado no cadastro{i.nomeLido ? `: ${i.nomeLido}` : ""}
                          {i.cpfLido ? ` (CPF ${i.cpfLido.replace(/^(\d{3})\d{6}(\d{2})$/, "$1.***.***-$2")})` : ""}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{mesAno(l?.competencia) ?? (sendoLido ? <Skeleton className="h-3 w-14" /> : "—")}</TableCell>
                    <TableCell className="text-right tabular-nums">{moeda(l?.totalProventos) ?? vazio}</TableCell>
                    <TableCell className="text-right tabular-nums">{moeda(l?.totalDescontos) ?? vazio}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{moeda(l?.valorLiquido) ?? vazio}</TableCell>
                    <TableCell>
                      {sendoLido ? (
                        <Badge variant="outline" className="border-info/40 text-info-fg gap-1">
                          <Loader2 className="size-3 animate-spin" />
                          Lendo…
                        </Badge>
                      ) : (
                        <Badge variant="outline" className={SITUACAO[i.situacao].classe}>
                          {SITUACAO[i.situacao].rotulo}
                        </Badge>
                      )}
                      {i.bloqueio && i.situacao === "lido" && <span className="text-warning-fg block text-xs">{i.bloqueio}</span>}
                      {i.erro && <span className="text-destructive block text-xs">{i.erro}</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {i.urlPdf && (
                          <Button variant="ghost" size="sm" className="h-7 px-2" asChild>
                            <a href={i.urlPdf} target="_blank" rel="noreferrer">
                              <ExternalLink />
                              PDF
                            </a>
                          </Button>
                        )}
                        {podeEditar && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn("h-7 px-2", i.situacao !== "descartado" && "text-destructive hover:text-destructive")}
                            disabled={ocupado}
                            aria-label={i.situacao === "descartado" ? "Restaurar" : "Descartar"}
                            onClick={() =>
                              iniciar({ titulo: i.situacao === "descartado" ? "Restaurando…" : "Descartando…" }, async () => {
                                await descartarItemCCAction(remessaId, importacaoId, i.id, i.situacao === "descartado")
                                router.refresh()
                              })
                            }
                          >
                            {i.situacao === "descartado" ? <RotateCcw /> : <Trash2 />}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {alertas.length > 0 && i.situacao !== "descartado" && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell />
                      <TableCell colSpan={8} className="pt-0">
                        <ul className="text-warning-fg list-disc pl-4 text-xs">
                          {alertas.map((t) => (
                            <li key={t}>{t}</li>
                          ))}
                        </ul>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
