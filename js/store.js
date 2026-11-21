/* =====================================================================
 *  お店の画面（タブレットで開いておく想定）
 *  届いた注文を「受け付ける → 調理完了 → お渡し済み」と進める。
 *  受け付けた注文は、受け取りの30分前（TAKEOUT.cookBefore）までは「受付済み」に入り、それを過ぎると「調理中」に移る。
 *  ★ポイント・スタンプは、この画面では一切操作しない（2026-11-02 ko-dai さんの指示）。お渡し済みのあとのスタンプは、受け口と公式アプリの側で動く。
 *  予約注文（前の名前は「電話・店頭の注文」）も、ここから入れる。
 *  ★テイクアウトの操作は、すべてこの画面でする（2026-10-30 ko-dai さん。予約ボードのテイクアウトの画面は見るだけ）
 *  ★お店に置くスタンプのQRを出す・印刷する・作り直すボタンは、2026-10-30 に外した（ko-dai さんの指示）
 *  ★LINE のポイントの引き継ぎのQRを出すボタンは、2026-11-01 に外した（ko-dai さんの指示）
 *
 *  注文の置き場所は、公式アプリと同じ切り替え ORDERS_ONLINE（data.js の TAKEOUT.online を ../js/order-api.js が読む）で変わる
 *  ・false（試作）：このブラウザの中の注文（DB 'orders'）。お客様の画面を同じブラウザで開くと届く
 *  ・true：受け口（予約ボードの受け口・コード.gs）。15秒ごとに読み直す（orders）。進める・承認する・取り消す・電話の注文は saveOrder、
 *    受付の切り替えは setTakeout。この Mac で試すときは、にせの受け口（予約ボード/受け口/にせの受け口.py）が配るアドレスに ?test を付けて開く
 * ===================================================================== */

const NEXT = {
  new:      { to: 'accepted', label: '受け付ける' },
  accepted: { to: 'ready',    label: '調理完了' },   // 2026-11-02 ko-dai さんの指示（前は「できあがり」）。行き先の列の名前も 2026-11-04 に「調理完了・お渡し待ち」へ
  ready:    { to: 'done',     label: 'お渡し済み' },
};
const BACK = { accepted: 'new', ready: 'accepted', done: 'ready' };
// 申請（配達・大量注文）は、承認したら accepted。戻すと申請に戻る
// お客様のアプリからの配達・大量注文の申請か（承認して決まる注文）。★予約注文で入れた配達（2026-11-15 から）は、申請でなく、はじめから受け付けた形。
// 公式アプリの isRequest（../js/common.js）は種類（配達・大量注文）だけで見るので、Order受付では経路も見る（予約注文の経路は「予約」。前の注文は「電話」「店頭」）
// ★返事をしていない申請（status が request）は、経路にかかわらず申請として出す
const appRequest = o => isRequest(o) && (o.status === 'request' || !['予約', '電話', '店頭'].includes(o.route));
const backOf = o => o.status === 'accepted' && appRequest(o) ? 'request' : BACK[o.status];
const nextLabel = o => o.kind === 'delivery' && o.status === 'ready' ? 'お届け済み' : NEXT[o.status]?.label;
// 受け付けた・承認したが、まだ調理を始める前（受け取り・お届けの TAKEOUT.cookBefore 分前まで）の注文は「受付済み」に置く。その時刻を過ぎると「調理中」に移る。
// 「できしだい」は、受け付けたらすぐ調理中。見分けは common.js の isBooked（お客さまの画面の「受付済み」と同じ。2026-10-30 ko-dai さん）
const who = o => o.name ? `${o.name} 様` : 'お名前なし';   // 店頭の注文は、お名前を聞かないことがある

// バグる Owner（フォルダーアプリ。../バグるOwner/）から開いたとき（?from=owner）だけ、上の帯と合言葉の画面に「🏠 ホーム」を出す
// （2026-10-30 ko-dai さんの指示。フォルダーアプリのセッションに頼まれた）。印はこのタブの sessionStorage にも残し、「↻ 更新」のあとも出し続ける。
// 戻り先は、開いたアプリが控えた sessionStorage の bg.owner（?test で開いたときは ?test 付き）。無ければ、端末に残る localStorage の bg.hub
// （バグる Owner・バグる Staff が開いたときに自分のアドレスを入れる。社員の端末では Staff になる。2026-11-01 ko-dai さんの指示）。
// ★お店のタブレットのホーム画面から開いたときは出さない
// バグる Staff から開いたときは、アドレスに hub=staff の印が付く。控えが消えた・Owner のものになっていても、印を見て必ず Staff に戻す
// （2026-11-02 ko-dai さんの報告。バグる Owner のセッションに頼まれた）。★逆向き（印が無ければ Owner）は入れない。印の無い古いアドレスが開いたままの端末で、Staff の社員が Owner に飛ぶ
// お店用アプリの引っ越し（../お店用アプリの引っ越し.md）で、Owner・Staff も t3dining-store に移った（2026-11-05。ko-dai さんの「案1と案4で進める」）
const OWNER_URL = 'https://t3dining-store.github.io/baguru-owner/';
const STAFF_URL = 'https://t3dining-store.github.io/baguru-staff/';
const FROM_OWNER = (() => {
  const mark = /[?&]from=owner\b/.test(location.search);
  try {
    if (mark) sessionStorage.setItem('bg.fromOwner', '1');
    return sessionStorage.getItem('bg.fromOwner') === '1';
  } catch (e) { return mark; }
})();
function goOwner() {
  let to = '';
  try { to = sessionStorage.getItem('bg.owner') || ''; } catch (e) {}
  if (!to) try { to = localStorage.getItem('bg.hub') || ''; } catch (e) {}
  if (/[?&]hub=staff\b/.test(location.search) && !/staff/i.test(to)) to = STAFF_URL;   // /staff/ は、手元の ?test 付きのアドレス（バグるStaff/?test）を残すため
  location.href = to || OWNER_URL;
}

const RING_EVERY = 3000;   // 受付待ちの注文があるあいだ、この間隔（ミリ秒）で鳴らし続ける
const CHIME_URL = 'snd/order.wav';   // 注文が入ったときの音（1.8秒。道具/注文の音を作る.py で作る）
const COOK_URL = 'snd/cook.wav';     // 調理を始める時間の音（2.7秒。高めの「ピンポン」を3回。2026-11-04 ko-dai さんが候補から選んだ。同じ道具で作る）
const COOK_RINGS = 3;                // 調理を始める時間の音を、RING_EVERY の間隔で何回鳴らすか
const CANCEL_URL = 'snd/cancel.wav';   // お客様が注文を取り消したときの音（1.8秒。低いブザーの「ブッ・ブー」を2回。同じ道具で作る）
const CANCEL_RINGS = 2;                // 取り消しの音を、RING_EVERY の間隔で何回鳴らすか
const QUICK_URL = 'snd/quick.wav';     // 即予約が入ったときの音（1.9秒。手で振る鐘の「カランカラン」を2回。お店の入口のベルのように。同じ道具で作る。2026-11-06）。「確認」を押すまで RING_EVERY ごとに鳴らし続ける
const COOK_GLOW = 60000;             // 調理中に移った注文を光らせて「調理開始」の札を付けておく長さ（ミリ秒）

// タブレット（iPad など。画面の短いほうが600以上）は、開いたときから音はオン。「音」のボタンで、そのときだけ止められる。
// スマホは前のように、音はオフで始まり「音」のボタンで選ぶ（2026-10-30 ko-dai さん）。パソコンはタブレットと同じ扱い
const TABLET = Math.min(screen.width, screen.height) >= 600;
let soundOn = TABLET;
let audio = null;
let chime = null;   // 読み込んだ音。読めなかったときは、前の「ピッピッ」で鳴らす
let cookChime = null;   // 調理を始める時間の音。読めなかったときは、低い「ピッピッ」で鳴らす
let cancelChime = null;   // お客様が取り消したときの音。読めなかったときは、もっと低い「ピッピッ」で鳴らす
let quickChime = null;    // 即予約が入ったときの音。読めなかったときは、高い「ピッピッ」で鳴らす
let ringTimer = null;
let quietUntil = 0;   // この時刻までは、受付待ちの音を休む（取り消しの音と重ねないため）
// 新しく届いた注文に印を付けるため。受け口につないだときは、はじめて読めたときに埋める（開いたときからある注文には印を付けない）
// 注文ごとの前の様子（id → status）も控える。お客様の取り消しを見分けるため
let known = ORDERS_ONLINE ? null : new Map(getOrders().map(o => [o.id, o.status]));
const fresh = new Set();
const cookNow = new Set();   // 受付済みから調理中に移ったばかりの注文（光らせる）

/* ---------------------------------------------------------------------
 *  受け口とのやりとり（ORDERS_ONLINE のときだけ）
 *  ・合言葉は予約ボードと同じもの。予約ボードと同じ所（localStorage の baguru.daicho.pin）に置くので、同じブラウザなら1回入れれば両方で使える。
 *    受け口に「合言葉が違う」と言われたら消して、入れ直してもらう（予約ボードと同じ）
 *  ・受け口の注文は、このブラウザの DB 'orders' に入れない（同じブラウザで公式アプリを開くと、お客様の「自分の注文」に混ざるため）。
 *    画面を開いているあいだだけ持ち、開き直したら読み直す
 * --------------------------------------------------------------------- */

const PIN_KEY = 'baguru.daicho.pin';
const POLL_EVERY = 15000;   // 受け口に頼まれた 10〜20秒
const ASK_LIMIT = 30000;    // 受け口の返事を待つ長さ（ミリ秒）
const STALE_AFTER = 60000;  // これだけ注文を読めていないと、わけが分からなくても上の帯を赤くする
// orders：受け口の注文／accepting：受付中か／at：最後に読めた時刻／error：読めなかったわけ
// gen：進めた回数。読んでいるあいだに進めたら、その読んだ答えは古いので使わない
// quick：今日の、まだ来ていない即予約（受け口 2026-11-06a から。下の「即予約の知らせ」）
// rsv：今日入った、今日の、ネット（ホームページ・アプリ）からの予約（受け口 2026-11-22a から。下の「当日の予約の知らせ」）
const net = { orders: [], accepting: true, at: 0, error: '', gen: 0, loading: null, quick: [], rsv: [] };
const STAFF_MSG = {
  bad_pin: '合言葉が違います。',
  locked: '受け口が止まっています（合言葉を何度も間違えた人がいたため。10分で戻ります）。',
  conflict: 'ほかの端末で、この注文が先に変わっていました。いまの様子を出したので、もう一度確かめてください。',
  not_found: 'この注文が見つかりませんでした。「更新」を押して確かめてください。',
  bad_date: '受け取りの日時を確かめてください。',
  bad_tel: '電話番号を確かめてください。',
  need_lines: '品物を1つ以上入れてください。',
  bad_input: '入れた内容を確かめてください。',
  bad_status: '注文の様子を変えられませんでした。「更新」を押して確かめてください。',
  not_setup: '受け口の準備がまだです（予約ボードの引き継ぎ書の setup）。',
  not_ready: '受け口の場所を読めませんでした。Wi-Fi・電波を確かめて「更新」を押してください。',
  no_answer: '受け口から返事がありませんでした。少し待って、もう一度お試しください。',
  too_big: 'アプリの中身が大きすぎて保存できませんでした（バグるマネージで、写真や文を減らしてください）。',
  offline: 'つながりませんでした。Wi-Fi・電波を確かめてください。',
};
const staffText = e => STAFF_MSG[e?.code] || STAFF_MSG.offline;
const quiet = e => e?.code === 'bad_pin';   // 合言葉の画面に出すので、ほかには出さない

function pinGet() { try { return localStorage.getItem(PIN_KEY) || ''; } catch (e) { return ''; } }
function pinSet(v) { try { if (v) localStorage.setItem(PIN_KEY, v); else localStorage.removeItem(PIN_KEY); } catch (e) {} }

/** 受け口に送る。ASK_LIMIT 待っても返事が無ければ、あきらめる（2026-11-01。Codex のレビューの指摘）。
 *  ★通信が終わらないまま待ち続けると、読み直しが止まるのに帯は緑のままになり、新しい注文も音も来なくなる。
 *  あきらめても受け口には届いていることがある。進める操作は expect、電話の注文は rid が付くので、押し直しても二重にならない */
function ask(payload) {
  let timer;
  const limit = new Promise((_, ng) => { timer = setTimeout(() => ng(Object.assign(new Error('no_answer'), { code: 'no_answer' })), ASK_LIMIT); });
  return Promise.race([orderPost(payload), limit]).finally(() => clearTimeout(timer));
}

/** 合言葉を付けて受け口に送る。合言葉が違うと言われたら、合言葉の画面を出す。
 *  ★止まっている（locked）ときは、合言葉を消さない（2026-10-31 ko-dai さんの指示。予約ボードと同じ）。だれかが間違えて止まっているだけで、この端末の合言葉は正しい。
 *  消すと同じブラウザの予約ボードの合言葉も消える。上の帯を赤くして読み直しつづけ、戻ったら元の画面に戻る */
async function staffPost(payload) {
  try {
    return await ask({ ...payload, pin: pinGet() });
  } catch (e) {
    if (quiet(e)) askPin(staffText(e));
    throw e;
  }
}

/** 受け口が返した注文の並び（orders の答え）を、画面の注文にする */
function take(r) {
  net.orders = (r.orders || []).map(fromStore);
  net.accepting = r.accepting !== false;
  net.quick = Array.isArray(r.quick) ? r.quick : [];   // 前の版の受け口には quick が無い。そのときは何も出さない
  net.rsv = Array.isArray(r.rsvToday) ? r.rsvToday : [];   // 前の版の受け口には rsvToday が無い。そのときは何も出さない
  const added = [...quickNew(), ...rsvNew()].filter(q => !quickTold.has(q.id));
  if (added.length) { added.forEach(q => quickTold.add(q.id)); ringNext = 'quick'; ring(false); }   // 新しい即予約・当日の予約は、このあとの render ですぐ鳴る
  checkNew();
}
/** 受け口が返した1件を、画面の注文に入れる（無ければ足す） */
function put(o) {
  const i = net.orders.findIndex(x => x.id === o.id);
  if (i >= 0) net.orders[i] = o; else net.orders.push(o);
}

