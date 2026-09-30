import { useCallback, useEffect, useReducer, useRef, useState, type MutableRefObject } from 'react'
import * as api from '../../services/api'
import { Socket, type ConnStatus } from '../../services/ws'
import type {
  Game,
  Round,
  RoundResult,
  Score,
  Session,
  Snapshot,
  SongSuggestion,
  WebSocketEvent,
} from '../../types/game'

export type Phase =
  | 'landing'
  | 'lobby'
  | 'starting'
  | 'playing'
  | 'submitting'
  | 'roundResult'
  | 'leaderboard'
  | 'finished'
  | 'error'
export type AudioStatus = 'idle' | 'loading' | 'ready' | 'blocked' | 'error'
export interface State {
  phase: Phase
  me?: Session
  game?: Game
  round?: Round
  answered: string[]
  myGuess?: string
  myPoints?: number
  wrong: number
  ended: boolean
  result?: RoundResult
  results: RoundResult[]
  scores: Score[]
  conn: ConnStatus
  error?: string
  fatal?: boolean
  audio: AudioStatus
  offset: number
}
export interface Actions {
  create(n: string): void
  join(c: string, n: string): void
  start(): void
  submit(g: string): void
  leave(): void
  dismiss(): void
  retryAudio(): void
  setDuration(seconds: number): void
  search(q: string): Promise<SongSuggestion[]>
}
export interface AudioCtl {
  el: MutableRefObject<HTMLAudioElement | null>
  volume: number
  setVolume(v: number): void
}
type Action = { t: 'set'; p: Partial<State> } | { t: 'ev'; e: WebSocketEvent } | { t: 'reset' }
const init: State = {
  phase: 'landing',
  wrong: 0,
  answered: [],
  ended: false,
  results: [],
  scores: [],
  conn: 'closed',
  audio: 'idle',
  offset: 0,
}
const KEY = 'sb-session' // credentials only, never game state

function reduce(s: State, a: Action): State {
  if (a.t === 'set') return { ...s, ...a.p }
  if (a.t === 'reset') return init
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = a.e.data as any
  switch (a.e.type) {
    case 'lobby_updated':
    case 'player_joined':
    case 'player_left':
      return d?.game ? { ...s, game: d.game as Game } : s
    case 'game_started':
      return {
        ...s,
        phase: 'starting',
        round: undefined,
        result: undefined,
        results: [],
        scores: [],
        answered: [],
        myGuess: undefined,
        myPoints: undefined,
        wrong: 0,
        game: s.game && { ...s.game, status: 'playing', totalRounds: d.totalRounds },
      }
    case 'round_started': {
      const r = d as Round
      if (s.round && (s.round.roundId === r.roundId || r.roundNumber < s.round.roundNumber))
        return s // duplicate / stale
      return {
        ...s,
        phase: 'playing',
        round: r,
        answered: [],
        myGuess: undefined,
        myPoints: undefined,
        wrong: 0,
        ended: false,
        result: undefined,
        audio: 'loading',
        offset: r.serverTime ? Date.parse(r.serverTime) - Date.now() : s.offset,
      }
    }
    case 'player_submitted':
      return s.answered.includes(d.playerId) ? s : { ...s, answered: [...s.answered, d.playerId] }
    case 'round_ended':
      return s.round && (!d?.roundId || d.roundId === s.round.roundId) ? { ...s, ended: true } : s
    case 'round_result': {
      const r = d as RoundResult
      if (s.results.some((x) => x.roundNumber === r.roundNumber)) return s
      return {
        ...s,
        phase: 'roundResult',
        ended: true,
        result: r,
        results: [...s.results, r],
        scores: r.scores ?? s.scores,
      }
    }
    case 'leaderboard_updated':
      return { ...s, scores: d.scores as Score[] }
    case 'game_finished':
      return {
        ...s,
        phase: 'finished',
        ended: true,
        scores: (d?.scores as Score[] | undefined) ?? s.scores,
      }
    case 'error':
      return { ...s, error: d?.message ?? 'Server error' }
  }
  return s
}

const fromSnapshot = (g: Snapshot): Partial<State> => ({
  game: g.game,
  round: g.round,
  result: g.result,
  answered: g.answered ?? [],
  myGuess: g.myGuess,
  wrong: g.wrong ?? 0,
  ended: !!g.ended,
  scores: g.scores ?? [],
  offset: g.serverTime ? Date.parse(g.serverTime) - Date.now() : 0,
  phase:
    g.game.status === 'finished'
      ? 'finished'
      : g.result && g.ended
        ? 'roundResult'
        : g.round && !g.ended
          ? 'playing'
          : g.game.status === 'playing'
            ? 'starting'
            : 'lobby',
})

