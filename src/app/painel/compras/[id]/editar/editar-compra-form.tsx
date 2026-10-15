"use client"

import { startTransition, useActionState, useRef, useState } from "react"
import { Loader2, Save } from "lucide-react"

import { ConfirmacaoAuditoria } from "@/components/confirmacao-auditoria"
import { EmpresaCombobox, type EmpresaOpcao } from "@/components/empresa-combobox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ACEITA_NOTA, LIMITE_ENVIO, prepararArquivo } from "@/lib/arquivo-envio"
import { FORMA_PAGA_NO_ATO, FORMAS_PAGAMENTO_COMPRAS } from "@/lib/compras-constantes"
import { FORMAS_PAGAMENTO_RPA } from "@/lib/rpa-calculo"

import { DetalhePagamento, type CaixaOpcao, type CartaoOpcao } from "../../nova/detalhe-pagamento"
import { editarCompraAction } from "./actions"

type Opcao = { id: string; nome: string }
type CentroOpcao = { id: string; nome: string; departamentoId: string | null }
type ProjetoOpcao = { id: string; nome: string; centroCustoId: string | null }

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

function valorBR(v: number | null): string {
  return v === null ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Edição da compra antes da autorização: os mesmos campos do registro, já
 * preenchidos. Envio pelo onSubmit (sem `action=`): a auditoria pode devolver
 * apontamentos e o formulário não pode ser limpo.
 */
export function EditarCompraForm({
  processoId,
  direta,
  edicao,
  atual,
  departamentos,
  centrosCusto,
  projetos,
  fornecedores,
  cartoes,
  caixas,
  compradores,
}: {
  processoId: string
  direta: boolean
  edicao: { completa: boolean; porRpa: boolean; caixaDebitado: boolean; fornecedorEditavel: boolean }
  atual: {
    produto: string
    observacao: string
    tipo: string
    departamentoId: string
    centroCustoId: string
    projetoId: string
    entregaNoAto: boolean
    dataLimite: string
    localEntrega: string
    fornecedorId: string
    fornecedorNome: string
    valor: number | null
    dataCompra: string
    compradorId: string
    forma: string
    vencimento: string
    temNota: boolean
  }
  departamentos: Opcao[]
  centrosCusto: CentroOpcao[]
  projetos: ProjetoOpcao[]
  fornecedores: EmpresaOpcao[]
  cartoes: CartaoOpcao[]
  caixas: CaixaOpcao[]
  compradores: { id: string; nome: string; origem: string }[]
}) {
  const [estado, formAction, pendente] = useActionState(editarCompraAction, {})
  const formRef = useRef<HTMLFormElement>(null)
  const [envioErro, setEnvioErro] = useState<string | null>(null)
  const [arquivoErro, setArquivoErro] = useState<string | null>(null)

  const [comProjeto, setComProjeto] = useState(Boolean(atual.projetoId))
  const [projetoId, setProjetoId] = useState(atual.projetoId)
  const [depto, setDepto] = useState(atual.departamentoId)
  const [centroManual, setCentroManual] = useState(atual.centroCustoId)
  const [noAto, setNoAto] = useState(atual.entregaNoAto)
  const [fornecedorId, setFornecedorId] = useState(atual.fornecedorId)
  const [alterarPagamento, setAlterarPagamento] = useState(false)
  const [forma, setForma] = useState("")

  // Centro de custo: os do departamento; vinculada a projeto, o do projeto (travado).
  const centrosVisiveis = depto ? centrosCusto.filter((c) => c.departamentoId === depto) : centrosCusto
  const centroDoProjeto = comProjeto ? (projetos.find((p) => p.id === projetoId)?.centroCustoId ?? "") : ""
  const centroSelecionado = centroDoProjeto
    ? centroDoProjeto
    : centrosVisiveis.some((c) => c.id === centroManual) || centroManual === atual.centroCustoId
      ? centroManual
      : ""
  // O centro atual pode não ser do departamento (legado): continua escolhível.
  const centrosOpcoes =
    centroManual && !centrosVisiveis.some((c) => c.id === centroManual)
      ? [...centrosCusto.filter((c) => c.id === centroManual), ...centrosVisiveis]
      : centrosVisiveis

  const formaFinal = alterarPagamento ? forma : atual.forma
  const dinheiroNoAto = formaFinal === FORMA_PAGA_NO_ATO && !edicao.porRpa
  const outroFornecedor = edicao.fornecedorEditavel && fornecedorId !== atual.fornecedorId
  const formas = (edicao.porRpa ? FORMAS_PAGAMENTO_RPA : FORMAS_PAGAMENTO_COMPRAS).filter(
    (f) => edicao.porRpa || f !== FORMA_PAGA_NO_ATO
  )

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault()
        setEnvioErro(null)
        if (edicao.fornecedorEditavel && !fornecedorId) {
          setEnvioErro("Busque e selecione o fornecedor.")
          return
        }
        const total = [...e.currentTarget.querySelectorAll<HTMLInputElement>("input[type=file]")].reduce(
          (soma, i) => soma + (i.files?.[0]?.size ?? 0),
          0
        )
        if (total > LIMITE_ENVIO) {
          setEnvioErro("Nota e boleto juntos passam de 4 MB. Envie arquivos menores.")
          return
        }
        const dados = new FormData(e.currentTarget)
        startTransition(() => formAction(dados))
      }}
      className="grid gap-6"
    >
      <ConfirmacaoAuditoria estado={estado} formRef={formRef} pendente={pendente} />
      <ErroNoCampo estado={estado} />
      {(envioErro || estado.erro) && (
        <Alert variant="destructive">
          <AlertDescription>{envioErro ?? estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="processo_id" value={processoId} />
      <input type="hidden" name="com_projeto" value={comProjeto ? "on" : ""} />
      <input type="hidden" name="entrega_no_ato" value={noAto ? "on" : ""} />
      <input type="hidden" name="forma_atual" value={atual.forma} />
      <input type="hidden" name="alterar_pagamento" value={alterarPagamento ? "on" : ""} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Solicitação</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Sem vínculo</span>
            <Switch checked={comProjeto} onCheckedChange={setComProjeto} aria-label="Vincular a um projeto" />
            <span className={comProjeto ? "font-medium" : "text-muted-foreground"}>Vinculada a um projeto</span>
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="produto">Produto ou serviço *</Label>
              <textarea id="produto" name="produto" rows={4} required defaultValue={atual.produto} className={TEXTAREA} />
              <p className="text-muted-foreground text-xs">Mudou a descrição? A IA a avalia de novo ao salvar.</p>
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="observacao">Observações</Label>
              <textarea id="observacao" name="observacao" rows={4} defaultValue={atual.observacao} className={TEXTAREA} />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="e_produto">Tipo *</Label>
              <select id="e_produto" name="e_produto" required defaultValue={atual.tipo} className={SELECT}>
                <option value="" disabled>
                  Escolha o tipo
                </option>
                <option value="servico">Prestação de serviço</option>
                {!edicao.porRpa && <option value="bem">Bem / produto</option>}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="departamento_id">Departamento solicitante *</Label>
              <select
                id="departamento_id"
                name="departamento_id"
                required
                className={SELECT}
                value={depto}
                onChange={(e) => {
                  setDepto(e.target.value)
                  setCentroManual("")
                }}
              >
                <option value="" disabled>
                  Escolha o departamento
                </option>
                {departamentos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="centro_custo_id">Centro de custo da despesa *</Label>
              {centroDoProjeto ? (
                <>
                  <select className={SELECT} value={centroDoProjeto} disabled aria-label="Centro de custo (do projeto)">
                    <option value={centroDoProjeto}>
                      {centrosCusto.find((c) => c.id === centroDoProjeto)?.nome ?? ""}
                    </option>
                  </select>
                  <input type="hidden" name="centro_custo_id" value={centroDoProjeto} />
                  <p className="text-muted-foreground text-xs">Definido pelo projeto selecionado.</p>
                </>
              ) : (
                <select
                  id="centro_custo_id"
                  name="centro_custo_id"
                  required
                  className={SELECT}
                  value={centroSelecionado}
                  onChange={(e) => setCentroManual(e.target.value)}
                >
                  <option value="" disabled>
                    {depto ? "Escolha o centro do departamento" : "Escolha o departamento primeiro"}
                  </option>
                  {centrosOpcoes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          {comProjeto && (
            <div className="grid gap-1.5 md:max-w-96">
              <Label htmlFor="projeto_id">Projeto *</Label>
              <select
                id="projeto_id"
                name="projeto_id"
                required
                className={SELECT}
                value={projetoId}
                onChange={(e) => setProjetoId(e.target.value)}
              >
                <option value="" disabled>
                  Escolha o projeto
                </option>
                {projetos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={noAto} onCheckedChange={setNoAto} aria-label="Entregue no ato da compra" />
              {direta ? "Produto ou serviço entregue no ato da compra" : "Entrega no ato da compra (ex.: retirada no balcão)"}
            </label>
            {!noAto && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="data_limite">Limite para receber *</Label>
                  <Input id="data_limite" name="data_limite" type="date" required defaultValue={atual.dataLimite} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="local_entrega">Local para receber *</Label>
                  <Input id="local_entrega" name="local_entrega" required defaultValue={atual.localEntrega} />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {edicao.completa && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Compra e pagamento</CardTitle>
            <CardDescription>
              A ordem de pagamento acompanha: fornecedor, valor, forma, “Pagar em” e nota.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Fornecedor *</Label>
                {edicao.fornecedorEditavel ? (
                  <EmpresaCombobox
                    empresas={fornecedores}
                    name="fornecedor_id"
                    defaultId={atual.fornecedorId || undefined}
                    onChange={(id) => setFornecedorId(id ?? "")}
                  />
                ) : (
                  <p className="pt-2 text-sm">{atual.fornecedorNome || "—"}</p>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="data_compra">Data da compra *</Label>
                  <Input id="data_compra" name="data_compra" type="date" required defaultValue={atual.dataCompra} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="valor">Valor da compra *</Label>
                  {edicao.porRpa || edicao.caixaDebitado ? (
                    <p className="pt-2 text-sm tabular-nums">R$ {valorBR(atual.valor)}</p>
                  ) : (
                    <Input id="valor" name="valor" inputMode="decimal" required defaultValue={valorBR(atual.valor)} />
                  )}
                </div>
              </div>
            </div>
            {compradores.length > 0 && (
              <div className="grid gap-1.5 md:max-w-[calc(50%-0.5rem)]">
                <Label htmlFor="comprador_id">Comprador</Label>
                <select id="comprador_id" name="comprador_id" defaultValue={atual.compradorId} className={SELECT}>
                  <option value="">Manter o atual</option>
                  {compradores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                      {c.origem ? ` — ${c.origem}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-1.5">
                <Label>Forma de pagamento</Label>
                {alterarPagamento ? (
                  <select
                    id="forma_pagamento"
                    name="forma_pagamento"
                    className={SELECT}
                    value={forma}
                    onChange={(e) => setForma(e.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Escolha a forma
                    </option>
                    {formas.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="pt-2 text-sm">{atual.forma || "—"}</p>
                )}
                {!edicao.caixaDebitado && (
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={alterarPagamento}
                      onChange={(e) => {
                        setAlterarPagamento(e.target.checked)
                        setForma("")
                      }}
                      className="size-4"
                    />
                    Alterar a forma de pagamento (ou a chave, conta, cartão, código Pix ou boleto)
                  </label>
                )}
                {outroFornecedor && !alterarPagamento && (
                  <p className="text-warning-fg text-xs">
                    Outro fornecedor: se o pagamento é por chave Pix ou conta dele, marque “Alterar a forma de
                    pagamento” e informe a do novo fornecedor.
                  </p>
                )}
              </div>
              {dinheiroNoAto ? (
                <div className="grid gap-1.5">
                  <Label>Pagar em</Label>
                  <p className="text-muted-foreground pt-2 text-sm">No ato da compra — vale a data da compra.</p>
                </div>
              ) : (
                <div className="grid gap-1.5">
                  <Label htmlFor="vencimento">Pagar em *</Label>
                  <Input id="vencimento" name="vencimento" type="date" required defaultValue={atual.vencimento} />
                </div>
              )}
              {edicao.porRpa ? (
                <div className="grid gap-1.5">
                  <Label>Documento fiscal</Label>
                  <p className="text-muted-foreground pt-2 text-sm">O RPA assinado pelo prestador.</p>
                </div>
              ) : (
                <div className="grid gap-1.5">
                  <Label htmlFor="nota_fiscal">
                    {atual.temNota ? "Substituir a nota fiscal (opcional)" : "Nota fiscal ou cupom"}
                  </Label>
                  <Input
                    id="nota_fiscal"
                    name="nota_fiscal"
                    type="file"
                    accept={ACEITA_NOTA}
                    onChange={async (e) => {
                      const { erro } = await prepararArquivo(e.currentTarget)
                      setArquivoErro(erro ?? null)
                    }}
                  />
                  {arquivoErro && <p className="text-destructive text-xs">{arquivoErro}</p>}
                </div>
              )}
            </div>
            {alterarPagamento && (
              <div className="grid gap-4 md:grid-cols-3">
                <DetalhePagamento
                  key={`${forma}-${fornecedorId}`}
                  forma={forma}
                  fornecedorId={fornecedorId}
                  cartoes={cartoes}
                  caixas={caixas}
                  futuro={edicao.porRpa}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" asChild>
          <a href={`/painel/compras/${processoId}`}>Cancelar</a>
        </Button>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {pendente ? "Analisando e salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  )
}