/** 受け口の注文を読み直す（15秒ごと・画面に戻ったとき） */
function pull() {
  if (!ORDERS_ONLINE) return Promise.resolve();
  // 同じブラウザの予約ボードでログアウトすると、合言葉が消える（置き場所が同じ）。黙って読むのを止めないで、合言葉の画面を出す
  if (!pinGet()) {
    if ($('#pinGate').hidden) askPin('合言葉が消えました（同じブラウザの予約ボードでログアウトしたときなど）。もう一度入れてください。');
    return Promise.resolve();
  }
  if (net.loading) return net.loading;
  const gen = net.gen;
  net.loading = staffPost({ action: 'orders' })
    .then(r => { net.error = ''; net.at = Date.now(); if (gen === net.gen) take(r); sendQuickSeen(); })   // 届かなかった即予約の「確認」は、ここで送り直す
    .catch(e => { net.error = staffText(e); })
    .then(() => { net.loading = null; render(); });
  return net.loading;
}

/** 合言葉の画面を出す（はじめて・合言葉が違うと言われたとき） */
function askPin(msg = '') {
  pinSet('');
  net.orders = [];
  net.quick = [];
  net.rsv = [];
  known = null;
  $('#pinGate').hidden = false;
  $('#pinErr').textContent = msg;
  $('#pinErr').hidden = !msg;
  setTimeout(() => $('#pin').focus(), 50);
  render();
}

/** 画面の注文（試作はこのブラウザの中、受け口につないだときは受け口から読んだもの） */
const list = () => ORDERS_ONLINE ? net.orders : getOrders();
const isAccepting = () => ORDERS_ONLINE ? net.accepting : DB.get('accepting', true);

/** 注文を進める・直す。受け口につないだときは saveOrder（読んだときの更新日時 expect を付けて、ほかの端末と重ならないようにする）。
 *  うまくいったら true。だめなときは、わけを出して false */
async function change(o, patch) {
  if (!ORDERS_ONLINE) { updateOrder(o.id, patch); render(); return true; }
  net.gen++;
  try {
    const r = await staffPost({ action: 'saveOrder', row: { id: o.id, ...patch }, expect: o.updatedAt });
    put(fromStore(r.row));
    return true;
  } catch (e) {
    if (e.data?.row) put(fromStore(e.data.row));   // 先に変わっていた（conflict）・順番が合わない（bad_status）ときは、受け口が今の様子を返す
    if (!quiet(e)) alert(staffText(e));
    return false;
  } finally {
    net.gen++;   // 送っているあいだに読み始めた答えも、古いことがあるので使わない
    render();
  }
}

/** 注文の受付を止める・始める */
async function setAccepting(on) {
  if (!ORDERS_ONLINE) { DB.set('accepting', on); return; }
  net.gen++;   // 読んでいる途中の答えの受付中・停止は古いので使わない（スイッチが元に戻らないように）
  try {
    const r = await staffPost({ action: 'setTakeout', accepting: on });
    net.accepting = r.accepting !== false;
  } catch (e) {
    if (!quiet(e)) alert(staffText(e));
  } finally {
    net.gen++;
  }
}

/** 上の細い帯：試作か、受け口から読めているか */
function paintNet() {
  const bar = $('#netBar');
  if (!ORDERS_ONLINE) {
    bar.className = 'net-bar demo';
    bar.textContent = '試作版：お客様の画面（index.html）と同じブラウザで開くと、注文が届く様子を試せます。';
    return;
  }
  const test = TAKEOUT.online ? '' : '試し（にせの受け口）・';
  const last = net.at ? `最後に読めたのは ${hhmm(new Date(net.at))}。` : '';
  const stale = net.at && Date.now() - net.at > STALE_AFTER;
  bar.className = `net-bar ${net.error || stale ? 'ng' : 'ok'}`;
  bar.textContent = net.error || stale ? `⚠ ${test}${net.error || '注文を読めていません。'}${last}新しい注文が届いていないかもしれません。`
    : net.at ? `${test}${hhmm(new Date(net.at))} に注文を読みました（${POLL_EVERY / 1000}秒ごとに読み直します）`
    : `${test}読み込んでいます…`;
}

/* 音を出せるようにする。
   ★ブラウザの決まりで、画面に一度も触っていないページは音を出せないことがある（iPad はいつも。Android はホーム画面に置いたアプリなら出せる）。
   触ったその場でこれを呼ぶと、そのあとは鳴らせる。触る前に呼んでも、出せる端末ならそのまま鳴らせるようになる */
function unlockSound() {
  if (!audio) {
    // iPad が消音でも鳴らす（2026-11-02 ko-dai さんの報告。iPadOS 16.4 から。それより前の端末には無い）。同じ端末で音楽を流していると、鳴るときに止まる
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    audio = new (window.AudioContext || window.webkitAudioContext)();
    audio.onstatechange = () => { checkSound(); render(); };   // 止まった（スリープ・電話など）・また鳴らせるようになった
  }
  const resumed = audio.resume().catch(() => {});
  const s = audio.createBufferSource();   // iPad の Safari は、触ったその場で一度鳴らさないと、あとで音を出せない。聞こえない音を鳴らしておく
  s.buffer = audio.createBuffer(1, 1, 22050);
  s.connect(audio.destination);
  s.start();
  return loadChime().then(() => resumed);
}

// タブレットで、音がオンなのに出せないあいだは、画面いっぱいに「画面をタッチしてください」を出す（触ると音が出せるようになる）。
// スマホには出さない（前のように「音」のボタンで選ぶ）
function checkSound() {
  $('#soundGate').hidden = !(TABLET && soundOn && (wakeTouch || !audio || audio.state !== 'running'));
}
/* 画面を消して（タブレットのスリープ）長くたってから戻ったときは、音が出せるように見えても「画面をタッチしてください」を出す（2026-11-20 ko-dai さんの指示
   「営業後 iPad でアプリを立ち上げたまま画面だけ OFF にして翌日 ON にする。アプリを再度立ち上げなくても、受付の確認音が最初に流れるように」）。
   ★iPad は、画面を消していたあと、触るまで音が出ないことがある（音を出せる様子は running のままでも）。画面のロックを外す操作は、この画面へのタッチに数えられない。
   そのため、自動で鳴らすのでなく、触ってもらって音を出せるようにし、確認の音を1回鳴らす（soundOnNow）。少しだけほかのアプリを見て戻ったときは出さない */
const WAKE_TOUCH_AFTER = 10 * 60000;   // これより長く画面が消えていたら、触ってもらう
let hiddenAt = 0;
let wakeTouch = false;   // 触って確認の音を鳴らすまで、「画面をタッチしてください」を出す

function loadChime() {
  if (!audio) return Promise.resolve();
  const load = url => fetch(url)
    .then(r => r.arrayBuffer())
    .then(b => new Promise((ok, ng) => audio.decodeAudioData(b, ok, ng)))   // 古い Safari は、この書き方しか使えない
    .catch(() => null);
  return Promise.all([chime || load(CHIME_URL), cookChime || load(COOK_URL), cancelChime || load(CANCEL_URL), quickChime || load(QUICK_URL)])
    .then(([a, b, c, d]) => { chime = a; cookChime = b; cancelChime = c; quickChime = d; });
}

/** 音を1回鳴らす。ふだんは注文の音。buf が読めていないときは、freq の高さの「ピッピッ」 */
function beep(buf = chime, freq = 880) {
  if (!soundOn || !audio) return;
  if (audio.state !== 'running') audio.resume().catch(() => {});   // タブレットがしばらく裏に回ると止まることがある（iPad は suspended でなく interrupted にもなる）
  if (buf) {
    const s = audio.createBufferSource();
    s.buffer = buf;
    s.connect(audio.destination);
    s.start();
    return;
  }
  [0, 0.28].forEach(t => {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, audio.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.4, audio.currentTime + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.22);
    o.connect(g).connect(audio.destination);
    o.start(audio.currentTime + t);
    o.stop(audio.currentTime + t + 0.25);
  });
}

// 受付待ちの注文・返事をしていない申請・確認していない即予約があるあいだは鳴らし続け、なくなったら（受け付けた・確認した）止める。
// 即予約の音は、注文の音と同じく RING_EVERY ごと（2026-11-06 ko-dai さんの指示「確認を押すまでずっと鳴り続けるように」）。
// 両方あるときは交互に鳴らす（どちらも聞こえるように）。新しく入ったほうを先に鳴らす（ringNext）
let ringNext = '';
// 当日の予約も、即予約と同じ音（'quick'。2026-11-22 ko-dai さんの指示）
const ringNeeds = () => [...(quickNew().length || rsvNew().length ? ['quick'] : []), ...(list().some(o => ['new', 'request'].includes(o.status)) ? ['order'] : [])];
function ringTick() {
  if (Date.now() < quietUntil) return;   // 取り消しの音の途中
  const need = ringNeeds();
  if (!need.length) return;
  const what = need.includes(ringNext) ? ringNext : need[0];
  ringNext = need.find(x => x !== what) || what;
  if (what === 'quick') beep(quickChime, 1568); else beep();
}
function ring(on) {
  if (on && !ringTimer) { ringTick(); ringTimer = setInterval(ringTick, RING_EVERY); }
  if (!on && ringTimer) { clearInterval(ringTimer); ringTimer = null; }
}

/** 受け取りの日が、今日から何日後か（0＝本日。過ぎた日はマイナス） */
function daysAhead(t, now = new Date()) {
  const a = new Date(now); a.setHours(0, 0, 0, 0);
  const b = new Date(t); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}

/** カードのいちばん上の帯：本日の受け取りか、明日より先か（2026-10-30 ko-dai さんの指示。注文が入ったときに、ひと目でわかるように）。
 *  進めている注文（受付待ち・申請・受付済み・調理中・できあがり）にだけ付ける */
// 配達の注文は「お届け」でなく「配達」と出す（2026-11-15 ko-dai さんの指示。予約注文の窓の「配達時間」とそろえた）。公式アプリの whenWord（../js/common.js）は変えない
const whenOf = o => o.kind === 'delivery' ? '配達' : '受け取り';
function dayStrip(o, t) {
  const d = daysAhead(t);
  const word = `の${whenOf(o)}${o.status === 'request' ? '（希望）' : ''}`;
  if (d === 0) return `<div class="c-day today">本日${word}</div>`;
  const text = d === 1 ? `明日 ${mdw(t)}${word}` : d > 1 ? `${mdw(t)}${word}・${d}日後` : `${mdw(t)}${word}（過ぎた日）`;
  return `<div class="c-day later">${text}</div>`;
}

/* 受付済みから調理中に移った注文を、音で知らせる（2026-11-01 ko-dai さんの指示。音は注文が入ったときと別の「ピンポーン」）。
   受付待ちと違い、押して止める操作は無いので、COOK_RINGS 回で止まる。カードは COOK_GLOW のあいだ光り、「調理開始」の札が付く。
   鳴らした注文は端末に控える（DB 'cookRung'）ので、「↻ 更新」で開き直しても2回鳴らない。閉じているあいだに時刻を過ぎた分は、開いたときに鳴る */

/** 調理を始める時刻を過ぎた、今日の受け取りの注文か。受付済みに一度も入らなかった注文（できしだい・時刻を過ぎてから受け付けた注文）は入れない。
 *  受け取りの時刻まで過ぎたものは、もう鳴らさない */
function toCook(o, now = new Date()) {
  if (o.status !== 'accepted' || o.asap || beforeCook(o, now)) return false;
  const t = new Date(o.pickupAt);
  return t > now && dateKey(t) === dateKey(now) && new Date(o.times?.accepted) < t - TAKEOUT.cookBefore * 60000;
}

function checkCook(all) {
  const rung = DB.get('cookRung', []);
  const due = all.filter(o => toCook(o) && !rung.includes(o.id));
  if (!due.length) return;
  if (soundOn && audio?.state !== 'running') return;   // いま音を出せない（「画面をタッチ」の前など）。出せるようになったら鳴らす
  const ids = due.map(o => o.id);
  DB.set('cookRung', [...rung, ...ids].slice(-200));
  ids.forEach(id => cookNow.add(id));
  for (let i = 0; i < COOK_RINGS; i++) setTimeout(() => beep(cookChime, 587), i * RING_EVERY);
  setTimeout(() => { ids.forEach(id => cookNow.delete(id)); render(); }, COOK_GLOW);
}

/* 注文の値段と食数を、この画面でも計算し直して確かめる（2026-11-01。Codex のレビューの指摘。公式アプリのセッションの案）。
   受け口はメニューを持たず、送られた値段をそのまま受ける。受け口で断ると正しい注文まで断る危険があるので、合わない注文はカードに知らせて、お店の人が見る。
   バグるマネージで値段を変えた直後は、前の値段の注文にも出ることがある */

// バグるマネージで名前を直すと、お客様のアプリからは直した字で届く（order-api.js の oneLine）。直す前の注文と電話の注文は元の字
// 2026-11-02 にご飯の量の名前を変えた（data.js の RICE）。変える前に受けた注文は前の字のまま。明日より先の注文があるので、はけるまで見分ける
const OLD_OPT = { 'ご飯大盛り': 'ご飯大盛', 'ご飯特盛り': 'ご飯特盛' };
const sameOpt = (name, text) => name === text || oneLine(name) === text || OLD_OPT[text] === name;

/** 選択の字（opts の1つ）が、品物のどのグループのどれか。{ g, p: 足す金額 }。分からなければ null */
function optOf(item, text) {
  for (const g of item.groups || []) {
    if (g.type === 'count') {
      for (let m = 1; m <= (g.max || 10); m++) if (sameOpt(`${g.choices[0].n}×${m}`, text)) return { g, p: g.choices[0].p * m };
    } else {
      const c = g.choices.find(x => sameOpt((g.type === 'one' ? g.label || '' : '') + x.n, text));
      if (c) return { g, p: c.p || 0 };
    }
  }
  return null;
}

/** 1行の正しい単価と、メニューと合わない所（common.js の priceOf の逆。opts の字から、選んだものを探す）。{ unit, issue }。合わなければ unit は null。
 *  2026-11-05 の Codex のレビュー：品物の id と名前は別々に届くので、名前もメニューと照らす（安い品物の id に高い品物の名前を付けると、値段は合ってしまう）。
 *  1つだけ選ぶグループの重なりと、必ず選ぶもの（ソース・味・サイズなど「普通」の無いもの）の抜けも見る */
