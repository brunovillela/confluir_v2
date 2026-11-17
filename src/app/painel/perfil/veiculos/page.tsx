import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CarFront, IdCard, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Params } from "@/components/veiculos-condutor/filtros"
import { PainelCondutor } from "@/components/veiculos-condutor/painel-condutor"
import { requireSessaoPainel } from "@/lib/auth"
import { indicadoresDoCondutor } from "@/lib/db/veiculos-condutor"
import { buscarCondutorDoUsuario } from "@/lib/db/veiculos"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Meus veículos — Confluir" }

/**
 * MEUS VEÍCULOS (14/11/2026): a página do condutor (Veículos › Condutores)
 * vista pela própria pessoa — CNH, indicadores e o histórico de usos,
 * reservas, abastecimentos e infrações. Só leitura e sempre da sessão: o
 * usuário vem da sessão, nunca da URL. Os links para as telas do módulo só
 * aparecem a quem tem acesso a elas.
 */
export default async function MeusVeiculosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { usuario, permissoes } = await requireSessaoPainel()
  const sp = await searchParams
  const [cad, ind] = await Promise.all([buscarCondutorDoUsuario(usuario.id), indicadoresDoCondutor(usuario.id)])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/perfil">
            <ArrowLeft />
            Meu perfil
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Meus veículos</h1>
              <CarFront className="text-muted-foreground size-5" />
              {!cad ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Sem cadastro de condutor
                </Badge>
              ) : !cad.autorizado ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Não autorizado a dirigir
                </Badge>
              ) : cad.cnhVencida ? (
                <Badge variant="outline" className="border-destructive/40 text-destructive">
                  CNH vencida
                </Badge>
              ) : (
                <Badge variant="outline" className="border-success/40 text-success-fg">
                  Apto a dirigir
                </Badge>
              )}
              {ind.emUso > 0 && (
                <Badge variant="outline" className="border-warning/40 text-warning-fg">
                  Com veículo agora
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1">
                <IdCard className="size-3.5" />
                {cad?.cnh_numero ? `CNH ${cad.cnh_numero}` : "CNH não informada"}
                {cad?.cnh_categoria ? ` · categoria ${cad.cnh_categoria}` : ""}
                {cad?.cnh_validade ? ` · validade ${formatarData(cad.cnh_validade)}` : ""}
              </span>
              <span>
                {cad?.cnhVencida || !cad?.cnh_numero
                  ? "Para atualizar a CNH, envie a nova à gestão de veículos."
                  : "Seus usos, reservas, abastecimentos e infrações com os veículos da entidade."}
              </span>
            </p>
          </div>
          <Button size="sm" asChild>
            <Link href="/painel/solicitar-veiculo">
              <Plus />
              Solicitar veículo
            </Link>
          </Button>
        </div>
      </div>

      <PainelCondutor
        usuarioId={usuario.id}
        base="/painel/perfil/veiculos"
        ind={ind}
        params={sp}
        links={{ veiculos: podeAcessar(permissoes, "veiculos"), gestao: podeAcessar(permissoes, "veiculos_gestao") }}
        proprio
      />
    </>
  )
}
