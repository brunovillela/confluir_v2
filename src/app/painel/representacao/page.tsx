import type { Metadata } from "next"
import {
  Building2,
  FileSignature,
  Gavel,
  type LucideIcon,
  UsersRound,
  Vote,
} from "lucide-react"

import { CartaoArea } from "@/components/cartao-area"
import { requirePermissao } from "@/lib/auth"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Representação Sindical — Confluir" }

type Area = {
  titulo: string
  descricao: string
  href: string | null
  icone: LucideIcon
  chave: string
}

const AREAS: Area[] = [
  {
    titulo: "Assembleias",
    descricao: "Campanhas, rodadas, aptos e votações da categoria",
    href: "/painel/representacao/assembleias",
    icone: Vote,
    chave: "assembleias",
  },
  {
    titulo: "Oposição à contribuição assistencial",
    descricao: "Campanhas de oposição e fila de avaliação da Filiação",
    href: "/painel/representacao/oposicao",
    icone: Gavel,
    chave: "oposicao",
  },
  {
    titulo: "Acordos coletivos",
    descricao: "ACT e CCT: vigência, abrangência, cláusulas e alertas",
    href: "/painel/representacao/acordos",
    icone: FileSignature,
    chave: "acordos_coletivos",
  },
  {
    titulo: "Filiação coletiva",
    descricao:
      "Assembleia com cláusula no ACT: os aptos a votar tornam-se filiados",
    href: "/painel/representacao/filiacao-coletiva",
    icone: UsersRound,
    chave: "assembleias",
  },
  {
    titulo: "Empregadores",
    descricao: "Empregadores e fontes pagadoras, documentação legal e status",
    href: "/painel/representacao/empregadores",
    icone: Building2,
    chave: "empregadores",
  },
]

export default async function RepresentacaoPage() {
  const sessao = await requirePermissao("assembleias", [
    "oposicao",
    "acordos_coletivos",
    "empregadores",
  ])
  const areas = AREAS.filter((a) => podeAcessar(sessao.permissoes, a.chave))

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Representação Sindical
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          A atuação coletiva do sindicato: deliberação, oposição à contribuição
          e negociação de acordos.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((a) => (
          <CartaoArea
            key={a.titulo}
            titulo={a.titulo}
            descricao={a.descricao}
            href={a.href}
            icone={a.icone}
            emBreve={!a.href}
          />
        ))}
      </div>
    </>
  )
}
