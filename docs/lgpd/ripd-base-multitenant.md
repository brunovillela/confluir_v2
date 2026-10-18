# RIPD 3: Base de filiados num sistema multi-entidade

> **Relatório de Impacto à Proteção de Dados Pessoais** (LGPD, arts. 5º XVII e 38), no modelo da ANPD. **Rascunho técnico** da Onda B3, de 18/10/2026. Trata do risco que é próprio de um SaaS: várias entidades no mesmo banco, com o Confluir como operador de todas.

## 1. Identificação

| | |
|---|---|
| Controladoras | Cada entidade (tenant). Hoje há **2 tenants** cadastrados |
| Operador | Confluir (inclusive os administradores da plataforma) |
| Suboperadores | Ver `suboperadores.md` |
| Processos do ROPA | Todos; ênfase em P01, P02 e P16 |

## 2. Por que este RIPD é necessário

- A base é **dado sensível em larga escala**: 20.178 cadastros em `filiacoes` e 793.558 linhas em `filiacao_recebe`, com CPF, nome e contribuição. A filiação sindical é sensível (art. 5º, II).
- **Várias controladoras no mesmo banco.** Uma falha de isolamento expõe os filiados de uma entidade a outra, o que é especialmente grave se as entidades disputam a mesma base.
- O operador tem acesso técnico a tudo. A confiança da entidade depende de controles verificáveis.

## 3. Descrição do tratamento

| Elemento | Como funciona | Evidência |
|---|---|---|
| **Resolução do tenant** | Subdomínio → `tenants.slug` → id. O proxy injeta `x-tenant-id` com assinatura HMAC; tenant inexistente ou suspenso é bloqueado | `src/proxy.ts:80-122`; `src/lib/tenant.ts:24-39`; `src/lib/tenant-assinatura.ts` |
| **Acesso aos dados** | Leitura com JWT `authenticated` de 60 s e claim `tenant_id`, com RLS aplicado; escrita pelo tenant nas tabelas mapeadas; `service_role` restrito a plataforma, crons e Auth | `src/lib/supabase/admin.ts:23-173` |
| **RLS** | 347 tabelas com RLS ligado; policy `tenant_isolation` (`emp_proprietaria_id = jwt.tenant_id`); tabelas-filhas isoladas pelo pai; nenhuma policy aberta a `anon` sem `tenant_id` (conferido por GET com a anon key → 0 linhas) | `docs/dados/rls.md` |
| **Contas e acesso** | Supabase Auth único; vínculo da conta ao tenant por `usuarios` e `auth_identidades`; RBAC com perfis; MFA TOTP para permissões sensíveis (`MFA_OBRIGATORIO`); bloqueio após falhas de login; Turnstile | `src/lib/auth.ts`; `src/lib/mfa.ts:32-42`; `src/lib/login-bloqueio.ts:7-24` |
| **Plataforma** | `/admin` só para `plataforma_admins`, com aal2. Vê tenants, CNPJ e os administradores de cada tenant; não há tela de filiados | `src/proxy.ts:179-198`; `src/lib/db/plataforma.ts` |
| **Auditoria** | Trigger `registrar_auditoria` em 33 tabelas (filiações, vínculos, dados bancários, usuários, permissões, ordens…) com antes/depois e autor; escrita direta revogada | linha de base `:1850-1924`, `:19388-19612` |
| **Saídas** | Exportações CSV/XLSX/PDF/CNAB registradas no livro `lgpd_exportacoes` (quem, quando, rota, recorte, linhas, categorias), visível em Institucional › Auditoria › Exportações; API pública por chave do tenant, com escopo por endpoint (CPF só com `filiados_cpf`), chave só no cabeçalho e log por requisição em `api_requisicoes` (aba API) | `src/lib/exportacoes.ts`; `src/lib/api-publica.ts` (`rotaApi`); migração `20261018181524_livro_exportacoes_api` |
| **Deriva e restauro** | Impressão digital do schema com cron semanal; restauro comprovado do zero com resultado idêntico | Onda A (A3, A6) |

## 4. Necessidade e proporcionalidade

