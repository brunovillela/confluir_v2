"use client"

import { useActionState, useMemo, useState } from "react"
import { CheckCircle2, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"

import { FiliadoPicker } from "@/components/filiado-picker"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Textarea } from "@/components/ui/textarea"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import {
  AJUSTES,
  ajusteVisivel,
  ROTULO_ORIGEM,
  SECOES,
  type ConfigCongresso,
  type ValorAjuste,
} from "@/lib/congressos/config"
import {
  CATEGORIAS_PAPEL,
  DIREITOS_ROTULO,
  MODELOS,
  resumoDireitos,
  type Direitos,
} from "@/lib/congressos/regras"
import { type EstadoForm } from "@/lib/contas"
import { paraCampoDataHora } from "@/lib/formato"

import {
  gerarLinkAction,
  paginaPublicaAction,
  type EstadoLink,
  aplicarOrdemAction,
  criarCongressoAction,
  importarNatosAction,
  removerDoProgramaAction,
  removerPapelAction,
  removerUnidadeAction,
  salvarCongressoAction,
  salvarConfigAction,
  salvarEixoAction,
  salvarGrupoAction,
  salvarPapelAction,
  salvarParticipanteAction,
  salvarSessaoAction,
  salvarUnidadeAction,
  situacaoParticipanteAction,
} from "./actions"
import { conferirImportacaoAction, gravarImportacaoAction, type EstadoImportacao } from "./importar-actions"

type Acao = (p: EstadoForm, fd: FormData) => Promise<EstadoForm>

function Retorno({ estado }: { estado: EstadoForm }) {
  if (estado.erro) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{estado.erro}</AlertDescription>
      </Alert>
    )
  }
  if (estado.ok) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="size-4" />
        {estado.ok}
      </p>
    )
  }
  return null
}

function Enviar({ pendente, children, variant }: { pendente: boolean; children: React.ReactNode; variant?: "default" | "outline" | "destructive" | "ghost" }) {
  return (
    <Button type="submit" disabled={pendente} variant={variant}>
      {pendente && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  )
}

/** Botão de ação com campos ocultos e, se pedido, confirmação. */
export function BotaoAcao({
  acao,
  campos,
  rotulo,
  confirmar,
  variant = "outline",
  tamanho,
  icone,
}: {
  acao: Acao
  campos: Record<string, string>
  rotulo: string
  confirmar?: string
  variant?: "default" | "outline" | "destructive" | "ghost"
  tamanho?: "sm"
  icone?: React.ReactNode
}) {
  const [estado, formAcao, pendente] = useActionState(acao, {})
  return (
    <form
      action={formAcao}
      onSubmit={confirmar ? (e) => confirmarEnvio(e, confirmar) : undefined}
      className="inline-flex flex-col items-start gap-1"
    >
      {Object.entries(campos).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button type="submit" variant={variant} size={tamanho} disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : icone}
        {rotulo}
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      {estado.ok && <span className="text-xs text-emerald-700 dark:text-emerald-400">{estado.ok}</span>}
    </form>
  )
}

// ── Novo congresso ───────────────────────────────────────────────────────────

export function NovoCongressoForm({
  eventos,
  congressos,
}: {
  eventos: { id: string; titulo: string; inicio: string | null; usado: boolean }[]
  congressos: { id: string; nome: string }[]
}) {
  const [estado, acao, pendente] = useActionState(criarCongressoAction, {})
  const envio = useEnvioFormulario(acao, estado)
  const [partida, setPartida] = useState<"modelo" | "copia">(congressos.length ? "copia" : "modelo")
  const [modelo, setModelo] = useState(MODELOS[0].id)

  return (
    <form action={acao} {...envio} className="grid gap-6">
      <Retorno estado={estado} />
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div className="grid gap-1.5">
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" name="nome" required placeholder="Ex.: Congresso dos Petroleiros do Norte Fluminense" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edicao">Edição</Label>
          <Input id="edicao" name="edicao" type="number" min={1} placeholder="22" />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tema">Tema</Label>
        <Input id="tema" name="tema" placeholder="Opcional" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="modo">A entidade</Label>
          <SelectNativo id="modo" name="modo" defaultValue="promove">
            <option value="promove">Promove o congresso</option>
            <option value="participa">Participa (envia delegação)</option>
          </SelectNativo>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="evento_id">Evento</Label>
          <SelectNativo id="evento_id" name="evento_id" defaultValue="">
            <option value="">Ligar depois</option>
            {eventos.map((e) => (
              <option key={e.id} value={e.id} disabled={e.usado}>
                {e.titulo}
                {e.inicio ? ` — ${new Date(e.inicio).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}
                {e.usado ? " (já tem congresso)" : ""}
              </option>
            ))}
          </SelectNativo>
          <p className="text-muted-foreground text-xs">
            A página, a agenda e as datas vêm do módulo Eventos. Crie o evento lá, se ainda não existir.
          </p>
        </div>
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium">Ponto de partida das regras</legend>
        <input type="hidden" name="partida" value={partida} />
        <div className="flex flex-wrap gap-2">
          {congressos.length > 0 && (
            <Button type="button" variant={partida === "copia" ? "default" : "outline"} onClick={() => setPartida("copia")}>
              Copiar a edição anterior
            </Button>
          )}
          <Button type="button" variant={partida === "modelo" ? "default" : "outline"} onClick={() => setPartida("modelo")}>
            Usar um modelo
          </Button>
        </div>
        {partida === "copia" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="copia_de">Edição a copiar</Label>
            <SelectNativo id="copia_de" name="copia_de" defaultValue={congressos[0]?.id ?? ""}>
              {congressos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </SelectNativo>
            <p className="text-muted-foreground text-xs">
              Copia regras, papéis, bases e eixos. Datas e participantes não são copiados.
            </p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="modelo" value={modelo} />
            {MODELOS.map((m) => (
              <button
                type="button"
                key={m.id}
                onClick={() => setModelo(m.id)}
                aria-pressed={modelo === m.id}
                className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                  modelo === m.id ? "border-primary bg-primary/5" : "hover:bg-muted"
                }`}
              >
                <span className="font-medium">{m.nome}</span>
                <span className="text-muted-foreground mt-1 block text-xs">{m.descricao}</span>
              </button>
            ))}
          </div>
        )}
      </fieldset>

      <div>
        <Enviar pendente={pendente}>Criar congresso</Enviar>
      </div>
    </form>
  )
}

