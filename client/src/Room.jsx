import { useEffect, useRef, useState, useCallback } from 'react'
import StreamTile from './StreamTile.jsx'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export default function Room({ name, roomCode, onLeave }) {
  const wsRef = useRef(null)
  const myIdRef = useRef(null)
  const sendPCs = useRef(new Map()) // viewerId -> RTCPeerConnection (quando EU compartilho)
  const recvPCs = useRef(new Map()) // sharerId -> { pc, pending: [candidates] }
  const myStreamRef = useRef(null)
  const sharingRef = useRef(false)

  const [status, setStatus] = useState('connecting') // connecting | joined | error | closed
  const [errorMsg, setErrorMsg] = useState('')
  const [room, setRoom] = useState(roomCode)
  const [peers, setPeers] = useState({}) // id -> { name, sharing }
  const [remoteStreams, setRemoteStreams] = useState({}) // sharerId -> MediaStream
  const [myStream, setMyStream] = useState(null)
  const [focusId, setFocusId] = useState(null) // tile em destaque
  const [copied, setCopied] = useState(false)

  const signal = useCallback((to, channel, data) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'signal', to, channel, data }))
    }
  }, [])

  // ---------- lado de quem COMPARTILHA ----------
  const createSendPC = useCallback(
    async (viewerId) => {
      const stream = myStreamRef.current
      if (!stream) return
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      sendPCs.current.set(viewerId, pc)
      for (const track of stream.getTracks()) pc.addTrack(track, stream)
      // por padrão o WebRTC limita o vídeo a ~2,5 Mbps, o que embaça a tela;
      // aqui liberamos até 8 Mbps e 60fps pra ficar nítido pra quem assiste
      const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video')
      if (videoSender) {
        try {
          const params = videoSender.getParameters()
          if (!params.encodings?.length) params.encodings = [{}]
          params.encodings[0].maxBitrate = 8_000_000
          params.encodings[0].maxFramerate = 60
          await videoSender.setParameters(params)
        } catch (err) {
          console.warn('não deu pra ajustar o bitrate:', err)
        }
      }
      pc.onicecandidate = (e) => {
        if (e.candidate) signal(viewerId, `share:${myIdRef.current}`, { candidate: e.candidate })
      }
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      signal(viewerId, `share:${myIdRef.current}`, { sdp: pc.localDescription })
    },
    [signal],
  )

  const stopShare = useCallback(() => {
    if (!sharingRef.current) return
    sharingRef.current = false
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'share-stop' }))
    for (const pc of sendPCs.current.values()) pc.close()
    sendPCs.current.clear()
    myStreamRef.current?.getTracks().forEach((t) => t.stop())
    myStreamRef.current = null
    setMyStream(null)
    setFocusId((f) => (f === 'me' ? null : f))
  }, [])

  const startShare = useCallback(async () => {
    if (sharingRef.current) return
    let stream
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 60 } },
        audio: true, // áudio do jogo junto (aba/sistema, quando o navegador permite)
      })
    } catch {
      return // usuário cancelou o seletor
    }
    const videoTrack = stream.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.contentHint = 'motion' // prioriza fluidez (bom pra gameplay)
      videoTrack.onended = () => stopShare() // botão "parar" do próprio navegador
    }
    myStreamRef.current = stream
    sharingRef.current = true
    setMyStream(stream)
    wsRef.current?.send(JSON.stringify({ type: 'share-start' }))
    setPeers((cur) => {
      for (const id of Object.keys(cur)) createSendPC(id)
      return cur
    })
  }, [createSendPC, stopShare])

  // ---------- lado de quem ASSISTE ----------
  const getRecvEntry = useCallback(
    (sharerId) => {
      let entry = recvPCs.current.get(sharerId)
      if (entry) return entry
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      entry = { pc, pending: [] }
      recvPCs.current.set(sharerId, entry)
      pc.onicecandidate = (e) => {
        if (e.candidate) signal(sharerId, `share:${sharerId}`, { candidate: e.candidate })
      }
      pc.ontrack = (e) => {
        const stream = e.streams[0]
        if (stream) setRemoteStreams((cur) => ({ ...cur, [sharerId]: stream }))
      }
      return entry
    },
    [signal],
  )

  const closeRecv = useCallback((sharerId) => {
    const entry = recvPCs.current.get(sharerId)
    if (entry) {
      entry.pc.close()
      recvPCs.current.delete(sharerId)
    }
    setRemoteStreams((cur) => {
      const { [sharerId]: _gone, ...rest } = cur
      return rest
    })
    setFocusId((f) => (f === sharerId ? null : f))
  }, [])

  // ---------- roteamento de sinalização ----------
  const handleSignal = useCallback(
    async (from, channel, data) => {
      const myId = myIdRef.current
      const sharerId = channel.startsWith('share:') ? channel.slice(6) : null
      if (!sharerId) return

      if (sharerId === myId) {
        // resposta/candidate de um espectador para a MINHA transmissão
        const pc = sendPCs.current.get(from)
        if (!pc) return
        try {
          if (data.sdp) await pc.setRemoteDescription(data.sdp)
          else if (data.candidate) await pc.addIceCandidate(data.candidate)
        } catch (err) {
          console.warn('signal (send) falhou:', err)
        }
      } else {
        // oferta/candidate de alguém que está transmitindo pra mim
        const entry = getRecvEntry(sharerId)
        try {
          if (data.sdp) {
            await entry.pc.setRemoteDescription(data.sdp)
            const answer = await entry.pc.createAnswer()
            await entry.pc.setLocalDescription(answer)
            signal(sharerId, channel, { sdp: entry.pc.localDescription })
            // aplica candidates que chegaram antes da oferta
            for (const c of entry.pending) await entry.pc.addIceCandidate(c).catch(() => {})
            entry.pending = []
          } else if (data.candidate) {
            if (entry.pc.remoteDescription) await entry.pc.addIceCandidate(data.candidate)
            else entry.pending.push(data.candidate)
          }
        } catch (err) {
          console.warn('signal (recv) falhou:', err)
        }
      }
    },
    [getRecvEntry, signal],
  )

  // ---------- conexão WebSocket ----------
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss://' : 'ws://'
    const ws = new WebSocket(`${proto}${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      if (roomCode) ws.send(JSON.stringify({ type: 'join', room: roomCode, name }))
      else ws.send(JSON.stringify({ type: 'create-room' }))
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      switch (msg.type) {
        case 'room-created':
          ws.send(JSON.stringify({ type: 'join', room: msg.room, name }))
          break
        case 'joined': {
          myIdRef.current = msg.you
          setRoom(msg.room)
          setStatus('joined')
          window.history.pushState({}, '', `/sala/${msg.room}`)
          const map = {}
          for (const p of msg.peers) map[p.id] = { name: p.name, sharing: p.sharing }
          setPeers(map)
          break
        }
        case 'peer-joined':
          setPeers((cur) => ({ ...cur, [msg.id]: { name: msg.name, sharing: false } }))
          if (sharingRef.current) createSendPC(msg.id)
          break
        case 'peer-left': {
          setPeers((cur) => {
            const { [msg.id]: _gone, ...rest } = cur
            return rest
          })
          const pc = sendPCs.current.get(msg.id)
          if (pc) {
            pc.close()
            sendPCs.current.delete(msg.id)
          }
          closeRecv(msg.id)
          break
        }
        case 'share-start':
          setPeers((cur) =>
            cur[msg.id] ? { ...cur, [msg.id]: { ...cur[msg.id], sharing: true } } : cur,
          )
          break
        case 'share-stop':
          setPeers((cur) =>
            cur[msg.id] ? { ...cur, [msg.id]: { ...cur[msg.id], sharing: false } } : cur,
          )
          closeRecv(msg.id)
          break
        case 'signal':
          handleSignal(msg.from, msg.channel, msg.data)
          break
        case 'error':
          setErrorMsg(msg.message)
          setStatus('error')
          ws.close()
          break
      }
    }

    ws.onclose = () => {
      setStatus((s) => (s === 'joined' ? 'closed' : s))
    }

    return () => {
      for (const pc of sendPCs.current.values()) pc.close()
      sendPCs.current.clear()
      for (const { pc } of recvPCs.current.values()) pc.close()
      recvPCs.current.clear()
      myStreamRef.current?.getTracks().forEach((t) => t.stop())
      myStreamRef.current = null
      sharingRef.current = false
      ws.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/sala/${room}`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (status === 'error') {
    return (
      <div className="center-screen">
        <div className="notice">
          <h2>Ops!</h2>
          <p>{errorMsg}</p>
          <button className="btn-primary" onClick={onLeave}>Voltar</button>
        </div>
      </div>
    )
  }
  if (status === 'closed') {
    return (
      <div className="center-screen">
        <div className="notice">
          <h2>Conexão perdida</h2>
          <p>A conexão com o servidor caiu.</p>
          <button className="btn-primary" onClick={() => window.location.reload()}>Reconectar</button>
        </div>
      </div>
    )
  }
  if (status === 'connecting') {
    return (
      <div className="center-screen">
        <div className="notice"><p className="pulse">Conectando…</p></div>
      </div>
    )
  }

  const tiles = []
  if (myStream) tiles.push({ id: 'me', name: `${name} (você)`, stream: myStream, mine: true })
  for (const [id, stream] of Object.entries(remoteStreams)) {
    tiles.push({ id, name: peers[id]?.name || '???', stream, mine: false })
  }
  const peerList = Object.entries(peers)

  return (
    <div className="room">
      <header className="topbar">
        <div className="brand">
          <span className="logo-emoji small">📺</span>
          <strong>Telinha</strong>
        </div>
        <button className="room-code" onClick={copyLink} title="Copiar link da sala">
          sala <b>{room}</b> {copied ? '✓ copiado!' : '🔗'}
        </button>
        <div className="topbar-right">
          {myStream ? (
            <button className="btn-danger" onClick={stopShare}>■ Parar de compartilhar</button>
          ) : (
            <button className="btn-primary" onClick={startShare}>🖥️ Compartilhar minha tela</button>
          )}
          <button className="btn-ghost" onClick={onLeave}>Sair</button>
        </div>
      </header>

      <main className={`stage ${focusId ? 'has-focus' : ''}`}>
        {tiles.length === 0 ? (
          <div className="empty-stage">
            <p className="big">Ninguém está compartilhando ainda</p>
            <p>
              Clique em <b>Compartilhar minha tela</b> lá em cima, ou espere um amigo começar.
              {peerList.length === 0 && (
                <>
                  {' '}Convide a galera mandando o link da sala — é só clicar no código{' '}
                  <b>{room}</b> ali em cima pra copiar.
                </>
              )}
            </p>
          </div>
        ) : (
          <div className={`grid grid-${Math.min(tiles.length, 4)}`}>
            {tiles.map((t) => (
              <StreamTile
                key={t.id}
                tile={t}
                focused={focusId === t.id}
                onFocusToggle={() => setFocusId((f) => (f === t.id ? null : t.id))}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="peerbar">
        <span className="peer me">🟣 {name} (você){myStream ? ' · transmitindo' : ''}</span>
        {peerList.map(([id, p]) => (
          <span key={id} className="peer">
            🟢 {p.name}
            {p.sharing ? ' · transmitindo' : ''}
          </span>
        ))}
        {peerList.length === 0 && <span className="peer waiting">esperando os amiguinhos…</span>}
      </footer>
    </div>
  )
}
