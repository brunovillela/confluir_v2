import Link from "next/link"
import {
  ArrowRight,
  BedDouble,
  CalendarDays,
  HandCoins,
  IdCard,
  MessagesSquare,
  Newspaper,
  ShieldCheck,
  UserPen,
  Vote,
} from "lucide-react"

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Atalhos do Início. Contribuição e Carteirinha entraram com a onda 2 (A2):
 * antes só se chegava a elas pelo menu. Ícones iguais aos do menu
 * (navegacao-portal.ts).
 */
const SERVICOS = [
  {
    titulo: "Meu cadastro",
    descricao: "Confira seus dados e atualize telefones, emails e endereço",
    href: "/portal/cadastro",
    icone: UserPen,
  },
  {
    titulo: "Contribuição",
    descricao: "O que foi descontado mês a mês e se está tudo em dia",
    href: "/portal/contribuicao",
    icone: HandCoins,
  },
  {
    titulo: "Carteirinha",
    descricao: "Sua carteirinha digital e a declaração de filiação",
    href: "/portal/carteirinha",
    icone: IdCard,
  },
  {
    titulo: "Hospedagem",
    descricao: "Solicite cupons de hospedagem subsidiada nos hotéis parceiros",
    href: "/portal/hospedagem",
    icone: BedDouble,
  },
  {
    titulo: "Notícias",
    descricao: "Últimas notícias do sindicato",
    href: "/portal/noticias",
    icone: Newspaper,
  },
  {
    titulo: "Votação",
    descricao: "Assembleias abertas e o histórico das suas participações",
    href: "/portal/votacao",
    icone: Vote,
  },
  {
    titulo: "Eventos e agenda",
    descricao: "Inscrições abertas, suas inscrições e a agenda de atividades",
    href: "/portal/eventos",
    icone: CalendarDays,
  },
  {
    titulo: "Atendimento",
    descricao: "Abra uma solicitação e acompanhe a resposta da entidade",
    href: "/portal/atendimento",
    icone: MessagesSquare,
  },
  {
    titulo: "LGPD",
    descricao: "Seus aceites e direitos sobre dados pessoais",
    href: "/portal/lgpd",
    icone: ShieldCheck,
  },
]

export function ServicosInicio() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
      {SERVICOS.map((servico) => (
        <Link key={servico.href} href={servico.href} className="group">
          <Card className="hover:border-primary/40 h-full transition-colors">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="bg-muted flex size-9 items-center justify-center rounded-lg">
                  <servico.icone className="size-4.5" />
                </div>
                <ArrowRight className="text-muted-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <CardTitle className="pt-2 text-base">{servico.titulo}</CardTitle>
              <CardDescription>{servico.descricao}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  )
}
