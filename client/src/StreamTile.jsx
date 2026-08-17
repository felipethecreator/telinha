import { useEffect, useRef, useState } from 'react'
import { IconSound, IconMute, IconFull } from './icons.jsx'

const CONN_MSG = {
  connecting: 'CONECTANDO…',
  new: 'CONECTANDO…',
  disconnected: 'Sinal instável, tentando recuperar…',
  failed: 'Não deu pra conectar — a rede de quem transmite (ou a sua) está bloqueando o P2P. Um servidor TURN resolve isso.',
}

export default function StreamTile({ tile, connState, focused, onFocusToggle }) {
  const videoRef = useRef(null)
  const [needsClick, setNeedsClick] = useState(false)
  const [muted, setMuted] = useState(tile.mine) // sua própria tela fica muda (evita eco)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = tile.stream
    video.play().catch(() => setNeedsClick(true)) // autoplay bloqueado → pede um clique
  }, [tile.stream])

  function unlock() {
    const video = videoRef.current
    if (!video) return
    video.play().then(() => setNeedsClick(false)).catch(() => {})
  }

  function fullscreen(e) {
    e.stopPropagation()
    videoRef.current?.requestFullscreen?.()
  }

  return (
    <div className={`tile ${focused ? 'focused' : ''}`} onClick={needsClick ? unlock : onFocusToggle}>
      <video ref={videoRef} autoPlay playsInline muted={muted} />
      <span className="tile-live" aria-hidden="true">AO VIVO</span>
      {CONN_MSG[connState] && (
        <div className="tile-overlay conn">
          <span>{CONN_MSG[connState]}</span>
        </div>
      )}
      {needsClick && !CONN_MSG[connState] && (
        <div className="tile-overlay">
          <span>▶ Clique para assistir</span>
        </div>
      )}
      <div className="tile-bar" onClick={(e) => e.stopPropagation()}>
        <span className="tile-name">{tile.name}</span>
        <span className="tile-actions">
          {!tile.mine && (
            <button
              title={muted ? 'Ativar som' : 'Mutar'}
              onClick={() => setMuted((m) => !m)}
            >
              {muted ? <IconMute /> : <IconSound />}
            </button>
          )}
          <button title="Tela cheia" onClick={fullscreen}>
            <IconFull />
          </button>
        </span>
      </div>
    </div>
  )
}