function lineCheck(l) {
  const st = SET_BY_ID[l.id];
  if (st) {   // 予約注文で別の品物として打ったセット（2026-11-15。値段は選ぶものの値段）
    const ch = setChoice(st);
    if (!ch) return { unit: null, issue: `「${l.name}」はメニューに無いセットです` };
    if (l.name !== st.name || (l.opts || []).length) return { unit: null, issue: `「${l.name}」の名前がメニューと合いません（メニューでは「${st.name}」）` };
    return { unit: ch.p, issue: '' };
  }
  const item = ITEM_BY_ID[l.id];
  if (!item) return { unit: null, issue: `「${l.name}」はメニューに無い品物です` };
  if (!sameOpt(item.full || item.name, l.name)) return { unit: null, issue: `「${l.name}」の名前がメニューと合いません（メニューでは「${item.full || item.name}」）` };
  let unit = item.price;
  const used = new Map();   // グループ → 選んだ数
  for (const text of l.opts || []) {
    const hit = optOf(item, text);
    if (!hit) return { unit: null, issue: `「${l.name}」に、メニューに無い選択「${text}」があります` };
    used.set(hit.g, (used.get(hit.g) || 0) + 1);
    unit += hit.p;
  }
  if (new Set(l.opts || []).size !== (l.opts || []).length) return { unit: null, issue: `「${l.name}」に、同じ選択が2つ入っています` };
  for (const g of item.groups || []) {
    const n = used.get(g) || 0;
    if (n > 1 && g.type !== 'many') return { unit: null, issue: `「${l.name}」の「${g.name}」が2つ入っています` };
    if (!n && g.type === 'one' && g.required && !g.choices.some(c => c.plain)) return { unit: null, issue: `「${l.name}」の「${g.name}」が選ばれていません` };
  }
  return { unit, issue: '' };
}

/** 値段・食数・品物がメニューと合わない注文の知らせ（合っていれば ''）。進めている注文だけ見る */
function priceCheck(o) {
  if (!ACTIVE.includes(o.status)) return '';
  const checks = o.lines.map(lineCheck);
  const meals = mealCount(o.lines);
  const bad = checks.find(c => c.issue);
  if (bad) return `<p class="c-check">⚠ 品物を確認：${esc(bad.issue)}</p>`;
  const total = checks.reduce((s, c, i) => s + c.unit * o.lines[i].qty, 0);
  if (total !== o.total) return `<p class="c-check">⚠ 金額を確認：メニューどおりなら ${yen(total)} です</p>`;
  if (meals !== (o.meals || 0)) return `<p class="c-check">⚠ 食数を確認：品物から数えると ${meals}食 です</p>`;
  if (o.kind === 'pickup' && meals >= TAKEOUT.bulkMin) return `<p class="c-check">⚠ 食数を確認：${TAKEOUT.bulkMin}食からは大量注文です</p>`;
  return '';
}

/** カトラリーの有無（2026-11-01 ko-dai さんの指示。お客様が公式アプリで選ぶ）。o.cutlery が true なら付ける、false なら付けない。
 *  聞いていない注文（電話・店頭、前からの注文）は何も出さない */
/** 領収書（2026-11-15。予約注文の配達で入れる）。o.receipt：'none' なし／'to' 宛名あり（o.receiptTo）／'later' 宛名は後日連絡。聞いていない注文は何も出さない */
const receipt = o => o.receipt === undefined ? ''
  : o.receipt === 'none' ? '<p class="c-rcpt no">領収書なし</p>'
  : `<p class="c-rcpt">🧾 領収書あり：${o.receipt === 'later' ? '宛名は後日連絡' : `宛名「${esc(o.receiptTo)}」`}</p>`;
const cutlery = o => o.cutlery === true ? `<p class="c-cut yes">🍴 カトラリーを付ける${o.cutleryN ? `（${o.cutleryN}個）` : ''}</p>`
  : o.cutlery === false ? '<p class="c-cut no">✕ カトラリーは付けない</p>' : '';

/** 画面に出す選択（2026-11-02 ko-dai さんの指示）。ご飯の「並盛」とミートの「並」は公式アプリが注文に書かない（data.js の plain）ので、その字が無ければ「ご飯並盛」「ミート並」を足す。
 *  出すだけで、注文の中身（l.opts）は変えない。値段の確かめは l.opts のまま */
const SHOW_PLAIN = ['rice', 'meat'];
function shownOpts(l) {
  const shown = [...l.opts];
  const item = ITEM_BY_ID[l.id];
  const groups = item?.groups || [];
  groups.forEach((g, i) => {
    const plain = SHOW_PLAIN.includes(g.id) && g.choices.find(c => c.plain);
    // そのグループの選択がもうあるか。字の頭ではなく、選ぶものと照らす（バグるマネージで「ご飯大盛」の字を変えても、2つ出ないように。2026-11-05 の Codex のレビュー）
    if (!plain || l.opts.some(x => optOf(item, x)?.g === g)) return;
    // 注文の中と同じ並びに入れる
    const before = groups.slice(0, i);
    const at = shown.filter(x => before.some(b => b.choices.some(c => sameOpt((b.label || '') + c.n, x)))).length;
    shown.splice(at, 0, g.label + plain.n);
  });
  return shown;
}

