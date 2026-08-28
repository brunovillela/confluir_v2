"use client"

import { useActionState, useRef, useState } from "react"
import { Loader2, Send, Sparkles, ShoppingCart } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  FORMAS_PAGAMENTO_COMPRAS,
  hojeLocalISO,
} from "@/lib/compras-constantes"

import {
  EmpresaCombobox as FornecedorCombobox,
  type EmpresaOpcao as FornecedorOpcao,
} from "@/components/empresa-combobox"
import { criarCompra } from "./actions"
import { gerarDescricaoCompra } from "./ia-actions"

type Opcao = { id: string; nome: string }
type CentroOpcao = { id: string; nome: string; departamentoId: string | null }
type ProjetoOpcao = { id: string; nome: string; centroCustoId: string | null }

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

export function NovaCompraForm({
  departamentos,
  centrosCusto,
  projetos,
  fornecedores,
}: {
  departamentos: Opcao[]
  centrosCusto: CentroOpcao[]
  projetos: ProjetoOpcao[]
  fornecedores: FornecedorOpcao[]
}) {
  const [estado, formAction, pendente] = useActionState(criarCompra, {})
  const [direta, setDireta] = useState(false)
  const [comProjeto, setComProjeto] = useState(false)
  const [jaRecebido, setJaRecebido] = useState(true)

  // Departamento solicitante → filtra os centros de custo (A3).
  const [depto, setDepto] = useState("")
  const [centroManual, setCentroManual] = useState("")
  const [projetoId, setProjetoId] = useState("")

  const centrosVisiveis = depto
    ? centrosCusto.filter((c) => c.departamentoId === depto)
    : centrosCusto

  // Vinculada a projeto: o centro do projeto é atribuído à despesa (A1) e o
  // campo fica travado nesse valor. Sem projeto (ou projeto sem centro), o
  // usuário escolhe entre os centros do departamento.
  const projetoSel = comProjeto
    ? projetos.find((p) => p.id === projetoId)
    : undefined
  const centroDoProjeto = projetoSel?.centroCustoId ?? ""
  const centroTravado = Boolean(centroDoProjeto)
  const centroSelecionado = centroTravado
    ? centroDoProjeto
    : centrosVisiveis.some((c) => c.id === centroManual)
      ? centroManual
      : ""
  const nomeCentroProjeto =
    centrosCusto.find((c) => c.id === centroDoProjeto)?.nome ?? ""

  const produtoRef = useRef<HTMLTextAreaElement>(null)
  const observacaoRef = useRef<HTMLTextAreaElement>(null)
  const [iaPendente, setIaPendente] = useState(false)
  const [iaErro, setIaErro] = useState<string | null>(null)

  async function melhorarDescricao() {
    setIaErro(null)
    const produto = produtoRef.current?.value.trim() ?? ""
    if (produto.length < 3) {
      setIaErro("Escreva um rascunho do produto ou serviço primeiro.")
      return
    }
    setIaPendente(true)
    const tipo = (
      produtoRef.current?.form?.elements.namedItem(
        "e_produto"
      ) as HTMLSelectElement | null
    )?.value
    const { texto, erro } = await gerarDescricaoCompra({
      produto,
      observacao: observacaoRef.current?.value ?? "",
      tipo: tipo || undefined,
    })
    setIaPendente(false)
    if (erro) {
      setIaErro(erro)
      return
    }
    if (texto && produtoRef.current) produtoRef.current.value = texto
  }

  return (
    <form action={formAction} className="grid gap-6">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input
        type="hidden"
        name="modalidade"
        value={direta ? "direta" : "via_compras"}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Solicitação</CardTitle>
          <CardDescription>
            Via Compras registra a solicitação para o setor de compras cotar e
            adquirir; aquisição direta registra uma compra já feita pelo
            departamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <label className="flex items-center gap-2 text-sm">
              <span
                className={
                  direta ? "text-muted-foreground" : "font-medium"
                }
              >
                Via Compras
              </span>
              <Switch
                checked={direta}
                onCheckedChange={setDireta}
                aria-label="Alternar entre via Compras e aquisição direta"
              />
              <span
                className={
                  direta ? "font-medium" : "text-muted-foreground"
                }
              >
                Aquisição direta
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Sem vínculo</span>
              <Switch
                checked={comProjeto}
                onCheckedChange={setComProjeto}
                aria-label="Vincular a um projeto"
              />
              <span className={comProjeto ? "font-medium" : "text-muted-foreground"}>
                Vinculada a um projeto
              </span>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="produto">Produto ou serviço *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={melhorarDescricao}
                  disabled={iaPendente}
                  className="h-7 px-2 text-xs"
                >
                  {iaPendente ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Sparkles />
                  )}
                  {iaPendente ? "Gerando…" : "Melhorar com IA"}
                </Button>
              </div>
              <textarea
                id="produto"
                name="produto"
                ref={produtoRef}
                rows={3}
                required
                placeholder="O que precisa ser adquirido"
                className={TEXTAREA}
              />
              {iaErro && <p className="text-destructive text-xs">{iaErro}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="observacao">Observações</Label>
              <textarea
                id="observacao"
                name="observacao"
                ref={observacaoRef}
                rows={3}
                placeholder="Detalhes, links de referência, quantidade…"
                className={TEXTAREA}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="e_produto">Tipo</Label>
              <select id="e_produto" name="e_produto" className={SELECT} defaultValue="">
                <option value="">Não informado</option>
                <option value="servico">Prestação de serviço</option>
                <option value="bem">Bem / produto</option>
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
              <Label htmlFor="centro_custo_id">
                Centro de custo da despesa *
              </Label>
              {centroTravado ? (
                <>
                  {/* Travado no centro do projeto (A1). */}
                  <select
                    className={SELECT}
                    value={centroDoProjeto}
                    disabled
                    aria-label="Centro de custo (definido pelo projeto)"
                  >
                    <option value={centroDoProjeto}>{nomeCentroProjeto}</option>
                  </select>
                  <input
                    type="hidden"
                    name="centro_custo_id"
                    value={centroDoProjeto}
                  />
                  <p className="text-muted-foreground text-xs">
                    Definido pelo projeto selecionado.
                  </p>
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
                    {depto
                      ? "Escolha o centro do departamento"
                      : "Escolha o departamento primeiro"}
                  </option>
                  {centrosVisiveis.map((c) => (
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
              <Label htmlFor="projeto_id">Projeto</Label>
              <select
                id="projeto_id"
                name="projeto_id"
                className={SELECT}
                value={projetoId}
                onChange={(e) => setProjetoId(e.target.value)}
              >
                <option value="">Escolha o projeto</option>
                {projetos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!direta && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="data_limite">Limite para receber</Label>
                <Input id="data_limite" name="data_limite" type="date" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="local_entrega">Local de entrega preferencial</Label>
                <Input
                  id="local_entrega"
                  name="local_entrega"
                  placeholder="Ex.: sede principal"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {direta && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aquisição direta</CardTitle>
            <CardDescription>
              A compra já foi feita: o processo nasce comprado e a ordem de
              pagamento é gerada em autorização (aprovação por alçada antes do
              pagamento).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Fornecedor *</Label>
                <FornecedorCombobox
                  empresas={fornecedores}
                  name="fornecedor_id"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="data_compra">Data da compra *</Label>
                  <Input
                    id="data_compra"
                    name="data_compra"
                    type="date"
                    required
                    defaultValue={hojeLocalISO()}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="valor">Valor da compra *</Label>
                  <Input
                    id="valor"
                    name="valor"
                    inputMode="decimal"
                    required
                    placeholder="0,00"
                  />
                </div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="forma_pagamento">Forma de pagamento *</Label>
                <select
                  id="forma_pagamento"
                  name="forma_pagamento"
                  className={SELECT}
                  defaultValue=""
                  required={direta}
                >
                  <option value="" disabled>
                    Escolha a forma
                  </option>
                  {FORMAS_PAGAMENTO_COMPRAS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="vencimento">Pagar em *</Label>
                <Input
                  id="vencimento"
                  name="vencimento"
                  type="date"
                  required={direta}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="nota_fiscal">Nota fiscal (PDF, até 5 MB)</Label>
                <Input
                  id="nota_fiscal"
                  name="nota_fiscal"
                  type="file"
                  accept="application/pdf"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={jaRecebido}
                onCheckedChange={setJaRecebido}
                aria-label="Produto recebido ou serviço entregue"
              />
              Produto recebido ou serviço entregue?
            </label>
            <input
              type="hidden"
              name="ja_recebido"
              value={jaRecebido ? "on" : ""}
            />
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pendente}>
          {pendente ? (
            <Loader2 className="animate-spin" />
          ) : direta ? (
            <ShoppingCart />
          ) : (
            <Send />
          )}
          {direta ? "Cadastrar compra" : "Solicitar compra"}
        </Button>
      </div>
    </form>
  )
}
