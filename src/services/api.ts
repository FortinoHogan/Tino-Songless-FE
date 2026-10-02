import type { GuessAck, Score, Session, Snapshot, SongSuggestion } from '../types/game'
const BASE = import.meta.env.VITE_API_URL ?? ''
export const WS_URL =
  import.meta.env.VITE_WS_URL ??
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    m: string,
  ) {
    super(m)
  }
}
const MSG: Record<string, string> = {
  room_not_found: 'No game with that code.',
  room_full: 'That room is full.',
  game_started: 'That game already started.',
  game_finished: 'That game has finished.',
  name_taken: 'That name is taken in this room.',
  round_closed: "Time's up — too late!",
  token_expired: 'Audio expired.',
  server_error: 'Server error. Try again.',
}
let token: string | undefined
export const setToken = (t?: string) => {
  token = t
}
const auth = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {})
async function req<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  let r: Response
  try {
    r = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the server.')
  }
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { code?: string; message?: string }
    const c = b.code ?? (r.status === 404 ? 'room_not_found' : 'server_error')
    throw new ApiError(r.status, c, MSG[c] ?? b.message ?? 'Something went wrong.')
  }
  return (r.status === 204 ? undefined : await r.json()) as T
}
export const createGame = (displayName: string) => req<Session>('/api/games', { displayName })
export const joinGame = (code: string, displayName: string) =>
  req<Session>('/api/games/join', { code, displayName })
export const getGame = (id: string) => req<Snapshot>(`/api/games/${id}`)
export const startGame = (id: string) => req<void>(`/api/games/${id}/start`, {})
export const sendGuess = (
  id: string,
  roundId: string,
  guess: string,
  clipSeconds: number,
  skipped = false,
) => req<GuessAck>(`/api/games/${id}/guess`, { roundId, guess, clipSeconds, skipped })
export const updateSettings = (id: string, roundSeconds: number) =>
  req<void>(`/api/games/${id}/settings`, { roundSeconds })
export const searchSongs = (q: string) =>
  req<SongSuggestion[]>(`/api/songs/search?q=${encodeURIComponent(q)}`)
export const getResult = (id: string) => req<{ scores: Score[] }>(`/api/games/${id}/result`)
export async function fetchAudio(
  id: string,
  audioToken: string,
  signal: AbortSignal,
): Promise<Blob> {
  const r = await fetch(`${BASE}/api/games/${id}/audio/${encodeURIComponent(audioToken)}`, {
    headers: auth(),
    signal,
  })
  if (!r.ok)
    throw new ApiError(
      r.status,
      r.status === 401 || r.status === 403 || r.status === 410 ? 'token_expired' : 'audio_error',
      'Audio failed to load.',
    )
  return r.blob()
}
