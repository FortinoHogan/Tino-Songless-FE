import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { Actions, AudioCtl, State } from './useGame'
import type { Round, Score, SongSuggestion } from '../../types/game'

export const Shell = ({ children }: { children: ReactNode }) => (
  <div className="page">
    <div className="card">{children}</div>
  </div>
)
const Head = ({ sub }: { sub: string }) => (
  <>
    <h1>Song Battle</h1>
    <p className="sub">{sub}</p>
  </>
)

function useLeft(end: number | undefined, offset: number) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (end === undefined) return
    const t = () => setN(Math.max(0, (end - Date.now() - offset) / 1000))
    t()
    const i = setInterval(t, 100)
    return () => clearInterval(i)
  }, [end, offset])
  return n
}
const board = (s: State): Score[] =>
  s.scores.length
    ? s.scores
    : (s.game?.players ?? []).map((p) => ({ playerId: p.id, name: p.name, score: p.score }))
function Scores({ list, me }: { list: Score[]; me?: string }) {
  return (
    <div>
      {[...list]
        .sort((x, y) => y.score - x.score)
        .map((p, i) => (
          <div key={p.playerId} className={`row ${p.playerId === me ? 'me' : ''}`}>
            <span>
              {i + 1}. {p.name}
            </span>
            <b>{p.score}</b>
          </div>
        ))}
    </div>
  )
}

export function Landing({ s, a }: { s: State; a: Actions }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('join') ?? '')
  const ok = name.trim().length > 0
  return (
    <Shell>
      <Head sub="Name the song before your friends do." />
      <div className="label">Your name</div>
      <input
        className="field"
        placeholder="Display name"
        maxLength={20}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="start-btn" disabled={!ok} onClick={() => a.create(name.trim())}>
        Create game
      </button>
      <div className="label mid">or join a friend's game</div>
      <input
        className="field code"
        placeholder="CODE"
        maxLength={8}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <button
        className="secondary wide"
        style={{ marginTop: 10, padding: 13 }}
        disabled={!ok || code.trim().length < 3}
        onClick={() => a.join(code, name.trim())}
      >
        Join game
      </button>
      {s.error && <p className="err">{s.error}</p>}
    </Shell>
  )
}

