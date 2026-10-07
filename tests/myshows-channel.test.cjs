const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// DOM, network, timers and the Android bridge are environment boundaries.
// The complete shipped plugin executes unchanged; no private/test-only exports.
function launch(options = {}) {
    const data = new Map(Object.entries({myshows_server_cache_ver: 6,
        myshows_token_profile_a: 'test-token', myshows_android_tv_profile_a: 'true',
        myshows_calendar_profile_a: 'false', myshows_sort_order_profile_a: 'alphabet',
        myshows_unwatched_serials_profile_a: {shows: JSON.parse(JSON.stringify(options.cards || []))}, ...options.storage}));
    const handlers = {}, timers = [], requests = [], calls = [], params = [], notices = [];
    const bus = {follow(name, fn) { (handlers[name] ||= []).push(fn); }};
    const element = {length: 0, querySelector: () => null, querySelectorAll: () => [],
        classList: {add(){}, remove(){}, contains(){return false;}}, style: {},
        setAttribute(){}, removeAttribute(){}, addEventListener(){}, appendChild(){},
        append(){}, remove(){}};
    const jq = new Proxy({length: 0}, {get(target, key) {
        if (key in target) return target[key];
        if (key === 'get') return () => element;
        return () => jq;
    }});
    const document = {currentScript: null, body: element, head: element,
        documentElement: element, querySelector: () => null, querySelectorAll: () => [],
        createElement: () => ({...element}), addEventListener(){}, getElementById: () => null};
    let profile = 'a';
    const permit = {account: {profile: {get id() { return profile; }}}};
    function Reguest() {
        this.timeout = () => {};
        this.silent = this.native = (url, success, failure, body, config) => {
            requests.push({url, success, failure, body: body && JSON.parse(body), config});
        };
    }
    function Status(count) {
        const results = {};
        this.append = (key, value) => {results[key] = value;
            if (Object.keys(results).length === count) this.onComplite(results);};
    }
    const storage = {get: (key, fallback) => data.has(key) ? data.get(key) : fallback,
        set: (key, value) => data.set(key, value), field: () => 'tmdb'};
    const Lampa = {Storage: storage, Listener: bus, Account: {Permit: permit, listener: bus},
        Player: {listener: bus}, Platform: {is: () => false, tv: () => true},
        Reguest, Status, Api: {sources: {tmdb: {main(){}}, cub: {main(){}}},
            partNext(parts) { parts.forEach(fn => fn(() => {})); }},
        SettingsApi: {addComponent(){}, removeComponent(){}, addParam(p) {params.push(p);}},
        Activity: {active: () => null, push(){}, replace(){}},
        Utils: {addUrlComponent: (u) => u, hash: () => 'hash'},
        TMDB: {key: () => 'public-test-key', api: u => 'https://tmdb.invalid/' + u},
        Component: {add(){}}, Template: {add(){}}, Manifest: {},
        Timeline: {listener: bus}, Noty: {show: message => notices.push(message)},
        Lang: {translate: x => x, add(){}}};
    const AndroidJS = options.bridge === 'missing' ? undefined : options.bridge === 'old' ? {} : {
        publishPluginChannel(payload) {calls.push({publish: JSON.parse(payload)}); return options.reject !== true;},
        clearPluginChannel(id) {calls.push({clear: id}); return options.reject !== true;}
    };
    const context = {Lampa, AndroidJS, document, console: {log(){}, info(){}, warn(){}, error(){}, debug(){}},
        URLSearchParams, XMLHttpRequest: function() { this.open = this.setRequestHeader = this.send = () => {}; },
        localStorage: {getItem: key => data.has(key) ? JSON.stringify(data.get(key)) : null,
            removeItem: key => data.delete(key), setItem: (key,value) => data.set(key,value)},
        sessionStorage: {getItem: () => null, removeItem(){}, setItem(){}},
        $: () => jq, setTimeout(fn, delay) {const t = {fn, delay}; timers.push(t); return t;},
        clearTimeout(t) {const i = timers.indexOf(t); if(i >= 0) timers.splice(i,1);},
        location: {origin: 'https://example.invalid', reload(){}}, appready: true};
    if (options.np) {context.IS_NP = true;
        data.set('myshows_use_np_profile_a','true');
        data.set('base_url_numparser','https://np.invalid');
        data.set('numparser_api_key','test-np-token');}
    context.window = context;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', options.variant || process.env.MYSHOWS_VARIANT || 'myshows.full.js'), 'utf8'), context);
    const run = delay => {const i = timers.findIndex(t => t.delay === delay);
        assert.notEqual(i, -1, 'expected lifecycle timer ' + delay); timers.splice(i,1)[0].fn();};
    const setting = key => {const p = params.findLast(p => p.param.name === key);
        assert.ok(p, 'setting exists: ' + key); return p;};
    const changeProfile = id => {profile = id; (handlers.profile_select || []).forEach(fn => fn({}));};
    const answer = (method, response) => {const i = requests.findIndex(r => r.body?.method === method);
        assert.notEqual(i,-1,'requested ' + method); requests.splice(i,1)[0].success(response);};
    const answerUrl = (text, response) => {const i = requests.findIndex(r => r.url.includes(text));
        assert.notEqual(i,-1,'requested URL ' + text); requests.splice(i,1)[0].success(response);};
    return {context, data, calls, requests, timers, run, setting, params, answer, answerUrl, changeProfile, notices};
}

