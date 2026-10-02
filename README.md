# Tino's Songless frontend

`npm i && npm run dev` (proxies /api and /ws to localhost:8080).

Assumed contract details (adjust in `src/services/api.ts` / `src/features/game/useGame.ts` if your Go API differs):

- `POST /api/games` `{displayName}` and `POST /api/games/join` `{code,displayName}` -> `{gameId,playerId,token}`; errors `{code,message}` with codes `room_not_found|room_full|game_started|game_finished|name_taken|round_closed`.
- Bearer token on REST; WebSocket at `/ws?gameId=&token=`; optional numeric `seq` on events for dedupe.
- `GET /api/games/:id` -> `{game,round?,result?,answered?,myGuess?,myClipSeconds?,mySkipped?,ended?,scores?,serverTime?}` (used on refresh/reconnect; must never contain answers before the round result).
- The host-selected round duration is the time players get to guess; it does not change the 30-second audio reveal cap.
- `POST /api/games/:id/guess` receives `{roundId,guess,clipSeconds,skipped}`. The server must score correct answers linearly from 12,500 points at 0.1 seconds to a 1,000-point floor at 30 seconds, and award 0 for missed or skipped rounds. Round-result player entries may include `clipSeconds` and `skipped`; do not include submitted guess text in client-facing results.
- Lobby events carry `data.game`; `round_result.data` = `{roundNumber,song,players,scores?,nextRoundAt?}`.
- Play Again = host calls `POST /start` on a finished game.
- Only `{gameId,playerId,token}` is kept in sessionStorage so refreshes rejoin; all game state comes from the server.
