import type { Metadata } from "next"
import {
  Building2,
  Gavel,
  HandCoins,
  HeartHandshake,
  Landmark,
  LockKeyhole,
  Mail,
  Plane,
  ScrollText,
  Smartphone,
  PhoneCall,
  Users,
  type LucideIcon,
} from "lucide-react"

import { CartaoArea, GRADE_AREAS } from "@/components/cartao-area"
import { requirePermissao } from "@/lib/auth"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Institucional — Confluir" }

type Area = {
  titulo: string
  descricao: string
  href: string | null
  icone: LucideIcon
  chave: string
  chavesAlternativas?: string[]
}

const AREAS: Area[] = [


  {
    titulo: "Organização",
    descricao: "Razão social, CNPJ, logo e endereços das sedes",
    href: "/painel/institucional/organizacao",
    icone: Building2,
    chave: "configuracoes",
  },
  {
    titulo: "Diretoria",
    descricao: "Mandatos e integrantes — base dos signatários de ofícios",
    href: "/painel/institucional/diretoria",
    icone: Users,
    chave: "diretoria_mandatos",
    chavesAlternativas: ["configuracoes"],
  },
  {
    titulo: "Atas de reunião",
    descricao: "Reuniões da entidade (diretoria, conselho, assembleia) com PDF",
    href: "/painel/institucional/atas",
    icone: ScrollText,
    chave: "diretoria_reunioes",
    chavesAlternativas: ["diretoria_atas_consulta", "configuracoes"],
  },
  {
    titulo: "Deliberações",
    descricao: "As decisões das atas: o que se decidiu, a situação e o sigilo",
    href: "/painel/institucional/deliberacoes",
    icone: Gavel,
    chave: "deliberacoes_livre",
    chavesAlternativas: ["deliberacoes_reservado", "deliberacoes_restrito"],
  },
  {
    titulo: "Registro sindical (MTE)",
    descricao: "Registros da entidade no Ministério do Trabalho e Emprego",
    href: "/painel/institucional/registro-mte",
    icone: Landmark,
    chave: "registro_mte",
    chavesAlternativas: ["configuracoes"],
  },
  {
    titulo: "E-mails institucionais",
    descricao: "Endereços institucionais da entidade e o responsável por cada um",
    href: "/painel/institucional/emails",
    icone: Mail,
    chave: "ferramentas_emails_internos",
    chavesAlternativas: ["configuracoes"],
  },
  {
    titulo: "Linhas institucionais",
    descricao: "Celulares da entidade: número, operadora, chip e com quem está",
    href: "/painel/institucional/linhas",
    icone: Smartphone,
    chave: "ferramentas_linhas_telefone",
    chavesAlternativas: ["configuracoes"],
  },
  {
    titulo: "Ramais e telefones diretos",
    descricao: "Linhas fixas da entidade: ramal, telefone direto e quem atende",
    href: "/painel/institucional/ramais",
    icone: PhoneCall,
    chave: "ferramentas_linhas_telefone",
    chavesAlternativas: ["configuracoes"],
  },
  {
    titulo: "Ajudas institucionais",
    descricao: "Apoios da entidade a organizações apoiadas e o cadastro das entidades",
    href: "/painel/institucional/ajudas",
    icone: HeartHandshake,
    chave: "apoio_institucional",
    chavesAlternativas: ["apoio_institucional_edicao"],
  },
  {
    titulo: "Custeio institucional",
    descricao:
      "Custeios da entidade a diretores, demitidos políticos e convidados de eventos",
    href: "/painel/institucional/custeios",
    icone: HandCoins,
    chave: "custeio_institucional",
    chavesAlternativas: [
      "custeio_institucional_edicao",
      "custeio_institucional_autorizacao",
    ],
  },
  {
    titulo: "Viagens",
    descricao:
      "Passagens e hospedagens de diretores, funcionários e convidados de eventos",
    href: "/painel/institucional/viagens",
    icone: Plane,
    chave: "viagens_gestao",
  },

  {
    titulo: "LGPD: retenção e descarte",
    descricao: "Prazos de guarda, simulação do descarte mensal e bloqueios por litígio",
    href: "/painel/institucional/lgpd",
    icone: LockKeyhole,
    chave: "configuracoes",
  },

]

export default async function ConfiguracoesPage() {
  const sessao = await requirePermissao("configuracoes", [
    "diretoria_mandatos",
    "registro_mte",
    "ferramentas_emails_internos",
    "ferramentas_linhas_telefone",
    "diretoria_reunioes",
    "diretoria_atas_consulta",
    "deliberacoes_livre",
    "deliberacoes_reservado",
    "deliberacoes_restrito",
    "apoio_institucional",
    "apoio_institucional_edicao",
    "custeio_institucional",
    "custeio_institucional_edicao",
    "custeio_institucional_autorizacao",
    "viagens_gestao",
  ])

  const visiveis = AREAS.filter((a) =>
    podeAcessar(sessao.permissoes, a.chave, a.chavesAlternativas)
  )

  return (
    <>
      <div>
        <div className="flex items-center gap-2">
          <Landmark className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Institucional</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          A entidade: organização, diretoria, registro sindical e recursos. Usuários, integrações e IA ficam em Gestão.
        </p>
      </div>

      <div className={GRADE_AREAS}>
        {visiveis.map((area) => (
          <CartaoArea
            key={area.titulo}
            titulo={area.titulo}
            descricao={area.descricao}
            href={area.href}
            icone={area.icone}
          />
        ))}
      </div>
    </>
  )
}