const cards = [
    {id: 2, name: 'Zulu', original_name: 'Zulu', poster_path: '/z.jpg', overview: 'Original',
        myshowsId: 20, remaining: 3, next_episode: 'S02/E04', watched_count: 3, total_count: 4,
        secret: 'must not leave', token: 'must not leave'},
    {id: 1, name: 'Alpha', original_name: 'Alpha', poster_path: '/a.jpg', myshowsId: 10,
        remaining: 1, watched_count: 1, total_count: 4}
];

test('startup uses sorted copies and excludes authentication/unrelated data', () => {
    const app = launch({cards}); app.run(50);
    const payload = app.calls.find(c => c.publish)?.publish;
    assert.ok(payload, 'enabled startup publishes cache');
    assert.deepEqual(payload.items.map(c => c.id), ['1','2']);
    assert.equal(payload.id, 'myshows'); assert.equal(payload.title, 'MyShows');
    assert.equal(payload.items[0].source,'tmdb'); assert.equal(payload.items[0].type,'tv');
    assert.equal(payload.items[1].poster_path,'/z.jpg');
    assert.match(payload.items[1].overview,/S02\/E04/); assert.match(payload.items[1].overview,/3/);
    assert.equal(payload.items[1].secret,undefined); assert.equal(payload.items[1].token,undefined);
    assert.equal(cards[0].source,undefined); assert.equal(cards[0].overview,'Original');
});
for (const bridge of ['missing','old']) test('unsupported ' + bridge + ' native keeps plugin usable', () => {
    const app = launch({cards, bridge}); app.run(50); app.run(2000);
    assert.equal(app.calls.length,0); assert.ok(app.context.MyShows.isLoggedIn());
    assert.match(app.setting('myshows_android_tv').field.description,/Android|Lampa/);
});
test('default opt-out never publishes', () => {
    const app = launch({cards, storage: {myshows_android_tv_profile_a: 'false'}}); app.run(50);
    assert.equal(app.calls.filter(c => c.publish).length,0);
});
test('enable publishes cache; disable clears immediately', () => {
    const app = launch({cards, storage: {myshows_android_tv_profile_a: 'false'}});
    app.run(2000); app.setting('myshows_android_tv').onChange(true);
    assert.equal(app.calls.filter(c => c.publish).length,1);
    app.setting('myshows_android_tv').onChange(false);
    assert.equal(app.calls.at(-1)?.clear,'myshows');
});
test('successful empty refresh clears but request errors preserve published data', () => {
    const app = launch({cards}); app.run(50); app.run(10000);
    const count = app.calls.length;
    app.answer('lists.EpisodesUnwatched',{error: {code: 500}});
    assert.equal(app.calls.length,count);
    app.context.MyShows.getUnwatchedShowsWithDetails(() => {}); app.run(10000);
    app.answer('lists.EpisodesUnwatched',{result: []});
    assert.equal(app.calls.at(-1)?.clear,'myshows');
});
test('profile ABA rejects the first profile generation response', () => {
    const app = launch({cards, storage: {myshows_token_profile_b: 'other',
        myshows_android_tv_profile_b:'true', myshows_calendar_profile_b:'false'}});
    app.run(50); app.run(10000);
    app.changeProfile('b'); app.changeProfile('a');
    assert.equal(app.calls.at(-1)?.clear,'myshows');
    const count = app.calls.length;
    app.answer('lists.EpisodesUnwatched',{result: []});
    assert.equal(app.calls.length,count);
});
test('logout rejects an in-flight response even after same token is restored', () => {
    const app = launch({cards}); app.run(50); app.run(2000); app.run(10000);
    app.params.find(p => p.field.name === 'Выйти из MyShows').onChange();
    assert.equal(app.calls.at(-1)?.clear,'myshows');
    app.data.set('myshows_token_profile_a','test-token');
    const count = app.calls.length;
    app.answer('lists.EpisodesUnwatched',{result: []});
    assert.equal(app.calls.length,count);
});
test('sort change republishes last successful list without API request', () => {
    const app = launch({cards}); app.run(50); app.run(2000);
    const count = app.requests.length;
    app.setting('myshows_sort_order').onChange('progress');
    assert.deepEqual(app.calls.at(-1)?.publish.items.map(c => c.id),['2','1']);
    app.setting('myshows_sort_order').onChange('unwatched_count');
    assert.deepEqual(app.calls.at(-1).publish.items.map(c => c.id),['1','2']);
    app.setting('myshows_sort_order').onChange('air_date');
    assert.equal(app.requests.length,count);
});
test('native rejection is reported and does not crash disable', () => {
    const app = launch({cards, reject: true}); app.run(50); app.run(2000);
    app.setting('myshows_android_tv').onChange(false);
    assert.equal(app.calls.at(-1).clear,'myshows'); assert.ok(app.notices.length > 0);
});

