"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DETALHE_DA_FORMA,
  type FormaPagamentoCompras,
} from "@/lib/compras-constantes"
import { TIPOS_CHAVE_PIX, TIPOS_CONTA } from "@/lib/contracheques-constantes"
import { formatarMoeda } from "@/lib/formato"
import type {
  ContaFornecedor,
  PixFornecedor,
} from "@/lib/db/compras-pagamento"

import { ACEITA_NOTA, LIMITE_ENVIO, prepararArquivo } from "./arquivo-envio"
import { meiosDoFornecedor } from "./pagamento-actions"

export type CartaoOpcao = { id: string; nome: string }
export type CaixaOpcao = {
  id: string
  nome: string
  responsavel: string | null
  saldo: number
}

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 font-mono text-xs shadow-xs outline-none"

const NOVA = "nova"

/**
 * "Com o quê foi paga": o campo muda conforme a forma — cartão da entidade,
 * conta de caixa, chave Pix ou conta do fornecedor (escolhe uma cadastrada ou
 * informa uma nova, que vai para o cadastro dele), código Pix copia e cola ou
 * o arquivo do boleto. Todos obrigatórios.
 */
export function DetalhePagamento({
  forma,
  fornecedorId,
  cartoes,
  caixas,
  buscarMeios = meiosDoFornecedor,
  futuro = false,
  boletosEsperados,
}: {
  forma: string
  fornecedorId: string
  cartoes: CartaoOpcao[]
  caixas: CaixaOpcao[]
  /**
   * Pagamento AINDA vai acontecer (ordens de contrato): os textos falam do
   * que será pago, não do que foi, e o caixa só é debitado no pagamento.
   */
  futuro?: boolean
  /** Vários boletos, um por parcela (na ordem dos vencimentos). */
  boletosEsperados?: number
  /** De onde vêm as chaves/contas do fornecedor (padrão: a da compra direta). */
  buscarMeios?: (
    fornecedorId: string
  ) => Promise<{ pix: PixFornecedor[]; contas: ContaFornecedor[] }>
}) {
  const tipo = DETALHE_DA_FORMA[forma as FormaPagamentoCompras] ?? null
  const precisaFornecedor = tipo === "pix_fornecedor" || tipo === "conta_fornecedor"

  const [meios, setMeios] = useState<{
    fornecedorId: string
    pix: PixFornecedor[]
    contas: ContaFornecedor[]
  } | null>(null)
  const [escolha, setEscolha] = useState("")
  const [boletoErro, setBoletoErro] = useState<string | null>(null)

  useEffect(() => {
    if (!precisaFornecedor || !fornecedorId) return
    let vivo = true
    buscarMeios(fornecedorId).then((m) => {
      if (vivo) setMeios({ fornecedorId, ...m })
    })
    return () => {
      vivo = false
    }
  }, [precisaFornecedor, fornecedorId, buscarMeios])

  if (!tipo) return null

  if (tipo === "cartao") {
    return (
      <div className="grid gap-1.5">
        <Label htmlFor="cartao_id">Cartão usado *</Label>
        {cartoes.length === 0 ? (
          <p className="text-destructive text-xs">
            Nenhum cartão cadastrado. Peça ao financeiro para cadastrar em
            Financeiro → Cartões.
          </p>
        ) : (
          <select id="cartao_id" name="cartao_id" required defaultValue="" className={SELECT}>
            <option value="" disabled>
              Escolha o cartão
            </option>
            {cartoes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        )}
      </div>
    )
  }

  if (tipo === "caixa") {
    return (
      <div className="grid gap-1.5">
        <Label htmlFor="caixa_conta_id">Conta de caixa de onde saiu o dinheiro *</Label>
        {caixas.length === 0 ? (
          <p className="text-destructive text-xs">
            Nenhuma conta de caixa aberta. O financeiro abre e abastece o
            caixa em Financeiro → Contas de caixa.
          </p>
        ) : (
          <>
            <select
              id="caixa_conta_id"
              name="caixa_conta_id"
              required
              defaultValue=""
              className={SELECT}
            >
              <option value="" disabled>
                Escolha a conta de caixa
              </option>
              {caixas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.responsavel ? ` — ${c.responsavel}` : ""} (saldo{" "}
                  {formatarMoeda(c.saldo)})
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-xs">
              {futuro
                ? "O valor sai desta conta quando a ordem for paga."
                : "O valor da compra é debitado desta conta."}
            </p>
          </>
        )}
      </div>
    )
  }

  if (tipo === "pix_codigo") {
    return (
      <div className="grid gap-1.5 md:col-span-2">
        <Label htmlFor="pix_codigo">
          {futuro
            ? "Código Pix copia e cola (ou o conteúdo do QR Code) para o pagamento *"
            : "Código Pix copia e cola usado no pagamento *"}
        </Label>
        <textarea
          id="pix_codigo"
          name="pix_codigo"
          required
          rows={3}
          placeholder="00020126…"
          className={TEXTAREA}
        />
      </div>
    )
  }

  if (tipo === "boleto" && boletosEsperados !== undefined) {
    const n = boletosEsperados
    return (
      <div className="grid gap-1.5 md:col-span-2">
        <Label htmlFor="boleto_arquivo">
          {n === 1 ? "Arquivo do boleto (PDF ou imagem) *" : `Boletos — ${n} arquivos, um por parcela *`}
        </Label>
        <Input
          id="boleto_arquivo"
          name="boleto_arquivo"
          type="file"
          required
          multiple={n > 1}
          accept={ACEITA_NOTA}
          onChange={(e) => {
            const arquivos = [...(e.currentTarget.files ?? [])]
            const total = arquivos.reduce((s, a) => s + a.size, 0)
            const tipoRuim = arquivos.some((a) => !ACEITA_NOTA.split(",").includes(a.type))
            setBoletoErro(
              tipoRuim
                ? "Envie PDF ou imagem (JPG, PNG ou WEBP)."
                : total > LIMITE_ENVIO
                  ? "Os boletos passam de 3,8 MB juntos — gere menos parcelas por vez."
                  : arquivos.length !== n
                    ? `Escolha ${n} arquivo${n === 1 ? "" : "s"} (escolhidos: ${arquivos.length}).`
                    : null
            )
          }}
        />
        <p className="text-muted-foreground text-xs">
          {n === 1
            ? "Toda ordem de boleto nasce com o arquivo — é ele que o financeiro paga."
            : "Na ordem dos vencimentos: o 1º arquivo (por nome) vai para a 1ª parcela, e assim por diante. Sem todos os boletos em mãos, gere menos parcelas agora e o resto depois — vencimentos já gerados são pulados."}
        </p>
        {boletoErro && <p className="text-destructive text-xs">{boletoErro}</p>}
      </div>
    )
  }

  if (tipo === "boleto") {
    return (
      <div className="grid gap-1.5">
        <Label htmlFor="boleto_arquivo">Arquivo do boleto (PDF ou imagem) *</Label>
        <Input
          id="boleto_arquivo"
          name="boleto_arquivo"
          type="file"
          required
          accept={ACEITA_NOTA}
          onChange={async (e) => {
            const { erro } = await prepararArquivo(e.currentTarget)
            setBoletoErro(erro ?? null)
          }}
        />
        {boletoErro && <p className="text-destructive text-xs">{boletoErro}</p>}
      </div>
    )
  }

  // Pix do fornecedor ou conta do fornecedor (TED).
  const ePix = tipo === "pix_fornecedor"
  const rotulo = ePix ? "Chave Pix do fornecedor *" : "Conta do fornecedor (TED) *"
  if (!fornecedorId) {
    return (
      <div className="grid gap-1.5">
        <Label>{rotulo}</Label>
        <p className="text-muted-foreground text-xs">Escolha o fornecedor primeiro.</p>
      </div>
    )
  }
  const carregado = meios?.fornecedorId === fornecedorId ? meios : null
  if (!carregado) {
    return (
      <div className="grid gap-1.5">
        <Label>{rotulo}</Label>
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <Loader2 className="size-3 animate-spin" /> Buscando o cadastro do fornecedor…
        </p>
      </div>
    )
  }
  const opcoes = ePix
    ? carregado.pix.map((p) => ({
        id: p.id,
        rotulo: `${p.tipo ? `${p.tipo}: ` : ""}${p.chave}`,
      }))
    : carregado.contas.map((c) => ({
        id: c.id,
        rotulo: `${c.banco} · ag. ${c.agencia ?? "—"} · conta ${c.conta}${c.favorecido ? ` · ${c.favorecido}` : ""}`,
      }))
  // Sem nada cadastrado, já abre o "informar nova".
  const valorEscolha =
    opcoes.length === 0 ? NOVA : opcoes.some((o) => o.id === escolha) || escolha === NOVA ? escolha : ""

  return (
    <div className="grid gap-3 md:col-span-3">
      <div className="grid gap-1.5 md:max-w-xl">
        <Label htmlFor="dados_bancarios_id">{rotulo}</Label>
        <select
          id="dados_bancarios_id"
          name="dados_bancarios_id"
          required
          value={valorEscolha}
          onChange={(e) => setEscolha(e.target.value)}
          className={SELECT}
        >
          <option value="" disabled>
            {ePix ? "Escolha a chave" : "Escolha a conta"}
          </option>
          {opcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.rotulo}
            </option>
          ))}
          <option value={NOVA}>
            {ePix ? "Informar outra chave…" : "Informar outra conta…"}
          </option>
        </select>
        {opcoes.length === 0 && (
          <p className="text-muted-foreground text-xs">
            O fornecedor não tem {ePix ? "chave Pix" : "conta"} cadastrada:
            informe abaixo e ela fica gravada no cadastro dele.
          </p>
        )}
      </div>

      {valorEscolha === NOVA &&
        (ePix ? (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pix_tipo">Tipo da chave *</Label>
              <select id="pix_tipo" name="pix_tipo" required defaultValue="" className={SELECT}>
                <option value="" disabled>
                  Escolha o tipo
                </option>
                {TIPOS_CHAVE_PIX.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="pix_chave">Chave *</Label>
              <Input id="pix_chave" name="pix_chave" required />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-5">
            <div className="grid gap-1.5">
              <Label htmlFor="conta_banco">Banco *</Label>
              <Input id="conta_banco" name="conta_banco" required placeholder="Ex.: 001 Banco do Brasil" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="conta_agencia">Agência *</Label>
              <Input id="conta_agencia" name="conta_agencia" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="conta_numero">Conta *</Label>
              <Input id="conta_numero" name="conta_numero" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="conta_tipo">Tipo *</Label>
              <select id="conta_tipo" name="conta_tipo" required defaultValue="corrente" className={SELECT}>
                {TIPOS_CONTA.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="conta_favorecido">Favorecido *</Label>
              <Input id="conta_favorecido" name="conta_favorecido" required />
            </div>
          </div>
        ))}
    </div>
  )
}
