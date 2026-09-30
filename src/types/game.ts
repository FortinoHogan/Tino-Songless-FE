export interface User {
  id: string
  name: string
}
export interface Session {
  gameId: string
  playerId: string
  token: string
}
export interface GamePlayer extends User {
  isHost: boolean
  connected: boolean
  score: number
}
export interface Game {
  gameId: string
  code: string
  status: 'lobby' | 'playing' | 'finished'
  totalRounds: number
  roundSeconds?: number
  hostId: string
  players: GamePlayer[]
}
// Active round: deliberately NO song metadata of any kind.
export interface Round {
  roundId: string
  roundNumber: number
  totalRounds: number
  audioToken: string
  duration: number
  startedAt: string
  serverTime?: string
}
export interface Guess {
  playerId: string
  name: string
  guess: string
  correct: boolean
  points: number
}
export interface Score {
  playerId: string
  name: string
  score: number
}
export interface SongReveal {
  title: string
  artist: string
  album?: string
  artworkUrl?: string
}
export interface RoundResult {
  roundNumber: number
  song: SongReveal
  players: Guess[]
  scores?: Score[]
  nextRoundAt?: string
}
export interface WebSocketEvent {
  type: string
  seq?: number
  data: unknown
}
export interface Snapshot {
  game: Game
  round?: Round
  result?: RoundResult
  answered?: string[]
  myGuess?: string
  wrong?: number
  ended?: boolean
  scores?: Score[]
  serverTime?: string
}
export interface GuessAck {
  correct: boolean
  points?: number
  wrong: number
}
export interface SongSuggestion {
  title: string
  artist: string
}
