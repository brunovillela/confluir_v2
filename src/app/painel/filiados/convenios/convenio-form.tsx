"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type {
  CategoriaConvenio,
  ConvenioEditavel,
  OpcaoConveniador,
} from "@/lib/db/filiacao-convenios-edicao"

import { salvarConvenioAction } from "./actions"

const SEM_CATEGORIA = "sem_categoria"

export function ConvenioForm({
  categorias,
  conveniadores,
  convenio,
}: {
  categorias: CategoriaConvenio[]
  conveniadores: OpcaoConveniador[]
  convenio?: ConvenioEditavel
}) {
  const [estado, formAction, pendente] = useActionState(salvarConvenioAction, {})
  const marcados = conveniadores.filter((c) => c.conveniador)
  const demais = conveniadores.filter((c) => !c.conveniador)

  return (
    <form action={formAction} className="grid gap-4">
      {convenio && <input type="hidden" name="convenio_id" value={convenio.id} />}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do convênio</CardTitle>
          <CardDescription>
            O conveniador é a empresa que dá o desconto; a categoria é como o filiado procura
            no portal.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="conveniador_id">Conveniador *</Label>
            <Select name="conveniador_id" defaultValue={convenio?.conveniadorId ?? undefined} required>
              <SelectTrigger id="conveniador_id" className="w-full">
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {marcados.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Conveniadores</SelectLabel>
                    {marcados.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {demais.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Outras empresas cadastradas</SelectLabel>
                    {demais.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Não achou? Cadastre a empresa em Compras → Fornecedores e volte aqui.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="categoria_id">Categoria</Label>
            <Select name="categoria_id" defaultValue={convenio?.categoriaId ?? SEM_CATEGORIA}>
              <SelectTrigger id="categoria_id" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_CATEGORIA}>Sem categoria</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.categoria ?? "(sem nome)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              As categorias são geridas em{" "}
              <Link href="/painel/filiados/convenios/categorias" className="underline">
                Categorias
              </Link>
              .
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="data_termino">Término da vigência</Label>
            <Input
              id="data_termino"
              name="data_termino"
              type="date"
              defaultValue={(convenio?.dataTermino ?? "").slice(0, 10)}
            />
            <p className="text-muted-foreground text-xs">
              Vazio = sem prazo. Vencido, o convênio some do portal sozinho.
            </p>
          </div>

          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Switch name="ativo" defaultChecked={convenio ? convenio.ativo : true} />
            Ativo (aparece no portal enquanto vigente)
          </label>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="info_sumarias">Resumo</Label>
            <Input
              id="info_sumarias"
              name="info_sumarias"
              defaultValue={convenio?.infoSumarias ?? ""}
              placeholder="Desconto em armações, lentes e exames de vista para associados e dependentes."
            />
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="info_vantagens">Vantagens</Label>
            <Textarea
              id="info_vantagens"
              name="info_vantagens"
              rows={4}
              defaultValue={convenio?.infoVantagens ?? ""}
              placeholder="30% em armações, 20% em lentes com antirreflexo… Como usar: apresentar a carteira de associado."
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" asChild>
          <Link href="/painel/filiados/convenios">Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {convenio ? "Salvar alterações" : "Criar convênio"}
        </Button>
      </div>
    </form>
  )
}
