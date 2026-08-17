import { useState } from 'react'
import Home from './Home.jsx'
import Room from './Room.jsx'
import Uso from './Uso.jsx'

function codeFromUrl() {
  const m = window.location.pathname.match(/^\/sala\/([A-Za-z0-9]{4,10})/)
  return m ? m[1].toUpperCase() : null
}

export default function App() {
  // { name, roomCode } — roomCode null significa "criar sala nova"
  const [session, setSession] = useState(null)
  const [urlCode] = useState(codeFromUrl)

  if (window.location.pathname.startsWith('/uso')) {
    return <Uso />
  }
  if (!session) {
    return <Home initialCode={urlCode} onEnter={(name, roomCode) => setSession({ name, roomCode })} />
  }
  return (
    <Room
      name={session.name}
      roomCode={session.roomCode}
      onLeave={() => {
        window.history.pushState({}, '', '/')
        setSession(null)
      }}
    />
  )
}
