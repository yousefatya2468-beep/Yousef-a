// Change this value before sharing the page with students.
const TEACHER_PASSWORD = '123456';
const DATABASE_NAME = 'teacher-learning-library';
const STORE_NAME = 'videos';
const FALLBACK_KEY = 'teacher-learning-library-videos';

const videoGrid = document.getElementById('videoGrid');
const emptyState = document.getElementById('emptyState');
const videoForm = document.getElementById('videoForm');
const videoError = document.getElementById('videoError');
const loginModal = document.getElementById('loginModal');
const dashboardModal = document.getElementById('dashboardModal');
let videos = [];
let database = null;
let activeSource = 'file';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB is unavailable'));
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open storage'));
  });
}

function databaseRequest(mode, action) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Storage request failed'));
    transaction.onabort = () => reject(transaction.error || new Error('Storage transaction failed'));
  });
}

function readFallback() {
  try {
    return JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]');
  } catch (_) {
    return [];
  }
}

function writeFallback() {
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(videos));
}

async function saveVideo(video) {
  if (database) return databaseRequest('readwrite', store => store.put(video));
  if (video.type === 'file') throw new Error('تخزين الفيديوهات غير متاح في هذا المتصفح. جرّب رابط فيديو بدلًا من رفع الملف.');
  localStorage.setItem(FALLBACK_KEY, JSON.stringify([video, ...videos]));
}

async function removeVideo(id) {
  if (database) return databaseRequest('readwrite', store => store.delete(id));
  videos = videos.filter(video => video.id !== id);
  writeFallback();
}

function createId() {
  return window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function addVideoCard(video) {
  const card = document.createElement('article');
  card.className = 'video-card';
  const media = video.type === 'file' ? document.createElement('video') : createLinkedMedia(video.url);
  media.classList.add('video-frame');
  if (media.tagName === 'VIDEO') {
    media.controls = true;
    media.preload = 'metadata';
    media.src = URL.createObjectURL(video.blob);
  }
  card.append(media);

  const body = document.createElement('div');
  body.className = 'video-card-body';
  const title = document.createElement('h3');
  title.textContent = video.title;
  body.append(title);
  if (video.description) {
    const description = document.createElement('p');
    description.textContent = video.description;
    body.append(description);
  }
  const meta = document.createElement('div');
  meta.className = 'video-meta';
  meta.textContent = video.createdAt ? new Date(video.createdAt).toLocaleDateString('ar') : 'درس تعليمي';
  body.append(meta);
  card.append(body);
  videoGrid.append(card);
}

function createLinkedMedia(rawUrl) {
  const url = new URL(rawUrl);
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  let embedUrl = '';
  if (host === 'youtu.be') {
    embedUrl = `https://www.youtube-nocookie.com/embed/${url.pathname.slice(1)}`;
  } else if (host.endsWith('youtube.com')) {
    const videoId = url.searchParams.get('v') || url.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/)?.[1];
    if (videoId) embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}`;
  } else if (host.endsWith('vimeo.com')) {
    const videoId = url.pathname.match(/\/(\d+)/)?.[1];
    if (videoId) embedUrl = `https://player.vimeo.com/video/${videoId}`;
  }

  if (embedUrl) {
    const frame = document.createElement('iframe');
    frame.src = embedUrl;
    frame.title = 'مشغل فيديو الدرس';
    frame.loading = 'lazy';
    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    frame.allowFullscreen = true;
    return frame;
  }

  const player = document.createElement('video');
  player.src = url.href;
  player.controls = true;
  player.preload = 'metadata';
  return player;
}

function renderVideos() {
  videoGrid.replaceChildren();
  videos.forEach(addVideoCard);
  emptyState.hidden = videos.length > 0;
  document.getElementById('lessonCount').textContent = `${videos.length.toLocaleString('ar')} ${videos.length === 1 ? 'درس' : 'دروس'}`;
  renderManageList();
}

function renderManageList() {
  const list = document.getElementById('manageList');
  list.replaceChildren();
  document.getElementById('manageCount').textContent = videos.length.toLocaleString('ar');
  if (!videos.length) {
    const empty = document.createElement('p');
    empty.className = 'manage-empty';
    empty.textContent = 'لم تتم إضافة دروس بعد.';
    list.append(empty);
    return;
  }
  videos.forEach(video => {
    const row = document.createElement('div');
    row.className = 'manage-item';
    const title = document.createElement('span');
    title.className = 'manage-item-title';
    title.textContent = video.title;
    const remove = document.createElement('button');
    remove.className = 'delete-button';
    remove.type = 'button';
    remove.textContent = 'حذف';
    remove.setAttribute('aria-label', `حذف درس ${video.title}`);
    remove.addEventListener('click', async () => {
      try {
        await removeVideo(video.id);
        videos = videos.filter(item => item.id !== video.id);
        renderVideos();
      } catch (_) {
        videoError.textContent = 'تعذر حذف الدرس. حاول مرة أخرى.';
      }
    });
    row.append(title, remove);
    list.append(row);
  });
}

