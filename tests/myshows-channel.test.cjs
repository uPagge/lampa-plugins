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
    const handlers = {}, domHandlers = {}, timers = [], requests = [], calls = [], params = [], notices = [];
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
        createElement: () => ({...element}), addEventListener(name,fn){(domHandlers[name] ||= []).push(fn);}, getElementById: () => null};
    let profile = 'a', active = null;
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
            partNext(parts) { parts.forEach(fn => fn(() => {})); }, ...options.api},
        SettingsApi: {addComponent(){}, removeComponent(){}, addParam(p) {params.push(p);}},
        Activity: {active: () => active, push(){}, replace(){}, ...options.activity},
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
    if (options.sync) context.__NMSync = {patch(...args){(context.syncPatches ||= []).push(args);},
        register(name, keys, apply) {context.applySync = apply;context.syncKeys = keys;}};
    context.window = context;
    if (options.nativeActivity) {
        Lampa.Activity.own=component=>active?.activity?.component===component;
        vm.runInNewContext(fs.readFileSync(path.join(__dirname,'fixtures/lampa-activity-lifecycle-contract.js'),'utf8'),context);
    }
    if (options.nativeSettings) {
        // Real Storage/Params/SettingsApi functions are extracted unchanged from
        // the supplied framework snapshot, not reimplemented in a test helper.
        for(const [key,value] of data) {
            if(value === undefined) data.delete(key);
            else data.set(key,typeof value==='object'?JSON.stringify(value):String(value));
        }
        context.localStorage={getItem:key=>data.has(key)?data.get(key):null,
            setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
        vm.runInNewContext(fs.readFileSync(path.join(__dirname,'fixtures/lampa-settings-contract.js'),'utf8'),context);
        Lampa.Storage=context.__nativeSettingsContract.Storage;
        Lampa.SettingsApi.addParam=p=>{params.push(p);context.__nativeSettingsContract.addParam(p);};
    }
    if (options.recommendations) {
        Lampa.Arrays={isArray:Array.isArray,isObject:value=>value!==null&&typeof value==='object'&&!Array.isArray(value),
            insert:(array,index,item)=>array.splice(index,0,item),shuffle:array=>array};
        Lampa.Router={call(...args){(context.routerCalls ||= []).push(args);}};
        Lampa.Storage.cache=()=>[];
        vm.runInNewContext(fs.readFileSync(path.join(__dirname,'fixtures/lampa-recommendations-contract.js'),'utf8'),context);
        Object.assign(Lampa,context.__nativeRecommendationsContract);
        if(options.beforeRecommendations)options.beforeRecommendations(Lampa,context);
        Lampa.Recomends.init();
    }
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
    const emit = (name, data) => (handlers[name] || []).forEach(fn => fn(data));
    function settingElement(key) {
        const registered=setting(key),events={};
        const elem={label:'',data(name){return {name:key,type:registered.param.type==='select'?'select':'toggle',onChange:registered.onChange}[name];},
            attr(){},find(){return {text(value){elem.label=value;}};},
            on(name,fn){events[name]=fn;return elem;},each(fn){fn.call(elem);return elem;},eq(){return elem;}};
        elem.enter=()=>events['hover:enter']({target:elem});return elem;
    }
    const settingLabel=key=>{const elem=settingElement(key);context.__nativeSettingsContract.update(elem);return elem.label;};
    const toggleSetting=key=>{const elem=settingElement(key);context.__nativeSettingsContract.bind(elem);elem.enter();return elem.label;};
    const selectSetting=(key,value)=>{const elem=settingElement(key);context.__nativeSettingsContract.bind(elem);elem.enter();
        const item=context.__nativeSelect.items.find(item=>item.value===value);assert.ok(item,'native select option '+value);
        context.__nativeSelect.onSelect(item);return elem.label;};
    return {context, data, calls, requests, timers, run, setting, params, answer, answerUrl, changeProfile, notices, emit,settingLabel,toggleSetting,selectSetting,
        emitDom(name,target){(domHandlers[name] || []).forEach(fn=>fn({target}));},
        setActive(value) { active = value; }};
}

const cards = [
    {id: 2, name: 'Zulu', original_name: 'Zulu', poster_path: '/z.jpg', overview: 'Original',
        myshowsId: 20, remaining: 3, next_episode: 'S02/E04', watched_count: 3, total_count: 4,
        secret: 'must not leave', token: 'must not leave'},
    {id: 1, name: 'Alpha', original_name: 'Alpha', poster_path: '/a.jpg', myshowsId: 10,
        remaining: 1, watched_count: 1, total_count: 4}
];

const localTriggers=['myshows_android_tv'];
test('fresh profile renders Android TV trigger as Нет without syncing local preferences',()=>{
    const app=launch({nativeSettings:true,sync:true,storage:{myshows_android_tv_profile_a:undefined}});app.run(2000);
    for(const key of localTriggers) {
        assert.equal(app.settingLabel(key),'Нет',key+' has a visible native default');
        assert.equal(app.context.Lampa.Storage.get(key+'_profile_a'),false);
        assert.equal(app.context.syncKeys.includes(key),false,'local trigger not registered for synchronization');
    }
});
test('native Android TV string toggles and cold restart preserve Да and Нет',()=>{
    const app=launch({nativeSettings:true,sync:true,storage:{myshows_android_tv_profile_a:undefined}});app.run(2000);
    for(const key of localTriggers) {
        assert.equal(app.toggleSetting(key),'Да');
        assert.equal(app.context.Lampa.Storage.get(key+'_profile_a'),true);
        assert.equal((app.context.syncPatches || []).some(args=>args[1]===key+'_profile_a'),false);
    }
    const restart=launch({nativeSettings:true,storage:Object.fromEntries(app.data)});restart.run(2000);
    for(const key of localTriggers) {
        assert.equal(restart.settingLabel(key),'Да','restart uses stored profile preference');
        assert.equal(restart.toggleSetting(key),'Нет');
        assert.equal(restart.context.Lampa.Storage.get(key+'_profile_a'),false);
    }
});
test('native profile switch mirrors independent trigger labels and preserves existing string and boolean preferences',()=>{
    const app=launch({nativeSettings:true,storage:{
        myshows_hide_watched:'true',myshows_android_tv:'true',
        myshows_hide_watched_profile_a:true,myshows_android_tv_profile_a:'true',
        myshows_hide_watched_profile_b:'false',myshows_android_tv_profile_b:false,
        myshows_token_profile_b:'other',myshows_calendar_profile_b:'false'}});app.run(2000);
    for(const key of localTriggers)assert.equal(app.settingLabel(key),'Да');
    app.changeProfile('b');
    for(const key of localTriggers)assert.equal(app.settingLabel(key),'Нет');
    assert.equal(app.toggleSetting('myshows_android_tv'),'Да');
    app.changeProfile('a');
    for(const key of localTriggers)assert.equal(app.settingLabel(key),'Да');
    app.changeProfile('b');
    assert.equal(app.settingLabel('myshows_android_tv'),'Да');
});

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

test('episode mark and unmark republish next episode and completed show clears', () => {
    const card = {id:1, name:'Alpha', original_name:'Alpha', poster_path:'/a.jpg', myshowsId:10,
        remaining:2, watched_count:0, total_count:2, progress_marker:'0/2', next_episode:'S01/E01',
        unwatchedEpisodes:[{id:101},{id:102}]};
    const app = launch({cards:[card], storage:{
        myshows_serial_status_profile_a:{shows:[{id:10,title:'Alpha',titleOriginal:'Alpha',watchStatus:'watching'}]},
        myshows_hash_map:{
            '1:first':{tmdbId:1,episodeId:101,seasonNumber:1,episodeNumber:1,airDate:'2020-01-01',timestamp:Date.now()},
            '1:second':{tmdbId:1,episodeId:102,seasonNumber:1,episodeNumber:2,airDate:'2020-01-02',timestamp:Date.now()}
        }
    }});
    app.run(50); app.emit('full',{type:'complite',data:{movie:card}});
    app.emit('start',{card});
    app.emit('update',{data:{hash:'first',road:{percent:100}}});
    app.answer('manage.CheckEpisode',{result:true});
    assert.match(app.calls.at(-1).publish.items[0].overview,/S01\/E02/);
    assert.match(app.calls.at(-1).publish.items[0].overview,/Unwatched: 1/);
    app.emit('update',{data:{hash:'first',road:{percent:0}}});
    app.answer('manage.UnCheckEpisode',{result:true});
    assert.match(app.calls.at(-1).publish.items[0].overview,/S01\/E01/);
    assert.match(app.calls.at(-1).publish.items[0].overview,/Unwatched: 2/);
    app.emit('update',{data:{hash:'first',road:{percent:100}}});
    app.answer('manage.CheckEpisode',{result:true});
    app.emit('update',{data:{hash:'second',road:{percent:100}}});
    app.answer('manage.CheckEpisode',{result:true});
    assert.equal(app.calls.at(-1).clear,'myshows');
});

