"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

import { inscreverCongressoAction } from "./actions"

export function InscricaoCongressoForm({
  slug,
  papeis,
  unidades,
  rotuloUnidade,
  pedeNomeSocial,
  pedeGenero,
  pedeAcessibilidade,
}: {
  slug: string
  papeis: { id: string; nome: string; resumo: string }[]
  unidades: { id: string; nome: string }[]
  rotuloUnidade: string
  pedeNomeSocial: boolean
  pedeGenero: boolean
  pedeAcessibilidade: boolean
}) {
  const [estado, acao, pendente] = useActionState(inscreverCongressoAction, {})
  const envio = useEnvioFormulario(acao, estado)
  return (
    <form action={acao} {...envio} className="grid gap-4">
      <input type="hidden" name="slug" value={slug} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Como vai participar</legend>
        {papeis.map((p, i) => (
          <label key={p.id} className="has-[:checked]:border-primary has-[:checked]:bg-primary/5 flex cursor-pointer gap-3 rounded-lg border p-3">
            <input type="radio" name="papel_id" value={p.id} defaultChecked={i === 0} className="accent-primary mt-1" />
            <span>
              <span className="font-medium">{p.nome}</span>
              <span className="text-muted-foreground block text-xs">{p.resumo}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {unidades.length > 0 && (
        <div className="grid gap-1.5">
          <Label htmlFor="unidade_id">{rotuloUnidade}</Label>
          <SelectNativo id="unidade_id" name="unidade_id" required defaultValue="">
            <option value="" disabled>
              Escolha…
            </option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </SelectNativo>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="nome">Nome completo</Label>
        <Input id="nome" name="nome" required autoComplete="name" />
      </div>
      {pedeNomeSocial && (
        <div className="grid gap-1.5">
          <Label htmlFor="nome_social">Nome social (opcional)</Label>
          <Input id="nome_social" name="nome_social" />
          <p className="text-muted-foreground text-xs">Se informado, é o nome usado no crachá e nas listas.</p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="cpf">CPF</Label>
          <Input id="cpf" name="cpf" required inputMode="numeric" autoComplete="off" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="telefone">Celular com DDD</Label>
          <Input id="telefone" name="telefone" inputMode="tel" autoComplete="tel" />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
        <p className="text-muted-foreground text-xs">É para onde vai o seu link pessoal.</p>
      </div>
      {pedeGenero && (
        <div className="grid gap-1.5">
          <Label htmlFor="genero">Gênero</Label>
          <SelectNativo id="genero" name="genero" defaultValue="">
            <option value="">Prefiro não informar</option>
            <option value="feminino">Feminino</option>
            <option value="masculino">Masculino</option>
            <option value="outro">Outro</option>
          </SelectNativo>
          <p className="text-muted-foreground text-xs">Usado só para conferir as cotas da delegação.</p>
        </div>
      )}
      {pedeAcessibilidade && (
        <div className="grid gap-1.5">
          <Label htmlFor="acessibilidade">Precisa de algum recurso de acessibilidade? (opcional)</Label>
          <Input id="acessibilidade" name="acessibilidade" placeholder="Ex.: intérprete de Libras, cadeira de rodas" />
        </div>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="aceite" required className="accent-primary mt-0.5 size-4" />
        <span>
          Concordo com o tratamento dos meus dados pela entidade para organizar o congresso. A participação em congresso
          sindical é dado sensível: só a comissão organizadora vê a lista completa.
        </span>
      </label>

      <Button type="submit" disabled={pendente} className="justify-self-start">
        {pendente && <Loader2 className="animate-spin" />}
        Fazer a inscrição
      </Button>
    </form>
  )
}
