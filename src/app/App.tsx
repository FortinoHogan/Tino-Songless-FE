import { Final, Landing, Lobby, Play, Result, Shell, Starting } from '../features/game/screens'
import { useGame } from '../features/game/useGame'

export default function App() {
  const { s, a, audio } = useGame()
  const banner =
    s.me && s.conn !== 'open' ? (
      <div className="fixed inset-x-0 top-0 z-10 bg-amber-400 p-2 text-center text-sm font-bold text-black">
        Disconnected — reconnecting…
      </div>
    ) : null
  const toast =
    s.error && s.phase !== 'landing' && s.phase !== 'error' ? (
      <div
        className="fixed inset-x-4 bottom-4 z-10 mx-auto max-w-md animate-pop rounded-2xl bg-red-500 p-4 text-center font-bold"
        onClick={a.dismiss}
      >
        {s.error}
      </div>
    ) : null
  let body
  switch (s.phase) {
    case 'lobby':
      body = <Lobby s={s} a={a} />
      break
    case 'starting':
      body = <Starting />
      break
    case 'playing':
    case 'submitting':
      body = s.round ? <Play s={s} a={a} audio={audio} round={s.round} /> : <Starting />
      break
    case 'roundResult':
      body = <Result s={s} />
      break
    case 'leaderboard':
    case 'finished':
      body = <Final s={s} a={a} />
      break
    case 'error':
      body = (
        <Shell>
          <h1>Tino's Songless</h1>
          <p className="err">{s.error ?? 'Something went wrong'}</p>
          <button className="start-btn" onClick={a.leave}>
            Back to start
          </button>
        </Shell>
      )
      break
    default:
      body = <Landing s={s} a={a} />
  }
  return (
    <>
      {banner}
      {body}
      {toast}
    </>
  )
}
