import { useState } from 'react'

export default function Home({ initialCode, onEnter }) {
  const [name, setName] = useState(localStorage.getItem('telinha:nick') || '')
  const [code, setCode] = useState(initialCode || '')
  const [mode, setMode] = useState(initialCode ? 'join' : 'create') // create | join

  function submit(e) {
    e.preventDefault()
    const nick = name.trim()
    if (!nick) return
    localStorage.setItem('telinha:nick', nick)
    if (mode === 'create') {
      onEnter(nick, null)
    } else {
      const c = code.trim().toUpperCase()
      if (!c) return
      onEnter(nick, c)
    }
  }

  return (
    <div className="home">
      <div className="home-card">
        <div className="logo">
          <span className="logo-emoji">📺</span>
          <h1>Telinha</h1>
        </div>
        <p className="tagline">Compartilhe a tela com os amigos. Sem cadastro, direto do navegador.</p>

        <div className="mode-switch">
          <button
            type="button"
            className={mode === 'create' ? 'active' : ''}
            onClick={() => setMode('create')}
          >
            Criar sala
          </button>
          <button
            type="button"
            className={mode === 'join' ? 'active' : ''}
            onClick={() => setMode('join')}
          >
            Entrar numa sala
          </button>
        </div>

        <form onSubmit={submit}>
          <label>
            Seu nick
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex.: Felipe"
              maxLength={24}
              autoFocus
              required
            />
          </label>

          {mode === 'join' && (
            <label>
              Código da sala
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ex.: X7K2PQ"
                maxLength={10}
                className="code-input"
                required
              />
            </label>
          )}

          <button type="submit" className="btn-primary">
            {mode === 'create' ? 'Criar sala e entrar' : 'Entrar na sala'}
          </button>
        </form>

        <p className="hint">
          O vídeo vai direto de um PC pro outro (P2P) — nada fica salvo em servidor.
        </p>
      </div>
    </div>
  )
}