function card(o) {
  const t = new Date(o.pickupAt);
  const isToday = dateKey(t) === dateKey(new Date());
  const live = ACTIVE.includes(o.status);   // 進めている注文には、上の帯（本日か明日より先か）を付ける。日付は帯に出す
  const late = ACTIVE.includes(o.status) && t < new Date();
  // 受付済みでも、今日の分は早くできたときのために「調理完了」を出す。明日より先の分は出さない
  const next = isBooked(o) && !isToday ? null : NEXT[o.status];
  const back = backOf(o);
  const place = [o.address, o.address2].filter(Boolean).join(' ');   // 予約注文の配達は、会社名・建物名だけのこともある
  const map = place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : '';
  const tags = [
    appRequest(o) ? `<span class="c-kind k-${o.kind}">${o.kind === 'delivery' ? '🚚 ' : ''}${KIND[o.kind]}・${o.meals || 0}食</span>` : '',
    !appRequest(o) && o.kind === 'delivery' ? '<span class="c-kind k-delivery">🚚 配達</span>' : '',   // 予約注文の配達（2026-11-15 ko-dai さんの指示。受付済みなどでも、ひと目で分かるように）
    appRequest(o) && needsFee(o) && o.fee == null ? '<span class="c-kind k-ask">要相談・配達料</span>' : '',
    cookNow.has(o.id) ? '<span class="c-kind k-cook">🔔 調理開始</span>' : '',
    o.asap ? '<span class="c-kind k-asap">今から受け取る</span>' : '',   // 前は「できしだい」（2026-11-06 ko-dai さんの指示で、お客さまのアプリ・予約ボードとそろえた）
    o.route && o.route !== 'アプリ' ? `<span class="c-kind k-route">${esc(o.route)}</span>` : '',   // 予約注文（いまは「予約」。前の注文は「電話」「店頭」）
  ].join('');
  const pay = o.kind !== 'delivery' ? '（店頭で支払い）'
    : `（お届けのときに現金で${o.fee != null && Number(o.fee) > 0 ? `・配達料 ${yen(Number(o.fee))} は別` : o.fee != null ? '・配達料なし' : needsFee(o) && appRequest(o) ? '・配達料は承認のときに決めます' : ''}）`;   // 予約注文の配達は、申請でないので承認が無い
  return `<article class="card ${fresh.has(o.id) ? 'fresh' : ''} ${cookNow.has(o.id) ? 'cook-now' : ''} ${late ? 'late' : ''} ${o.kind === 'delivery' ? 'is-delivery' : ''}">
      ${live ? dayStrip(o, t) : ''}
      <div class="c-top">
        <b class="c-no">${esc(o.no)}</b>
        <div class="c-time"><small>${live ? '' : `${isToday ? '今日' : mdw(t)} `}${whenOf(o)}${o.status === 'request' ? '（希望）' : ''}</small><b>${hhmm(t)}${o.asap ? '<i>頃</i>' : ''}</b>${ACTIVE.includes(o.status) && o.status !== 'request' ? `<em>${untilText(o.pickupAt)}</em>` : ''}</div>
      </div>
      ${tags ? `<div class="c-tags">${tags}</div>` : ''}
      <div class="c-who"><b>${esc(who(o))}</b>${o.tel ? `<a href="tel:${esc(o.tel)}">${esc(o.tel)}</a>` : ''}</div>
      ${o.kind === 'delivery' ? `<p class="c-addr">配達先：${esc([o.address, o.address2].filter(Boolean).join('　'))}${map ? `<a href="${map}" target="_blank" rel="noopener">地図</a>` : ''}</p>` : ''}
      <ul class="c-lines">${o.lines.map(l => `
        <li><b>${esc(l.name)}</b><span class="q">×${l.qty}</span>${shownOpts(l).length ? `<div class="c-opts">${shownOpts(l).map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}</li>`).join('')}
      </ul>
      ${cutlery(o)}
      ${receipt(o)}
      ${o.memo ? `<p class="c-memo">ご要望：${esc(o.memo)}</p>` : ''}
      <div class="c-sum"><span>合計${pay}</span><b>${yen(o.total)}</b></div>
      ${priceCheck(o)}
      ${soldCheck(o)}
      ${o.shopMsg && o.status !== 'declined' ? `<p class="c-msg">お客様への一言：${esc(o.shopMsg)}</p>` : ''}
      ${o.status === 'canceled' ? `<p class="c-cancel">取り消し（${esc(o.canceledBy || '')}）</p>` : ''}
      ${o.status === 'declined' ? `<p class="c-cancel">お断りしました${o.shopMsg || o.declineNote ? `（${esc(o.shopMsg || o.declineNote)}）` : ''}</p>` : ''}
      ${canAdjust(o) ? `<button class="b-time" data-act="time" data-id="${esc(o.id)}">🕐 できあがり時間を調整</button>` : ''}
      ${canEdit(o) ? `<button class="b-edit" data-act="edit" data-id="${esc(o.id)}">✎ 内容を直す${o.kind === 'delivery' ? '' : '・配達に変える'}</button>` : ''}
      <div class="c-btns">
        ${o.status === 'request' ? `
          <button class="b-sub danger" data-act="decline" data-id="${esc(o.id)}">お断りする</button>
          <button class="b-main b-approve" data-act="approve" data-id="${esc(o.id)}">承認する</button>` : `
        ${back ? `<button class="b-sub" data-act="back" data-id="${esc(o.id)}">戻す</button>` : ''}
        ${NEXT[o.status] ? `<button class="b-sub danger" data-act="cancel" data-id="${esc(o.id)}">取り消す</button>` : ''}
        ${next ? `<button class="b-main b-${next.to}" data-act="next" data-id="${esc(o.id)}">${nextLabel(o)}</button>` : ''}`}
      </div>
    </article>`;
}

/** 注文が終わった日（お渡し済み・取り消し・お断りにした日）。古い形の注文は、更新か受けた日で見る */
const endedDay = o => dateKey(new Date(o.times?.[o.status] || o.updatedAt || o.createdAt || o.pickupAt));

function render() {
  const all = list();
  const today = dateKey(new Date());
  checkCook(all);
  ringCancel();
  paintQuick();
  paintRsv();
  paintSold();
  const byTime = (a, b) => a.pickupAt.localeCompare(b.pickupAt);
  for (const col of $$('.col')) {
    const items = all.filter(o => o.status === col.dataset.col && !isBooked(o)).sort(byTime);
    $('.n', col).textContent = items.length;
    $('.list', col).innerHTML = items.length ? items.map(card).join('') : '<p class="none">ありません</p>';
  }
  const later = all.filter(o => isBooked(o)).sort(byTime);
  $('.booked .n').textContent = later.length;
  $('.booked .list').innerHTML = later.length ? later.map(card).join('') : '<p class="none">ありません</p>';
  // 今日終わった注文だけ。日付が変わると消え、次の日の開店のときは空になる（2026-11-01 ko-dai さんの指示。前は受けた日・受け取りの日で見ていたので、前の日に取り消した今日の受け取りの注文が残った）
  const past = all.filter(o => ['done', 'canceled', 'declined'].includes(o.status) && endedDay(o) === today).reverse();
  $('.past .n').textContent = past.length;
  $('.past .list').innerHTML = past.length ? past.map(card).join('') : '<p class="none">ありません</p>';
  const reqs = all.filter(o => o.status === 'request').sort(byTime);
  $('.reqs').hidden = !reqs.length;
  $('.reqs .n').textContent = reqs.length;
  $('.reqs .list').innerHTML = reqs.map(card).join('');

  const accepting = isAccepting();
  $('#accepting').checked = accepting;
  $('#acceptText').textContent = accepting ? '注文を受け付け中' : '受付を止めています';
  $('.s-accept').classList.toggle('off', !accepting);
  // 受付待ちの注文と、返事をしていない申請があるあいだは鳴らし続ける
  const waiting = all.filter(o => ['new', 'request'].includes(o.status)).length;
  const quickN = quickNew().length + rsvNew().length;
  ring(soundOn && (waiting > 0 || quickN > 0));
  const askWhat = [quickNew().length && '即予約', rsvNew().length && '当日の予約'].filter(Boolean).join('・');
  const stops = [waiting > 0 && '受け付ける・申請に返事をする', quickN > 0 && `${askWhat}の「確認」を押す`].filter(Boolean).join('・');
  $('#sound').textContent = !soundOn ? '🔕 音：オフ（押すとオン）' : ringTimer ? `🔔 鳴っています（${stops}と止まります）` : '🔔 音：オン';
  $('#sound').classList.toggle('on', soundOn);
  $('#sound').classList.toggle('warn', !soundOn && (waiting > 0 || quickN > 0));
  document.title = (waiting ? `（${waiting}）` : '') + 'バグるOrder受付';
  paintNet();
}

/** お客様の取り消しの音を鳴らす。音を出せないあいだ（「画面をタッチ」の前・スリープから戻った直後など）に来た分は、出せるようになったら鳴らす。
 *  10分より前の分は鳴らさない（調理開始の音と同じ考え。2026-11-05 の Codex のレビュー） */
let cancelDue = 0;   // 鳴らしていない取り消しが来た時刻
function ringCancel() {
  if (!cancelDue) return;
  if (!soundOn || Date.now() - cancelDue > 600000) { cancelDue = 0; return; }
  if (audio?.state !== 'running') return;
  cancelDue = 0;
  quietUntil = Date.now() + CANCEL_RINGS * RING_EVERY - 100;   // ほかの受付待ちの音は、取り消しの音が終わるまで休む
  for (let i = 0; i < CANCEL_RINGS; i++) setTimeout(() => beep(cancelChime, 330), i * RING_EVERY);
}

function checkNew() {
  const all = list();
  if (!known) { known = new Map(all.map(o => [o.id, o.status])); return; }   // 受け口から、はじめて読めたとき
  const added = all.filter(o => !known.has(o.id));
  if (added.length) {
    added.forEach(o => fresh.add(o.id));
    ringNext = 'order';
    ring(false);   // 一度止めて、このあとの render で鳴らし直す（新しい注文はすぐ鳴る）
    setTimeout(() => { added.forEach(o => fresh.delete(o.id)); render(); }, 8000);
  }
  // お客様が取り消したら、取り消しとわかる音を鳴らす（2026-11-04 ko-dai さんの指示）。お客様が取り消せるのは、受付待ち・申請のあいだだけ（受け口の orderCancel_）。
  // お店で取り消した（canceledBy が「お店」）ときは鳴らさない。閉じているあいだに取り消された分も鳴らさない（新しい注文と同じ）
  const gone = all.filter(o => o.status === 'canceled' && o.canceledBy === 'お客様' && ['new', 'request'].includes(known.get(o.id)));
  if (gone.length) { cancelDue = Date.now(); ringCancel(); }
  known = new Map(all.map(o => [o.id, o.status]));
}

/* ---------------------------------------------------------------------
 *  即予約の知らせ（2026-11-06 ko-dai さんの指示「即予約が入ったら受付アプリに通知が入って音がなるように」。予約ボードのセッションに頼まれた）
 *  即予約は、15分以内に来店するお客さまの、すぐ確定するネット予約（../即予約の決めごと.md）。席・来店・取り消しは予約ボードでする。ここは知らせるだけ
 *  ・受け口（2026-11-06a から）の orders の答えの quick（今日の、まだ来ていない即予約。seen 付き）に seen が false のものがあるあいだ、上に帯を出して音を鳴らす
 *  ・「確認」で受け口の quickSeen を送る。どこか1台（予約ボードでも Order受付でも）で押せば、全部の端末で止まる（ko-dai さんが選んだ）。
 *    ほかの端末で押した分は、次に読んだとき（15秒ごと。返事を待つので20秒ほど）に消える。ボタンの名前は 2026-11-06 に「見た」から「確認」に変えた（ko-dai さんの指示）
 *  ・音は「確認」を押すまで、注文の音と同じく3秒ごとに鳴らし続ける（2026-11-06 ko-dai さんの指示。上の ring・ringTick。はじめは入ったとき2回・あと20秒ごとだった）
 *  ・前の版の受け口（quick が無い）・試作（ORDERS_ONLINE でない）のときは、何も出さない
 * --------------------------------------------------------------------- */
const quickMine = new Set();   // この端末で「確認」を押した即予約。受け口に届くまでのあいだ・届かなかったときも、この端末では帯を出さず、鳴らさない
const quickTodo = new Set();   // 受け口にまだ届いていない「確認」（つながらなかったときは、次に読めたときに送り直す）
const quickTold = new Set();   // 一度でも帯に出した即予約（新しく入ったものを、すぐ鳴らすため）
let quickSending = false;

const quickNew = () => net.quick.filter(q => q && !q.seen && !quickMine.has(q.id));
// お名前は、フリガナがあればカタカナで（予約ボードの帯と同じ）
const quickName = q => String(q.kana || '').replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60)).trim() || q.name || 'お名前なし';

/** 上の帯。例「即予約が入りました：18:30までに来店 2名 ミホン様（A1）他1件」。いちばん早く来るお客さまを出す（受け口が来店時刻の順に返す） */
function paintQuick() {
  const bar = $('#quickBar');
  if (!bar) return;   // 前の版の order.html が残っているとき
  const n = quickNew();
  bar.hidden = !n.length;
  if (!n.length) return;
  const q = n[0];
  const seats = Array.isArray(q.tables) && q.tables.length ? q.tables.join('・') : '席なし';
  $('#quickText').textContent = `即予約が入りました：${q.start}までに来店 ${q.people}名 ${quickName(q)}様（${seats}）${n.length > 1 ? ` 他${n.length - 1}件` : ''}`;
}

/** 「確認」を受け口に送る（quickSeen）。つながらなかった分は quickTodo に残し、次に読めたときに送り直す */
function sendQuickSeen() {
  if (quickSending || !quickTodo.size || !pinGet()) return;
  const ids = [...quickTodo].slice(0, 50);   // 受け口は1回に50個まで
  quickSending = true;
  staffPost({ action: 'quickSeen', ids })
    .then(r => {
      ids.forEach(id => quickTodo.delete(id));
      const done = Array.isArray(r.quickSeen) ? r.quickSeen : ids;
      [...net.quick, ...net.rsv].forEach(q => { if (q && done.includes(q.id)) q.seen = true; });
    })
    .catch(e => { if (!['no_answer', 'offline', 'not_ready', 'locked'].includes(e?.code)) ids.forEach(id => quickTodo.delete(id)); })   // 受け口が断った（形が違うなど）ときは、送り直さない
    .finally(() => { quickSending = false; render(); });
}

/* ---------------------------------------------------------------------
 *  当日の予約の知らせ（2026-11-22 ko-dai さんの指示「当日の予約が入った場合も受付アプリで表示されるようにして音で知らせてください／即予約と同じ音で大丈夫です」。
 *  予約ボードのセッションに頼まれた。ko-dai さんが選んだ：知らせるのはネットからの当日の予約だけ（ホームページ・アプリから入った今日の予約。承認待ちのリクエストも。
 *  お店で入れた予約は鳴らさない）・音は「確認」を押すまで鳴る）
 *  ・受け口（2026-11-22a から）の orders の答えの rsvToday（今日入った今日のネットの予約。リクエストと来店待ちだけ。即予約は quick のほうに出るので入らない）。
 *    seen が false のものがあるあいだ、即予約の帯の下に紫の帯を出し、即予約と同じ音（ring の 'quick'）を鳴らす
 *  ・「確認」は即予約と同じ quickSeen（同じ quickMine・quickTodo）。どこか1台で押せば全部の端末で止まる
 *  ・承認・お断りは予約ボードの「予約受付」でする（Order受付は知らせるだけ）
 * --------------------------------------------------------------------- */
const rsvNew = () => net.rsv.filter(r => r && !r.seen && !quickMine.has(r.id));
function paintRsv() {
  const bar = $('#rsvBar');
  if (!bar) return;   // 前の版の order.html が残っているとき
  const n = rsvNew();
  bar.hidden = !n.length;
  if (!n.length) return;
  const r = n[0], req = n.filter(x => x.status === 'リクエスト').length;
  const seats = Array.isArray(r.tables) && r.tables.length ? `（${r.tables.join('・')}）` : '';
  $('#rsvText').textContent = `当日の予約が入りました：${r.start} ${r.people}名 ${quickName(r)}様${seats}${r.dessert ? '・デザートプレート' : ''}${n.length > 1 ? ` 他${n.length - 1}件` : ''}`;
  $('#rsvSub').textContent = req
    ? `承認待ちのリクエストが${req}件あります。承認・お断りは予約ボードの「予約受付」でしてください（${r.route || 'ネット'}から）`
    : `承認済みの予約（来店待ち）です。席・来店・取り消しは予約ボードで（${r.route || 'ネット'}から）`;
}
$('#rsvOk')?.addEventListener('click', () => {
  rsvNew().forEach(r => { quickMine.add(r.id); quickTodo.add(r.id); });
  render();
  sendQuickSeen();
});

$('#quickOk')?.addEventListener('click', () => {
  quickNew().forEach(q => { quickMine.add(q.id); quickTodo.add(q.id); });
  render();   // この端末の帯と音は、すぐ止める（ほかに鳴らすものが無ければ）
  sendQuickSeen();
});

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const o = list().find(x => x.id === b.dataset.id);
  if (!o) return;
  const act = b.dataset.act;
  if (act === 'approve' || act === 'decline') return openDecide(o, act === 'approve');
  if (act === 'time') return openTime(o);
  if (act === 'edit') return openPhone(o);
  let patch = null;
  if (act === 'next' && NEXT[o.status]) patch = { status: NEXT[o.status].to };
  if (act === 'back' && backOf(o)) patch = { status: backOf(o) };
  // 調理を始めたあと（調理中・できあがり）は、キャンセル規定の一言を足す（2026-11-01 ko-dai さんの指示。規定は公式アプリに載っている）。お店の都合なら、これまでどおり取り消せる
  const cooked = o.status === 'ready' || (o.status === 'accepted' && !isBooked(o));
  if (act === 'cancel' && confirm(`注文番号 ${o.no}（${who(o)}）を取り消します。${cooked ? '\n\n★調理を始めたあとの、お客様の都合のキャンセルはお断りする決まりです。お店の都合のときだけ取り消してください。\n\n' : ''}お客様にはお電話でもお伝えください。`)) {
    patch = { status: 'canceled', canceledBy: 'お店' };
  }
  if (!patch) return;
  b.disabled = true;   // 受け口に送っているあいだ、2回押されないように
  fresh.delete(o.id);
  await change(o, patch);
  render();
});

/* ---------------------------------------------------------------------
 *  「できしだい」の注文の、できあがり時間を調整する（2026-11-01 ko-dai さんの指示）
 *  混み具合を見て、注文が入ったあとでお店が時間を動かす。受付待ちと調理中のあいだだけ。時間を指定した注文は動かさない。
 *  変えるのは pickupAt だけ（受け口は saveOrder）。お客様のアプリは、取り寄せたときに新しい時間を出す
 * --------------------------------------------------------------------- */

const canAdjust = o => o.asap && (o.status === 'new' || o.status === 'accepted');
let timing = null;   // { id, from: いまの時刻（ミリ秒）, at: 動かしている時刻（ミリ秒）, updatedAt: 窓を開いたときの更新日時 }

function openTime(o) {
  const from = new Date(o.pickupAt).getTime();
  // 時刻がもう過ぎた注文は、次の5分きざみから動かす
  timing = { id: o.id, from, at: Math.max(from, Math.ceil(Date.now() / 300000) * 300000), updatedAt: o.updatedAt };
  $('#tWho').textContent = `注文番号 ${o.no}（${who(o)}）・いまの時間 ${hhmm(new Date(from))}頃`;
  paintTime();
  $('#timeDlg').showModal();
}

function paintTime() {
  const at = new Date(timing.at);
  $('#tAt').textContent = hhmm(at);
  $('#tLeft').textContent = untilText(at.toISOString());
  // 過ぎた時刻・明日にはできない
  $$('#tBtns [data-min]').forEach(b => { b.disabled = !timeOk(timing.at + Number(b.dataset.min) * 60000); });
  $('#tOk').disabled = timing.at === timing.from || !timeOk(timing.at);
}
/** 動かした先の時刻にしてよいか（過ぎていない・今日のうち）。23:57 ごろに開くと、初めの5分きざみが翌日の 0:00 になるので、保存の前にも見る（2026-11-05 の Codex のレビュー） */
const timeOk = ms => ms > Date.now() && dateKey(new Date(ms)) === dateKey(new Date());

// ★?. は、公開の直後に古い order.html（最大10分）と新しいこの js が組み合わさっても、ここで止まって注文を読まなくならないように
$('#tBtns')?.addEventListener('click', e => {
  const b = e.target.closest('[data-min]');
  if (!b || b.disabled) return;
  timing.at += Number(b.dataset.min) * 60000;
  paintTime();
});

$('#tOk')?.addEventListener('click', async () => {
  const o = list().find(x => x.id === timing?.id);
  if (!o || !canAdjust(o)) { $('#timeDlg').close(); return alert('この注文は、もう先に進んでいます。時間は変えられません。'); }
  if (!timeOk(timing.at)) { paintTime(); return alert('この時刻は、もう過ぎたか、明日になっています。時間を選び直してください。'); }   // 窓を開いたまま時間がたったとき
  $('#tOk').disabled = true;
  // expect は窓を開いたときの値で送る。開いているあいだにほかの端末が変えていたら、黙って上書きしない
  const ok = await change({ ...o, updatedAt: timing.updatedAt }, { pickupAt: new Date(timing.at).toISOString() });
  $('#tOk').disabled = false;
  if (ok || list().find(x => x.id === o.id)?.updatedAt !== timing.updatedAt) $('#timeDlg').close();
});

/* ---------------------------------------------------------------------
 *  配達・大量注文の申請に返事をする（承認・お断り）
 *  ・お客様への一言（shopMsg）は、お客様のアプリの注文の様子に出る
 *  ・配達で TAKEOUT.deliveryFreeMin 食より少ないとき（要相談）は、承認のときに配達料（fee）を入れる。お客様のアプリに出る
 * --------------------------------------------------------------------- */

let deciding = null;   // { id, approve, updatedAt: 窓を開いたときの更新日時 }

function openDecide(o, approve) {
  deciding = { id: o.id, approve, updatedAt: o.updatedAt };
  const t = new Date(o.pickupAt);
  const fee = approve && needsFee(o);
  $('#dTitle').textContent = `${KIND[o.kind]}の申請 ${o.no} を${approve ? '承認する' : 'お断りする'}`;
  $('#dWho').textContent = `${who(o)}・${mdw(t)} ${hhmm(t)} ${whenOf(o)}・${o.meals || 0}食・${yen(o.total)}`;
  $('#dFeeRow').hidden = !fee;
  $('#dFee').value = o.fee ?? '';
  $('#dMsg').value = o.shopMsg || '';
  $('#dMsg').placeholder = approve ? '例：お届けは12時ごろになります' : '例：その日は貸切のため、お受けできません';
  $('#dOk').textContent = approve ? '承認する' : 'お断りする';
  $('#dOk').className = `b-main ${approve ? 'b-approve' : 'b-decline'}`;
  $('#dOk').disabled = false;
  decideErr('');
  $('#decideDlg').showModal();
}
function decideErr(text) { $('#dErr').textContent = text; $('#dErr').hidden = !text; }

$('#dOk').addEventListener('click', async () => {
  const o = list().find(x => x.id === deciding?.id);
  if (!o || o.status !== 'request') { $('#decideDlg').close(); return alert('この申請は、もう返事が済んでいます。'); }
  const patch = { status: deciding.approve ? 'accepted' : 'declined', shopMsg: $('#dMsg').value.trim() };
  if (deciding.approve && needsFee(o)) {
    const v = $('#dFee').value.trim();
    const fee = Number(v);
    if (v === '' || !Number.isInteger(fee) || fee < 0 || fee > 100000) return decideErr('配達料を入れてください（無料なら 0）');
    patch.fee = fee;
  }
  $('#dOk').disabled = true;
  fresh.delete(o.id);
  const ok = await change({ ...o, updatedAt: deciding.updatedAt }, patch);   // 窓を開いたときの内容で返事をする（時間の調整と同じ）
  $('#dOk').disabled = false;
  if (ok || list().find(x => x.id === o.id)?.updatedAt !== deciding.updatedAt) $('#decideDlg').close();
});

/* ---------------------------------------------------------------------
 *  予約注文を入れる（受け付けた形で入る：調理中か受付済み。お客様のアプリには出ない。2026-11-04 に「電話・店頭の注文」から名前を変えた）
 *  品物と値段は、公式アプリと同じ（data.js の ITEMS に、バグるマネージで直した分を重ねたもの。common.js の priceOf）。テイクアウトだけ（配達・大量注文は申請から）
 *  バグるマネージで止めたものは、お客様のアプリと同じ扱い：出さないものは並べず、売り切れは選べない（2026-10-31 ko-dai さんの指示）
 * --------------------------------------------------------------------- */

let phone = null;   // 入れている注文 { lines: [{ id, name, opts, unit, qty }], rid }。rid は送り直しで2つにならない印
const phoneMeals = () => mealCount(phone.lines);
function phoneErr(text) { $('#pErr').textContent = text; $('#pErr').hidden = !text; }

/* 予約注文を直す（2026-11-15 ko-dai さんの指示「今受付済みに入っている注文を配達モードに変えれますか？」）。
   予約注文（経路が予約・電話・店頭。お客様のアプリには出ない注文）のカードに「✎ 内容を直す」を出し、押すと予約注文の窓を今の内容で開く。
   受け取り⇔配達・配達先・領収書・配達料・日時・品物・カトラリー・お名前・電話・ご要望を直して「この内容に直す」で保存する（受け口の saveOrder に id と expect）。
   お客様のアプリからの注文は、お客様の画面にも出るので直さない（Claude が決めた）。受付待ち・受付済み・調理中・調理完了のあいだだけ */
const canEdit = o => ['予約', '電話', '店頭'].includes(o.route) && ['new', 'accepted', 'ready'].includes(o.status);
/** 入っている行が、どの品物のボタンのものか（ボタンの右上の数のため） */
function tileOf(l) {
  if (SET_BY_ID[l.id]) return l.id;
  const sg = ITEM_BY_ID[l.id]?.groups.find(g => g.id === 'sauce');
  const k = sg ? sg.choices.findIndex(c => (l.opts || []).some(t => sameOpt(c.n, t))) : -1;
  return k >= 0 ? `${l.id}#${k}` : l.id;
}
function openPhone(o = null) {
  phone = { lines: o ? o.lines.map(l => ({ ...l, opts: [...(l.opts || [])], tile: tileOf(l) })) : [], rid: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10),
    edit: o ? { id: o.id, updatedAt: o.updatedAt, pickupAt: o.pickupAt } : null };
  $('input[name="pRoute"]')?.closest('.seg')?.remove();   // 前の画面（電話か店頭かを選ぶ形）が、端末にまだ残っているとき
  // 受け取りの日と時刻は、はじめは空にして必ず選んでもらう（2026-11-04 ko-dai さんの指示。「できしだい」は外した）
  ['#pName', '#pTel', '#pNote', '#pDay', '#pHm'].forEach(s => { $(s).value = ''; });
  paintHm('');
  $('#pDay').min = dateKey(new Date());
  $('#pTime').hidden = false;
  $('input[name="pWhen"]')?.closest('.seg')?.remove();   // 前の画面（「できしだい」の切り替えがあった形）が、端末にまだ残っているとき
  $('#pAsap')?.remove();
  paintItems();
  // 開いたときに、バグるマネージの値段・売り切れも読み直す（CONTENT_EVERY に1回まで）。まだ品物を選んでいなければ、並べ直す
  refreshContent().then(changed => { if (changed && $('#phoneDlg').open && !$('#pItem')?.value) paintItems(); });
  $('#pQty').value = 1;
  paintQty();
  $$('input[name="pCut"]').forEach(x => { x.checked = false; });   // カトラリーは、はじめはどちらも選ばない（必ず選んでもらう）
  paintCut();
  // 配達（2026-11-15）：はじめは「店頭で受け取り」。配達先・領収書は空
  const pk = $('input[name="pKind"][value="pickup"]'); if (pk) pk.checked = true;
  ['#pAddr', '#pAddr2', '#pRcptTo'].forEach(s => { if ($(s)) $(s).value = ''; });
  $$('input[name="pRcpt"], input[name="pFee"]').forEach(x => { x.checked = false; });
  if ($('#pRcptLater')) $('#pRcptLater').checked = false;
  if ($('#pFeeN')) $('#pFeeN').value = 0;
  paintKind();
  if (o) {   // 直すとき：今の内容を入れる
    const t = new Date(o.pickupAt), pick = (name, v) => { const x = $(`input[name="${name}"][value="${v}"]`); if (x) x.checked = true; };
    $('#pName').value = o.name || '';
    $('#pTel').value = o.tel || '';
    $('#pDay').value = dateKey(t);
    $('#pHm').value = hhmm(t);
    paintHm();
    if ($('#pDay').value < $('#pDay').min) $('#pDay').min = $('#pDay').value;
    $('#pNote').value = o.memo || '';
    pick('pKind', o.kind === 'delivery' ? 'delivery' : 'pickup');
    if ($('#pAddr')) { $('#pAddr').value = o.address || ''; $('#pAddr2').value = o.address2 || ''; }
    if (o.cutlery !== undefined) { pick('pCut', o.cutlery ? 'yes' : 'no'); if (o.cutlery && $('#pCutN')) $('#pCutN').value = o.cutleryN || 1; }
    if (o.receipt && $('#pRcptTo')) { pick('pRcpt', o.receipt === 'none' ? 'no' : 'yes'); $('#pRcptLater').checked = o.receipt === 'later'; $('#pRcptTo').value = o.receiptTo || ''; }
    if (o.fee != null && $('#pFeeN')) { pick('pFee', Number(o.fee) > 0 ? 'yes' : 'no'); $('#pFeeN').value = Number(o.fee) || 0; }
    paintCut();
    paintKind();
  }
  if ($('#pTitle')) $('#pTitle').textContent = o ? `予約注文を直す（${o.no}）` : '予約注文を入れる';
  $('#pSend').textContent = o ? 'この内容に直す' : 'この注文を入れる';
  $('#pSend').disabled = false;
  paintOpts();
  paintPhone();
  phoneErr('');
  $('#phoneDlg').showModal();
}

