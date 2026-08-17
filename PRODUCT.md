# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Grupo de ~5 amigos gamers brasileiros (Felipe — o dono — e os amiguinhos: luizin, vertice isolada, Rolinha e cia.), jovens adultos, à vontade com tecnologia. Situação: sessões espontâneas de "vem ver isso" — um transmite gameplay ou clip, os outros assistem e zoam, com a voz rolando no Discord em paralelo (por enquanto). O produto pode um dia abrir para estranhos, mas o usuário confirmado hoje é a turma.

## Product Purpose

Compartilhamento de tela ao vivo entre amigos, direto do navegador, grátis e sem limite de tempo — o substituto caseiro do Discord depois que a ANPD suspendeu lives/tela/câmera no Brasil (2026). Sucesso é: colar o link no grupo, todo mundo entrar em segundos, o vídeo chegar nítido e ninguém pagar nada, nunca.

## Positioning

WebRTC P2P de verdade: o vídeo vai direto de um PC pro outro; nenhum servidor assiste, grava ou cobra. Quando o P2P falha (CGNAT/5G), cai automaticamente num relay coturn próprio numa VM gratuita da Oracle (10 TB/mês), com o TURN da Cloudflare (1 TB/mês) de fallback e trava de custo. É infraestrutura de gente grande operada a custo zero — "feito pela própria turma, melhor que o produto que nos abandonou".

## Operating Context

- Dois cenários confirmados de uso: **tela cheia** (sessão de assistir, tipo cineminha — a Telinha é o foco) e **janela ao lado / segundo monitor** (TV ligada no canto enquanto cada um joga).
- Celular também acontece (ex.: assistir do 5G na rua) — mobile é cenário real, não edge case.
- Voz do grupo hoje fica no Discord, aberto em paralelo; a Telinha cuida só de tela+áudio do jogo.
- Fluxo ritual: alguém cria a sala → cola o link no grupo → cada um entra com nick → um ou mais transmitem.

## Capabilities and Constraints

- Salas efêmeras por código de 6 letras (ex.: R7JGXP), link direto `/sala/CODE`, sem cadastro; nada é salvo.
- Até ~5 pessoas por sala (mesh P2P; limite técnico de upload de quem transmite). Múltiplas transmissões simultâneas.
- Transmissão com áudio do sistema/aba; 8 Mbps P2P direto, 4 Mbps quando relayado (economia de cota automática).
- Estados de conexão explícitos (conectando / instável / falhou), toasts + sons de entrada/saída/transmissão, modo foco, fullscreen e mute por transmissão.
- Página `/uso` (login do dono) com consumo dos dois relays; corte automático do fallback Cloudflare em 950 GB.
- Restrições: hospedagem gratuita (Render free — servidor "dorme" e demora ~30-60s no primeiro acesso); conteúdo com DRM (Netflix/HBO Max) sai preto por limitação do navegador; interface e voz do produto em pt-BR informal.
- Stack existente: React + Vite (client, CSS puro em um styles.css), Node + Express + ws (server), sem framework de UI.

## Brand Commitments

- Nome **"Telinha"** é vinculante — carinhoso, diminutivo brasileiro, é a identidade do produto.
- Todo o resto (emoji 📺, paleta roxa atual, tipografia, layout) foi explicitamente liberado para mudar no redesign.
- Voz confirmada: pt-BR informal e caloroso ("amiguinhos", "sala", zoeira leve), sem jargão corporativo.

## Evidence on Hand

- Em uso real pelo grupo desde o primeiro dia (sessões com Spotify, gameplay, filmes) — produção em `telinha-n685.onrender.com`, código em `github.com/felipethecreator/telinha`.
- Infra comprovada: coturn na Oracle funcionando, fallback Cloudflare testado em campo (resolveu o caso do amigo em CGNAT/5G).
- Não existem testemunhos, métricas ou usuários externos — nada disso pode ser inventado em superfícies futuras.

## Product Principles

1. **Custo zero é requisito, não meta** — qualquer feature nova precisa caber no plano grátis das infras.
2. **Entrar é instantâneo** — link → nick → dentro; qualquer atrito a mais é regressão.
3. **O vídeo é o protagonista** — durante a sessão a interface recua; controles aparecem quando procurados.
4. **Feito pra turma, pronto pra estranhos** — funciona com piada interna hoje sem fechar a porta pra abrir ao público amanhã.
5. **Rede imprevisível é o normal** — todo estado de conexão é visível e honesto; tela preta muda nunca é resposta.
