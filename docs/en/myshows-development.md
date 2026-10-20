---
layout: default
lang: en
body_class: prose
title: MyShows development — Lampa Plugins
---

## Generate and verify MyShows releases

The production source is `myshows.full.js`. Node.js 18 or newer and the locked
development dependency Terser **5.44.0** generate the other delivered files:

```sh
npm ci --ignore-scripts
npm run build:myshows
npm test
npm run check:myshows
node --check myshows.full.js
node --check myshows.lite.js
node --check myshows.js
git diff --check
```

Commit source and both generated variants together when shipping a release.
`myshows.lite.js` removes comments and preserves readable names, log calls, and
their argument side effects. `myshows.js` uses standard compression/mangling.
Both target ES5. Generation never uses `drop_console`. The check command fails
if either variant differs from the deterministic output of the locked generator.
These tools build only MyShows and do not alter the other plugins.

`npm test` executes the complete source and both generated variants independently
in a Node VM. It drives production startup, registered settings, profile events,
public API and existing network callbacks. DOM, Lampa environment, timers,
network requests and Android native bridge are boundary doubles; plugin internals
are not replaced or exported for testing. Fixtures contain neutral test data.

## Watched discovery contract

`myshows_hide_watched` is device-local and profile-local, default off; it is not
an NMSync setting. `Api.main/category/list` wrappers accept only known CUB/TMDB
discovery requests/rows. The original request's query (including an empty query)
and source/path determine scope. Personal, search, calendar and custom rows are
preserved. Verified built-in CUB `collections/<numeric-id>` rows and their More
lists are included. Shared source responses, row objects and result arrays are
never
modified. The native grid's owned `request.page` is advanced to the last consumed
source page before delivery because native Pagination ignores `response.page`
and increments its own request cursor. All other request fields stay unchanged.

Two authenticated reads initialize a separate in-memory index:
`profile.WatchedMovies` and `profile.Shows`. It never imports the existing
`myshowsWatched`/badge caches or fuzzy TMDB mapping guesses. A unique literal
title + exact year + media type match is required. Two conflicting explicit
original titles veto a localized-title match; a missing original still permits
the unique title/year fallback. For a show with
`watching`/`finished` status, `shows.GetById({showId,withEpisodes:true})` and
`profile.Episodes({showId})` must prove every released episode watched, with at
least one released episode. Invalid/missing dates or IDs fail open. Calendar-valid
ISO dates/timestamps with explicit timezone are supported (including `+0300`).

At most two shows run detail/history reads concurrently (four transport reads).
Repeated cards coalesce by MyShows show ID. Details are cached for the current
catalogue index, not persisted. A new main/category invocation or list page 1
reconfirms the index. Profile/token changes and successful mutations invalidate
proofs; pending replies retain profile, token and generation guards including
profile ABA. The request's assigned native activity handle binds the target
even while Activity.push is still creating it before updating the active stack.
Synchronous completion/error callbacks defer once until that push finishes;
later navigation or a replaced handle cannot revive them. Activity/request
fields prevent stale cursor
writes/repaints after navigation. Recent native catalogue activities are refreshed
through their own activity handles, including archived pages after playback.
No refresh is triggered by index completion, avoiding a refresh/load cycle.

Main/category initial callbacks and returned continuations are wrapped. Empty
filtered batches continue asynchronously; explicit repeated source cursors stop
draining, with a 100-batch guard for sources omitting cursors. List pages drain
asynchronously until visible cards or real exhaustion, preserving source totals.
Repeated source page numbers terminate; later source errors use the original
error callback. Duplicate source callbacks are ignored. The plugin initialization
guard also prevents two queued copies of this build from registering listeners
and settings twice. It does not remove a legacy plugin already running before
the guarded build; registry migration remains a separate delivery step.

The VM suite covers source/batch continuations, the native grid cursor contract,
exceptions, immutable payloads, strict Unicode/type/year matching, completeness,
new releases, request errors, empty success, bounded detail work, settings,
profile ABA/token changes, successful mark/undo and archived activity refresh.
These checks do not prove live v3 response shape, DOM focus, CORS or physical TV
behaviour. Browser/device acceptance remains necessary.