/* ---------------------------------------------------------------------
 *  品物のボタン（2026-11-15 ko-dai さんの指示「商品を入力するときに Usen のハンディアプリのようにこのような配置で押すとサブメニューが表示されるように」
 *  「からあげ、ポテト、ミニサラダのセットはサブメニューではなく、別の商品として打てるように」）
 *  ・品物をカテゴリーごとにボタンで並べる。右上の丸は入れた数。押すと1つ入る（同じものは数が増える）
 *  ・選ぶもの（ご飯の量・追加ハンバーグ・味・サイズ・トッピングなど）がある品物は「›」が付き、押すとサブメニュー（#subDlg）が出る
 *  ・ハンバーグBOXは、USEN と同じくソースごとのボタン（ソースは選んだ形で入る。サブメニューにはソースを出さない）
 *  ・セット（data.js の SET・SALAD の選ぶもの）は、定食・BOX のサブメニューに出さず、「セット」の別のボタン（SET_TILES）。
 *    注文には別の行（id は x_…。値段は選ぶものの値段。食数には数えない）で入る。定食・BOX の行は「セットなし」の形
 *  ・★前の版の画面（品物の選ぶ欄 #pItem がある形）が端末に残っているときは、前のとおり動く（TILES が false）
 * --------------------------------------------------------------------- */
const TILES = !!$('#pTiles');
const SEP_GROUPS = ['set', 'salad'];   // 別の品物として打つ選ぶもの（ボタンの形のときだけ）
const SET_TILES = [
  { id: 'x_kara', g: 'set', n: '手作り唐揚げ（5個）', name: '唐揚げセット' },
  { id: 'x_potato', g: 'set', n: '揚げたてポテトフライ', name: 'ポテトセット' },
  { id: 'x_salad', g: 'salad', n: 'ミニシーザーサラダ', name: 'ミニサラダセット' },
];
const SET_BY_ID = Object.fromEntries(SET_TILES.map(s => [s.id, s]));
/** セットの元の選ぶもの（値段・売り切れはマネージと Order受付の品切れの設定のまま） */
const setChoice = s => CONTENT_BASE.groups.map(x => x.g).find(g => g.id === s.g)?.choices.find(c => c.n === s.n) || null;
/** サブメニューに出す選ぶもの（ソースのように決まったもの・セットは出さない） */
const subGroups = (item, fixed = {}) => item.groups.filter(g => !(g.id in fixed) && !(TILES && SEP_GROUPS.includes(g.id)));
/** ボタンの一覧：[{ title, tiles: [{ key, item?, fixed, set?, name, price, sold }] }] */
function tileList() {
  const out = [];
  for (const c of CATEGORIES) {
    const tiles = [];
    for (const i of ITEMS.filter(x => x.cat === c.id && !x.hidden)) {
      const sg = i.groups.find(g => g.id === 'sauce');
      if (sg) sg.choices.forEach((ch, k) => tiles.push({ key: `${i.id}#${k}`, item: i, fixed: { sauce: k }, name: i.id === 'hbox' ? `${ch.n}BOX` : `${i.name}（${ch.n}）`, price: i.price + (ch.p || 0), sold: !!(i.soldOut || ch.soldOut) }));
      else tiles.push({ key: i.id, item: i, fixed: {}, name: i.name, price: i.price, sold: !!i.soldOut });
    }
    if (tiles.length) out.push({ title: c.name, tiles });
  }
  const sets = SET_TILES.map(s => ({ s, ch: setChoice(s) })).filter(x => x.ch).map(({ s, ch }) => ({ key: s.id, set: s, fixed: {}, name: s.name, price: ch.p, sold: !!ch.soldOut }));
  if (sets.length) out.push({ title: 'セット（定食・BOXに付けるもの）', tiles: sets });
  return out;
}
function paintTiles() {
  const box = $('#pTiles');
  if (!box) return;
  const count = key => (phone?.lines || []).filter(l => l.tile === key).reduce((s, l) => s + l.qty, 0);
  box.innerHTML = tileList().map(sec => `<div class="p-cat"><h5>${esc(sec.title)}</h5><div class="p-grid">${sec.tiles.map(t => {
    const n = count(t.key), more = !!t.item && subGroups(t.item, t.fixed).length > 0;
    return `<button type="button" class="p-tile ${t.sold ? 'sold' : ''} ${n ? 'has' : ''}" data-tile="${esc(t.key)}" ${t.sold ? 'disabled' : ''}>`
      + `${n ? `<i class="badge">${n}</i>` : ''}<b>${esc(t.name)}</b><small>${t.sold ? '売り切れ' : yen(t.price) + (more ? '〜' : '')}</small>${more ? '<i class="more" aria-hidden="true">›</i>' : ''}</button>`;
  }).join('')}</div></div>`).join('');
}
/** 入れる。同じ品物・同じ選ぶもの・同じボタンの行があれば、数を足す */
function addLine(l, qty) {
  const same = phone.lines.find(x => x.id === l.id && x.unit === l.unit && x.tile === l.tile && (x.opts || []).join('|') === (l.opts || []).join('|'));
  if (same) same.qty = clampQty(same.qty + qty); else phone.lines.push({ ...l, qty: clampQty(qty) });
  phoneErr('');
  paintPhone();
}
let sub = null;   // サブメニューで選んでいるボタン
function subErr(text) { const e = $('#subErr'); if (e) { e.textContent = text; e.hidden = !text; } }
function openSub(t) {
  sub = t;
  $('#subTitle').textContent = t.name;
  paintOpts(t.item, t.fixed);
  $('#pQty').value = 1;
  paintQty();
  subErr('');
  $('#subDlg').showModal();
}
$('#subDlg')?.addEventListener('close', () => { sub = null; $('#pOpts').innerHTML = ''; });
$('#pTiles')?.addEventListener('click', e => {
  const b = e.target.closest('[data-tile]');
  if (!b || b.disabled) return;
  const t = tileList().flatMap(s => s.tiles).find(x => x.key === b.dataset.tile);
  if (!t || t.sold) return;
  if (t.set) return addLine({ id: t.set.id, name: t.set.name, opts: [], unit: t.price, tile: t.key }, 1);
  if (subGroups(t.item, t.fixed).length) return openSub(t);
  const p = priceOf(t.item, readSel(t.item, t.fixed, false));   // サイド・ドリンクなど、選ぶものが無い品物は、押すと1つ入る
  addLine({ id: t.item.id, name: t.item.full || t.item.name, opts: p.opts, unit: p.unit, tile: t.key }, 1);
});

/** 品物の選ぶ欄（前の版の画面）。出さないものは並べず、売り切れは「売り切れ」と出して選べないようにする */
function paintItems() {
  if (TILES) return paintTiles();
  const label = i => `${esc(i.full || i.name)}（${i.soldOut ? '売り切れ' : yen(i.price) + (i.groups.length ? '〜' : '')}）`;
  $('#pItem').innerHTML = '<option value="">品物を選んでください</option>' + CATEGORIES.map(c => {
    const shown = ITEMS.filter(i => i.cat === c.id && !i.hidden);
    return shown.length ? `<optgroup label="${esc(c.name)}">${shown.map(i => `<option value="${esc(i.id)}" ${i.soldOut ? 'disabled' : ''}>${label(i)}</option>`).join('')}</optgroup>` : '';
  }).join('');
}

/** 選んだ品物の、選ぶ項目（ソース・ご飯の量など）。ボタンで選ぶ（2026-11-15。前は選ぶ欄）。売り切れの項目は選べない。
 *  fixed（ボタンで決まったソースなど）と、ボタンの形のときのセット（SEP_GROUPS）は出さない */
