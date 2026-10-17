import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { formatarAliquota, rotuloNivelSalarial, type CarreiraFuncionario } from "@/lib/db/carreira"
import { usoCarreira } from "@/lib/db/carreira-area"
import type { PerfilFuncionario } from "@/lib/db/pessoal"
import { formatarData } from "@/lib/formato"
import { areasDoFuncionario, type AreaFuncionario } from "@/lib/pessoal-area"
import type { Permissoes } from "@/lib/permissoes"

/**
 * A ficha do funcionário como PONTO DE ENTRADA (padrão de 3 níveis): uma
 * linha de resumo por área, levando à página da pessoa naquela área (nível 2).
 * Só as áreas que o usuário pode ver — e a Carreira só se a entidade a usa.
 */
export async function ResumoAreas({
  usuarioId,
  perfil,
  carreira,
  permissoes,
}: {
  usuarioId: string
  perfil: PerfilFuncionario
  carreira: CarreiraFuncionario
  permissoes: Permissoes | null
}) {
  const uso = await usoCarreira()
  const areas = areasDoFuncionario(permissoes).filter((a) => a.chave !== "carreira" || uso.anuenios || uso.niveis)
  const p = perfil
  const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`

  const resumo: Partial<Record<AreaFuncionario, string>> = {
    contracheques: p.contracheques.total
      ? `${plural(p.contracheques.total, "contracheque", "contracheques")} · último: ${p.contracheques.ultimas[0]?.remessa ?? "—"}`
      : "Nenhum contracheque",
    ponto: p.ponto.total
      ? `${plural(p.ponto.total, "registro", "registros")} · último: ${p.ponto.ultimas[0]?.remessa ?? "—"}`
      : "Nenhum registro de ponto",
    ferias: (() => {
      const abertos = p.feriasPeriodos.filter((x) => x.finalizado !== true).length
      return p.feriasPeriodos.length ? `${plural(abertos, "período em aberto", "períodos em aberto")} de ${p.feriasPeriodos.length}` : "Nenhum período de férias"
    })(),
    carreira: [
      carreira.anuenios[0] && `anuênio ${formatarAliquota(carreira.anuenios[0].nivelAtual?.aliquota)}`,
      carreira.niveis[0] && `nível ${rotuloNivelSalarial(carreira.niveis[0].nivelAtual)}`,
    ]
      .filter(Boolean)
      .join(" · ") || "Sem lançamentos",
    faltas: p.faltas.total
      ? `${plural(p.faltas.total, "falta justificada", "faltas justificadas")} · última em ${formatarData(p.faltas.ultimas[0]?.data_falta ?? null)}`
      : "Nenhuma falta justificada",
    atestados: `${plural(p.atestados.total, "atestado", "atestados")} · ${plural(p.ausencias.total, "ausência", "ausências")}`,
    aso: (() => {
      const u = [...p.asos].filter((a) => a.realizado !== false).sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""))[0]
      return u ? `último em ${formatarData(u.data)} · vence em ${formatarData(u.vencimento)}` : "Nenhum ASO realizado"
    })(),
    diarias: "Solicitações, remessas e valores recebidos",
    reembolsos: "Pedidos do ACT e o uso por tipo",
    treinamentos: "Treinamentos feitos, validade e exigidos",
    sst: "Função, riscos, jornada e Ordem de Serviço",
    informes: "Informes de rendimentos por ano-base",
  }

  if (areas.length === 0) return null
  return (
    <section aria-label="Áreas do funcionário">
      <h2 className="mb-2 text-sm font-medium">Áreas</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((a) => (
          <Link
            key={a.chave}
            href={a.href(usuarioId)}
            className="group hover:border-primary bg-card flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">{a.rotulo}</span>
              <span className="text-muted-foreground block truncate text-xs">{resumo[a.chave] ?? "Abrir"}</span>
            </span>
            <ArrowRight className="text-muted-foreground group-hover:text-primary size-4 shrink-0" />
          </Link>
        ))}
      </div>
    </section>
  )
}