test('logout rejects a pending episode-mark publication after token restoration', () => {
    const card = {id:1,name:'Alpha',original_name:'Alpha',myshowsId:10,
        remaining:2,progress_marker:'0/2',unwatchedEpisodes:[{id:101},{id:102}]};
    const app = launch({cards:[card], storage:{
        myshows_serial_status_profile_a:{shows:[{id:10,title:'Alpha',watchStatus:'watching'}]},
        myshows_hash_map:{'1:first':{tmdbId:1,episodeId:101,seasonNumber:1,
            episodeNumber:1,airDate:'2020-01-01',timestamp:Date.now()}}
    }});
    app.run(50); app.run(2000); app.emit('full',{type:'complite',data:{movie:card}});
    app.emit('start',{card}); app.emit('update',{data:{hash:'first',road:{percent:100}}});
    app.params.find(p => p.field.name === 'Выйти из MyShows').onChange();
    app.data.set('myshows_token_profile_a','test-token');
    const count = app.calls.length;
    app.answer('manage.CheckEpisode',{result:true});
    assert.equal(app.calls.length,count,'late episode mark cannot restore cleared cards');
});

module.exports = {launch, cards};

// Discovery filtering exercises the exported Api boundary of the complete plugin.
const watchedMovie = {id:91,title:'Seen',titleOriginal:'Seen',year:2020};
const seenCard = {id:1,title:'Seen',original_title:'Seen',release_date:'2020-01-01'};
const unseenCard = {id:2,title:'New',release_date:'2021-01-01'};
function discovery(options={}) {
    const pages=options.pages || [{page:1,total_pages:1,results:[seenCard,unseenCard]}], loads=[];
    const app=launch({nativeActivity:options.nativeActivity,beforeRecommendations:options.beforeRecommendations,nativeSettings:options.nativeSettings,recommendations:options.recommendations,sync:options.sync,activity:options.activity,storage:{myshows_hide_watched_profile_a:'true',...options.storage},
        api:{list(request,done,error) {loads.push({...request});
            const page=pages[(request.page || 1)-1];
            if(page instanceof Error) error(page); else done(page);
            return 'source-handle';},...options.api}});
    app.loads=loads;
    app.flush=()=>{let count=0; while(app.timers.some(t=>t.delay===0)) {
        assert.ok(++count<100,'async source draining terminates');app.run(0);}};
    app.index=(movies=[watchedMovie],shows=[])=>{
        app.answer('profile.WatchedMovies',{result:movies});
        app.answer('profile.Shows',{result:shows});app.flush();};
    return app;
}
const topRequest={source:'cub',url:'top/hundred/movie',page:1};
for(const [legacy,want] of [[true,'hide'],['true','hide'],[false,'show'],['false','show'],[undefined,'show']])
    test('watched mode migrates legacy '+String(legacy)+' to '+want+' once',()=>{
        const app=launch({nativeSettings:true,sync:true,storage:{myshows_hide_watched_profile_a:legacy}});app.run(2000);
        assert.equal(app.context.Lampa.Storage.get('myshows_watched_mode_profile_a'),want);
        assert.equal(app.settingLabel('myshows_watched_mode'),want==='hide'?'Скрывать':'Показывать обычно');
        assert.equal(app.context.syncKeys.includes('myshows_watched_mode'),false);
        assert.equal(app.selectSetting('myshows_watched_mode','mark'),'Приглушать и отмечать ✓');
        assert.equal((app.context.syncPatches || []).some(args=>args[1]==='myshows_watched_mode_profile_a'),false);
        const restart=launch({nativeSettings:true,storage:Object.fromEntries(app.data)});restart.run(2000);
        assert.equal(restart.settingLabel('myshows_watched_mode'),'Приглушать и отмечать ✓','explicit selection outranks legacy on restart');
    });
