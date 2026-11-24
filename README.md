# Dashboard Oifarmas · Aulão de Cálculo Farmacêutico (Vercel)

Espelho do dashboard do Claude. A página (`public/index.html`) chama a função `api/data.js`, que lê a planilha do Google, calcula os totais e devolve só números (nenhum e-mail ou telefone sai do servidor). O resultado fica em cache por 5 minutos e a página se recarrega sozinha a cada 5 minutos, então acompanha a planilha sem você fazer nada.

Aba lida da planilha: **Lista completa de cadastros** (se renomear, ajuste `api/data.js`). Os compradores (Categoria 2 e 3) vêm da Jedu e ficam em `lib/jedu.json`: são números digitados, não atualizam sozinhos. Para atualizar, edite esse arquivo e dê `git push`.

## Caminho rápido (planilha pública, sem chave)

1. Na planilha: **Compartilhar > Acesso geral > Qualquer pessoa com o link > Leitor**.
2. Importe o repositório na Vercel (framework **Other**) e clique em Deploy. Não precisa de nenhuma variável.

Atenção: com a planilha pública, quem tiver o link da planilha vê nome, e-mail e telefone dos inscritos e compradores. A página do dashboard mostra só totais. O caminho seguro é o das seções abaixo (planilha privada com conta de serviço); se `GOOGLE_SERVICE_ACCOUNT_JSON` existir, a função usa esse caminho automaticamente.

## 1. Criar o acesso de leitura à planilha (uma vez, uns 5 minutos)

1. Entre em https://console.cloud.google.com e crie um projeto (ou use um existente).
2. Em **APIs e serviços > Biblioteca**, ative a **Google Sheets API**.
3. Em **APIs e serviços > Credenciais > Criar credenciais > Conta de serviço**, crie uma (nome livre, sem papéis).
4. Abra a conta criada > aba **Chaves** > **Adicionar chave > Criar nova chave > JSON**. Um arquivo `.json` é baixado. Guarde-o, ele é a senha de acesso.
5. Copie o e-mail da conta de serviço (termina em `.iam.gserviceaccount.com`), abra a planilha, clique em **Compartilhar** e dê acesso de **Leitor** a esse e-mail.

## 2. Subir para o GitHub

```bash
cd oifarmas-dashboard
git init && git add . && git commit -m "Dashboard Aulão"
# crie um repositório PRIVADO no GitHub e rode os comandos que ele mostrar (git remote add ... && git push)
```

## 3. Publicar na Vercel

1. Em https://vercel.com/new, importe o repositório. Framework: **Other**. Não precisa de build.
2. Antes de clicar em Deploy, abra **Environment Variables** e crie:
   - `GOOGLE_SERVICE_ACCOUNT_JSON`: cole **todo o conteúdo** do arquivo `.json` baixado.
   - `SHEET_ID` (opcional): só se a planilha mudar. Hoje o padrão é `1mHViniJy8IOIgbac2XPwG2fo1aI_-0IV6HtV8iW5ii4`.
3. Clique em **Deploy**. O endereço fica algo como `https://oifarmas-aulao-dashboard.vercel.app`.

Se aparecer "Não foi possível carregar os dados", a mensagem diz o motivo (variável faltando, planilha não compartilhada com a conta de serviço, aba renomeada).

## Privacidade

- A página só recebe totais. A planilha em si nunca é exposta.
- Mesmo assim, quem tiver o link vê os números. Para restringir, ative a proteção por senha ou login da Vercel em **Settings > Deployment Protection**.
- Nunca suba o arquivo `.json` da conta de serviço para o GitHub. Ele só entra na variável de ambiente da Vercel.

## Como as regras de cálculo funcionam

Estão todas em `lib/compute.js`:
- **Compradores:** pedidos com status Pago na Jedu (Categoria 2 e 3), de `lib/jedu.json`.
- **Conversão:** compradores ÷ inscritos.
- **Estado:** DDD do telefone. Telefone inválido não entra no ranking.
- **Qualidade:** problema de telefone (DDD inexistente ou dígitos faltando), e-mail (formato ou domínio digitado errado), nome vazio e duplicidade de e-mail ou telefone.
- **Hoje e ontem:** sempre no horário de São Paulo.

## Testar no seu computador (opcional)

```bash
npm i -g vercel
vercel dev   # pede login e as variáveis; depois abre em http://localhost:3000
```
