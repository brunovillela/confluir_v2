"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import { Check, Loader2, RotateCw, Send, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import type { OpositorLinha } from "@/lib/db/oposicao"
import { formatarDataHora } from "@/lib/formato"
import { mascaraCpf } from "@/lib/mascaras"
import {
  DECISOES_JURIDICAS,
  MEIOS_ENVIO,
  type RegrasOposicao,
  ROTULO_SITUACAO_OPOSITOR,
  type SituacaoOpositor,
} from "@/lib/oposicao-constantes"

import {
  avaliarEmLoteAction,
  encerrarSemCartaAction,
  registrarEnvioEmpregadorAction,
  reverificarAssinaturaAction,
  salvarRegrasEntidadeAction,
  type EstadoLote,
} from "./actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** "123.***.***-01": a lista não expõe o CPF inteiro; a página da oposição, sim. */
function cpfParcial(cpf: string): string {
  const m = mascaraCpf(cpf)
  return /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(m) ? `${m.slice(0, 3)}.***.***-${m.slice(-2)}` : m
}

const VARIANTE: Record<SituacaoOpositor, "secondary" | "outline"> = {
  aprovada: "secondary",
  reprovada: "outline",
  nao_avaliada: "outline",
  desistente: "outline",
  aguardando_documento: "outline",
}

/**
 * Lista da campanha com seleção e avaliação em lote (onda 2, C6). Marca-se
 * na página ou escolhe-se "todas as não avaliadas deste filtro" — o filtro
 * vai nos campos ocultos, o servidor relê tudo e só mexe nas não avaliadas.
 */
