import type { Metadata } from "next"
import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  Plug,
  ScanFace,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react"

import { CartaoArea, GRADE_AREAS } from "@/components/cartao-area"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { listarAgentes } from "@/lib/acesso-agente"
import { ONLINE_ATE_MS } from "@/lib/acesso-agente-constantes"
import { listarChavesApi } from "@/lib/api-publica"
import { requirePermissao } from "@/lib/auth"
import { revisarAcessos, ROTULO_MOTIVO, type MotivoRevisao } from "@/lib/db/acessos-revisao"
import { DIAS_ENTRE_REVISOES, saudeRevisaoPeriodica } from "@/lib/db/acessos-revisao-ciclo"
import { segundoFatorAtivo } from "@/lib/db/acessos-mfa"
import { mesAtual, obterConfigIA } from "@/lib/db/ia-config"
import { resumoUsoIA } from "@/lib/db/ia-uso"
import { listarWebhooks } from "@/lib/db/webhooks"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Gestão — Confluir" }

type Area = {
  titulo: string
  descricao: string
  href: string
  icone: LucideIcon
  chave: string
  chavesAlternativas?: string[]
}

const GRUPOS: { titulo: string; areas: Area[] }[] = [
  {
    titulo: "Inteligência Artificial",
    areas: [
      {
        titulo: "Inteligência Artificial",
        descricao: "Chave de API própria, modelo, teto mensal e o uso por pessoa, processo, departamento e módulo",
        href: "/painel/gestao/ia",
        icone: Sparkles,
        chave: "gestao_sistema",
      },
    ],
  },
  {
    titulo: "Acesso e usuários",
    areas: [
      {
        titulo: "Usuários e permissões",
        descricao: "Quem acessa o painel, o perfil de cada um e as exceções",
        href: "/painel/gestao/usuarios",
        icone: ShieldCheck,
        chave: "permissoes",
        chavesAlternativas: ["gestao_sistema"],
      },
      {
        titulo: "Revisão de acessos",
        descricao: "Desligados, diretores fora do mandato e contas paradas que ainda têm acesso",
        href: "/painel/gestao/usuarios/revisao",
        icone: UserCheck,
        chave: "gestao_sistema",
        chavesAlternativas: ["permissoes"],
      },
      {
        titulo: "Perfis de acesso",
        descricao: "Pacotes de permissões por função, com a alçada de aprovação",
        href: "/painel/gestao/usuarios/perfis",
        icone: UserCog,
        chave: "permissoes",
        chavesAlternativas: ["gestao_sistema"],
      },
      {
        titulo: "Quadro da entidade",
        descricao: "Funcionários, diretores e prestadores: quem pode receber acesso",
        href: "/painel/gestao/usuarios/quadro",
        icone: Users,
        chave: "permissoes",
        chavesAlternativas: ["gestao_sistema"],
      },
      {
        titulo: "Auditoria",
        descricao: "Quem alterou o quê: permissões, usuários, filiações, dados bancários, ordens",
        href: "/painel/gestao/auditoria",
        icone: ScrollText,
        chave: "institucional_auditoria",
        chavesAlternativas: ["gestao_sistema", "permissoes"],
      },
    ],
  },
  {
    titulo: "Integrações",
    areas: [
      {
        titulo: "API e webhooks",
        descricao: "Chaves de leitura e avisos a outros sistemas",
        href: "/painel/gestao/api",
        icone: Plug,
        chave: "gestao_sistema",
      },
      {
        titulo: "Controle de acesso",
        descricao: "Agente da recepção que liga o Confluir às catracas",
        href: "/painel/gestao/controle-acesso",
        icone: ScanFace,
        chave: "gestao_sistema",
      },
    ],
  },
]

type Sinal = { texto: string; href: string; alerta: boolean }

const NOVENTA_DIAS = 90 * 24 * 3600_000

/** "1 chave", "3 chaves". */
function n(qtd: number, singular: string, plural: string): string {
  return `${qtd} ${qtd === 1 ? singular : plural}`
}

