# 📺 Telinha

Compartilhamento de tela entre amigos, direto do navegador. Sem cadastro, sem custo, sem limite de tempo.

Você cria uma sala, manda o link no grupo, cada um entra com um nick e qualquer um pode transmitir a tela (com o áudio do jogo junto). O vídeo vai **direto de um PC pro outro (WebRTC P2P)** — o servidor só faz a "apresentação" inicial entre os navegadores, então não gasta banda nem armazena nada.

## Como funciona

```
telinha/
├── server/          # Node + Express + WebSocket (sinalização)
│   ├── server.js
│   └── public/      # frontend já buildado (o servidor serve daqui)
└── client/          # código-fonte do frontend (React + Vite)
```

- **server/**: gerencia salas (códigos de 6 letras), repassa as mensagens de negociação WebRTC (offer/answer/ICE) e avisa quem entrou/saiu/começou a transmitir.
- **client/**: interface React. Quando alguém clica em "Compartilhar minha tela", ele cria uma conexão WebRTC direta com cada pessoa da sala e envia o vídeo pra elas.

## Rodando (jeito mais simples)

Só precisa do Node 18+:

```bash
cd server
npm install
npm start
```

Abre em `http://localhost:3000`. O frontend já vem buildado dentro de `server/public`, então **não precisa buildar nada** pra usar.

## Colocando no ar de graça

### Opção A — Render (recomendado: link fixo, nada rodando no seu PC)

1. Suba o projeto num repositório do GitHub.
2. Em [render.com](https://render.com), crie um **Web Service** (free) apontando pro repo.
3. Configure:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Pronto — vocês acessam algo como `https://telinha.onrender.com`.

> No plano grátis o serviço "dorme" após ~15 min sem uso e demora uns 30-60s pra acordar no primeiro acesso. Como ele só faz sinalização (o vídeo não passa por ele), o free tier aguenta de boa.

### Opção B — Rodar no seu PC com Cloudflare Tunnel

O navegador só libera compartilhamento de tela em HTTPS, então seus amigos não conseguem acessar direto pelo seu IP. O [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) resolve isso de graça:

```bash
# num terminal:
cd server && npm start

# em outro:
cloudflared tunnel --url http://localhost:3000
```

Ele te dá uma URL `https://alguma-coisa.trycloudflare.com` — manda pros amigos e pronto. A URL muda a cada execução (dá pra fixar criando um túnel nomeado com domínio próprio, se um dia quiser).

## Mexendo no frontend

```bash
cd client
npm install
npm run dev     # dev server com hot reload (o proxy já aponta o /ws pro servidor na porta 3000)
npm run build   # gera o build direto em server/public
```

## Dicas de uso

- **Áudio do jogo**: ao compartilhar, escolha **"Guia do Chrome"** ou **"Tela inteira"** e marque **"Compartilhar áudio"** (a opção de áudio do sistema funciona melhor no Chrome/Edge no Windows).
- Clique num vídeo pra dar **foco** nele; use o botão ⛶ pra tela cheia; 🔊/🔇 pra controlar o som de cada transmissão.
- Mais de uma pessoa pode transmitir **ao mesmo tempo**.
- O link da sala (`/sala/CÓDIGO`) pode ser mandado direto no grupo — quem clicar já cai na tela de entrada com o código preenchido.

## Relay próprio (coturn na Oracle)

O `/ice` entrega relays nesta ordem: **coturn próprio** (se `COTURN_HOST` + `COTURN_SECRET` estiverem configurados e a VM responder ao health check) → **Cloudflare TURN** (fallback) → só STUN. Pra subir o coturn numa VM Ubuntu (ex.: always free da Oracle, 10 TB/mês):

```bash
sudo bash setup-coturn.sh
```

O script instala tudo, gera o segredo e imprime as variáveis pra colar no Render. Não esquece de abrir UDP/TCP 3478 e UDP 49152-65535 também na Security List da Oracle.

## Limitações (e como resolver se aparecerem)

- **Até ~5 pessoas por sala**: como é P2P, quem transmite envia uma cópia do vídeo pra cada espectador. Com internet residencial, 4 espectadores é o limite confortável. Pra mais gente, o caminho é trocar o mesh por um SFU (LiveKit é a rota mais fácil).
- **Casos raros de rede** (CGNAT dos dois lados, por exemplo) podem impedir a conexão direta. Se alguém nunca conseguir ver o vídeo de ninguém, a solução é adicionar um servidor TURN (o [coturn](https://github.com/coturn/coturn) num VPS barato, ou o free tier do [metered.ca](https://www.metered.ca/tools/openrelay/)) na lista `ICE_SERVERS` em `client/src/Room.jsx`.
- Salas morrem quando a última pessoa sai — nada fica salvo.
