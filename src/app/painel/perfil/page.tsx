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
  Landmark,
  MapPin,
  Phone,
  Plane,
  ReceiptText,
  ShieldCheck,
  TreePalm,
  Wallet,
  type LucideIcon,
  History,
  BadgeCheck,
  Building2,
  Mail,
  Pencil,
  Star,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ContaBancariaResumo } from "@/components/conta-bancaria-resumo"
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
import { hojeSP } from "@/lib/db/comum"
import { minhasAlteracoes, minhasContas } from "@/lib/db/meus-dados-bancarios"
import { admissaoAtual, contatosCorporativos, listarEmails, mandatosDaPessoa, tempoDeCasa } from "@/lib/db/perfil-contatos"
import { formatarCep, formatarCnpjCpf, formatarData, formatarTelefone } from "@/lib/formato"

import {
  AdicionarEmail,
  AdicionarEndereco,
  AdicionarTelefone,
  PerfilForm,
  RemoverEmail,
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
  const contaPropria = perfil.ehFuncionario || Boolean(diretoria)
  const [alertas, areaDiretor, emails, corporativos, admissao, mandatos, bancarios] = await Promise.all([
    perfil.funcionarioAtivo ? meusAlertas(usuario.id) : Promise.resolve([]),
    diretoria ? areaDoDiretor(diretoria.integranteId) : Promise.resolve(null),
    listarEmails(usuario.id),
    contatosCorporativos(usuario.id, perfil.emailEmpresa),
    perfil.funcionarioAtivo ? admissaoAtual(usuario.id) : Promise.resolve(null),
    diretoria ? mandatosDaPessoa(usuario.id, perfil.cpf) : Promise.resolve(0),
    contaPropria
      ? minhasAlteracoes(usuario.id)
          .then(async ({ lista }) => ({ lista, contas: await minhasContas(usuario.id, lista) }))
          .catch(() => null)
      : Promise.resolve(null),
  ])
  const casa = admissao ? tempoDeCasa(admissao, hojeSP()) : null
  // O WhatsApp do cadastro (usuarios.whatsapp) aparece entre os telefones
  // quando ainda não está na lista — o Pessoal e a Comunicação o usam.
  const digitosTel = (v: string | null) => (v ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "")
  // O que é da entidade (e-mail institucional, linha, telefone direto) fica
  // só em Contatos corporativos — sai das listas pessoais mesmo que o
  // cadastro antigo o tenha copiado para lá.
  const emailsCorporativos = new Set(corporativos.emails.map((e) => e.toLowerCase()))
  const telefonesCorporativos = new Set(
    [...corporativos.celulares.map((c) => c.numero), ...corporativos.ramais.map((r) => r.telefoneDireto)]
      .map(digitosTel)
      .filter(Boolean)
  )
  const telefonesPessoais = telefones.filter((t) => !telefonesCorporativos.has(digitosTel(t.numero)))
  const principalCorporativo = Boolean(perfil.email && emailsCorporativos.has(perfil.email.toLowerCase()))
  const emailPrincipalPessoal = principalCorporativo ? null : perfil.email
  const emailsPessoais = emails.filter(
    (e) => !emailsCorporativos.has(e.email.toLowerCase()) && e.email.toLowerCase() !== (perfil.email ?? "").toLowerCase()
  )
  const whatsappAvulso =
    perfil.whatsapp &&
    !telefonesCorporativos.has(digitosTel(perfil.whatsapp)) &&
    !telefones.some((t) => digitosTel(t.numero) === digitosTel(perfil.whatsapp))
      ? perfil.whatsapp
      : null
  const contaPrincipal = bancarios?.contas.find((c) => c.principal) ?? bancarios?.contas[0] ?? null
  const pedidosAguardando = bancarios?.lista.filter((a) => a.situacao === "aguardando").length ?? 0
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
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {perfil.nomeCompleto ?? "Meu perfil"}
          </h1>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {papeis.length ? papeis.join(" · ") : "Usuário"}
            {perfil.ehFuncionario && perfil.matricula ? ` · Matrícula ${perfil.matricula}` : ""}
          </p>
        </div>
        {(casa || diretoria) && (
          <div className="grid gap-1 text-sm sm:text-right">
            {casa && admissao && (
              <div className="flex flex-wrap items-center gap-2 sm:justify-end" title={`Admissão em ${formatarData(admissao)}`}>
                <Estrelas quantidade={Math.floor(casa.anos / 10)} rotulo="década de casa" />
                <span>
                  <span className="font-medium">{textoTempo(casa)}</span>
                  <span className="text-muted-foreground"> de casa · desde {formatarData(admissao)}</span>
                </span>
              </div>
            )}
            {diretoria && (
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Estrelas quantidade={mandatos} rotulo="mandato" />
                <span>
                  <span className="font-medium">Mandato {diretoria.mandatoNome ?? "vigente"}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {mandatos} mandato{mandatos === 1 ? "" : "s"} na diretoria
                  </span>
                </span>
              </div>
            )}
          </div>
        )}
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
          </dl>
        }
      >
        <PerfilForm
          dados={{
            nomeGuerra: perfil.nomeGuerra,
            email: perfil.email,
            dataNascimento: perfil.dataNascimento,
            sexo: perfil.sexo,
            estadoCivil: perfil.estadoCivil,
            escolaridade: perfil.escolaridade,
          }}
        />
      </CartaoEditavel>

      {/* Contatos em colunas independentes: cada coluna empilha os seus
          cartões, sem a altura de um puxar a fileira do vizinho. */}
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="grid min-w-0 gap-4">
          <CartaoLista
            titulo="Telefones"
            item="telefone"
            icone={<Phone className="text-muted-foreground size-4" />}
            formulario={<AdicionarTelefone />}
          >
            {telefonesPessoais.length === 0 && !whatsappAvulso ? (
              <p className="text-muted-foreground text-sm">Nenhum telefone cadastrado.</p>
            ) : (
              <ul className="divide-y">
                {whatsappAvulso && (
                  <li className="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
                    <span className="text-sm">
                      <span className="font-medium tabular-nums">{formatarTelefone(whatsappAvulso)}</span>
                      <Badge variant="secondary" className="ml-2">WhatsApp</Badge>
                    </span>
                    <span className="text-muted-foreground text-xs">do cadastro</span>
                  </li>
                )}
                {telefonesPessoais.map((t) => (
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
            titulo="E-mails"
            item="e-mail"
            icone={<Mail className="text-muted-foreground size-4" />}
            formulario={<AdicionarEmail />}
          >
            <ul className="divide-y">
              {emailPrincipalPessoal && (
                <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5 first:pt-0 last:pb-0">
                  <span className="min-w-0 truncate text-sm font-medium">{emailPrincipalPessoal}</span>
                  <Badge variant="secondary" title="Altere pelo lápis de Dados pessoais">
                    Principal · recebe os avisos
                  </Badge>
                </li>
              )}
              {emailsPessoais.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
                  <span className="min-w-0 truncate text-sm">
                    <span className="font-medium">{e.email}</span>
                    {e.tipo ? <span className="text-muted-foreground"> · {e.tipo}</span> : ""}
                  </span>
                  <RemoverEmail emailId={e.id} />
                </li>
              ))}
            </ul>
            {!emailPrincipalPessoal && emailsPessoais.length === 0 && (
              <p className="text-muted-foreground text-sm">Nenhum e-mail pessoal cadastrado.</p>
            )}
          </CartaoLista>
        </div>
        <div className="grid min-w-0 gap-4">
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
                        e.cep ? `CEP ${formatarCep(e.cep)}` : null,
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

          {bancarios && (
            <Card className="gap-0 py-4">
              <CardContent className="grid gap-3 px-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 font-medium">
                    <Landmark className="text-muted-foreground size-4" />
                    Dados bancários
                  </p>
                  <Button variant="ghost" size="sm" className="h-7" asChild>
                    <Link href="/painel/perfil/dados-bancarios">
                      <Pencil />
                      Gerenciar
                    </Link>
                  </Button>
                </div>
                {contaPrincipal ? (
                  <div className="grid gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">Principal</Badge>
                      {contaPrincipal.ciente && (
                        <Badge variant="outline" className="border-success/40 text-success-fg">
                          <BadgeCheck />
                          Financeiro ciente
                        </Badge>
                      )}
                      {bancarios.contas.length > 1 && (
                        <span className="text-muted-foreground text-xs">+{bancarios.contas.length - 1} outra(s)</span>
                      )}
                    </div>
                    <ContaBancariaResumo conta={contaPrincipal} />
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Nenhuma conta cadastrada — inclua a sua para receber os pagamentos.</p>
                )}
                {pedidosAguardando > 0 && (
                  <p className="text-warning-fg text-xs">
                    {pedidosAguardando} pedido{pedidosAguardando === 1 ? "" : "s"} aguardando o Financeiro.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        <div className="grid min-w-0 gap-4 md:col-span-2 xl:col-span-1">
          {/* Espelho das áreas do Institucional: só leitura aqui. */}
          <Card className="gap-0 py-4">
            <CardContent className="grid gap-3 px-4">
              <div>
                <p className="flex items-center gap-2 font-medium">
                  <Building2 className="text-muted-foreground size-4" />
                  Contatos corporativos
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">Mantidos pela entidade, no Institucional</p>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground text-xs leading-5">E-mail corporativo</dt>
                <dd className="min-w-0 break-words">
                  {corporativos.emails.join(", ") || "—"}
                  {principalCorporativo && (
                    <Badge variant="secondary" className="ml-2" title="Altere pelo lápis de Dados pessoais">
                      Recebe os avisos
                    </Badge>
                  )}
                </dd>
                <dt className="text-muted-foreground text-xs leading-5">Telefone corporativo</dt>
                <dd className="tabular-nums">
                  {corporativos.celulares.map((c) => [formatarTelefone(c.numero), c.operadora].filter(Boolean).join(" · ")).join(", ") ||
                    "—"}
                </dd>
                <dt className="text-muted-foreground text-xs leading-5">Telefone direto</dt>
                <dd className="tabular-nums">
                  {corporativos.ramais
                    .filter((r) => r.telefoneDireto)
                    .map((r) => formatarTelefone(r.telefoneDireto))
                    .join(", ") || "—"}
                </dd>
                <dt className="text-muted-foreground text-xs leading-5">Ramal</dt>
                <dd className="tabular-nums">
                  {corporativos.ramais
                    .filter((r) => r.ramal)
                    .map((r) => [r.ramal, r.local].filter(Boolean).join(" · "))
                    .join(", ") || "—"}
                </dd>
              </dl>
            </CardContent>
          </Card>
        </div>
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

/** "12 anos e 3 meses", "8 meses", "1 ano". */
function textoTempo({ anos, meses }: { anos: number; meses: number }): string {
  const a = anos ? `${anos} ano${anos === 1 ? "" : "s"}` : ""
  const m = meses ? `${meses} ${meses === 1 ? "mês" : "meses"}` : ""
  return [a, m].filter(Boolean).join(" e ") || "menos de 1 mês"
}

/** Uma estrela por década de casa (funcionário) ou por mandato (diretor). */
function Estrelas({ quantidade, rotulo }: { quantidade: number; rotulo: string }) {
  if (quantidade <= 0) return null
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={`${quantidade} estrela${quantidade === 1 ? "" : "s"}: ${quantidade} ${rotulo}${quantidade === 1 ? "" : "s"}`}>
      {Array.from({ length: quantidade }, (_, i) => (
        <Star key={i} className="fill-primary text-primary size-4" aria-hidden />
      ))}
    </span>
  )
}
