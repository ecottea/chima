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