## Android TV channel contract

The profile/device switch is `myshows_android_tv`, default off. No additional
authentication, MyShows server, favorites storage or periodic API poll is added.
Android bridge support requires both methods:

```js
AndroidJS.publishPluginChannel(JSON.stringify({
    id: 'myshows',
    title: 'MyShows',
    items: [{id: '1399', source: 'tmdb', type: 'tv', name: 'Example show',
        poster_path: '/example.jpg', overview: 'Next: S01/E02 · Unwatched: 3'}]
}));
AndroidJS.clearPluginChannel('myshows');
```

Both return boolean: `true` acknowledges validation/enqueue, not a completed
TvProvider write. Native channel identity is `plugin:myshows`. Display and order
belong to the launcher; clicking opens the existing Lampa full show activity.
Android implementations own validation, provider availability and ordered writes.

The plugin serializes new cards with an explicit metadata allowlist and TMDB/TV
identity; no credentials or arbitrary plugin properties cross this interface.
Initial cache publication is integrated with `initMyShowsCaches`; fresh results
and local episode changes are notified through `saveCacheToServer` only for
`unwatched_serials`. Publication does not wait for cache-write success. The
calendar's one-shot `_fireUnwatchedSaved` remains independent.

Local episode changes patch the latest accepted channel snapshot, preserving
unrelated shows if an NP cache read supplies only one page. A completed show is
removed only from that snapshot. Undoing completion can encounter an absent
cached card; only this cache-miss case requests the existing authoritative
MyShows list again. Its original generation remains attached to the request.

Async callers capture profile, authorization token and a generation before the
request. Profile changes, logout and disabling advance the generation, preventing
late responses from restoring cards even after switching A → B → A or restoring
the same token. Cache data can be incomplete (for example an NP page); the
existing successful fresh API result replaces it. Errors do not clear data;
successful empty lists do. Malformed nonempty lists are not interpreted as empty.

The regression suite covers these boundaries and sorting. It does not prove
Android TvProvider persistence, provider permissions, launcher visibility,
deep-link navigation or playback on real hardware; those need APK/device checks.

## Relevance history contract

The opt-in `relevance` mode uses `profile.Episodes({showId})` and the maximum
valid `watchDate` in its episode summaries. The public MyShows Swagger schema
(`https://api.myshows.me/shared/doc/swagger.json`, API version 2.0.2) documents
`watchDate` as a string without a format. The plugin already uses this method
through its existing v3 transport; an authenticated v3 watch-date response has
not been checked live. Parsing accepts calendar-valid ISO dates and ISO timestamps
with an explicit timezone, and ignores ambiguous or future values.

History is device-local, profile-scoped, cached for one hour, and deduplicated
with at most two requests in flight. Failed reads keep the known date and retry
on the next relevance refresh after one minute. There is no new periodic poll.
Cached and fresh list callbacks return exactly once with the known-date order
without waiting for history. Background history completion reorders existing
DOM cards and republishes the channel under the original profile generation.
Successful empty arrays clear the date. The newest released unwatched episode
comes from existing MyShows episode metadata; known release dates survive NP
cards that omit it. Local successful marks invalidate older pending history
responses. Undo invalidates the history cache. Profile/token/generation guards
reject responses after logout or profile ABA. A changed authorization token,
including automatic renewal and synchronized replacement, clears local history
and the channel. Without verified account identity this prevents reusing another
account's private dates in the same Lampa profile. The next ordinary list refresh
restores current data. The Android metadata allowlist
stays unchanged.

VM tests cover merged ordering, alphabetical ties, malformed/future dates,
list/channel parity, cache reuse and restart, NP missing dates, bounded requests,
errors, empty histories, successful mark/undo, and profile/logout guards. They do
not prove the authorized live v3 date format or ordering on a physical TV.