test('native mode select preserves independent profile mirrors and explicit show over legacy true',()=>{
    const app=launch({nativeSettings:true,storage:{myshows_hide_watched_profile_a:'true',myshows_watched_mode_profile_a:'show',
        myshows_watched_mode:'hide',myshows_watched_mode_profile_b:'mark',myshows_token_profile_b:'other',myshows_calendar_profile_b:'false'}});
    app.run(2000);assert.equal(app.settingLabel('myshows_watched_mode'),'Показывать обычно');
    assert.equal(app.selectSetting('myshows_watched_mode','hide'),'Скрывать');
    app.changeProfile('b');assert.equal(app.settingLabel('myshows_watched_mode'),'Приглушать и отмечать ✓');
    app.changeProfile('a');assert.equal(app.settingLabel('myshows_watched_mode'),'Скрывать');
});
test('show passes original data through even when legacy hide was enabled',()=>{
    const payload={page:1,total_pages:3,results:[seenCard]},app=discovery({pages:[payload],storage:{myshows_watched_mode_profile_a:'show'}});
    let output;app.context.Lampa.Api.list({...topRequest},v=>output=v,assert.fail);
    assert.equal(output,payload);assert.equal(app.requests.length,0);
});
test('mark copies positive cards only and preserves count order pages and native request cursor without draining',()=>{
    const payload={page:1,total_pages:3,total_results:50,results:[seenCard,unseenCard]},request={...topRequest};
    const app=discovery({pages:[payload],storage:{myshows_watched_mode_profile_a:'mark'}});let output;
    app.context.Lampa.Api.list(request,v=>output=v,assert.fail);app.index();
    assert.deepEqual(Array.from(output.results,c=>c.id),[1,2]);assert.equal(output.page,1);assert.equal(output.total_pages,3);
    assert.equal(output.total_results,50);assert.equal(request.page,1);assert.equal(app.loads.length,1);
    assert.ok(output.results[0]._myshows_watched);assert.equal(output.results[1]._myshows_watched,undefined);
    assert.notEqual(output.results[0],seenCard);assert.equal(seenCard._myshows_watched,undefined);
});
test('fully watched mark batch and page return intact without calling continuation or draining',()=>{
    let nextCalls=0;const row={source:'cub',url:'top/hundred/movie',results:[seenCard]},app=discovery({
        pages:[{page:1,total_pages:9,results:[seenCard]}],storage:{myshows_watched_mode_profile_a:'mark'},
        api:{main(req,done){done([row]);return function(){nextCalls++;};}}});let output;
    app.context.Lampa.Api.main({source:'cub'},v=>output=v,assert.fail);app.index();
    assert.equal(output.length,1);assert.equal(output[0].results.length,1);assert.equal(nextCalls,0);
    app.context.Lampa.Api.list({...topRequest},v=>output=v,assert.fail);app.index();
    assert.equal(output.results.length,1);assert.equal(app.loads.length,1);
});
function watchedDomCard(data) {
    const classes=new Set(['card']),children=[];
    const node={card_data:data,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},
        querySelector(selector){return selector==='.card__view'?view:children.find(n=>'.'+n.className===selector)||null;}};
    const view={appendChild(child){children.push(child);child.remove=()=>children.splice(children.indexOf(child),1);}};
    return node;
}
for(const change of ['unchanged library','new unwatched episode','different profile','different account'])test('retained mark catalogue refreshes before native Back start with '+change,()=>{
    let replaces=0,currentStarts=0;
    const app=discovery({nativeActivity:true,sync:true,pages:[{results:[tvCard,unseenCard]}],storage:{myshows_watched_mode_profile_a:'mark',
        myshows_watched_mode_profile_b:'mark',myshows_token_profile_b:'other-token',myshows_calendar_profile_b:'false'},
        activity:{replace(){replaces++;load(a);}}});
    const contract=app.context.__nativeActivityLifecycleContract;
    const native=()=>({...contract,component:{start(){currentStarts++;}},loader(){}});
    const a={...topRequest,url:'top/hundred/tv',component:'category_full',activity:native()};
    const b={...topRequest,component:'category_full',activity:native()};
    let node;
    function load(target){app.context.Lampa.Api.list(target,value=>{
        if(target===a){node=watchedDomCard(value.results[0]);app.emitDom('visible',node);}
    },assert.fail);}
    app.setActive(a);load(a);app.index([],[showSummary]);
    television(app,[{id:101,airDate:'2020-01-01'}],[{id:101,watchDate:'2020-01-02'}]);
    app.run(50);app.emitDom('visible',node);
    app.requests.length=0; // Isolate discovery from unrelated startup list requests.
    assert.ok(node.querySelector('.myshows-watched-check'));
    app.context.document.querySelectorAll=selector=>selector==='.myshows-watched-card'?[node]:[];
    // Native creates B (including its source request) BEFORE pushing B as active.
    load(b);app.setActive(b);app.index([],[showSummary]);
    television(app,[{id:101,airDate:'2020-01-01'}],[{id:101,watchDate:'2020-01-02'}]);
    assert.equal(node.querySelector('.myshows-watched-check'),null,'old proof removed');
    assert.equal(b.activity.waite_refresh,undefined,'newly loading activity never refreshes itself');
    assert.equal(replaces,0,'create-before-push does not schedule replacement of B');
    if(change==='different profile')app.changeProfile('b');
    if(change==='different account')app.context.applySync('myshows_token_profile_a','replacement-token');
    app.requests.length=0;
    app.setActive(a);a.activity.start();
    app.emitDom('visible',node);
    assert.equal(node.querySelector('.myshows-watched-check'),null,'old context cannot restore a mark on Back');
    assert.equal(currentStarts,0,'stale retained component must not start');
    app.run(400);assert.equal(replaces,1);
    const newContext=change==='different profile'||change==='different account';
    app.index([],newContext?[]:[showSummary]);
    if(!newContext)television(app,change==='new unwatched episode'?[{id:101,airDate:'2020-01-01'},{id:102,airDate:'2020-01-03'}]:[{id:101,airDate:'2020-01-01'}],
        [{id:101,watchDate:'2020-01-02'}]);
    assert.equal(!!node.querySelector('.myshows-watched-check'),change==='unchanged library','return uses fresh series proof');
    assert.equal(a.page,1,'mark keeps native cursor');
    assert.equal(replaces,1,'refresh does not loop');
    assert.equal(app.requests.filter(r=>/^manage\./.test(r.body?.method||'')).length,0);
});
test('native visible hook marks positive card once and cleans reused DOM and mode changes',()=>{
    const app=discovery({storage:{myshows_watched_mode_profile_a:'mark'}}),active={...topRequest,component:'category_full'};app.setActive(active);
    let output;app.context.Lampa.Api.list(active,v=>output=v,assert.fail);app.index();app.run(50);app.run(2000);
    const node=watchedDomCard(output.results[0]);
    app.context.document.querySelectorAll=selector=>selector==='.myshows-watched-card'?[node]:[];
    app.emitDom('visible',node);assert.equal(node.querySelector('.myshows-watched-check')?.textContent,'✓');
    assert.equal(node.classList.contains('myshows-watched-card'),true);
    app.emitDom('visible',node);assert.ok(node.querySelector('.myshows-watched-check'));
    node.card_data=unseenCard;app.emitDom('visible',node);
    assert.equal(node.querySelector('.myshows-watched-check'),null);assert.equal(node.classList.contains('myshows-watched-card'),false);
    node.card_data=output.results[0];app.emitDom('visible',node);assert.ok(node.querySelector('.myshows-watched-check'));
    app.setting('myshows_watched_mode').onChange('show');
    assert.equal(node.querySelector('.myshows-watched-check'),null);assert.equal(node.classList.contains('myshows-watched-card'),false);
    app.emitDom('visible',node);assert.equal(node.querySelector('.myshows-watched-check'),null);
});
test('mark decoration is removed on profile or account change and stays absent in excluded activities',()=>{
    for(const change of ['profile','token','personal']) {
        const app=discovery({sync:true,storage:{myshows_watched_mode_profile_a:'mark',myshows_watched_mode_profile_b:'mark',
            myshows_token_profile_b:'other',myshows_calendar_profile_b:'false'}}),active={...topRequest,component:'category_full'};
        app.setActive(active);let output;app.context.Lampa.Api.list(active,v=>output=v,assert.fail);app.index();app.run(50);
        const node=watchedDomCard(output.results[0]);
        app.context.document.querySelectorAll=selector=>selector==='.myshows-watched-card'?[node]:[];
        app.emitDom('visible',node);assert.ok(node.querySelector('.myshows-watched-check'));
        if(change==='profile')app.changeProfile('b');
        if(change==='token')app.context.applySync('myshows_token_profile_a','replacement');
        if(change==='personal')app.setActive({component:'favorite',source:'cub'});
        app.emitDom('visible',node);assert.equal(node.querySelector('.myshows-watched-check'),null);
        assert.equal(node.classList.contains('myshows-watched-card'),false);
    }
});
test('mark uses the shared full-series proof and removes marker after a newly released unwatched episode',()=>{
    const app=discovery({pages:[{results:[tvCard,unseenCard]}],storage:{myshows_watched_mode_profile_a:'mark'}});let output;
    const request={...topRequest,url:'top/hundred/tv'};
    app.context.Lampa.Api.list(request,v=>output=v,assert.fail);app.index([],[showSummary]);
    television(app,[{id:101,airDate:'2020-01-01'}],[{id:101,watchDate:'2020-01-02'}]);
    assert.ok(output.results[0]._myshows_watched);assert.equal(tvCard._myshows_watched,undefined);
    app.context.Lampa.Api.list(request,v=>output=v,assert.fail);app.index([],[showSummary]);
    television(app,[{id:101,airDate:'2020-01-01'},{id:102,airDate:'2020-01-03'}],[{id:101,watchDate:'2020-01-02'}]);
    assert.equal(output.results[0]._myshows_watched,undefined);assert.deepEqual(Array.from(output.results,c=>c.id),[1,2]);
});
test('mark error unknown status and exclusions do not attach metadata',()=>{
    const app=discovery({storage:{myshows_watched_mode_profile_a:'mark'}});let output;
    app.context.Lampa.Api.list({...topRequest},v=>output=v,assert.fail);
    app.answer('profile.WatchedMovies',{error:{code:500}});app.answer('profile.Shows',{result:[]});app.flush();
    assert.deepEqual(Array.from(output.results,c=>c.id),[1,2]);assert.equal(output.results[0]._myshows_watched,undefined);
    app.context.Lampa.Api.list({...topRequest,query:'Seen'},v=>output=v,assert.fail);
    assert.equal(output.results[0]._myshows_watched,undefined);
});
for(const mode of ['hide','mark']) test('actual native ContentRows recommendation registration uses '+mode+' and retains custom rows',()=>{
    const app=discovery({recommendations:true,storage:{myshows_watched_mode_profile_a:mode,recomends_list:[seenCard,unseenCard]},
        api:{main(request,done){const parts=[];app.context.Lampa.ContentRows.call('main',request,parts);
            const rows=parts.map(call=>{let row;call(value=>row=value);return row;});done(rows);}}});
    const {Lampa}=app.context;
    Lampa.ContentRows.add({name:'custom',title:'Custom',screen:'main',index:9,call(){return done=>done({results:[seenCard],custom:true});}});
    let output;Lampa.Api.main({source:'cub'},v=>output=v,assert.fail);app.index();
    assert.equal(output.length,2);assert.equal(output[1].custom,true);assert.equal(output[1].results[0]._myshows_watched,undefined);
    assert.deepEqual(Array.from(output[0].results,c=>c.id),mode==='hide'?[2]:[2,1]);
    if(mode==='mark')assert.ok(output[0].results[1]._myshows_watched);
    output[0].params.emit.onlyMore();assert.equal(app.context.routerCalls[0][0],'recomend');
    assert.equal(app.context.__recommendationTimers,1,'native initializer is never rerun');
});
test('actual built-in recommendations More drains hidden pages, mark keeps native page and order',()=>{
    for(const mode of ['hide','mark']) {
        const source=Array.from({length:41},(_,i)=>i===0?unseenCard:{...seenCard,id:100+i});
        const app=discovery({recommendations:true,storage:{myshows_watched_mode_profile_a:mode,recomends_list:source}});
        const request={component:'recomend',media:'movie',page:1,activity:{}};app.setActive(request);let output;
        app.context.Lampa.Recomends.page(request,v=>output=v,assert.fail);app.index();
        if(mode==='hide'){assert.deepEqual(Array.from(output.results,c=>c.id),[2]);assert.equal(request.page,3);}
        else {assert.equal(output.results.length,20);assert.equal(request.page,1);assert.ok(output.results[0]._myshows_watched);}
    }
});
test('native recommendation discovery respects disabled visibility and restores exact prototype on no match or throw',()=>{
    const app=discovery({nativeSettings:true,recommendations:true,storage:{recomends_list:[seenCard],content_rows_recomend_watch:'false'}});
    const {Lampa}=app.context,get=Lampa.Storage.get,each=vm.runInNewContext('Array.prototype.forEach',app.context);let parts=[];
    Lampa.ContentRows.call('main',{source:'cub'},parts);assert.equal(parts.length,0);assert.equal(Lampa.Storage.get,get);
    assert.equal(vm.runInNewContext('Array.prototype.forEach',app.context),each);
    Lampa.Storage.set('content_rows_recomend_watch','true');
    Lampa.ContentRows.add({name:'throws',title:'Throws',screen:'main',call(){throw new Error('native row error');}});
    assert.throws(()=>Lampa.ContentRows.call('main',{source:'cub'},[]),/native row error/);
    assert.equal(Lampa.Storage.get,get);
    assert.equal(vm.runInNewContext('Array.prototype.forEach',app.context),each);
});
test('native recommendation preserves earlier index0 and later colliding index1 rows with real base parts',()=>{
    const app=discovery({recommendations:true,storage:{myshows_watched_mode_profile_a:'mark',recomends_list:[seenCard,unseenCard]},
        beforeRecommendations(Lampa){Lampa.ContentRows.add({name:'earlier',title:'Earlier',index:0,screen:'main',
            call(){return done=>done({results:[unseenCard],kind:'earlier'});}});},
        api:{main(request,done){const parts=Array.from({length:6},(_,i)=>call=>call({results:[unseenCard],kind:'base'+i}));
            app.context.Lampa.ContentRows.call('main',request,parts);done(parts.map(call=>{let row;call(value=>row=value);return row;}));}}});
    const {Lampa}=app.context,each=vm.runInNewContext('Array.prototype.forEach',app.context);
    Lampa.ContentRows.add({name:'collision',title:'Collision',screen:'main',index:1,call(){
        assert.equal(vm.runInNewContext('Array.prototype.forEach',app.context),each,'prototype restored before custom factory');
        vm.runInNewContext('window.arrayProof=[];[7,8].forEach(function(value,index,array){window.arrayProof.push([value,index,array.length]);});',app.context);
        return done=>done({results:[seenCard],kind:'collision'});}});
    let output;Lampa.Api.main({source:'cub'},v=>output=v,assert.fail);app.index();
    assert.deepEqual(Array.from(output,row=>row.kind||'builtin'),['earlier','collision','builtin','base0','base1','base2','base3','base4','base5']);
    assert.equal(output[1].results[0]._myshows_watched,undefined);assert.ok(output[2].results[1]._myshows_watched);
    assert.deepEqual(JSON.parse(JSON.stringify(app.context.arrayProof)),[[7,0,2],[8,1,2]]);
    assert.equal(vm.runInNewContext('Array.prototype.forEach',app.context),each);
    const stable=Lampa.ContentRows.call;
    Lampa.ContentRows.call('main',{source:'cub'},[]);assert.equal(Lampa.ContentRows.call,stable,'registry discovery stops after capture');
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',process.env.MYSHOWS_VARIANT || 'myshows.full.js'),'utf8'),app.context);
    assert.equal(Lampa.ContentRows.call,stable);assert.equal(app.context.__recommendationTimers,1);
});
test('native recommendations More rejects a pending response after changing requested media',()=>{
    const app=discovery({recommendations:true,storage:{recomends_list:[seenCard,unseenCard]}});
    const request={component:'recomend',media:'movie',page:1,activity:{}};app.setActive(request);let delivered=0;
    app.context.Lampa.Recomends.page(request,()=>delivered++,assert.fail);request.media='tv';app.index();
    assert.equal(delivered,0);
});
test('disabled native row can be discovered after enabling, without exposing patched prototype to custom code',()=>{
    const app=discovery({nativeSettings:true,recommendations:true,storage:{content_rows_recomend_watch:'false',recomends_list:[seenCard,unseenCard]}});
    const {Lampa}=app.context,each=vm.runInNewContext('Array.prototype.forEach',app.context);
    Lampa.ContentRows.add({name:'custom',title:'Custom',screen:'main',call(){
        assert.equal(vm.runInNewContext('Array.prototype.forEach',app.context),each);
        return done=>done({results:[unseenCard]});}});
    Lampa.ContentRows.call('main',{source:'cub'},[]);assert.equal(vm.runInNewContext('Array.prototype.forEach',app.context),each);
    Lampa.Storage.set('content_rows_recomend_watch','true');const parts=[];
    Lampa.ContentRows.call('main',{source:'cub'},parts);let row;
    parts[1](value=>row=value);assert.ok(row._myshows_recommendation);
});
test('opt-in Top100 hides confirmed watched movie on a copied payload and preserves return',()=>{
    const payload={page:1,total_pages:1,total_results:2,results:[seenCard,unseenCard]},app=discovery({pages:[payload]});
    let output;
    assert.equal(app.context.Lampa.Api.list(topRequest,v=>output=v,assert.fail),'source-handle');
    app.index();
    assert.deepEqual(Array.from(output.results,c=>c.id),[2]);
    assert.equal(output.total_results,2);assert.deepEqual(payload.results,[seenCard,unseenCard]);
});
test('default off preserves source objects and performs no index reads',()=>{
    const payload={results:[seenCard]},app=discovery({pages:[payload],storage:{myshows_hide_watched_profile_a:'false'}});
    let output;app.context.Lampa.Api.list(topRequest,v=>output=v,assert.fail);
    assert.equal(output,payload);assert.equal(app.requests.length,0);
});
test('unknown, type collision, remake, missing year, Unicode mismatch and ambiguity stay visible',()=>{
    const fixtures=[seenCard,{...seenCard,id:3,release_date:'2024-01-01'},
        {...seenCard,id:4,release_date:''},{id:5,name:'Seen',first_air_date:'2020-01-01',media_type:'tv'},
        {id:6,title:'Русский',original_title:'日本語',release_date:'2020-01-01'},
        {id:7,title:'Duplicate',release_date:'2020-01-01'}];
    const app=discovery({pages:[{results:fixtures,page:1,total_pages:1}]});let output;
    app.context.Lampa.Api.list(topRequest,v=>output=v,assert.fail);
    app.index([watchedMovie,{id:92,title:'Другой',titleOriginal:'別の',year:2020},
        {id:93,title:'Duplicate',year:2020},{id:94,title:'Duplicate',year:2020}]);
    assert.deepEqual(Array.from(output.results,c=>c.id),[3,4,5,6,7]);
});
test('Unicode literal titles can confirm a unique same-year movie without fuzzy mapping',()=>{
    const app=discovery({pages:[{results:[{id:6,title:'Русский',original_title:'日本語',release_date:'2020-01-01'},unseenCard]}]});
    let output;app.context.Lampa.Api.list(topRequest,v=>output=v,assert.fail);
    app.index([{id:92,title:'Русский',titleOriginal:'日本語',year:2020}]);
    assert.deepEqual(Array.from(output.results,c=>c.id),[2]);
});
test('all-hidden source pages drain asynchronously and preserve real source cursor',()=>{
    const app=discovery({pages:[{page:1,total_pages:3,results:[seenCard]},
        {page:2,total_pages:3,results:[seenCard]},{page:3,total_pages:3,results:[unseenCard]}]});let output;
    const request={...topRequest};app.context.Lampa.Api.list(request,v=>output=v,assert.fail);app.index();
    assert.equal(output.page,3);assert.deepEqual(app.loads.map(r=>r.page),[1,2,3]);
    assert.deepEqual(Array.from(output.results,c=>c.id),[2]);assert.equal(request.page,3);
});
test('repeated source page terminates and subsequent source errors use error callback',()=>{
    const repeat=discovery({pages:[{page:1,total_pages:4,results:[seenCard]},{page:1,total_pages:4,results:[seenCard]}]});
    let output;repeat.context.Lampa.Api.list(topRequest,v=>output=v,assert.fail);repeat.index();
    assert.equal(output.results.length,0);assert.equal(repeat.loads.length,2);
    const app=discovery({pages:[{page:1,total_pages:2,results:[seenCard]},new Error('page unavailable')]});
    let failure;app.context.Lampa.Api.list(topRequest,assert.fail,e=>failure=e);app.index();
    assert.equal(failure.message,'page unavailable');
});
for(const request of [{...topRequest,query:'Seen'},{...topRequest,url:'search/movie'},
    {...topRequest,url:'favorite'},{...topRequest,source:'custom'},{...topRequest,url:'person/1/movie_credits'},
    {...topRequest,url:'tv/1/season/1'}]) test('non-discovery request stays complete '+JSON.stringify(request),()=>{
    const app=discovery();let output;app.context.Lampa.Api.list(request,v=>output=v,assert.fail);
    assert.deepEqual(output.results,[seenCard,unseenCard]);assert.equal(app.requests.length,0);
});
test('main drains hidden batches and wraps returned continuation; personal/custom rows survive',()=>{
    const batches=[[{url:'movie/popular',source:'tmdb',results:[seenCard]}],
        [{url:'movie/popular',source:'tmdb',results:[seenCard]}],
        [{url:'continue_watch',source:'tmdb',results:[seenCard]},
            {url:'myshows_watched',source:'myshows',results:[seenCard]},
            {url:'movie/popular',source:'tmdb',results:[unseenCard]}],
        [{url:'movie/top_rated',source:'tmdb',results:[seenCard,unseenCard]}]];
    let nextCalls=0;
    const app=discovery({api:{main(request,done,error){
        done(batches.shift());return function(next,fail){nextCalls++;if(batches.length)next(batches.shift());else fail();};}}});
    let output;const next=app.context.Lampa.Api.main({source:'tmdb'},v=>output=v,assert.fail);app.index();
    assert.equal(nextCalls,2);assert.deepEqual(Array.from(output,row=>Array.from(row.results,c=>c.id)),[[1],[1],[2]]);
    next(v=>output=v,assert.fail);app.flush();assert.deepEqual(Array.from(output[0].results,c=>c.id),[2]);
});
test('index failures fail open with visible status, and successful empty library is distinct',()=>{
    const app=discovery();let output;app.context.Lampa.Api.list(topRequest,v=>output=v,assert.fail);
    app.answer('profile.WatchedMovies',{error:{code:500}});app.answer('profile.Shows',{result:[]});app.flush();
    assert.deepEqual(output.results,[seenCard,unseenCard]);assert.ok(app.notices.length);
    const empty=discovery();empty.context.Lampa.Api.list(topRequest,v=>output=v,assert.fail);empty.index([]);
    assert.deepEqual(output.results,[seenCard,unseenCard]);assert.equal(empty.notices.length,0);
});
test('profile ABA, token replacement and navigation reject pending discovery callbacks',()=>{
    for(const change of [app=>{app.changeProfile('b');app.changeProfile('a');},
        app=>app.data.set('myshows_token_profile_a','replacement'),app=>app.setActive({component:'search'})]) {
        const app=discovery();let delivered=0;
        app.context.Lampa.Api.list(topRequest,()=>delivered++,assert.fail);change(app);app.index();
        assert.equal(delivered,0);
    }
});
test('native grid increments consumed source cursor without duplicates and stops at all-hidden last page',()=>{
    const app=discovery({pages:[{page:1,total_pages:4,results:[seenCard]},
        {page:2,total_pages:4,results:[unseenCard]},
        {page:3,total_pages:4,results:[{...unseenCard,id:3}]},
        {page:4,total_pages:4,results:[seenCard]}]}), request={...topRequest};
    let output;const render=v=>output=v;
    app.context.Lampa.Api.list(request,render,assert.fail);app.index();
    assert.equal(request.page,2);assert.equal(output.page,2);
    request.page++;app.context.Lampa.Api.list(request,render,assert.fail);app.flush();
    assert.deepEqual(Array.from(output.results,c=>c.id),[3]);
    request.page++;app.context.Lampa.Api.list(request,render,assert.fail);app.flush();
    assert.equal(output.results.length,0);assert.equal(request.page,4);
    assert.equal(request.page<output.total_pages,false);assert.deepEqual(app.loads.map(r=>r.page),[1,2,3,4]);
});
test('toggle refreshes native catalog once and disabling restores cards in original order',()=>{
    let refreshes=0;const app=discovery({activity:{refresh(){refreshes++;}}});app.run(2000);
    app.setActive({...topRequest,component:'category_full'});
    let output;app.context.Lampa.Api.list({...topRequest},v=>output=v,assert.fail);app.index();
    app.setting('myshows_watched_mode').onChange('show');
    assert.equal(refreshes,1);
    app.context.Lampa.Api.list({...topRequest},v=>output=v,assert.fail);
    assert.deepEqual(output.results,[seenCard,unseenCard]);
});
test('series detail failures fail open and expose a filter error state',()=>{
    const app=discovery({pages:[{results:[tvCard]}]});let output;
    app.context.Lampa.Api.list({...topRequest,url:'top/hundred/tv'},v=>output=v,assert.fail);
    app.index([],[showSummary]);app.answer('shows.GetById',{error:{code:500}});
    app.answer('profile.Episodes',{result:[]});app.flush();
    assert.deepEqual(Array.from(output.results,c=>c.id),[1]);assert.ok(app.notices.length);
});
test('fresh catalog rechecks complete series and returns it after a new released episode',()=>{
    const app=discovery({pages:[{results:[tvCard,unseenCard]}]});let output;
    const request={...topRequest,url:'top/hundred/tv'};
    app.context.Lampa.Api.list(request,v=>output=v,assert.fail);app.index([],[showSummary]);
    television(app,[{id:101,airDate:'2020-01-01'}],[{id:101,watchDate:'2020-01-02'}]);
    assert.deepEqual(Array.from(output.results,c=>c.id),[2]);
    app.context.Lampa.Api.list(request,v=>output=v,assert.fail);app.index([],[showSummary]);
    television(app,[{id:101,airDate:'2020-01-01'},{id:102,airDate:'2020-01-03'}],[{id:101,watchDate:'2020-01-02'}]);
    assert.deepEqual(Array.from(output.results,c=>c.id),[1,2]);
});
function television(app,episodes,history) {
    app.answer('shows.GetById',{result:{id:10,episodes}});
    app.answer('profile.Episodes',{result:history});app.flush();
}
test('duplicate script evaluation keeps a single initialization and settings registration',()=>{
    const app=discovery();app.run(2000);const settingCount=app.params.length;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',process.env.MYSHOWS_VARIANT || 'myshows.full.js'),'utf8'),app.context);
    while(app.timers.some(t=>t.delay===2000))app.run(2000);
    assert.equal(app.params.length,settingCount);
});
const showSummary={show:{id:10,title:'Series',titleOriginal:'Series',year:2020},watchStatus:'watching'};
const tvCard={id:1,name:'Series',first_air_date:'2020-01-01',media_type:'tv'};
test('candidate series reads deduplicate duplicate cards and bound concurrent detail work',()=>{
    const app=discovery({pages:[{results:[tvCard,{...tvCard,id:2},
        {...tvCard,id:3,name:'Second'},{...tvCard,id:4,name:'Third'}]}]});let output;
    app.context.Lampa.Api.list({...topRequest,url:'top/hundred/tv'},v=>output=v,assert.fail);
    app.index([],[showSummary,{show:{id:20,title:'Second',year:2020},watchStatus:'finished'},
        {show:{id:30,title:'Third',year:2020},watchStatus:'watching'}]);
    const detailRequests=()=>app.requests.filter(r=>['shows.GetById','profile.Episodes'].includes(r.body?.method));
    assert.equal(detailRequests().length,4);
    television(app,[{id:101,airDate:'2020-01-01'}],[{id:101,watchDate:'2020-01-02'}]);
    assert.equal(detailRequests().length,4,'third series starts only after first completes');
    for(const id of [20,30]) {
        const detail=app.requests.find(r=>r.body?.method==='shows.GetById' && r.body.params.showId===id);
        app.requests.splice(app.requests.indexOf(detail),1);detail.success({result:{id,episodes:[]}});
        const hist=app.requests.find(r=>r.body?.method==='profile.Episodes' && r.body.params.showId===id);
        app.requests.splice(app.requests.indexOf(hist),1);hist.success({result:[]});
    }
    app.flush();assert.deepEqual(Array.from(output.results,c=>c.id),[3,4]);
});
test('late source duplicate callback cannot paint during a newer continuation',()=>{
    let initial;
    const app=discovery({api:{main(req,done){initial=done;done([{url:'movie/popular',source:'tmdb',results:[unseenCard]}]);
        return function(next){initial([{url:'movie/popular',source:'tmdb',results:[{...unseenCard,id:99}]}]);
            next([{url:'movie/popular',source:'tmdb',results:[{...unseenCard,id:3}]}]);};}}});
    let output;const next=app.context.Lampa.Api.main({source:'tmdb'},v=>output=v,assert.fail);app.index();
    next(v=>output=v,assert.fail);app.flush();assert.deepEqual(Array.from(output[0].results,c=>c.id),[3]);
});
test('successful movie-status changes refresh a native catalog, API errors do not',()=>{
    let refreshes=0;const app=discovery({activity:{refresh(){refreshes++;}}});
    app.setActive({...topRequest,component:'category_full'});
    app.context.MyShows.setStatus(seenCard,'remove',true,()=>{});
    app.answer('movies.GetCatalog',{result:[{movie:watchedMovie}]});
    app.answer('manage.SetMovieStatus',{error:{code:500}});assert.equal(refreshes,0);
    app.context.MyShows.setStatus(seenCard,'remove',true,()=>{});
    app.answer('movies.GetCatalog',{result:[{movie:watchedMovie}]});
    app.answer('manage.SetMovieStatus',{result:true});assert.equal(refreshes,1);
});
test('successful episode mark and undo invalidate series proofs and refresh archived native catalog',()=>{
    let refreshes=0;
    const card={...tvCard,original_name:'Series',myshowsId:10,remaining:1,progress_marker:'0/1',unwatchedEpisodes:[{id:101}]};
    const app=discovery({pages:[{results:[card,unseenCard]}],storage:{
        myshows_serial_status_profile_a:{shows:[{id:10,title:'Series',titleOriginal:'Series',watchStatus:'watching'}]},
        myshows_unwatched_serials_profile_a:{shows:[card]},
        myshows_hash_map:{'1:first':{tmdbId:1,episodeId:101,seasonNumber:1,episodeNumber:1,
            airDate:'2020-01-01',timestamp:Date.now()}}}});
    const native={...topRequest,url:'top/hundred/tv',component:'category_full',activity:{refresh(){refreshes++;}}};
    app.setActive(native);app.context.Lampa.Api.list(native,()=>{},assert.fail);app.index([],[showSummary]);
    television(app,[{id:101,airDate:'2020-01-01'}],[]);
    app.run(50);app.setActive({component:'full',movie:card});
    app.emit('full',{type:'complite',data:{movie:card}});app.emit('start',{card});
    app.emit('update',{data:{hash:'first',road:{percent:100}}});app.answer('manage.CheckEpisode',{result:true});
    assert.equal(refreshes,1);
    app.emit('update',{data:{hash:'first',road:{percent:0}}});app.answer('manage.UnCheckEpisode',{result:true});
    assert.equal(refreshes,2);
    app.setActive(native);app.context.Lampa.Api.list(native,()=>{},assert.fail);
    assert.ok(app.requests.some(r=>r.body?.method==='profile.WatchedMovies'),'undo forces authoritative new index');
});
test('profile token refresh rebuilds native catalog without applying old account index',()=>{
    let refreshes=0;const app=discovery({sync:true,storage:{},activity:{refresh(){refreshes++;}}});
    app.run(2000);app.setActive({...topRequest,component:'category_full'});
    app.context.Lampa.Api.list({...topRequest},assert.fail,assert.fail);
    app.context.applySync('myshows_token_profile_a','new-token');
    assert.equal(refreshes,1);
    app.answer('profile.WatchedMovies',{result:[watchedMovie]});app.answer('profile.Shows',{result:[]});app.flush();
});
for(const source of ['cub','tmdb']) test('category filters known '+source+' discovery rows and preserves custom rows',()=>{
    const url=source==='cub'?'?cat=movie&sort=top':'discover/movie';
    const app=discovery({api:{category(request,done){done([{url,source,results:[seenCard,unseenCard]},
        {url:'myshows_watched',source,results:[seenCard]}]);return 'category-handle';}}});let output;
    assert.equal(app.context.Lampa.Api.category({source,url:'movie'},v=>output=v,assert.fail),'category-handle');app.index();
    assert.deepEqual(Array.from(output,row=>Array.from(row.results,c=>c.id)),[[2],[1]]);
});
test('repeated main source cursor terminates draining before requesting it a third time',()=>{
    let loads=0;const row={url:'movie/popular',source:'tmdb',page:1,results:[seenCard]};
    const app=discovery({api:{main(request,done){done([row]);return function(next){loads++;next([row]);};}}});let output;
    app.context.Lampa.Api.main({source:'tmdb'},v=>output=v,assert.fail);app.index();
    assert.equal(loads,1);assert.equal(output.length,0);
});
test('empty search query still exempts source request',()=>{
    const app=discovery();let output;
    app.context.Lampa.Api.list({...topRequest,query:''},v=>output=v,assert.fail);
    assert.deepEqual(output.results,[seenCard,unseenCard]);assert.equal(app.requests.length,0);
});
test('successful show-status update refreshes discovery, failed update preserves it',()=>{
    let refreshes=0;const app=discovery({activity:{refresh(){refreshes++;}}});
    app.setActive({...topRequest,url:'top/hundred/tv',component:'category_full'});
    const card={...tvCard,original_name:'Series',imdb_id:'tt123'};
    app.context.MyShows.setStatus(card,'cancelled',false,()=>{});
    app.answer('shows.GetByExternalId',{result:showSummary.show});
    app.answer('manage.SetShowStatus',{error:{code:500}});assert.equal(refreshes,0);
    app.context.MyShows.setStatus(card,'cancelled',false,()=>{});
    app.answer('shows.GetByExternalId',{result:showSummary.show});
    app.answer('manage.SetShowStatus',{result:true});assert.equal(refreshes,1);
});
for(const method of ['main','category','list']) test('native create-before-push binds '+method+' to its target activity and rejects next navigation',()=>{
    for(const previous of [null,{component:'main',activity:{refresh(){}}}]) {
    let sourceDone,delivered=0,targetRefreshes=0;
    const payload=method==='list'?{page:1,total_pages:1,results:[seenCard,unseenCard]}:
        [{url:'movie/popular',source:'tmdb',results:[seenCard,unseenCard]}];
    // A real activity receives its handle before Component.create invokes Api,
    // but Activity.push only changes the active stack after creation returns.
    const target={source:method==='list'?'cub':'tmdb',component:method==='list'?'category_full':method,
        url:method==='main'?'':method==='category'?'movie':'top/hundred/movie',page:1,
        activity:{refresh(){targetRefreshes++;}}};
    // Use the existing public wrapper with a source-boundary function from launch.
    const native=discovery({api:{[method](request,done){sourceDone=done;return 'source-handle';}}});
    native.setActive(previous);
    native.context.Lampa.Api[method](target,()=>delivered++,assert.fail);
    native.setActive(target);sourceDone(payload);native.index();
    assert.equal(delivered,1,'response belongs to the newly pushed target');
    native.run(2000);native.setting('myshows_watched_mode').onChange('show');
    assert.equal(targetRefreshes,1,'refresh tracks target rather than previous activity');
    native.setting('myshows_watched_mode').onChange('hide');
    native.context.Lampa.Api[method](target,()=>delivered++,assert.fail);
    native.setActive({component:'search',activity:{}});sourceDone(payload);native.index();
    assert.equal(delivered,1,'next navigation rejects the old target response');
    }
});
test('synchronous native source/index callbacks wait until target is pushed before delivery',()=>{
    const app=discovery();app.context.Lampa.Reguest=function(){this.silent=(url,done,error,body)=>{
        const method=JSON.parse(body).method;done({result:method==='profile.WatchedMovies'?[watchedMovie]:[]});};};
    const previous={component:'main',activity:{}},target={...topRequest,component:'category_full',activity:{}};
    app.setActive(previous);let output;
    app.context.Lampa.Api.list(target,value=>output=value,assert.fail);
    assert.equal(output,undefined,'component is not on active stack during create');
    app.setActive(target);app.flush();assert.deepEqual(Array.from(output.results,c=>c.id),[2]);
});
test('native create-before-push source error is deferred for target and cancelled on request mutation',()=>{
    for(const mutate of [false,true]) {
        let failures=0;
        const app=discovery({api:{list(request,done,error){error(new Error('source unavailable'));}}});
        const target={...topRequest,component:'category_full',activity:{}};
        app.setActive({component:'main',activity:{}});
        app.context.Lampa.Api.list(target,assert.fail,()=>failures++);
        assert.equal(failures,0);app.setActive(target);
        if(mutate)target.url='search/movie';
        app.flush();assert.equal(failures,mutate?0:1);
    }
});
test('built-in CUB collection rows and More list hide watched cards; custom source stays complete',()=>{
    const app=discovery({api:{main(request,done){done([{url:'collections/123',source:'cub',results:[seenCard,unseenCard]},
        {url:'collections/123',source:'custom',results:[seenCard]}]);}}});let output;
    app.context.Lampa.Api.main({source:'cub'},v=>output=v,assert.fail);app.index();
    assert.deepEqual(Array.from(output,row=>Array.from(row.results,c=>c.id)),[[2],[1]]);
    app.context.Lampa.Api.list({...topRequest,url:'collections/123'},v=>output=v,assert.fail);app.index();
    assert.deepEqual(Array.from(output.results,c=>c.id),[2]);
});
for(const type of ['movie','tv']) test('conflicting explicit originals keep '+type+' visible despite matching localized title/year',()=>{
    const card=type==='movie'?{id:1,media_type:'movie',title:'Брат',original_title:'存在しない映画のテスト',release_date:'1997-01-01'}:
        {id:1,media_type:'tv',name:'Брат',original_name:'存在しない映画のテスト',first_air_date:'1997-01-01'};
    const match={id:10,title:'Брат',titleOriginal:'Brat',year:1997};
    const app=discovery({pages:[{results:[card]}]});let output;
    app.context.Lampa.Api.list({...topRequest,url:'top/hundred/'+type},v=>output=v,assert.fail);
    app.index(type==='movie'?[match]:[],type==='tv'?[{show:match,watchStatus:'finished'}]:[]);
    assert.ok(output,'contradictory identity does not request completion details');
    assert.deepEqual(Array.from(output.results,c=>c.id),[1]);
});
for(const missing of ['card','summary']) test('localized title and exact year remain valid when '+missing+' original is absent',()=>{
    const card={...seenCard,original_title:missing==='card'?undefined:'Seen Original'};
    const summary={...watchedMovie,titleOriginal:missing==='summary'?undefined:'Seen Original'};
    const app=discovery({pages:[{results:[card,unseenCard]}]});let output;
    app.context.Lampa.Api.list({...topRequest},v=>output=v,assert.fail);app.index([summary]);
    assert.deepEqual(Array.from(output.results,c=>c.id),[2]);
});
test('series hides only after all released episode ids are confirmed in full history',()=>{
    const app=discovery({pages:[{results:[tvCard,unseenCard]}]});let output;
    app.context.Lampa.Api.list({...topRequest,url:'top/hundred/tv'},v=>output=v,assert.fail);
    app.index([],[showSummary]);assert.equal(output,undefined);
    television(app,[{id:101,airDate:'2020-01-01'},{id:102,airDate:'2099-01-01'}],[{id:101,watchDate:'2020-01-02'}]);
    assert.deepEqual(Array.from(output.results,c=>c.id),[2]);
});
for(const [name,episodes,history] of [
    ['partial',[{id:101,airDate:'2020-01-01'},{id:102,airDate:'2020-01-02'}],[{id:101,watchDate:'2020-01-02'}]],
    ['unknown date',[{id:101,airDate:null}],[{id:101,watchDate:'2020-01-02'}]],
    ['invalid date',[{id:101,airDate:'2020-02-31'}],[{id:101,watchDate:'2020-01-02'}]],
    ['empty history',[{id:101,airDate:'2020-01-01'}],[]],
    ['no released episodes',[{id:101,airDate:'2099-01-01'}],[]],
    ['missing episode id',[{airDate:'2020-01-01'}],[{id:101,watchDate:'2020-01-02'}]]])
    test('series remains visible for '+name,()=>{
        const app=discovery({pages:[{results:[tvCard]}]});let output;
        app.context.Lampa.Api.list({...topRequest,url:'top/hundred/tv'},v=>output=v,assert.fail);
        app.index([],[showSummary]);television(app,episodes,history);
        assert.deepEqual(Array.from(output.results,c=>c.id),[1]);
    });