export function Lobby({ s, a }: { s: State; a: Actions }) {
  const g = s.game
  const [copied, setCopied] = useState(false)
  if (!g)
    return (
      <Shell>
        <p className="dim">Loading…</p>
      </Shell>
    )
  const host = g.hostId === s.me?.playerId
  const copy = () => {
    void navigator.clipboard.writeText(`${location.origin}/?join=${g.code}`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <Shell>
      <Head sub="Waiting for players…" />
      <div className="label" style={{ textAlign: 'center' }}>
        Room code
      </div>
      <div className="code-big">{g.code}</div>
      {g.players.map((p) => (
        <div
          key={p.id}
          className={`row ${p.id === s.me?.playerId ? 'me' : ''}`}
          style={{ opacity: p.connected ? 1 : 0.45 }}
        >
          <span>{p.name}</span>
          {p.id === g.hostId && <small>host</small>}
        </div>
      ))}
      <div className="label" style={{ margin: '16px 0 8px' }}>
        Guess time limit
      </div>
      {host ? (
        <select
          className="field"
          value={g.roundSeconds ?? 10}
          onChange={(e) => a.setDuration(Number(e.target.value))}
        >
          {[10, 15, 20, 30, 45, 60].map((n) => (
            <option key={n} value={n}>
              {n} seconds to guess
            </option>
          ))}
        </select>
      ) : (
        <div className="row">
          <span>{g.roundSeconds ?? 10} seconds to guess per song</span>
        </div>
      )}
      <div className="actions">
        <button className="secondary" onClick={copy}>
          {copied ? 'Copied ✓' : 'Copy invite link'}
        </button>
        <button className="secondary" onClick={a.leave}>
          Leave
        </button>
      </div>
      {host ? (
        <button className="start-btn" onClick={a.start}>
          Start game
        </button>
      ) : (
        <p className="dim">Waiting for the host to start…</p>
      )}
    </Shell>
  )
}

export const Starting = () => (
  <Shell>
    <Head sub="Get ready…" />
    <p className="dim">Loading the first clip…</p>
  </Shell>
)

const REVEAL_SECONDS = 30
const REVEAL_PILLS = [0.1, 0.5, 1, 3] as const
const MAX_REVEAL_PILL = REVEAL_PILLS[REVEAL_PILLS.length - 1]

export function Play({
  s,
  a,
  audio,
  round,
}: {
  s: State
  a: Actions
  audio: AudioCtl
  round: Round
}) {
  const left = useLeft(Date.parse(round.startedAt) + round.duration * 1000, s.offset)
  const [pos, setPos] = useState(0)
  const [clipSeconds, setClipSeconds] = useState(0.1)
  const [playing, setPlaying] = useState(false)
  const [g, setG] = useState('')
  const [sugg, setSugg] = useState<SongSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(-1)
  const reqId = useRef(0)

  const limit = Math.min(clipSeconds, REVEAL_SECONDS)
  const scoreProgress = Math.max(0, (limit - 0.1) / (REVEAL_SECONDS - 0.1))
  const worth = Math.round(12500 - scoreProgress * 11500)
  const locked = !!s.myGuess || s.mySkipped || s.ended || left <= 0 || s.phase === 'submitting'

  const playClip = () => {
    const el = audio.el.current
    if (!el) return
    el.currentTime = 0
    void el.play()
  }

  useEffect(() => {
    setClipSeconds(0.1)
    setPos(0)
  }, [round.roundId])

  useEffect(() => {
    setG('')
    setSugg([])
  }, [round.roundId])

  useEffect(() => {
    // Wrong guess clears the box but does not reveal more audio automatically.
    if (s.wrong > 0) {
      setG('')
      setSugg([])
      playClip()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.wrong])

  useEffect(() => {
    // Clip length is enforced client-side; the server scores by time remaining and wrong guesses.
    const i = setInterval(() => {
      const el = audio.el.current
      if (!el) {
        setPlaying(false)
        return
      }
      if (!el.paused && el.currentTime >= limit) el.pause()
      setPos(el.currentTime)
      setPlaying(!el.paused)
    }, 50)
    return () => clearInterval(i)
  }, [audio.el, limit])

  useEffect(() => {
    // Autocomplete: debounce the query, ignore stale responses.
    const q = g.trim()
    if (locked || q.length < 2) {
      setSugg([])
      return
    }
    const id = ++reqId.current
    const t = setTimeout(() => {
      a.search(q)
        .then((r) => {
          if (id === reqId.current) setSugg(r)
        })
        .catch(() => { })
    }, 180)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, locked])

  const toggle = () => {
    const el = audio.el.current
    if (!el) {
      a.retryAudio()
      return
    }
    if (!el.paused) el.pause()
    else playClip()
  }

  const revealTo = (seconds: number) => {
    setClipSeconds((current) => Math.max(current, Math.min(REVEAL_SECONDS, seconds)))
    playClip()
  }

  const revealMore = () => {
    setClipSeconds((current) => Math.min(REVEAL_SECONDS, current + 1))
    playClip()
  }

  const pick = (x: SongSuggestion) => {
    setG(x.title)
    setSugg([])
    setOpen(false)
    setHi(-1)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!sugg.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHi((hi + 1) % sugg.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((hi - 1 + sugg.length) % sugg.length)
    } else if (e.key === 'Enter' && open && hi >= 0) {
      e.preventDefault()
      pick(sugg[hi])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const solved = s.answered.length
  const total = s.game?.players.length ?? 0

  return (
    <Shell>
      <Head sub="Name the song. Reveal more audio when you need it." />
      <div className="stage">
        <div className="clip-label">
          Clip <b>{limit.toFixed(1)}</b>s · <b>{Math.ceil(left)}</b>s left · worth <b>{worth}</b> pts
        </div>
        <button className="play-btn" onClick={toggle} aria-label="Play clip">
          <svg viewBox="0 0 24 24">
            {playing ? <path d="M6 5h4v14H6zM14 5h4v14h-4z" /> : <path d="M8 5v14l11-7z" />}
          </svg>
        </button>
        <div className="track-bar">
          <div className="track-limit" style={{ width: `${(limit / REVEAL_SECONDS) * 100}%` }} />
          <div
            className="track-fill"
            style={{ width: `${Math.min(100, (pos / REVEAL_SECONDS) * 100)}%` }}
          />
        </div>
        <div className="ticks">
          <span>0s</span>
          <span className="tick done">{limit.toFixed(1)}s unlocked</span>
          <span>{REVEAL_SECONDS}s</span>
        </div>
        <div className="reveal-controls">
          <div className="reveal-steps" aria-label="Audio reveal amount">
            {REVEAL_PILLS.map((step) => {
              const pillLocked =
                locked || limit > MAX_REVEAL_PILL + 0.001 || step < limit - 0.001
              return (
                <button
                  key={step}
                  className={`step-pill ${Math.abs(limit - step) < 0.001 ? 'selected' : ''}`}
                  type="button"
                  aria-pressed={Math.abs(limit - step) < 0.001}
                  disabled={pillLocked}
                  onClick={() => revealTo(step)}
                >
                  {step}s
                </button>
              )
            })}
          </div>
          <div className="actions">
            <button
              className="secondary"
              type="button"
              disabled={locked || limit >= REVEAL_SECONDS}
              onClick={revealMore}
            >
              Reveal +1s
            </button>
            <button
              className="secondary"
              type="button"
              disabled={locked}
              onClick={() => a.skip(limit)}
            >
              Skip song
            </button>
          </div>
        </div>
        <div className="volume-row">
          <svg viewBox="0 0 24 24">
            <path d="M3 10v4h4l5 5V5L7 10H3z" />
            {audio.volume > 0 && (
              <path d="M16.5 12c0-1.77-.77-3.29-2-4.24v8.48c1.23-.95 2-2.47 2-4.24z" />
            )}
            {audio.volume > 50 && (
              <path d="M14.5 4.14v2.06c2.89.86 5 3.54 5 6.8s-2.11 5.94-5 6.8v2.06c4.01-.91 7-4.49 7-8.86s-2.99-7.95-7-8.86z" />
            )}
          </svg>
          <input
            className="vol"
            type="range"
            min={0}
            max={100}
            value={audio.volume}
            aria-label="Volume"
            onChange={(e) => audio.setVolume(Number(e.target.value))}
          />
        </div>
        {s.audio === 'error' && <p className="err">Audio failed to load. Press play to retry.</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (g.trim() && !locked) a.submit(g.trim(), limit)
        }}
      >
        <div className="combo">
          <input
            className="field"
            autoFocus
            disabled={locked}
            placeholder="Type a title or artist…"
            autoComplete="off"
            value={s.myGuess ?? g}
            onChange={(e) => {
              setG(e.target.value)
              setOpen(true)
              setHi(-1)
            }}
            onKeyDown={onKeyDown}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onFocus={() => setOpen(true)}
          />
          {open && !locked && sugg.length > 0 && (
            <ul className="suggest">
              {sugg.map((x, i) => (
                <li
                  key={`${x.title}-${x.artist}`}
                  className={i === hi ? 'hi' : ''}
                  onMouseDown={() => pick(x)}
                >
                  <span>{x.title}</span>
                  <small>{x.artist}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="actions">
          <button className="start-btn" style={{ margin: 0 }} disabled={locked || !g.trim()}>
            Guess
          </button>
        </div>
      </form>

      {s.myGuess ? (
        <div className="feedback">
          Correct! +{s.myPoints ?? 0} pts · {solved}/{total} solved
        </div>
      ) : s.mySkipped ? (
        <div className="feedback bad">Skipped · 0 pts</div>
      ) : s.wrong > 0 ? (
        <div className="feedback bad">
          Not it · {solved}/{total} solved
        </div>
      ) : null}

      <div className="footer-row">
        <span>
          Song {round.roundNumber} of {round.totalRounds}
        </span>
        <span>Score: {board(s).find((p) => p.playerId === s.me?.playerId)?.score ?? 0}</span>
      </div>
      <div style={{ marginTop: 14 }}>
        <Scores list={board(s)} me={s.me?.playerId} />
      </div>
    </Shell>
  )
}

const INTER_ROUND_CLIP_END = 30.1

export function Result({ s, audio, a }: { s: State; audio: AudioCtl; a?: Actions }) {
  const r = s.result
  const next = r?.nextRoundAt ? Date.parse(r.nextRoundAt) : undefined
  const left = useLeft(next, s.offset)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const el = audio.el.current
    if (!el) return
    const tick = () => {
      if (!el.paused && el.currentTime >= INTER_ROUND_CLIP_END) el.pause()
      setPlaying(!el.paused)
    }
    tick()
    const i = setInterval(tick, 100)
    el.addEventListener('play', tick)
    el.addEventListener('pause', tick)
    return () => {
      clearInterval(i)
      el.removeEventListener('play', tick)
      el.removeEventListener('pause', tick)
    }
  }, [audio.el, s.result?.roundNumber, s.audio])

  const togglePlayback = () => {
    const el = audio.el.current
    if (!el) return
    if (!el.paused) el.pause()
    else {
      if (el.currentTime >= INTER_ROUND_CLIP_END) el.currentTime = 0.1
      void el.play()
    }
  }

  if (!r) return null
  return (
    <Shell>
      <Head sub={`Song ${r.roundNumber} result`} />
      <div className="reveal">
        {r.song.artworkUrl && <img src={r.song.artworkUrl} alt="" />}
        <div className="t">{r.song.title}</div>
        <div className="a">
          {r.song.artist}
          {r.song.album ? ` · ${r.song.album}` : ''}
        </div>
      </div>
      {r.nextRoundAt && (
        <div className="actions" style={{ marginBottom: 12 }}>
          <button className="secondary" type="button" onClick={togglePlayback}>
            {playing ? 'Stop song' : 'Play song'}
          </button>
          {s.audio === 'error' && a && (
            <button className="secondary" type="button" onClick={a.retryAudio}>
              Reload audio
            </button>
          )}
        </div>
      )}
      {r.players.map((p) => {
        const own = p.playerId === s.me?.playerId
        const skipped = p.skipped || (own && s.mySkipped)
        const usedSeconds = p.clipSeconds ?? (own ? s.myClipSeconds : undefined)
        return (
          <div key={p.playerId} className={`row ${p.correct ? 'good' : 'bad'}`}>
            <span>
              {p.name}
              <small>
                {p.correct
                  ? usedSeconds === undefined
                    ? '—'
                    : `${usedSeconds.toFixed(1)}s`
                  : skipped
                    ? 'Skipped'
                    : 'Missed'}
              </small>
            </span>
            <b>{p.points}</b>
          </div>
        )
      })}
      <div className="label" style={{ margin: '16px 0 8px' }}>
        Scores
      </div>
      <Scores list={board(s)} me={s.me?.playerId} />
      {next && <p className="dim">Next song in {Math.ceil(left)}s</p>}
    </Shell>
  )
}

export function Final({ s, a }: { s: State; a: Actions }) {
  const list = [...board(s)].sort((x, y) => y.score - x.score)
  const me = s.me?.playerId
  const mine = s.results.flatMap((r) => r.players.filter((p) => p.playerId === me))
  const host = s.game?.hostId === me
  return (
    <Shell>
      <div className="end">
        <h1>Game over</h1>
        <span className="big">{list[0]?.name ?? '—'} wins</span>
      </div>
      <Scores list={list} me={me} />
      <p className="dim">
        You got {mine.filter((p) => p.correct).length}/{s.results.length} right ·{' '}
        {mine.reduce((t, p) => t + p.points, 0)} pts · rank #
        {Math.max(1, list.findIndex((p) => p.playerId === me) + 1)}
      </p>
      {host ? (
        <button className="start-btn" onClick={a.start}>
          Play again
        </button>
      ) : (
        <p className="dim">Waiting for the host to start another game…</p>
      )}
      <button className="secondary wide" style={{ marginTop: 10, padding: 12 }} onClick={a.leave}>
        Return to group
      </button>
    </Shell>
  )
}