export function ListaOpositores({
  campanhaId,
  linhas,
  total,
  filtros,
  podeAvaliar = true,
}: {
  campanhaId: string
  linhas: OpositorLinha[]
  total: number
  filtros: { situacao: string; busca: string; fonte: string }
  /** Sem a permissão de avaliar (segregação), a lista só mostra. */
  podeAvaliar?: boolean
}) {
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [estado, acao, pendente] = useActionState<EstadoLote, FormData>(avaliarEmLoteAction, {})
  const [alcance, setAlcance] = useState<"marcadas" | "filtradas">("marcadas")
  const avaliaveis = podeAvaliar ? linhas.filter((l) => l.situacao === "nao_avaliada") : []
  const todasMarcadas = avaliaveis.length > 0 && avaliaveis.every((l) => marcadas.has(l.id))
  const alterna = (id: string) =>
    setMarcadas((m) => {
      const n = new Set(m)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const aqui = `/painel/representacao/oposicao/${campanhaId}`

  return (
    <div className="grid gap-4">
      {podeAvaliar && (
      <form
        action={acao}
        onSubmit={(e) => {
          const botao = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
          const aprovar = botao?.value === "aprovar"
          const quantas =
            alcance === "marcadas"
              ? `${marcadas.size} oposição(ões) marcada(s)`
              : "TODAS as oposições não avaliadas deste filtro"
          const texto = aprovar
            ? `Aprovar ${quantas}? As que tiverem pendência no checklist ficam de fora. Cada trabalhador recebe o aviso.`
            : `Reprovar ${quantas} com o motivo informado? Cada trabalhador recebe o aviso.`
          if (!window.confirm(texto)) e.preventDefault()
        }}
        className="bg-muted/40 grid gap-3 rounded-md border p-3"
      >
        <input type="hidden" name="campanha_id" value={campanhaId} />
        <input type="hidden" name="alcance" value={alcance} />
        <input type="hidden" name="situacao" value={filtros.situacao} />
        <input type="hidden" name="busca" value={filtros.busca} />
        <input type="hidden" name="fonte" value={filtros.fonte} />
        {alcance === "marcadas" && [...marcadas].map((id) => <input key={id} type="hidden" name="id" value={id} />)}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="font-medium">Avaliar em lote:</span>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="alcance_ui"
              checked={alcance === "marcadas"}
              onChange={() => setAlcance("marcadas")}
              className="size-4"
            />
            marcadas nesta página ({marcadas.size})
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="alcance_ui"
              checked={alcance === "filtradas"}
              onChange={() => setAlcance("filtradas")}
              className="size-4"
            />
            todas as não avaliadas deste filtro
          </label>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lote-motivo" className="text-xs">
            Motivo (obrigatório para reprovar; o mesmo para todas)
          </Label>
          <Textarea id="lote-motivo" name="motivo" rows={2} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            name="decisao"
            value="aprovar"
            size="sm"
            disabled={pendente || (alcance === "marcadas" && marcadas.size === 0)}
          >
            {pendente ? <Loader2 className="animate-spin" /> : <Check />}
            Aprovar
          </Button>
          <Button
            type="submit"
            name="decisao"
            value="reprovar"
            size="sm"
            variant="destructive"
            disabled={pendente || (alcance === "marcadas" && marcadas.size === 0)}
          >
            <X />
            Reprovar
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Só as “não avaliadas” são mexidas. Para aprovar, cada uma passa pelo checklist da página da oposição (prazo,
          CPF repetido, fonte, carta e assinatura): a que tiver pendência fica de fora para ser vista uma a uma. Os
          avisos aos trabalhadores saem aos poucos, nos minutos seguintes.
        </p>
        {estado.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estado.erro}</AlertDescription>
          </Alert>
        )}
        {estado.ok && (
          <Alert className="border-success/40 text-success-fg">
            <AlertDescription>{estado.ok}</AlertDescription>
          </Alert>
        )}
        {estado.puladas && estado.puladas.length > 0 && (
          <details className="text-sm" open={estado.puladas.length <= 20}>
            <summary className="cursor-pointer font-medium">
              Ficaram de fora por pendência ({estado.puladas.length.toLocaleString("pt-BR")})
            </summary>
            <ul className="mt-2 grid max-h-72 gap-1 overflow-y-auto">
              {estado.puladas.map((p) => (
                <li key={p.id}>
                  <Link href={`${aqui}/opositor/${p.id}`} className="text-primary hover:underline">
                    {p.nome ?? "(sem nome)"}
                  </Link>{" "}
                  <span className="text-muted-foreground">— {p.motivo}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </form>
      )}

      {linhas.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">Nenhum opositor com esses filtros.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  aria-label="Marcar as não avaliadas desta página"
                  checked={todasMarcadas}
                  disabled={avaliaveis.length === 0}
                  onChange={() =>
                    setMarcadas((m) => {
                      const n = new Set(m)
                      for (const l of avaliaveis) {
                        if (todasMarcadas) n.delete(l.id)
                        else n.add(l.id)
                      }
                      return n
                    })
                  }
                  className="size-4"
                />
              </TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Protocolo</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Fonte</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Registrada</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((o) => (
              <TableRow key={o.id} data-state={marcadas.has(o.id) ? "selected" : undefined}>
                <TableCell>
                  {podeAvaliar && o.situacao === "nao_avaliada" && (
                    <input
                      type="checkbox"
                      aria-label={`Marcar ${o.nome ?? "oposição"}`}
                      checked={marcadas.has(o.id)}
                      onChange={() => alterna(o.id)}
                      className="size-4"
                    />
                  )}
                </TableCell>
                <TableCell className="max-w-64">
                  <Link href={`${aqui}/opositor/${o.id}`} className="text-primary line-clamp-1 hover:underline">
                    {o.nome ?? "(sem nome)"}
                  </Link>
                </TableCell>
                <TableCell className="tabular-nums">{o.protocolo ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{o.cpf ? cpfParcial(o.cpf) : "—"}</TableCell>
                <TableCell className="max-w-40">
                  <span className="line-clamp-1">{o.empregadorNome ?? "—"}</span>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="whitespace-nowrap">
                    {o.ehFiliado ? "Filiado" : "Não filiado"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap text-xs tabular-nums">
                  {o.confirmado_em ? formatarDataHora(o.confirmado_em) : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={VARIANTE[o.situacao]} className="whitespace-nowrap">
                    {ROTULO_SITUACAO_OPOSITOR[o.situacao]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p className="text-muted-foreground text-xs">
        {total.toLocaleString("pt-BR")} no filtro. A caixa de marcar aparece só nas não avaliadas.
      </p>
    </div>
  )
}

/** Encerrar, depois do prazo, quem não mandou a carta (A12). */
export function EncerrarSemCarta({
  campanhaId,
  quantidade,
}: {
  campanhaId: string
  quantidade: number
}) {
  const [estado, acao, pendente] = useActionState(encerrarSemCartaAction, {})
  const envio2 = useEnvioFormulario(acao, estado, {
    antes: (e) => {
        if (
          !window.confirm(
            `Encerrar ${quantidade.toLocaleString("pt-BR")} oposição(ões) como “carta não enviada”? Elas passam a reprovadas, com esse motivo, e cada trabalhador recebe o aviso.`
          )
        ) {
          e.preventDefault()
        }
      },
  })
  return (
    <form
      action={acao} {...envio2}
      className="grid gap-2"
    >
      <input type="hidden" name="campanha_id" value={campanhaId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" variant="outline" size="sm" disabled={pendente || quantidade === 0}>
          {pendente && <Loader2 className="animate-spin" />}
          Encerrar as {quantidade.toLocaleString("pt-BR")} sem carta
        </Button>
      </div>
    </form>
  )
}

/** Registrar o envio da relação a um empregador (C7). */
export function RegistrarEnvio({
  campanhaId,
  empresaId,
  quantidade,
}: {
  campanhaId: string
  empresaId: string | null
  quantidade: number
}) {
  const [estado, acao, pendente] = useActionState(registrarEnvioEmpregadorAction, {})
  const envio3 = useEnvioFormulario(acao, estado)
  const [aberto, setAberto] = useState(false)
  if (!aberto) {
    return (
      <div>
        <Button type="button" size="sm" variant="outline" onClick={() => setAberto(true)} disabled={quantidade === 0}>
          <Send />
          Registrar envio
        </Button>
      </div>
    )
  }
  return (
    <form action={acao} {...envio3} className="bg-muted/40 grid gap-3 rounded-md border p-3">
      <input type="hidden" name="campanha_id" value={campanhaId} />
      <input type="hidden" name="empresa_id" value={empresaId ?? "sem"} />
      <p className="text-sm">
        Registra que a relação com as <strong>{quantidade.toLocaleString("pt-BR")}</strong> aprovadas de agora foi
        enviada. Quem entrar depois aparece como “nova” para o próximo envio.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`meio-${empresaId ?? "sem"}`}>Meio</Label>
          <select id={`meio-${empresaId ?? "sem"}`} name="meio" required defaultValue="" className={SELECT}>
            <option value="" disabled>
              Escolha…
            </option>
            {MEIOS_ENVIO.map((m) => (
              <option key={m.chave} value={m.chave}>
                {m.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`ref-${empresaId ?? "sem"}`}>Referência</Label>
          <Input id={`ref-${empresaId ?? "sem"}`} name="referencia" placeholder="Nº do ofício, protocolo do RH…" />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`obs-${empresaId ?? "sem"}`}>Observação</Label>
        <Textarea id={`obs-${empresaId ?? "sem"}`} name="observacao" rows={2} />
      </div>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        {!estado.ok && (
          <Button type="submit" size="sm" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            Registrar
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)}>
          {estado.ok ? "Fechar" : "Cancelar"}
        </Button>
      </div>
    </form>
  )
}

/** "Reverificar assinatura" da carta (onda 3): baixa o PDF e passa pelo validador de novo. */
export function ReverificarAssinatura({ opositorId, campanhaId }: { opositorId: string; campanhaId: string }) {
  const [estado, acao, pendente] = useActionState(reverificarAssinaturaAction, {})
  const envio4 = useEnvioFormulario(acao, estado)
  return (
    <form action={acao} {...envio4} className="grid gap-2">
      <input type="hidden" name="opositor_id" value={opositorId} />
      <input type="hidden" name="campanha_id" value={campanhaId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" variant="ghost" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <RotateCw />}
          Reverificar assinatura
        </Button>
      </div>
    </form>
  )
}

/**
 * Decisões jurídicas padrão da entidade (28/10/2026). Cada decisão em rádio,
 * com o efeito de cada opção dito na tela; deixar em branco é possível, mas
 * aí nenhuma campanha que siga o padrão abre.
 */
export function RegrasEntidadeForm({ regras }: { regras: RegrasOposicao }) {
  const [estado, acao, pendente] = useActionState(salvarRegrasEntidadeAction, {})
  const envio = useEnvioFormulario(acao, estado)
  return (
    <form action={acao} {...envio} className="grid gap-5">
      {DECISOES_JURIDICAS.map((d) => (
        <fieldset key={d.chave} className="grid gap-2">
          <legend className="text-sm font-medium">{d.rotulo}</legend>
          <p className="text-muted-foreground text-xs">{d.ajuda}</p>
          <div className="grid gap-2">
            {d.opcoes.map((o) => (
              <label key={o.chave} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name={`regra_${d.chave}`}
                  value={o.chave}
                  defaultChecked={regras[d.chave] === o.chave}
                  className="mt-0.5 size-4"
                />
                <span>
                  <span className="font-medium">{o.rotulo}</span>
                  <span className="text-muted-foreground block text-xs">{o.efeito}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Salvar decisões
        </Button>
      </div>
    </form>
  )
}