test('unmark after completion restores the show through authoritative refresh', () => {
    const card = {id:1,name:'Alpha',original_name:'Alpha',myshowsId:10,
        remaining:1,progress_marker:'0/1',unwatchedEpisodes:[{id:101}]};
    const app = launch({cards:[card], storage:{
        myshows_serial_status_profile_a:{shows:[{id:10,title:'Alpha',watchStatus:'watching'}]},
        myshows_hash_map:{'1:first':{tmdbId:1,episodeId:101,seasonNumber:1,
            episodeNumber:1,airDate:'2020-01-01',timestamp:Date.now()}}
    }});
    app.run(50); app.emit('full',{type:'complite',data:{movie:card}}); app.emit('start',{card});
    app.emit('update',{data:{hash:'first',road:{percent:100}}});
    app.answer('manage.CheckEpisode',{result:true});
    assert.equal(app.calls.at(-1).clear,'myshows');
    app.emit('update',{data:{hash:'first',road:{percent:0}}});
    app.answer('manage.UnCheckEpisode',{result:true});
    app.answer('lists.EpisodesUnwatched',{result:[{show:{id:10,title:'Alpha',titleOriginal:'Alpha',year:2020},
        episodes:[{id:101,seasonNumber:1,episodeNumber:1,shortName:'s01e01',airDate:'2020-01-01'}]}]});
    app.answerUrl('search/tv',{results:[{id:1,name:'Alpha',original_name:'Alpha',first_air_date:'2020-01-01'}]});
    app.answerUrl('/tv/1?',{id:1,name:'Alpha',original_name:'Alpha',first_air_date:'2020-01-01',seasons:[{season_number:1}]});
    app.answer('shows.GetById',{result:{episodes:[{id:101,seasonNumber:1,episodeNumber:1,airDate:'2020-01-01'}]}});
    assert.deepEqual(app.calls.at(-1).publish.items.map(c => c.id),['1']);
    assert.match(app.calls.at(-1).publish.items[0].overview,/S01\/E01/);
});

