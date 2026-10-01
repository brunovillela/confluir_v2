"use client"

import { useActionState, useRef, useState } from "react"
import {
  Building2,
  CheckCircle2,
  FileSearch,
  Loader2,
  PencilLine,
  Send,
  Sparkles,
  ShoppingCart,
  TriangleAlert,
} from "lucide-react"

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
import { formatarCnpjCpf } from "@/lib/mascaras"
import { cn } from "@/lib/utils"

import {
  EmpresaCombobox as FornecedorCombobox,
  type EmpresaOpcao as FornecedorOpcao,
} from "@/components/empresa-combobox"
import { criarCompra } from "./actions"
import { ACEITA_NOTA, LIMITE_ENVIO, prepararArquivo } from "./arquivo-envio"
import {
  DetalhePagamento,
  type CaixaOpcao,
  type CartaoOpcao,
} from "./detalhe-pagamento"
import {
  cadastrarFornecedorDaNota,
  gerarRedacaoCompra,
  lerNotaCompra,
  type FornecedorDaNota,
  type LeituraNota,
} from "./ia-actions"

type Opcao = { id: string; nome: string }
type CentroOpcao = { id: string; nome: string; departamentoId: string | null }
type ProjetoOpcao = { id: string; nome: string; centroCustoId: string | null }
type Modo = "manual" | "semi"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

