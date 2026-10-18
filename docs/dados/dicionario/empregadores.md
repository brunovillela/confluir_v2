<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Empregadores e grupos empresariais

4 tabelas. Diagrama: [er/empregadores.md](../er/empregadores.md).

| Tabela | Dado pessoal | Descrição |
|---|---|---|
| [empresas_categorias](#empresas_categorias) | — | Categorias de empresas com imagem, vindas do Bubble. Sem uso encontrado no código (possível legado do Bubble). |
| [empresas_categorias_empresas](#empresas_categorias_empresas) | — | Associação N:N entre empresas e empresas_categorias. Sem uso encontrado no código (possível legado do Bubble). |
| [grupo_empresarial_membros](#grupo_empresarial_membros) | — | Empresa membro de um grupo empresarial (representada ou não pela entidade), com nome e CNPJ quando não cadastrada (lib/db/grupos-empresariai… |
| [grupos_empresariais](#grupos_empresariais) | — | Grupos de empresas (membros representados ou não), com opção de contribuição centralizada numa empresa pagadora em Receitas. |

## empresas_categorias

Categorias de empresas com imagem, vindas do Bubble. Sem uso encontrado no código (possível legado do Bubble).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `uuid_generate_v4()` |  |  |  |
| `bubble_id` | text | sim |  |  |  |  |
| `categoria` | text | sim |  |  |  |  |
| `imagem` | text | sim |  |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `created_at` | timestamp with time zone | sim | `now()` |  |  |  |

Únicas: `UNIQUE (bubble_id)`

Índices: `empresas_categorias_bubble_id_key`, `empresas_categorias_pkey`

## empresas_categorias_empresas

Associação N:N entre empresas e empresas_categorias. Sem uso encontrado no código (possível legado do Bubble).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: **nenhuma**

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `categoria_id` | uuid | não |  | → empresas_categorias (**cascade**) |  |  |
| 🔑 `empresa_id` | uuid | não |  | → empresa (**cascade**) |  |  |

Índices: `empresas_categorias_empresas_pkey`

## grupo_empresarial_membros

Empresa membro de um grupo empresarial (representada ou não pela entidade), com nome e CNPJ quando não cadastrada (lib/db/grupos-empresariais.ts).

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `grupo_id` | uuid | sim |  | → grupos_empresariais (**cascade**) |  |  |
| `empresa_id` | uuid | sim |  | → empresa (**cascade**) |  |  |
| `nome` | text | sim |  |  |  | Razão social da empresa membro quando não há empresa_id. |
| `cnpj` | text | sim |  |  |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `grupo_empresarial_membros_pkey`, `idx_grupo_membros_grupo`, `uq_grupo_membros_cnpj`, `uq_grupo_membros_empresa`

## grupos_empresariais

Grupos de empresas (membros representados ou não), com opção de contribuição centralizada numa empresa pagadora em Receitas.

- **LGPD:** nenhum dado pessoal
- **RLS:** ligado · policies: `tenant_isolation`
- **Triggers:** `set_emp_from_jwt` → `set_emp_from_jwt`

| Coluna | Tipo | Nulo | Padrão | Referência | LGPD | Descrição |
|---|---|---|---|---|---|---|
| 🔑 `id` | uuid | não | `gen_random_uuid()` |  |  |  |
| `emp_proprietaria_id` | uuid | sim |  | → empresa |  |  |
| `nome` | text | não | `''::text` |  |  |  |
| `descricao` | text | sim |  |  |  |  |
| `contribuicao_centralizada` | boolean | não | `false` |  |  |  |
| `empresa_pagadora_id` | uuid | sim |  | → empresa (set null) |  |  |
| `created_at` | timestamp with time zone | não | `now()` |  |  |  |
| `updated_at` | timestamp with time zone | não | `now()` |  |  |  |

Índices: `grupos_empresariais_pkey`, `idx_grupos_empresariais_emp`
