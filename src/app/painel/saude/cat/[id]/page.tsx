import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CircleCheck, Pencil, TriangleAlert, UserRound } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import {
  buscarSugestaoFiliado,
  filiadosAtivosPorCpf,
} from "@/lib/db/filiados"
import { buscarCat } from "@/lib/db/saude"
import { formatarCnpjCpf, formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { CAMPOS_CAT, nomeCampo } from "@/lib/saude-campos"
import { rotuloTipoAcidente } from "@/lib/saude-constantes"

import { CatForm } from "../cat-forms"
import { VincularFiliado } from "../vincular-filiado"

export const metadata: Metadata = { title: "CAT — Confluir" }

/** Blocos na mesma ordem do formulário oficial, com o nº de cada campo. */
export default async function CatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ editar?: string; salvo?: string }>
}) {
  const sessao = await requirePermissao("saude_cat", [
    "saude_atendimento",
    "saude_gestao",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "saude_cat", [
    "saude_gestao",
  ])

  const { id } = await params
  const { editar, salvo } = await searchParams
  const cat = (await buscarCat(id)) as Record<string, unknown> | null
  if (!cat) notFound()

  // Edição reusa o mesmo formulário do cadastro, preenchido.
  if (editar === "1" && podeEditar) {
    const valores: Record<string, string> = {}
    for (const campo of CAMPOS_CAT) {
      const descricao = cat[campo.coluna]
      const codigo = campo.colunaCodigo ? cat[campo.colunaCodigo] : null
      let texto = ""
      if (campo.tipo === "bool") {
        texto = descricao === true ? "Sim" : descricao === false ? "Não" : ""
      } else if (codigo && descricao) {
        // Volta ao formato "código – descrição" que o campo aceita.
        texto = `${codigo} – ${descricao}`
      } else if (descricao != null) {
        texto = String(descricao)
      }
      valores[nomeCampo(campo)] = texto
    }
    return (
      <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Editar CAT
            </h1>
            <p className="text-muted-foreground mt-1 text-xs tabular-nums">
              {(cat.numero_cat as string | null) ?? "sem número"}
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/painel/saude/cat/${id}`}>Cancelar</Link>
          </Button>
        </div>
        <CatForm id={id} valores={valores} />
      </>
    )
  }

  const t = (c: string) => (cat[c] as string | null) ?? null
  const b = (c: string) => (cat[c] as boolean | null) ?? null
  const simNao = (v: boolean | null) =>
    v === true ? "Sim" : v === false ? "Não" : null

  /** Junta código e descrição no formato do formulário: "código – Descrição". */
  const comCodigo = (codigo: string, descricao: string) => {
    const c = t(codigo)
    const d = t(descricao)
    if (c && d) return `${c} – ${d}`
    return d ?? c
  }

  // Vínculo com filiado: o atual (se houver) e, quando não há e a CAT traz CPF,
  // as filiações ativas com aquele CPF (atalho de vínculo, só para quem edita).
  const filiadoId = t("filiado_id")
  const [filiadoAtual, sugestoesCpf] = await Promise.all([
    filiadoId ? buscarSugestaoFiliado(filiadoId) : Promise.resolve(null),
    !filiadoId && podeEditar
      ? filiadosAtivosPorCpf(t("trabalhador_cpf"))
      : Promise.resolve([]),
  ])

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight tabular-nums">
              {t("numero_cat") ?? "CAT sem número"}
            </h1>
            {b("houve_morte") === true && (
              <Badge variant="outline" className="border-warning/40 text-warning-fg">
                Óbito
              </Badge>
            )}
            {b("afastamento_durante_tratamento") === true && (
              <Badge variant="outline">Afastamento</Badge>
            )}
            {b("houve_internacao") === true && (
              <Badge variant="outline">Internação</Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("trabalhador_nome") ?? "Acidentado não informado"}
            {t("data_acidente") ? ` — ${formatarData(t("data_acidente"))}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {podeEditar && (
            <Button variant="outline" asChild>
              <Link href={`/painel/saude/cat/${id}?editar=1`}>
                <Pencil />
                Editar
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href="/painel/saude/cat">Voltar à lista</Link>
          </Button>
        </div>
      </div>

      {salvo === "1" && (
        <Alert variant="success">
          <CircleCheck />
          <AlertDescription>CAT salva.</AlertDescription>
        </Alert>
      )}

      {b("descricao_truncada") === true && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>
            Registro da geração antiga da base: as descrições dos campos 31, 32,
            34 e 45 chegaram truncadas e sem o código oficial. O texto abaixo é o
            que existia na origem — nada foi completado por inferência.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <div className="mb-3 flex items-center gap-2">
            <UserRound className="text-muted-foreground size-4" />
            <p className="text-sm font-medium">Filiado vinculado</p>
          </div>
          {podeEditar ? (
            <VincularFiliado
              key={filiadoAtual?.id ?? "sem-vinculo"}
              catId={id}
              atual={filiadoAtual}
              sugestoesCpf={sugestoesCpf}
            />
          ) : filiadoAtual ? (
            <p className="text-sm">
              <Link
                href={`/painel/filiados/${filiadoAtual.id}`}
                className="text-primary font-medium hover:underline"
              >
                {filiadoAtual.nome_completo ?? "(sem nome)"}
              </Link>
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Nenhum filiado vinculado a esta CAT.
            </p>
          )}
        </CardContent>
      </Card>

      <Bloco titulo="I — Emitente">
        <Campo n={1} rotulo="Emitente" valor={t("emitente")} />
        <Campo n={2} rotulo="Tipo de CAT" valor={t("tipo_cat")} />
        <Campo n={3} rotulo="Iniciativa da CAT" valor={t("iniciativa_cat")} />
        <Campo n={4} rotulo="Fonte do cadastramento" valor={t("fonte_cadastramento")} />
        <Campo n={5} rotulo="Número da CAT" valor={t("numero_cat")} />
        <Campo n={6} rotulo="Recibo do eSocial" valor={t("recibo_esocial")} />
      </Bloco>

      <Bloco titulo="II — Empregador">
        <Campo n={7} rotulo="Razão social / Nome" valor={t("empregador_razao_social")} />
        <Campo n={8} rotulo="Tipo" valor={t("empregador_tipo")} />
        <Campo
          n={9}
          rotulo="Número de inscrição"
          valor={t("empregador_inscricao") ? formatarCnpjCpf(t("empregador_inscricao")) : null}
        />
        <Campo n={10} rotulo="CNAE" valor={t("empregador_cnae")} />
      </Bloco>

      <Bloco titulo="III — Acidentado">
        <Campo n={11} rotulo="Nome" valor={t("trabalhador_nome")} />
        <Campo
          n={12}
          rotulo="CPF"
          valor={t("trabalhador_cpf") ? formatarCnpjCpf(t("trabalhador_cpf")) : null}
        />
        <Campo n={13} rotulo="Data de nascimento" valor={formatarData(t("trabalhador_nascimento")) || null} />
        <Campo n={14} rotulo="Sexo" valor={t("trabalhador_sexo")} />
        <Campo n={15} rotulo="Estado civil" valor={t("trabalhador_estado_civil")} />
        <Campo n={16} rotulo="CBO" valor={comCodigo("trabalhador_cbo_codigo", "trabalhador_cbo")} />
        <Campo n={17} rotulo="Filiação à Previdência Social" valor={t("filiacao_previdencia")} />
        <Campo n={18} rotulo="Áreas" valor={t("areas")} />
      </Bloco>

      <Bloco titulo="IV — Acidente ou doença">
        <Campo n={19} rotulo="Data do acidente" valor={formatarData(t("data_acidente")) || null} />
        <Campo n={20} rotulo="Hora do acidente" valor={t("hora_acidente")} />
        <Campo n={21} rotulo="Após quantas horas de trabalho" valor={t("horas_trabalhadas_antes")} />
        <Campo n={22} rotulo="Tipo" valor={rotuloTipoAcidente(t("tipo_acidente"))} />
        <Campo n={23} rotulo="Houve afastamento?" valor={simNao(b("houve_afastamento"))} />
        <Campo n={24} rotulo="Último dia trabalhado" valor={formatarData(t("ultimo_dia_trabalhado")) || null} />
        <Campo n={25} rotulo="Local do acidente" valor={t("local_acidente")} />
        <Campo n={26} rotulo="Especificação do local" valor={t("local_especificacao")} largo />
        <Campo
          n={27}
          rotulo="CNPJ/CAEPF/CNO do local"
          valor={t("local_inscricao") ? formatarCnpjCpf(t("local_inscricao")) : null}
        />
        <Campo n={28} rotulo="UF" valor={t("local_uf")} />
        <Campo n={29} rotulo="Município do local" valor={t("local_municipio")} />
        <Campo n={30} rotulo="País" valor={t("local_pais")} />
        <Campo n={31} rotulo="Parte do corpo atingida" valor={comCodigo("parte_atingida_codigo", "parte_atingida")} largo />
        <Campo n={32} rotulo="Agente causador" valor={comCodigo("agente_causador_codigo", "agente_causador")} largo />
        <Campo n={33} rotulo="Lateralidade" valor={t("lateralidade")} />
        <Campo n={34} rotulo="Situação geradora do acidente ou doença" valor={comCodigo("situacao_geradora_codigo", "situacao_geradora")} largo />
        <Campo n={35} rotulo="Houve registro policial?" valor={simNao(b("houve_registro_policial"))} />
        <Campo n={36} rotulo="Houve morte?" valor={simNao(b("houve_morte"))} />
        <Campo n={37} rotulo="Data do óbito" valor={formatarData(t("data_obito")) || null} />
        <Campo n={38} rotulo="Observações" valor={t("observacoes_acidente")} largo />
        <Campo n={39} rotulo="Data do recebimento" valor={formatarData(t("data_recebimento")) || null} />
      </Bloco>

      <Bloco titulo="V — Atendimento médico">
        <Campo n={40} rotulo="Data" valor={formatarData(t("data_atendimento")) || null} />
        <Campo n={41} rotulo="Hora" valor={t("hora_atendimento")} />
        <Campo n={42} rotulo="Houve internação?" valor={simNao(b("houve_internacao"))} />
        <Campo
          n={43}
          rotulo="Provável duração do tratamento"
          valor={
            cat.duracao_tratamento_dias != null
              ? `${cat.duracao_tratamento_dias} dias`
              : null
          }
        />
        <Campo
          n={44}
          rotulo="Deverá afastar-se durante o tratamento?"
          valor={simNao(b("afastamento_durante_tratamento"))}
        />
      </Bloco>

      <Bloco titulo="VI — Atestado médico">
        <Campo n={45} rotulo="Descrição e natureza da lesão" valor={comCodigo("natureza_lesao_codigo", "natureza_lesao")} largo />
        <Campo n={46} rotulo="Diagnóstico provável" valor={t("diagnostico_provavel")} largo />
        <Campo n={47} rotulo="CID-10" valor={comCodigo("cid10", "cid10_descricao")} />
        <Campo n={48} rotulo="Local e data" valor={t("local_e_data")} />
        <Campo n={49} rotulo="Nome do médico, CRM e UF" valor={t("medico_nome_crm_uf")} largo />
        <Campo n={50} rotulo="Observações" valor={t("observacoes_atestado")} largo />
      </Bloco>
    </>
  )
}

function Bloco({
  titulo,
  children,
}: {
  titulo: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-medium">{titulo}</p>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {children}
        </dl>
      </CardContent>
    </Card>
  )
}

function Campo({
  n,
  rotulo,
  valor,
  largo,
}: {
  n: number
  rotulo: string
  valor: string | null
  largo?: boolean
}) {
  return (
    <div className={largo ? "sm:col-span-2 lg:col-span-3" : undefined}>
      <dt className="text-muted-foreground text-xs">
        <span className="tabular-nums">{n}</span> — {rotulo}
      </dt>
      <dd className={valor ? "text-sm" : "text-muted-foreground text-sm"}>
        {valor || "—"}
      </dd>
    </div>
  )
}
