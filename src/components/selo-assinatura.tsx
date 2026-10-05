import { BadgeCheck, CircleHelp, ShieldAlert, ShieldX } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import type { ValidacaoAssinatura } from "@/lib/assinatura-pdf"
import { formatarDataHora } from "@/lib/formato"

/**
 * Selo da validação de assinatura (onda 5, A4): válida, íntegra com
 * ressalva, inválida, sem assinatura. Mostra o essencial e, aberto, o
 * detalhe por assinatura.
 */
export function SeloAssinatura({ validacao, compacto = false }: { validacao: ValidacaoAssinatura | null | undefined; compacto?: boolean }) {
  if (!validacao) {
    return (
      <Alert>
        <CircleHelp />
        <AlertDescription>Assinatura ainda não verificada.</AlertDescription>
      </Alert>
    )
  }
  const v = validacao
  const classe =
    v.situacao === "valida" ? "border-success/40 text-success-fg" : v.situacao === "ressalva" ? "border-warning/40 text-warning-fg" : v.situacao === "invalida" ? "" : ""
  const Icone = v.situacao === "valida" ? BadgeCheck : v.situacao === "ressalva" ? ShieldAlert : v.situacao === "invalida" ? ShieldX : CircleHelp
  return (
    <Alert variant={v.situacao === "invalida" ? "destructive" : "default"} className={classe}>
      <Icone />
      <AlertDescription>
        <p>
          <strong>
            {v.situacao === "valida" ? "Assinatura válida" : v.situacao === "ressalva" ? "Assinatura íntegra, com ressalva" : v.situacao === "invalida" ? "Assinatura inválida" : v.situacao === "sem_assinatura" ? "Sem assinatura digital" : "Não foi possível verificar"}
          </strong>
          {v.cpfConfere === true ? " · CPF confere com o cadastro" : v.cpfConfere === false ? " · CPF NÃO confere com o cadastro" : ""}
        </p>
        <p className="mt-1">{v.resumo}</p>
        {!compacto && v.assinaturas.length > 0 && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer">Detalhe ({v.assinaturas.length} assinatura{v.assinaturas.length === 1 ? "" : "s"}) · verificado em {formatarDataHora(v.verificadoEm)}</summary>
            <ul className="mt-1 grid gap-1">
              {v.assinaturas.map((a, i) => (
                <li key={i} className="font-mono">
                  {a.nome ?? "?"}
                  {a.cpf ? ` · CPF ${a.cpf}` : " · sem CPF"} · emissor {a.emissor ?? "?"} · raiz {a.raiz ?? "?"}
                  {a.raizConfiada ? " (confiada)" : a.icpBrasilPeloNome ? " (ICP-Brasil pelo nome)" : ""} · {a.integra ? "íntegra" : "ADULTERADA"} · {a.assinaturaOk ? "assinatura ok" : "assinatura NÃO confere"}
                  {a.dentroDaValidade === false ? " · certificado vencido" : ""} · {a.cobreArquivoTodo ? "cobre o arquivo todo" : "cobre versão anterior"} · {a.algoritmo ?? ""}
                  {a.assinadoEm ? ` · ${formatarDataHora(a.assinadoEm)}` : ""}
                  {a.erro ? ` · ${a.erro}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </AlertDescription>
    </Alert>
  )
}
