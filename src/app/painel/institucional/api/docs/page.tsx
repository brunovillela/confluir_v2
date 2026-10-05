import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ENDPOINTS_API, EVENTOS_WEBHOOK } from "@/lib/api-publica-catalogo"
import { requirePermissao } from "@/lib/auth"
import { origemAtual } from "@/lib/tenant-url"

export const metadata: Metadata = { title: "Documentação da API — Confluir" }

/** Gerada do catálogo: endpoints, parâmetros, campos e o formato dos webhooks. */
export default async function ApiDocsPage() {
  await requirePermissao("configuracoes")
  const origem = await origemAtual()
  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional/api">
            <ArrowLeft />
            API e webhooks
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Documentação da API</h1>
        <p className="text-muted-foreground mt-1 text-xs">Para quem vai integrar: contador, Power BI, site da entidade.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como chamar</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p>
            Todas as chamadas são <code className="font-mono">GET</code> em <code className="font-mono">{origem}/api/v1/…</code> com a chave no cabeçalho:
          </p>
          <pre className="bg-muted/40 overflow-x-auto rounded-md p-3 font-mono text-xs">{`curl -H "Authorization: Bearer cf_XXXXXXXX_…" "${origem}/api/v1/filiados?pagina=1"`}</pre>
          <p className="text-muted-foreground text-xs">
            Respostas em JSON (UTF-8), sem cache. Limite de 120 chamadas por minuto por chave. A chave só funciona neste endereço (o da sua entidade). No Power BI, use &quot;Obter dados → Web&quot; com o cabeçalho Authorization.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Endpoints</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {ENDPOINTS_API.map((e) => (
            <div key={e.caminho} className="grid gap-1 border-b pb-3 text-sm last:border-0">
              <p className="font-mono font-medium">GET {e.caminho}</p>
              <p>{e.descricao}</p>
              {e.parametros.length > 0 && (
                <ul className="text-muted-foreground list-disc pl-5 text-xs">
                  {e.parametros.map((p) => (
                    <li key={p.nome}>
                      <span className="font-mono">{p.nome}</span>: {p.descricao}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-muted-foreground font-mono text-xs">{e.campos}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhooks</CardTitle>
          <CardDescription className="text-xs">O Confluir faz um POST JSON na sua URL a cada evento marcado.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <pre className="bg-muted/40 overflow-x-auto rounded-md p-3 font-mono text-xs">{`POST <sua URL>
Content-Type: application/json
X-Confluir-Evento: ordem.paga
X-Confluir-Entrega: <id da entrega>
X-Confluir-Assinatura: sha256=<HMAC-SHA256 do corpo com o segredo do webhook>

{ "evento": "ordem.paga", "entidade": "<id>", "em": "2026-10-05T12:00:00.000Z", "dados": { … } }`}</pre>
          <p className="text-muted-foreground text-xs">
            Responda 2xx em até 10 segundos. Sem resposta ou com erro, reenviamos em 1 min, 10 min, 1 h e 6 h; depois a entrega fica como &quot;falhou&quot; e pode ser reenviada à mão. Confira a assinatura antes de confiar no corpo.
          </p>
          <ul className="grid gap-1 text-xs sm:grid-cols-2">
            {EVENTOS_WEBHOOK.map((e) => (
              <li key={e.chave}>
                <span className="font-mono">{e.chave}</span> — {e.descricao}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  )
}
