const $ = selector => document.querySelector(selector);
const pages = [...document.querySelectorAll('[data-index]')];
const tabs = [...document.querySelectorAll('.tabs button')];
const stage = $('.stage');
const passage = $('.passage');
const skip = $('#skip-transition');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const transitionTitles = ['For My Baby Julie', 'Our special picture', 'My apology', 'A letter from my heart', 'One last thing'];
let current = 0;
let journey;
let hasOpened = false;

function showPage(index) {
  for (const [i, page] of pages.entries()) {
    page.hidden = i !== index;
    page.inert = i !== index;
    if (i === index) tabs[i].setAttribute('aria-current', 'step');
    else tabs[i].removeAttribute('aria-current');
  }
  stage.dataset.page = index;
  current = index;
}

function finishJourney() {
  if (!journey) return;
  const { index, animations, timer } = journey;
  journey = null;
  clearTimeout(timer);
  for (const animation of animations) animation.cancel();
  showPage(index);
  stage.classList.remove('opening');
  stage.style.height = '';
  passage.hidden = true;
  $('#title-' + index).focus({ preventScroll: true });
}

function navigate(index) {
  if (!Number.isInteger(index) || !pages[index]) return;
  if (index !== 0 && !hasOpened) {
    hasOpened = true;
    startOnOpen();
  }
  if (journey) finishJourney();
  if (current === index) {
    stage.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (stage.getBoundingClientRect().top < 0) stage.scrollIntoView({ block: 'start' });
  const previous = current;
  journey = { index, animations: [], timer: null };
  if (motion.matches || typeof passage.animate !== 'function') {
    finishJourney();
    return;
  }
  const run = journey;
  // Keep the turn and its skip button in view, including after a long page.
  stage.style.height = Math.min(stage.offsetHeight, Math.max(290, innerHeight * 0.70)) + 'px';
  pages[previous].inert = true;
  if (previous === 0) stage.classList.add('opening');
  $('#transition-name').textContent = transitionTitles[index];
  passage.hidden = false;
  skip.focus({ preventScroll: true });
  const turn = passage.animate([
    { opacity: 0, offset: 0 }, { opacity: 0, offset: .09 },
    { opacity: 1, offset: .26 }, { opacity: 1, offset: .76 },
    { opacity: 0, offset: 1 }
  ], { duration: 5000, easing: 'linear', fill: 'both' });
  run.animations.push(turn,
    $('.passage-content').animate([
      { opacity: 0, transform: 'translateY(10px)', filter: 'blur(3px)' },
      { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)', offset: .3 },
      { opacity: 1, offset: .76 },
      { opacity: 0, transform: 'translateY(-5px)' }
    ], { duration: 4200, delay: 350, fill: 'both' }),
    $('.progress i').animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 3900, delay: 450, fill: 'both' })
  );
  run.timer = setTimeout(() => {
    if (journey !== run) return;
    showPage(index);
    // The overlay retains keyboard focus until the incoming page is ready.
    pages[index].inert = true;
  }, 1450);
  turn.onfinish = () => { if (journey === run) finishJourney(); };
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-go]');
  if (button) navigate(Number(button.dataset.go));
});
skip.addEventListener('click', finishJourney);
motion.addEventListener('change', () => { if (motion.matches) finishJourney(); });

// Both user-supplied media paths ship as replaceable, empty files. Inspect
// metadata before assigning a media URL so the empty copy never decodes.
async function hasMedia(url) {
  // A local document uses the image/audio decoder instead of an HTTP request.
  if (location.protocol === 'file:') return true;
  try {
    const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (head.ok && !head.headers.get('Content-Type')?.includes('text/html')) {
      const bytes = head.headers.get('Content-Length');
      if (bytes !== null) return Number(bytes) > 0;
    } else if (![405, 501].includes(head.status)) return false;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok || response.headers.get('Content-Type')?.includes('text/html')) return false;
    const reader = response.body.getReader();
    try { return !(await reader.read()).done; }
    finally { await reader.cancel(); }
  } catch { return false; }
}

