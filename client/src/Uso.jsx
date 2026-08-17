import { useEffect, useState } from 'react'

const fmt = (n, d = 1) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: d })

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

function diaLabel(iso) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

// bloco reutilizável: tile + medidor + gráfico diário de um provedor
function Provedor({ titulo, subtitulo, nota, dados, marcaGB, statusChip }) {
  const pct = Math.min(100, (dados.totalGB / dados.gratisGB) * 100)
  const nivel = pct >= 100 ? 'critico' : pct >= 80 ? 'alerta' : 'ok'
  const maxDia = dados.dias.length ? Math.max(...dados.dias.map((d) => d.gb)) : 0
  const mes = MESES[new Date().getMonth()]

  return (
    <section className="uso-bloco">
      <h2 className="uso-h2">
        {titulo}
        {subtitulo && <span className="uso-h2-sub">{subtitulo}</span>}
      </h2>
      <div className="uso-tile">
        <div>
          <div className="uso-numero">
            {fmt(dados.totalGB)} <small>GB</small>
          </div>
          <div className="uso-legenda">
            de {fmt(dados.gratisGB, 0)} GB grátis · {mes}
            {nota ? ` · ${nota}` : ''}
          </div>
        </div>
        {statusChip}
      </div>

      <div className="uso-medidor" aria-label={`Consumo: ${fmt(pct)}% do limite gratuito`}>
        <div className="uso-barra">
          <div className={`uso-fill uso-fill-${nivel}`} style={{ '--pct': `${pct}%` }} />
          {marcaGB && (
            <div
              className="uso-marca"
              style={{ left: `${(marcaGB / dados.gratisGB) * 100}%` }}
              title={`desligamento automático: ${fmt(marcaGB, 0)} GB`}
            />
          )}
        </div>
        <div className="uso-escala">
          <span>0</span>
          <span>
            {fmt(pct)}% usado
            {marcaGB ? ` · desliga sozinho em ${fmt(marcaGB, 0)} GB` : ''}
          </span>
          <span>{fmt(dados.gratisGB, 0)} GB</span>
        </div>
      </div>

      {dados.dias.length === 0 ? (
        <p className="uso-legenda">Nenhum consumo registrado este mês ainda.</p>
      ) : (
        <>
          <div className="uso-chart" role="img" aria-label="Gráfico de barras do consumo diário em GB">
            {dados.dias.map((d) => (
              <div className="uso-col" key={d.date} data-tip={`${diaLabel(d.date)} · ${fmt(d.gb)} GB`}>
                {d.gb === maxDia && maxDia > 0 && <span className="uso-col-label">{fmt(d.gb)}</span>}
                <div
                  className="uso-col-bar"
                  style={{ height: `${maxDia ? Math.max(3, (d.gb / maxDia) * 100) : 3}%` }}
                />
                <span className="uso-col-dia">{d.date.slice(8, 10)}</span>
              </div>
            ))}
          </div>
          <details className="uso-tabela">
            <summary>Ver como tabela</summary>
            <table>
              <thead>
                <tr><th>Dia</th><th>Consumo (GB)</th></tr>
              </thead>
              <tbody>
                {dados.dias.map((d) => (
                  <tr key={d.date}>
                    <td>{diaLabel(d.date)}</td>
                    <td>{fmt(d.gb)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  )
}

export default function Uso() {
  const [token, setToken] = useState(sessionStorage.getItem('telinha:uso-token') || '')
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(false)

  async function login(e) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      const r = await fetch('/api/uso/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, pass }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Erro no login')
      sessionStorage.setItem('telinha:uso-token', data.token)
      setToken(data.token)
    } catch (err) {
      setErro(err.message)
    } finally {
      setCarregando(false)
    }
  }

  async function carregar(tk) {
    setErro('')
    setCarregando(true)
    try {
      const r = await fetch('/api/uso/dados', { headers: { Authorization: `Bearer ${tk}` } })
      const data = await r.json()
      if (r.status === 401) {
        sessionStorage.removeItem('telinha:uso-token')
        setToken('')
        return
      }
      if (!r.ok) throw new Error(data.error || 'Erro carregando os dados')
      setDados(data)
    } catch (err) {
      setErro(err.message)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    if (token) carregar(token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  function sair() {
    sessionStorage.removeItem('telinha:uso-token')
    setToken('')
    setDados(null)
  }

  // ---------- tela de login ----------
  if (!token) {
    return (
      <div className="home">
        <div className="home-card">
          <div className="logo">
            <h1>CONSUMO</h1>
          </div>
          <p className="tagline">Uso dos relays (TURN) da Telinha — área do dono.</p>
          <form onSubmit={login}>
            <label>
              Usuário
              <input value={user} onChange={(e) => setUser(e.target.value)} autoFocus required />
            </label>
            <label>
              Senha
              <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} required />
            </label>
            {erro && <p className="uso-erro">{erro}</p>}
            <button type="submit" className="btn-primary" disabled={carregando}>
              {carregando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
          <p className="hint"><a className="uso-link" href="/">← voltar pra Telinha</a></p>
        </div>
      </div>
    )
  }

  // ---------- painel ----------
  return (
    <div className="uso">
      <header className="topbar">
        <div className="brand">
          TELINHA <span className="uso-sub">/ consumo dos relays</span>
        </div>
        <div className="topbar-right">
          <button className="btn-ghost" onClick={() => carregar(token)} disabled={carregando}>
            {carregando ? 'Atualizando…' : '↻ Atualizar'}
          </button>
          <button className="btn-ghost" onClick={sair}>Sair</button>
        </div>
      </header>

      <main className="uso-main">
        {erro && <p className="uso-erro">{erro}</p>}
        {!dados && !erro && <p className="pulse">Carregando…</p>}
        {dados && (
          <>
            {dados.oracle && (
              <Provedor
                titulo="RELAY PRINCIPAL"
                subtitulo="VM Oracle"
                nota="todo o tráfego da VM"
                dados={dados.oracle}
                statusChip={<div className="uso-status uso-status-on"><span className="led led-p4" /> Principal</div>}
              />
            )}
            {dados.cloudflare && (
              <Provedor
                titulo="FALLBACK"
                subtitulo="Cloudflare"
                dados={dados.cloudflare}
                marcaGB={dados.cloudflare.limiteGB}
                statusChip={
                  <div className={`uso-status uso-status-${dados.cloudflare.turnAtivo ? 'on' : 'off'}`}>
                    {dados.cloudflare.turnAtivo
                      ? <><span className="led led-p4" /> Disponível</>
                      : `Pausado — passou de ${fmt(dados.cloudflare.limiteGB, 0)} GB, volta mês que vem`}
                  </div>
                }
              />
            )}
            {!dados.oracle && (
              <p className="uso-legenda">
                Consumo da VM Oracle indisponível — confere se o setup-stats.sh rodou na VM e se a
                porta TCP 9091 tá aberta na Security List.
              </p>
            )}
            <p className="hint">
              Só as conexões que caem em relay consomem — P2P direto é sempre 0.{' '}
              <a className="uso-link" href="/">← voltar pra Telinha</a>
            </p>
          </>
        )}
      </main>
    </div>
  )
}