| Princípio | Avaliação |
|---|---|
| **Base legal** | A do processo de origem (ROPA); o operador trata por instrução da controladora (art. 39). |
| **Segregação** | Adequada no banco (RLS em 100% das tabelas) e reforçada na aplicação. |
| **Prestação de contas** | **Parcial.** As escritas sensíveis são auditadas e, desde 18/10/2026, as exportações e as chamadas à API também; leituras em tela, personificação ("ver como") e acessos da plataforma ainda não deixam rastro. |
| **Minimização** | Adequada na API: cada chave lê só os endpoints marcados e o CPF exige escopo próprio. As exportações do painel continuam com CPF para quem tem a permissão do módulo. |

## 5. Riscos

| # | Risco | P | I | Nível | Medidas existentes | Medidas recomendadas | Residual | Dono |
|---|---|---|---|---|---|---|---|---|
| M1 | **Insert sem tenant cai na entidade principal**: 65 colunas `emp_proprietaria_id` com `DEFAULT` igual ao UUID do tenant principal; o DEFAULT é aplicado antes do trigger `set_emp_from_jwt`. Pelo JWT do tenant o WITH CHECK recusa (falha fechada); pelo `service_role` a linha vai **silenciosamente** para a entidade principal | B | A | Médio | Todos os inserts conferidos informam o tenant; as 65 tabelas estão em `TABELAS_TENANT` | Migração que remove os 65 defaults (o insert sem tenant passa a falhar por NOT NULL) | Baixo | Dev |
| M2 | **Fallback para a entidade principal**: `tenantAtual()` volta ao tenant do `.env` quando falta a assinatura, quando há erro ou quando não há subdomínio; sem `SUPABASE_JWT_SECRET` o header é aceito sem conferência (`src/lib/tenant.ts:34-37`) | B | A | Médio | Assinatura HMAC; tenant do `.env` é o mesmo da entidade principal | Falhar fechado em produção (erro em vez de fallback) quando o host tem subdomínio desconhecido ou a assinatura não confere; exigir `SUPABASE_JWT_SECRET` no boot | Baixo | Dev |
| M3 | **Acesso do operador sem rastro**: o `service_role` lê tudo; não há registro de leitura pelo `/admin` nem por scripts; `tenants` não é auditada | M | A | **Alto** | `/admin` restrito com MFA; nenhuma tela de filiados na plataforma | Auditar `tenants`; registrar o uso de scripts com service_role (quem, quando, o quê) num livro de acesso do operador; política de acesso do operador no contrato (B6) | Médio | Operação + dev |
| M4 | **Personificação sem registro**: "ver como filiado", "ver como eleitor" e "ver como o hotel" não registram quem, quando nem qual alvo (`src/lib/visualizacao-filiado.ts`; `-eleitor.ts`; `-hotel.ts`) | M | M | Médio | Cookie HMAC de 30 min; somente leitura; saúde não aparece; permissão rechecada a cada request | Registrar início e fim (quem, alvo, motivo opcional) | Baixo | Dev |
| M5 | **Exportação em massa sem registro**: lista de filiados com CPF, relatórios, aptos com CPF, CAT e API pública não registravam nada; só as etiquetas registravam (`src/lib/db/comunicacao-etiquetas.ts:226-235`) | M | A | **Alto** | Permissões por módulo. **Feito em 18/10/2026:** livro `lgpd_exportacoes` (quem, quando, rota, filtros, formato, linhas, categorias de dado pessoal), gravado só pelo service_role e só lido pela entidade, chamado nas 18 rotas que entregam dado pessoal em massa (filiados, relatórios, etiquetas, links de voto, relação de votantes, CAT, movimento da folha, CNAB, ordens, contábil, compras, contratos, fornecedores, custeios, viagens, jurídico, patrimônio); histórico em Institucional › Auditoria › Exportações | Aviso no topo do arquivo (não feito); retenção de 5 anos a confirmar (B4); documentos individuais (ficha, ofício, RPA) ficam fora por serem de uma pessoa só | Baixo | Dev |
| M6 | **API pública expõe CPF em massa**: escopo único `leitura` sem checagem por endpoint; chave aceita em query string; sem log por requisição | M | A | **Alto** | Chave por tenant com hash; vale só no subdomínio do tenant; limite de taxa. **Feito em 18/10/2026:** escopos por endpoint (`agenda`, `eventos`, `arrecadacao`, `despesas`, `filiados`, `filiados_cpf`) com CHECK no banco; sem `filiados_cpf` o CPF volta nulo; `?chave=` recusado com 400 (o log aponta a chave vazada); `api_requisicoes` com chave, rota, parâmetros, status, linhas, IP e duração, inclusive as recusadas; escopos editáveis no painel sem reemitir. A única chave ativa ("Teste Power BI", tenant demo) virou os 5 escopos sem CPF | Retenção do log (6 meses, B4); revisar com a entidade se alguma integração precisa de CPF | Baixo | Dev + entidade |
| M7 | **MFA e Turnstile opcionais** por variável de ambiente; não há verificação de que estão ligados em produção | B | A | Médio | Ligados em produção desde 03/10 (Onda 0) | Checagem no boot ou no cron de deriva que alerte se `MFA_OBRIGATORIO`/Turnstile estiverem desligados em produção | Baixo | Dev |
| M8 | **Auditoria parcial**: sem trigger em `telefones`, `emails`, saúde e voto; falha da auditoria vira só warning; a auditoria copia em claro códigos e tokens com nomes fora da lista de ocultos | M | M | Médio | 33 tabelas auditadas; colunas cifradas ocultas | Estender a lista de tabelas e de colunas ocultas (padrão `%token%`, `%codigo%`, `%segredo%`); alinhar o catálogo da tela com os triggers reais | Baixo | Dev |
| M9 | **Storage isolado só pela aplicação**: 21 buckets sem policy, sem prefixo de tenant uniforme; 3 buckets públicos (`comunicacao`, `noticias`, `organizacao`) | B | A | Médio | Acesso por service_role no servidor; URLs assinadas nos privados | Prefixo `<tenant>/` obrigatório em todo upload; conferir que os buckets públicos não guardam dado pessoal | Baixo | Dev |
| M10 | **Cópias fora do sistema**: arquivos `supabase/*backup*.json` e caches `.auditoria-bubble*` com dados pessoais no disco do desenvolvedor (fora do git); não há política de backup e retenção de backups documentada | M | M | Médio | Fora do git (`.gitignore`) | Apagar as cópias locais após o uso; documentar backup/PITR do Supabase e a retenção (Onda E) | Baixo | Usuário + operação |
| M11 | **Suspensão não imediata**: cache de 60 s do slug para o tenant (`src/proxy.ts:35-51`) | B | B | Baixo | Cache curto | Aceitável; documentar | Baixo | — |
| M12 | **RPCs isolam por parâmetro**: funções SQL executadas com service_role confiam em `p_emp` | B | A | Médio | EXECUTE revogado de anon/authenticated (migração `20261018173409`) | Revisar o corpo de cada função para garantir que todo acesso filtra `p_emp` | Baixo | Dev |

## 6. Plano de ação

1. ~~**M5 e M6**: registro de exportações e endurecimento da API.~~ Feito em 18/10/2026 (migração `20261018181524_livro_exportacoes_api`).
2. **M3**: livro de acesso do operador e auditoria de `tenants`.
3. **M1 e M2**: remover os defaults e falhar fechado no tenant (a migração e a mudança no `tenantAtual` são pequenas).
4. **M4, M7, M8, M9, M10, M12**: rastros, alertas, auditoria, storage, cópias e RPCs.

## 7. Conclusão

O isolamento entre entidades no banco é sólido: RLS em 100% das tabelas, JWT por tenant, nenhum acesso anônimo, schema reproduzível e vigiado contra deriva. O ponto fraco é a **prestação de contas**. O que sai (exportações e API) passou a deixar rastro em 18/10/2026 (M5 e M6); quem olha (operador, personificação) ainda não. **Recomendação:** manter; priorizar M3 antes de receber novas entidades na plataforma.

## 8. Aprovação

| Papel | Nome | Data | Decisão |
|---|---|---|---|
| Encarregado de cada entidade | | | |
| Operador (Confluir) | | | |
