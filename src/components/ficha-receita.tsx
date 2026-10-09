"use client"

import { AlertTriangle, Sparkles } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import type { DadosCnpj } from "@/lib/db/fornecedores-cnpj"

/** O que a Receita Federal diz do CNPJ consultado — conferência antes de salvar. */
export function FichaReceita({
  ficha,
  idAtual,
  hrefExistente,
  endereco,
}: {
  ficha: DadosCnpj
  /** Registro em edição — não conta como duplicado de si mesmo. */
  idAtual: string | null
  hrefExistente: (id: string) => string
  /** Oferece gravar o endereço da Receita (fornecedor). Sem isso, não aparece. */
  endereco?: { usar: boolean; setUsar: (v: boolean) => void; destino: string }
}) {
  const e = ficha.endereco
  const linhaEnd = e
    ? [
        [e.logradouro, e.numero, e.complemento].filter(Boolean).join(", "),
        [e.bairro, e.cidade && e.estado ? `${e.cidade}/${e.estado}` : e.cidade].filter(Boolean).join(" · "),
        e.cep ? `CEP ${e.cep}` : null,
      ]
        .filter(Boolean)
        .join(" — ")
    : null
  const duplicado = ficha.existente && ficha.existente.id !== idAtual ? ficha.existente : null
  return (
    <div className="bg-muted/40 grid gap-2 rounded-md border p-3 text-sm">
      <p className="flex flex-wrap items-center gap-1.5 font-medium">
        <Sparkles className="text-primary size-4" />
        Cadastro na Receita Federal
        <span className="text-muted-foreground text-xs font-normal">
          {ficha.viaIA ? "· padronizado pela IA — confira antes de salvar" : "· IA indisponível, padronização simples"}
        </span>
      </p>
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground text-xs">Situação cadastral</dt>
          <dd>{ficha.situacao ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Início da atividade</dt>
          <dd>{ficha.abertura ? ficha.abertura.slice(0, 10).split("-").reverse().join("/") : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Contato</dt>
          <dd className="break-words">{[ficha.telefone, ficha.email].filter(Boolean).join(" · ") || "—"}</dd>
        </div>
        {ficha.atividade && (
          <div className="sm:col-span-3">
            <dt className="text-muted-foreground text-xs">Atividade</dt>
            <dd>{ficha.atividade}</dd>
          </div>
        )}
      </dl>
      {duplicado && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertDescription>
            <span>
              Já existe um cadastro ativo com este CNPJ:{" "}
              <a href={hrefExistente(duplicado.id)} className="font-medium underline">
                {duplicado.nome}
              </a>
              . Use-o em vez de criar outro.
            </span>
          </AlertDescription>
        </Alert>
      )}
      {ficha.alertas.length > 0 && (
        <ul className="text-warning-fg list-disc pl-5 text-xs">
          {ficha.alertas.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      {endereco && e && linhaEnd && (
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            name="receita_endereco_usar"
            checked={endereco.usar}
            onChange={(ev) => endereco.setUsar(ev.target.checked)}
            className="mt-0.5 size-4"
          />
          <span>
            Adicionar o endereço da Receita {endereco.destino}: <strong>{linhaEnd}</strong>
          </span>
        </label>
      )}
      {endereco && e && (
        <input type="hidden" name="receita_endereco" value={JSON.stringify(e)} />
      )}
    </div>
  )
}