function paintOpts(item = ITEM_BY_ID[$('#pItem')?.value], fixed = {}) {
  const note = c => c.soldOut ? '<small>売り切れ</small>' : c.show ? `<small>${esc(c.show)}</small>` : c.p ? `<small>+${yen(c.p)}</small>` : '';   // アサイーのサイズは値段そのもの（show）
  $('#pOpts').innerHTML = !item ? '' : subGroups(item, fixed).map(g => {
    if (g.type === 'one') {
      const def = g.choices.findIndex(c => c.plain && !c.soldOut);   // 「並盛」「なし」があれば、はじめからそれ。ソース・味・サイズなどは選んでもらう
      return `<div class="f-opt"><span>${esc(g.name)}</span><div class="seg opt-seg">${
        g.choices.map((c, i) => `<label><input type="radio" name="o_${esc(g.id)}" data-g="${esc(g.id)}" value="${i}" ${i === def ? 'checked' : ''} ${c.soldOut ? 'disabled' : ''}><span>${esc(c.n)}${note(c)}</span></label>`).join('')}</div></div>`;
    }
    if (g.type === 'many') {
      return `<div class="f-opt"><span>${esc(g.name)}（なければ選ばない。いくつでも）</span><div class="seg opt-seg">${
        g.choices.map((c, i) => c.none ? '' : `<label><input type="checkbox" data-g="${esc(g.id)}" value="${i}" ${c.soldOut ? 'disabled' : ''}><span>${esc(c.n)}${note(c)}</span></label>`).join('')}</div></div>`;
    }
    if (g.type === 'count') {
      const c = g.choices[0];
      // 「なし」〜上限（data.js の max。追加カラアゲは3個）を、＋と−のボタンで選ぶ（2026-11-15 ko-dai さんの指示。前は「なし・1個・2個・3個」の選ぶ欄）。
      // 上限より多くは選べない（2026-11-04 ko-dai さんの指示）。品物1つにつきの数。数は data-g の欄（見えない）に持つ
      return `<div class="f-opt"><span>${esc(g.name)}（${c.soldOut ? '売り切れ' : `1つにつき${g.max || 10}個まで`}）</span><span class="qty-step">`
        + `<button type="button" class="st-btn" data-cnt="-1" data-for="${esc(g.id)}" aria-label="1個減らす" disabled>−</button>`
        + `<input type="hidden" data-g="${esc(g.id)}" value="0"><b class="st-val" data-show="${esc(g.id)}">なし</b>`
        + `<button type="button" class="st-btn" data-cnt="1" data-for="${esc(g.id)}" aria-label="1個増やす" ${c.soldOut ? 'disabled' : ''}>＋</button></span></div>`;
    }
    return '';
  }).join('');
}

/** 選んだもの（common.js の priceOf に渡す形）。fixed（ボタンで決まったソースなど）はその値。
 *  画面に出していない選ぶもの（ボタンの形のときのセット、dom が false のとき）は「なし」「並盛」など決まりの値 */
function readSel(item, fixed = {}, dom = true) {
  const sel = {};
  for (const g of item.groups) {
    if (g.id in fixed) { sel[g.id] = fixed[g.id]; continue; }
    if (!dom || !$(`#pOpts [data-g="${CSS.escape(g.id)}"]`)) {
      const k = g.choices.findIndex(c => (g.type === 'many' ? c.none : c.plain));
      sel[g.id] = g.type === 'count' ? 0 : g.type === 'many' ? (k >= 0 ? [k] : []) : k >= 0 ? k : null;
      continue;
    }
    if (g.type === 'one') {
      const el = $(`#pOpts [data-g="${CSS.escape(g.id)}"]:checked`) || $(`#pOpts select[data-g="${CSS.escape(g.id)}"]`);
      const v = el ? el.value : '';
      sel[g.id] = v === '' ? null : Number(v);
    }
    if (g.type === 'many') {
      const on = $$(`#pOpts input[data-g="${g.id}"]:checked`).map(x => Number(x.value));
      const none = g.choices.findIndex(c => c.none);
      sel[g.id] = on.length ? on : none >= 0 ? [none] : [];
    }
    if (g.type === 'count') sel[g.id] = Math.max(0, Math.min(g.max || 10, parseInt($(`#pOpts [data-g="${g.id}"]`).value, 10) || 0));   // 前の版の画面（選ぶ欄）でも読める
  }
  return sel;
}

/** 入れた品物・合計・受け取りの時刻 */
function paintPhone() {
  $('#pLines').innerHTML = phone.lines.length ? phone.lines.map((l, i) => `
    <li><b>${esc(l.name)}</b><span class="p-q"><button type="button" class="st-btn sm" data-lq="-1" data-i="${i}" aria-label="1つ減らす" ${l.qty <= 1 ? 'disabled' : ''}>−</button><span class="q">×${l.qty}</span><button type="button" class="st-btn sm" data-lq="1" data-i="${i}" aria-label="1つ増やす" ${l.qty >= QTY_MAX ? 'disabled' : ''}>＋</button></span><span class="p-sum">${yen(l.unit * l.qty)}</span><button type="button" class="p-del" data-del="${i}" aria-label="消す">✕</button>${
      shownOpts(l).length ? `<small>${esc(shownOpts(l).join(' / '))}</small>` : ''}</li>`).join('') : '<li class="none">まだ品物がありません</li>';
  $('#pTotal').textContent = yen(phone.lines.reduce((s, l) => s + l.unit * l.qty, 0));
  paintTiles();   // ボタンの右上の数
  paintFee();     // 配達料を足したお支払い
}

$('#phoneBtn').addEventListener('click', () => openPhone());
$('#pItem')?.addEventListener('change', () => { paintOpts(); phoneErr(''); });
$('#pAdd').addEventListener('click', () => {
  if (TILES) {   // サブメニューの「入れる」
    if (!sub) return;
    const { item, fixed } = sub;
    if (item.soldOut || item.hidden) return subErr('この品物は、いま売り切れです');
    const p = priceOf(item, readSel(item, fixed));
    if (p.missing) return subErr(`「${p.missing.name}」を選んでください`);
    addLine({ id: item.id, name: item.full || item.name, opts: p.opts, unit: p.unit, tile: sub.key }, clampQty($('#pQty').value));
    $('#subDlg').close();
    return;
  }
  const item = ITEM_BY_ID[$('#pItem').value];
  if (!item) return phoneErr('品物を選んでください');
  if (item.soldOut || item.hidden) return phoneErr('この品物は、いま売り切れです');
  const p = priceOf(item, readSel(item));
  if (p.missing) return phoneErr(`「${p.missing.name}」を選んでください`);
  const qty = clampQty($('#pQty').value);
  phone.lines.push({ id: item.id, name: item.full || item.name, opts: p.opts, unit: p.unit, qty });
  $('#pItem').value = '';
  $('#pQty').value = 1;
  paintQty();
  paintOpts();
  paintPhone();
  phoneErr('');
});
$('#pLines').addEventListener('click', e => {
  const q = e.target.closest('[data-lq]');
  if (q && !q.disabled) {   // 入れた品物の数を＋−で直す（1より少なくはしない。消すときは ✕）
    const l = phone.lines[Number(q.dataset.i)];
    if (l) l.qty = clampQty(l.qty + Number(q.dataset.lq));
    return paintPhone();
  }
  const d = e.target.closest('[data-del]');
  if (!d) return;
  phone.lines.splice(Number(d.dataset.del), 1);
  paintPhone();
});

/* 数を＋と−のボタンで選ぶ（2026-11-15 ko-dai さんの指示「直接テイクアウトの注文を入力するとき、個数の選択をプラスマイナスボタンで選択できるように」）。
   品物の数（#pQty。1〜99。まん中の数を押して打ち込むこともできる）と、追加カラアゲのような個数を選ぶもの（0〜上限）。入れた品物の数は上の #pLines */
const QTY_MAX = 99;
const clampQty = v => Math.max(1, Math.min(QTY_MAX, parseInt(v, 10) || 1));
function paintQty() {
  const q = clampQty($('#pQty').value);
  $('#pQty').value = q;
  $$('[data-qty]').forEach(b => { b.disabled = Number(b.dataset.qty) < 0 ? q <= 1 : q >= QTY_MAX; });   // サブメニュー（#subDlg）にある
}
$('#pQty').addEventListener('change', paintQty);

/* カトラリー（お箸・スプーン）のありなしと、ありのときの個数（2026-11-15 ko-dai さんの指示「予約注文を入力するときにカトラリーのありなしと、ありの場合はその個数を選択できるように」）。
   「あり」を選ぶと個数の欄が出る。はじめの個数は、入れた品物の食数（無ければ1）。個数は＋と−で選ぶ（1〜99。打ち込むこともできる）。
   受け口には、ご要望の頭に「カトラリーあり（3個）」「カトラリーなし」と付けて送る。★公式アプリの fromServer（../js/order-api.js）は「カトラリーあり／なし」だけを読むので、
   個数の付いた形は、ここの withCutN で読む（fromStore）。公式アプリのお客様の注文には個数が無い（いままでどおり） */
const CUT_N = /^カトラリーあり（(\d{1,2})個）(?:／|$)/;
function withCutN(o) {
  if (o.cutlery !== undefined) return o;   // fromServer が「カトラリーあり／なし」を読んだ注文（公式アプリのお客様の注文）は、そのまま
  const m = String(o.memo || '').match(CUT_N);
  if (m) return { ...o, cutlery: true, cutleryN: Number(m[1]), memo: o.memo.slice(m[0].length) };
  const f = String(o.memo || '').match(/^カトラリー(あり|なし)(?:／|$)/);   // 試作の注文（fromServer を通らない）
  return f ? { ...o, cutlery: f[1] === 'あり', memo: o.memo.slice(f[0].length) } : o;
}
/* 領収書（2026-11-15 ko-dai さんの指示「配達モードでは…領収書の有無とありの場合は宛名（後日連絡ありを選べるようにする）」）。
   受け口には、ご要望の頭（カトラリーのあと）に「領収書なし」「領収書あり（宛名：○○）」「領収書あり（宛名は後日連絡）」と付けて送る。読むときはここで外す */
const RCPT = /^領収書(?:(なし)|あり（宛名は後日連絡）|あり（宛名：(.*?)）)(?:／|$)/;
function withRcpt(o) {
  const m = String(o.memo || '').match(RCPT);
  if (!m) return o;
  return { ...o, receipt: m[1] ? 'none' : m[2] !== undefined ? 'to' : 'later', receiptTo: m[2] || '', memo: o.memo.slice(m[0].length) };
}
const fromStore = o => withRcpt(withCutN(fromServer(o)));
function paintCut() {
  const row = $('#pCutRow');
  if (!row) return;   // 前の版の画面
  row.hidden = $('input[name="pCut"]:checked')?.value !== 'yes';
  const n = clampQty($('#pCutN').value);
  $('#pCutN').value = n;
  $$('#phoneDlg [data-cq]').forEach(b => { b.disabled = Number(b.dataset.cq) < 0 ? n <= 1 : n >= QTY_MAX; });
}
$$('input[name="pCut"]').forEach(x => x.addEventListener('change', () => {
  if (x.value === 'yes' && x.checked) $('#pCutN').value = Math.max(1, phoneMeals());   // はじめは食数
  paintCut();
  phoneErr('');
}));
$('#pCutN')?.addEventListener('change', paintCut);

/* 予約注文の時刻は「時」と「分（00・05…55）」の2つの選ぶ欄（2026-11-20 ko-dai さんの指示「時刻が今1分刻みになっているので、5分刻みで選べるように」）。
   iPad の時刻の欄（type=time）は step を使わず1分きざみになるため、選ぶ欄にした。選んだ時刻は見えない #pHm に "HH:MM" で入れる（ほかの所は今までどおり #pHm を読む）。
   「時」だけ選んだら、分は 00 にする。直すときに5分きざみでない時刻（前に入れた注文）なら、その分も選べるように足す。前の版の画面（時刻の欄）のときは何もしない */
function paintHm(v = $('#pHm').value) {
  const hs = $('#pHmH'), ms = $('#pHmM');
  if (!hs || !ms) return;
  const [h, m] = /^\d{2}:\d{2}$/.test(v) ? v.split(':') : ['', ''];
  const two = n => String(n).padStart(2, '0');
  const mins = Array.from({ length: 12 }, (_, i) => two(i * 5));
  if (m && !mins.includes(m)) { mins.push(m); mins.sort(); }
  hs.innerHTML = '<option value="">時</option>' + Array.from({ length: 24 }, (_, i) => two(i)).map(x => `<option value="${x}" ${x === h ? 'selected' : ''}>${Number(x)}時</option>`).join('');
  ms.innerHTML = '<option value="">分</option>' + mins.map(x => `<option value="${x}" ${x === m ? 'selected' : ''}>${x}分</option>`).join('');
}
function readHm() {
  const h = $('#pHmH').value, m = $('#pHmM').value;
  $('#pHm').value = h && m ? `${h}:${m}` : '';
}
$('#pHmH')?.addEventListener('change', () => { if ($('#pHmH').value && !$('#pHmM').value) $('#pHmM').value = '00'; readHm(); phoneErr(''); });
$('#pHmM')?.addEventListener('change', () => { readHm(); phoneErr(''); });

/* 予約注文の日時が、お店の営業日・営業時間の中か（2026-11-19 ko-dai さんの「モバイルオーダーは定休日が反映されていますか？」→「確かめを足す」）。
   お客様のアプリ（../js/common.js の pickupSlots）と同じ決まり：休みの日（定休日の火曜。祝日は営業。T3Works で決めた臨時休業・臨時営業）は入れない、
   受け取り・配達は、開ける時刻から閉める TAKEOUT.lastBeforeClose 分前まで。休みの日は、この画面が30分に1回読み直す T3Works の営業日（syncDays）を使う。
   中なら ''、外ならそのわけ */
function hoursIssue(at) {
  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const times = hoursOf(day);   // 休みの日は []
  if (!times.length) return `${mdw(day)}は、お店の休みの日です（定休日・臨時休業）`;
  const last = c => atTime(day, c).getTime() - TAKEOUT.lastBeforeClose * 60000;
  if (times.some(([o, c]) => at.getTime() >= atTime(day, o).getTime() && at.getTime() <= last(c))) return '';
  const range = times.map(([o, c]) => `${o}〜${hhmm(new Date(last(c)))}`).join('・');
  return `${mdw(day)} ${hhmm(at)} は、受け取り・配達ができる時間（${range}。閉める${TAKEOUT.lastBeforeClose}分前まで）の外です`;
}

