let referenceToken = 0;
const ogpCache = {};

// フィールドの安全取得（URL / url 両対応）
function getField(obj, ...keys) {
  for (const k of keys) {
    if (obj && typeof obj[k] === 'string' && obj[k].trim() !== '') return obj[k].trim();
  }
  return '';
}

// YouTube の URL から動画 ID を抽出（watch / youtu.be / shorts / embed / live 対応）
function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return /^[\w-]{11}$/.test(id) ? id : '';
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') {
        const id = u.searchParams.get('v') || '';
        return /^[\w-]{11}$/.test(id) ? id : '';
      }
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch {}
  return '';
}

// YouTube oEmbed API で動画タイトルを取得（キャッシュ付き）
const ytTitleCache = {};

async function fetchYouTubeTitle(videoId) {
  if (ytTitleCache[videoId] !== undefined) return ytTitleCache[videoId];

  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`
    );
    if (!res.ok) throw new Error('oEmbed failed');
    const data = await res.json();
    const title = typeof data.title === 'string' ? data.title : '';
    ytTitleCache[videoId] = title;
    return title;
  } catch {
    ytTitleCache[videoId] = ''; // 失敗もキャッシュ（リトライ防止）
    return '';
  }
}

// YouTube のサムネイル URL を返す（maxres → hq の順で存在する方）
function youtubeThumbCandidates(id) {
  return [
    `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
  ];
}

// Microlink で OGP 取得（キャッシュ付き）
async function fetchOgp(url) {
  if (ogpCache[url]) return ogpCache[url];
  try {
    const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error('OGP fetch failed');
    const json = await res.json();
    const d = (json && json.data) || {};
    const result = {
      image: (d.image && d.image.url) ? d.image.url : '',
      title: typeof d.title === 'string' ? d.title : '',
      description: typeof d.description === 'string' ? d.description : ''
    };
    ogpCache[url] = result;
    return result;
  } catch {
    const empty = { image: '', title: '', description: '' };
    ogpCache[url] = empty;
    return empty;
  }
}

async function renderReference(q) {
  const myToken = ++referenceToken; // 競合対策
  const area = document.getElementById('referenceArea');
  const url = getField(q, 'URL', 'url');

  if (!url) {
    area.classList.add('hidden');
    return;
  }

  const link      = document.getElementById('referenceLink');
  const thumbWrap = document.getElementById('referenceThumbWrap');
  const thumb     = document.getElementById('referenceThumb');
  const titleEl   = document.getElementById('referenceTitle');
  const domainEl  = document.getElementById('referenceDomain');

  // リセット
  link.href = url;
  thumbWrap.classList.add('hidden');
  thumb.removeAttribute('src');
  thumb.onerror = () => thumbWrap.classList.add('hidden');

  let domain = url;
  try { domain = new URL(url).hostname; } catch {}
  domainEl.textContent = domain;

  const providedTitle = getField(q, 'URLTitle', 'urlTitle', 'title');
  const providedImage = getField(q, 'URLImage', 'urlImage', 'image', 'thumbnail');

  titleEl.textContent = providedTitle || url;

  if (providedImage) {
    thumb.src = providedImage;
    thumb.alt = providedTitle || domain;
    thumbWrap.classList.remove('hidden');
  }

    area.classList.remove('hidden');

  // サムネイル未指定 → YouTube は直リンク、それ以外は OGP 自動取得
  if (!providedImage) {
    const ytId = extractYouTubeId(url);

    if (ytId) {
      // --- サムネイル（これまで通り） ---
      const candidates = youtubeThumbCandidates(ytId);
      let idx = 0;

      thumb.onerror = () => {
        idx++;
        if (idx < candidates.length) {
          thumb.src = candidates[idx];
        } else {
          thumbWrap.classList.add('hidden');
        }
      };
      thumb.src = candidates[0];
      thumb.alt = providedTitle || 'YouTube';
      thumbWrap.classList.remove('hidden');

      // --- タイトルを oEmbed で取得 ---
      if (!providedTitle) {
        titleEl.textContent = 'YouTube'; // 取得までの仮表示

        const myToken2 = referenceToken; // 競合検知用に現在のトークンを保持
        fetchYouTubeTitle(ytId).then((videoTitle) => {
          // 問題が切り替わっていたら何もしない
          if (myToken2 !== referenceToken) return;
          titleEl.textContent = videoTitle || 'YouTube';
        });
      }
      return;
    }

    // 他サイトは Microlink にフォールバック
    const ogp = await fetchOgp(url);
    if (myToken !== referenceToken) return;
    if (!providedTitle && ogp.title) titleEl.textContent = ogp.title;
    if (ogp.image) {
      thumb.src = ogp.image;
      thumb.alt = providedTitle || ogp.title || domain;
      thumbWrap.classList.remove('hidden');
    }
  }
}


const cache = {};
let currentQuestions = [];
let currentIndex = 0;
let currentGenrePath = "";

