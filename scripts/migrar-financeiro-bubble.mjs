// ===========================================================================
// migrar-financeiro-bubble.mjs — virada de Compras, Financeiro, Contratos e
// Contracheques (30/09/2026: "amanhã será tudo por aqui").
//
// A migração de junho trouxe esses tipos uma vez; o que nasceu ou MUDOU no
// Bubble depois disso só existe lá. Este script, na ordem em que as
// referências exigem:
//
//   empresas      empresa → empresa                    (fornecedores novos)
//   projetos      projeto → projeto
//   centros       financeiro-centrosdecusto → centros_de_custo
//   bancarios     dadosbancários → dados_bancarios      (fornecedor, usuário e
//                 filiado — os de fornecedor e usuário nunca tinham vindo)
//   contratos     contratos → contratos
//   compras       aquisição-compras → compras_solicitacoes
//   propostas     aquisição-compras-propostas → compras_propostas
//   ordens        financeiro-ordempgto → ordens_pagamento
//   remessas      pessoal-contracheques-remessas → pessoal_contracheques_remessas
//   contracheques pessoal-contracheques → pessoal_contracheques
//   remessas_ponto pessoal-registrodeponto-remessas → pessoal_registro_ponto_remessas
//   ponto         pessoal-registrodeponto → pessoal_registro_ponto
//   religar       ordens novas ↔ reembolsos de filiado e infrações (o vínculo
//                 mora do lado de lá) e a proposta escolhida de cada compra
//
// Para cada registro:
//   - não existe aqui (nem por Supabase_id nem por bubble_id) → INSERE;
//   - existe → coluna vazia aqui recebe o valor do Bubble; coluna com valor
//     DIFERENTE recebe o do Bubble (o Bubble era o sistema até hoje), EXCETO
//     no registro que já teve atividade aqui (protegido — ver `protegidos`).
//   Bubble vazio nunca apaga; arquivo já levado para o bucket não volta a
//   ser URL do CDN.
//
// Usuários, reembolsos de filiado, diárias e reembolsos do ACT têm script
// próprio (migrar-delta --so usuarios, migrar-lacunas-modelo, migrar-historicos,
// migrar-reembolsos-act): rodar ANTES (usuários) e DEPOIS (o resto) deste.
//
// Cache em .migracao-financeiro/ — `--renovar` baixa tudo de novo.
//
// USO:
//   node scripts/migrar-financeiro-bubble.mjs --renovar         (dry-run com cache novo)
//   node scripts/migrar-financeiro-bubble.mjs --apply
//   node scripts/migrar-financeiro-bubble.mjs --so ordens --apply
// ===========================================================================

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const args = process.argv.slice(2)
const APLICAR = args.includes("--apply")
const SO = (() => {
  const i = args.indexOf("--so")
  return i >= 0 ? args[i + 1].split(",") : null
})()
const CACHE = ".migracao-financeiro"
if (args.includes("--renovar")) rmSync(CACHE, { recursive: true, force: true })

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
)
const { createClient } = await import("@supabase/supabase-js")
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const TENANT = "c763cb99-edfd-4840-8453-ed3fcb66d4a1"
const BASE = (env.BUBBLE_API_ROOT || "").replace(/\/+$/, "").replace(/\/obj$/, "").replace("/version-test", "")
const TOKEN = env.BUBBLE_API_TOKEN

console.log(APLICAR ? "MODO APLICAR — vai gravar." : "DRY-RUN — nada será gravado.")

// ── leitura ────────────────────────────────────────────────────────────────

const normalizar = (s) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "")

async function comRetry(f, rotulo) {
  for (let t = 1; ; t++) {
    try {
      return await f()
    } catch (e) {
      if (t >= 5) throw new Error(`${rotulo}: ${e.message}`)
      await new Promise((r) => setTimeout(r, 1000 * t))
    }
  }
}