test('local episode update from partial NP cache preserves unrelated published shows', () => {
    const first = {id:1,name:'Alpha',original_name:'Alpha',myshowsId:10,remaining:2,
        progress_marker:'0/2',unwatchedEpisodes:[{id:101},{id:102}]};
    const other = {id:2,name:'Zulu',original_name:'Zulu',myshowsId:20,remaining:1};
    const app = launch({np:true,storage:{myshows_hash_map:{'1:first':{tmdbId:1,episodeId:101,
        seasonNumber:1,episodeNumber:1,airDate:'2020-01-01',timestamp:Date.now()}}}});
    app.run(50); app.answerUrl('/myshows/watching?',{results:[first,other]});
    assert.deepEqual(app.calls.at(-1).publish.items.map(c => c.id),['1','2']);
    app.emit('full',{type:'complite',data:{movie:first}});
    app.answerUrl('/myshows/watching?',{results:[first,other]});
    app.answerUrl('/myshows/status?',{cache_type:'watching'});
    app.emit('start',{card:first}); app.emit('update',{data:{hash:'first',road:{percent:100}}});
    app.answer('manage.CheckEpisode',{result:true});
    assert.equal(app.requests.filter(r => r.body?.method === 'lists.EpisodesUnwatched').length,0);
    app.answerUrl('/myshows/watching?',{results:[first],page:1,total_pages:2});
    assert.deepEqual(app.calls.at(-1).publish.items.map(c => c.id),['1','2']);
    assert.match(app.calls.at(-1).publish.items[0].overview,/Unwatched: 1/);
});

