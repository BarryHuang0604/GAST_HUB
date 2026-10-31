import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const root = document.querySelector('#app');
const DAY_MS = 86400000;
const DAILY_LIMIT = 20;
const stageNames = {
  '1': '基礎階｜Level 1–2',
  '2': '進階階｜Level 3–4',
  '3': '挑戰階｜Level 5–6'
};

let user = null;
let profile = {};
let members = [];
let wordList = [];
let tab = 'home';
let stage = '1';
let selectedDay = 1;
let mode = 'menu';
let queue = [];
let index = 0;
let flipped = false;
let answered = null;
let options = [];
let combo = 0;
let sessionCount = 0;
let sessionCorrect = 0;
let mistakeReview = [];
let mistakeIndex = 0;
let mistakeRevealed = false;
let editingMistake = null;

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

function button(label, action, cls = '') {
  return `<button class="${cls}" data-action="${action}">${label}</button>`;
}

function showError(error) {
  console.error(error);
  root.innerHTML = `<main class="shell"><div class="panel"><h2>操作失敗</h2><p>${escapeHTML(error.message || error)}</p>${button('重新整理', 'reload')}</div></main>`;
}

async function save() {
  if (!user) return;
  await setDoc(doc(db, 'users', user.uid), {
    name: profile.name || user.email?.split('@')[0] || '學生',
    email: user.email || '',
    mistakes: profile.mistakes || [],
    tasks: profile.tasks || [],
    notes: profile.notes || [],
    words: profile.words || {},
    vocabStages: profile.vocabStages || {},
    vocabGame: profile.vocabGame || { xp: 0, bestCombo: 0, correct: 0, sessions: 0 }
  }, { merge: true });
}

async function load() {
  const [snapshot, users] = await Promise.all([
    getDoc(doc(db, 'users', user.uid)),
    getDocs(collection(db, 'users'))
  ]);
  profile = snapshot.exists() ? snapshot.data() : {};
  profile.name ||= user.email?.split('@')[0] || '學生';
  profile.words ||= {};
  profile.mistakes ||= [];
  profile.mistakes.forEach((item, i) => {
    item.id ||= `legacy-${i}-${item.at || 'unknown'}`;
  });
  profile.tasks ||= [];
  profile.notes ||= [];
  profile.vocabStages ||= {};
  profile.vocabGame ||= { xp: 0, bestCombo: 0, correct: 0, sessions: 0 };
  members = users.docs.map(item => ({ uid: item.id, ...item.data() }));
  if (!snapshot.exists()) await save();
}

function frame(title, content) {
  const navigation = [
    ['home', '首頁'],
    ['words', '英文單字'],
    ['mistakes', '錯題本'],
    ['tasks', '讀書計畫'],
    ['notes', '共享筆記']
  ].map(([id, label]) => `<button class="nav ${tab === id ? 'current' : ''}" data-tab="${id}">${label}</button>`).join('');

  root.innerHTML = `
    <div class="shell">
      <header>
        <div class="brand">
          <span class="brand-mark">G</span>
          <span class="brand-text">GSAT <span>HUB</span><small>學測學習平台</small></span>
        </div>
        <div class="user">${escapeHTML(profile.name)} ${button('登出', 'logout', 'ghost')}</div>
      </header>
      <nav>${navigation}</nav>
      <main>
        ${tab === 'words' ? '' : `<div class="page-heading"><h1>${escapeHTML(title)}</h1></div>`}
        ${content}
      </main>
      <footer>GSAT HUB · 學習資料使用 Firebase 同步</footer>
    </div>
  `;
}

