import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Mail, User } from "lucide-react"

import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { CartaoEditavel } from "@/components/cartao-editavel"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import {
  listarEmailsInstitucionais,
  opcoesResponsaveis,
} from "@/lib/db/emails-institucionais"
import { formatarData } from "@/lib/formato"

import {
  AdicionarEmail,
  BotaoExcluirEmail,
  EditarEmail,
} from "./emails-forms"

export const metadata: Metadata = { title: "E-mails institucionais — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export default async function EmailsInstitucionaisPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string }>
}) {
  await requirePermissao("ferramentas_emails_internos")

  const { busca = "" } = await searchParams
  const termo = busca.trim()

  const [emails, responsaveis] = await Promise.all([
    listarEmailsInstitucionais(termo),
    opcoesResponsaveis(),
  ])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional">
            <ArrowLeft />
            Institucional
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          E-mails institucionais
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Endereços institucionais da organização e o funcionário responsável
          por cada um.
        </p>
      </div>

      <GrupoColapsavel
        titulo="Adicionar e-mail institucional"
        descricao="Cadastre um endereço e o responsável"
      >
        <AdicionarEmail responsaveis={responsaveis} />
      </GrupoColapsavel>

      <form
        className="flex flex-wrap items-center gap-2"
        action="/painel/institucional/emails"
      >
        <input
          type="search"
          name="busca"
          defaultValue={termo}
          placeholder="Endereço ou responsável"
          className={`${SELECT_FILTRO} w-64 max-w-full`}
        />
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      {emails.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground py-8 text-center text-sm">
              <Mail className="mx-auto mb-2 size-5" />
              {termo
                ? "Nenhum e-mail encontrado com esse filtro."
                : "Nenhum e-mail institucional cadastrado ainda."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {emails.map((e) => (
            <CartaoEditavel
              key={e.id}
              titulo={e.endereco}
              resumo={
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                    <User className="size-3.5" />
                    {e.responsavelNome ?? "Sem responsável"}
                    {e.created_at && (
                      <span className="text-xs">
                        · desde {formatarData(e.created_at)}
                      </span>
                    )}
                  </p>
                  <BotaoExcluirEmail id={e.id} />
                </div>
              }
            >
              <EditarEmail email={e} responsaveis={responsaveis} />
            </CartaoEditavel>
          ))}
        </div>
      )}
    </>
  )
}
