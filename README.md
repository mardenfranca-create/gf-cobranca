# gf-cobranca

Sistema de recuperação de crédito da Gontijo Freitas Advogados: mesa de operação (equipe) e portal do cliente.

**Regra de ouro, no banco:** nenhum caso aberto sem responsável, próxima ação e data. Eventos são imutáveis. Importações são idempotentes.

## Stack

Next.js 16 (App Router, Server Actions) · Supabase (Postgres, Auth, RLS) · Vercel.

## Etapas

| Etapa | Conteúdo | Status |
|---|---|---|
| 1. Núcleo | Login da equipe, casos, régua configurável, fila, agenda, quadro, exceções, importação com reconciliação, carga do Trello | nesta versão |
| 2. Portal do cliente | Login por cliente, alçadas, aprovação de acordo, envio de planilha, informar pagamento, relatório | próxima |
| 3. Integrações | Asaas (boleto, baixa por webhook, split), WhatsApp oficial, exportação do Astrea | |
| 4. Financeiro | Fechamento de êxito, comissão, conciliação | |

## Colocar no ar (primeira vez)

### 1. Banco (Supabase)

1. Projeto Supabase na região **South America (São Paulo)**.
2. No painel: **SQL Editor → New query**, cole o conteúdo de `supabase/migrations/0001_init.sql` e execute.
3. **Authentication → Providers → Email**: deixe "Confirm email" desligado (os usuários são criados pelo admin, não se cadastram).
4. **Project Settings → API**: anote `Project URL`, `anon public` e `service_role`.

### 2. Usuários

**Authentication → Users → Add user → Create new user**, com e-mail e senha. Em *User Metadata* informe o perfil:

```json
{"nome": "Ana Paula", "papel": "operador"}
```

Papéis: `admin` (Marden, Letícia), `operador` (Ana Paula), `cliente` (exige também `"cliente_id": "wrj"`, etapa 2). O perfil é criado automaticamente junto com o usuário.

### 3. Aplicação (Vercel)

1. **Add New Project → Import** este repositório.
2. Em *Environment Variables*, cadastre:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (só servidor)
3. Deploy. Abra a URL e entre com um usuário da equipe.

### 4. Carga da carteira do Trello

Pela interface: **Importar → Recarregar do Trello** e escolha o JSON exportado (Menu do quadro → Imprimir, exportar e compartilhar → Exportar como JSON).

Ou pela linha de comando, com a chave de serviço:

```bash
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run carga:trello -- trello.json
```

A carga é idempotente: rodar de novo só traz cartões novos.

## Desenvolvimento local

```bash
cp .env.example .env.local   # preencha com as chaves do Supabase
npm install
npm run dev                  # http://localhost:3000
npm test                     # regras de negócio (régua, fila, reconciliação, alçada)
npm run lint && npm run typecheck
```

## Estrutura

```
supabase/migrations/   schema, RLS, triggers (eventos imutáveis, perfil automático)
src/lib/domain/        regras puras, testadas: régua, fila, reconciliação, alçada, parser do Trello
src/lib/actions/       server actions: cada ação da mesa grava o caso + evento
src/app/(mesa)/        fila, agenda, quadro, casos, conferência, clientes, importar
src/proxy.ts           renova a sessão e protege rotas
scripts/               carga inicial
```

## Modelo de dados

- **clientes**: credores (escola, contabilidade, empresa, associação) com alçadas, honorários e prazo de protesto.
- **casos**: uma dívida consolidada por cliente + devedor. Fase, responsável, próxima ação (obrigatória quando aberto), exceção (pausa a régua com data de revisão).
- **parcelas**: competências consolidadas no caso (únicas por referência + vencimento).
- **eventos**: histórico imutável (trigger bloqueia update/delete), com flag de visibilidade para o cliente.
- **propostas**: termos, dentro/fora da alçada, status.
- **importacoes**: hash único por planilha.
- **regua**: prazos configuráveis que governam a próxima ação.
