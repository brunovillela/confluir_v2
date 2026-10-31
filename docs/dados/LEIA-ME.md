<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Dicionário de dados do Confluir

Gerado a partir do banco de produção (catálogo do Postgres + comentários). **381 tabelas** no schema `public`, **222** com dado pessoal (1123 colunas etiquetadas).

- Etiquetas LGPD: cada tabela termina o comentário com `[lgpd:<categorias>|titulares:<quem>]` e cada coluna com dado pessoal com `[lgpd:<categoria>]` (Onda A4).
- Para mudar uma descrição ou classificação: migração com `comment on …` (`npm run db:nova`), aplicar, e `npm run db:dicionario`.
- [rls.md](rls.md): políticas de acesso por tabela e alertas.
- [views-e-storage.md](views-e-storage.md): 6 views e 22 buckets de arquivos.
- [dados-pessoais.csv](dados-pessoais.csv): uma linha por tabela e por coluna com dado pessoal. É insumo do ROPA (Onda B).

## Tabelas com dado pessoal, por categoria

| Categoria | Tabelas |
|---|---|
| identificação | 175 |
| **sensível: sindical** | 55 |
| trabalhista | 53 |
| financeiro | 50 |
| **credencial (nunca exportar)** | 19 |
| **sensível: saúde** | 18 |

## Módulos

| Módulo | Tabelas | Com dado pessoal | Dicionário | Diagrama |
|---|---|---|---|---|
| Filiação e portal do associado | 52 | 33 | [dicionario/filiacao.md](dicionario/filiacao.md) | [er/filiacao.md](er/filiacao.md) |
| Empregadores e grupos empresariais | 4 | 0 | [dicionario/empregadores.md](dicionario/empregadores.md) | [er/empregadores.md](er/empregadores.md) |
| Votações e assembleias | 33 | 15 | [dicionario/votacao.md](dicionario/votacao.md) | [er/votacao.md](er/votacao.md) |
| Representação, acordos e negociações | 18 | 9 | [dicionario/representacao.md](dicionario/representacao.md) | [er/representacao.md](er/representacao.md) |
| Diretoria e ofícios | 11 | 8 | [dicionario/diretoria.md](dicionario/diretoria.md) | [er/diretoria.md](er/diretoria.md) |
| Pessoal (RH da entidade) | 57 | 38 | [dicionario/pessoal.md](dicionario/pessoal.md) | [er/pessoal.md](er/pessoal.md) |
| Saúde do trabalhador | 13 | 11 | [dicionario/saude.md](dicionario/saude.md) | [er/saude.md](er/saude.md) |
| Jurídico | 5 | 4 | [dicionario/juridico.md](dicionario/juridico.md) | [er/juridico.md](er/juridico.md) |
| Financeiro | 31 | 22 | [dicionario/financeiro.md](dicionario/financeiro.md) | [er/financeiro.md](er/financeiro.md) |
| Compras, fornecedores e contratos | 22 | 11 | [dicionario/compras.md](dicionario/compras.md) | [er/compras.md](er/compras.md) |
| Institucional, diárias, viagens e patrimônio | 16 | 10 | [dicionario/institucional.md](dicionario/institucional.md) | [er/institucional.md](er/institucional.md) |
| Hospedagem | 18 | 10 | [dicionario/hospedagem.md](dicionario/hospedagem.md) | [er/hospedagem.md](er/hospedagem.md) |
| Cessão de espaços | 10 | 2 | [dicionario/cessao.md](dicionario/cessao.md) | [er/cessao.md](er/cessao.md) |
| Veículos e condutores | 23 | 14 | [dicionario/veiculos.md](dicionario/veiculos.md) | [er/veiculos.md](er/veiculos.md) |
| Comunicação, eventos e avisos | 29 | 9 | [dicionario/comunicacao.md](dicionario/comunicacao.md) | [er/comunicacao.md](er/comunicacao.md) |
| Ferramentas administrativas | 8 | 5 | [dicionario/ferramentas.md](dicionario/ferramentas.md) | [er/ferramentas.md](er/ferramentas.md) |
| Plataforma, acesso e auditoria | 31 | 21 | [dicionario/plataforma.md](dicionario/plataforma.md) | [er/plataforma.md](er/plataforma.md) |
