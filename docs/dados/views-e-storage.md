<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Views e Storage

## Views

### fato_arrecadacao_mensal (materializada)

_Sem descrição._

```sql
SELECT r.emp_proprietaria_id,
    make_date(r.ordem / 100, r.ordem % 100, 1) AS mes,
    COALESCE(r.tipo, 'Associativa'::text) AS tipo,
    COALESCE(l.fonte_pg_id, r.emp_contratante_id) AS fonte_id,
    COALESCE(l.fonte_pg_id, r.emp_contratante_id, '00000000-0000-0000-0000-000000000000'::uuid) AS fonte_chave,
    sum(COALESCE(l.valor, 0::numeric))::numeric(14,2) AS valor,
    count(*)::integer AS lancamentos,
    count(DISTINCT COALESCE(l.filiado_id::text, l.cpf))::integer AS pagantes
   FROM filiacao_recebe_remessa r
     JOIN filiacao_recebe l ON l.remessa_id = r.id
  WHERE r.ordem IS NOT NULL AND r.ordem >= 200001 AND r.ordem <= 210012 AND (r.ordem % 100) >= 1 AND (r.ordem % 100) <= 12
  GROUP BY r.emp_proprietaria_id, (make_date(r.ordem / 100, r.ordem % 100, 1)), (COALESCE(r.tipo, 'Associativa'::text)), (COALESCE(l.fonte_pg_id, r.emp_contratante_id)), (COALESCE(l.fonte_pg_id, r.emp_contratante_id, '00000000-0000-0000-0000-000000000000'::uuid));
```

### fato_despesa_mensal (materializada)

_Sem descrição._

```sql
WITH pagas AS (
         SELECT o.id,
            o.bubble_id,
            o.codigo,
            o.descricao,
            o.valor,
            o.data_emissao,
            o.data_pagamento,
            o.pago,
            o.fornecedor_id,
            o.emp_proprietaria_id,
            o.created_at,
            o.arquivo_nota_fiscal,
            o.arquivo_orcamento,
            o.arquivo_pagamento,
            o.arquivo_boleto,
            o.autorizacao_data,
            o.autorizacao_esta_autorizado,
            o.autorizacao_observacao,
            o.centro_custo_despesa,
            o.centro_custo_receita,
            o.excluido,
            o.forma_pagamento,
            o.pix_codigo,
            o.reembolso_pagamento,
            o.situacao,
            o.tipo,
            o.valor_inicial_cobranca,
            o.valor_pago,
            o.vencimento,
            o.slug,
            o.beneficiario_fornecedor_id,
            o.beneficiario_usuario_id,
            o.autorizacao_autorizador_id,
            o.pagador_id,
            o.departamento_id,
            o.centro_custo_despesa_id,
            o.centro_custo_receita_id,
            o.processo_compra_id,
            o.contrato_id,
            o.contrato_aluguel_id,
            o.custeio_id,
            o.beneficiario_nome_avulso,
            o.beneficiario_doc_avulso,
            o.projeto_id,
            o.cartao_id,
            o.caixa_conta_id,
            o.dados_bancarios_id,
            o.forma_detalhe,
            o.autorizacao_dispensada,
            o.autorizacao_dispensa_motivo,
            o.cancelamento_motivo,
            o.cancelado_em,
            o.cancelado_por_id,
            COALESCE(o.valor_pago, o.valor_inicial_cobranca, o.valor, 0::numeric) AS valor_efetivo
           FROM ordens_pagamento o
          WHERE o.situacao = 'Paga'::text AND o.excluido IS NOT TRUE AND o.data_pagamento IS NOT NULL
        ), linhas AS (
         SELECT p.emp_proprietaria_id,
            p.data_pagamento,
            p.tipo,
            r.centro_custo_despesa_id,
            r.departamento_id,
            r.valor,
            p.id AS ordem_id
           FROM pagas p
             JOIN ordens_pagamento_rateio r ON r.ordem_id = p.id
        UNION ALL
         SELECT p.emp_proprietaria_id,
            p.data_pagamento,
            p.tipo,
            p.centro_custo_despesa_id,
            p.departamento_id,
            p.valor_efetivo,
            p.id
           FROM pagas p
          WHERE NOT (EXISTS ( SELECT 1
                   FROM ordens_pagamento_rateio r
                  WHERE r.ordem_id = p.id))
        )
 SELECT emp_proprietaria_id,
    date_trunc('month'::text, data_pagamento::timestamp with time zone)::date AS mes,
    COALESCE(tipo, '(sem tipo)'::text) AS tipo,
    centro_custo_despesa_id,
    departamento_id,
    COALESCE(centro_custo_despesa_id, '00000000-0000-0000-0000-000000000000'::uuid) AS centro_chave,
    COALESCE(departamento_id, '00000000-0000-0000-0000-000000000000'::uuid) AS departamento_chave,
    sum(valor)::numeric(14,2) AS valor,
    count(DISTINCT ordem_id)::integer AS ordens
   FROM linhas
  GROUP BY emp_proprietaria_id, (date_trunc('month'::text, data_pagamento::timestamp with time zone)::date), (COALESCE(tipo, '(sem tipo)'::text)), centro_custo_despesa_id, departamento_id, (COALESCE(centro_custo_despesa_id, '00000000-0000-0000-0000-000000000000'::uuid)), (COALESCE(departamento_id, '00000000-0000-0000-0000-000000000000'::uuid));
```

