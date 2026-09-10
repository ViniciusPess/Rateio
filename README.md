# Rateio

Portal em português do Brasil para administrar assinaturas compartilhadas, cobranças mensais e confirmações de pagamento.

Cada administrador cria a própria conta e acessa somente o seu espaço. Os participantes não precisam criar conta: recebem um link pessoal, permanente e revogável para consultar cobranças, confirmar ciência e informar pagamentos.

## Funcionalidades

- contas administrativas com dados isolados por workspace;
- cadastro de assinaturas, participantes, WhatsApp, Pix e vencimento;
- alterações de valor, participantes e vencimento válidas a partir de um mês escolhido;
- cobranças mensais, lembretes pelo WhatsApp e análise de pagamentos;
- comprovantes em bucket privado;
- link pessoal do participante armazenado somente como hash;
- espelho responsivo para o participante, sem conta e sem senha;
- edição do nome do perfil e recuperação de senha.

## Arquitetura

- Next.js 16 com App Router;
- React 19 e TypeScript;
- Supabase Auth, PostgreSQL, RLS, Storage e Edge Functions;
- hospedagem preparada para Netlify com o adaptador automático OpenNext.

O navegador recebe apenas a chave pública do Supabase. O acesso público do participante passa pela Edge Function `participant-access`, que valida o token pessoal e devolve somente os registros daquele participante. Nenhuma chave secreta é necessária na hospedagem do frontend.

## Desenvolvimento local

Requisitos: Node.js 22 ou superior e npm.

1. Copie `.env.example` para `.env.local`.
2. Preencha as três variáveis públicas.
3. Instale as dependências com `npm ci`.
4. Inicie com `npm run dev`.
5. Abra `http://localhost:5173`.

Variáveis:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_SITE_URL=http://localhost:5173
```

Nunca adicione `.env.local` ou uma chave `service_role` ao Git. O projeto não usa `service_role` no navegador nem na Netlify.

## Banco de dados e Edge Function

As migrations versionadas estão em `supabase/migrations/`. A Edge Function está em `supabase/functions/participant-access/`.

Todos os dados administrativos usam RLS. As FKs compostas impedem que registros filhos apontem para outro workspace, e as funções de escrita validam o proprietário autenticado. O token bruto do participante é exibido somente quando o link é gerado ou trocado; o banco guarda apenas seu hash SHA-256 e os quatro últimos caracteres para identificação.

## Validação

```bash
npm test
npm run lint
npm run build
```

Os testes locais cobrem regras do domínio, rateio de centavos e geração/hash de tokens. A validação de produção também deve testar cadastro por e-mail, recuperação de senha, isolamento entre duas contas e o fluxo completo do link do participante.

## Publicação na Netlify

A Netlify detecta o Next.js automaticamente. Conecte este repositório pelo painel, mantenha o comando `npm run build` e cadastre as três variáveis públicas acima. Em produção, `NEXT_PUBLIC_SITE_URL` deve conter a URL pública final.

Depois do primeiro deploy, configure no Supabase Auth:

- **Site URL**: a URL pública final;
- **Redirect URLs**: `/auth/callback` na URL final e as URLs locais usadas no desenvolvimento;
- um provedor SMTP próprio para que confirmações e recuperações de senha funcionem de forma confiável para terceiros.

O portal antigo e seus dados não são substituídos por esta publicação. A migração de dados existentes deve ser feita separadamente, depois que a nova conta administrativa estiver validada.