/** Saúde do sistema: o que merece a atenção do administrador agora. */
async function sinais(podeUsuarios: boolean, podeConfig: boolean): Promise<Sinal[]> {
  const lista: Sinal[] = []
  const [revisao, periodica, chaves, webhooks, agentes, ia, usoMes] = await Promise.all([
    podeUsuarios ? revisarAcessos() : Promise.resolve(null),
    podeUsuarios ? saudeRevisaoPeriodica() : Promise.resolve(null),
    podeConfig ? listarChavesApi() : Promise.resolve(null),
    podeConfig ? listarWebhooks() : Promise.resolve(null),
    podeConfig ? listarAgentes() : Promise.resolve(null),
    podeConfig ? obterConfigIA() : Promise.resolve(null),
    podeConfig ? resumoUsoIA(mesAtual().de, mesAtual().ate) : Promise.resolve(null),
  ])

  if (revisao) {
    const acessos = revisao.acessos
    // Revisão de acessos: desligados e diretores fora do mandato são alerta;
    // parados há 90 dias e nunca usados, só lembrete.
    const graves: MotivoRevisao[] = ["desligado", "diretor_fora"]
    for (const m of ["desligado", "diretor_fora", "sem_login", "nunca_entrou"] as MotivoRevisao[]) {
      const qtd = revisao.contagem[m]
      if (!qtd) continue
      lista.push({
        texto: `${ROTULO_MOTIVO[m]} e ainda com acesso: ${n(qtd, "pessoa", "pessoas")}`,
        href: `/painel/gestao/usuarios/revisao?motivo=${m}`,
        alerta: graves.includes(m),
      })
    }
    // Revisão periódica pelos coordenadores: em andamento, vencida ou atrasada.
    if (periodica?.disponivel) {
      const href = "/painel/gestao/usuarios/revisao#periodica"
      if (periodica.aberto) {
        lista.push({
          texto: `Revisão periódica de acessos em andamento (${periodica.aberto.titulo})${periodica.pendentes ? `: ${n(periodica.pendentes, "item pendente", "itens pendentes")}` : ": tudo respondido, pode encerrar"}${periodica.prazoVencido ? " — prazo vencido" : ""}`,
          href,
          alerta: periodica.prazoVencido && periodica.pendentes > 0,
        })
      } else if (periodica.diasDesdeUltima === null || periodica.diasDesdeUltima >= DIAS_ENTRE_REVISOES) {
        lista.push({
          texto:
            periodica.diasDesdeUltima === null
              ? "Nenhuma revisão periódica de acessos pelos coordenadores foi feita ainda"
              : `Última revisão periódica de acessos há ${periodica.diasDesdeUltima} dias: está na hora de uma nova`,
          href,
          alerta: false,
        })
      }
    }
    const pessoas = acessos.filter((a) => !a.contaFuncao)
    const semLogin = pessoas.filter((a) => !a.temLogin)
    lista.push({
      texto: `${n(pessoas.length, "pessoa", "pessoas")} com acesso ao painel${semLogin.length ? `, ${semLogin.length} ainda sem login` : ""}`,
      href: "/painel/gestao/usuarios",
      alerta: false,
    })
    // 2FA dos administradores: poucos, uma consulta ao Auth para cada.
    const admins = acessos.filter((a) => a.ehAdmin && a.usuarioId && a.temLogin).slice(0, 25)
    const fatores = await Promise.all(admins.map((a) => segundoFatorAtivo(a.usuarioId!).catch(() => null)))
    const sem2fa = admins.filter((_, i) => fatores[i] === false)
    lista.push({
      texto: sem2fa.length
        ? `${sem2fa.length} de ${n(admins.length, "administrador", "administradores")} sem verificação em duas etapas: ${sem2fa.map((a) => a.nome ?? "sem nome").join(", ")}`
        : admins.length === 1
          ? "O administrador usa verificação em duas etapas"
          : `Todos os ${admins.length} administradores usam verificação em duas etapas`,
      href: "/painel/gestao/usuarios",
      alerta: sem2fa.length > 0,
    })
  }

  if (ia && ia.disponivel) {
    const t = usoMes?.total
    const custo = t?.custo ?? null
    const teto = ia.limiteMensalUsd
    const pct = teto && custo !== null ? Math.round((custo / teto) * 100) : null
    lista.push({
      texto: !ia.iaAtiva
        ? "A IA está desligada na entidade"
        : `IA no mês: ${n(t?.chamadas ?? 0, "chamada", "chamadas")}${custo !== null && ia.precoEntrada !== null ? `, US$ ${custo.toFixed(2).replace(".", ",")}` : ""}${pct !== null ? ` (${pct}% do teto)` : ""} · ${ia.temChave ? "conta da entidade" : "conta da plataforma"}`,
      href: "/painel/gestao/ia",
      alerta: !ia.iaAtiva || (pct !== null && pct >= 80) || Boolean(ia.temChave && (ia.chaveTesteErro || ia.chaveIlegivel)),
    })
    if (t && t.falhas > 0) {
      lista.push({ texto: `${n(t.falhas, "chamada de IA falhou", "chamadas de IA falharam")} neste mês`, href: "/painel/gestao/ia?falhas=1#historico", alerta: t.falhas >= 5 })
    }
  }

  if (chaves?.disponivel) {
    const ativas = chaves.chaves.filter((c) => !c.revogadaEm)
    const paradas = ativas.filter((c) => !c.ultimoUsoEm || Date.now() - new Date(c.ultimoUsoEm).getTime() > NOVENTA_DIAS)
    if (ativas.length) {
      lista.push({
        texto: `${n(ativas.length, "chave de API ativa", "chaves de API ativas")}${paradas.length ? `, ${paradas.length} sem uso há 90 dias (revogar?)` : ""}`,
        href: "/painel/gestao/api",
        alerta: paradas.length > 0,
      })
    }
  }
  if (webhooks) {
    const comFalha = webhooks.webhooks.filter((w) => w.ativo && w.falhasSeguidas > 0)
    if (comFalha.length) lista.push({ texto: `${n(comFalha.length, "webhook", "webhooks")} com falhas seguidas`, href: "/painel/gestao/api", alerta: true })
  }
  if (agentes?.disponivel) {
    const ativos = agentes.agentes.filter((a) => !a.revogadoEm && a.pareadoEm)
    const fora = ativos.filter((a) => !a.ultimoContatoEm || Date.now() - new Date(a.ultimoContatoEm).getTime() > ONLINE_ATE_MS * 10)
    if (ativos.length) {
      lista.push({
        texto: fora.length
          ? `${fora.length} de ${n(ativos.length, "agente das catracas", "agentes das catracas")} sem contato: ${fora.map((a) => a.nome).join(", ")}`
          : `${n(ativos.length, "agente das catracas conectado", "agentes das catracas conectados")}`,
        href: "/painel/gestao/controle-acesso",
        alerta: fora.length > 0,
      })
    }
  }
  return lista.sort((a, b) => Number(b.alerta) - Number(a.alerta))
}