### fato_filiacao_mensal (materializada)

_Sem descrição._

```sql
WITH pessoas AS (
         SELECT f.emp_proprietaria_id,
            f.id,
            f.filiacao_condicao = 'Ativo'::text AS ativo_hoje,
            COALESCE(f.ativo_em::date, v.primeira_filiacao) AS entrada_real,
                CASE
                    WHEN f.filiacao_condicao = 'Ativo'::text THEN NULL::date
                    ELSE COALESCE(f.inativo_em::date, v.ultima_desfiliacao)
                END AS saida_real,
            COALESCE(f.ativo_em::date, v.primeira_filiacao, f.condicao_desde::date, f.created_at::date) AS entrada_conta,
                CASE
                    WHEN f.filiacao_condicao = 'Ativo'::text THEN NULL::date
                    ELSE COALESCE(f.inativo_em::date, v.ultima_desfiliacao, f.condicao_desde::date, COALESCE(f.ativo_em::date, v.primeira_filiacao, f.condicao_desde::date, f.created_at::date))
                END AS saida_conta
           FROM filiacoes f
             LEFT JOIN LATERAL ( SELECT min(COALESCE(x.data_filiacao, x.filiacao_data_adesao)) AS primeira_filiacao,
                    max(COALESCE(x.data_desfiliacao, x.filiacao_data_saida)) AS ultima_desfiliacao
                   FROM filiacao_vinculos x
                  WHERE x.filiado_id = f.id) v ON true
          WHERE f.filiacao_excluida IS NOT TRUE AND f.mesclado_em IS NULL AND f.anonimizada_em IS NULL
        ), meses AS (
         SELECT DISTINCT pessoas.emp_proprietaria_id,
            m_1.m::date AS mes
           FROM pessoas,
            generate_series(date_trunc('month'::text, now()) - '4 years 11 mons'::interval, date_trunc('month'::text, now()), '1 mon'::interval) m_1(m)
        )
 SELECT emp_proprietaria_id,
    mes,
    (( SELECT count(*) AS count
           FROM pessoas p
          WHERE p.emp_proprietaria_id = m.emp_proprietaria_id AND p.entrada_real >= m.mes AND p.entrada_real < (m.mes + '1 mon'::interval)))::integer AS entradas,
    (( SELECT count(*) AS count
           FROM pessoas p
          WHERE p.emp_proprietaria_id = m.emp_proprietaria_id AND p.saida_real >= m.mes AND p.saida_real < (m.mes + '1 mon'::interval)))::integer AS saidas,
    (( SELECT count(*) AS count
           FROM pessoas p
          WHERE p.emp_proprietaria_id = m.emp_proprietaria_id AND p.entrada_conta IS NOT NULL AND p.entrada_conta < (m.mes + '1 mon'::interval) AND (p.saida_conta IS NULL OR p.saida_conta >= (m.mes + '1 mon'::interval))))::integer AS ativos_fim_mes
   FROM meses m;
```