// ── Dados do congresso ───────────────────────────────────────────────────────

export function DadosCongressoForm({
  congresso,
  eventos,
  congressos,
  situacoes,
}: {
  congresso: {
    id: string
    nome: string
    edicao: number | null
    tema: string | null
    modo: string
    situacao: string
    eventoId: string | null
    etapaAnteriorId: string | null
    etapaSeguinteId: string | null
    etapaSeguinteNome: string | null
  }
  eventos: { id: string; titulo: string; usado: boolean }[]
  congressos: { id: string; nome: string }[]
  situacoes: { valor: string; rotulo: string }[]
}) {
  const [estado, acao, pendente] = useActionState(salvarCongressoAction, {})
  const envio = useEnvioFormulario(acao, estado, { manter: true })
  const outros = congressos.filter((c) => c.id !== congresso.id)
  return (
    <form action={acao} {...envio} className="grid gap-4">
      <input type="hidden" name="id" value={congresso.id} />
      <Retorno estado={estado} />
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div className="grid gap-1.5">
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" name="nome" required defaultValue={congresso.nome} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edicao">Edição</Label>
          <Input id="edicao" name="edicao" type="number" min={1} defaultValue={congresso.edicao ?? ""} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tema">Tema</Label>
        <Input id="tema" name="tema" defaultValue={congresso.tema ?? ""} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="modo">A entidade</Label>
          <SelectNativo id="modo" name="modo" defaultValue={congresso.modo}>
            <option value="promove">Promove</option>
            <option value="participa">Participa</option>
          </SelectNativo>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="situacao">Situação</Label>
          <SelectNativo id="situacao" name="situacao" defaultValue={congresso.situacao}>
            {situacoes.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.rotulo}
              </option>
            ))}
          </SelectNativo>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="evento_id">Evento</Label>
          <SelectNativo id="evento_id" name="evento_id" defaultValue={congresso.eventoId ?? ""}>
            <option value="">Nenhum</option>
            {eventos.map((e) => (
              <option key={e.id} value={e.id} disabled={e.usado && e.id !== congresso.eventoId}>
                {e.titulo}
              </option>
            ))}
          </SelectNativo>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="etapa_anterior_id">Etapa anterior</Label>
          <SelectNativo id="etapa_anterior_id" name="etapa_anterior_id" defaultValue={congresso.etapaAnteriorId ?? ""}>
            <option value="">Nenhuma</option>
            {outros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </SelectNativo>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="etapa_seguinte_id">Etapa seguinte no Confluir</Label>
          <SelectNativo id="etapa_seguinte_id" name="etapa_seguinte_id" defaultValue={congresso.etapaSeguinteId ?? ""}>
            <option value="">Nenhuma</option>
            {outros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </SelectNativo>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="etapa_seguinte_nome">Ou etapa seguinte externa</Label>
          <Input id="etapa_seguinte_nome" name="etapa_seguinte_nome" placeholder="Ex.: Plenafup 2027" defaultValue={congresso.etapaSeguinteId ? "" : (congresso.etapaSeguinteNome ?? "")} />
        </div>
      </div>
      <div>
        <Enviar pendente={pendente}>Salvar dados</Enviar>
      </div>
    </form>
  )
}

// ── Configuração ─────────────────────────────────────────────────────────────

