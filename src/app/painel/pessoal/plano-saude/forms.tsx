"use client"

import { useActionState, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Textarea } from "@/components/ui/textarea"
import { type EstadoForm } from "@/lib/contas"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import {
  avisosTabelaANS,
  CONDICOES_TITULAR,
  FAIXAS_ANS,
  GRAU_AGREGADO,
  GRAUS_DEPENDENTE,
  lerValor,
} from "@/lib/plano-saude"

import {
  apagarContratoAction,
  apagarItemAction,
  salvarBeneficiarioAction,
  salvarContratoAction,
  salvarCoparticipacaoAction,
  salvarProdutoAction,
  salvarRegraCusteioAction,
  salvarRegraDependenteAction,
  salvarTabelaAction,
} from "./actions"

type Acao = (p: EstadoForm, f: FormData) => Promise<EstadoForm>

/** Formulário com server action: erro no topo, botão com "salvando". */
function FormAcao({
  acao,
  children,
  botao = "Salvar",
  cancelarHref,
  pergunta,
  className = "grid gap-4",
}: {
  acao: Acao
  children: ReactNode
  botao?: string
  cancelarHref?: string
  pergunta?: string
  className?: string
}) {
  const [estado, formAction, pendente] = useActionState(acao, {})
  const envio = useEnvioFormulario(formAction, estado, pergunta ? { antes: (e) => confirmarEnvio(e, pergunta) } : {})
  return (
    <form action={formAction} {...envio} className={className}>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && <p className="text-success-fg text-sm">{estado.ok}</p>}
      {children}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {botao}
        </Button>
        {cancelarHref && (
          <Button variant="ghost" asChild>
            <Link href={cancelarHref}>Cancelar</Link>
          </Button>
        )}
      </div>
    </form>
  )
}

function Campo({ id, rotulo, children, dica }: { id: string; rotulo: string; children: ReactNode; dica?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {dica && <p className="text-muted-foreground text-xs">{dica}</p>}
    </div>
  )
}