async function bubble(tipo) {
  mkdirSync(CACHE, { recursive: true })
  const arquivo = join(CACHE, normalizar(tipo) + ".json")
  if (existsSync(arquivo)) return JSON.parse(readFileSync(arquivo, "utf8"))
  const linhas = []
  const vistos = new Set()
  for (let cursor = 0; ; ) {
    const params = new URLSearchParams({ limit: "100", cursor: String(cursor), sort_field: "Created Date", descending: "false" })
    const j = await comRetry(async () => {
      const r = await fetch(`${BASE}/obj/${encodeURIComponent(tipo)}?${params}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
      if (r.status !== 200) throw new Error(`Bubble ${tipo}: ${r.status}`)
      return r.json()
    }, `Bubble ${tipo}`)
    const res = j.response?.results ?? []
    for (const item of res) if (!vistos.has(item._id)) { vistos.add(item._id); linhas.push(item) }
    cursor += res.length
    if (res.length === 0 || (j.response?.remaining ?? 0) === 0) break
    if (cursor >= 49_900) throw new Error(`${tipo} passa de 50 mil — usar leitura em janelas`)
  }
  writeFileSync(arquivo, JSON.stringify(linhas))
  return linhas
}

async function lerTudo(tabela, colunas, semTenant) {
  const linhas = []
  for (let de = 0; ; de += 1000) {
    let q = db.from(tabela).select(colunas).order("id", { ascending: true }).range(de, de + 999)
    if (!semTenant) q = q.eq("emp_proprietaria_id", TENANT)
    const { data, error } = await comRetry(() => q, tabela)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    linhas.push(...data)
    if (data.length < 1000) break
  }
  return linhas
}

// Referência do Bubble → id daqui: Supabase_id que o Bubble guarda, ou o
// bubble_id que a nossa linha guarda. Inserções desta rodada são aprendidas.
const resolvedores = new Map()
async function ref(tipoBubble, tabela, semTenant) {
  if (resolvedores.has(tabela)) return resolvedores.get(tabela)
  const [b, a] = await Promise.all([bubble(tipoBubble), lerTudo(tabela, "id, bubble_id", semTenant)])
  const idsAqui = new Set(a.map((l) => l.id))
  const porBubble = new Map(a.filter((l) => l.bubble_id).map((l) => [l.bubble_id, l.id]))
  const supaDe = new Map(b.map((r) => [r._id, r.Supabase_id]))
  const f = (idBubble) => {
    if (!idBubble) return null
    const s = supaDe.get(idBubble)
    if (s && idsAqui.has(s)) return s
    return porBubble.get(idBubble) ?? null
  }
  f.aprender = (idBubble, id) => porBubble.set(idBubble, id)
  resolvedores.set(tabela, f)
  return f
}

// ── conversores ────────────────────────────────────────────────────────────

const texto = (v) => (typeof v === "string" ? (v.trim() ? v.trim() : null) : typeof v === "number" ? String(v) : null)
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null)
const bool = (v) => (v === true ? true : v === false ? false : null)
/**
 * Data do Bubble → dia, pela parte UTC — a MESMA convenção da migração de
 * junho (as datas já em uso seguem ela). Meia-noite de SP (T03:00Z) dá o
 * mesmo dia nos dois critérios; o "fim do dia" do Bubble (T02:59Z) cai no dia
 * seguinte, como já está nas ordens antigas.
 */
const dia = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)
const instante = (v) => (typeof v === "string" && v ? new Date(v).toISOString() : null)
const lista = (v) => (Array.isArray(v) && v.length ? JSON.stringify(v) : null)
const ehUrlDoBubble = (v) => typeof v === "string" && /^(https?:)?\/\//.test(v)

// ── partes ─────────────────────────────────────────────────────────────────
// mapa(b, R) devolve as colunas a partir do registro do Bubble; R são os
// resolvedores de referência. `arquivos`: colunas cujo valor no bucket não
// pode voltar a ser URL. `protegidos(linhasAqui)`: ids daqui que já tiveram
// atividade no sistema novo — só recebem colunas VAZIAS.

const editadoAqui = (l) => l.updated_at && l.created_at && new Date(l.updated_at) - new Date(l.created_at) > 120_000

// A 1ª aplicação (30/09, 21h30 BRT) já trocou pelo Bubble o que estava
// livre. Ela própria mexeu em updated_at, então a proteção por data deixa de
// distinguir "editado aqui" de "atualizado pela migração". Nas rodadas
// seguintes, por padrão, só ORDENS recebem troca (a proteção delas vem da
// trilha, que a migração não toca); as demais partes só PREENCHEM vazios.
// `--bubble-manda` volta a trocar em todas (só com o sistema novo intocado).
const BUBBLE_MANDA_EM_TUDO = args.includes("--bubble-manda")
const SO_PREENCHE = new Set(["empresas", "projetos", "centros", "bancarios", "contratos", "compras", "propostas", "remessas", "contracheques", "remessas_ponto", "ponto"])

const PARTES = [
  {
    nome: "empresas",
    tipo: "empresa",
    tabela: "empresa",
    // Lê sem filtro de tenant: 160 fornecedores do NF ficaram com
    // emp_proprietaria_id vazio numa sincronização antiga (sumiam das listas).
    semTenant: true,
    protegidos: async (aqui) => new Set(aqui.filter(editadoAqui).map((l) => l.id)),
    mapa: (b) => ({
      nome_fantasia: texto(b["Nome fantasia_Nome completo"]),
      nome_razao: texto(b["Nome razão"]),
      cnpj_cpf: texto(b.CNPJ_CPF),
      pessoa_juridica: bool(b["É Pessoa jurídica?"]),
      inativa: bool(b["Inativa?"]),
      conveniador: bool(b["É conveniador?"]),
      fundo_pensao: bool(b["É fundo de pensão?"]),
      beneficiario_ajuda: bool(b["É beneficiário de ajuda?"]),
      trabalhadores_rep_nf: bool(b["Trabalhadores representados pelo NF?"]),
      emp_proprietaria_id: TENANT,
    }),
  },
  {
    nome: "projetos",
    tipo: "projeto",
    tabela: "projeto",
    protegidos: async (aqui) => new Set(aqui.filter(editadoAqui).map((l) => l.id)),
    preparar: async (R) => {
      R.usuario = await ref("user", "usuarios")
      R.centro = await ref("financeiro-centrosdecusto", "centros_de_custo")
    },
    mapa: (b, R) => ({
      descricao_sumaria: texto(b["Descrição sumária"]),
      descricao: texto(b["Descrição"]),
      detalhamento: texto(b.Detalhamento),
      tipo: texto(b.Tipo),
      orcamento: num(b["Orçamento"]),
      inicio: dia(b["Início"]),
      termino_previsao: dia(b["Término (previsão)"]),
      estrategico: bool(b["Estratégico?"]),
      finalizado: bool(b["Finalizado?"]),
      autorizacao_autorizado: bool(b["Autorização - Autorizado?"]),
      autorizacao_quando: instante(b["Autorização - Quando"]),
      autorizacao_autoriza_id: R.usuario(b["Autorização - AUTORIZADOR"]),
      centro_custo_id: R.centro(b["Centro de custo"]),
      departamentos_assoc_raw: lista(b["DEPARTAMENTOS ASSOCIADOS"]),
    }),
  },
  {
    nome: "centros",
    tipo: "financeiro-centrosdecusto",
    tabela: "centros_de_custo",
    protegidos: async (aqui) => new Set(aqui.filter(editadoAqui).map((l) => l.id)),
    preparar: async (R) => {
      R.departamento = await ref("empresa-departamentos", "empresa_departamentos")
    },
    mapa: (b, R) => ({
      acesso: texto(b.Acesso),
      classificador: texto(b.Classificador),
      nome_da_conta: texto(b["Nome da conta"]),
      tipo_da_conta: texto(b["Tipo da conta"]),
      usavel: bool(b["Usável?"]),
      indicacoes: texto(b["Indicações"]),
      contraindicacoes: texto(b["Contraindicações"]),
      departamento_id: R.departamento(b.DEPARTAMENTO),
    }),
  },
  {
    nome: "bancarios",
    tipo: "dadosbancários",
    tabela: "dados_bancarios",
    semTenant: true,
    // Sem updated_at: dado bancário existente só recebe o que está vazio.
    protegidos: async (aqui) => new Set(aqui.map((l) => l.id)),
    preparar: async (R) => {
      R.empresa = await ref("empresa", "empresa", true)
      R.usuario = await ref("user", "usuarios")
      R.filiado = await ref("filiação", "filiacoes")
    },
    // Só o que tem dono resolvido aqui (dado solto não serve a ninguém).
    filtrar: (b, R) => Boolean(R.empresa(b.EMPRESA) || R.usuario(b["USUÁRIO"]) || R.filiado(b.FILIADO)),
    mapa: (b, R) => ({
      fornecedor_id: R.empresa(b.EMPRESA),
      usuario_id: R.usuario(b["USUÁRIO"]),
      filiado_id: R.filiado(b.FILIADO),
      banco: texto(b.Banco),
      banco_codigo: texto(b["Banco código"]),
      agencia: texto(b["Agência"]),
      conta: texto(b.Conta),
      tipo_conta: b["Conta corrente?"] === true ? "corrente" : b["Conta corrente?"] === false ? "poupanca" : null,
      pix: texto(b["Pix chave"]),
      pix_tipo: texto(b["Pix tipo"]),
      pix_beneficiario: texto(b["Pix beneficiário nome"]),
      favorecido: texto(b["Beneficiário CNPJ - CPF"]),
      prefere_pix: bool(b["Prefere pix?"]),
      favorito: bool(b["É favorito?"]),
      tipo_dados: texto(b["Tipo dos dados bancários"]),
    }),
  },
  {
    nome: "contratos",
    tipo: "contratos",
    tabela: "contratos",
    arquivos: ["arquivo_contrato"],
    protegidos: async (aqui) => new Set(aqui.filter(editadoAqui).map((l) => l.id)),
    preparar: async (R) => {
      R.usuario = await ref("user", "usuarios")
      R.empresa = await ref("empresa", "empresa", true)
      R.centro = await ref("financeiro-centrosdecusto", "centros_de_custo")
      R.departamento = await ref("empresa-departamentos", "empresa_departamentos")
    },
    mapa: (b, R) => ({
      codigo: texto(b["Código do contrato"]),
      objeto: texto(b.Objeto),
      vigencia_inicio: dia(b["Vigência Início"]),
      vigencia_termino: dia(b["Vigência Término"]),
      ativo: bool(b["Está ativo?"]),
      deletado: bool(b["Deletado?"]),
      aditivo: bool(b["É um aditivo?"]),
      sob_demanda: bool(b["É sob demanda?"]),
      apoio_institucional: bool(b["Apoio institucional"]),
      arquivo_contrato: texto(b["Arquivo do contrato"]),
      autorizacao_autorizador_id: R.usuario(b["Autorização - Autorizador"]),
      autorizacao_data: dia(b["Autorização - Data da autorização"]),
      autorizacao_esta_autorizado: bool(b["Autorização - Está autorizado?"]),
      responsavel_id: R.usuario(b["RESPONSÁVEL"]),
      fornecedor_id: R.empresa(b.FORNECEDOR),
      centro_custo_id: R.centro(b["CENTRO DE CUSTO"]),
      departamento_id: R.departamento(b.DEPARTAMENTO),
    }),
    // O principal de um aditivo pode ser inserido na mesma rodada: 2ª passada.
    depois: async (R, aplicar) => {
      const contrato = await ref("contratos", "contratos")
      const b = await bubble("contratos")
      let n = 0
      for (const c of b.filter((x) => x["CONTRATO PRINCIPAL"])) {
        const id = contrato(c._id)
        const principal = contrato(c["CONTRATO PRINCIPAL"])
        if (!id || !principal) continue
        n++
        if (aplicar) await db.from("contratos").update({ contrato_principal_id: principal }).eq("id", id).is("contrato_principal_id", null)
      }
      console.log(`  aditivos ligados ao principal (se vazio): ${n}`)
    },
  },
  {
    nome: "compras",
    tipo: "aquisição-compras",
    tabela: "compras_solicitacoes",
    arquivos: ["comprovante_url", "proposta_comercial_url"],
    protegidos: async (aqui) => new Set(aqui.filter(editadoAqui).map((l) => l.id)),
    preparar: async (R) => {
      R.usuario = await ref("user", "usuarios")
      R.empresa = await ref("empresa", "empresa", true)
      R.centro = await ref("financeiro-centrosdecusto", "centros_de_custo")
      R.departamento = await ref("empresa-departamentos", "empresa_departamentos")
      R.projeto = await ref("projeto", "projeto")
    },
    mapa: (b, R) => ({
      codigo: texto(b["00 Código"]),
      cancelado: bool(b["00 Cancelado"]),
      cancelado_quando: instante(b["00 Cancelado Quando"]),
      cancelado_por_id: R.usuario(b["00 Cancelado Cancelador"]),
      solicitante_id: R.usuario(b["Created By"]),
      solicitacao_produto: texto(b["01.1 Solicitação Produto ou serviço"]),
      solicitacao_observacao: texto(b["01.1 Solicitação Observações"]),
      solicitacao_e_produto: bool(b["01.1 Solicitação É produto físico"]),
      solicitacao_e_via_contrato: bool(b["01.1 Solicitação É via Compras?"]),
      solicitacao_centro_custo_id: R.centro(b["01.1 Solicitação CENTRO DE CUSTO"]),
      solicitacao_departamento_id: R.departamento(b["01.1 Solicitação DEPARTAMENTO"]),
      solicitacao_projeto_id: R.projeto(b["01.1 Solicitação PROJETO"]),
      solicitacao_local: texto(b["01.2 Solicitação Local de entrega"]),
      solicitacao_data_limite: dia(b["01.2 Solicitação Data limite para receber"]),
      em_cotacao: bool(b["Em cotação?"]),
      estocavel: bool(b["Estocável?"]),
      recebido: bool(b["Recebido?"]),
      justificativa: texto(b.Justificativa),
      descricao_objetivo: texto(b["Descrição objetivo"]),
      link_referencia: texto(b["Link de referência"]),
      quantidade: num(b.Quantidade),
      proposta_comercial_url: texto(b["Proposta comercial"]),
      cotacao_inicio: instante(b["02 Cotação Início da cotação"]),
      cotacao_termino: instante(b["02 Cotação Término da cotação"]),
      cotacao_responsavel_id: R.usuario(b["02 Cotação RESPONSÁVEL"]),
      cotacao_propostas_raw: lista(b["02 Cotação PROPOSTAS"]),
      avaliacao_aprovada: bool(b["03 Avaliação Aprovada?"]),
      avaliacao_avaliador_id: R.usuario(b["03 Avaliação AVALIADOR"]),
      avaliacao_data: instante(b["03 Avaliação Data da avaliação"]),
      avaliacao_observacao: texto(b["03 Avaliação Observação"]),
      comprado: bool(b["04 Compra Comprado?"]),
      comprado_por_id: R.usuario(b["04 Compra COMPRADOR"]),
      comprovante_url: texto(b["04 Compra Comprovante NF ou recibo"]),
      compra_data: dia(b["04 Compra Data da compra"]),
      compra_fornecedor_id: R.empresa(b["04 Compra FORNECEDOR"]),
      compra_valor: num(b["04 Compra Valor"]),
      pagamento_data: instante(b["05 Pagamento Data do envio"]),
      pagamento_enviado_por_id: R.usuario(b["05 Pagamento ENVIADOR"]),
      pagamento_ordens_raw: lista(b["05 Pagamento ORDENS DE PGTO"]),
      recebimento_data: dia(b["06 Recebimento Data"]),
      recebimento_de_acordo: bool(b["06 Recebimento De acordo?"]),
      recebimento_observacao: texto(b["06 Recebimento Observações"]),
      recebimento_recebido_por_id: R.usuario(b["06 Recebimento RECEBEDOR"]),
    }),
  },
  {
    nome: "propostas",
    tipo: "aquisição-compras-propostas",
    tabela: "compras_propostas",
    arquivos: ["proposta_arquivo_url"],
    protegidos: async (aqui) => new Set(aqui.filter(editadoAqui).map((l) => l.id)),
    preparar: async (R) => {
      R.empresa = await ref("empresa", "empresa", true)
      R.compra = await ref("aquisição-compras", "compras_solicitacoes")
      const compras = await bubble("aquisição-compras")
      R.escolhidas = new Set(compras.flatMap((c) => c["02 Cotação PROPOSTAS ESCOLHIDAS"] ?? []))
    },
    mapa: (b, R) => ({
      processo_compra_id: R.compra(b["PROCESSO DE COMPRAS"]),
      fornecedor_id: R.empresa(b.FORNECEDOR),
      forma_pagamento: texto(b["FORMA DE PAGAMENTO"]),
      previsao_entrega: dia(b["Previsão de entrega"]),
      proposta_arquivo_url: texto(b["Proposta (arquivo)"]),
      valor_proposta: num(b["Valor da proposta"]),
      escolhida: R.escolhidas.has(b._id),
    }),
  },
  {
    nome: "ordens",
    tipo: "financeiro-ordempgto",
    tabela: "ordens_pagamento",
    arquivos: ["arquivo_nota_fiscal", "arquivo_boleto", "arquivo_orcamento", "arquivo_pagamento"],
    // Ordem que já passou pelo rito novo (trilha além da criação) ou tem
    // estorno: o que se fez aqui manda.
    protegidos: async () => {
      const ev = await lerTudo("ordens_pagamento_eventos", "id, ordem_id, tipo")
      const est = await lerTudo("ordens_pagamento_estornos", "id, ordem_id").catch(() => [])
      return new Set([
        ...ev.filter((e) => !["criada", "verificada", "autorizacao_dispensada"].includes(e.tipo)).map((e) => e.ordem_id),
        ...est.map((e) => e.ordem_id),
      ])
    },
    preparar: async (R) => {
      R.usuario = await ref("user", "usuarios")
      R.empresa = await ref("empresa", "empresa", true)
      R.centro = await ref("financeiro-centrosdecusto", "centros_de_custo")
      R.departamento = await ref("empresa-departamentos", "empresa_departamentos")
      R.projeto = await ref("projeto", "projeto")
      R.compra = await ref("aquisição-compras", "compras_solicitacoes")
      R.contrato = await ref("contratos", "contratos")
      R.aluguel = await ref("veículoscontratosdealuguel", "veiculo_contratos_aluguel", true)
      R.bancario = await ref("dadosbancários", "dados_bancarios", true)
    },
    mapa: (b, R) => ({
      codigo: texto(b["Código"]),
      descricao: texto(b["Descrição"]),
      tipo: texto(b.Tipo),
      situacao: texto(b["Situação"]),
      excluido: bool(b["Excluído?"]),
      forma_pagamento: texto(b["FORMA DE PAGAMENTO"]),
      pix_codigo: texto(b["Pix código"]),
      valor_inicial_cobranca: num(b["Valor inicial da cobrança"]),
      valor_pago: num(b["Valor pago"]),
      vencimento: dia(b.Vencimento),
      data_pagamento: dia(b["Data de pagamento"]),
      reembolso_pagamento: bool(b["Reembolso de pagamento"]),
      arquivo_nota_fiscal: texto(b["Arquivo da nota fiscal"]),
      arquivo_boleto: texto(b["Arquivo do boleto"]),
      arquivo_orcamento: texto(b["Arquivo de orçamento"]),
      arquivo_pagamento: texto(b["Arquivo de pagamento"]),
      autorizacao_esta_autorizado: bool(b["Autorização - Está autorizado?"]),
      autorizacao_data: dia(b["Autorização - Data"]),
      autorizacao_observacao: texto(b["Autorização - Observações"]),
      autorizacao_autorizador_id: R.usuario(b["Autorização - Autorizador"]),
      pagador_id: R.usuario(b.PAGADOR),
      beneficiario_fornecedor_id: R.empresa(b["BENEFICIÁRIO (FORNECEDOR)"]),
      beneficiario_usuario_id: R.usuario(b["BENEFICIÁRIO (USER)"]),
      departamento_id: R.departamento(b.DEPARTAMENTO),
      centro_custo_despesa_id: R.centro(b["CENTRO DE CUSTO DESPESA"]),
      centro_custo_receita_id: R.centro(b["CENTRO DE CUSTO RECEITA"]),
      processo_compra_id: R.compra(b.COMPRAS),
      contrato_id: R.contrato(b.CONTRATO),
      contrato_aluguel_id: R.aluguel(b["LOCAÇÃO DE VEÍCULOS"]),
      projeto_id: R.projeto(b.PROJETO),
      dados_bancarios_id: R.bancario(b["DADOS BANCÁRIOS ESCOLHIDO"]),
    }),
  },
  {
    nome: "remessas",
    tipo: "pessoal-contracheques-remessas",
    tabela: "pessoal_contracheques_remessas",
    protegidos: async (aqui) => new Set(aqui.filter(editadoAqui).map((l) => l.id)),
    mapa: (b) => ({
      nome_remessa: texto(b["Nome da remessa"]),
      ordem: num(b.Ordem),
      finalizada: bool(b["Finalizada?"]),
      adiantamento: bool(b["Adiantamento?"]),
      complementar_mensal: bool(b["Complementar (mensal)?"]),
      ferias: bool(b["Férias?"]),
      decimo_terceiro: bool(b["13º?"]),
    }),
  },
  {
    nome: "contracheques",
    tipo: "pessoal-contracheques",
    tabela: "pessoal_contracheques",
    semTenant: true,
    arquivos: ["arquivo"],
    // Contracheque que já gerou ordem de pagamento aqui não é tocado.
    protegidos: async (aqui) => new Set(aqui.filter((l) => l.ordem_pagamento_id).map((l) => l.id)),
    preparar: async (R) => {
      R.usuario = await ref("user", "usuarios")
      R.remessa = await ref("pessoal-contracheques-remessas", "pessoal_contracheques_remessas")
    },
    // Funcionário e remessa precisam existir aqui (a tela lê por eles).
    filtrar: (b, R) => Boolean(R.usuario(b["FUNCIONÁRIO"]) && R.remessa(b.REMESSA)),
    mapa: (b, R) => ({
      funcionario_id: R.usuario(b["FUNCIONÁRIO"]),
      remessa_id: R.remessa(b.REMESSA),
      arquivo: texto(b["Contracheque arquivo"]),
      liberado: bool(b["Liberado?"]),
      ordem: num(b.Ordem),
    }),
  },
  {
    nome: "remessas_ponto",
    tipo: "pessoal-registrodeponto-remessas",
    tabela: "pessoal_registro_ponto_remessas",
    // Lê sem filtro de tenant: as 27 da migração de junho vieram com
    // emp_proprietaria_id vazio e sumiam do Controle de Ponto (02/10).
    semTenant: true,
    mapa: (b) => ({
      nome_remessa: texto(b["Nome da remessa"]),
      ordem: num(b.Ordem),
      finalizada: bool(b["Finalizada?"]),
      mes_referencia: texto(b["Mês de referência"]),
      mes_referencia_os: texto(b["Mês de referência OS"]),
      ano_referencia_os: texto(b["Ano de referência OS"]),
      emp_proprietaria_id: TENANT,
    }),
  },
  {
    nome: "ponto",
    tipo: "pessoal-registrodeponto",
    tabela: "pessoal_registro_ponto",
    semTenant: true,
    arquivos: ["arquivo"],
    preparar: async (R) => {
      R.usuario = await ref("user", "usuarios")
      R.remessaPonto = await ref("pessoal-registrodeponto-remessas", "pessoal_registro_ponto_remessas", true)
    },
    filtrar: (b, R) => Boolean(R.usuario(b["FUNCIONÁRIO"]) && R.remessaPonto(b.REMESSA)),
    mapa: (b, R) => ({
      funcionario_id: R.usuario(b["FUNCIONÁRIO"]),
      remessa_id: R.remessaPonto(b.REMESSA),
      arquivo: texto(b["Registro de ponto arquivo"]),
      liberado: bool(b["Liberado?"]),
      ordem: num(b.Ordem),
      horas_realizadas_70: num(b["Horas realizadas 70%"]),
      horas_pagas_70: num(b["Horas pagas 70%"]),
      saldo_remanescente_70: num(b["Saldo remanescente 70%"]),
      saldo_remessa_anterior_70: num(b["Saldo remessa anterior 70%"]),
      horas_realizadas_100: num(b["Horas realizadas 100%"]),
      horas_pagas_100: num(b["Horas pagas 100%"]),
      saldo_remanescente_100: num(b["Saldo remanescente 100%"]),
      saldo_remessa_anterior_100: num(b["Saldo remessa anterior 100%"]),
    }),
  },
]

// ── motor ──────────────────────────────────────────────────────────────────

const vazio = (v) => v === null || v === undefined || v === "" || v === "null"
/** Compara o que importa: datas pelo dia/instante, números pelo valor. */
function igual(a, b) {
  if (vazio(a) && vazio(b)) return true
  if (vazio(a) || vazio(b)) return false
  if (typeof b === "number") return Number(a) === b
  if (typeof b === "boolean") return a === b
  if (/^\d{4}-\d{2}-\d{2}T/.test(String(b)) && /^\d{4}-\d{2}-\d{2}/.test(String(a))) {
    return new Date(a).getTime() === new Date(b).getTime()
  }
  return String(a).trim() === String(b).trim()
}

async function emLotes(itens, tamanho, f) {
  for (let i = 0; i < itens.length; i += tamanho) await f(itens.slice(i, i + tamanho))
}

async function paralelo(itens, n, f) {
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < itens.length) await f(itens[i++]) }))
}

const resumo = []

for (const parte of PARTES) {
  if (SO && !SO.includes(parte.nome)) continue
  console.log(`\n${"═".repeat(70)}\n${parte.nome}: ${parte.tipo} → ${parte.tabela}`)
  const R = {}
  if (parte.preparar) await parte.preparar(R)
  const doBubble = await bubble(parte.tipo)
  const aqui = await lerTudo(parte.tabela, "*", parte.semTenant)
  const porId = new Map(aqui.map((l) => [l.id, l]))
  const porBubble = new Map(aqui.filter((l) => l.bubble_id).map((l) => [l.bubble_id, l]))
  const protegidos = parte.protegidos ? await parte.protegidos(aqui) : new Set()
  const resolver = await ref(parte.tipo, parte.tabela, parte.semTenant)

  const inserir = []
  const atualizar = []
  const porColuna = new Map()
  let pulados = 0
  let protegidosTocados = 0
  for (const b of doBubble) {
    const local = (b.Supabase_id && porId.get(b.Supabase_id)) || porBubble.get(b._id)
    if (parte.filtrar && !parte.filtrar(b, R)) { if (!local) pulados++; continue }
    const novo = parte.mapa(b, R)
    if (!local) {
      const linha = Object.fromEntries(Object.entries(novo).filter(([, v]) => !vazio(v)))
      linha.bubble_id = b._id
      if (!parte.semTenant) linha.emp_proprietaria_id = TENANT
      if (b["Created Date"]) linha.created_at = b["Created Date"]
      inserir.push(linha)
      continue
    }
    const protegido = protegidos.has(local.id) || (!BUBBLE_MANDA_EM_TUDO && SO_PREENCHE.has(parte.nome))
    const mudancas = {}
    for (const [col, valor] of Object.entries(novo)) {
      if (vazio(valor) || !(col in local) || igual(local[col], valor)) continue
      // Arquivo já trazido para o bucket (caminho, não URL) fica.
      if (parte.arquivos?.includes(col) && !vazio(local[col]) && !ehUrlDoBubble(local[col])) continue
      const preencher = vazio(local[col]) || (typeof valor === "boolean" && local[col] === false && valor === true && !protegido)
      if (!preencher && protegido) continue
      mudancas[col] = valor
      const c = porColuna.get(col) ?? { preenche: 0, troca: 0 }
      if (vazio(local[col])) c.preenche++
      else c.troca++
      porColuna.set(col, c)
    }
    if (!local.bubble_id) mudancas.bubble_id = b._id
    if (Object.keys(mudancas).length) {
      if (protegido) protegidosTocados++
      atualizar.push({ id: local.id, mudancas })
    }
  }

  console.log(`  Bubble ${doBubble.length} · aqui ${aqui.length} · protegidos ${protegidos.size}`)
  console.log(`  INSERIR ${inserir.length}${pulados ? ` · pulados ${pulados} (sem dono/funcionário/remessa aqui)` : ""}`)
  console.log(`  ATUALIZAR ${atualizar.length} registro(s)${protegidosTocados ? ` (${protegidosTocados} protegidos: só colunas vazias)` : ""}`)
  for (const [col, c] of [...porColuna].sort((a, b) => b[1].preenche + b[1].troca - (a[1].preenche + a[1].troca))) {
    console.log(`    ${col.padEnd(32)} preenche ${String(c.preenche).padStart(6)} · troca ${String(c.troca).padStart(6)}`)
  }
  resumo.push({ parte: parte.nome, inserir: inserir.length, atualizar: atualizar.length })

  if (APLICAR) {
    let ok = 0
    // Lote com linhas de colunas diferentes faz o PostgREST mandar NULL nas
    // que faltam (e não o default da coluna): agrupa por conjunto de colunas.
    const grupos = new Map()
    for (const l of inserir) {
      const chave = Object.keys(l).sort().join(",")
      if (!grupos.has(chave)) grupos.set(chave, [])
      grupos.get(chave).push(l)
    }
    for (const grupo of grupos.values()) {
      await emLotes(grupo, 200, async (lote) => {
        const { data, error } = await comRetry(() => db.from(parte.tabela).insert(lote).select("id, bubble_id"), parte.tabela)
        if (error) throw new Error(`${parte.tabela} (inserção): ${error.message}`)
        for (const d of data) resolver.aprender(d.bubble_id, d.id)
        ok += data.length
      })
    }
    let atualizados = 0
    await paralelo(atualizar, 8, async (u) => {
      const { error } = await comRetry(() => db.from(parte.tabela).update(u.mudancas).eq("id", u.id), parte.tabela)
      if (error) throw new Error(`${parte.tabela} (atualização ${u.id}): ${error.message}`)
      atualizados++
    })
    console.log(`  ✓ inseridos ${ok} · atualizados ${atualizados}`)
  }
  if (parte.depois) await parte.depois(R, APLICAR)
}

// ── religar: vínculos que moram do outro lado ──────────────────────────────

if (!SO || SO.includes("religar")) {
  console.log(`\n${"═".repeat(70)}\nreligar`)
  const ordem = await ref("financeiro-ordempgto", "ordens_pagamento")
  const ordens = await bubble("financeiro-ordempgto")
  const reembolso = await ref("filiaçãoreembolso", "filiacao_reembolsos")
  const infracao = await ref("veículosinfrações", "veiculos_infracoes", true)
  const ligar = async (tabela, idAlvo, idOrdem) => {
    if (!APLICAR) return 1
    const { data } = await db.from(tabela).update({ ordem_pagamento_id: idOrdem }).eq("id", idAlvo).is("ordem_pagamento_id", null).select("id")
    return (data ?? []).length
  }
  let reemb = 0, infr = 0
  for (const o of ordens) {
    const idOrdem = ordem(o._id)
    if (!idOrdem) continue
    if (o["REEMBOLSO FILIADO"] && reembolso(o["REEMBOLSO FILIADO"])) reemb += await ligar("filiacao_reembolsos", reembolso(o["REEMBOLSO FILIADO"]), idOrdem)
    if (o["INFRAÇÃO DE TRÂNSITO"] && infracao(o["INFRAÇÃO DE TRÂNSITO"])) infr += await ligar("veiculos_infracoes", infracao(o["INFRAÇÃO DE TRÂNSITO"]), idOrdem)
  }
  console.log(`  reembolsos de filiado ${APLICAR ? "ligados" : "a conferir"}: ${reemb} · infrações: ${infr}`)

  // Proposta escolhida de cada compra (só onde está vazio).
  const compra = await ref("aquisição-compras", "compras_solicitacoes")
  const proposta = await ref("aquisição-compras-propostas", "compras_propostas")
  let escolhidas = 0
  for (const c of await bubble("aquisição-compras")) {
    const idCompra = compra(c._id)
    const p = (c["02 Cotação PROPOSTAS ESCOLHIDAS"] ?? []).map(proposta).find(Boolean)
    if (!idCompra || !p) continue
    if (APLICAR) {
      const { data } = await db.from("compras_solicitacoes").update({ cotacao_proposta_id: p }).eq("id", idCompra).is("cotacao_proposta_id", null).select("id")
      escolhidas += (data ?? []).length
    } else escolhidas++
  }
  console.log(`  compras com proposta escolhida ${APLICAR ? "ligadas" : "a conferir"}: ${escolhidas}`)
}

console.log(`\n${APLICAR ? "APLICADO" : "DRY-RUN"}: ${resumo.map((r) => `${r.parte} +${r.inserir}/~${r.atualizar}`).join(" · ")}`)