export function NovaCompraForm({
  departamentos,
  centrosCusto,
  projetos,
  fornecedores: fornecedoresIniciais,
  cartoes,
  caixas,
  permiteViaCompras = true,
  permiteDireta = true,
}: {
  /** "Aquisição — editar": solicitação para o setor de compras. */
  permiteViaCompras?: boolean
  /** "Aquisição — registrar aquisição direta". */
  permiteDireta?: boolean
  departamentos: Opcao[]
  centrosCusto: CentroOpcao[]
  projetos: ProjetoOpcao[]
  fornecedores: FornecedorOpcao[]
  /** Cartões ativos da entidade (pagamento em cartão). */
  cartoes: CartaoOpcao[]
  /** Contas de caixa abertas (pagamento em dinheiro). */
  caixas: CaixaOpcao[]
}) {
  const [estado, formAction, pendente] = useActionState(criarCompra, {})
  // Com uma só modalidade permitida, ela vem fixa.
  const [direta, setDireta] = useState(!permiteViaCompras && permiteDireta)
  const [comProjeto, setComProjeto] = useState(false)
  // Entregue no ato da compra? Na compra direta o normal é sim (já veio);
  // na solicitação, não (o comprador ainda vai comprar). Sem entrega no ato,
  // limite e local para receber passam a ser obrigatórios.
  const [noAtoDireta, setNoAtoDireta] = useState(true)
  const [noAtoVia, setNoAtoVia] = useState(false)
  const noAto = direta ? noAtoDireta : noAtoVia
  const setNoAto = direta ? setNoAtoDireta : setNoAtoVia

  // Aquisição direta: preencher à mão ou a partir da nota (semiautomático).
  const [modo, setModo] = useState<Modo | null>(null)

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

  // Fornecedores: a lista cresce quando um fornecedor é cadastrado pela nota;
  // `comboVersao` remonta o combobox para ele assumir a nova escolha.
  const [fornecedores, setFornecedores] = useState(fornecedoresIniciais)
  const [fornecedorId, setFornecedorId] = useState("")
  const [comboVersao, setComboVersao] = useState(0)

  // Leitura da nota.
  const notaRef = useRef<HTMLInputElement>(null)
  const [notaNome, setNotaNome] = useState("")
  const [lendo, setLendo] = useState(false)
  const [leituraErro, setLeituraErro] = useState<string | null>(null)
  const [leitura, setLeitura] = useState<LeituraNota | null>(null)
  // Remonta os campos pré-preenchidos a cada leitura.
  const [leituraVersao, setLeituraVersao] = useState(0)
  const [novoFornecedor, setNovoFornecedor] = useState<FornecedorDaNota | null>(null)
  const [cadastrando, setCadastrando] = useState(false)
  const [cadastroErro, setCadastroErro] = useState<string | null>(null)
  const [cadastrado, setCadastrado] = useState<string | null>(null)

  const [arquivoErro, setArquivoErro] = useState<string | null>(null)
  const [forma, setForma] = useState("")
  const [envioErro, setEnvioErro] = useState<string | null>(null)

  const semi = direta && modo === "semi"
  // Na compra direta, os campos só aparecem depois da escolha do modo — e, no
  // semiautomático, depois da leitura da nota.
  const mostrarCampos = !direta || modo === "manual" || (semi && leitura !== null)

  function escolherFornecedor(opcao: FornecedorOpcao) {
    setFornecedores((lista) =>
      lista.some((f) => f.id === opcao.id) ? lista : [opcao, ...lista]
    )
    setFornecedorId(opcao.id)
    setComboVersao((v) => v + 1)
  }

  async function melhorarTexto() {
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
    const r = await gerarRedacaoCompra({
      produto,
      observacao: observacaoRef.current?.value ?? "",
      tipo: tipo || undefined,
      direta,
    })
    setIaPendente(false)
    if (r.erro) {
      setIaErro(r.erro)
      return
    }
    if (r.produto && produtoRef.current) produtoRef.current.value = r.produto
    if (r.observacao && observacaoRef.current) {
      observacaoRef.current.value = r.observacao
    }
  }

  async function aoEscolherNota() {
    setLeituraErro(null)
    const input = notaRef.current
    if (!input) return
    const { arquivo, erro } = await prepararArquivo(input)
    if (erro) setLeituraErro(erro)
    setNotaNome(arquivo?.name ?? "")
  }

  async function lerNota() {
    const arquivo = notaRef.current?.files?.[0]
    if (!arquivo) {
      setLeituraErro("Selecione o arquivo da nota ou do cupom.")
      return
    }
    setLeituraErro(null)
    setCadastroErro(null)
    setCadastrado(null)
    setLendo(true)
    const fd = new FormData()
    fd.set("nota_fiscal", arquivo)
    const r = await lerNotaCompra(fd)
    setLendo(false)
    if (r.erro) {
      setLeituraErro(r.erro)
      return
    }
    setLeitura(r)
    setForma(r.forma_pagamento ?? "")
    setLeituraVersao((v) => v + 1)
    if (r.fornecedorExistente) {
      const { id, nome, cnpj_cpf, bloqueado } = r.fornecedorExistente
      escolherFornecedor({ id, nome, cnpj_cpf, bloqueado })
      setNovoFornecedor(null)
    } else {
      setFornecedorId("")
      setComboVersao((v) => v + 1)
      setNovoFornecedor(r.fornecedorLido ?? null)
    }
  }

  async function confirmarFornecedor() {
    if (!novoFornecedor) return
    setCadastroErro(null)
    setCadastrando(true)
    const r = await cadastrarFornecedorDaNota(novoFornecedor)
    setCadastrando(false)
    if (r.erro || !r.fornecedor) {
      setCadastroErro(r.erro ?? "Não foi possível cadastrar.")
      return
    }
    escolherFornecedor(r.fornecedor)
    setCadastrado(r.fornecedor.nome)
    setNovoFornecedor(null)
  }

  const campoFornecedor = (
    campo: "razao_social" | "nome_fantasia" | "cnpj_cpf",
    valor: string
  ) => setNovoFornecedor((f) => (f ? { ...f, [campo]: valor } : f))

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        // O combobox do fornecedor não tem "required" nativo.
        setEnvioErro(null)
        if (direta && !fornecedorId) {
          e.preventDefault()
          setEnvioErro("Busque e selecione o fornecedor.")
          return
        }
        // Nota + boleto vão no mesmo envio, que tem teto de ~4 MB.
        const total = [
          ...e.currentTarget.querySelectorAll<HTMLInputElement>("input[type=file]"),
        ].reduce((soma, i) => soma + (i.files?.[0]?.size ?? 0), 0)
        if (total > LIMITE_ENVIO) {
          e.preventDefault()
          setEnvioErro(
            "Nota e boleto juntos passam de 4 MB. Envie arquivos menores (ex.: PDF em vez de digitalização em alta resolução)."
          )
        }
      }}
      className="grid gap-6"
    >
      {(envioErro || estado.erro) && (
        <Alert variant="destructive">
          <AlertDescription>{envioErro ?? estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="com_projeto" value={comProjeto ? "on" : ""} />
      <input
        type="hidden"
        name="modalidade"
        value={direta ? "direta" : "via_compras"}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Solicitação</CardTitle>
          <CardDescription>
            Via Aquisição registra a solicitação para o setor de compras cotar e
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
                Via Aquisição
              </span>
              <Switch
                checked={direta}
                onCheckedChange={setDireta}
                disabled={!permiteViaCompras || !permiteDireta}
                aria-label="Alternar entre via Aquisição e aquisição direta"
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

          {direta && (
            <div className="grid gap-2">
              <Label>Como preencher?</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    {
                      id: "manual",
                      icone: PencilLine,
                      titulo: "Manual",
                      texto: "Você digita todos os campos da compra.",
                    },
                    {
                      id: "semi",
                      icone: FileSearch,
                      titulo: "Semiautomático",
                      texto:
                        "Envie a nota ou o cupom fiscal: a IA lê o documento e preenche fornecedor, descrição, valor, data e pagamento para você conferir.",
                    },
                  ] as const
                ).map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setModo(op.id)}
                    aria-pressed={modo === op.id}
                    className={cn(
                      "flex items-start gap-3 rounded-md border p-3 text-left text-sm transition-colors",
                      modo === op.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    )}
                  >
                    <op.icone
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        modo === op.id ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                    <span className="grid gap-0.5">
                      <span className="font-medium">{op.titulo}</span>
                      <span className="text-muted-foreground text-xs">
                        {op.texto}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {semi && (
            <div className="grid gap-3 rounded-md border border-dashed p-4">
              <div className="grid gap-1.5">
                <Label htmlFor="nota_fiscal_semi">
                  Nota fiscal, cupom ou documento equivalente *
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="nota_fiscal_semi"
                    name="nota_fiscal"
                    ref={notaRef}
                    type="file"
                    required
                    accept={ACEITA_NOTA}
                    onChange={aoEscolherNota}
                    className="max-w-md"
                  />
                  <Button
                    type="button"
                    onClick={lerNota}
                    disabled={lendo || !notaNome}
                  >
                    {lendo ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    {lendo ? "Lendo a nota…" : leitura ? "Ler de novo" : "Ler com IA"}
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  PDF ou foto (JPG, PNG, WEBP). Fotos grandes são reduzidas
                  antes do envio. O arquivo fica anexado à compra.
                </p>
                {leituraErro && (
                  <p className="text-destructive text-xs">{leituraErro}</p>
                )}
                {!leitura && !lendo && (
                  <button
                    type="button"
                    onClick={() => setModo("manual")}
                    className="text-muted-foreground hover:text-foreground justify-self-start text-xs underline"
                  >
                    Preferir preencher à mão
                  </button>
                )}
              </div>

              {leitura && (
                <div className="grid gap-3">
                  <p className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    <span>
                      {leitura.documento} lido. Confira os campos abaixo
                      antes de cadastrar.
                    </span>
                  </p>
                  {(leitura.avisos?.length ?? 0) > 0 && (
                    <Alert variant="warning">
                      <AlertDescription>
                        <ul className="list-disc pl-4">
                          {leitura.avisos!.map((a) => (
                            <li key={a}>{a}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {leitura.fornecedorExistente && (
                    <p className="flex items-start gap-2 text-sm">
                      <Building2 className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                      <span>
                        Fornecedor{" "}
                        <strong>{leitura.fornecedorExistente.nome}</strong>{" "}
                        {leitura.fornecedorExistente.por === "documento"
                          ? "encontrado no cadastro pelo CNPJ/CPF e selecionado."
                          : "encontrado no cadastro pelo NOME e selecionado — confira se é a mesma empresa."}
                        {leitura.fornecedorExistente.bloqueado && (
                          <span className="text-destructive block">
                            Atenção: este fornecedor está bloqueado.
                          </span>
                        )}
                      </span>
                    </p>
                  )}
                  {cadastrado && (
                    <p className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="size-4 text-emerald-600" />
                      Fornecedor <strong>{cadastrado}</strong> cadastrado e
                      selecionado.
                    </p>
                  )}

                  {novoFornecedor && (
                    <div className="grid gap-3 rounded-md border p-3">
                      <p className="flex items-start gap-2 text-sm">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                        <span>
                          O emitente da nota <strong>não está cadastrado</strong>{" "}
                          como fornecedor. Confira os dados lidos e confirme o
                          cadastro — ou busque outro fornecedor no campo
                          Fornecedor, mais abaixo.
                        </span>
                      </p>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="grid gap-1.5">
                          <Label htmlFor="nf_razao">Razão social</Label>
                          <Input
                            id="nf_razao"
                            value={novoFornecedor.razao_social}
                            onChange={(e) =>
                              campoFornecedor("razao_social", e.target.value)
                            }
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor="nf_fantasia">Nome fantasia</Label>
                          <Input
                            id="nf_fantasia"
                            value={novoFornecedor.nome_fantasia}
                            onChange={(e) =>
                              campoFornecedor("nome_fantasia", e.target.value)
                            }
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor="nf_doc">CNPJ/CPF</Label>
                          <Input
                            id="nf_doc"
                            inputMode="numeric"
                            value={formatarCnpjCpf(novoFornecedor.cnpj_cpf)}
                            onChange={(e) =>
                              campoFornecedor(
                                "cnpj_cpf",
                                e.target.value.replace(/\D/g, "").slice(0, 14)
                              )
                            }
                          />
                        </div>
                      </div>
                      {novoFornecedor.endereco && (
                        <p className="text-muted-foreground text-xs">
                          Endereço lido (será gravado no cadastro):{" "}
                          {[
                            novoFornecedor.endereco.logradouro,
                            novoFornecedor.endereco.numero,
                            novoFornecedor.endereco.bairro,
                            [novoFornecedor.endereco.cidade, novoFornecedor.endereco.uf]
                              .filter(Boolean)
                              .join("/"),
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                      {cadastroErro && (
                        <p className="text-destructive text-xs">{cadastroErro}</p>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={confirmarFornecedor}
                        disabled={cadastrando}
                        className="justify-self-start"
                      >
                        {cadastrando ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Building2 />
                        )}
                        Confirmar e cadastrar fornecedor
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {mostrarCampos && (
            <div key={leituraVersao} className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="produto">Produto ou serviço *</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={melhorarTexto}
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
                    rows={4}
                    required
                    defaultValue={semi ? leitura?.produto : undefined}
                    placeholder="O que precisa ser adquirido"
                    className={TEXTAREA}
                  />
                  {iaErro && <p className="text-destructive text-xs">{iaErro}</p>}
                  <p className="text-muted-foreground text-xs">
                    A IA revisa a descrição e as observações: toda compra é
                    auditada.
                  </p>
                </div>
                <div className="grid gap-1.5 content-start">
                  <Label htmlFor="observacao">Observações</Label>
                  <textarea
                    id="observacao"
                    name="observacao"
                    ref={observacaoRef}
                    rows={4}
                    defaultValue={semi ? leitura?.observacao : undefined}
                    placeholder="Finalidade, justificativa, links de referência, quantidade…"
                    className={TEXTAREA}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="e_produto">Tipo *</Label>
                  <select
                    id="e_produto"
                    name="e_produto"
                    required
                    className={SELECT}
                    defaultValue={semi ? (leitura?.e_produto ?? "") : ""}
                  >
                    <option value="" disabled>
                      Escolha o tipo
                    </option>
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
                  <Switch
                    checked={noAto}
                    onCheckedChange={setNoAto}
                    aria-label="Entregue no ato da compra"
                  />
                  {direta
                    ? "Produto ou serviço entregue no ato da compra"
                    : "Entrega no ato da compra (ex.: retirada no balcão)"}
                </label>
                <input type="hidden" name="entrega_no_ato" value={noAto ? "on" : ""} />
                {!noAto && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="data_limite">Limite para receber *</Label>
                      <Input id="data_limite" name="data_limite" type="date" required />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="local_entrega">Local para receber *</Label>
                      <Input
                        id="local_entrega"
                        name="local_entrega"
                        required
                        placeholder="Ex.: sede principal"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {direta && mostrarCampos && (
        <Card key={leituraVersao}>
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
                  key={comboVersao}
                  empresas={fornecedores}
                  name="fornecedor_id"
                  defaultId={fornecedorId || undefined}
                  onChange={(id) => setFornecedorId(id ?? "")}
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
                    defaultValue={
                      (semi && leitura?.data_compra) || hojeLocalISO()
                    }
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
                    defaultValue={semi ? leitura?.valor : undefined}
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
                  value={forma}
                  onChange={(e) => setForma(e.target.value)}
                  required
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
                  required
                  defaultValue={semi ? leitura?.vencimento : undefined}
                />
              </div>
              {semi ? (
                <div className="grid gap-1.5">
                  <Label>Nota fiscal</Label>
                  <p className="text-muted-foreground truncate pt-2 text-sm">
                    {notaNome} (anexada)
                  </p>
                </div>
              ) : (
                <div className="grid gap-1.5">
                  <Label htmlFor="nota_fiscal">
                    Nota fiscal ou cupom (PDF ou imagem, até 4 MB) *
                  </Label>
                  <Input
                    id="nota_fiscal"
                    name="nota_fiscal"
                    type="file"
                    required
                    accept={ACEITA_NOTA}
                    onChange={async (e) => {
                      const { erro } = await prepararArquivo(e.currentTarget)
                      setArquivoErro(erro ?? null)
                    }}
                  />
                  {arquivoErro && (
                    <p className="text-destructive text-xs">{arquivoErro}</p>
                  )}
                </div>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <DetalhePagamento
                key={forma}
                forma={forma}
                fornecedorId={fornecedorId}
                cartoes={cartoes}
                caixas={caixas}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {mostrarCampos && (
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
      )}
    </form>
  )
}