test('logout invalidates the authoritative unmark fallback response', () => {
    const card = {id:1,name:'Alpha',original_name:'Alpha',myshowsId:10,
        remaining:1,progress_marker:'0/1',unwatchedEpisodes:[{id:101}]};
    const app = launch({cards:[card],storage:{
        myshows_serial_status_profile_a:{shows:[{id:10,title:'Alpha',watchStatus:'watching'}]},
        myshows_hash_map:{'1:first':{tmdbId:1,episodeId:101,seasonNumber:1,
            episodeNumber:1,airDate:'2020-01-01',timestamp:Date.now()}}
    }});
    app.run(50); app.run(2000); app.emit('full',{type:'complite',data:{movie:card}});
    app.emit('start',{card}); app.emit('update',{data:{hash:'first',road:{percent:100}}});
    app.answer('manage.CheckEpisode',{result:true});
    app.emit('update',{data:{hash:'first',road:{percent:0}}});
    app.answer('manage.UnCheckEpisode',{result:true});
    assert.ok(app.requests.some(r => r.body?.method === 'lists.EpisodesUnwatched'));
    app.params.find(p => p.field.name === 'Выйти из MyShows').onChange();
    app.data.set('myshows_token_profile_a','test-token');
    const count = app.calls.length;
    app.answer('lists.EpisodesUnwatched',{result:[]});
    assert.equal(app.calls.length,count,'old fallback cannot touch the current generation');
});

