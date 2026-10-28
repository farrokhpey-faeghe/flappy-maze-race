# Verification report

Date: October 28, 2026

## Executed successfully

`npm test`: **5 tests passed, 0 failed** on Node.js 24.22.1.

| Check | Evidence |
| --- | --- |
| Server starts | `npm start` binds the app on port 3000; independent test server also binds an ephemeral port |
| Main document serves | HTTP GET `/` returns 200 and the home-screen content |
| Health and course endpoints | GET `/health` returns 200; `/api/course` matches the shared simulation definition |
| Room creation and code joining | Separate real Socket.IO clients create and join the same room |
| Both players in lobby | Both clients receive a two-player snapshot |
| Third-player rejection | A third independent client receives a full-room error |
| Invalid/missing code handling | Invalid formatting and unknown room codes return explicit errors |
| Room isolation | A third client creates another room with independent membership |
| Ready gating | One ready player does not start the race; the second triggers countdown |
| Countdown synchronization | Both clients receive identical `startAt` and countdown phase; the server starts after that time |
| Independent input | One client's flap changes its own velocity without changing its rival's |
| Input validation | Replay sequence, invalid sequence, and too-fast flaps are rejected |
| Identical maze | Both join responses contain exactly equal course data |
| Course solvability | Legal one-button controller completes the entire actual course without a collision |
| Collision penalty | A wall hit increments crashes, resets to checkpoint, and holds for 750 ms |
| Rival progress preserved | Collision does not reset the other pilot |
| Live progress consistency | Both network clients receive matching rival crash/progress state during a full race |
| Legitimate finish | Network client's legal flap inputs complete a 60–120 second simulated race, without position-setting RPCs |
| Winner agreement | Both clients receive the same authoritative winner |
| Rematch | Both players ready again; race number increments, positions reset, and winner clears |
| Disconnect during countdown | Countdown cancels and lobby is restored |
| Refresh-equivalent reconnect | A new independent connection reclaims the same pilot with its token and preserves two-player membership |
| Duplicate token protection | A concurrent connection using an active pilot's token is rejected |
| Disconnect during race | After 30 seconds, remaining pilot wins by forfeit |
| Room cleanup | Leaving deletes empty rooms; 30-minute inactive rooms expire |
| Fair photo finish | Exactly simultaneous finishers receive a tie and equal finishing times |

The multiplayer integration test uses actual independent Socket.IO clients over WebSockets, not a second character inside one page. It runs a real Express/Socket.IO server and advances an injected server clock to test a full race quickly. The legal controller sends only flap sequence numbers. The production server has no test-specific speed, teleport, or finish endpoint.

Additional checks: JavaScript syntax checks passed; `npm audit --omit=dev` reported **0 vulnerabilities** at verification time.

## Not verified in a browser

The available cloud browser attempted to open the running app at `http://localhost:3000` and received `ERR_CONNECTION_REFUSED`: its localhost is separate from this workspace. This does not invalidate the successful HTTP/network integration tests, but **no browser rendering or playability pass is claimed**.

Still to verify manually after starting locally or deploying:

- Home, lobby, race, and results appearance on desktop and mobile.
- Space/click/touch response, focus handling, page-scroll prevention, responsive canvas sizing, and orientation changes.
- Invitation auto-join and clipboard copying in an actual browser.
- Browser refresh/session-storage behavior (server token reconnect is verified).
- Real audio playback, collision animation, prediction/interpolation under real network latency, and victory effects.
- Two human players on different internet networks using the actual deployed URL.
- Human difficulty and fun tuning; zero-crash automated solvability does not establish human difficulty.

## Deployment status

**Prepared, not deployed.** `render.yaml`, package lock, start script, environment example, and GitHub/Render instructions are included. No public URL is available yet. Rooms are intentionally in-memory and require a single server instance. Restart/deploy clears them.
