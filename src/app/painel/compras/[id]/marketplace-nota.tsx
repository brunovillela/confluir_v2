"use client"

import { startTransition, useActionState, useRef, useState } from "react"
import { Building2, CheckCircle2, FileUp, Link2, Loader2, Sparkles, TriangleAlert } from "lucide-react"

import { EmpresaCombobox, type EmpresaOpcao } from "@/components/empresa-combobox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ACEITA_NOTA, prepararArquivo } from "@/lib/arquivo-envio"
import { formatarCnpjCpf } from "@/lib/mascaras"

import { cadastrarFornecedorDaNota, lerNotaCompra, type FornecedorDaNota } from "../nova/ia-actions"
import { anexarNotaMarketplaceAction, vincularVendedorAction } from "./actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

type Estado = { erro?: string; ok?: string }

/**
 * Compra em marketplace: a nota do vendedor chega depois. A janela recebe o
 * arquivo, a IA lê o emitente (achado no cadastro ou oferecido para
 * cadastrar) e a nota é anexada com o vendedor ligado à compra.
 */
export function AnexarNotaMarketplace({
  processoId,
  fornecimentoId,
  marketplace,
  fornecedores: iniciais,
  vendedorAtual,
}: {
  processoId: string
  fornecimentoId: string
  marketplace: { id: string | null; nome: string }
  fornecedores: EmpresaOpcao[]
  vendedorAtual: string | null
}) {
  const [aberto, setAberto] = useState(false)
  const [fornecedores, setFornecedores] = useState(iniciais)
  const [vendedorId, setVendedorId] = useState(vendedorAtual ?? "")
  const [versao, setVersao] = useState(0)
  const [lendo, setLendo] = useState(false)
  const [leitura, setLeitura] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [novo, setNovo] = useState<FornecedorDaNota | null>(null)
  const [cadastrando, setCadastrando] = useState(false)
  const [arquivoErro, setArquivoErro] = useState<string | null>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)
  const [estado, acao, pendente] = useActionState(async (prev: Estado, fd: FormData) => {
    const r = await anexarNotaMarketplaceAction(prev, fd)
    if (r.ok) setAberto(false)
    return r
  }, {})

  function escolher(opcao: EmpresaOpcao) {
    setFornecedores((l) => (l.some((f) => f.id === opcao.id) ? l : [opcao, ...l]))
    setVendedorId(opcao.id)
    setVersao((v) => v + 1)
  }

  async function lerComIA() {
    const arquivo = arquivoRef.current?.files?.[0]
    if (!arquivo) return
    setLendo(true)
    setAviso(null)
    setNovo(null)
    const fd = new FormData()
    fd.set("nota_fiscal", arquivo)
    const r = await lerNotaCompra(fd)
    setLendo(false)
    if (r.erro) {
      setAviso(r.erro)
      return
    }
    setLeitura(r.documento ?? "Nota lida")
    const achado = r.fornecedorExistente
    if (achado && achado.id === marketplace.id) {
      setAviso(`A nota foi emitida pelo próprio ${marketplace.nome} — escolha o vendedor abaixo se for outro.`)
      return
    }
    if (achado) {
      escolher({ id: achado.id, nome: achado.nome, cnpj_cpf: achado.cnpj_cpf, bloqueado: achado.bloqueado })
      if (achado.por === "nome") setAviso("Vendedor achado pelo NOME — confira se é a mesma empresa.")
    } else if (r.fornecedorLido) {
      setNovo(r.fornecedorLido)
    } else {
      setAviso("A IA não identificou o emitente — escolha o vendedor abaixo.")
    }
  }

  async function cadastrar() {
    if (!novo) return
    setCadastrando(true)
    const r = await cadastrarFornecedorDaNota(novo)
    setCadastrando(false)
    if (r.erro || !r.fornecedor) {
      setAviso(r.erro ?? "Não foi possível cadastrar.")
      return
    }
    escolher(r.fornecedor)
    setNovo(null)
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" className="h-7">
          <FileUp />
          Anexar nota
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nota fiscal da compra em {marketplace.nome}</DialogTitle>
          <DialogDescription>
            A nota é emitida pelo vendedor que atendeu o pedido na plataforma. Anexe o arquivo: a IA lê o
            emitente e liga o vendedor à compra.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            startTransition(() => acao(fd))
          }}
          className="grid gap-3"
        >
          <input type="hidden" name="processo_id" value={processoId} />
          <input type="hidden" name="fornecimento_id" value={fornecimentoId} />
          <div className="grid gap-1.5">
            <Label htmlFor={`nm-nota-${fornecimentoId}`}>Nota fiscal (PDF ou foto)</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={`nm-nota-${fornecimentoId}`}
                ref={arquivoRef}
                name="nota_fiscal"
                type="file"
                required
                accept={ACEITA_NOTA}
                className="max-w-xs"
                onChange={async (e) => {
                  const { erro } = await prepararArquivo(e.currentTarget)
                  setArquivoErro(erro ?? null)
                  setLeitura(null)
                }}
              />
              <Button type="button" variant="outline" onClick={lerComIA} disabled={lendo}>
                {lendo ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {lendo ? "Lendo…" : "Ler com IA"}
              </Button>
            </div>
            {arquivoErro && <p className="text-destructive text-xs">{arquivoErro}</p>}
            {leitura && (
              <p className="flex items-center gap-1.5 text-xs">
                <CheckCircle2 className="size-3.5 text-emerald-600" />
                {leitura} lido.
              </p>
            )}
          </div>

          {novo && (
            <div className="grid gap-2 rounded-md border p-3 text-sm">
              <p className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <span>
                  O emitente <strong>{novo.razao_social || novo.nome_fantasia}</strong>
                  {novo.cnpj_cpf ? ` (${formatarCnpjCpf(novo.cnpj_cpf)})` : ""} não está cadastrado.
                </span>
              </p>
              <Button type="button" variant="outline" size="sm" onClick={cadastrar} disabled={cadastrando} className="justify-self-start">
                {cadastrando ? <Loader2 className="animate-spin" /> : <Building2 />}
                Cadastrar como fornecedor e usar
              </Button>
            </div>
          )}
          {aviso && <p className="text-warning-fg text-xs">{aviso}</p>}

          <div className="grid gap-1.5">
            <Label>Vendedor (emitente da nota)</Label>
            <EmpresaCombobox
              key={versao}
              empresas={fornecedores}
              name="vendedor_id"
              defaultId={vendedorId || undefined}
              onChange={(id) => setVendedorId(id ?? "")}
            />
          </div>

          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente || !vendedorId}>
              {pendente ? <Loader2 className="animate-spin" /> : <FileUp />}
              Anexar nota
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Liga (ou troca) o vendedor de uma compra em marketplace que já tem nota. */
export function VincularVendedor({
  processoId,
  fornecimentoId,
  fornecedores,
  vendedorAtual,
}: {
  processoId: string
  fornecimentoId: string
  fornecedores: EmpresaOpcao[]
  vendedorAtual: string | null
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState(async (prev: Estado, fd: FormData) => {
    const r = await vincularVendedorAction(prev, fd)
    if (r.ok) setAberto(false)
    return r
  }, {})
  const envio2 = useEnvioFormulario(acao, estado)
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7">
          <Link2 />
          {vendedorAtual ? "Trocar vendedor" : "Vincular vendedor"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vendedor da compra</DialogTitle>
          <DialogDescription>Quem vendeu pela plataforma — o emitente da nota fiscal.</DialogDescription>
        </DialogHeader>
        <form action={acao} {...envio2} className="grid gap-3">
          <input type="hidden" name="processo_id" value={processoId} />
          <input type="hidden" name="fornecimento_id" value={fornecimentoId} />
          <EmpresaCombobox empresas={fornecedores} name="vendedor_id" defaultId={vendedorAtual ?? undefined} />
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <Link2 />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
