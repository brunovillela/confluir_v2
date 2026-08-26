import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Building2, Globe, Hotel, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Marca } from "@/components/marca"
import { ThemeToggle } from "@/components/theme-toggle"
import { Card, CardContent } from "@/components/ui/card"
import { obterOrganizacao } from "@/lib/db/organizacao"

export const metadata: Metadata = {
  title: "Manual do Confluir",
  description: "A documentação de cada interface do Confluir.",
  robots: { index: false },
}

type Interface = {
  titulo: string
  paraQuem: string
  descricao: string
  href: string
  icone: LucideIcon
}

const INTERFACES: Interface[] = [
  {
    titulo: "Painel interno",
    paraQuem: "Equipe do sindicato",
    descricao:
      "Os módulos de gestão: filiados, financeiro, pessoal, saúde, compras, frota, jurídico e mais.",
    href: "/painel/ajuda",
    icone: Building2,
  },
  {
    titulo: "Portal do associado",
    paraQuem: "Filiado",
    descricao:
      "Cadastro, hospedagem, saúde, notícias, agenda, oposição e os direitos de dados.",
    href: "/portal/ajuda",
    icone: Users,
  },
  {
    titulo: "Área do hotel",
    paraQuem: "Hotéis parceiros",
    descricao:
      "Registro de reservas, comparecimento dos hóspedes, faturamento e dados bancários.",
    href: "/hotel/ajuda",
    icone: Hotel,
  },
  {
    titulo: "Fluxos públicos",
    paraQuem: "Trabalhador, sem login",
    descricao:
      "As telas públicas de filiação, oposição à contribuição e votação em assembleias.",
    href: "/painel/ajuda/fluxos-publicos",
    icone: Globe,
  },
]

export default async function ManualLandingPage() {
  const org = await obterOrganizacao()
  const nome = org?.nomeFantasia ?? org?.nomeRazao ?? null

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="flex justify-end">
        <ThemeToggle />
      </div>

      <div className="mb-10 flex flex-col items-center text-center">
        <Marca variante="completa" />
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">
          Manual do Confluir
        </h1>
        <p className="text-muted-foreground mt-2 max-w-xl text-sm">
          A documentação de cada interface do sistema
          {nome ? ` do ${nome}` : ""}. Escolha a área que você usa.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {INTERFACES.map((item) => {
          const Icone = item.icone
          return (
            <Link key={item.href} href={item.href} className="group block h-full">
              <Card className="group-hover:border-primary/40 h-full transition-colors">
                <CardContent className="flex h-full flex-col gap-2 py-5">
                  <div className="flex items-center gap-3">
                    <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                      <Icone className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.titulo}</p>
                      <p className="text-muted-foreground text-xs">
                        {item.paraQuem}
                      </p>
                    </div>
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {item.descricao}
                  </p>
                  <div className="mt-auto pt-2">
                    <span className="text-primary inline-flex items-center gap-1 text-sm font-medium">
                      Abrir o manual
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <p className="text-muted-foreground mt-10 text-center text-xs">
        O acesso a cada manual segue o login da respectiva área.
      </p>
    </main>
  )
}
