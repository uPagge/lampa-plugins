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

`myshows_watched_mode` is a native select with `show`, `mark`, `hide` values,
device/profile-local and excluded from NMSync. If absent, legacy
`myshows_hide_watched` true/string true migrates to `hide`; all other legacy
values migrate to `show`. Explicit new values take priority. The unscoped mode
key is a native UI mirror refreshed on profile changes. The independent
`myshows_android_tv` trigger retains its explicit false default, string-safe
mirror and local callback handling, avoiding native `undefined` value labels.

`tests/fixtures/lampa-settings-contract.js` contains ten unchanged function
extracts from the supplied real client: Storage get/set, Params registration,
binding/value rendering and SettingsApi registration. Its header records the
snapshot SHA-256. The suite executes those functions with the complete plugin,
asserting the rendered Нет/Да text for fresh defaults, actual native toggles,
cold restart and profile changes. Environment dependencies/DOM translation are
boundary doubles; the Storage fallback and Params label logic are not mirrored.

Mark reuses the exact positive watched classifier and copies `_myshows_watched`
epoch/profile/generation metadata only onto confirmed cards. It preserves cards,
rows, totals, source pages and request cursor and never drains hidden pages.
The existing document `visible` capture hook cleans reused DOM before applying
`.myshows-watched-card` and `.myshows-watched-check` (✓) inside `.card__view`.
Only `.card__img` is dimmed; `.focus`/`:focus` restores its filter. Invalidating
mode/profile/account/status proofs removes current decorations. Metadata has no
token, and stale epoch/profile/generation checks cannot reapply it.

Opening another eligible catalogue resets the ready index and retires marks on
retained screens. Their native ActivitySlide `refresh()` is queued after the
synchronous create-before-push phase, excluding the currently loading handle.
This sets the native deferred refresh flag, so Back refreshes/reclassifies the
retained screen instead of starting its old component with rejected metadata.
The one-tick boundary avoids scheduling a replacement while the previous screen
is still reported active. Unchanged-library, newly released unwatched episode,
profile/account switch and native cursor cases exercise unchanged ActivitySlide
start/refresh/runRefresh functions in `lampa-activity-lifecycle-contract.js`.

The verified built-in `recomend_watch` row has no URL/source and its More uses
`Recomends.page` outside Api.list. During a scoped synchronous ContentRows.call,
a temporary Array.prototype.forEach observer finds the named native registry
row. It restores the exact prior prototype BEFORE iterating native/custom rows,
wraps only that actual row factory, and permanently stops discovery once found.
The original factory retains its own visibility, shuffle, insertion index,
callback, and Router More metadata; copied payload gets private provenance.
No initializer or timer is duplicated. Disabled/absent registries can be found
on a later enabled call; finally restores the prototype on every throw/no-match.
The exported native Recomends.page uses the same guards/classifier/pagination
wrapper. This is tied to the inspected 3.3.4 contract, not arbitrary future rows.
The initially considered copied adapter was rejected because it reordered
later custom rows sharing index1; actual native registration order is preserved.

`tests/fixtures/lampa-recommendations-contract.js` contains unchanged native
ContentRows and Recomends functions from the same hashed source snapshot. Tests
cover the actual registered URL-less row/More path, colliding indices, unrelated
custom rows/arrays, disabled-to-enabled discovery, prototype restoration and
single initialization alongside the complete plugin.

`Api.main/category/list` wrappers accept only known CUB/TMDB
discovery requests/rows. Nonempty queries (including whitespace) remain excluded;
the exact empty query added by the native category_full route is not search
provenance. Source/path still determine scope. Personal, search, calendar and custom rows are
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
draining, with a 100-batch guard for sources omitting cursors. In hide mode,
paginated batches refill asynchronously to at least their original result count
or source exhaustion. Every visible card from consumed pages is emitted, including
overshoot; no extra buffer or truncated tail is created. The owned list/More
cursor advances to the last consumed source page. Source totals stay unchanged.
Repeated source page numbers terminate. An error after partial success returns
the partial batch with a retry notice; errors before any visible result retain
the original error callback. Duplicate source callbacks are ignored.

Known pageable main/category rows use the captured original Api.list producer
with their verified URL/source/page, preserving their original More metadata
and original row.page. Native Router uses row.page to start a NEW full catalogue,
so its page must not become the row refill's internal consumed-page cursor.
The new grid starts on original page 1 and owns its own refill/next-page cursor.
Unchanged native Router.call/get, category_full route and Arrays helpers in
`lampa-router-contract.js` exercise this exact route-to-Api.list boundary.
Unsupported/unpageable rows are filtered without an invented loader. The native
URL-less recommendation row preserves its original shuffled sample and appends
canonical Recomends.page results starting at page 1, using movie for main and
the native category media otherwise. Stable type/id identities from the whole
sample, including hidden cards, prevent sampled/canonical overlap. Unknown or
invalid IDs are preserved without title-based deduplication. Because the sample
is random, its row.page remains original and is not advertised as a consumed
canonical cursor; More still starts its own canonical pagination normally.
Show/mark never refill or change their source cursors.

The plugin initialization
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
