## ADDED Requirements

### Requirement: Filter never blocks the host event loop

The Computer Use filter's `inlet` and `outlet` SHALL be coroutines, and SHALL perform the `/system-prompt` HTTP exchange off the event loop. A request that OCU makes back into Open WebUI while that exchange is in flight can therefore be served. The prompt cache SHALL be read and written only on the event-loop thread. A fetch that completes after the credential or orchestrator authority changed SHALL NOT be cached.

#### Scenario: Callback during the prompt fetch

- **WHEN** `inlet` runs on Open WebUI's event loop and OCU `/system-prompt` calls back into an endpoint served by that same loop before answering
- **THEN** the callback is served, `inlet` injects the returned prompt, and the call completes without waiting for any timeout

#### Scenario: Concurrent requests

- **WHEN** twenty `inlet` calls for different saved chats run concurrently with a cache limit of five
- **THEN** every call injects the prompt, none raises, and the cache holds at most five entries