function CampoAjuste({
  chave,
  valor,
  aoMudar,
}: {
  chave: string
  valor: ValorAjuste
  aoMudar: (v: ValorAjuste) => void
}) {
  const a = AJUSTES.find((x) => x.chave === chave)!
  const id = `v-${chave}`
  const nome = `v:${chave}`
  if (a.tipo === "booleano") {
    return (
      <input
        id={id}
        name={nome}
        type="checkbox"
        className="accent-primary size-4"
        checked={valor === true}
        onChange={(e) => aoMudar(e.target.checked)}
      />
    )
  }
  if (a.tipo === "escolha") {
    return (
      <SelectNativo id={id} name={nome} value={String(valor ?? "")} onChange={(e) => aoMudar(e.target.value)}>
        {a.opcoes!.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </SelectNativo>
    )
  }
  if (a.tipo === "numero") {
    return (
      <div className="flex items-center gap-2">
        <Input
          id={id}
          name={nome}
          type="number"
          min={a.min}
          max={a.max}
          step="any"
          className="w-28"
          value={valor === null ? "" : String(valor)}
          onChange={(e) => aoMudar(e.target.value === "" ? null : Number(e.target.value))}
        />
        {a.unidade && <span className="text-muted-foreground text-sm">{a.unidade}</span>}
      </div>
    )
  }
  if (a.tipo === "datahora") {
    return (
      <Input
        id={id}
        name={nome}
        type="datetime-local"
        className="w-56"
        value={typeof valor === "string" && valor.includes("T") && valor.length > 16 ? paraCampoDataHora(valor) : String(valor ?? "")}
        onChange={(e) => aoMudar(e.target.value || null)}
      />
    )
  }
  return <Input id={id} name={nome} value={String(valor ?? "")} onChange={(e) => aoMudar(e.target.value)} />
}

export function ConfiguracaoForm({
  congressoId,
  config,
  travado,
  podeEditar,
}: {
  congressoId: string
  config: ConfigCongresso
  travado: boolean
  podeEditar: boolean
}) {
  const [estado, acao, pendente] = useActionState(salvarConfigAction, {})
  const envio = useEnvioFormulario(acao, estado, { manter: true })
  const [valores, setValores] = useState<Record<string, ValorAjuste>>(config.valores)
  const [mostrarTodas, setMostrarTodas] = useState(false)
  const [artigoAberto, setArtigoAberto] = useState<Record<string, boolean>>({})
  const secoes = SECOES.filter((s) => s.aplicada || mostrarTodas)
  const alterado = useMemo(
    () => AJUSTES.some((a) => valores[a.chave] !== config.valores[a.chave]),
    [valores, config.valores]
  )

  return (
    <form action={acao} {...envio} className="grid gap-6">
      <input type="hidden" name="id" value={congressoId} />
      <fieldset disabled={!podeEditar} className="grid gap-6">
        {secoes.map((s) => {
          const ajustes = AJUSTES.filter((a) => a.secao === s.id && ajusteVisivel(a, valores))
          if (!ajustes.length) return null
          return (
            <section key={s.id} className="grid gap-3 rounded-lg border p-4" id={`secao-${s.id}`}>
              <div>
                <h3 className="flex flex-wrap items-center gap-2 font-medium">
                  {s.titulo}
                  {!s.aplicada && <Badge variant="secondary">Registrada; aplicada nas próximas etapas do módulo</Badge>}
                </h3>
                <p className="text-muted-foreground text-xs">{s.descricao}</p>
              </div>
              <div className="grid gap-3">
                {ajustes.map((a) => {
                  const origem = valores[a.chave] !== config.valores[a.chave] ? "comissao" : config.origem[a.chave]
                  const artigo = config.artigos[a.chave]
                  return (
                    <div key={a.chave} className="grid gap-1.5 sm:grid-cols-[minmax(12rem,18rem)_1fr] sm:items-start sm:gap-4">
                      <input type="hidden" name={`p:${a.chave}`} value="1" />
                      <div className="pt-1.5">
                        <Label htmlFor={`v-${a.chave}`} className="leading-snug">
                          {a.rotulo}
                        </Label>
                        <div className="text-muted-foreground mt-0.5 text-xs">
                          {ROTULO_ORIGEM[origem ?? "padrao"]}
                          {artigo && !artigoAberto[a.chave] ? ` · ${artigo}` : ""}
                          {podeEditar && (
                            <>
                              {" · "}
                              <button
                                type="button"
                                className="hover:text-foreground underline-offset-2 hover:underline"
                                onClick={() => setArtigoAberto((x) => ({ ...x, [a.chave]: !x[a.chave] }))}
                              >
                                {artigo ? "editar artigo" : "citar artigo"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="grid gap-1">
                        <CampoAjuste
                          chave={a.chave}
                          valor={valores[a.chave] ?? null}
                          aoMudar={(v) => setValores((x) => ({ ...x, [a.chave]: v }))}
                        />
                        {artigoAberto[a.chave] && (
                          <Input
                            name={`a:${a.chave}`}
                            defaultValue={artigo ?? ""}
                            placeholder="Ex.: Art. 21, parágrafo único"
                            className="max-w-xs"
                          />
                        )}
                        {a.ajuda && <p className="text-muted-foreground text-xs">{a.ajuda}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </fieldset>

      <button
        type="button"
        className="text-primary justify-self-start text-sm underline-offset-4 hover:underline"
        onClick={() => setMostrarTodas((x) => !x)}
      >
        {mostrarTodas
          ? "Mostrar só as regras já aplicadas"
          : "Mostrar também credenciamento, local da decisão, plenária, moções e encerramento"}
      </button>

      {podeEditar && (
        <div className="bg-background sticky bottom-0 z-10 -mx-1 grid gap-3 rounded-t-lg border-t px-1 py-3 shadow-[0_-6px_12px_-8px_rgba(0,0,0,0.25)]">
          <Retorno estado={estado} />
          {travado && (
            <div className="grid gap-1.5">
              <Label htmlFor="deliberacao">Deliberação que autorizou a mudança</Label>
              <Textarea id="deliberacao" name="deliberacao" rows={2} placeholder="Ex.: Plenária de 11/06, aprovada por maioria" />
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid min-w-64 flex-1 gap-1.5">
              <Label htmlFor="motivo">Motivo (opcional)</Label>
              <Input id="motivo" name="motivo" placeholder="Ex.: ajuste ao regimento aprovado pela diretoria" />
            </div>
            <Enviar pendente={pendente}>{alterado ? "Salvar configuração" : "Salvar"}</Enviar>
          </div>
        </div>
      )}
    </form>
  )
}

// ── Papéis ───────────────────────────────────────────────────────────────────

export function PapelForm({
  congressoId,
  papel,
  podeEditar,
}: {
  congressoId: string
  papel?: { id: string; nome: string; categoria: string; cor: string | null; ordem: number; direitos: Direitos; inscricaoPublica: boolean }
  podeEditar: boolean
}) {
  const [estado, acao, pendente] = useActionState(salvarPapelAction, {})
  const envio = useEnvioFormulario(acao, estado, { manter: !!papel })
  const [aberto, setAberto] = useState(false)
  const [direitos, setDireitos] = useState<Direitos | undefined>(papel?.direitos)

  if (!papel) {
    if (!aberto) {
      return podeEditar ? (
        <Button variant="outline" onClick={() => setAberto(true)}>
          <Plus />
          Novo papel
        </Button>
      ) : null
    }
    return (
      <form action={acao} {...envio} className="grid gap-3 rounded-lg border p-4">
        <input type="hidden" name="congresso_id" value={congressoId} />
        <Retorno estado={estado} />
        <div className="grid gap-3 sm:grid-cols-[1fr_14rem_6rem]">
          <div className="grid gap-1.5">
            <Label htmlFor="papel-nome">Nome</Label>
            <Input id="papel-nome" name="nome" required placeholder="Ex.: Delegado de base" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="papel-cat">Categoria</Label>
            <SelectNativo id="papel-cat" name="categoria" defaultValue="delegado">
              {CATEGORIAS_PAPEL.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </SelectNativo>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="papel-cor">Cor</Label>
            <Input id="papel-cor" name="cor" type="color" defaultValue="#16a34a" className="h-9 p-1" />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">O papel nasce com os direitos padrão da categoria; ajuste a matriz depois.</p>
        <div className="flex gap-2">
          <Enviar pendente={pendente}>Criar papel</Enviar>
          <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    )
  }

  return (
    <form action={acao} {...envio} className="grid gap-3 rounded-lg border p-4">
      <input type="hidden" name="congresso_id" value={congressoId} />
      <input type="hidden" name="id" value={papel.id} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="size-4 shrink-0 rounded-full border" style={{ background: papel.cor ?? "transparent" }} />
        <Input name="nome" defaultValue={papel.nome} className="max-w-56 font-medium" disabled={!podeEditar} aria-label="Nome do papel" />
        <SelectNativo name="categoria" defaultValue={papel.categoria} className="max-w-48" disabled={!podeEditar} aria-label="Categoria">
          {CATEGORIAS_PAPEL.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.rotulo}
            </option>
          ))}
        </SelectNativo>
        <Input name="cor" type="color" defaultValue={papel.cor ?? "#16a34a"} className="h-9 w-14 p-1" disabled={!podeEditar} aria-label="Cor do crachá" />
        <input type="hidden" name="ordem" value={papel.ordem} />
      </div>
      <p className="text-sm">{resumoDireitos(direitos ?? papel.direitos)}</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="inscricao_publica" defaultChecked={papel.inscricaoPublica} className="accent-primary size-4" disabled={!podeEditar} />
        Aparece como opção na inscrição pela página do congresso
      </label>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {DIREITOS_ROTULO.map((d) =>
          d.tipo === "voz" ? (
            <label key={d.chave} className="flex items-center justify-between gap-2 text-sm">
              {d.rotulo}
              <SelectNativo
                name={`d:${d.chave}`}
                defaultValue={String(papel.direitos[d.chave])}
                className="w-40"
                disabled={!podeEditar}
                onChange={(e) => setDireitos((x) => ({ ...(x ?? papel.direitos), [d.chave]: e.target.value }) as Direitos)}
              >
                <option value="livre">Livre</option>
                <option value="autorizacao">Com autorização</option>
                <option value="nao">Não</option>
              </SelectNativo>
            </label>
          ) : (
            <label key={d.chave} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`d:${d.chave}`}
                defaultChecked={papel.direitos[d.chave] === true}
                className="accent-primary size-4"
                disabled={!podeEditar}
                onChange={(e) => setDireitos((x) => ({ ...(x ?? papel.direitos), [d.chave]: e.target.checked }) as Direitos)}
              />
              {d.rotulo}
            </label>
          )
        )}
      </div>
      {podeEditar && (
        <div className="flex flex-wrap items-center gap-3">
          <Enviar pendente={pendente} variant="outline">
            Salvar papel
          </Enviar>
          <Retorno estado={estado} />
        </div>
      )}
    </form>
  )
}

export function RemoverPapel({ congressoId, id, nome }: { congressoId: string; id: string; nome: string }) {
  return (
    <BotaoAcao
      acao={removerPapelAction}
      campos={{ congresso_id: congressoId, id }}
      rotulo="Remover"
      variant="ghost"
      tamanho="sm"
      icone={<Trash2 />}
      confirmar={`Remover o papel "${nome}"?`}
    />
  )
}

// ── Unidades ─────────────────────────────────────────────────────────────────

export function UnidadeForm({
  congressoId,
  unidade,
  tipoPadrao,
  tipos,
  mostraSocios,
  mostraLimite,
  aoFechar,
}: {
  congressoId: string
  unidade?: { id: string; tipo: string; nome: string; limite_delegados: number | null; socios: number | null; observacao: string | null; ordem: number }
  tipoPadrao: string
  tipos: { valor: string; rotulo: string }[]
  mostraSocios: boolean
  mostraLimite: boolean
  aoFechar?: () => void
}) {
  const [estado, acao, pendente] = useActionState(salvarUnidadeAction, {})
  const envio = useEnvioFormulario(acao, estado)
  return (
    <form action={acao} {...envio} className="grid gap-3">
      <input type="hidden" name="congresso_id" value={congressoId} />
      {unidade && <input type="hidden" name="id" value={unidade.id} />}
      <input type="hidden" name="ordem" value={unidade?.ordem ?? 0} />
      <div className="grid gap-3 sm:grid-cols-[9rem_1fr_8rem_8rem]">
        <div className="grid gap-1.5">
          <Label>Tipo</Label>
          <SelectNativo name="tipo" defaultValue={unidade?.tipo ?? tipoPadrao}>
            {tipos.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </SelectNativo>
        </div>
        <div className="grid gap-1.5">
          <Label>Nome</Label>
          <Input name="nome" required defaultValue={unidade?.nome ?? ""} placeholder="Ex.: Macaé, P-51, Usuários" />
        </div>
        {mostraLimite ? (
          <div className="grid gap-1.5">
            <Label>Limite de delegados</Label>
            <Input name="limite_delegados" type="number" min={0} defaultValue={unidade?.limite_delegados ?? ""} />
          </div>
        ) : (
          <input type="hidden" name="limite_delegados" value={unidade?.limite_delegados ?? ""} />
        )}
        {mostraSocios ? (
          <div className="grid gap-1.5">
            <Label>Sócios</Label>
            <Input name="socios" type="number" min={0} defaultValue={unidade?.socios ?? ""} />
          </div>
        ) : (
          <input type="hidden" name="socios" value={unidade?.socios ?? ""} />
        )}
      </div>
      <div className="grid gap-1.5">
        <Label>Observação</Label>
        <Input name="observacao" defaultValue={unidade?.observacao ?? ""} placeholder="Opcional" />
      </div>
      <Retorno estado={estado} />
      <div className="flex gap-2">
        <Enviar pendente={pendente}>{unidade ? "Salvar" : "Incluir"}</Enviar>
        {aoFechar && (
          <Button type="button" variant="ghost" onClick={aoFechar}>
            Fechar
          </Button>
        )}
      </div>
    </form>
  )
}

export function EditarUnidade(props: React.ComponentProps<typeof UnidadeForm> & { unidade: NonNullable<React.ComponentProps<typeof UnidadeForm>["unidade"]> }) {
  const [aberto, setAberto] = useState(false)
  if (!aberto) {
    return (
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={() => setAberto(true)} aria-label={`Editar ${props.unidade.nome}`}>
          <Pencil />
        </Button>
        <BotaoAcao
          acao={removerUnidadeAction}
          campos={{ congresso_id: props.congressoId, id: props.unidade.id }}
          rotulo=""
          variant="ghost"
          tamanho="sm"
          icone={<Trash2 />}
          confirmar={`Remover "${props.unidade.nome}"?`}
        />
      </div>
    )
  }
  return (
    <div className="bg-muted/40 col-span-full rounded-lg border p-3">
      <UnidadeForm {...props} aoFechar={() => setAberto(false)} />
    </div>
  )
}

// ── Programa ─────────────────────────────────────────────────────────────────

export function EixoForm({ congressoId }: { congressoId: string }) {
  const [estado, acao, pendente] = useActionState(salvarEixoAction, {})
  const envio = useEnvioFormulario(acao, estado)
  return (
    <form action={acao} {...envio} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="congresso_id" value={congressoId} />
      <div className="grid min-w-56 flex-1 gap-1.5">
        <Label htmlFor="eixo-nome">Novo eixo</Label>
        <Input id="eixo-nome" name="nome" required placeholder="Ex.: Saúde e segurança" />
      </div>
      <Enviar pendente={pendente} variant="outline">
        <Plus />
        Incluir
      </Enviar>
      <Retorno estado={estado} />
    </form>
  )
}

export function GrupoForm({ congressoId, eixos }: { congressoId: string; eixos: { id: string; nome: string }[] }) {
  const [estado, acao, pendente] = useActionState(salvarGrupoAction, {})
  const envio = useEnvioFormulario(acao, estado)
  return (
    <form action={acao} {...envio} className="grid gap-3 sm:grid-cols-[1fr_12rem_8rem_6rem_auto] sm:items-end">
      <input type="hidden" name="congresso_id" value={congressoId} />
      <div className="grid gap-1.5">
        <Label htmlFor="grupo-nome">Novo grupo</Label>
        <Input id="grupo-nome" name="nome" required placeholder="Ex.: GT 1 — Saúde e segurança" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="grupo-eixo">Eixo</Label>
        <SelectNativo id="grupo-eixo" name="eixo_id" defaultValue="">
          <option value="">Nenhum</option>
          {eixos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </SelectNativo>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="grupo-sala">Sala</Label>
        <Input id="grupo-sala" name="sala" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="grupo-vagas">Vagas</Label>
        <Input id="grupo-vagas" name="vagas" type="number" min={1} />
      </div>
      <Enviar pendente={pendente} variant="outline">
        <Plus />
        Incluir
      </Enviar>
      <div className="sm:col-span-full">
        <Retorno estado={estado} />
      </div>
    </form>
  )
}

export function SessaoForm({
  congressoId,
  tipos,
  grupos,
}: {
  congressoId: string
  tipos: { valor: string; rotulo: string }[]
  grupos: { id: string; nome: string }[]
}) {
  const [estado, acao, pendente] = useActionState(salvarSessaoAction, {})
  const envio = useEnvioFormulario(acao, estado)
  const [tipo, setTipo] = useState("plenaria")
  return (
    <form action={acao} {...envio} className="grid gap-3">
      <input type="hidden" name="congresso_id" value={congressoId} />
      <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="sessao-tipo">Tipo</Label>
          <SelectNativo id="sessao-tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {tipos.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </SelectNativo>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sessao-titulo">Título</Label>
          <Input id="sessao-titulo" name="titulo" required placeholder="Ex.: Aprovação do regimento" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="sessao-inicio">Início</Label>
          <Input id="sessao-inicio" name="inicio" type="datetime-local" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sessao-fim">Fim</Label>
          <Input id="sessao-fim" name="fim" type="datetime-local" />
        </div>
        {tipo === "grupo" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="sessao-grupo">Grupo</Label>
            <SelectNativo id="sessao-grupo" name="grupo_id" defaultValue="">
              <option value="">Todos os grupos</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </SelectNativo>
          </div>
        ) : (
          <div />
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="sessao-local">Local</Label>
          <Input id="sessao-local" name="local" placeholder="Ex.: Auditório" />
        </div>
      </div>
      <Retorno estado={estado} />
      <div>
        <Enviar pendente={pendente} variant="outline">
          <Plus />
          Incluir sessão
        </Enviar>
      </div>
    </form>
  )
}

export function RemoverDoPrograma({ congressoId, tabela, id, nome }: { congressoId: string; tabela: string; id: string; nome: string }) {
  return (
    <BotaoAcao
      acao={removerDoProgramaAction}
      campos={{ congresso_id: congressoId, tabela, id }}
      rotulo=""
      variant="ghost"
      tamanho="sm"
      icone={<X />}
      confirmar={`Remover "${nome}"?`}
    />
  )
}

// ── Participantes ────────────────────────────────────────────────────────────

type OpcoesParticipante = {
  papeis: { id: string; nome: string; categoria: string }[]
  unidades: { id: string; nome: string }[]
  grupos: { id: string; nome: string; vagas: number | null; ocupadas: number }[]
  titulares: { id: string; nome: string }[]
  pedeGenero: boolean
  pedeAcessibilidade: boolean
  pedeNomeSocial: boolean
  temGrupos: boolean
}

export function ParticipanteForm({
  congressoId,
  opcoes,
  participante,
  aoFechar,
}: {
  congressoId: string
  opcoes: OpcoesParticipante
  participante?: {
    id: string
    nome: string
    nomeSocial: string | null
    cpf: string | null
    email: string | null
    telefone: string | null
    genero: string | null
    papelId: string | null
    unidadeId: string | null
    grupoId: string | null
    titularId: string | null
    acessibilidade: string | null
    observacao: string | null
    filiacaoId: string | null
  }
  aoFechar?: () => void
}) {
  const [estado, acao, pendente] = useActionState(salvarParticipanteAction, {})
  const envio = useEnvioFormulario(acao, estado, { manter: !!participante })
  const [papelId, setPapelId] = useState(participante?.papelId ?? opcoes.papeis[0]?.id ?? "")
  const categoria = opcoes.papeis.find((p) => p.id === papelId)?.categoria
  const [deFiliado, setDeFiliado] = useState(!participante)

  return (
    <form action={acao} {...envio} className="grid gap-4">
      <input type="hidden" name="congresso_id" value={congressoId} />
      {participante && <input type="hidden" name="id" value={participante.id} />}
      {participante?.filiacaoId && <input type="hidden" name="filiado_id" value={participante.filiacaoId} />}

      {!participante && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={deFiliado ? "default" : "outline"} onClick={() => setDeFiliado(true)}>
            Filiado
          </Button>
          <Button type="button" size="sm" variant={!deFiliado ? "default" : "outline"} onClick={() => setDeFiliado(false)}>
            Não filiado
          </Button>
        </div>
      )}

      {!participante && deFiliado ? (
        <div className="grid gap-1.5">
          <Label>Filiado</Label>
          <FiliadoPicker endpoint="/painel/representacao/congressos/busca-filiado" />
          <p className="text-muted-foreground text-xs">Nome, CPF e gênero vêm da ficha.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <div className="grid gap-1.5">
            <Label htmlFor="p-nome">Nome</Label>
            <Input id="p-nome" name="nome" required defaultValue={participante?.nome ?? ""} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="p-cpf">CPF</Label>
            <Input id="p-cpf" name="cpf" inputMode="numeric" defaultValue={participante?.cpf ?? ""} />
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="p-papel">Papel</Label>
          <SelectNativo id="p-papel" name="papel_id" value={papelId} onChange={(e) => setPapelId(e.target.value)}>
            <option value="">Sem papel</option>
            {opcoes.papeis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </SelectNativo>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p-unidade">Base / entidade</Label>
          <SelectNativo id="p-unidade" name="unidade_id" defaultValue={participante?.unidadeId ?? ""}>
            <option value="">Nenhuma</option>
            {opcoes.unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </SelectNativo>
        </div>
        {opcoes.temGrupos && (
          <div className="grid gap-1.5">
            <Label htmlFor="p-grupo">Grupo</Label>
            <SelectNativo id="p-grupo" name="grupo_id" defaultValue={participante?.grupoId ?? ""}>
              <option value="">Nenhum</option>
              {opcoes.grupos.map((g) => (
                <option key={g.id} value={g.id} disabled={g.vagas !== null && g.ocupadas >= g.vagas && g.id !== participante?.grupoId}>
                  {g.nome}
                  {g.vagas !== null ? ` (${g.ocupadas}/${g.vagas})` : ""}
                </option>
              ))}
            </SelectNativo>
          </div>
        )}
      </div>

      {categoria === "suplente" && (
        <div className="grid gap-1.5 sm:max-w-md">
          <Label htmlFor="p-titular">Suplente de</Label>
          <SelectNativo id="p-titular" name="titular_id" defaultValue={participante?.titularId ?? ""}>
            <option value="">Da base (qualquer titular)</option>
            {opcoes.titulares
              .filter((x) => x.id !== participante?.id)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
          </SelectNativo>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {opcoes.pedeNomeSocial && (
          <div className="grid gap-1.5">
            <Label htmlFor="p-social">Nome social</Label>
            <Input id="p-social" name="nome_social" defaultValue={participante?.nomeSocial ?? ""} />
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="p-email">E-mail</Label>
          <Input id="p-email" name="email" type="email" defaultValue={participante?.email ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p-tel">Telefone</Label>
          <Input id="p-tel" name="telefone" defaultValue={participante?.telefone ?? ""} />
        </div>
        {opcoes.pedeGenero && (
          <div className="grid gap-1.5">
            <Label htmlFor="p-genero">Gênero</Label>
            <SelectNativo id="p-genero" name="genero" defaultValue={participante?.genero ?? ""}>
              <option value="">{participante ? "Não informado" : "Da ficha / não informado"}</option>
              <option value="feminino">Feminino</option>
              <option value="masculino">Masculino</option>
              <option value="outro">Outro</option>
            </SelectNativo>
          </div>
        )}
      </div>
      {opcoes.pedeAcessibilidade && (
        <div className="grid gap-1.5">
          <Label htmlFor="p-acess">Acessibilidade</Label>
          <Input id="p-acess" name="acessibilidade" defaultValue={participante?.acessibilidade ?? ""} placeholder="Ex.: intérprete de Libras, cadeira de rodas" />
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="p-obs">Observação da comissão</Label>
        <Input id="p-obs" name="observacao" defaultValue={participante?.observacao ?? ""} />
      </div>
      <Retorno estado={estado} />
      <div className="flex gap-2">
        <Enviar pendente={pendente}>{participante ? "Salvar" : "Incluir participante"}</Enviar>
        {aoFechar && (
          <Button type="button" variant="ghost" onClick={aoFechar}>
            Fechar
          </Button>
        )}
      </div>
    </form>
  )
}

export function NovoParticipante({ congressoId, opcoes }: { congressoId: string; opcoes: OpcoesParticipante }) {
  const [aberto, setAberto] = useState(false)
  if (!aberto) {
    return (
      <Button onClick={() => setAberto(true)}>
        <Plus />
        Incluir participante
      </Button>
    )
  }
  return (
    <div className="rounded-lg border p-4">
      <ParticipanteForm congressoId={congressoId} opcoes={opcoes} aoFechar={() => setAberto(false)} />
    </div>
  )
}

export function EditarParticipante(props: React.ComponentProps<typeof ParticipanteForm> & { rotulo: string }) {
  const [aberto, setAberto] = useState(false)
  if (!aberto) {
    return (
      <button type="button" className="text-left font-medium hover:underline" onClick={() => setAberto(true)}>
        {props.rotulo}
      </button>
    )
  }
  return (
    <div className="bg-muted/40 rounded-lg border p-3">
      <ParticipanteForm {...props} aoFechar={() => setAberto(false)} />
    </div>
  )
}

export function SituacaoForm({
  congressoId,
  id,
  situacao,
  situacoes,
}: {
  congressoId: string
  id: string
  situacao: string
  situacoes: { valor: string; rotulo: string }[]
}) {
  const [estado, acao, pendente] = useActionState(situacaoParticipanteAction, {})
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="congresso_id" value={congressoId} />
      <input type="hidden" name="id" value={id} />
      <SelectNativo
        name="situacao"
        defaultValue={situacao}
        className="w-40"
        aria-label="Situação"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        disabled={pendente}
      >
        {situacoes.map((s) => (
          <option key={s.valor} value={s.valor}>
            {s.rotulo}
          </option>
        ))}
      </SelectNativo>
      {pendente && <Loader2 className="size-4 animate-spin" />}
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

export function ImportarNatos({ congressoId, papelId }: { congressoId: string; papelId: string }) {
  return (
    <BotaoAcao
      acao={importarNatosAction}
      campos={{ congresso_id: congressoId, papel_id: papelId }}
      rotulo="Trazer a diretoria como natos"
      confirmar="Incluir os integrantes em exercício da diretoria vigente como delegados natos? Quem já está no congresso não é duplicado."
    />
  )
}

export function AplicarOrdem({ congressoId }: { congressoId: string }) {
  return (
    <BotaoAcao
      acao={aplicarOrdemAction}
      campos={{ congresso_id: congressoId }}
      rotulo="Aplicar a ordem de inscrição"
      confirmar="Reaplicar a ordem de inscrição em todas as bases? Quem estiver dentro do limite fica confirmado; quem passar vai para a lista de espera. Cada mudança fica no histórico da pessoa."
    />
  )
}

// ── Página pública ───────────────────────────────────────────────────────────

export function PaginaPublicaForm({
  congressoId,
  slug,
  aberta,
  sugestao,
  origem,
  papeisPublicos,
}: {
  congressoId: string
  slug: string | null
  aberta: boolean
  sugestao: string
  origem: string
  papeisPublicos: string[]
}) {
  const [estado, acao, pendente] = useActionState(paginaPublicaAction, {})
  const envio = useEnvioFormulario(acao, estado, { manter: true })
  const [valorSlug, setValorSlug] = useState(slug ?? sugestao)
  const url = `${origem}/congresso/${valorSlug}`
  return (
    <form action={acao} {...envio} className="grid gap-3">
      <input type="hidden" name="id" value={congressoId} />
      <div className="grid gap-1.5">
        <Label htmlFor="slug">Endereço da página</Label>
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <span className="text-muted-foreground">{origem}/congresso/</span>
          <Input id="slug" name="slug" value={valorSlug} onChange={(e) => setValorSlug(e.target.value)} className="w-64" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="inscricao_publica" defaultChecked={aberta} className="accent-primary size-4" />
        Aceitar inscrições pela página (dentro do prazo da configuração)
      </label>
      <p className="text-muted-foreground text-xs">
        {papeisPublicos.length
          ? `Na página, a pessoa escolhe entre: ${papeisPublicos.join(", ")}.`
          : "Nenhum papel marcado para a inscrição pública: marque em Papéis e direitos."}{" "}
        Cada inscrito recebe um link pessoal para acompanhar a situação.
      </p>
      <Retorno estado={estado} />
      <div className="flex flex-wrap items-center gap-3">
        <Enviar pendente={pendente} variant="outline">
          Salvar
        </Enviar>
        {slug && aberta && (
          <a href={url} target="_blank" rel="noreferrer" className="text-primary text-sm underline underline-offset-4">
            Abrir a página
          </a>
        )}
      </div>
    </form>
  )
}

// ── Link pessoal ─────────────────────────────────────────────────────────────

export function GerarLink({
  congressoId,
  participante,
  temLink,
}: {
  congressoId: string
  participante: { id: string; nome: string; email: string | null }
  temLink: boolean
}) {
  const [estado, acao, pendente] = useActionState<EstadoLink, FormData>(gerarLinkAction, {})
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="grid gap-1">
      <form
        action={acao}
        onSubmit={temLink ? (e) => confirmarEnvio(e, "Gerar um novo link pessoal? O link anterior deixa de funcionar.") : undefined}
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="congresso_id" value={congressoId} />
        <input type="hidden" name="id" value={participante.id} />
        <input type="hidden" name="nome" value={participante.nome} />
        {participante.email && <input type="hidden" name="email" value={participante.email} />}
        {participante.email && (
          <label className="text-muted-foreground flex items-center gap-1 text-xs">
            <input type="checkbox" name="enviar" defaultChecked className="accent-primary size-3.5" />
            enviar por e-mail
          </label>
        )}
        <Button type="submit" size="sm" variant="ghost" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {temLink ? "Novo link pessoal" : "Gerar link pessoal"}
        </Button>
      </form>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      {estado.link && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <code className="bg-muted max-w-80 truncate rounded px-1.5 py-0.5">{estado.link}</code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(estado.link!)
              setCopiado(true)
            }}
          >
            {copiado ? "Copiado" : "Copiar"}
          </Button>
          <span className="text-muted-foreground">{estado.ok}</span>
        </div>
      )}
    </div>
  )
}

// ── Importar lista ───────────────────────────────────────────────────────────

const ROTULO_LINHA = { nova: "Nova", ja_esta: "Já está", problema: "Problema" } as const

export function ImportarLista({
  congressoId,
  papeis,
  unidades,
}: {
  congressoId: string
  papeis: { id: string; nome: string; categoria: string }[]
  unidades: { id: string; nome: string }[]
}) {
  const [aberto, setAberto] = useState(false)
  const [conf, conferir, conferindo] = useActionState<EstadoImportacao, FormData>(conferirImportacaoAction, {})
  const [grav, gravar, gravando] = useActionState<EstadoImportacao, FormData>(gravarImportacaoAction, {})
  const papelDelegado = papeis.find((p) => p.categoria === "delegado")?.id ?? ""
  const nomePapel = new Map(papeis.map((p) => [p.id, p.nome]))
  const nomeUnidade = new Map(unidades.map((u) => [u.id, u.nome]))

  if (!aberto) {
    return (
      <Button variant="outline" onClick={() => setAberto(true)}>
        Importar planilha ou ata
      </Button>
    )
  }
  const linhas = grav.ok ? [] : (conf.linhas ?? [])
  const novas = linhas.filter((l) => l.situacao === "nova").length
  return (
    <div className="grid w-full gap-4 rounded-lg border p-4">
      <form action={conferir} className="grid gap-3">
        <input type="hidden" name="congresso_id" value={congressoId} />
        <p className="text-muted-foreground text-sm">
          Planilha (.xlsx, .csv) com colunas como Nome, CPF, Base, Condição, E-mail, Telefone e Gênero é lida direto. Ata de
          eleição em PDF ou foto, ou planilha sem esses títulos, é lida pela IA. Nada é gravado antes da sua conferência.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="imp-arquivo">Arquivo</Label>
            <Input id="imp-arquivo" name="arquivo" type="file" accept=".xlsx,.xls,.ods,.csv,.pdf,.jpg,.jpeg,.png,.webp" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="imp-papel">Papel quando não constar</Label>
            <SelectNativo id="imp-papel" name="papel_padrao" defaultValue={papelDelegado}>
              <option value="">Sem papel</option>
              {papeis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </SelectNativo>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="imp-unidade">Base quando não constar</Label>
            <SelectNativo id="imp-unidade" name="unidade_padrao" defaultValue="">
              <option value="">Nenhuma</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </SelectNativo>
          </div>
        </div>
        {conf.erro && <Retorno estado={{ erro: conf.erro }} />}
        <div className="flex gap-2">
          <Enviar pendente={conferindo} variant="outline">
            Conferir o arquivo
          </Enviar>
          <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
            Fechar
          </Button>
        </div>
      </form>

      {grav.ok && <Retorno estado={{ ok: grav.ok }} />}
      {linhas.length > 0 && (
        <div className="grid gap-3">
          <p className="text-sm">
            {conf.origem === "ata" ? "Lido pela IA. Confira nome a nome. " : ""}
            <strong>{novas}</strong> nova(s), {linhas.filter((l) => l.situacao === "ja_esta").length} já no congresso,{" "}
            {linhas.filter((l) => l.situacao === "problema").length} com problema.
          </p>
          <div className="max-h-96 overflow-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 sticky top-0">
                <tr className="text-left">
                  <th className="px-2 py-1.5">Linha</th>
                  <th className="px-2 py-1.5">Nome</th>
                  <th className="px-2 py-1.5">CPF</th>
                  <th className="px-2 py-1.5">Papel</th>
                  <th className="px-2 py-1.5">Base</th>
                  <th className="px-2 py-1.5">Conferência</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.linha} className="border-t">
                    <td className="text-muted-foreground px-2 py-1 tabular-nums">{l.linha}</td>
                    <td className="px-2 py-1">{l.nome || "—"}</td>
                    <td className="text-muted-foreground px-2 py-1 tabular-nums">{l.cpf ?? "—"}</td>
                    <td className="px-2 py-1">{(l.papelId && nomePapel.get(l.papelId)) || "—"}</td>
                    <td className="px-2 py-1">{(l.unidadeId && nomeUnidade.get(l.unidadeId)) || l.base || "—"}</td>
                    <td className="px-2 py-1">
                      <Badge variant={l.situacao === "nova" ? "success" : l.situacao === "ja_esta" ? "secondary" : "destructive"}>
                        {ROTULO_LINHA[l.situacao]}
                      </Badge>
                      {l.motivo && <span className="text-muted-foreground ml-1 text-xs">{l.motivo}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {novas > 0 && (
            <form action={gravar} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="congresso_id" value={congressoId} />
              <input type="hidden" name="origem" value={conf.origem ?? "planilha"} />
              <input type="hidden" name="papel_padrao" value={conf.papelPadrao ?? ""} />
              <input type="hidden" name="unidade_padrao" value={conf.unidadePadrao ?? ""} />
              <input
                type="hidden"
                name="linhas"
                value={JSON.stringify(
                  linhas.map(({ linha, nome, cpf, email, telefone, genero, base, papel }) => ({ linha, nome, cpf, email, telefone, genero, base, papel }))
                )}
              />
              <Enviar pendente={gravando}>Incluir {novas} participante(s)</Enviar>
              {grav.erro && <span className="text-destructive text-sm">{grav.erro}</span>}
            </form>
          )}
        </div>
      )}
    </div>
  )
}