export default async function GestaoPage() {
  const sessao = await requirePermissao("gestao_sistema", ["permissoes", "institucional_auditoria"])
  const p = sessao.permissoes
  const podeUsuarios = podeAcessar(p, "permissoes", ["gestao_sistema"])
  const podeConfig = podeAcessar(p, "gestao_sistema")
  const grupos = GRUPOS.map((g) => ({ ...g, areas: g.areas.filter((a) => podeAcessar(p, a.chave, a.chavesAlternativas)) })).filter((g) => g.areas.length)
  const lista = await sinais(podeUsuarios, podeConfig)

  return (
    <>
      <div>
        <div className="flex items-center gap-2">
          <Settings className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Gestão</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          A administração do sistema na entidade: inteligência artificial, acesso e usuários, integrações e auditoria
        </p>
      </div>

      {lista.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saúde do sistema</CardTitle>
            <CardDescription className="text-xs">O que merece atenção primeiro aparece no alto.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {lista.map((s) => (
                <li key={s.texto}>
                  <Link href={s.href} className="flex items-start gap-2 underline-offset-4 hover:underline">
                    {s.alerta ? (
                      <AlertTriangle className="text-warning-fg mt-0.5 size-4 shrink-0" aria-label="Atenção" />
                    ) : (
                      <CheckCircle2 className="text-success-fg mt-0.5 size-4 shrink-0" aria-label="Em ordem" />
                    )}
                    <span>{s.texto}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {grupos.map((g) => (
        <section key={g.titulo} className="grid gap-3">
          <h2 className="text-muted-foreground text-sm font-medium">{g.titulo}</h2>
          <div className={GRADE_AREAS}>
            {g.areas.map((a) => (
              <CartaoArea key={a.href} titulo={a.titulo} descricao={a.descricao} href={a.href} icone={a.icone} />
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