test('partial NP cache is replaced by the full fresh enriched list', () => {
    const app = launch({np: true}); app.run(50);
    const partial = {...cards[1], seasons: [{season_number: 1}], progress_marker:'1/4'};
    app.answerUrl('/myshows/watching?',{results: [partial], page:1, total_pages:2});
    assert.deepEqual(app.calls.at(-1)?.publish.items.map(c => c.id),['1']);
    app.run(10000);
    app.answer('lists.EpisodesUnwatched',{result: [
        {show: {id:10,title:'Alpha',titleOriginal:'Alpha',year:2020},episodes:[
            {id:101,seasonNumber:1,episodeNumber:2,shortName:'s01e02',airDate:'2020-01-02'}]},
        {show: {id:20,title:'Zulu',titleOriginal:'Zulu',year:2020},episodes:[
            {id:201,seasonNumber:2,episodeNumber:4,shortName:'s02e04',airDate:'2020-01-03'}]}
    ]});
    app.answerUrl('/myshows/watching?',{results:[partial]});
    app.answer('shows.GetById',{result:{episodes:[{id:101,seasonNumber:1,episodeNumber:2,airDate:'2020-01-02'}]}});
    app.answerUrl('search/tv',{results:[{id:2,name:'Zulu',original_name:'Zulu',first_air_date:'2020-01-01'}]});
    app.answerUrl('/tv/2?',{id:2,name:'Zulu',original_name:'Zulu',poster_path:'/z.jpg',first_air_date:'2020-01-01',seasons:[{season_number:2}]});
    app.answer('shows.GetById',{result:{episodes:[{id:201,seasonNumber:2,episodeNumber:4,airDate:'2020-01-03'}]}});
    assert.deepEqual(app.calls.at(-1).publish.items.map(c => c.id),['1','2']);
    assert.match(app.calls.at(-1).publish.items[1].overview,/S02\/E04/);
});

test('disable then enable rejects an old refresh even for the same profile', () => {
    const app = launch({cards}); app.run(50); app.run(2000); app.run(10000);
    app.setting('myshows_android_tv').onChange(false);
    app.setting('myshows_android_tv').onChange(true);
    const count = app.calls.length;
    app.answer('lists.EpisodesUnwatched',{result: []});
    assert.equal(app.calls.length,count);
    assert.deepEqual(app.calls.at(-1).publish.items.map(c => c.id),['1','2']);
});

module.exports = {launch, cards};
