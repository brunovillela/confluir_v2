"use client"

import { useActionState } from "react"
import { Loader2, Sparkles } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { type EstadoForm } from "@/lib/contas"

import { lerListaAction } from "./actions"

/** Arquivo + fonte pagadora: a IA lê e a página da prévia abre em seguida. */
export function EnviarLista({ fontes }: { fontes: { id: string; nome: string }[] }) {
  const [estado, acao, lendo] = useActionState<EstadoForm, FormData>(lerListaAction, {})

  return (
    <form action={acao} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="arquivo">Lista de trabalhadores *</Label>
          <Input
            id="arquivo"
            name="arquivo"
            type="file"
            required
            accept=".xlsx,.xls,.ods,.csv,.txt,application/pdf,image/jpeg,image/png,image/webp,image/gif"
          />
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="fonte_id">Fonte pagadora da lista</Label>
          <SelectNativo id="fonte_id" name="fonte_id" defaultValue="">
            <option value="">Sem fonte — só dados pessoais</option>
            {fontes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </SelectNativo>
          <p className="text-muted-foreground text-xs">
            Com a fonte, a busca também usa a matrícula e dá para atualizar
            cargo, lotação, admissão e os outros dados do vínculo nela — e
            cadastrar quem não for encontrado.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={lendo}>
          {lendo ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {lendo ? "Lendo a lista…" : "Ler a lista"}
        </Button>
        {lendo && (
          <span className="text-muted-foreground text-sm">
            A IA está lendo o arquivo. Listas grandes levam alguns minutos — não feche a página.
          </span>
        )}
      </div>
    </form>
  )
}
