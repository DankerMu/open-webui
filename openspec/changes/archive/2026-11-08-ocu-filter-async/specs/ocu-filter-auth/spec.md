## ADDED Requirements

### Requirement: Filter never blocks the host event loop

The Computer Use filter's `inlet` and `outlet` SHALL be coroutines, and SHALL perform the `/system-prompt` HTTP exchange off the event loop. A request that OCU makes back into Open WebUI while that exchange is in flight can therefore be served. The prompt cache SHALL be read and written only on the event-loop thread. A fetch that completes after the prompt cache was cleared, whether by an authority change or by a rejection, SHALL NOT be cached, SHALL NOT clear the cache, and SHALL NOT fall back to an entry captured before that clear.

#### Scenario: Callback during the prompt fetch

- **WHEN** `inlet` runs on Open WebUI's event loop and OCU `/system-prompt` calls back into an endpoint served by that same loop before answering
- **THEN** the callback is served, `inlet` injects the returned prompt, and the call completes without waiting for any timeout

#### Scenario: Outlet cache miss during a callback

- **WHEN** `outlet` runs with no cached prompt for the chat and OCU `/system-prompt` calls back into the same loop before answering
- **THEN** the callback is served and `outlet` decorates current-chat file links with the returned public base URL

#### Scenario: Authority changes during a fetch

- **WHEN** the internal token changes while a prompt fetch is in flight, and the fetch then succeeds
- **THEN** the fetched prompt is returned for that request but not cached

#### Scenario: Late rejection after a newer clear

- **WHEN** a fetch in flight under an old authority is rejected with 401 after the cache was cleared and refilled under the new authority
- **THEN** the call returns no prompt and the entries stored under the new authority stay cached

#### Scenario: Same-authority clear during a fetch

- **WHEN** another request's 401 clears the cache while a fetch with the same authority is in flight, and that fetch then succeeds
- **THEN** the fetched prompt is returned for that request but not cached

#### Scenario: Concurrent requests

- **WHEN** twenty `inlet` calls for different saved chats run concurrently with a cache limit of five
- **THEN** every call injects the prompt, none raises, and the cache holds at most five entries
