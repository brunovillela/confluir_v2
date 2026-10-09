"use client"

import { useActionState, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { Loader2, Sparkles, Trash2 } from "lucide-react"

import { FichaReceita } from "@/components/ficha-receita"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { DadosCnpj } from "@/lib/db/fornecedores-cnpj"
import {
  type CategoriaFonte,
  chaveCategoriaDaFonte,
  ROTULO_CATEGORIA_SISTEMA,
} from "@/lib/saude-cadastros"

import {
  atualizarFontePagadora,
  consultarCnpjEmpregador,
  criarFontePagadora,
  excluirFontePagadora,
} from "./actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"

export type FonteFormDados = {
  id: string
  nome_fantasia: string | null
  nome_razao: string | null
  cnpj_cpf: string | null
  fundo_pensao: boolean | null
  fonte_categoria_id: string | null
  inativa: boolean | null
  filiadosAtivos: number
}

export function FonteForm({
  fonte,
  categorias,
}: {
  fonte?: FonteFormDados
  /** Sistema + criadas pela entidade (lib/db/fonte-categorias). */
  categorias: CategoriaFonte[]
}) {
  const [estado, formAction, pendente] = useActionState(
    fonte ? atualizarFontePagadora : criarFontePagadora,
    {}
  )
  const [estadoExcluir, excluirAction, excluindo] = useActionState(
    excluirFontePagadora,
    {}
  )

  const erro = estado.erro ?? estadoExcluir.erro

  // Preencher pelo CNPJ — o mesmo fluxo de Fornecedores (Receita + IA).
  const formRef = useRef<HTMLFormElement>(null)
  const [consultando, iniciarConsulta] = useTransition()
  const [ficha, setFicha] = useState<DadosCnpj | null>(null)
  const [erroCnpj, setErroCnpj] = useState<string | null>(null)

  function preencherPeloCnpj() {
    const form = formRef.current
    const campo = form?.elements.namedItem("cnpj_cpf") as HTMLInputElement | null
    setErroCnpj(null)
    iniciarConsulta(async () => {
      const r = await consultarCnpjEmpregador(campo?.value ?? "")
      if (r.erro || !r.ficha) {
        setFicha(null)
        setErroCnpj(r.erro ?? "Não foi possível consultar o CNPJ.")
        return
      }
      const f = r.ficha
      const setar = (nome: string, valor: string | null) => {
        const el = form?.elements.namedItem(nome) as HTMLInputElement | null
        if (el && valor) el.value = valor
      }
      setar("cnpj_cpf", f.cnpj)
      setar("nome_razao", f.nome_razao)
      setar("nome_fantasia", f.nome_fantasia ?? f.nome_razao)
      setFicha(f)
    })
  }

  return (
    <div className="grid gap-4">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <form ref={formRef} action={formAction} className="grid gap-4">
        {fonte && <input type="hidden" name="id" value={fonte.id} />}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da fonte</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="cnpj_cpf">CNPJ / CPF</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="cnpj_cpf"
                  name="cnpj_cpf"
                  inputMode="numeric"
                  defaultValue={fonte?.cnpj_cpf ?? ""}
                  placeholder="Somente números"
                  className="max-w-72"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={preencherPeloCnpj}
                  disabled={consultando}
                  title="Consulta o cadastro da Receita Federal e padroniza com IA"
                >
                  {consultando ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  Preencher pelo CNPJ
                </Button>
              </div>
              {erroCnpj ? (
                <p className="text-destructive text-xs">{erroCnpj}</p>
              ) : (
                !fonte && (
                  <p className="text-muted-foreground text-xs">
                    Comece pelo CNPJ: o botão traz a razão social e o nome do
                    cadastro da Receita Federal, padronizados pela IA.
                  </p>
                )
              )}
            </div>
            {ficha && (
              <div className="sm:col-span-2">
                <FichaReceita
                  ficha={ficha}
                  idAtual={fonte?.id ?? null}
                  hrefExistente={(id) => `/painel/representacao/empregadores/${id}`}
                />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="nome_fantasia">Nome *</Label>
              <Input
                id="nome_fantasia"
                name="nome_fantasia"
                defaultValue={fonte?.nome_fantasia ?? ""}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nome_razao">Razão social</Label>
              <Input
                id="nome_razao"
                name="nome_razao"
                defaultValue={fonte?.nome_razao ?? ""}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="categoria">Categoria *</Label>
              <select
                id="categoria"
                name="categoria"
                required
                defaultValue={fonte ? chaveCategoriaDaFonte(fonte, categorias) : "empregador"}
                className="border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
              >
                {categorias.map((c) => (
                  <option key={c.chave} value={c.chave}>
                    {c.nome}
                    {c.sistema ? "" : ` (regras de ${ROTULO_CATEGORIA_SISTEMA[c.base].toLowerCase()})`}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                Define as regras do vínculo e a aba da saúde dos cadastros.{" "}
                <Link
                  href="/painel/representacao/empregadores/categorias"
                  className="hover:text-foreground underline underline-offset-2"
                >
                  Gerenciar categorias
                </Link>
              </p>
            </div>
            <div className="grid content-end gap-2 pb-1">
              {fonte && (
                <label className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Checkbox
                    name="inativa"
                    defaultChecked={fonte.inativa === true}
                  />
                  Fonte inativa
                </label>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" asChild>
            <Link href="/painel/representacao/empregadores">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            {fonte ? "Salvar alterações" : "Criar fonte pagadora"}
          </Button>
        </div>
      </form>

      {fonte && (
        <form
          action={excluirAction}
          onSubmit={(e) => {
            confirmarEnvio(e, "Excluir esta fonte da lista de fontes pagadoras? O cadastro da empresa é mantido; fontes com vínculos de filiação não podem ser excluídas.")
          }}
          className="flex justify-end border-t pt-4"
        >
          <input type="hidden" name="id" value={fonte.id} />
          <Button
            type="submit"
            variant="ghost"
            disabled={excluindo}
            className="text-destructive hover:text-destructive"
          >
            {excluindo ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Excluir fonte
          </Button>
        </form>
      )}
    </div>
  )
}