function home() {
  const due = wordList.filter(word => isDue(word)).length;
  frame('學習首頁', `
    <div class="simple-grid">
      <button class="simple-link" data-tab="words">
        <span>英文單字</span><strong>三階段單字闖關</strong><small>每天最多 20 個新字，間隔複習</small>
      </button>
      <button class="simple-link" data-tab="mistakes">
        <span>錯題本</span><strong>${profile.mistakes.length} 筆錯題</strong><small>可編輯、刪除、重新複習</small>
      </button>
      <button class="simple-link" data-tab="tasks">
        <span>讀書計畫</span><strong>${profile.tasks.filter(t => !t.done).length} 個待辦</strong><small>管理每日學習任務</small>
      </button>
      <button class="simple-link" data-tab="notes">
        <span>共享筆記</span><strong>整理學習重點</strong><small>和朋友分享筆記</small>
      </button>
    </div>
    <div class="panel"><h2>今天的複習</h2><p>目前有 ${due} 個已學單字到期。</p>${button('前往英文單字', 'go-words', 'primary')}</div>
  `);
}

function wordKey(word) {
  return word.id || `${word.level}:${word.word}`;
}

// 固定亂數排序：所有裝置及每次登入看到相同的關卡內容。
// 不使用 Math.random() 排關卡，避免重新整理後單字換關卡。
const stageWordCache = new Map();

