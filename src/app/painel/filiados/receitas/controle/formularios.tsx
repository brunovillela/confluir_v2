"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { Ban, CheckCheck, Inbox, Loader2, Mail, MessageCircle, Pencil, Phone, Plus, Save, Send, Trash2, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { type EstadoForm } from "@/lib/contas"
import { linkWhatsapp } from "@/lib/ficha-filiacao"
import { formatarCnpjCpf, formatarData, formatarTelefone } from "@/lib/formato"
import { MEIOS_COMUNICACAO, MEIOS_REPASSE, rotuloCompetencia, type RegraEfetiva, type TipoContribuicao } from "@/lib/repasse"

import {
  cobrarPorEmailAction,
  comunicarDescontoAction,
  desfazerEventoAction,
  registrarEventoAction,
  removerContatoFolhaAction,
  salvarContatoFolhaAction,
  salvarExcecaoAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

function Mensagem({ estado }: { estado: EstadoForm }) {
  if (estado.erro) return <p className="text-destructive text-sm">{estado.erro}</p>
  if (estado.ok) return <p className="text-success-fg text-sm">{estado.ok}</p>
  return null
}

export type ContatoFolhaCliente = {
  id: string
  nome: string
  cargo: string | null
  telefone: string | null
  email: string | null
  observacao: string | null
}

// ── Ações sobre uma competência ─────────────────────────────────────────────

export function AcoesCompetencia({
  empresaId,
  empresaNome,
  tipo,
  competencia,
  situacao,
  valor,
  contatos,
}: {
  empresaId: string
  empresaNome: string
  tipo: TipoContribuicao
  competencia: number
  situacao: string
  valor: number
  contatos: ContatoFolhaCliente[]
}) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(registrarEventoAction, {})
  const envio = useEnvioFormulario(acao, estado)
  const [estadoEmail, acaoEmail, pendenteEmail] = useActionState<EstadoForm, FormData>(cobrarPorEmailAction, {})
  const envioEmail = useEnvioFormulario(acaoEmail, estadoEmail)
  const [aberto, setAberto] = useState<"contato" | "email" | null>(null)
  // Fecha o formulário aberto quando uma ação dá certo (ajuste no render, sem efeito).
  const [vistos, setVistos] = useState([estado, estadoEmail])
  if (vistos[0] !== estado || vistos[1] !== estadoEmail) {
    setVistos([estado, estadoEmail])
    if ((vistos[0] !== estado && estado.ok) || (vistos[1] !== estadoEmail && estadoEmail.ok)) setAberto(null)
  }
  const rot = rotuloCompetencia(competencia)
  const faltaDeposito = situacao === "falta_deposito"
  const comEmail = contatos.filter((c) => c.email)
  const comZap = contatos.find((c) => linkWhatsapp(c.telefone))
  const mensagemZap = encodeURIComponent(
    faltaDeposito
      ? `Olá! Aqui é do sindicato. Recebemos a relação de descontos de ${rot} da ${empresaNome}, mas ainda não identificamos o depósito. Podem nos enviar o comprovante?`
      : `Olá! Aqui é do sindicato. Ainda não recebemos a relação de descontos da contribuição ${tipo.toLowerCase()} de ${rot} da ${empresaNome}. Podem nos enviar?`
  )
  const jaTemRelacao = ["recebida", "paga", "divergente", "falta_deposito", "recebida_fora", "sem_desconto"].includes(situacao)

  return (
    <div className="grid gap-3">
      <form action={acao} {...envio} className="grid gap-3">
        <input type="hidden" name="empresa_id" value={empresaId} />
        <input type="hidden" name="tipo" value={tipo} />
        <input type="hidden" name="competencia" value={competencia} />
        <ErroNoCampo estado={estado} />
        <div className="flex flex-wrap gap-2">
          {!jaTemRelacao && (
            <>
              <Button type="submit" name="evento" value="relacao_recebida" variant="outline" size="sm" disabled={pendente}>
                <Inbox />
                Chegou, falta lançar
              </Button>
              <Button type="submit" name="evento" value="sem_desconto" variant="outline" size="sm" disabled={pendente}>
                <Ban />
                Sem desconto no mês
              </Button>
            </>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setAberto(aberto === "contato" ? null : "contato")}>
            <Phone />
            Registrar contato
          </Button>
          {comEmail.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setAberto(aberto === "email" ? null : "email")}>
              <Mail />
              Cobrar por e-mail
            </Button>
          )}
          {comZap && (
            <Button variant="outline" size="sm" asChild>
              <a href={`${linkWhatsapp(comZap.telefone)}?text=${mensagemZap}`} target="_blank" rel="noreferrer">
                <MessageCircle />
                WhatsApp
              </a>
            </Button>
          )}
        </div>
        {aberto === "contato" && (
          <div className="grid gap-3 rounded-lg border p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ev-tipo">O que foi</Label>
                <select id="ev-tipo" name="evento" defaultValue="cobranca" className={SELECT}>
                  <option value="cobranca">Cobrança</option>
                  <option value="contato">Outro contato</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ev-meio">Meio</Label>
                <select id="ev-meio" name="meio" defaultValue="telefone" className={SELECT}>
                  {MEIOS_REPASSE.map((m) => (
                    <option key={m.valor} value={m.valor}>
                      {m.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ev-data">Data</Label>
                <Input id="ev-data" name="data" type="date" defaultValue={new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ev-obs">O que foi conversado</Label>
              <Textarea id="ev-obs" name="observacao" rows={2} placeholder="Ex.: falei com a Ana do RH, prometeu mandar até sexta." />
            </div>
            <div>
              <Button type="submit" size="sm" disabled={pendente}>
                {pendente ? <Loader2 className="animate-spin" /> : <Save />}
                Registrar
              </Button>
            </div>
          </div>
        )}
        <Mensagem estado={estado} />
      </form>

      {aberto === "email" && (
        <form action={acaoEmail} {...envioEmail} className="grid gap-3 rounded-lg border p-3">
          <input type="hidden" name="empresa_id" value={empresaId} />
          <input type="hidden" name="tipo" value={tipo} />
          <input type="hidden" name="competencia" value={competencia} />
          <input type="hidden" name="valor" value={valor} />
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-sm font-medium">Cobrar</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="falta" value="relacao" defaultChecked={!faltaDeposito} className="accent-primary" />
              A relação de {rot}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="falta" value="deposito" defaultChecked={faltaDeposito} className="accent-primary" />
              O depósito de {rot}
            </label>
          </fieldset>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-sm font-medium">Para</legend>
            {comEmail.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="contato" value={c.id} defaultChecked className="accent-primary size-4" />
                {c.nome} <span className="text-muted-foreground">({c.email})</span>
              </label>
            ))}
          </fieldset>
          <div className="grid gap-1.5">
            <Label htmlFor="cob-msg">Recado a mais (opcional)</Label>
            <Textarea id="cob-msg" name="mensagem" rows={2} />
          </div>
          <p className="text-muted-foreground text-xs">
            O e-mail sai em nome da entidade, com o prazo e a competência; a resposta vai para o e-mail de contato da
            entidade. A cobrança fica registrada na trilha.
          </p>
          <div>
            <Button type="submit" size="sm" disabled={pendenteEmail}>
              {pendenteEmail ? <Loader2 className="animate-spin" /> : <Send />}
              Enviar cobrança
            </Button>
          </div>
          <Mensagem estado={estadoEmail} />
        </form>
      )}
      {aberto !== "email" && estadoEmail.ok && <Mensagem estado={estadoEmail} />}
    </div>
  )
}

export function DesfazerEvento({ id, empresaId }: { id: string; empresaId: string }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(desfazerEventoAction, {})
  return (
    <form action={acao} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="empresa_id" value={empresaId} />
      <Button type="submit" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={pendente} title="Desfazer este registro">
        {pendente ? <Loader2 className="animate-spin" /> : <Undo2 />}
        Desfazer
      </Button>
      {estado.erro && <span className="text-destructive ml-2 text-xs">{estado.erro}</span>}
    </form>
  )
}

// ── Contatos da folha ───────────────────────────────────────────────────────

function FormContato({ empresaId, contato, aoFechar }: { empresaId: string; contato?: ContatoFolhaCliente; aoFechar: () => void }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarContatoFolhaAction, {})
  const envio = useEnvioFormulario(acao, estado)
  useEffect(() => {
    if (estado.ok) aoFechar()
  }, [estado, aoFechar])
  return (
    <form action={acao} {...envio} className="grid gap-2 rounded-lg border p-3">
      <input type="hidden" name="empresa_id" value={empresaId} />
      {contato && <input type="hidden" name="contato_id" value={contato.id} />}
      <div className="grid gap-2 sm:grid-cols-2">
        <Input name="nome" placeholder="Nome" defaultValue={contato?.nome} required />
        <Input name="cargo" placeholder="Cargo (ex.: Analista de folha)" defaultValue={contato?.cargo ?? ""} />
        <Input name="email" type="email" placeholder="E-mail" defaultValue={contato?.email ?? ""} />
        <Input name="telefone" placeholder="Telefone com DDD" defaultValue={contato?.telefone ?? ""} />
      </div>
      <Input name="observacao" placeholder="Observação (opcional)" defaultValue={contato?.observacao ?? ""} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={aoFechar}>
          Fechar
        </Button>
      </div>
      <Mensagem estado={estado} />
    </form>
  )
}

function RemoverContato({ empresaId, contatoId }: { empresaId: string; contatoId: string }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(removerContatoFolhaAction, {})
  return (
    <form
      action={acao}
      onSubmit={(e) => {
        if (!confirm("Remover este contato da folha?")) e.preventDefault()
      }}
    >
      <input type="hidden" name="empresa_id" value={empresaId} />
      <input type="hidden" name="contato_id" value={contatoId} />
      <Button type="submit" variant="ghost" size="icon" className="size-7" disabled={pendente} aria-label="Remover contato">
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

export function ContatosFolha({ empresaId, contatos }: { empresaId: string; contatos: ContatoFolhaCliente[] }) {
  const [editando, setEditando] = useState<string | "novo" | null>(null)
  return (
    <div className="grid gap-2">
      {contatos.length === 0 && editando !== "novo" && (
        <p className="text-muted-foreground text-sm">
          Nenhum contato da folha. Cadastre quem cuida dos descontos no RH: é para ele que vão as cobranças e as
          inclusões e exclusões.
        </p>
      )}
      {contatos.map((c) =>
        editando === c.id ? (
          <FormContato key={c.id} empresaId={empresaId} contato={c} aoFechar={() => setEditando(null)} />
        ) : (
          <div key={c.id} className="flex items-start justify-between gap-2 rounded-lg border p-2.5">
            <div className="min-w-0 text-sm">
              <p className="font-medium">
                {c.nome}
                {c.cargo && <span className="text-muted-foreground font-normal"> · {c.cargo}</span>}
              </p>
              {c.email && (
                <a href={`mailto:${c.email}`} className="text-muted-foreground block truncate text-xs hover:underline">
                  {c.email}
                </a>
              )}
              {c.telefone && <p className="text-muted-foreground text-xs">{formatarTelefone(c.telefone)}</p>}
              {c.observacao && <p className="text-muted-foreground text-xs italic">{c.observacao}</p>}
            </div>
            <div className="flex shrink-0">
              <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => setEditando(c.id)} aria-label="Editar contato">
                <Pencil />
              </Button>
              <RemoverContato empresaId={empresaId} contatoId={c.id} />
            </div>
          </div>
        )
      )}
      {editando === "novo" ? (
        <FormContato empresaId={empresaId} aoFechar={() => setEditando(null)} />
      ) : (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditando("novo")}>
            <Plus />
            Contato da folha
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Regra própria da empresa ────────────────────────────────────────────────

export function RegraEmpresaForm({
  empresaId,
  tipo,
  efetiva,
  geral,
}: {
  empresaId: string
  tipo: TipoContribuicao
  efetiva: RegraEfetiva
  geral: RegraEfetiva
}) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarExcecaoAction, {})
  const envio = useEnvioFormulario(acao, estado, { manter: true })
  const inicial = !efetiva.excecao ? "herdar" : efetiva.controla ? "propria" : "nao_desconta"
  const [modo, setModo] = useState(inicial)
  const nomeMes = (m: number) => ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][m - 1]
  const resumoGeral = geral.controla
    ? `relação até dia ${geral.diaEnvio}, depósito até dia ${geral.diaDeposito}${tipo !== "Associativa" && geral.meses ? `, em ${geral.meses.map(nomeMes).join(", ")}` : ""}`
    : "não controlada pela entidade"
  return (
    <form action={acao} {...envio} className="grid gap-3">
      <input type="hidden" name="empresa_id" value={empresaId} />
      <input type="hidden" name="tipo" value={tipo} />
      <ErroNoCampo estado={estado} />
      <div className="grid gap-1.5">
        {[
          { valor: "herdar", rotulo: `Segue a regra geral (${resumoGeral})` },
          { valor: "propria", rotulo: "Tem prazo próprio" },
          { valor: "nao_desconta", rotulo: `Não desconta a contribuição ${tipo.toLowerCase()}` },
        ].map((o) => (
          <label key={o.valor} className="flex items-center gap-2 text-sm">
            <input type="radio" name="modo" value={o.valor} checked={modo === o.valor} onChange={() => setModo(o.valor)} className="accent-primary" />
            {o.rotulo}
          </label>
        ))}
      </div>
      {modo === "propria" && (
        <div className="grid gap-3 sm:grid-cols-3">
          {tipo !== "Associativa" && (
            <div className="grid gap-1.5">
              <Label htmlFor={`m-${tipo}`}>Meses com desconto</Label>
              <Input id={`m-${tipo}`} name="meses" placeholder="como a geral" defaultValue={efetiva.excecao ? (efetiva.meses?.map(nomeMes).join(", ") ?? "") : ""} />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor={`e-${tipo}`}>Relação até o dia</Label>
            <Input id={`e-${tipo}`} name="dia_envio" type="number" min={1} max={31} placeholder={String(geral.diaEnvio)} defaultValue={efetiva.excecao ? efetiva.diaEnvio : ""} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`d-${tipo}`}>Depósito até o dia</Label>
            <Input id={`d-${tipo}`} name="dia_deposito" type="number" min={1} max={31} placeholder={String(geral.diaDeposito)} defaultValue={efetiva.excecao ? efetiva.diaDeposito : ""} />
          </div>
        </div>
      )}
      {modo !== "herdar" && (
        <Input name="observacao" placeholder="Por quê? (ex.: cláusula 12 do ACT 2026/2027)" defaultValue={efetiva.observacao ?? ""} />
      )}
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
      </div>
      <Mensagem estado={estado} />
    </form>
  )
}

// ── Inclusões e exclusões ───────────────────────────────────────────────────

export type ItemDescontoCliente = {
  vinculoId: string
  nome: string
  cpf: string | null
  matricula: string | null
  data: string
  acao: "inclusao" | "exclusao"
}

export function ComunicarDesconto({
  empresaId,
  itens,
  contatos,
}: {
  empresaId: string
  itens: ItemDescontoCliente[]
  contatos: ContatoFolhaCliente[]
}) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(comunicarDescontoAction, {})
  const envio = useEnvioFormulario(acao, estado)
  const chaves = useMemo(() => itens.map((i) => `${i.vinculoId}|${i.acao}`), [itens])
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(chaves))
  const comEmail = contatos.filter((c) => c.email)
  const [modo, setModo] = useState<"email" | "registrar">(comEmail.length ? "email" : "registrar")
  const todos = marcados.size === chaves.length
  const alternar = (k: string) =>
    setMarcados((m) => {
      const n = new Set(m)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  const planilha = `/painel/filiados/receitas/controle/${empresaId}/planilha?itens=${encodeURIComponent([...marcados].join(","))}`

  return (
    <form action={acao} {...envio} className="grid gap-4">
      <input type="hidden" name="empresa_id" value={empresaId} />
      <input type="hidden" name="modo" value={modo} />
      <ErroNoCampo estado={estado} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs">
              <th className="w-8 py-2">
                <input
                  type="checkbox"
                  aria-label="Marcar todos"
                  checked={todos}
                  onChange={() => setMarcados(todos ? new Set() : new Set(chaves))}
                  className="accent-primary size-4"
                />
              </th>
              <th className="py-2 font-medium">Ação</th>
              <th className="py-2 font-medium">Nome</th>
              <th className="py-2 font-medium">CPF</th>
              <th className="py-2 font-medium">Matrícula</th>
              <th className="py-2 font-medium">A partir de</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => {
              const k = `${i.vinculoId}|${i.acao}`
              return (
                <tr key={k} className="border-b last:border-0">
                  <td className="py-2">
                    <input type="checkbox" name="item" value={k} checked={marcados.has(k)} onChange={() => alternar(k)} className="accent-primary size-4" />
                  </td>
                  <td className="py-2">
                    <span className={i.acao === "inclusao" ? "text-success-fg font-medium" : "text-destructive font-medium"}>
                      {i.acao === "inclusao" ? "Incluir" : "Excluir"}
                    </span>
                  </td>
                  <td className="py-2">{i.nome}</td>
                  <td className="py-2 tabular-nums">{i.cpf ? formatarCnpjCpf(i.cpf) : "—"}</td>
                  <td className="py-2">{i.matricula ?? <span className="text-warning-fg">sem matrícula</span>}</td>
                  <td className="py-2 tabular-nums">{formatarData(i.data)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 rounded-lg border p-3">
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={modo === "email"} onChange={() => setModo("email")} disabled={!comEmail.length} className="accent-primary" />
            Enviar por e-mail ao contato da folha
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={modo === "registrar"} onChange={() => setModo("registrar")} className="accent-primary" />
            Já enviei por outro meio: só registrar
          </label>
        </div>
        {modo === "email" ? (
          <>
            <fieldset className="grid gap-1.5">
              <legend className="mb-1 text-sm font-medium">Para</legend>
              {comEmail.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="contato" value={c.id} defaultChecked className="accent-primary size-4" />
                  {c.nome} <span className="text-muted-foreground">({c.email})</span>
                </label>
              ))}
            </fieldset>
            <Textarea name="mensagem" rows={2} placeholder="Recado a mais (opcional)" />
            <p className="text-muted-foreground text-xs">
              O e-mail leva a lista no corpo e em planilha anexa, e pede confirmação de recebimento.
            </p>
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="com-meio">Por onde</Label>
              <select id="com-meio" name="meio" defaultValue="oficio" className={SELECT}>
                {MEIOS_COMUNICACAO.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="com-dest">Para quem</Label>
              <Input id="com-dest" name="destinatario" placeholder="Nome ou e-mail" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="com-ref">Referência</Label>
              <Input id="com-ref" name="referencia" placeholder="Nº do ofício, protocolo…" />
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={pendente || marcados.size === 0}>
            {pendente ? <Loader2 className="animate-spin" /> : modo === "email" ? <Send /> : <CheckCheck />}
            {modo === "email" ? `Enviar ${marcados.size}` : `Registrar envio de ${marcados.size}`}
          </Button>
          <Button variant="outline" size="sm" asChild disabled={marcados.size === 0}>
            <a href={planilha}>Baixar planilha</a>
          </Button>
        </div>
        <Mensagem estado={estado} />
      </div>
    </form>
  )
}
