import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import QRCode from "qrcode"
import { ArrowLeft } from "lucide-react"

import { AcoesMocao, MocaoForm, ProgressoLimiar } from "@/app/painel/representacao/congressos/mocoes-componentes"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { listarUnidades, obterCongresso } from "@/lib/db/congressos"
import {
  EXPLICA_LOCAL,
  EXPLICA_NOMES,
  mocaoPorCodigo,
  participantePeloLink,
  progressoDaMocao,
  regrasDasMocoes,
  ROTULO_SITUACAO_MOCAO,
  situacaoDaPessoa,
} from "@/lib/db/congressos-mocoes"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

import { AssinarMocao } from "./assinar-mocao"

export const metadata: Metadata = { title: "Assinar moção — Confluir", robots: { index: false }, referrer: "no-referrer" }

/** Ler e assinar a moção pelo link pessoal; quem apresentou também acompanha, altera e protocola daqui. */
export default async function AssinarMocaoPage({ params }: { params: Promise<{ token: string; codigo: string }> }) {
  const { token, codigo } = await params
  const tenantId = await tenantAtual()
  const p = await participantePeloLink(token, tenantId)
  if (!p) notFound()
  const m = await mocaoPorCodigo(tenantId, codigo.toUpperCase())
  if (!m || m.congressoId !== p.congressoId) notFound()
  const c = await obterCongresso(p.congressoId)
  if (!c) notFound()
  const regras = regrasDasMocoes(c)
  const minha = m.proponenteId === p.id
  const [pessoa, prog, origem, unidades] = await Promise.all([
    situacaoDaPessoa(c, tenantId, m, p.id),
    progressoDaMocao(c, tenantId, m, p.credenciado ? "credenciado" : "publico"),
    origemAtual(),
    minha ? listarUnidades(c.id) : Promise.resolve([]),
  ])
  const qr = minha && m.situacao === "coleta" ? await QRCode.toDataURL(`${origem}/congresso/mocao/${m.codigo}`, { margin: 1, width: 420 }) : null

  return (
    <main className="mx-auto grid w-full max-w-2xl gap-4 px-4 py-6">
      <Link href={`/congresso/eu/${token}`} className="text-muted-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeft className="size-4" />
        Minha participação
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>
            Moção {m.numero}
            {m.tipo ? ` · ${m.tipo}` : ""}: {m.titulo}
          </CardTitle>
          <p className="text-muted-foreground text-xs">
            {ROTULO_SITUACAO_MOCAO[m.situacao]}
            {m.destinatario ? ` · Destinatário: ${m.destinatario}` : ""}
            {m.proponenteNome ? ` · Apresentada por ${m.proponenteNome}` : ""}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-base whitespace-pre-wrap">{m.texto}</p>
          <AssinarMocao
            token={token}
            codigo={m.codigo}
            textoHash={m.textoHash}
            jaAssinou={!!pessoa.jaAssinou}
            pode={pessoa.resposta.pode}
            motivo={pessoa.resposta.motivo ?? null}
            precisaCodigo={!!pessoa.resposta.precisaCodigo}
            podeRetirar={regras.retirar && m.situacao === "coleta"}
            regras={`${EXPLICA_LOCAL[regras.regraLocal]} ${EXPLICA_NOMES[regras.nomesVisiveis]}`}
          />
          <ProgressoLimiar limiar={prog.limiar} gravado={m.situacao !== "coleta"} />
          {prog.nomes && prog.nomes.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer">Quem assinou ({prog.nomes.length})</summary>
              <p className="mt-2">{prog.nomes.join(", ")}</p>
            </details>
          )}
        </CardContent>
      </Card>

      {minha && (
        <>
          {qr && (
            <Card>
              <CardHeader>
                <CardTitle>QR para colher assinaturas</CardTitle>
              </CardHeader>
              <CardContent className="grid justify-items-center gap-2 text-center text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="QR da moção" className="size-60 rounded-lg border bg-white p-2" />
                <p className="text-muted-foreground">Mostre este QR: quem lê abre a moção e assina pelo próprio link.</p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>A sua moção</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <AcoesMocao origem={{ tipo: "link", token }} mocaoId={m.id} situacao={m.situacao} podeDecidir={false} />
              {m.situacao === "coleta" && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium">Alterar o texto</summary>
                  <div className="mt-3">
                    <MocaoForm
                      origem={{ tipo: "link", token }}
                      tipos={regras.tipos}
                      bases={unidades.map((u) => ({ id: u.id, nome: u.nome }))}
                      mocaoId={m.id}
                      temAssinaturas={prog.total > 0}
                      inicial={{ tipo: m.tipo, titulo: m.titulo, destinatario: m.destinatario, texto: m.texto, unidadeId: m.unidadeId }}
                    />
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  )
}