/* 店頭で受け取りか、配達か（2026-11-15 ko-dai さんの指示「予約注文タブで配達を選べるように」）。
   配達のときは、配達先（住所・会社名や建物名）と領収書の欄を出し、日時の名前を「配達の日」「配達時間」にする（時刻は配達が終わる時刻）。
   受け口には kind: 'delivery'・address・address2 で送る（受け口の saveOrder は前から受けられる。受け口は変えていない）。配達料は入れない */
const phoneKind = () => $('input[name="pKind"]:checked')?.value === 'delivery' ? 'delivery' : 'pickup';
function paintKind() {
  const deliv = phoneKind() === 'delivery';
  if ($('#pDeliv')) $('#pDeliv').hidden = !deliv;
  if ($('#pDayLbl')) $('#pDayLbl').textContent = deliv ? '配達の日' : '受け取りの日';
  if ($('#pHmLbl')) $('#pHmLbl').textContent = deliv ? '配達時間' : '時刻';
  if ($('#pTotalLbl')) $('#pTotalLbl').textContent = deliv ? '合計（配達のときに支払い）' : '合計（店頭で支払い）';
  const row = $('#pRcptRow');
  if (row) {
    row.hidden = !(deliv && $('input[name="pRcpt"]:checked')?.value === 'yes');
    $('#pRcptTo').disabled = !!$('#pRcptLater')?.checked;   // 後日連絡なら、宛名は入れない
  }
  paintFee();
}
/* 配達料（2026-11-15 ko-dai さんの指示「配達の有無と金額を選択できるように」）。「あり」なら金額を＋−（100円きざみ。0〜100,000円）で選ぶ。打ち込むこともできる。
   受け口には fee で送る（なしは 0）。品物の合計（total）とは別で、カードには「配達料 ¥500 は別」「配達料なし」と出る */
const feeChoice = () => $('input[name="pFee"]:checked')?.value || '';
const feeNow = () => Math.max(0, Math.min(100000, parseInt($('#pFeeN')?.value, 10) || 0));
function paintFee(fix = true) {   // fix：欄の字を、0〜100,000 の数に直す（打っている途中は直さない）
  const row = $('#pFeeRow');
  if (!row) return;   // 前の版の画面
  const deliv = phoneKind() === 'delivery', on = deliv && feeChoice() === 'yes', fee = feeNow();
  row.hidden = !on;
  if (fix) $('#pFeeN').value = fee;
  $$('#phoneDlg [data-fq]').forEach(b => { b.disabled = Number(b.dataset.fq) < 0 ? fee <= 0 : fee >= 100000; });
  const sum = $('#pFeeSum'), items = (phone?.lines || []).reduce((s, l) => s + l.unit * l.qty, 0);
  sum.hidden = !(on && fee > 0);
  sum.textContent = on && fee > 0 ? `配達料 ${yen(fee)} を足すと、お支払いは ${yen(items + fee)} です` : '';
}
$$('input[name="pKind"], input[name="pRcpt"], input[name="pFee"]').forEach(x => x.addEventListener('change', () => { paintKind(); phoneErr(''); }));
$('#pFeeN')?.addEventListener('change', () => paintFee());
$('#pFeeN')?.addEventListener('input', () => paintFee(false));
$('#phoneDlg').addEventListener('click', e => {
  const b = e.target.closest('[data-fq]');
  if (!b || b.disabled) return;
  $('#pFeeN').value = Math.max(0, Math.min(100000, feeNow() + Number(b.dataset.fq)));
  paintFee();
  phoneErr('');
});
$('#pRcptLater')?.addEventListener('change', () => { paintKind(); phoneErr(''); });
$('#phoneDlg').addEventListener('click', e => {
  const b = e.target.closest('[data-cq]');
  if (!b || b.disabled) return;
  $('#pCutN').value = clampQty($('#pCutN').value) + Number(b.dataset.cq);
  paintCut();
});
document.addEventListener('click', e => {   // 予約注文の窓とサブメニューの両方
  const b = e.target.closest('[data-qty]');
  if (b && !b.disabled) { $('#pQty').value = clampQty($('#pQty').value) + Number(b.dataset.qty); return paintQty(); }
  const c = e.target.closest('[data-cnt]');
  if (!c || c.disabled) return;
  const item = sub?.item || ITEM_BY_ID[$('#pItem')?.value], g = item?.groups.find(x => x.id === c.dataset.for);
  const box = $(`#pOpts [data-g="${CSS.escape(c.dataset.for)}"]`);
  if (!g || !box) return;
  const max = g.max || 10, n = Math.max(0, Math.min(max, (parseInt(box.value, 10) || 0) + Number(c.dataset.cnt))), ch = g.choices[0];
  box.value = n;
  $(`#pOpts [data-show="${CSS.escape(g.id)}"]`).textContent = n ? `${n}個（+${yen(ch.p * n)}）` : 'なし';
  $$(`#pOpts [data-for="${CSS.escape(g.id)}"]`).forEach(x => { x.disabled = Number(x.dataset.cnt) < 0 ? n <= 0 : n >= max || !!ch.soldOut; });
});
/* 窓を閉じる（2026-11-15 ko-dai さんの指示「やめるを閉じるに変更し、まわりの余白部分を押しても閉じるように」）。
   「閉じる」のボタンと、窓のまわりの暗いところを押したとき。★予約注文は、品物・お名前・電話・ご要望を入れかけているときだけ、
   間違えて押して消えないよう「閉じますか？」と聞く（閉じると、次に開いたときは空から。Claude が足した） */
const phoneDirty = () => !!phone && (phone.lines.length > 0 || ['#pName', '#pTel', '#pNote', '#pAddr', '#pAddr2', '#pRcptTo'].some(s => $(s)?.value.trim()));
function closeDlg(d) {
  if (!d?.open) return;
  if (d.id === 'phoneDlg' && !phone?.edit && phoneDirty() && !confirm('入れかけの予約注文は消えます。閉じますか？')) return;   // 直しているときは聞かない（閉じても注文は元のまま）
  d.close();
}
$$('dialog [data-close]').forEach(b => b.addEventListener('click', () => closeDlg(b.closest('dialog'))));
$$('dialog').forEach(d => {
  // まわりの暗いところ（::backdrop）を押すと、窓そのものに届く。窓の中の余白を押したときは閉じない（押した所が窓の四角の外かで見る）
  d.addEventListener('click', e => {
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
    closeDlg(d);
  });
  // キーボードの Esc も同じ（予約注文の入れかけは聞く）
  d.addEventListener('cancel', e => { if (d.id === 'phoneDlg' && !phone?.edit && phoneDirty()) { e.preventDefault(); closeDlg(d); } });
});

/* ---------------------------------------------------------------------
 *  品切れの設定（2026-11-08 ko-dai さんの指示「アプリで品切れ設定ができるように」「公式アプリにもホームページにもテイクアウトページで反映されるように」
 *  「各メニューとセット、アサイーの追加トッピングも設定できるように」。どのアプリで設定するかは、ko-dai さんが Order受付を選んだ）
 *  ・保存先は、バグるマネージの「売り切れ」と同じ（受け口の appContent の中身。items[商品id].soldOut と choices['グループid/名前'].soldOut）。
 *    どちらで切り替えても同じになる。公式アプリは js/content.js で重ねる（品切れは押せない・選べない）。
 *    ホームページのテイクアウトのページも、開いたときに同じ中身を読んで「売り切れ」を出す（バグる HP のセッションが作って公開した。ホームページの js/soldout.js）
 *  ・押したらすぐ保存する。最新の中身を読み、その印だけを変えて saveAppContent（expect）。ほかの端末（マネージ）が先に保存していたら、
 *    新しい中身にもう一度その印だけを入れて送り直す（ほかの直しを消さない）
 *  ・★マネージで保存していない直しがあるときに、ここで切り替えると、マネージの保存は「ほかの端末で、先に保存されていました」になる（マネージの直しは消える）
 *  ・ここで切り替えるのは、テイクアウトの商品（出さないものは除く）・ハンバーグBOXのソース・唐揚げ定食の味・お得なセット・アサイーの追加トッピング。
 *    ソースと味は、ホームページではソースごと・味ごとのメニューとして並ぶので、足した（Claude が決めた）。ご飯の量などは、今までどおりマネージで
 * --------------------------------------------------------------------- */
const SOLD_GROUPS = [['sauce', 'ハンバーグBOXのソース'], ['taste', '唐揚げ定食の味'], ['set', 'お得なセット'], ['topping', 'アサイーボウルの追加トッピング']];
let soldBusy = false;
let soldHtml = '';   // 前に描いた一覧（同じなら描き直さない。押している途中にボタンが入れかわらないように）

/** 切り替えるものの一覧：[{ title, rows: [{ sec: 'items'|'choices', key, name, on }] }] */
function soldList() {
  const secs = CATEGORIES.map(c => ({ title: c.name, rows: ITEMS.filter(i => i.cat === c.id && !i.hidden)
    .map(i => ({ sec: 'items', key: i.id, name: i.full || i.name, on: !!i.soldOut })) })).filter(x => x.rows.length);
  for (const [gid, title] of SOLD_GROUPS) {
    const g = CONTENT_BASE.groups.map(x => x.g).find(x => x.id === gid);
    if (!g || !ITEMS.some(i => !i.hidden && i.groups.includes(g))) continue;
    secs.push({ title, rows: g.choices.filter(c => !c.plain && !c.none).map(c => ({ sec: 'choices', key: contentKey.choice(g, c), name: c.n, on: !!c.soldOut })) });
  }
  return secs;
}

/** 上の「品切れ」ボタンの字と、開いている窓の一覧 */
function paintSold() {
  const secs = soldList(), n = secs.reduce((a, x) => a + x.rows.filter(r => r.on).length, 0);
  const btn = $('#soldBtn');
  if (btn) { btn.textContent = n ? `🚫 品切れ中 ${n}` : '品切れの設定'; btn.classList.toggle('sold-on', n > 0); }
  const box = $('#soldList');
  if (!box || !$('#soldDlg')?.open) return;
  const html = secs.map(x => `<section class="sold-sec"><h4>${esc(x.title)}</h4><div class="sold-rows">${x.rows.map(r =>
    `<button type="button" class="sold-row ${r.on ? 'out' : ''}" data-sec="${esc(r.sec)}" data-key="${esc(r.key)}" ${soldBusy ? 'disabled' : ''}><span>${esc(r.name)}</span><b>${r.on ? '品切れ' : '販売中'}</b></button>`).join('')}</div></section>`).join('');
  if (html !== soldHtml) { box.innerHTML = html; soldHtml = html; }
}
function soldErr(text) { const e = $('#soldErr'); if (e) { e.textContent = text; e.hidden = !text; } }

/** 中身（content）の sec の key に、品切れの印を付ける・外す（ほかの値はそのまま。空になった入れものは消す。マネージの setOv と同じ） */
function withSold(content, sec, key, on) {
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const c = JSON.parse(JSON.stringify(isObj(content) ? content : {}));
  const box = isObj(c[sec]) ? c[sec] : {}, o = isObj(box[key]) ? box[key] : {};
  if (on) o.soldOut = true; else delete o.soldOut;
  if (Object.keys(o).length) box[key] = o; else delete box[key];
  if (Object.keys(box).length) c[sec] = box; else delete c[sec];
  return c;
}

/** 受け口に保存する。ほかの端末が先に保存していたら（conflict）、その新しい中身で、もう一度この印だけを変えて送る（3回まで） */
async function saveSold(sec, key, on) {
  let cur = await ask({ action: 'appContent' });   // 最新の中身（だれでも読める口なので、合言葉は付けない）
  for (let i = 0; i < 3; i++) {
    const content = withSold(cur.content, sec, key, on);
    try {
      const r = await staffPost({ action: 'saveAppContent', content, expect: Number(cur.v) || 0 });
      DB.set('content', { content, v: Number(r.v) || 0, at: r.at || '', got: Date.now() });   // この画面の控えも新しくする（予約注文の窓・この一覧）
      applyContent(content);
      return;
    } catch (e) {
      if (e.code !== 'conflict' || !e.data) throw e;
      cur = { content: e.data.content, v: e.data.v };
    }
  }
  throw Object.assign(new Error('conflict'), { code: 'conflict' });
}

$('#soldBtn')?.addEventListener('click', async () => {
  soldErr(ORDERS_ONLINE ? '' : '試作では保存できません（受け口につないだときだけ）。');
  soldHtml = '';
  $('#soldDlg').showModal();
  paintSold();
  if (ORDERS_ONLINE && await refreshContent(true)) render();   // バグるマネージで変えた分も出す
});
$('#soldList')?.addEventListener('click', async e => {
  const b = e.target.closest('[data-sec]');
  if (!b || b.disabled || soldBusy || !ORDERS_ONLINE) return;
  const on = !b.classList.contains('out');
  soldBusy = true;
  soldErr('');
  paintSold();
  b.querySelector('b').textContent = '保存中…';
  try {
    await saveSold(b.dataset.sec, b.dataset.key, on);
  } catch (err) {
    if (quiet(err)) $('#soldDlg').close();   // 合言葉の画面を出す（窓の下に隠れないように）
    else soldErr(err.code === 'conflict' ? 'ほかの端末（バグるマネージなど）で同じときに保存していたため、保存できませんでした。もう一度押してください。' : staffText(err));
  } finally {
    soldBusy = false;
    soldHtml = '';
    render();
  }
});

/** 受付待ち・申請の注文に、いま品切れにしているものが入っていたら知らせる（品切れにする前に開いたメニューから送られたとき。
 *  公式アプリは、開いているあいだは3分に1回だけ中身を読み直すので、すぐには止まらない） */
function soldCheck(o) {
  if (!['new', 'request'].includes(o.status)) return '';
  const names = [];
  for (const l of o.lines || []) {
    if (SET_BY_ID[l.id]) { if (setChoice(SET_BY_ID[l.id])?.soldOut) names.push(l.name); continue; }   // 別の品物として打ったセット
    const item = ITEM_BY_ID[l.id];
    if (!item) continue;
    if (item.soldOut) names.push(item.full || item.name);
    for (const t of l.opts || []) for (const g of item.groups || []) for (const c of g.choices) {
      if (c.soldOut && (sameOpt(c.n, t) || (g.type === 'count' && String(t).startsWith(c.n + '×')))) names.push(c.n);
    }
  }
  return names.length ? `<p class="c-check">⚠ 品切れ中のものが入っています：${esc([...new Set(names)].join('・'))}</p>` : '';
}

