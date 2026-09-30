# Tino's Songless frontend

`npm i && npm run dev` (proxies /api and /ws to localhost:8080).

Assumed contract details (adjust in `src/services/api.ts` / `src/features/game/useGame.ts` if your Go API differs):

- `POST /api/games` `{displayName}` and `POST /api/games/join` `{code,displayName}` -> `{gameId,playerId,token}`; errors `{code,message}` with codes `room_not_found|room_full|game_started|game_finished|name_taken|round_closed`.
- Bearer token on REST; WebSocket at `/ws?gameId=&token=`; optional numeric `seq` on events for dedupe.
- `GET /api/games/:id` -> `{game,round?,result?,answered?,myGuess?,ended?,scores?,serverTime?}` (used on refresh/reconnect; must never contain answers before the round result).
- Lobby events carry `data.game`; `round_result.data` = `{roundNumber,song,players,scores?,nextRoundAt?}`.
- Play Again = host calls `POST /start` on a finished game.
- Only `{gameId,playerId,token}` is kept in sessionStorage so refreshes rejoin; all game state comes from the server.
