// フィールドの安全取得（複数のキー名に対応）
function getField(obj, ...keys) {
  for (const k of keys) {
    if (obj && typeof obj[k] === 'string' && obj[k].trim() !== '') return obj[k].trim();
  }
  return '';
}

function renderReference(q) {
  const area = document.getElementById('referenceArea');
  const url = getField(q, 'URL', 'url');

  const link      = document.getElementById('referenceLink');
  const thumbWrap = document.getElementById('referenceThumbWrap');
  const thumb     = document.getElementById('referenceThumb');
  const titleEl   = document.getElementById('referenceTitle');
  const domainEl  = document.getElementById('referenceDomain');

  // エリア自体は常に表示してレイアウトずれ（ガタつき）を防ぐ
  area.classList.remove('hidden');

  if (!url) {
    // データがない場合の表示（No Data）
    link.href = "#";
    link.classList.add('no-data');
    thumbWrap.classList.add('hidden');
    titleEl.textContent = "参考情報はありません";
    domainEl.textContent = "-";
    return;
  }

  // データがある場合
  link.classList.remove('no-data');
  link.href = url;
  thumbWrap.classList.add('hidden');
  thumb.removeAttribute('src');
  thumb.onerror = null;

  let domain = url;
  try { domain = new URL(url).hostname; } catch {}
  domainEl.textContent = domain;

  // JSONから title, image を取得
  const providedTitle = getField(q, 'title', 'URLTitle', 'urlTitle');
  const providedImage = getField(q, 'image', 'URLImage', 'urlImage', 'thumbnail');

  // title があれば設定、なければURLをそのまま表示
  titleEl.textContent = providedTitle || url;

  // image があれば設定、なければ画像を非表示
  if (providedImage) {
    thumb.onerror = () => thumbWrap.classList.add('hidden');
    thumb.src = providedImage;
    thumb.alt = providedTitle || domain;
    thumbWrap.classList.remove('hidden');
  } else {
    thumbWrap.classList.add('hidden');
  }
}

const cache = {};
let currentQuestions = [];
let currentIndex = 0;
let currentGenrePath = "";

async function init() {
  const select = document.getElementById('genreSelect');

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

  const isNonGenreAnagram = currentGenrePath.includes('non_genre_anagram.json');
  const isNonGenreChimatagram = currentGenrePath.includes('non_genre.json') && !isNonGenreAnagram;

  const answerReadingArea = document.getElementById('answerReadingArea');
  if (isNonGenreAnagram || isNonGenreChimatagram) {
    answerReadingArea.style.display = 'block';
    document.getElementById('answerReadingText').textContent = q.answerReading || '-';
  } else {
    answerReadingArea.style.display = 'none';
  }

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

  // 問題文がDOMにセットされた直後に文字サイズを自動調整
  setTimeout(adjustFontSize, 0);
}

// 問題文のフォントサイズを枠に収まるように自動調整する関数
function adjustFontSize() {
  const qText = document.getElementById('questionText');
  if (!qText) return;

  // 初期サイズにリセット（style.cssの指定値 1.8rem に戻す）
  qText.style.fontSize = '1.8rem';
  
  let currentSize = 1.8;

  // 文字の幅(scrollWidth) が 表示領域(clientWidth) を超えている場合、0.1remずつ小さくする
  while (qText.scrollWidth > qText.clientWidth && currentSize > 0.5) {
    currentSize -= 0.1;
    qText.style.fontSize = `${currentSize}rem`;
  }
}

// 画面の向きが変わったりリサイズされたりした時にも再計算する
window.addEventListener('resize', adjustFontSize);

function clearDisplay() {
  document.getElementById('problemNum').textContent = "第 - 問";
  document.getElementById('totalNum').textContent = "全 0 問";
  document.getElementById('genreText').textContent = "-";
  document.getElementById('questionText').textContent = "-";
  document.getElementById('readingText').textContent = "-";
  document.getElementById('answerArea').classList.add('hidden');
  
  // クリア時もレイアウトを崩さないため、No Data状態の参考エリアを表示
  renderReference({});
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

document.getElementById('problemInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('goBtn').click();
  }
});

document.getElementById('randomBtn').addEventListener('click', () => {
  if (currentQuestions.length === 0) return;
  if (currentQuestions.length === 1) {
    showQuestion(0);
    return;
  }
  let randomIndex;
  do {
    randomIndex = Math.floor(Math.random() * currentQuestions.length);
  } while (randomIndex === currentIndex);

  showQuestion(randomIndex);
});

init();