$('#pSend').addEventListener('click', async () => {
  // 経路は「予約」だけ（2026-11-04 ko-dai さんの指示。電話か店頭かの選択は外した）。カードに「予約」の札が付く
  const route = '予約';
  const name = $('#pName').value.trim();
  const at = new Date(`${$('#pDay').value}T${$('#pHm').value}`);
  const tel = $('#pTel').value.trim();
  if (!name) return phoneErr('お名前を入れてください');
  // 電話番号は必ず入れる（2026-11-04 ko-dai さんの指示）。けた数は公式アプリと同じ（10〜11けた）
  if (!tel) return phoneErr('電話番号を入れてください');
  // 受け口の telOk_ と同じ形（0 で始まる10〜11けた）。違うと、送ってから受け口に断られる（2026-11-05 の Codex のレビュー）
  if (!/^0\d{9,10}$/.test(tel.replace(/[^\d]/g, ''))) return phoneErr('電話番号を確かめてください（0 で始まる10〜11けた）');
  if ($('#pItem')?.value) return phoneErr('選んだ品物を「＋ 入れる」で入れてください（入れないなら、品物を「品物を選んでください」に戻す）');
  if (!phone.lines.length) return phoneErr('品物を1つ以上入れてください（品物を選んで「＋ 入れる」）');
  const kind = phoneKind();
  if (!$('#pDay').value || !$('#pHm').value || isNaN(at)) return phoneErr(kind === 'delivery' ? '配達の日と配達時間を選んでください' : '受け取りの日と時刻を選んでください');
  const sameTime = !!phone.edit && at.getTime() === new Date(phone.edit.pickupAt).getTime();   // 直すとき、時刻を変えていなければ過ぎていても通す
  if (at < Date.now() - 5 * 60000 && !sameTime) return phoneErr(kind === 'delivery' ? '配達時間が、もう過ぎています' : '受け取りの時刻が、もう過ぎています');
  // 配達（2026-11-15 ko-dai さんの指示）：配達先は住所か会社名・建物名のどちらか。領収書は必ず選ぶ。ありなら宛名か「後日連絡」
  const addr = $('#pAddr')?.value.trim() || '', addr2 = $('#pAddr2')?.value.trim() || '';
  let rcptWord = '';
  if (kind === 'delivery') {
    if (!addr && !addr2) return phoneErr('配達先の住所か、会社名・建物名を入れてください');
    const fc = $('input[name="pFee"]:checked')?.value;
    if ($('#pFeeSeg') && !fc) return phoneErr('配達料の「あり」か「なし」を選んでください');
    if (fc === 'yes' && !(feeNow() > 0)) return phoneErr('配達料の金額を入れてください（無料なら「なし」）');
    const rc = $('input[name="pRcpt"]:checked')?.value, later = !!$('#pRcptLater')?.checked, to = $('#pRcptTo').value.trim();
    if (!rc) return phoneErr('領収書の「あり」か「なし」を選んでください');
    if (rc === 'yes' && !later && !to) return phoneErr('領収書の宛名を入れるか、「宛名は後日連絡」を選んでください');
    rcptWord = rc === 'no' ? '領収書なし' : later ? '領収書あり（宛名は後日連絡）' : `領収書あり（宛名：${to}）`;
  }
  // カトラリーのありなしは必ず選ぶ（2026-11-15 ko-dai さんの指示。公式アプリと同じ）。前の版の画面（カトラリーの欄が無い）のときは聞かない
  const cut = $('input[name="pCut"]:checked')?.value;
  if ($('#pCutSeg') && !cut) return phoneErr('カトラリー（お箸・スプーン）の「あり」か「なし」を選んでください');
  const cutWord = cut === 'yes' ? `カトラリーあり（${clampQty($('#pCutN').value)}個）` : cut === 'no' ? 'カトラリーなし' : '';
  const note = [cutWord, rcptWord, $('#pNote').value.trim()].filter(Boolean).join('／');
  if (note.length > 300) return phoneErr(`ご要望・メモが長すぎます（領収書の宛名などと合わせて300字まで。あと${note.length - 300}字短くしてください）`);
  const row = { kind, asap: false, pickupAt: at.toISOString(), name, tel, route, note,
    ...(kind === 'delivery' ? { address: addr, address2: addr2, ...($('#pFeeSeg') ? { fee: feeChoice() === 'yes' ? feeNow() : 0 } : {}) } : {}),
    lines: phone.lines, meals: phoneMeals() };
  // 休みの日・営業時間の外なら、入れる前に聞く（2026-11-19 ko-dai さんの「確かめを足す」。止めはしない：ケータリングなど、お店が決めた特別な注文もあるため。Claude が決めた）。
  // 直すときに日時を変えていなければ聞かない
  const why = hoursIssue(at);
  if (why && !sameTime && !confirm(`${why}\n\nそれでも、この日時で入れますか？`)) return;
  if (phone.edit) {   // 直す：受け口の saveOrder に id と、開いたときの更新日時（ほかの端末が先に変えていたら conflict）
    const o = list().find(x => x.id === phone.edit.id);
    if (!o) return phoneErr('この注文が見つかりませんでした。「↻ 更新」を押して確かめてください。');
    const deliv = kind === 'delivery';
    const patch = { kind, pickupAt: row.pickupAt, name, tel, note, lines: row.lines.map(({ tile, ...l }) => l), meals: row.meals,
      address: deliv ? addr : '', address2: deliv ? addr2 : '', fee: deliv ? (row.fee ?? null) : null,
      ...(ORDERS_ONLINE ? {} : withRcpt(withCutN({ memo: note }))) };   // 試作は、この端末の注文をそのまま直す
    $('#pSend').disabled = true;
    const ok = await change({ ...o, updatedAt: phone.edit.updatedAt }, patch);
    $('#pSend').disabled = false;
    if (ok) $('#phoneDlg').close();
    return;
  }
  $('#pSend').disabled = true;
  const ok = await addPhoneOrder(row);
  $('#pSend').disabled = false;
  if (ok) $('#phoneDlg').close();
});

/** 予約注文を入れる。うまくいったら true */
/** 受け口が返した注文が、いま送った中身と同じか（受け取りの時刻・お名前・電話・品物） */
function sameSent(o, row) {
  const lineKey = l => [l.id, l.qty, l.unit, ...(l.opts || [])].join('|');
  return new Date(o.pickupAt).getTime() === new Date(row.pickupAt).getTime() && (o.name || '') === row.name.trim()
    && (o.tel || '').replace(/[^\d]/g, '') === row.tel.replace(/[^\d]/g, '')
    && o.lines.map(lineKey).join('\n') === row.lines.map(lineKey).join('\n');
}

/* お店が入れた新しい注文（予約注文）も、受け口がオーナーへプッシュ通知を送る（受け口 2026-11-20c から。ko-dai さんの指示「オーナー以外から席の予約とテイクアウトの注文を直接入力した時もオーナーに通知が飛ぶように」。../プッシュ通知の決めごと.md）。
   ★入れたこの端末には送らないよう、この端末が バグる Owner で通知を受けているときの endpoint を pushSkip として添える（受けていなければ空。空なら登録した全部の端末に送る）。
   予約ボードと同じ取り方（予約ボードのセッションの頼み）。注文を進める・直す saveOrder には付けない（受け口がもともと送らない） */
let pushSkip = '';
function findPushSkip() {
  if (!navigator.serviceWorker?.getRegistrations) return Promise.resolve();
  return navigator.serviceWorker.getRegistrations().then(list => {
    const reg = list.find(g => { try { return /\/(baguru-owner|バグるOwner)\/sw\.js$/.test(decodeURI((g.active || g.waiting || g.installing)?.scriptURL || '')); } catch (e) { return false; } });
    return reg?.pushManager?.getSubscription();
  }).then(sub => { pushSkip = sub?.endpoint || ''; }).catch(() => {});
}
findPushSkip();

async function addPhoneOrder(row) {
  if (!ORDERS_ONLINE) {
    const now = new Date();
    const o = { id: 'o' + now.getTime(), no: nextOrderNo(now), date: dateKey(now), createdAt: now.toISOString(), status: 'accepted', ...row,
      ...withRcpt(withCutN({ memo: row.note })), total: row.lines.reduce((s, l) => s + l.unit * l.qty, 0), times: { accepted: now.toISOString() } };
    known?.set(o.id, o.status);   // 自分で入れた注文には「新しい」の印を付けない
    saveOrders([...getOrders(), o]);
    render();
    return true;
  }
  net.gen++;
  try {
    await Promise.race([findPushSkip(), new Promise(ok => setTimeout(ok, 1500))]);   // この端末が バグる Owner で通知を受けていれば、この端末には通知を送らない（下の pushSkip）。待つのは1.5秒まで
    const r = await staffPost({ action: 'saveOrder', row, rid: phone.rid, ...(pushSkip ? { pushSkip } : {}) });   // status を省くと accepted になる
    const o = fromStore(r.row);
    known?.set(o.id, o.status);
    put(o);
    // 前に送ったときに入っていて返事だけ届かなかったら、受け口は同じ rid の前の注文を返す（直した中身は入らない）。2026-11-05 の Codex のレビュー
    if (!sameSent(o, row)) alert(`この予約注文は、前に送った内容で、もう入っていました（番号 ${o.no}）。\n直した所は入っていません。カードを確かめて、違っていたら取り消して入れ直してください。`);
    return true;
  } catch (e) {
    if (!quiet(e)) phoneErr(staffText(e));
    return false;
  } finally {
    net.gen++;
    render();
  }
}

/* ---------------------------------------------------------------------
 *  合言葉の画面（受け口につないだときだけ）
 * --------------------------------------------------------------------- */

$('#pinGate').addEventListener('submit', async e => {
  e.preventDefault();
  const pin = $('#pin').value.trim();
  if (!pin) return;
  if (TABLET && soundOn) unlockSound().then(() => { checkSound(); render(); });   // 触ったついでに、音も出せるようにする（iPad）
  const btn = $('#pinGate button');
  btn.disabled = true;
  $('#pinErr').hidden = true;
  try {
    const r = await ask({ action: 'orders', pin });
    pinSet(pin);
    $('#pin').value = '';
    $('#pinGate').hidden = true;
    net.error = '';
    net.at = Date.now();
    take(r);
  } catch (err) {
    $('#pinErr').textContent = staffText(err);
    $('#pinErr').hidden = false;
  }
  btn.disabled = false;
  render();
});

$('#accepting').addEventListener('change', async e => {
  const on = e.target.checked;
  e.target.disabled = true;
  await setAccepting(on);
  e.target.disabled = false;
  render();
});
// 「更新」：画面を読み直す（公開した新しい版もここで入る。注文は保存してある・受け口にあるので消えない）。
// ★iPad は読み直すと音が止まるので、また「画面をタッチしてください」が出る（ブラウザの決まり）
$('#reloadBtn').addEventListener('click', () => location.reload());
$('#homeBtn').hidden = $('#pinHome').hidden = !FROM_OWNER;
$('#homeBtn').addEventListener('click', goOwner);
$('#pinHome').addEventListener('click', goOwner);   // 合言葉を入れずに戻れるように
// 音をオンにして、試しに1回鳴らす（受付待ちがあれば、そのまま鳴り続ける）。押した・触ったその場で呼ぶ
function soundOnNow() {
  soundOn = true;
  wakeTouch = false;
  keepAwake();
  const ready = unlockSound();
  checkSound();
  ready.then(() => {
    checkSound();
    render();
    if (soundOn && !ringTimer && Date.now() >= quietUntil) beep();   // 取り消しの音を鳴らし始めたときは、重ねない
  });
}

$('#sound').addEventListener('click', () => {
  if (soundOn) { soundOn = false; checkSound(); render(); return; }
  soundOnNow();
});
$('#soundGate').addEventListener('click', soundOnNow);
// タブレットを起こした・ほかのアプリから戻ったときは、音をもう一度出せるようにする（出せなければ「画面をタッチ」が出る）。注文も読み直す
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') hiddenAt = Date.now();
  if (document.visibilityState === 'visible' && hiddenAt && Date.now() - hiddenAt >= WAKE_TOUCH_AFTER && TABLET && soundOn) wakeTouch = true;
  if (document.visibilityState === 'visible') checkSound();   // 長く消えていたら、すぐ出す
  if (document.visibilityState === 'visible' && soundOn && audio) audio.resume().catch(() => {});
  if (document.visibilityState === 'visible') { pull(); refreshContent(); keepAwake(); }
  setTimeout(checkSound, 500);
});

/* 画面が消えると、注文も音も来なくなる（2026-11-02 ko-dai さんの報告）。タブレットでこの画面を開いているあいだは、画面を消さない。
   裏に回ると外れるので、戻ったときに取り直す。使えない端末は、今までどおり端末の設定に任せる（README「営業中は」） */
let awake = null;
function keepAwake() {
  if (!TABLET || awake || !navigator.wakeLock || document.visibilityState !== 'visible') return;
  navigator.wakeLock.request('screen').then(l => {
    awake = l;
    l.onrelease = () => { awake = null; };
  }).catch(() => {});
}

DB.onChange(key => {
  if (key === 'orders' && !ORDERS_ONLINE) checkNew();
  render();
});
// T3Works の営業日も読み直す（30分に1回まで。変わっていたら描き直す）
const syncDays = () => refreshDays().then(changed => changed && render());
setInterval(() => { render(); syncDays(); refreshContent(); }, 30000);
$('#cookBefore').textContent = TAKEOUT.cookBefore;   // 「受付済み」の見出しの「◯分前」
// バグるマネージで直した値段・売り切れ（../js/content.js）を重ねる。予約注文の窓を、公式アプリとそろえるため（2026-10-31 ko-dai さんの指示）。
// 前に読んだ分をすぐ重ね、そのあと受け口から読み直す（CONTENT_EVERY に1回まで）。読めないときは、前の控え（無ければ data.js）のまま
applyContent(contentNow()?.content);
refreshContent();
render();
syncDays();
// 受け口につないだときは、15秒ごとに注文を読み直す。電波が戻ったときもすぐ読む。合言葉がまだなら、合言葉の画面を出す
if (ORDERS_ONLINE) {
  setInterval(pull, POLL_EVERY);
  window.addEventListener('online', pull);
  if (pinGet()) pull(); else askPin();
}
// タブレットは、開いたときから音をオンにする。ブラウザが許さないとき（まだ画面に触っていない）は、少し待って「画面をタッチ」を出す
if (TABLET) {
  unlockSound().then(() => { checkSound(); render(); });
  setTimeout(checkSound, 600);
  keepAwake();
}