// テキスト内のURLを検出してハイパーリンク（<a>タグ）に変換する関数
function linkify(text) {
  if (!text) return '';
  
  // HTMLエスケープ処理（XSS対策）
  const escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  // URLに使用される半角文字のみにマッチ（全角文字が出た時点で区切られる）
  const urlRegex = /(https?:\/\/[\w\-.~:/?#\[\]@!$&'()*+,;=%]+)/g;

  // URL部分を <a> タグに置換（別タブで開く）
  return escapedText.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}

async function init() {
  const select = document.getElementById('genreSelect');

  // 前回選択したジャンルが保存されていれば復元する
  const savedGenre = localStorage.getItem('chimatagram_last_genre');
  if (savedGenre && Array.from(select.options).some(opt => opt.value === savedGenre)) {
    select.value = savedGenre;
  }

  select.addEventListener('change', (e) => {
    loadGenre(e.target.value);
  });

  loadGenre(select.value);
}

async function loadGenre(filePath) {
  currentGenrePath = filePath;

  // 選択したジャンルを保存
  localStorage.setItem('chimatagram_last_genre', filePath);

  if (!cache[filePath]) {
    try {
      const response = await fetch(filePath);
      if (!response.ok) throw new Error('File not found');
      cache[filePath] = await response.json();
    } catch (e) {
      alert(`データファイル (${filePath}) の読み込みに失敗しました。`);
      clearDisplay();
      return;
    }
  }

  currentQuestions = cache[filePath];
  const totalCount = currentQuestions.length;
  document.getElementById('totalNum').textContent = `全 ${totalCount} 問`;

  if (totalCount === 0) {
    clearDisplay();
    return;
  }

  const savedIndex = localStorage.getItem(`chimatagram_progress_${filePath}`);
  if (savedIndex !== null && parseInt(savedIndex, 10) < totalCount) {
    currentIndex = parseInt(savedIndex, 10);
  } else {
    currentIndex = 0;
  }

  showQuestion(currentIndex);
}

function showQuestion(index) {
  if (index < 0 || index >= currentQuestions.length) return;

  currentIndex = index;
  const q = currentQuestions[currentIndex];

  document.getElementById('problemNum').textContent = `第 ${currentIndex + 1} 問`;
  document.getElementById('genreText').textContent = q.genre || '-';
  document.getElementById('questionText').textContent = q.question;
  document.getElementById('readingText').textContent = q.reading;
  
  document.getElementById('answerText').textContent = q.answer || '-';

  // ジャンル判定
  const isNonGenreAnagram = currentGenrePath.includes('non_genre_anagram.json');
  const isNonGenreChimatagram = currentGenrePath.includes('non_genre.json') && !isNonGenreAnagram;

  // 【問題側】備考（remarks）が存在する場合のみ表示する
  const remarksArea = document.getElementById('remarksArea');
  if (q.remarks && q.remarks.trim() !== '') {
    remarksArea.style.display = 'block';
    document.getElementById('remarksText').innerHTML = linkify(q.remarks);
  } else {
    remarksArea.style.display = 'none';
  }

  // 【答え側】ノンジャンル（アナグラム）および ノンジャンル（チマタグラム）のときは「答えの読み」を表示
  const answerReadingArea = document.getElementById('answerReadingArea');
  if (isNonGenreAnagram || isNonGenreChimatagram) {
    answerReadingArea.style.display = 'block';
    document.getElementById('answerReadingText').textContent = q.answerReading || '-';
  } else {
    answerReadingArea.style.display = 'none';
  }

  // ノンジャンル（アナグラム）のときは「余計な1文字」を非表示
  const extraCharArea = document.getElementById('extraCharArea');
  if (isNonGenreAnagram) {
    extraCharArea.style.display = 'none';
  } else {
    extraCharArea.style.display = 'block';
    document.getElementById('extraCharText').textContent = q.extraChar || '-';
  }

  document.getElementById('answerArea').classList.add('hidden');
  document.getElementById('problemInput').value = currentIndex + 1;
  document.getElementById('problemInput').max = currentQuestions.length;

  renderReference(q); 

  localStorage.setItem(`chimatagram_progress_${currentGenrePath}`, currentIndex);
}

function clearDisplay() {
  document.getElementById('problemNum').textContent = "第 - 問";
  document.getElementById('totalNum').textContent = "全 0 問";
  document.getElementById('genreText').textContent = "-";
  document.getElementById('questionText').textContent = "-";
  document.getElementById('readingText').textContent = "-";
  document.getElementById('remarksText').textContent = "-";
  document.getElementById('answerArea').classList.add('hidden');
  document.getElementById('referenceArea').classList.add('hidden');
}

// イベント設定
document.getElementById('showAnswerBtn').addEventListener('click', () => {
  document.getElementById('answerArea').classList.remove('hidden');
});

document.getElementById('prevBtn').addEventListener('click', () => {
  if (currentIndex - 1 >= 0) {
    showQuestion(currentIndex - 1);
  } else {
    alert('これが最初の問題です！');
  }
});

document.getElementById('nextBtn').addEventListener('click', () => {
  if (currentIndex + 1 < currentQuestions.length) {
    showQuestion(currentIndex + 1);
  } else {
    alert('このジャンルの問題は以上です！');
  }
});

document.getElementById('goBtn').addEventListener('click', () => {
  const inputVal = parseInt(document.getElementById('problemInput').value, 10);
  if (!isNaN(inputVal) && inputVal >= 1 && inputVal <= currentQuestions.length) {
    showQuestion(inputVal - 1);
  } else {
    alert(`1 〜 ${currentQuestions.length} の範囲で指定してください。`);
  }
});

// 問題番号入力欄でEnterキーが押されたときも「移動」ボタンを押した時と同じ処理を行う
document.getElementById('problemInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('goBtn').click();
  }
});

// ランダムボタンのイベント処理
document.getElementById('randomBtn').addEventListener('click', () => {
  if (currentQuestions.length === 0) return;
  if (currentQuestions.length === 1) {
    showQuestion(0);
    return;
  }
  let randomIndex;
  // 直前と同じ問題が連続で選ばれないようにする
  do {
    randomIndex = Math.floor(Math.random() * currentQuestions.length);
  } while (randomIndex === currentIndex);

  showQuestion(randomIndex);
});

init();