### fato_frota_mensal (materializada)

_Sem descrição._

```sql
WITH meses AS (
         SELECT v_1.emp_proprietaria_id,
            v_1.id AS veiculo_id,
            m_1.m::date AS mes
           FROM veiculos v_1,
            generate_series(date_trunc('month'::text, now()) - '2 years 11 mons'::interval, date_trunc('month'::text, now()), '1 mon'::interval) m_1(m)
        ), abast AS (
         SELECT veiculos_abastecimentos.veiculo_id,
            date_trunc('month'::text, veiculos_abastecimentos.data_hora_abastecimento)::date AS mes,
            sum(COALESCE(veiculos_abastecimentos.valor_abastecimento, 0::numeric)) AS valor,
            sum(COALESCE(veiculos_abastecimentos.volume_abastecido, 0::numeric)) AS litros,
            max(veiculos_abastecimentos.hodometro) - min(veiculos_abastecimentos.hodometro) AS km,
            count(*) AS qtd
           FROM veiculos_abastecimentos
          WHERE veiculos_abastecimentos.veiculo_id IS NOT NULL AND veiculos_abastecimentos.data_hora_abastecimento IS NOT NULL
          GROUP BY veiculos_abastecimentos.veiculo_id, (date_trunc('month'::text, veiculos_abastecimentos.data_hora_abastecimento)::date)
        ), manut AS (
         SELECT veiculos_manutencoes.veiculo_id,
            date_trunc('month'::text, veiculos_manutencoes.realizada_em::timestamp with time zone)::date AS mes,
            sum(COALESCE(veiculos_manutencoes.valor, 0::numeric)) AS valor,
            count(*) AS qtd
           FROM veiculos_manutencoes
          WHERE veiculos_manutencoes.veiculo_id IS NOT NULL AND veiculos_manutencoes.realizada_em IS NOT NULL
          GROUP BY veiculos_manutencoes.veiculo_id, (date_trunc('month'::text, veiculos_manutencoes.realizada_em::timestamp with time zone)::date)
        ), multas AS (
         SELECT veiculos_infracoes.veiculo_id,
            date_trunc('month'::text, veiculos_infracoes.infracao_data::timestamp with time zone)::date AS mes,
            sum(COALESCE(veiculos_infracoes.infracao_custo, 0::numeric)) AS valor,
            count(*) AS qtd
           FROM veiculos_infracoes
          WHERE veiculos_infracoes.veiculo_id IS NOT NULL AND veiculos_infracoes.infracao_data IS NOT NULL
          GROUP BY veiculos_infracoes.veiculo_id, (date_trunc('month'::text, veiculos_infracoes.infracao_data::timestamp with time zone)::date)
        )
 SELECT m.emp_proprietaria_id,
    m.mes,
    m.veiculo_id,
    COALESCE(a.valor, 0::numeric)::numeric(14,2) AS abastecimento_valor,
    COALESCE(a.litros, 0::numeric)::numeric(14,2) AS abastecimento_litros,
    GREATEST(COALESCE(a.km, 0::numeric), 0::numeric)::integer AS km_rodados,
    COALESCE(a.qtd, 0::bigint)::integer AS abastecimentos,
    COALESCE(mn.valor, 0::numeric)::numeric(14,2) AS manutencao_valor,
    COALESCE(mn.qtd, 0::bigint)::integer AS manutencoes,
    COALESCE(mu.valor, 0::numeric)::numeric(14,2) AS multas_valor,
    COALESCE(mu.qtd, 0::bigint)::integer AS multas,
    COALESCE(( SELECT c.valor_mensal
           FROM veiculo_contratos_aluguel c
          WHERE c.id = v.contrato_aluguel_id AND (c.vigencia_inicio IS NULL OR c.vigencia_inicio < (m.mes + '1 mon'::interval)) AND (c.vigencia_termino IS NULL OR c.vigencia_termino >= m.mes)), 0::numeric)::numeric(14,2) AS aluguel_valor
   FROM meses m
     JOIN veiculos v ON v.id = m.veiculo_id
     LEFT JOIN abast a ON a.veiculo_id = m.veiculo_id AND a.mes = m.mes
     LEFT JOIN manut mn ON mn.veiculo_id = m.veiculo_id AND mn.mes = m.mes
     LEFT JOIN multas mu ON mu.veiculo_id = m.veiculo_id AND mu.mes = m.mes
  WHERE (COALESCE(a.qtd, 0::bigint) + COALESCE(mn.qtd, 0::bigint) + COALESCE(mu.qtd, 0::bigint)) > 0 OR v.contrato_aluguel_id IS NOT NULL;
```

