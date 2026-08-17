import { useEffect, useState } from 'react'

const fmt = (n, d = 1) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: d })

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

function diaLabel(iso) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
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
            <span className="logo-emoji">📊</span>
            <h1>Consumo</h1>
          </div>
          <p className="tagline">Uso do relay (TURN) da Telinha — área do dono.</p>
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
  const mes = MESES[new Date().getMonth()]
  const pct = dados ? Math.min(100, (dados.totalGB / dados.gratisGB) * 100) : 0
  const nivel = pct >= 100 ? 'critico' : pct >= 80 ? 'alerta' : 'ok'
  const maxDia = dados?.dias.length ? Math.max(...dados.dias.map((d) => d.gb)) : 0

  return (
    <div className="uso">
      <header className="topbar">
        <div className="brand">
          <span className="logo-emoji small">📺</span>
          <strong>Telinha</strong>
          <span className="uso-sub">/ consumo do relay</span>
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
            <section className="uso-tile">
              <div>
                <div className="uso-numero">
                  {fmt(dados.totalGB)} <small>GB</small>
                </div>
                <div className="uso-legenda">
                  de {fmt(dados.gratisGB, 0)} GB grátis · {mes}
                </div>
              </div>
              <div className={`uso-status uso-status-${dados.turnAtivo ? 'on' : 'off'}`}>
                {dados.turnAtivo
                  ? '✅ Relay ativo'
                  : `⛔ Relay pausado — passou de ${fmt(dados.limiteGB, 0)} GB, volta mês que vem`}
              </div>
            </section>

            <section className="uso-medidor" aria-label={`Consumo: ${fmt(pct)}% do limite gratuito`}>
              <div className="uso-barra">
                <div className={`uso-fill uso-fill-${nivel}`} style={{ width: `${pct}%` }} />
                <div className="uso-marca" style={{ left: `${(dados.limiteGB / dados.gratisGB) * 100}%` }} title={`desligamento automático: ${fmt(dados.limiteGB, 0)} GB`} />
              </div>
              <div className="uso-escala">
                <span>0</span>
                <span>{fmt(pct)}% usado · desliga sozinho em {fmt(dados.limiteGB, 0)} GB</span>
                <span>{fmt(dados.gratisGB, 0)} GB</span>
              </div>
            </section>

            <section>
              <h2 className="uso-h2">Consumo por dia</h2>
              {dados.dias.length === 0 ? (
                <p className="uso-legenda">Nenhum consumo este mês ainda — todo mundo conectando direto no P2P. 🎉</p>
              ) : (
                <>
                  <div className="uso-chart" role="img" aria-label="Gráfico de barras do consumo diário em GB">
                    {dados.dias.map((d) => (
                      <div className="uso-col" key={d.date} data-tip={`${diaLabel(d.date)} · ${fmt(d.gb)} GB`}>
                        {d.gb === maxDia && maxDia > 0 && (
                          <span className="uso-col-label">{fmt(d.gb)}</span>
                        )}
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

            <p className="hint">
              Só as conexões que caem no relay (TURN) consomem — P2P direto é sempre 0.{' '}
              <a className="uso-link" href="/">← voltar pra Telinha</a>
            </p>
          </>
        )}
      </main>
    </div>
  )
}