function normalizedWord(word) {
  return String(word.word || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function stableHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stageWords(which = stage) {
  const key = String(which);
  if (stageWordCache.has(key)) return stageWordCache.get(key);

  const low = (Number(key) - 1) * 2 + 1;
  const seen = new Set();
  const uniqueWords = [];

  for (const word of wordList) {
    const level = Number(word.level);
    const name = normalizedWord(word);
    if (!name || !word.definition ||
        !/[\u3400-\u9fff]/.test(word.definition) ||
        level < low || level > low + 1 || seen.has(name)) {
      continue;
    }

    seen.add(name);
    uniqueWords.push(word);
  }

  // 使用固定種子打散字母順序，確保同階每個單字只出現一次。
  uniqueWords.sort((a, b) => {
    const aKey = normalizedWord(a);
    const bKey = normalizedWord(b);
    const aHash = stableHash(`GSAT-HUB-v3.6-stage-${key}:${aKey}`);
    const bHash = stableHash(`GSAT-HUB-v3.6-stage-${key}:${bKey}`);
    return aHash - bHash || aKey.localeCompare(bKey);
  });

  stageWordCache.set(key, uniqueWords);
  return uniqueWords;
}

function totalDays(which = stage) {
  return Math.max(1, Math.ceil(stageWords(which).length / DAILY_LIMIT));
}

function wordsForDay(day = selectedDay, which = stage) {
  return stageWords(which).slice((day - 1) * DAILY_LIMIT, day * DAILY_LIMIT);
}

function learnedState(word) {
  return profile.words[wordKey(word)] || {};
}

function isDue(word) {
  const state = learnedState(word);
  return Boolean(state.last && state.due && Date.parse(state.due) <= Date.now());
}

function currentDay() {
  const start = profile.vocabStages[stage]?.start;
  if (!start) return 1;
  return Math.min(totalDays(), Math.max(1, Math.floor((Date.now() - Date.parse(start)) / DAY_MS) + 1));
}

function meaning(word) {
  return String(word.definition || '').replace(/^\s*(?:(?:vt|vi|adj|adv|pron|prep|conj|art|aux|int|n|v)\.?\s*\/?\s*)+/i, '').trim();
}

function shuffle(list) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function game() {
  return profile.vocabGame;
}

function addExperience(correct) {
  combo = correct ? combo + 1 : 0;
  if (!correct) return;
  game().correct = (game().correct || 0) + 1;
  game().xp = (game().xp || 0) + 10 + Math.min(20, (combo - 1) * 2);
  game().bestCombo = Math.max(game().bestCombo || 0, combo);
}

function familiarity(word) {
  const state = learnedState(word);
  return Math.min(6, Math.max(0, state.reps || 0));
}

function stagePage() {
  const todayWords = wordsForDay();
  const due = stageWords().filter(isDue).length;
  const stageCards = [1, 2, 3].map(number => {
    const key = String(number);
    const all = stageWords(key);
    const learned = all.filter(word => learnedState(word).last).length;
    return `
      <button class="stage-card ${stage === key ? 'active' : ''}" data-stage="${key}">
        <span>階段 ${number}</span>
        <strong>${stageNames[key]}</strong>
        <small>${all.length} 個單字 · ${totalDays(key)} 關 · 已學 ${learned}</small>
      </button>
    `;
  }).join('');

  const tiles = Array.from({ length: totalDays() }, (_, i) => {
    const day = i + 1;
    const list = wordsForDay(day);
    const learned = list.filter(word => learnedState(word).last).length;
    const strength = list.length ? list.reduce((sum, word) => sum + familiarity(word), 0) / (list.length * 6) : 0;
    const depth = Math.min(6, Math.floor(strength * 6));
    return `
      <button class="day-tile depth-${depth} ${selectedDay === day ? 'selected' : ''}"
              data-stage-day="${day}" title="平均熟悉度 ${Math.round(strength * 100)}%">
        <b>關卡 ${day}</b>
        <small>${learned}/${list.length} · 熟悉 ${Math.round(strength * 100)}%</small>
      </button>
    `;
  }).join('');

  const started = profile.vocabStages[stage]?.start;
  frame('英文單字', `
    <div class="word-head"><div><h1>英文單字</h1><p class="muted">三階自由切換，每天最多 20 個新字。</p></div></div>
    <div class="stage-grid">${stageCards}</div>
    <div class="stage-overview">
      <div><h2>${stageNames[stage]}</h2><p>關卡 ${selectedDay} / ${totalDays()} · 本關 ${todayWords.length} 字</p></div>
      <div class="stage-commands">
        ${started ? `<button class="ghost" data-stage-today="1">回到今日關卡 ${currentDay()}</button>` : `<button class="primary" data-stage-begin="1">開始這一階</button>`}
      </div>
    </div>
    <div class="word-metrics">
      <div><span>本階單字</span><strong>${stageWords().length}</strong></div>
      <div><span>到期複習</span><strong>${due}</strong></div>
      <div><span>經驗值 XP</span><strong>${game().xp || 0}</strong></div>
    </div>
    <div class="section-head"><h2>關卡地圖</h2><p>同一關反覆複習後，底色會逐漸加深。深色代表熟悉度較高。</p></div>
    <div class="day-grid">${tiles}</div>
    <div class="section-head"><h2>開始學習</h2><p>先學本關新字，再用選擇題檢驗，最後複習到期的舊字。</p></div>
    <div class="word-modes">
      <button class="mode-card" data-word-start="flash"><span class="mode-icon">01</span><strong>單字卡</strong><span>本關 ${todayWords.length} 字</span></button>
      <button class="mode-card" data-word-start="quiz"><span class="mode-icon">02</span><strong>選擇測驗</strong><span>英文選中文，答錯自動加入錯題本</span></button>
      <button class="mode-card" data-word-start="review"><span class="mode-icon">03</span><strong>間隔複習</strong><span>目前 ${due} 字到期</span></button>
    </div>
    <div class="panel"><h2>記憶曲線</h2><p>熟悉的字安排在 1、3、7、14、30、60 天後複習；答錯則隔天再次練習。每次完成複習，關卡熟悉度會重新計算。</p></div>
  `);
}

function makeOptions(word) {
  const alternatives = shuffle(stageWords().filter(item =>
    wordKey(item) !== wordKey(word) && meaning(item) !== meaning(word)
  ));
  return shuffle([word, ...alternatives.slice(0, 3)]);
}

function startSession(which) {
  mode = which;
  index = 0;
  flipped = false;
  answered = null;
  combo = 0;
  sessionCount = 0;
  sessionCorrect = 0;
  queue = which === 'review'
    ? stageWords().filter(isDue).slice(0, 30)
    : wordsForDay().filter(word => !learnedState(word).last);
  if (!queue.length && which !== 'review') queue = wordsForDay();
  if (!queue.length) {
    mode = 'menu';
    stagePage();
    alert('目前沒有需要練習的單字。');
    return;
  }
  options = which === 'quiz' ? makeOptions(queue[0]) : [];
  sessionPage();
}

function sessionPage() {
  const word = queue[index];
  if (!word) return endSession();
  const heading = `
    <div class="word-session-head">
      <button class="back-btn" data-word-back="1">返回關卡地圖</button>
      <span>${mode === 'quiz' ? '選擇測驗' : mode === 'review' ? '間隔複習' : '單字卡'}</span>
      <span>${index + 1} / ${queue.length}</span>
    </div>
    <div class="progress-track"><div style="width:${Math.round(index / queue.length * 100)}%"></div></div>
    <p class="muted">${game().xp || 0} XP · 連續答對 ${combo} 題</p>
  `;
  if (mode !== 'quiz') {
    frame('英文單字', `
      ${heading}
      <div class="study-shell">
        <div class="study-kicker">LEVEL ${word.level}</div>
        <button class="flip-card ${flipped ? 'flipped' : ''}" data-word-flip="1">
          <span class="flip-top">${flipped ? '中文意思' : 'ENGLISH'}</span>
          <strong>${escapeHTML(flipped ? meaning(word) : word.word)}</strong>
          <small>${flipped ? escapeHTML(word.word) : '點擊查看中文'}</small>
        </button>
        <div class="study-actions">
          ${flipped ? `
            <button class="choice-again" data-word-grade="again">還不熟悉</button>
            <button class="choice-good" data-word-grade="good">我記住了</button>
          ` : `<button class="word-next" data-word-flip="1">查看答案</button>`}
        </div>
      </div>
    `);
    return;
  }
  const choices = options.map((item, i) => {
    const correct = wordKey(item) === wordKey(word);
    const selected = answered === i;
    const cls = answered === null ? '' : correct ? 'is-correct' : selected ? 'is-wrong' : '';
    return `
      <button class="quiz-option ${cls}" data-word-choice="${i}" ${answered !== null ? 'disabled' : ''}>
        <span>${'ABCD'[i]}</span><b>${escapeHTML(meaning(item))}</b>
      </button>
    `;
  }).join('');
  frame('英文單字', `
    ${heading}
    <div class="quiz-shell">
      <div class="study-kicker">LEVEL ${word.level}</div>
      <div class="quiz-word">${escapeHTML(word.word)}</div>
      <p class="quiz-prompt">選出正確中文意思</p>
      <div class="quiz-options">${choices}</div>
      ${answered === null ? '' : `
        <div class="quiz-feedback ${wordKey(options[answered]) === wordKey(word) ? 'success' : 'fail'}">
          ${wordKey(options[answered]) === wordKey(word) ? '答對了' : '已加入錯題本'}
          <small>${escapeHTML(word.word)} — ${escapeHTML(meaning(word))}</small>
        </div>
        <button class="word-next" data-word-next="1">${index + 1 === queue.length ? '完成測驗' : '下一題'}</button>
      `}
    </div>
  `);
}

function recordWord(word, correct) {
  const key = wordKey(word);
  const previous = learnedState(word);
  const reps = correct ? (previous.reps || 0) + 1 : 0;
  const interval = correct ? [1, 1, 3, 7, 14, 30, 60][Math.min(reps, 6)] : 1;
  profile.words[key] = {
    reps,
    interval,
    due: new Date(Date.now() + interval * DAY_MS).toISOString(),
    last: new Date().toISOString()
  };
  sessionCount++;
  if (correct) sessionCorrect++;
  addExperience(correct);
}

function addWordMistake(word, selectedMeaning) {
  const key = `vocab:${wordKey(word)}`;
  const existing = profile.mistakes.find(item => item.sourceKey === key);
  if (existing) {
    existing.given = selectedMeaning;
    existing.updatedAt = new Date().toISOString();
    existing.wrongCount = (existing.wrongCount || 1) + 1;
    return;
  }
  profile.mistakes.push({
    id: crypto.randomUUID(),
    sourceKey: key,
    subject: '英文單字',
    question: word.word,
    answer: meaning(word),
    given: selectedMeaning,
    note: '',
    wrongCount: 1,
    at: new Date().toISOString()
  });
}

async function gradeCurrent(correct) {
  const word = queue[index];
  recordWord(word, correct);
  if (!correct) addWordMistake(word, '單字卡：尚未記住');
  await save();
  advance();
}

function advance() {
  index++;
  flipped = false;
  answered = null;
  if (index >= queue.length) return endSession();
  if (mode === 'quiz') options = makeOptions(queue[index]);
  sessionPage();
}

function endSession() {
  game().sessions = (game().sessions || 0) + 1;
  save().catch(console.error);
  mode = 'menu';
  stagePage();
  const heading = document.querySelector('.section-head');
  if (heading) heading.insertAdjacentHTML('beforebegin', `
    <div class="session-done"><b>本回合完成</b><span>練習 ${sessionCount} 字，答對／記住 ${sessionCorrect} 字</span></div>
  `);
}

function mistakesPage() {
  const list = [...profile.mistakes].reverse();
  const entries = list.map(item => {
    const id = escapeHTML(item.id);
    return `
      <div class="mistake-entry">
        <div class="mistake-heading"><b>${escapeHTML(item.subject || '自訂錯題')}</b><small>${escapeHTML((item.at || '').slice(0, 10))}</small></div>
        <p class="mistake-question">${escapeHTML(item.question || '')}</p>
        <p>正確答案：${escapeHTML(item.answer || '')}</p>
        ${item.given ? `<p>上次錯誤：${escapeHTML(item.given)}</p>` : ''}
        ${item.note ? `<p>筆記：${escapeHTML(item.note)}</p>` : ''}
        <div class="mistake-actions">
          <button class="ghost" data-edit-mistake="${id}">編輯</button>
          <button class="ghost" data-delete-mistake="${id}">刪除</button>
        </div>
      </div>
    `;
  }).join('');

  const current = editingMistake ? profile.mistakes.find(item => item.id === editingMistake) : null;
  frame('錯題本', `
    <div class="panel">
      <h2>${current ? '編輯錯題' : '新增錯題'}</h2>
      <form id="mistakeForm" class="mistake-form">
        <label>科目<input name="subject" value="${escapeHTML(current?.subject || '')}" required></label>
        <label>題目／單字<textarea name="question" required>${escapeHTML(current?.question || '')}</textarea></label>
        <label>正確答案／中文意思<textarea name="answer" required>${escapeHTML(current?.answer || '')}</textarea></label>
        <label>我的筆記<textarea name="note">${escapeHTML(current?.note || '')}</textarea></label>
        <div class="mistake-actions"><button class="primary" type="submit">${current ? '儲存修改' : '新增錯題'}</button>${current ? '<button type="button" class="ghost" data-action="cancel-edit">取消</button>' : ''}</div>
      </form>
    </div>
    <div class="panel">
      <div class="section-head"><h2>全部錯題（${list.length}）</h2>${list.length ? '<button class="primary" data-action="review-mistakes">開始複習</button>' : ''}</div>
      ${entries || '<p>目前沒有錯題。</p>'}
    </div>
  `);
}

function startMistakeReview() {
  mistakeReview = shuffle(profile.mistakes.map(item => item.id).filter(Boolean));
  if (!mistakeReview.length) return;
  mistakeIndex = 0;
  mistakeRevealed = false;
  tab = 'mistake-review';
  mistakeReviewPage();
}

function mistakeReviewPage() {
  const item = profile.mistakes.find(m => m.id === mistakeReview[mistakeIndex]);
  if (!item) {
    tab = 'mistakes';
    mistakesPage();
    return;
  }
  frame('複習錯題', `
    <div class="panel mistake-review">
      <p class="muted">${mistakeIndex + 1} / ${mistakeReview.length} · ${escapeHTML(item.subject)}</p>
      <h2>${escapeHTML(item.question)}</h2>
      ${mistakeRevealed ? `
        <div class="review-answer"><small>正確答案</small><p>${escapeHTML(item.answer)}</p>${item.note ? `<p>筆記：${escapeHTML(item.note)}</p>` : ''}</div>
        <div class="mistake-actions">
          <button class="ghost" data-action="mistake-again">還不熟悉</button>
          <button class="primary" data-action="mistake-known">我記住了</button>
        </div>
      ` : '<button class="primary" data-action="mistake-reveal">顯示答案</button>'}
      <button class="ghost" data-action="exit-mistake-review">返回錯題本</button>
    </div>
  `);
}

async function completeMistakeReview(known) {
  const item = profile.mistakes.find(m => m.id === mistakeReview[mistakeIndex]);
  if (item) {
    item.reviewCount = (item.reviewCount || 0) + 1;
    item.knownCount = (item.knownCount || 0) + (known ? 1 : 0);
    item.lastReviewed = new Date().toISOString();
    await save();
  }
  mistakeIndex++;
  mistakeRevealed = false;
  mistakeReviewPage();
}

function tasksPage() {
  frame('讀書計畫', `
    <div class="panel">
      <form id="taskForm" class="row"><input name="task" placeholder="新增待辦事項" required><button class="primary">新增</button></form>
      ${profile.tasks.map((task, i) => `
        <div class="entry row">
          <label><input type="checkbox" data-task="${i}" ${task.done ? 'checked' : ''}> ${escapeHTML(task.text)}</label>
          <button class="ghost" data-remove-task="${i}">刪除</button>
        </div>
      `).join('') || '<p>尚無待辦事項。</p>'}
    </div>
  `);
}

function notesPage() {
  const notes = members.flatMap(member => (member.notes || []).map(note => ({ ...note, by: member.name })));
  notes.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  frame('共享筆記', `
    <div class="panel">
      <form id="noteForm"><input name="title" placeholder="筆記標題" required><textarea name="body" placeholder="筆記內容" required></textarea><button class="primary">發布筆記</button></form>
    </div>
    <div class="panel">
      ${notes.map(note => `
        <div class="entry"><b>${escapeHTML(note.title)}</b><small> · ${escapeHTML(note.by)}</small><p>${escapeHTML(note.body)}</p></div>
      `).join('') || '<p>目前沒有共享筆記。</p>'}
    </div>
  `);
}

function render() {
  if (!user) return;
  if (tab === 'words') return mode === 'menu' ? stagePage() : sessionPage();
  if (tab === 'mistakes') return mistakesPage();
  if (tab === 'mistake-review') return mistakeReviewPage();
  if (tab === 'tasks') return tasksPage();
  if (tab === 'notes') return notesPage();
  home();
}

root.addEventListener('click', async event => {
  const target = event.target.closest('button[data-tab],button[data-stage],button[data-stage-day],button[data-stage-begin],button[data-stage-today],button[data-word-start],button[data-word-back],button[data-word-flip],button[data-word-grade],button[data-word-choice],button[data-word-next],button[data-edit-mistake],button[data-delete-mistake],button[data-remove-task],button[data-action]');
  if (!target) return;
  try {
    const data = target.dataset;
    if (data.tab) {
      tab = data.tab;
      mode = 'menu';
      editingMistake = null;
      render();
      return;
    }
    if (data.stage) {
      stage = data.stage;
      selectedDay = currentDay();
      stagePage();
      return;
    }
    if (data.stageDay) {
      selectedDay = Number(data.stageDay);
      stagePage();
      return;
    }
    if (data.stageToday) {
      selectedDay = currentDay();
      stagePage();
      return;
    }
    if (data.stageBegin) {
      profile.vocabStages[stage] ||= { start: new Date().toISOString() };
      selectedDay = currentDay();
      await save();
      stagePage();
      return;
    }
    if (data.wordStart) return startSession(data.wordStart);
    if (data.wordBack) {
      mode = 'menu';
      stagePage();
      return;
    }
    if (data.wordFlip) {
      flipped = !flipped;
      sessionPage();
      return;
    }
    if (data.wordGrade) return await gradeCurrent(data.wordGrade === 'good');
    if (data.wordChoice !== undefined) {
      if (answered !== null) return;
      answered = Number(data.wordChoice);
      const word = queue[index];
      const correct = wordKey(options[answered]) === wordKey(word);
      recordWord(word, correct);
      if (!correct) addWordMistake(word, meaning(options[answered]));
      await save();
      sessionPage();
      return;
    }
    if (data.wordNext) return advance();
    if (data.editMistake) {
      editingMistake = data.editMistake;
      mistakesPage();
      return;
    }
    if (data.deleteMistake) {
      if (!confirm('確定刪除這筆錯題？')) return;
      profile.mistakes = profile.mistakes.filter(item => item.id !== data.deleteMistake);
      if (editingMistake === data.deleteMistake) editingMistake = null;
      await save();
      mistakesPage();
      return;
    }
    if (data.removeTask !== undefined) {
      profile.tasks.splice(Number(data.removeTask), 1);
      await save();
      tasksPage();
      return;
    }
    switch (data.action) {
      case 'logout': await signOut(auth); break;
      case 'reload': location.reload(); break;
      case 'go-words': tab = 'words'; stagePage(); break;
      case 'cancel-edit': editingMistake = null; mistakesPage(); break;
      case 'review-mistakes': startMistakeReview(); break;
      case 'mistake-reveal': mistakeRevealed = true; mistakeReviewPage(); break;
      case 'mistake-again': await completeMistakeReview(false); break;
      case 'mistake-known': await completeMistakeReview(true); break;
      case 'exit-mistake-review': tab = 'mistakes'; mistakesPage(); break;
    }
  } catch (error) {
    alert('操作失敗：' + error.message);
    console.error(error);
  }
});

root.addEventListener('change', async event => {
  if (event.target.dataset.task === undefined) return;
  profile.tasks[Number(event.target.dataset.task)].done = event.target.checked;
  try { await save(); } catch (error) { alert('同步失敗：' + error.message); }
});

root.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  try {
    if (form.id === 'login') {
      await signInWithEmailAndPassword(auth, data.get('email'), data.get('password'));
      return;
    }
    if (form.id === 'mistakeForm') {
      const existing = profile.mistakes.find(item => item.id === editingMistake);
      const updated = {
        subject: String(data.get('subject')).trim(),
        question: String(data.get('question')).trim(),
        answer: String(data.get('answer')).trim(),
        note: String(data.get('note')).trim()
      };
      if (existing) Object.assign(existing, updated, { updatedAt: new Date().toISOString() });
      else profile.mistakes.push({ id: crypto.randomUUID(), ...updated, at: new Date().toISOString() });
      editingMistake = null;
      await save();
      mistakesPage();
      return;
    }
    if (form.id === 'taskForm') {
      profile.tasks.push({ text: String(data.get('task')).trim(), done: false });
      await save();
      tasksPage();
      return;
    }
    if (form.id === 'noteForm') {
      profile.notes.push({ title: String(data.get('title')).trim(), body: String(data.get('body')).trim(), at: new Date().toISOString() });
      await save();
      await load();
      notesPage();
    }
  } catch (error) {
    alert('儲存失敗：' + error.message);
    console.error(error);
  }
});

async function boot() {
  try {
    const response = await fetch('./vocabulary.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('單字題庫讀取失敗');
    const json = await response.json();
    wordList = Array.isArray(json) ? json : (json.entries || json.words || []);
    stageWordCache.clear();
  } catch (error) {
    console.error('單字載入失敗', error);
    root.innerHTML = `<div class="shell"><div class="panel">單字題庫載入失敗：${escapeHTML(error.message)}</div></div>`;
    return;
  }

  onAuthStateChanged(auth, async currentUser => {
    try {
      user = currentUser;
      if (!user) {
        root.innerHTML = `
          <main class="login-screen">
            <div class="login-card">
              <h1>GSAT HUB</h1><p>登入後繼續學習</p>
              <form id="login">
                <input type="email" name="email" placeholder="電子郵件" autocomplete="username" required>
                <input type="password" name="password" placeholder="密碼" autocomplete="current-password" required>
                <button class="primary">登入</button>
              </form>
            </div>
          </main>
        `;
        return;
      }
      await load();
      selectedDay = currentDay();
      render();
    } catch (error) {
      showError(error);
    }
  });
}

boot();