### lgpd_retencoes_vencidas

Candidatos a descarte, para ANÁLISE humana. Registros com retencao_regime preenchido ficam de fora: seguem norma própria, mais longa que a NR-07.

```sql
SELECT id AS assistido_id,
    retencao_ate,
    retencao_regime,
    retencao_observacao,
    exposicao_cancerigeno_quimico,
    exposicao_radiacao_ionizante,
    CURRENT_DATE - retencao_ate AS dias_vencidos,
    ( SELECT count(*) AS count
           FROM saude_atendimentos t
          WHERE t.assistido_id = a.id) AS atendimentos
   FROM saude_assistidos a
  WHERE retencao_ate IS NOT NULL AND retencao_ate < CURRENT_DATE AND retencao_regime IS NULL
  ORDER BY retencao_ate;
```

### veiculos_ultima_movimentacao

_Sem descrição._

```sql
SELECT DISTINCT ON (veiculo_id) id,
    veiculo_id,
    emp_proprietaria_id,
    condutor_id,
    destino,
    motivo,
    data_retirada,
    retirada_em,
    sede_retirada,
    sede_retirada_os,
    hodometro_retirada,
    data_devolucao,
    devolucao_em,
    sede_devolucao,
    sede_devolucao_os,
    hodometro_devolucao,
    previsao_retorno,
    registrado_por_id,
    created_at
   FROM veiculos_disponibilidade
  WHERE veiculo_id IS NOT NULL
  ORDER BY veiculo_id, data_retirada DESC NULLS LAST, retirada_em DESC NULLS LAST, created_at DESC;
```

## Buckets do Storage

Arquivos (documentos pessoais, comprovantes, fotos) ficam aqui, fora das tabelas. Acesso pelo service role no servidor; nenhum bucket tem policy de storage.

| Bucket | Público | Limite | Tipos aceitos |
|---|---|---|---|
| `acordos` | não |  |  |
| `assembleias` | não |  |  |
| `compras` | não |  |  |
| `comprovantes` | não | 3 MB | application/pdf, image/jpeg, image/png, image/webp |
| `comunicacao` | **sim** |  |  |
| `diretoria` | não |  |  |
| `documentos` | não |  |  |
| `espacos` | não |  |  |
| `eventos` | não |  |  |
| `filiacao` | não |  |  |
| `hospedagem` | não | 5 MB | application/pdf, image/jpeg, image/png, image/webp |
| `juridico` | não |  |  |
| `noticias` | **sim** |  |  |
| `oposicao` | não | 10 MB | application/pdf |
| `organizacao` | **sim** |  |  |
| `patrimonio` | não |  |  |
| `pessoal` | não | 5 MB | application/pdf |
| `representacao` | não |  |  |
| `saude` | não | 5 MB | application/pdf, image/jpeg, image/png, image/webp |
| `usuarios` | não |  |  |
| `veiculos` | não |  |  |
