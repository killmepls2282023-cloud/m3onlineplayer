// ==========================================
// 1. ИНИЦИАЛИЗАЦИЯ AUDIUS SDK
// ==========================================
// ВСТАВЬ СВОЙ API КЛЮЧ СЮДА:
const AUDIUS_API_KEY = '0f3830ab2b2b8dc4aae3f760b239c8569b63d005'; 

const audiusSdk = window.audiusSdk({ apiKey: AUDIUS_API_KEY });

// ====== ЭЛЕМЕНТЫ ======
const audio = document.getElementById('audio');
const playBtn = document.getElementById('play');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const titleEl = document.getElementById('title');
const artistEl = document.getElementById('artist');
const coverEl = document.getElementById('cover');
const progress = document.getElementById('progress');
const progressFill = document.getElementById('progress-fill');
const playlist = document.getElementById('playlist');
const equalizer = document.getElementById('equalizer');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const searchInput = document.getElementById('search-input');
const loadMoreBtn = document.getElementById('load-more-btn');

// ====== СОСТОЯНИЕ ======
let currentTracks = [];
let currentIndex = 0;
let currentQuery = '';
let currentOffset = 0;
const LIMIT = 10; // API Audius отдает по 10 штук

// ====== ФОРМАТИРОВАНИЕ ВРЕМЕНИ ======
function formatTime(seconds) {
  if (isNaN(seconds)) return '0:00';
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

// ====== ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ (С ПОДДЕРЖКОЙ ЗЕРКАЛ) ======
function formatAudiusTracks(rawTracks) {
  return rawTracks.map(track => {
    let coverUrl = null;
    let mirrors = [];

    if (track.artwork) {
      // Ищем ссылку на картинку (разные версии API могут отдавать по-разному)
      if (track.artwork['480x480']) coverUrl = track.artwork['480x480'];
      else if (track.artwork['150x150']) coverUrl = track.artwork['150x150'];
      else if (track.artwork['1000x1000']) coverUrl = track.artwork['1000x1000'];
      else if (track.artwork.url) coverUrl = track.artwork.url; // На всякий случай

      // Сохраняем список запасных серверов
      if (track.artwork.mirrors) {
        mirrors = track.artwork.mirrors;
      }
    }

    return {
      title: track.title,
      artist: track.user.name,
      src: `https://api.audius.co/v1/tracks/${track.id}/stream`,
      cover: coverUrl,
      coverMirrors: mirrors,
      color: '#ffffff'
    };
  });
}

// ==========================================
// 2. ЗАГРУЗКА ИЗ AUDIUS
// ==========================================
async function searchAndLoad(query) {
  const wasPlaying = !audio.paused; // Запоминаем, играла ли музыка

  currentQuery = query;
  currentOffset = 0;
  
  try {
    titleEl.textContent = 'Загрузка...';
    artistEl.textContent = 'Поиск в Audius';
    loadMoreBtn.style.display = 'none';
    
    const response = await audiusSdk.tracks.searchTracks({ 
      query: query,
      limit: LIMIT,
      offset: 0
    });
    
    const rawTracks = response.data;

    if (!rawTracks || rawTracks.length === 0) {
      titleEl.textContent = 'Ничего не найдено';
      artistEl.textContent = 'Попробуй другой запрос';
      playlist.innerHTML = '';
      return;
    }

    currentTracks = formatAudiusTracks(rawTracks);
    currentOffset = rawTracks.length;

    renderPlaylist();
    loadTrack(0);

    // Если музыка играла до поиска — включаем первый найденный трек
    if (wasPlaying) {
      audio.play();
      playBtn.classList.add('is-playing');
      equalizer.classList.remove('paused');
    }

    if (rawTracks.length === LIMIT) {
      loadMoreBtn.style.display = 'block';
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = 'Показать ещё';
    }
    
  } catch (error) {
    console.error('Ошибка Audius:', error);
    titleEl.textContent = 'Ошибка';
    artistEl.textContent = 'Проверь API ключ или интернет (CORS)';
  }
}

// ==========================================
// 3. ДОГРУЗКА ТРЕКОВ
// ==========================================
async function loadMoreTracks() {
  if (!currentQuery) return;
  
  loadMoreBtn.disabled = true;
  loadMoreBtn.textContent = 'Загрузка...';

  try {
    const response = await audiusSdk.tracks.searchTracks({ 
      query: currentQuery,
      limit: LIMIT,
      offset: currentOffset
    });
    
    const rawTracks = response.data;

    if (rawTracks && rawTracks.length > 0) {
      const newTracks = formatAudiusTracks(rawTracks);
      currentTracks = [...currentTracks, ...newTracks];
      currentOffset += rawTracks.length;
      
      renderPlaylist();
      
      if (rawTracks.length < LIMIT) {
        loadMoreBtn.textContent = 'Больше нет треков';
        loadMoreBtn.disabled = true;
      } else {
        loadMoreBtn.textContent = 'Показать ещё';
        loadMoreBtn.disabled = false;
      }
    } else {
      loadMoreBtn.textContent = 'Больше нет треков';
      loadMoreBtn.disabled = true;
    }
  } catch (error) {
    console.error('Ошибка при догрузке:', error);
    loadMoreBtn.textContent = 'Ошибка, попробуй еще';
    loadMoreBtn.disabled = false;
  }
}

// ==========================================
// 4. СТАНДАРТНЫЕ ФУНКЦИИ ПЛЕЕРА
// ==========================================
function loadTrack(index) {
  if (currentTracks.length === 0) return;
  
  currentIndex = index;
  const track = currentTracks[index];
  
  audio.src = track.src;
  titleEl.textContent = track.title;
  artistEl.textContent = track.artist;

  // 1. Ставим заглушку (прозрачную или локальную)
  coverEl.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; 
  coverEl.onerror = null; 

  // 2. Если у трека есть обложка, пытаемся её загрузить
  if (track.cover) {
    coverEl.src = track.cover;

    // 3. Если основная ссылка на картинку падает с ошибкой (сервер недоступен)
    coverEl.onerror = function() {
      this.onerror = null; // Отключаем, чтобы не зациклиться
      
      if (track.coverMirrors && track.coverMirrors.length > 0) {
        // Берем ссылку на картинку и подменяем домен на первое доступное зеркало
        let newUrl = '';
        try {
          const urlObj = new URL(track.cover);
          const mirrorObj = new URL(track.coverMirrors[0]);
          urlObj.host = mirrorObj.host;
          newUrl = urlObj.toString();
        } catch (e) {
          console.warn("Ошибка парсинга URL зеркала", e);
        }

        if (newUrl) {
          // Пытаемся загрузить с зеркала. Если и оно упадет, 
          // вернется текущая заглушка (потому что onerror = null).
          this.src = newUrl;
        } else {
          this.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        }
      }
    };
  }

  // Сброс таймингов
  currentTimeEl.textContent = '0:00';
  totalTimeEl.textContent = '0:00';
  progressFill.style.width = '0%';
  progress.value = 0;

  // Подсветка активного трека
  [...playlist.children].forEach((li, i) => {
    li.classList.toggle('active', i === index);
  });
}

function renderPlaylist() {
  playlist.innerHTML = ''; 
  currentTracks.forEach((track, i) => {
    const li = document.createElement('li');
    li.textContent = `${track.title} — ${track.artist}`;
    li.addEventListener('click', () => {
      loadTrack(i);
      audio.play();
      playBtn.classList.add('is-playing');
      equalizer.classList.remove('paused');
    });
    playlist.appendChild(li);
  });
}

// ====== КНОПКИ ======
playBtn.addEventListener('click', () => {
  if (audio.paused) {
    audio.play();
    playBtn.classList.add('is-playing');
    equalizer.classList.remove('paused');
  } else {
    audio.pause();
    playBtn.classList.remove('is-playing');
    equalizer.classList.add('paused');
  }
});

prevBtn.addEventListener('click', () => {
  if (currentTracks.length === 0) return;
  loadTrack((currentIndex - 1 + currentTracks.length) % currentTracks.length);
  audio.play();
  playBtn.classList.add('is-playing');
  equalizer.classList.remove('paused');
});

nextBtn.addEventListener('click', () => {
  if (currentTracks.length === 0) return;
  loadTrack((currentIndex + 1) % currentTracks.length);
  audio.play();
  playBtn.classList.add('is-playing');
  equalizer.classList.remove('paused');
});

// ====== ОБНОВЛЕНИЕ ПРОГРЕССА ======
audio.addEventListener('timeupdate', () => {
  if (audio.duration) {
    const percent = (audio.currentTime / audio.duration) * 100;
    progress.value = percent;
    progressFill.style.width = percent + '%';
    currentTimeEl.textContent = formatTime(audio.currentTime);
    totalTimeEl.textContent = formatTime(audio.duration);
  }
});

progress.addEventListener('input', () => {
  if (audio.duration) {
    audio.currentTime = (progress.value / 100) * audio.duration;
    progressFill.style.width = progress.value + '%';
    currentTimeEl.textContent = formatTime(audio.currentTime);
  }
});

audio.addEventListener('loadedmetadata', () => {
  totalTimeEl.textContent = formatTime(audio.duration);
});

audio.addEventListener('ended', () => nextBtn.click());

// ====== ОБРАБОТКА ПОИСКА И КНОПКИ ======
searchInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    searchAndLoad(searchInput.value);
  }
});

loadMoreBtn.addEventListener('click', loadMoreTracks);

// ====== ИНИЦИАЛИЗАЦИЯ ======
// Загружаем что-то по умолчанию при старте
searchAndLoad('Lofi');