async function loadVideos() {
  try {
    database = await openDatabase();
    videos = await databaseRequest('readonly', store => store.getAll());
  } catch (_) {
    database = null;
    videos = readFallback();
  }
  videos.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  renderVideos();
}

function openModal(modal) {
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('.modal.open')) document.body.style.overflow = '';
}

document.getElementById('openLogin').addEventListener('click', () => {
  document.getElementById('loginError').textContent = '';
  openModal(loginModal);
  setTimeout(() => document.getElementById('password').focus(), 50);
});

document.querySelectorAll('[data-close="login"]').forEach(element => element.addEventListener('click', () => closeModal(loginModal)));
document.querySelectorAll('[data-close="dashboard"]').forEach(element => element.addEventListener('click', () => closeModal(dashboardModal)));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeModal(loginModal);
    closeModal(dashboardModal);
  }
});

document.getElementById('loginForm').addEventListener('submit', event => {
  event.preventDefault();
  const passwordInput = document.getElementById('password');
  if (passwordInput.value !== TEACHER_PASSWORD) {
    document.getElementById('loginError').textContent = 'كلمة المرور غير صحيحة. حاول مرة أخرى.';
    passwordInput.select();
    return;
  }
  passwordInput.value = '';
  closeModal(loginModal);
  document.getElementById('loginError').textContent = '';
  renderManageList();
  openModal(dashboardModal);
});

document.getElementById('logoutButton').addEventListener('click', () => closeModal(dashboardModal));

document.querySelectorAll('.source-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    activeSource = tab.dataset.source;
    document.querySelectorAll('.source-tab').forEach(item => item.classList.toggle('active', item === tab));
    document.getElementById('filePanel').classList.toggle('hidden', activeSource !== 'file');
    document.getElementById('linkPanel').classList.toggle('hidden', activeSource !== 'link');
    document.getElementById('videoFile').required = activeSource === 'file';
    document.getElementById('videoUrl').required = activeSource === 'link';
    videoError.textContent = '';
  });
});

document.getElementById('videoFile').addEventListener('change', event => {
  const file = event.target.files[0];
  document.getElementById('fileName').textContent = file ? file.name : 'MP4 أو WebM — اختر ملفًا من الهاتف أو الكمبيوتر';
});

videoForm.addEventListener('submit', async event => {
  event.preventDefault();
  videoError.textContent = '';
  const title = document.getElementById('videoTitle').value.trim();
  const description = document.getElementById('videoDescription').value.trim();
  const file = document.getElementById('videoFile').files[0];
  let video;

  if (activeSource === 'file') {
    if (!file) {
      videoError.textContent = 'اختر ملف فيديو أولًا.';
      return;
    }
    if (!file.type.startsWith('video/')) {
      videoError.textContent = 'الملف المحدد ليس ملف فيديو صالحًا.';
      return;
    }
    video = { id: createId(), title, description, createdAt: new Date().toISOString(), type: 'file', blob: file };
  } else {
    const rawUrl = document.getElementById('videoUrl').value.trim();
    try {
      const url = new URL(rawUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid protocol');
      video = { id: createId(), title, description, createdAt: new Date().toISOString(), type: 'link', url: url.href };
    } catch (_) {
      videoError.textContent = 'أدخل رابط فيديو صحيحًا يبدأ بـ https:// أو http://.';
      return;
    }
  }

  const submitButton = document.getElementById('addVideoButton');
  submitButton.disabled = true;
  submitButton.textContent = 'جارٍ حفظ الدرس...';
  try {
    await saveVideo(video);
    videos.unshift(video);
    videos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    renderVideos();
    videoForm.reset();
    document.getElementById('fileName').textContent = 'MP4 أو WebM — اختر ملفًا من الهاتف أو الكمبيوتر';
    closeModal(dashboardModal);
    document.getElementById('lessons').scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    videoError.textContent = error.message && error.message.startsWith('تخزين')
      ? error.message
      : 'تعذر حفظ الفيديو. قد تكون مساحة التخزين غير كافية، جرّب ملفًا أصغر أو رابطًا.';
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'إضافة الدرس <span aria-hidden="true">＋</span>';
  }
});

loadVideos();
