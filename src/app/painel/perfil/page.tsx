import type { Metadata } from "next"
import Link from "next/link"
import {
  Award,
  BellRing,
  CalendarCheck,
  CalendarX2,
  Clock4,
  Coins,
  CreditCard,
  FileBadge,
  GraduationCap,
  HandCoins,
  Handshake,
  HeartPulse,
  MapPin,
  Phone,
  Plane,
  ReceiptText,
  ShieldCheck,
  TreePalm,
  Wallet,
  type LucideIcon,
  History,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { CartaoArea, GRADE_AREAS } from "@/components/cartao-area"
import { CartaoEditavel } from "@/components/cartao-editavel"
import { requireSessaoPainel } from "@/lib/auth"
import { usuarioTemCaixa } from "@/lib/db/caixa"
import { usuarioTemCartao } from "@/lib/db/compras-pagamento"
import { contarRemessasDiaria } from "@/lib/db/diarias-historico"
import { areaDoDiretor, diretoriaDoUsuario } from "@/lib/db/perfil-diretor"
import {
  listarEnderecos,
  listarTelefones,
  meusAlertas,
  obterPerfil,
} from "@/lib/db/perfil"
import { formatarCnpjCpf, formatarData } from "@/lib/formato"

import {
  AdicionarEndereco,
  AdicionarTelefone,
  PerfilForm,
  RemoverEndereco,
  RemoverTelefone,
} from "./perfil-forms"
import { FotoPerfil } from "./foto-perfil"
import { MinhaDiretoria } from "./minha-diretoria"
import { CartaoLista } from "./cartao-lista"

export const metadata: Metadata = { title: "Meu perfil — Confluir" }

type AreaPerfil = {
  titulo: string
  descricao: string
  href: string
  icone: LucideIcon
}

const GRUPOS: { titulo: string; itens: AreaPerfil[] }[] = [
  {
    titulo: "Remuneração",
    itens: [
      {
        titulo: "Contracheques",
        descricao: "Contracheques liberados para você",
        href: "/painel/perfil/contracheques",
        icone: ReceiptText,
      },
      {
        titulo: "Controle de ponto",
        descricao: "Espelhos de ponto liberados para você",
        href: "/painel/perfil/ponto",
        icone: Clock4,
      },
      {
        titulo: "Informes de rendimentos",
        descricao: "Documentos para a declaração de imposto de renda",
        href: "/painel/perfil/informes",
        icone: FileBadge,
      },
      {
        titulo: "Acordos coletivos",
        descricao: "Os ACTs entre o sindicato e os seus funcionários",
        href: "/painel/perfil/acordos",
        icone: Handshake,
      },
    ],
  },
  {
    titulo: "Carreira e férias",
    itens: [
      {
        titulo: "Minha carreira",
        descricao: "Seus anuênios e a evolução do nível salarial",
        href: "/painel/perfil/carreira",
        icone: GraduationCap,
      },
      {
        titulo: "Minhas férias",
        descricao: "Histórico e solicitação de gozo de férias",
        href: "/painel/perfil/ferias",
        icone: TreePalm,
      },
      {
        titulo: "Ausências e atestados",
        descricao: "Seus afastamentos e atestados médicos",
        href: "/painel/perfil/ausencias",
        icone: CalendarX2,
      },
      {
        titulo: "Faltas justificadas",
        descricao: "Peça e acompanhe faltas justificadas pelo acordo",
        href: "/painel/perfil/faltas",
        icone: CalendarCheck,
      },
    ],
  },
  {
    titulo: "Saúde e segurança",
    itens: [
      {
        titulo: "Meus ASOs",
        descricao: "Atestados de saúde ocupacional e vencimentos",
        href: "/painel/perfil/asos",
        icone: HeartPulse,
      },
      {
        titulo: "Meus treinamentos",
        descricao: "Treinamentos realizados e certificados",
        href: "/painel/perfil/treinamentos",
        icone: Award,
      },
    ],
  },
  {
    titulo: "Financeiro",
    itens: [
      {
        titulo: "Minhas diárias",
        descricao: "Diárias recebidas e ordens de pagamento",
        href: "/painel/perfil/diarias",
        icone: HandCoins,
      },
      {
        titulo: "Meus reembolsos",
        descricao: "Reembolsos do ACT pagos em contracheque",
        href: "/painel/perfil/reembolsos",
        icone: Coins,
      },
    ],
  },
]

/** Áreas de qualquer usuário do painel — funcionário, diretor ou outro. */
const SEGURANCA: AreaPerfil = {
  titulo: "Segurança da conta",
  descricao: "Verificação em duas etapas com aplicativo autenticador",
  href: "/conta/seguranca?voltar=/painel/perfil",
  icone: ShieldCheck,
}
const AVISOS: AreaPerfil = {
  titulo: "Avisos e Telegram",
  descricao: "Vincule o Telegram e escolha o que recebe por e-mail, Telegram e celular",
  href: "/painel/perfil/avisos",
  icone: BellRing,
}
const DIARIAS_ANTERIORES: AreaPerfil = {
  titulo: "Diárias anteriores",
  descricao: "Remessas de diárias lançadas no sistema anterior",
  href: "/painel/perfil/diarias/historico",
  icone: History,
}
const MINHAS_VIAGENS: AreaPerfil = {
  titulo: "Minhas viagens",
  descricao: "Pedidos de passagem e hospedagem e o histórico",
  href: "/painel/perfil/viagens",
  icone: Plane,
}
const MEU_CAIXA: AreaPerfil = {
  titulo: "Meu caixa",
  descricao: "Saldo, aportes e prestações de contas da sua conta de caixa",
  href: "/painel/perfil/caixa",
  icone: Wallet,
}

const MEU_CARTAO: AreaPerfil = {
  titulo: "Meu cartão",
  descricao: "Compras e faturas do cartão da entidade que está com você",
  href: "/painel/perfil/cartao",
  icone: CreditCard,
}

const DESPESAS_CAIXA: AreaPerfil = {
  titulo: "Despesas em caixas",
  descricao: "Reconheça o que outras pessoas lançaram na sua conta; transfira o que não foi reconhecido",
  href: "/painel/perfil/despesas-caixa",
  icone: HandCoins,
}

export default async function PerfilPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string }>
}) {
  const { usuario } = await requireSessaoPainel()
  const { area: avisoArea } = await searchParams
  const [perfil, telefones, enderecos, temCaixa, temCartao, remessasAnteriores] = await Promise.all([
    obterPerfil(usuario.id),
    listarTelefones(usuario.id),
    listarEnderecos(usuario.id),
    usuarioTemCaixa(usuario.id).catch(() => false),
    usuarioTemCartao(usuario.id).catch(() => false),
    contarRemessasDiaria(usuario.id).catch(() => 0),
  ])
  if (!perfil) return null

  // Diretor (integrante do mandato vigente) tem outra área: mandato,
  // liberação, custeios — não contracheque, ponto ou nível salarial.
  const diretoria = await diretoriaDoUsuario(usuario.id, perfil.cpf).catch(() => null)
  const [alertas, areaDiretor] = await Promise.all([
    perfil.funcionarioAtivo ? meusAlertas(usuario.id) : Promise.resolve([]),
    diretoria ? areaDoDiretor(diretoria.integranteId) : Promise.resolve(null),
  ])
  const papeis = [
    perfil.ehFuncionario
      ? `${perfil.cargo ?? "Funcionário(a)"}${perfil.funcionarioAtivo ? "" : " (desligado)"}`
      : null,
    diretoria
      ? [diretoria.cargo ?? "Diretor(a)", diretoria.mandatoNome && `mandato ${diretoria.mandatoNome}`]
          .filter(Boolean)
          .join(", ")
      : null,
  ].filter(Boolean)

  return (
    <>
      <FotoPerfil nome={perfil.nomeCompleto} fotoUrl={perfil.fotoUrl}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {perfil.nomeCompleto ?? "Meu perfil"}
          </h1>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {papeis.length ? papeis.join(" · ") : "Usuário"}
            {perfil.ehFuncionario && perfil.matricula ? ` · Matrícula ${perfil.matricula}` : ""}
          </p>
        </div>
      </FotoPerfil>

      {avisoArea && (
        <Alert variant="info">
          <AlertDescription>
            {avisoArea === "funcionario-ativo"
              ? "Diárias e reembolsos do acordo coletivo são pedidos de funcionário com vínculo em vigor com o sindicato."
              : "Contracheques, ponto, férias, carreira, ASOs e informes são áreas de funcionário do sindicato — elas não se aplicam ao seu usuário."}
          </AlertDescription>
        </Alert>
      )}

      {alertas.length > 0 && (
        <div className="grid gap-2">
          {alertas.map((a) => (
            <Alert
              key={a.tipo}
              className={
                a.severidade === "warning"
                  ? "border-warning/40 text-warning-fg"
                  : undefined
              }
            >
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                <span>{a.texto}</span>
                <Link
                  href={a.href}
                  className="shrink-0 font-medium underline-offset-4 hover:underline"
                >
                  Ver
                </Link>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Dados pessoais: info + lápis */}
      <CartaoEditavel
        titulo="Dados pessoais"
        descricao="CPF, nome e matrícula não são editáveis"
        resumo={
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3 xl:grid-cols-6">
            <Campo rotulo="Nome completo" valor={perfil.nomeCompleto} className="col-span-2" />
            <Campo rotulo="Como quer ser chamado(a)" valor={perfil.nomeGuerra} />
            <Campo rotulo="CPF" valor={perfil.cpf ? formatarCnpjCpf(perfil.cpf) : null} />
            <Campo rotulo="Nascimento" valor={perfil.dataNascimento ? formatarData(perfil.dataNascimento) : null} />
            <Campo rotulo="Sexo" valor={perfil.sexo} />
            <Campo rotulo="Estado civil" valor={perfil.estadoCivil} />
            <Campo rotulo="Escolaridade" valor={perfil.escolaridade} />
            <Campo rotulo="WhatsApp" valor={perfil.whatsapp} />
            <Campo rotulo="E-mail" valor={perfil.email} className="col-span-2 md:col-span-1 xl:col-span-2" />
            <Campo rotulo="E-mail corporativo" valor={perfil.emailEmpresa} className="col-span-2 md:col-span-1" />
          </dl>
        }
      >
        <PerfilForm
          dados={{
            nomeGuerra: perfil.nomeGuerra,
            email: perfil.email,
            whatsapp: perfil.whatsapp,
            dataNascimento: perfil.dataNascimento,
            sexo: perfil.sexo,
            estadoCivil: perfil.estadoCivil,
            escolaridade: perfil.escolaridade,
          }}
        />
      </CartaoEditavel>

      {/* Telefones e endereços lado a lado (cartões compactos). */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <CartaoLista
          titulo="Telefones"
          item="telefone"
          icone={<Phone className="text-muted-foreground size-4" />}
          formulario={<AdicionarTelefone />}
        >
          {telefones.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum telefone cadastrado.</p>
          ) : (
            <ul className="divide-y">
              {telefones.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
                  <span className="text-sm">
                    <span className="font-medium tabular-nums">{t.numero ?? "—"}</span>
                    {t.tipo ? <span className="text-muted-foreground"> · {t.tipo}</span> : ""}
                    {t.whatsapp && <Badge variant="secondary" className="ml-2">WhatsApp</Badge>}
                  </span>
                  <RemoverTelefone telefoneId={t.id} />
                </li>
              ))}
            </ul>
          )}
        </CartaoLista>

        <CartaoLista
          titulo="Endereços"
          item="endereço"
          icone={<MapPin className="text-muted-foreground size-4" />}
          formulario={<AdicionarEndereco />}
        >
          {enderecos.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum endereço cadastrado.</p>
          ) : (
            <ul className="divide-y">
              {enderecos.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
                  <span className="text-sm">
                    {[
                      [e.logradouro, e.numero].filter(Boolean).join(", "),
                      e.bairro,
                      [e.cidade, e.estado].filter(Boolean).join("/"),
                    ]
                      .filter(Boolean)
                      .join(" — ") || "(endereço)"}
                    {e.tipo ? <span className="text-muted-foreground"> · {e.tipo}</span> : ""}
                  </span>
                  <RemoverEndereco enderecoId={e.id} />
                </li>
              ))}
            </ul>
          )}
        </CartaoLista>
      </div>

      {diretoria && areaDiretor && <MinhaDiretoria diretoria={diretoria} area={areaDiretor} />}

      {/* Meus relatórios e documentos (funcionário) */}
      {perfil.ehFuncionario && (
        <div>
          <h2 className="text-lg font-semibold">Meus relatórios e documentos</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Seus dados de funcionário do sindicato
          </p>
          <div className="mt-3 grid gap-4">
            {GRUPOS.map((g) =>
              g.titulo === "Financeiro" && !perfil.funcionarioAtivo ? null : (
              <section key={g.titulo}>
                <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                  {g.titulo}
                </h3>
                <div className={GRADE_AREAS}>
                  {g.itens.map((r) => (
                    <CartaoArea
                      key={r.href}
                      titulo={r.titulo}
                      descricao={r.descricao}
                      href={r.href}
                      icone={r.icone}
                    />
                  ))}
                </div>
              </section>
              )
            )}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold">Conexões e atalhos</h2>
        <div className={`mt-4 ${GRADE_AREAS}`}>
          {(perfil.funcionarioAtivo || diretoria) && (
            <CartaoArea
              titulo={MINHAS_VIAGENS.titulo}
              descricao={MINHAS_VIAGENS.descricao}
              href={MINHAS_VIAGENS.href}
              icone={MINHAS_VIAGENS.icone}
            />
          )}
          {remessasAnteriores > 0 && (
            <CartaoArea
              titulo={DIARIAS_ANTERIORES.titulo}
              descricao={DIARIAS_ANTERIORES.descricao}
              href={DIARIAS_ANTERIORES.href}
              icone={DIARIAS_ANTERIORES.icone}
            />
          )}
          {temCaixa && (
            <CartaoArea titulo={MEU_CAIXA.titulo} descricao={MEU_CAIXA.descricao} href={MEU_CAIXA.href} icone={MEU_CAIXA.icone} />
          )}
          {temCartao && (
            <CartaoArea titulo={MEU_CARTAO.titulo} descricao={MEU_CARTAO.descricao} href={MEU_CARTAO.href} icone={MEU_CARTAO.icone} />
          )}
          {temCaixa && (
            <CartaoArea
              titulo={DESPESAS_CAIXA.titulo}
              descricao={DESPESAS_CAIXA.descricao}
              href={DESPESAS_CAIXA.href}
              icone={DESPESAS_CAIXA.icone}
            />
          )}
          <CartaoArea titulo={AVISOS.titulo} descricao={AVISOS.descricao} href={AVISOS.href} icone={AVISOS.icone} />
          <CartaoArea titulo={SEGURANCA.titulo} descricao={SEGURANCA.descricao} href={SEGURANCA.href} icone={SEGURANCA.icone} />
        </div>
      </div>
    </>
  )
}

function Campo({ rotulo, valor, className }: { rotulo: string; valor: string | null; className?: string }) {
  return (
    <div className={className ? `min-w-0 ${className}` : "min-w-0"}>
      <dt className="text-muted-foreground truncate text-xs" title={rotulo}>
        {rotulo}
      </dt>
      <dd className="mt-0.5 truncate" title={valor ?? undefined}>{valor ?? "—"}</dd>
    </div>
  )
}
