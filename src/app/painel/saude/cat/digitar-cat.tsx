"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { ExternalLink, FilePlus2, Loader2, RotateCcw, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { CatForm } from "./cat-forms"
import { ClassificacaoCatAviso } from "./classificacao-cat"
import { verificarNumeroCatAction } from "./verificar-numero-actions"

/**
 * Digitação de CAT em duas etapas: primeiro o número, comparado com a base —
 * CAT já lançada não abre o formulário (evita retrabalho); reabertura/óbito
 * abre com os dados do acidente da CAT de origem; número novo abre em branco.
 */
export function DigitarCat() {
  const [versao, setVersao] = useState(0)
  return <Etapas key={versao} recomecar={() => setVersao((v) => v + 1)} />
}

function Etapas({ recomecar }: { recomecar: () => void }) {
  const [estado, verificar, pendente] = useActionState(verificarNumeroCatAction, {})
  const [semNumero, setSemNumero] = useState(false)
  const c = estado.classificacao

  if (semNumero) {
    return (
      <div className="grid gap-3">
        <div>
          <Button variant="outline" size="sm" onClick={recomecar}>
            <RotateCcw />
            Voltar à verificação do número
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          CAT sem número (parcial): ao salvar, o sistema ainda compara o acidentado e a data do
          acidente com a base e avisa se parecer duplicidade.
        </p>
        <CatForm />
      </div>
    )
  }

  if (c && estado.valores) {
    return (
      <div className="grid gap-4">
        <ClassificacaoCatAviso classificacao={c}>
          {c.classe === "duplicada" && (
            <p className="text-xs">Não é preciso digitar de novo — abra a CAT acima para conferir ou editar.</p>
          )}
          {c.classe === "atualizacao" && (
            <p className="text-xs">
              O formulário abaixo já vem com os dados do acidente da CAT de origem. Preencha o tipo
              (reabertura ou óbito) e o que mudou; ao salvar, a CAT fica ligada à de origem.
            </p>
          )}
        </ClassificacaoCatAviso>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={recomecar}>
            <RotateCcw />
            Verificar outro número
          </Button>
          {c.classe === "duplicada" && c.relacionadas[0] && (
            <Button size="sm" asChild>
              <Link href={`/painel/saude/cat/${c.relacionadas[0].id}`}>
                <ExternalLink />
                Abrir a CAT {c.relacionadas[0].numero}
              </Link>
            </Button>
          )}
        </div>
        {c.classe !== "duplicada" && (
          <CatForm valores={estado.valores} origemId={c.classe === "atualizacao" ? c.origemId : null} />
        )}
      </div>
    )
  }

  return (
    <Card>
      <CardContent className="grid gap-3">
        <form action={verificar} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="numero-cat">Número da CAT (campo 5)</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="numero-cat"
                name="numero"
                required
                autoComplete="off"
                placeholder="2023.625358-1/01 ou 1.1.0000000034067573296"
                defaultValue={estado.numero ?? ""}
                className="w-full sm:w-96"
              />
              <Button type="submit" disabled={pendente}>
                {pendente ? <Loader2 className="animate-spin" /> : <Search />}
                Verificar
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Antes de digitar os 50 campos, o número é comparado com as CATs da base: se a CAT já
              foi lançada, você é avisado; se for reabertura ou óbito de um acidente já lançado (mesmo
              número, outra sequência — …/02), o formulário já vem com os dados do acidente.
            </p>
          </div>
          {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
        </form>
        <div>
          <Button variant="ghost" size="sm" onClick={() => setSemNumero(true)}>
            <FilePlus2 />
            A CAT não tem número (parcial)
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