// A missing history fetch/comparator, cache reuse, or generation guard breaks these tests.
const relevanceCards = [
    {id:3,name:'Alpha',myshowsId:30},
    {id:2,name:'Bravo',myshowsId:20,last_episode_to_myshows:{air_date:'2020-01-03'}},
    {id:1,name:'Zulu',myshowsId:10,last_episode_to_myshows:{air_date:'2020-01-01'}},
    {id:4,name:'Delta',myshowsId:40,last_episode_to_myshows:{air_date:'2999-01-01'}},
    {id:5,name:'Echo',myshowsId:50,last_episode_to_myshows:{air_date:'2020-02-30'}}
];
const history = date => ({result:date ? [{id:101,watchDate:date,rating:0,isMoveAble:false}] : []});
function answerHistory(app, id, response) {
    const index = app.requests.findIndex(r => r.body?.method === 'profile.Episodes' && r.body.params.showId === id);
    assert.notEqual(index,-1,'history requested for show '+id);
    app.requests.splice(index,1)[0].success(response);
}
test('relevance merges last viewing and released episode dates with list/channel parity', () => {
    const app = launch({cards:relevanceCards,storage:{myshows_sort_order_profile_a:'relevance'}});
    app.run(50);
    answerHistory(app,10,history('2020-01-04T00:00:00Z'));
    answerHistory(app,20,history('2020-01-02'));
    answerHistory(app,30,history('2020-01-02'));
    answerHistory(app,40,history('2999-01-01'));
    answerHistory(app,50,history('01.02.2020'));
    assert.deepEqual(app.calls.at(-1).publish.items.map(c=>c.id),['1','2','3','4','5']);
    let list;
    app.context.MyShows.getUnwatchedShowsWithDetails(result=>list=result.shows);
    assert.deepEqual(Array.from(list,c=>c.id),[1,2,3,4,5]);
    assert.equal(app.requests.filter(r=>r.body?.method==='profile.Episodes').length,0);
    assert.equal(app.calls.at(-1).publish.items[0].watchDate,undefined);
});
test('relevance bounds concurrency and ignores history after profile ABA', () => {
    const app=launch({cards:relevanceCards,storage:{myshows_sort_order_profile_a:'relevance',myshows_token_profile_b:'other'}});
    app.run(50);
    assert.equal(app.requests.filter(r=>r.body?.method==='profile.Episodes').length,2);
    const before = JSON.stringify(app.data.get('myshows_relevance_history_profile_a'));
    app.changeProfile('b'); app.changeProfile('a');
    const count=app.calls.length;
    answerHistory(app,10,history('2020-01-04')); answerHistory(app,20,history('2020-01-02'));
    assert.equal(app.calls.length,count);
    assert.equal(JSON.stringify(app.data.get('myshows_relevance_history_profile_a')),before);
});
test('other modes do not fetch viewing history', () => {
    const app=launch({cards}); app.run(50); app.run(2000);
    app.setting('myshows_sort_order').onChange('air_date');
    assert.equal(app.requests.filter(r=>r.body?.method==='profile.Episodes').length,0);
});

test('relevance error preserves persisted watch date and successful empty clears it', () => {
    const app=launch({cards:cards,storage:{myshows_sort_order_profile_a:'relevance',
        myshows_relevance_history_profile_a:{20:{watch:1578096000000,checked:1}}}});
    app.run(50);
    answerHistory(app,10,history('2020-01-02'));
    answerHistory(app,20,{error:{code:500}});
    assert.deepEqual(app.calls.at(-1).publish.items.map(c=>c.id),['2','1']);
    const stored=JSON.parse(JSON.stringify(app.data.get('myshows_relevance_history_profile_a')));
    stored[20].checked=1;
    const restarted=launch({cards,storage:{myshows_sort_order_profile_a:'relevance',myshows_relevance_history_profile_a:stored}});
    restarted.run(50);
    answerHistory(restarted,20,history(null));
    assert.deepEqual(restarted.calls.at(-1).publish.items.map(c=>c.id),['1','2']);
});
test('relevance logout ignores history after restoring the same token', () => {
    const app=launch({cards,storage:{myshows_sort_order_profile_a:'relevance'}});
    app.run(50); app.run(2000);
    app.params.find(p=>p.field.name==='Выйти из MyShows').onChange();
    app.data.set('myshows_token_profile_a','test-token');
    const count=app.calls.length;
    answerHistory(app,10,history('2020-01-04')); answerHistory(app,20,history(null));
    assert.equal(app.calls.length,count);
    assert.equal(app.data.get('myshows_relevance_history_profile_a')?.[10]?.watch,undefined);
});
test('successful mark raises relevance then unmark refetches and restores older date', () => {
    const card={id:1,name:'Alpha',original_name:'Alpha',myshowsId:10,remaining:2,
        progress_marker:'0/2',unwatchedEpisodes:[{id:101},{id:102}]};
    const app=launch({cards:[card,cards[0]],storage:{myshows_sort_order_profile_a:'relevance',
        myshows_serial_status_profile_a:{shows:[{id:10,title:'Alpha',watchStatus:'watching'}]},
        myshows_hash_map:{'1:first':{tmdbId:1,episodeId:101,seasonNumber:1,episodeNumber:1,
            airDate:'2020-01-01',timestamp:Date.now()}}}});
    app.run(50); answerHistory(app,10,history('2020-01-02')); answerHistory(app,20,history('2020-01-03'));
    app.emit('full',{type:'complite',data:{movie:card}}); app.emit('start',{card});
    app.emit('update',{data:{hash:'first',road:{percent:100}}});
    assert.deepEqual(app.calls.at(-1).publish.items.map(c=>c.id),['2','1']);
    app.answer('manage.CheckEpisode',{result:true});
    assert.deepEqual(app.calls.at(-1).publish.items.map(c=>c.id),['1','2']);
    app.emit('update',{data:{hash:'first',road:{percent:0}}});
    app.answer('manage.UnCheckEpisode',{result:true});
    answerHistory(app,10,history('2020-01-02'));
    assert.deepEqual(app.calls.at(-1).publish.items.map(c=>c.id),['2','1']);
});