const photoURL = 'assets/images/us.jpg';
hasMedia(photoURL).then(available => {
  if (!available) return;
  const image = new Image();
  image.alt = 'James and Baby Julie together';
  image.onload = () => $('.photowell').replaceChildren(image);
  image.src = photoURL;
});

const audio = $('#audio');
const music = $('#music');
const panel = $('#music-panel');
const play = $('#play');
const mute = $('#mute');
const file = $('#song-file');
const chooseSong = $('.file-label');
const musicState = $('#music-state');
const songURL = 'assets/music/mysong.mp3';
let songAvailable = false;
let playBlocked = false;
let localSongURL;
audio.volume = .32;

function icon(name) {
  return '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
}
function updatePlayer() {
  const playing = songAvailable && !audio.paused;
  music.classList.toggle('playing', playing && !audio.muted);
  music.querySelector('span').textContent = playBlocked ? 'Play Our Song' : 'Our Song';
  play.hidden = mute.hidden = !songAvailable;
  chooseSong.hidden = songAvailable;
  play.innerHTML = icon(playing ? 'pause' : 'play') + (playing ? 'Pause song' : 'Play Our Song');
  mute.innerHTML = icon(audio.muted ? 'volume-x' : 'volume-2');
  mute.setAttribute('aria-pressed', String(audio.muted));
  mute.setAttribute('aria-label', audio.muted ? 'Unmute music' : 'Mute music');
  musicState.textContent = !songAvailable ? 'No song has been added yet.' :
    playBlocked ? 'Tap play when you’re ready.' :
    playing ? (audio.muted ? 'Playing quietly · muted' : 'Now playing') : 'Ready when you are.';
}

const musicReady = hasMedia(songURL).then(available => {
  if (!localSongURL && available) {
    songAvailable = true;
    audio.preload = 'metadata';
    audio.src = songURL;
  }
  updatePlayer();
});
async function playSong() {
  if (!songAvailable) return;
  try { await audio.play(); playBlocked = false; }
  catch (error) {
    if (error.name === 'NotAllowedError') playBlocked = true;
    else if (error.name !== 'AbortError') songAvailable = false;
  }
  updatePlayer();
}
function startOnOpen() {
  if (songAvailable) void playSong();
  else void musicReady.then(() => { if (songAvailable) void playSong(); });
}
function setPanel(open) {
  panel.hidden = !open;
  music.setAttribute('aria-expanded', String(open));
}
music.addEventListener('click', () => {
  if (playBlocked) void playSong();
  setPanel(panel.hidden);
});
play.addEventListener('click', () => { if (audio.paused) void playSong(); else audio.pause(); });
mute.addEventListener('click', () => { audio.muted = !audio.muted; updatePlayer(); });
audio.addEventListener('play', updatePlayer);
audio.addEventListener('pause', updatePlayer);
audio.addEventListener('error', () => { songAvailable = false; playBlocked = false; updatePlayer(); });
chooseSong.addEventListener('click', () => file.click());
file.addEventListener('change', () => {
  const selected = file.files[0];
  if (!selected) return;
  if (localSongURL) URL.revokeObjectURL(localSongURL);
  localSongURL = URL.createObjectURL(selected);
  audio.src = localSongURL;
  songAvailable = true;
  file.value = '';
  void playSong();
});
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.player')) setPanel(false);
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!panel.hidden) { setPanel(false); music.focus(); }
  else finishJourney();
});

const art = $('.art');
const finePointer = matchMedia('(hover:hover) and (pointer:fine)');
art.addEventListener('pointermove', event => {
  if (motion.matches || !finePointer.matches || journey) return;
  const rect = art.getBoundingClientRect();
  art.style.setProperty('--px', ((event.clientX - rect.left) / rect.width - .5) * 8 + 'px');
  art.style.setProperty('--py', ((event.clientY - rect.top) / rect.height - .5) * 6 + 'px');
});
art.addEventListener('pointerleave', () => {
  art.style.removeProperty('--px');
  art.style.removeProperty('--py');
});
