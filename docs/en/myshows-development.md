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

Async callers capture profile, authorization token and a generation before the
request. Profile changes, logout and disabling advance the generation, preventing
late responses from restoring cards even after switching A → B → A or restoring
the same token. Cache data can be incomplete (for example an NP page); the
existing successful fresh API result replaces it. Errors do not clear data;
successful empty lists do. Malformed nonempty lists are not interpreted as empty.

The regression suite covers these boundaries and sorting. It does not prove
Android TvProvider persistence, provider permissions, launcher visibility,
deep-link navigation or playback on real hardware; those need APK/device checks.