test('relevance uses newest released episode when the last metadata episode is future', () => {
    const app=launch({cards:[{id:1,name:'Alpha',myshowsId:10,
        last_episode_to_myshows:{air_date:'2999-01-01'},
        unwatchedEpisodes:[{id:101,airDate:'2020-01-04'},{id:102,airDate:'2999-01-01'}]},
        {id:2,name:'Bravo',myshowsId:20,last_episode_to_myshows:{air_date:'2020-01-03'}}],
        storage:{myshows_sort_order_profile_a:'relevance'}});
    app.run(50); answerHistory(app,10,history(null)); answerHistory(app,20,history(null));
    assert.deepEqual(app.calls.at(-1).publish.items.map(c=>c.id),['1','2']);
});

test('relevance NP cards without dates retain persisted release and viewing dates', () => {
    const app=launch({np:true,storage:{myshows_sort_order_profile_a:'relevance',
        myshows_relevance_history_profile_a:{10:{watch:1578096000000,checked:Date.now()},
            20:{release:1578009600000,checked:Date.now()}}}});
    app.run(50); app.answerUrl('/myshows/watching?',{results:[cards[0],cards[1]]});
    assert.deepEqual(app.calls.at(-1).publish.items.map(c=>c.id),['1','2']);
    assert.equal(app.requests.filter(r=>r.body?.method==='profile.Episodes').length,0);
});
test('relevance startup loads history even without an Android bridge', () => {
    const app=launch({cards,bridge:'missing',storage:{myshows_sort_order_profile_a:'relevance'}});
    app.run(50);
    assert.equal(app.requests.filter(r=>r.body?.method==='profile.Episodes').length,2);
});

test('logout clears private viewing dates before another MyShows account uses the profile', () => {
    const app=launch({cards,storage:{myshows_relevance_history_profile_a:{10:{watch:1578096000000,checked:Date.now()}}}});
    app.run(2000); app.params.find(p=>p.field.name==='Выйти из MyShows').onChange();
    assert.deepEqual(Object.keys(app.data.get('myshows_relevance_history_profile_a')),[]);
});
test('successful mark without MyShows id records matched cached history with Android off', () => {
    const card={id:1,name:'Alpha',original_name:'Alpha',myshowsId:10,remaining:2,
        progress_marker:'0/2',unwatchedEpisodes:[{id:101},{id:102}]};
    const app=launch({cards:[card],storage:{myshows_android_tv_profile_a:'false',
        myshows_serial_status_profile_a:{shows:[{id:10,title:'Alpha',watchStatus:'watching'}]},
        myshows_hash_map:{'1:first':{tmdbId:1,episodeId:101,seasonNumber:1,episodeNumber:1,
            airDate:'2020-01-01',timestamp:Date.now()}}}});
    const playerCard={id:1,name:'Alpha',original_name:'Alpha'};
    app.run(50); app.emit('full',{type:'complite',data:{movie:playerCard}}); app.emit('start',{card:playerCard});
    app.emit('update',{data:{hash:'first',road:{percent:100}}});
    app.answer('manage.CheckEpisode',{result:true});
    assert.ok(app.data.get('myshows_relevance_history_profile_a')?.[10]?.watch > 1578096000000);
});

test('ordinary NP list callback still completes when MyShows has no token', () => {
    const app=launch({np:true,storage:{myshows_token_profile_a:''}});
    let result; app.context.MyShows.getUnwatchedShowsWithDetails(value=>result=value);
    assert.ok(result, 'no-token response completes');
    assert.deepEqual(Array.from(result.shows),[]);
});
test('NP id-only episode arrays do not erase a known release date', () => {
    const app=launch({np:true,storage:{myshows_sort_order_profile_a:'relevance',
        myshows_relevance_history_profile_a:{10:{release:1578009600000,checked:Date.now()},
            20:{release:1578096000000,checked:Date.now()}}}});
    app.run(50); app.answerUrl('/myshows/watching?',{results:[
        {...cards[0],unwatched_episodes:[201]},{...cards[1],unwatched_episodes:[101]}]});
    assert.deepEqual(app.calls.at(-1).publish.items.map(c=>c.id),['2','1']);
});

test('relevance NP list callback completes an unauthenticated empty result', () => {
    const app=launch({np:true,storage:{myshows_token_profile_a:'',myshows_sort_order_profile_a:'relevance'}});
    let result; app.context.MyShows.getUnwatchedShowsWithDetails(value=>result=value);
    assert.ok(result,'empty response completes');
    assert.deepEqual(Array.from(result.shows),[]);
});

test('synced replacement token clears private history for its target profile', () => {
    const app=launch({sync:true,cards,storage:{myshows_relevance_history_profile_a:{10:{watch:1578096000000}}}});
    app.context.applySync('myshows_token_profile_a','another-account');
    assert.deepEqual(Object.keys(app.data.get('myshows_relevance_history_profile_a')),[]);
});
test('completed show undo refreshes history with Android channel off', () => {
    const card={id:1,name:'Alpha',original_name:'Alpha',myshowsId:10,remaining:1,
        progress_marker:'0/1',unwatchedEpisodes:[{id:101}]};
    const app=launch({cards:[card],storage:{myshows_sort_order_profile_a:'relevance',myshows_android_tv_profile_a:'false',
        myshows_serial_status_profile_a:{shows:[{id:10,title:'Alpha',watchStatus:'watching'}]},
        myshows_hash_map:{'1:first':{tmdbId:1,episodeId:101,seasonNumber:1,episodeNumber:1,
            airDate:'2020-01-01',timestamp:Date.now()}}}});
    app.run(50); answerHistory(app,10,history(null));
    app.emit('full',{type:'complite',data:{movie:card}}); app.emit('start',{card});
    app.emit('update',{data:{hash:'first',road:{percent:100}}}); app.answer('manage.CheckEpisode',{result:true});
    app.emit('update',{data:{hash:'first',road:{percent:0}}}); app.answer('manage.UnCheckEpisode',{result:true});
    answerHistory(app,10,history(null));
    assert.equal(app.data.get('myshows_relevance_history_profile_a')[10].watch,0);
});

test('DOM cards with older metadata follow the fresh relevance channel order', () => {
    const fresh=[{id:1,name:'Alpha',myshowsId:10,last_episode_to_myshows:{air_date:'2020-01-04'}},
        {id:2,name:'Bravo',myshowsId:20,last_episode_to_myshows:{air_date:'2020-01-03'}}];
    const app=launch({cards:fresh,storage:{myshows_sort_order_profile_a:'relevance',
        myshows_relevance_history_profile_a:{10:{checked:Date.now()},20:{checked:Date.now()}}}});
    const elements=fresh.map(c=>({card_data:JSON.parse(JSON.stringify(c)),classList:{contains:()=>true}}));
    elements[0].card_data.last_episode_to_myshows.air_date='2020-01-01';
    const order=[],container={children:elements,appendChild:e=>order.push(e.card_data.id)};
    elements.forEach(e=>e.parentNode=container);
    const section={querySelectorAll:()=>elements,querySelector:()=>null};
    app.context.document.querySelectorAll=q=>q==='.items-line__title'?[{textContent:'MyShows',closest:()=>section}]:[];
    app.run(50);
    assert.deepEqual(order,[1,2]);
});

test('cached relevance list returns once before history completes and remains on error', () => {
    const app=launch({cards,storage:{myshows_sort_order_profile_a:'relevance'}});
    const results=[];
    app.context.MyShows.getUnwatchedShowsWithDetails(result=>results.push(Array.from(result.shows,c=>c.id)));
    assert.deepEqual(results,[[1,2]],'cached cards return while history requests remain pending');
    answerHistory(app,10,{error:{code:500}}); answerHistory(app,20,{error:{code:500}});
    assert.deepEqual(results,[[1,2]],'history does not redeliver the list callback');
});
test('fresh relevance list returns once before viewing history completes', () => {
    const app=launch({storage:{myshows_sort_order_profile_a:'relevance'}});
    const results=[];
    app.context.MyShows.getUnwatchedShowsWithDetails(result=>results.push(Array.from(result.shows,c=>c.id)));
    app.answer('lists.EpisodesUnwatched',{result:[{show:{id:10,title:'Alpha',titleOriginal:'Alpha',year:2020},
        episodes:[{id:101,seasonNumber:1,episodeNumber:1,shortName:'s01e01',airDate:'2020-01-01'}]}]});
    app.answerUrl('search/tv',{results:[{id:1,name:'Alpha',original_name:'Alpha',first_air_date:'2020-01-01'}]});
    app.answerUrl('/tv/1?',{id:1,name:'Alpha',original_name:'Alpha',first_air_date:'2020-01-01',seasons:[{season_number:1}]});
    app.answer('shows.GetById',{result:{episodes:[{id:101,seasonNumber:1,episodeNumber:1,airDate:'2020-01-01'}]}});
    assert.deepEqual(results,[[1]],'enriched fresh list returns while history remains pending');
    answerHistory(app,10,history('2020-01-02'));
    assert.deepEqual(results,[[1]],'history updates cards without another list callback');
});