export function useGame(): { s: State; a: Actions; audio: AudioCtl } {
  const [s, dispatch] = useReducer(reduce, init)
  const [audioTry, setAudioTry] = useState(0)
  const audioEl = useRef<HTMLAudioElement | null>(null)
  const [volume, setVol] = useState(() => {
    const v = localStorage.getItem('sb-volume')
    return v === null || !Number.isFinite(Number(v)) ? 70 : Number(v)
  })
  const volRef = useRef(volume)
  volRef.current = volume
  const setVolume = useCallback((v: number) => {
    setVol(v)
    localStorage.setItem('sb-volume', String(v))
    if (audioEl.current) audioEl.current.volume = v / 100
  }, [])
  const set = useCallback((p: Partial<State>) => dispatch({ t: 'set', p }), [])
  const fail = useCallback(
    (e: unknown, fatal = false) =>
      set({
        error: e instanceof Error ? e.message : 'Something went wrong.',
        ...(fatal ? { phase: 'error' as Phase, fatal } : {}),
      }),
    [set],
  )

  const sync = useCallback(
    async (id: string) => {
      // rehydrate after refresh / reconnect / expired token
      try {
        set(fromSnapshot(await api.getGame(id)))
      } catch (e) {
        if (e instanceof api.ApiError && e.status === 404) {
          sessionStorage.removeItem(KEY)
          api.setToken()
          dispatch({ t: 'reset' })
          fail(e)
        }
      }
    },
    [set, fail],
  )

  const enter = useCallback(
    (me: Session) => {
      sessionStorage.setItem(KEY, JSON.stringify(me))
      api.setToken(me.token)
      set({ me, error: undefined })
    },
    [set],
  )

  useEffect(() => {
    const raw = sessionStorage.getItem(KEY)
    if (raw) {
      try {
        enter(JSON.parse(raw) as Session)
      } catch {
        sessionStorage.removeItem(KEY)
      }
    }
  }, [enter])

  const gameId = s.me?.gameId,
    token = s.me?.token
  useEffect(() => {
    if (!gameId || !token) return
    const sock = new Socket(
      `${api.WS_URL}/ws/games/${encodeURIComponent(gameId)}?token=${encodeURIComponent(token)}`,
      (e) => dispatch({ t: 'ev', e }),
      (c) => {
        set({ conn: c })
        if (c === 'open') void sync(gameId)
      },
    )
    sock.connect()
    return () => sock.close()
  }, [gameId, token, sync, set])

  // Audio: fetched with the token, played from an in-memory blob URL (no filename/path exposed).
  const roundId = s.round?.roundId,
    audioToken = s.round?.audioToken
  const live = (s.phase === 'playing' || s.phase === 'submitting') && !s.ended
  useEffect(() => {
    if (!live || !gameId || !roundId || !audioToken) return
    const ctl = new AbortController()
    let el: HTMLAudioElement | undefined
    let url: string | undefined
    set({ audio: 'loading' })
    api
      .fetchAudio(gameId, audioToken, ctl.signal)
      .then((b) => {
        url = URL.createObjectURL(b)
        el = new Audio(url)
        el.volume = volRef.current / 100
        audioEl.current = el
        el.onerror = () => set({ audio: 'error' })
        return el.play().then(
          () => set({ audio: 'ready' }),
          () => set({ audio: 'blocked' }),
        )
      })
      .catch((e) => {
        if (ctl.signal.aborted) return
        set({ audio: 'error' })
        if (e instanceof api.ApiError && e.code === 'token_expired') void sync(gameId)
      })
    return () => {
      ctl.abort()
      audioEl.current = null
      el?.pause()
      if (url) URL.revokeObjectURL(url)
    }
  }, [live, gameId, roundId, audioToken, audioTry, set, sync])

  const a: Actions = {
    create: (n) => {
      api.createGame(n).then(enter).catch(fail)
    },
    join: (c, n) => {
      api.joinGame(c.trim().toUpperCase(), n).then(enter).catch(fail)
    },
    start: () => {
      if (gameId) api.startGame(gameId).catch(fail)
    },
    submit: (g) => {
      if (!gameId || !s.round) return
      const rid = s.round.roundId
      set({ phase: 'submitting' })
      api
        .sendGuess(gameId, rid, g)
        .then((ack) =>
          set(
            ack.correct
              ? { phase: 'playing', myGuess: g, myPoints: ack.points, wrong: ack.wrong }
              : { phase: 'playing', wrong: ack.wrong },
          ),
        )
        .catch((e) => {
          set({ phase: 'playing' })
          fail(e)
        })
    },
    leave: () => {
      sessionStorage.removeItem(KEY)
      api.setToken()
      dispatch({ t: 'reset' })
    },
    dismiss: () => set({ error: undefined }),
    retryAudio: () => setAudioTry((n) => n + 1),
    setDuration: (n) => {
      if (gameId) api.updateSettings(gameId, n).catch(fail)
    },
    search: (q) => api.searchSongs(q),
  }
  return { s, a, audio: { el: audioEl, volume, setVolume } }
}