function Caixas({ nome, opcoes, marcados, rotulo, dica }: { nome: string; opcoes: { valor: string; rotulo: string }[]; marcados: string[] | null; rotulo: string; dica?: string }) {
  if (opcoes.length === 0) return null
  return (
    <fieldset className="grid gap-1.5">
      <legend className="text-sm font-medium">{rotulo}</legend>
      {dica && <p className="text-muted-foreground text-xs">{dica}</p>}
      <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-y-auto rounded-md border p-2">
        {opcoes.map((o) => (
          <label key={o.valor} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name={nome} value={o.valor} defaultChecked={marcados?.includes(o.valor)} />
            {o.rotulo}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

const valorTexto = (v: number | null | undefined) =>
  v === null || v === undefined ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Contrato ────────────────────────────────────────────────────────────────

export type ContratoDados = {
  id: string
  nome: string
  operadora: string
  registroAnsOperadora: string | null
  contratoId: string | null
  tipoContratacao: string
  mesAniversario: number | null
  faixaMuda: string
  coparticipacao: boolean
  inicio: string | null
  fim: string | null
  observacoes: string | null
  ativo: boolean
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

export function ContratoForm({
  contrato,
  vinculaveis,
  cancelarHref,
}: {
  contrato?: ContratoDados
  vinculaveis: { id: string; rotulo: string }[]
  cancelarHref?: string
}) {
  return (
    <FormAcao acao={salvarContratoAction} botao={contrato ? "Salvar contrato" : "Cadastrar contrato"} cancelarHref={cancelarHref}>
      {contrato && <input type="hidden" name="id" value={contrato.id} />}
      {contrato && <input type="hidden" name="tem_ativo" value="1" />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="nome" rotulo="Nome do contrato *">
          <Input id="nome" name="nome" defaultValue={contrato?.nome} placeholder="Ex.: Unimed — empresarial" required />
        </Campo>
        <Campo id="operadora" rotulo="Operadora *">
          <Input id="operadora" name="operadora" defaultValue={contrato?.operadora} required />
        </Campo>
        <Campo id="registro_ans_operadora" rotulo="Registro da operadora na ANS">
          <Input id="registro_ans_operadora" name="registro_ans_operadora" defaultValue={contrato?.registroAnsOperadora ?? ""} />
        </Campo>
        <Campo id="tipo_contratacao" rotulo="Tipo de contratação">
          <SelectNativo id="tipo_contratacao" name="tipo_contratacao" defaultValue={contrato?.tipoContratacao ?? "coletivo_empresarial"}>
            <option value="coletivo_empresarial">Coletivo empresarial</option>
            <option value="coletivo_adesao">Coletivo por adesão</option>
            <option value="individual">Individual ou familiar</option>
          </SelectNativo>
        </Campo>
        <Campo id="mes_aniversario" rotulo="Mês de aniversário (reajuste anual)">
          <SelectNativo id="mes_aniversario" name="mes_aniversario" defaultValue={contrato?.mesAniversario ?? ""}>
            <option value="">Não informado</option>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </SelectNativo>
        </Campo>
        <Campo id="faixa_muda" rotulo="Mudança de faixa etária vale">
          <SelectNativo id="faixa_muda" name="faixa_muda" defaultValue={contrato?.faixaMuda ?? "mes_seguinte"}>
            <option value="mes_seguinte">No mês seguinte ao aniversário</option>
            <option value="mes_aniversario">Já no mês do aniversário</option>
          </SelectNativo>
        </Campo>
        <Campo id="inicio" rotulo="Início do contrato">
          <Input id="inicio" name="inicio" type="date" defaultValue={contrato?.inicio ?? ""} />
        </Campo>
        <Campo id="fim" rotulo="Fim do contrato">
          <Input id="fim" name="fim" type="date" defaultValue={contrato?.fim ?? ""} />
        </Campo>
        <Campo id="contrato_id" rotulo="Contrato em Contratos" dica="Para ligar ao fornecedor, à vigência e ao arquivo já cadastrados.">
          <SelectNativo id="contrato_id" name="contrato_id" defaultValue={contrato?.contratoId ?? ""}>
            <option value="">Nenhum</option>
            {vinculaveis.map((v) => (
              <option key={v.id} value={v.id}>
                {v.rotulo}
              </option>
            ))}
          </SelectNativo>
        </Campo>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="coparticipacao" defaultChecked={contrato?.coparticipacao} />
        O contrato cobra coparticipação
      </label>
      {contrato && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ativo" defaultChecked={contrato.ativo} />
          Contrato ativo
        </label>
      )}
      <Campo id="observacoes" rotulo="Observações">
        <Textarea id="observacoes" name="observacoes" rows={2} defaultValue={contrato?.observacoes ?? ""} />
      </Campo>
    </FormAcao>
  )
}

export function ApagarContratoBotao({ id }: { id: string }) {
  return (
    <FormAcao acao={apagarContratoAction} botao="Apagar contrato" pergunta="Apagar este contrato, com produtos, tabelas e regras?" className="grid gap-2">
      <input type="hidden" name="id" value={id} />
    </FormAcao>
  )
}

// ── Produto ─────────────────────────────────────────────────────────────────

export type ProdutoDados = { id: string; nome: string; registroAns: string | null; acomodacao: string | null; abrangencia: string | null; ativo: boolean }

export function ProdutoForm({ contratoId, produto, cancelarHref }: { contratoId: string; produto?: ProdutoDados; cancelarHref?: string }) {
  return (
    <FormAcao acao={salvarProdutoAction} botao={produto ? "Salvar produto" : "Adicionar produto"} cancelarHref={cancelarHref}>
      <input type="hidden" name="contrato_id" value={contratoId} />
      {produto && <input type="hidden" name="id" value={produto.id} />}
      {produto && <input type="hidden" name="tem_ativo" value="1" />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="p-nome" rotulo="Nome do produto *">
          <Input id="p-nome" name="nome" defaultValue={produto?.nome} placeholder="Ex.: Básico enfermaria" required />
        </Campo>
        <Campo id="p-ans" rotulo="Registro do produto na ANS">
          <Input id="p-ans" name="registro_ans" defaultValue={produto?.registroAns ?? ""} />
        </Campo>
        <Campo id="p-acomodacao" rotulo="Acomodação">
          <SelectNativo id="p-acomodacao" name="acomodacao" defaultValue={produto?.acomodacao ?? ""}>
            <option value="">Não informada</option>
            <option value="enfermaria">Enfermaria</option>
            <option value="apartamento">Apartamento</option>
          </SelectNativo>
        </Campo>
        <Campo id="p-abrangencia" rotulo="Abrangência">
          <Input id="p-abrangencia" name="abrangencia" defaultValue={produto?.abrangencia ?? ""} placeholder="Ex.: estadual" />
        </Campo>
      </div>
      {produto && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ativo" defaultChecked={produto.ativo} />
          Produto ativo
        </label>
      )}
    </FormAcao>
  )
}

// ── Tabela de preço ─────────────────────────────────────────────────────────

export type TabelaDados = {
  id: string
  inicio: string
  fim: string | null
  motivo: string
  percentual: number | null
  precos: number[]
  observacao: string | null
}

export function TabelaForm({
  produtoId,
  tabela,
  base,
  cancelarHref,
}: {
  produtoId: string
  tabela?: TabelaDados
  /** Preços da tabela mais recente, para o reajuste. */
  base?: number[]
  cancelarHref?: string
}) {
  const [precos, setPrecos] = useState<string[]>(() => (tabela?.precos ?? base ?? Array(10).fill(null)).map((p) => valorTexto(p)))
  const [reajuste, setReajuste] = useState("")
  const avisos = useMemo(() => {
    const n = precos.map((p) => lerValor(p))
    return n.every((x) => x !== null) ? avisosTabelaANS(n as number[]) : []
  }, [precos])
  const aplicar = () => {
    const pct = lerValor(reajuste)
    if (pct === null || !base) return
    setPrecos(base.map((p) => valorTexto(Math.round(p * (1 + pct / 100) * 100) / 100)))
  }
  return (
    <FormAcao acao={salvarTabelaAction} botao={tabela ? "Salvar tabela" : "Gravar tabela"} cancelarHref={cancelarHref}>
      <input type="hidden" name="produto_id" value={produtoId} />
      {tabela && <input type="hidden" name="id" value={tabela.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo id={`t-ini-${produtoId}`} rotulo="Vigência a partir de *">
          <Input id={`t-ini-${produtoId}`} name="vigencia_inicio" type="date" defaultValue={tabela?.inicio ?? ""} required />
        </Campo>
        <Campo id={`t-fim-${produtoId}`} rotulo="Até (opcional)" dica="Em branco: vale até a próxima tabela.">
          <Input id={`t-fim-${produtoId}`} name="vigencia_fim" type="date" defaultValue={tabela?.fim ?? ""} />
        </Campo>
        <Campo id={`t-motivo-${produtoId}`} rotulo="Motivo">
          <SelectNativo id={`t-motivo-${produtoId}`} name="motivo" defaultValue={tabela?.motivo ?? (base ? "reajuste_anual" : "inicial")}>
            <option value="inicial">Tabela inicial</option>
            <option value="reajuste_anual">Reajuste anual</option>
            <option value="reajuste_ans">Reajuste autorizado pela ANS</option>
            <option value="renegociacao">Renegociação</option>
            <option value="correcao">Correção</option>
          </SelectNativo>
        </Campo>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`t-pct-${produtoId}`}>Percentual de reajuste (%)</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id={`t-pct-${produtoId}`}
            name="percentual"
            inputMode="decimal"
            className="max-w-32"
            value={reajuste}
            onChange={(e) => setReajuste(e.target.value)}
            placeholder={tabela?.percentual != null ? valorTexto(tabela.percentual) : "Ex.: 9,63"}
          />
          {base && !tabela && (
            <Button type="button" variant="outline" size="sm" onClick={aplicar}>
              Aplicar sobre a tabela atual
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {FAIXAS_ANS.map((f, i) => (
          <Campo key={f.rotulo} id={`t-${produtoId}-${i}`} rotulo={`${f.rotulo} anos (R$)`}>
            <Input
              id={`t-${produtoId}-${i}`}
              name={`preco_${i}`}
              inputMode="decimal"
              value={precos[i]}
              onChange={(e) => setPrecos((p) => p.map((v, k) => (k === i ? e.target.value : v)))}
              required
            />
          </Campo>
        ))}
      </div>
      {avisos.length > 0 && (
        <Alert>
          <AlertDescription>
            {avisos.join(" ")}
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" name="aceitar_avisos" />
              Gravar mesmo assim
            </label>
          </AlertDescription>
        </Alert>
      )}
      <Campo id={`t-obs-${produtoId}`} rotulo="Observação">
        <Input id={`t-obs-${produtoId}`} name="observacao" defaultValue={tabela?.observacao ?? ""} />
      </Campo>
    </FormAcao>
  )
}

// ── Regras de custeio ───────────────────────────────────────────────────────

export type RegraCusteioDados = {
  id: string
  nome: string
  prioridade: number
  inicio: string | null
  fim: string | null
  beneficiarios: string[] | null
  condicoes: string[] | null
  produtos: string[] | null
  cargos: string[] | null
  departamentos: string[] | null
  funcionarios: string[] | null
  idadeMin: number | null
  idadeMax: number | null
  modo: string
  entidadePercentual: number | null
  entidadeValor: number | null
  entidadeTeto: number | null
  copartFuncionarioPercentual: number | null
  copartLimiteMensal: number | null
  clausula: string | null
  ativo: boolean
}

export function RegraCusteioForm({
  contratoId,
  regra,
  produtos,
  cargos,
  departamentos,
  funcionarios,
  coparticipacao,
  cancelarHref,
}: {
  contratoId: string
  regra?: RegraCusteioDados
  produtos: { id: string; nome: string }[]
  cargos: string[]
  departamentos: string[]
  funcionarios: { id: string; nome: string }[]
  coparticipacao: boolean
  cancelarHref?: string
}) {
  const [modo, setModo] = useState(regra?.modo ?? "percentual")
  return (
    <FormAcao acao={salvarRegraCusteioAction} botao={regra ? "Salvar regra" : "Adicionar regra"} cancelarHref={cancelarHref}>
      <input type="hidden" name="contrato_id" value={contratoId} />
      {regra && <input type="hidden" name="id" value={regra.id} />}
      {regra && <input type="hidden" name="tem_ativo" value="1" />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo id="r-nome" rotulo="Nome da regra *">
          <Input id="r-nome" name="nome" defaultValue={regra?.nome} placeholder="Ex.: Titular 100%" required />
        </Campo>
        <Campo id="r-prio" rotulo="Prioridade" dica="Menor primeiro: a primeira regra que casa vale.">
          <Input id="r-prio" name="prioridade" type="number" defaultValue={regra?.prioridade ?? 100} />
        </Campo>
        <Campo id="r-modo" rotulo="A entidade paga">
          <SelectNativo id="r-modo" name="modo" value={modo} onChange={(e) => setModo(e.target.value)}>
            <option value="percentual">Um percentual da mensalidade</option>
            <option value="valor_fixo">Um valor fixo</option>
          </SelectNativo>
        </Campo>
        {modo === "percentual" ? (
          <Campo id="r-pct" rotulo="Percentual pago pela entidade (%) *">
            <Input id="r-pct" name="entidade_percentual" inputMode="decimal" defaultValue={valorTexto(regra?.entidadePercentual)} placeholder="Ex.: 100" />
          </Campo>
        ) : (
          <Campo id="r-valor" rotulo="Valor pago pela entidade (R$) *">
            <Input id="r-valor" name="entidade_valor" inputMode="decimal" defaultValue={valorTexto(regra?.entidadeValor)} />
          </Campo>
        )}
        <Campo id="r-teto" rotulo="Teto da entidade por pessoa (R$)" dica="Em branco: sem teto.">
          <Input id="r-teto" name="entidade_teto" inputMode="decimal" defaultValue={valorTexto(regra?.entidadeTeto)} />
        </Campo>
        <Campo id="r-clausula" rotulo="Cláusula do acordo coletivo">
          <Input id="r-clausula" name="clausula" defaultValue={regra?.clausula ?? ""} placeholder="Ex.: ACT 2025/26, cl. 18" />
        </Campo>
      </div>
      {coparticipacao && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="r-copart" rotulo="Coparticipação descontada do funcionário (%)" dica="Em branco: 100%.">
            <Input id="r-copart" name="copart_funcionario_percentual" inputMode="decimal" defaultValue={valorTexto(regra?.copartFuncionarioPercentual)} />
          </Campo>
          <Campo id="r-copart-lim" rotulo="Limite mensal do desconto de coparticipação (R$)">
            <Input id="r-copart-lim" name="copart_limite_mensal" inputMode="decimal" defaultValue={valorTexto(regra?.copartLimiteMensal)} />
          </Campo>
        </div>
      )}
      <p className="text-sm font-medium">A quem a regra se aplica (em branco = a todos)</p>
      <Caixas
        nome="beneficiarios"
        rotulo="Beneficiários"
        marcados={regra?.beneficiarios ?? null}
        opcoes={[{ valor: "titular", rotulo: "Titular" }, ...[...GRAUS_DEPENDENTE, GRAU_AGREGADO].map((g) => ({ valor: g, rotulo: g }))]}
      />
      <Caixas
        nome="condicoes"
        rotulo="Condição do titular"
        marcados={regra?.condicoes ?? null}
        opcoes={CONDICOES_TITULAR.map((c) => ({ valor: c.chave, rotulo: c.rotulo }))}
      />
      <Caixas nome="produtos" rotulo="Produtos" marcados={regra?.produtos ?? null} opcoes={produtos.map((p) => ({ valor: p.id, rotulo: p.nome }))} />
      <Caixas nome="cargos" rotulo="Cargos do titular" marcados={regra?.cargos ?? null} opcoes={cargos.map((c) => ({ valor: c, rotulo: c }))} />
      <Caixas nome="departamentos" rotulo="Departamentos do titular" marcados={regra?.departamentos ?? null} opcoes={departamentos.map((d) => ({ valor: d, rotulo: d }))} />
      <Caixas
        nome="funcionarios"
        rotulo="Titulares específicos"
        dica="Para exceções individuais (com prioridade menor que a regra geral)."
        marcados={regra?.funcionarios ?? null}
        opcoes={funcionarios.map((f) => ({ valor: f.id, rotulo: f.nome }))}
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <Campo id="r-idmin" rotulo="Idade mínima">
          <Input id="r-idmin" name="idade_min" type="number" min={0} defaultValue={regra?.idadeMin ?? ""} />
        </Campo>
        <Campo id="r-idmax" rotulo="Idade máxima">
          <Input id="r-idmax" name="idade_max" type="number" min={0} defaultValue={regra?.idadeMax ?? ""} />
        </Campo>
        <Campo id="r-vini" rotulo="Vale a partir de">
          <Input id="r-vini" name="vigencia_inicio" type="date" defaultValue={regra?.inicio ?? ""} />
        </Campo>
        <Campo id="r-vfim" rotulo="Vale até">
          <Input id="r-vfim" name="vigencia_fim" type="date" defaultValue={regra?.fim ?? ""} />
        </Campo>
      </div>
      {regra && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ativo" defaultChecked={regra.ativo} />
          Regra ativa
        </label>
      )}
    </FormAcao>
  )
}

// ── Regras de dependentes ───────────────────────────────────────────────────

export type RegraDependenteDados = { id: string; grau: string; permitido: boolean; idadeLimite: number | null; idadeLimiteEstudante: number | null; observacao: string | null }

export function RegraDependenteForm({
  contratoId,
  regra,
  usados,
  cancelarHref,
}: {
  contratoId: string
  regra?: RegraDependenteDados
  /** Graus já com regra (não aparecem para nova regra). */
  usados: string[]
  cancelarHref?: string
}) {
  const graus = [...GRAUS_DEPENDENTE, GRAU_AGREGADO].filter((g) => g === regra?.grau || !usados.includes(g))
  if (!regra && graus.length === 0) return <p className="text-muted-foreground text-sm">Todos os graus já têm regra.</p>
  return (
    <FormAcao acao={salvarRegraDependenteAction} botao={regra ? "Salvar" : "Adicionar"} cancelarHref={cancelarHref}>
      <input type="hidden" name="contrato_id" value={contratoId} />
      {regra && <input type="hidden" name="id" value={regra.id} />}
      <div className="grid gap-4 sm:grid-cols-4">
        <Campo id="d-grau" rotulo="Grau *">
          <SelectNativo id="d-grau" name="grau" defaultValue={regra?.grau ?? ""} required>
            <option value="" disabled>
              Escolha…
            </option>
            {graus.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </SelectNativo>
        </Campo>
        <Campo id="d-limite" rotulo="Perde o direito aos (anos)" dica="Em branco: sem limite.">
          <Input id="d-limite" name="idade_limite" type="number" min={0} defaultValue={regra?.idadeLimite ?? ""} />
        </Campo>
        <Campo id="d-estudante" rotulo="Se estudante, aos (anos)">
          <Input id="d-estudante" name="idade_limite_estudante" type="number" min={0} defaultValue={regra?.idadeLimiteEstudante ?? ""} />
        </Campo>
        <Campo id="d-obs" rotulo="Observação">
          <Input id="d-obs" name="observacao" defaultValue={regra?.observacao ?? ""} />
        </Campo>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="permitido" defaultChecked={regra ? regra.permitido : true} />
        Pode entrar no plano (o benefício se estende a este grau)
      </label>
    </FormAcao>
  )
}

// ── Beneficiários ───────────────────────────────────────────────────────────

export type BeneficiarioDados = {
  id: string
  produtoId: string
  titularId: string
  tipo: string
  dependenteId: string | null
  grau: string
  nome: string
  nascimento: string | null
  cpf: string | null
  condicao: string
  carteirinha: string | null
  inclusao: string
  exclusao: string | null
  motivoExclusao: string | null
  estudanteAte: string | null
  observacao: string | null
}

export function BeneficiarioForm({
  produtos,
  titulares,
  dependentes,
  beneficiario,
  cancelarHref,
}: {
  produtos: { id: string; nome: string }[]
  titulares: { id: string; nome: string; ativo: boolean }[]
  dependentes: { id: string; funcionarioId: string; nome: string; grau: string | null }[]
  beneficiario?: BeneficiarioDados
  cancelarHref?: string
}) {
  const [tipo, setTipo] = useState(beneficiario?.tipo ?? "titular")
  const [titular, setTitular] = useState(beneficiario?.titularId ?? "")
  const [dependente, setDependente] = useState(beneficiario?.dependenteId ?? "")
  const doTitular = dependentes.filter((d) => d.funcionarioId === titular)
  return (
    <FormAcao acao={salvarBeneficiarioAction} botao={beneficiario ? "Salvar" : "Incluir no plano"} cancelarHref={cancelarHref}>
      {beneficiario && <input type="hidden" name="id" value={beneficiario.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo id="b-tipo" rotulo="Quem *">
          <SelectNativo id="b-tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={Boolean(beneficiario)}>
            <option value="titular">Titular (o funcionário)</option>
            <option value="dependente">Dependente do titular</option>
            <option value="agregado">Agregado</option>
          </SelectNativo>
          {beneficiario && <input type="hidden" name="tipo" value={tipo} />}
        </Campo>
        <Campo id="b-titular" rotulo="Titular *">
          <SelectNativo id="b-titular" name="titular_id" value={titular} onChange={(e) => setTitular(e.target.value)} required disabled={Boolean(beneficiario)}>
            <option value="" disabled>
              Escolha…
            </option>
            {titulares.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
                {t.ativo ? "" : " (desligado)"}
              </option>
            ))}
          </SelectNativo>
          {beneficiario && <input type="hidden" name="titular_id" value={titular} />}
        </Campo>
        <Campo id="b-produto" rotulo="Produto *">
          <SelectNativo id="b-produto" name="produto_id" defaultValue={beneficiario?.produtoId ?? (produtos.length === 1 ? produtos[0].id : "")} required>
            <option value="" disabled>
              Escolha…
            </option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </SelectNativo>
        </Campo>
      </div>

      {tipo === "titular" && (
        <Campo id="b-condicao" rotulo="Condição do titular">
          <SelectNativo id="b-condicao" name="condicao" defaultValue={beneficiario?.condicao ?? "ativo"}>
            {CONDICOES_TITULAR.map((c) => (
              <option key={c.chave} value={c.chave}>
                {c.rotulo}
              </option>
            ))}
          </SelectNativo>
        </Campo>
      )}

      {tipo === "dependente" && (
        <>
          <Campo id="b-dep" rotulo="Dependente *" dica={titular ? undefined : "Escolha o titular primeiro."}>
            <SelectNativo id="b-dep" name="dependente_id" value={dependente} onChange={(e) => setDependente(e.target.value)} disabled={Boolean(beneficiario)}>
              <option value="">Escolha…</option>
              {doTitular.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                  {d.grau ? ` (${d.grau})` : ""}
                </option>
              ))}
              {!beneficiario && <option value="novo">+ Cadastrar dependente novo</option>}
            </SelectNativo>
            {beneficiario && <input type="hidden" name="dependente_id" value={dependente} />}
          </Campo>
          {dependente === "novo" && (
            <div className="grid gap-4 rounded-md border p-3 sm:grid-cols-4">
              <Campo id="b-novo-nome" rotulo="Nome completo *">
                <Input id="b-novo-nome" name="novo_nome" />
              </Campo>
              <Campo id="b-novo-grau" rotulo="Grau *">
                <SelectNativo id="b-novo-grau" name="novo_grau" defaultValue="">
                  <option value="" disabled>
                    Escolha…
                  </option>
                  {GRAUS_DEPENDENTE.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </SelectNativo>
              </Campo>
              <Campo id="b-novo-nasc" rotulo="Nascimento *">
                <Input id="b-novo-nasc" name="novo_nascimento" type="date" />
              </Campo>
              <Campo id="b-novo-cpf" rotulo="CPF">
                <Input id="b-novo-cpf" name="novo_cpf" inputMode="numeric" />
              </Campo>
              <p className="text-muted-foreground text-xs sm:col-span-4">O dependente também entra no cadastro do funcionário em Pessoal.</p>
            </div>
          )}
          <Campo id="b-estudante" rotulo="Comprovante de estudante válido até" dica="Vale a idade-limite de estudante até esta data.">
            <Input id="b-estudante" name="estudante_ate" type="date" defaultValue={beneficiario?.estudanteAte ?? ""} className="max-w-48" />
          </Campo>
        </>
      )}

      {tipo === "agregado" && (
        <div className="grid gap-4 sm:grid-cols-4">
          <Campo id="b-ag-nome" rotulo="Nome do agregado *">
            <Input id="b-ag-nome" name="nome" defaultValue={beneficiario?.nome ?? ""} />
          </Campo>
          <Campo id="b-ag-nasc" rotulo="Nascimento *">
            <Input id="b-ag-nasc" name="nascimento" type="date" defaultValue={beneficiario?.nascimento ?? ""} />
          </Campo>
          <Campo id="b-ag-cpf" rotulo="CPF">
            <Input id="b-ag-cpf" name="cpf" inputMode="numeric" defaultValue={beneficiario?.cpf ?? ""} />
          </Campo>
          <Campo id="b-ag-grau" rotulo="Parentesco">
            <Input id="b-ag-grau" name="grau" defaultValue={beneficiario?.tipo === "agregado" ? beneficiario.grau : GRAU_AGREGADO} />
          </Campo>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <Campo id="b-cart" rotulo="Carteirinha">
          <Input id="b-cart" name="carteirinha" defaultValue={beneficiario?.carteirinha ?? ""} />
        </Campo>
        <Campo id="b-inc" rotulo="Inclusão *">
          <Input id="b-inc" name="inclusao" type="date" defaultValue={beneficiario?.inclusao ?? ""} required />
        </Campo>
        <Campo id="b-exc" rotulo="Exclusão">
          <Input id="b-exc" name="exclusao" type="date" defaultValue={beneficiario?.exclusao ?? ""} />
        </Campo>
        <Campo id="b-motivo" rotulo="Motivo da exclusão">
          <Input id="b-motivo" name="motivo_exclusao" defaultValue={beneficiario?.motivoExclusao ?? ""} />
        </Campo>
      </div>
      <Campo id="b-obs" rotulo="Observação">
        <Input id="b-obs" name="observacao" defaultValue={beneficiario?.observacao ?? ""} />
      </Campo>
    </FormAcao>
  )
}

// ── Apagar item e coparticipação ────────────────────────────────────────────

export function ApagarItemBotao({ tipo, id, contratoId, pergunta }: { tipo: string; id: string; contratoId: string; pergunta: string }) {
  const [estado, formAction, pendente] = useActionState(apagarItemAction, {})
  const envio = useEnvioFormulario(formAction, estado, { antes: (e) => confirmarEnvio(e, pergunta) })
  return (
    <form action={formAction} {...envio} className="inline">
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="contrato_id" value={contratoId} />
      <Button type="submit" variant="ghost" size="icon-sm" aria-label="Apagar" title={estado.erro ?? "Apagar"} disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

export function CoparticipacaoForm({ contratoId, titularId, competencia, valor }: { contratoId: string; titularId: string; competencia: string; valor: number }) {
  const [estado, formAction, pendente] = useActionState(salvarCoparticipacaoAction, {})
  const envio = useEnvioFormulario(formAction, estado)
  return (
    <form action={formAction} {...envio} className="flex items-center gap-1.5">
      <input type="hidden" name="contrato_id" value={contratoId} />
      <input type="hidden" name="titular_id" value={titularId} />
      <input type="hidden" name="competencia" value={competencia} />
      <Input name="valor" inputMode="decimal" aria-label="Coparticipação do mês (R$)" defaultValue={valorTexto(valor || null)} className="h-7 w-24" placeholder="0,00" />
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : "Gravar"}
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}
