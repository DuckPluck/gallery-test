import { emotions, emptySlots, placeEmotion } from './state.js';
import { groups } from './media.js';

const $ = selector => document.querySelector(selector);
const label = id => emotions.find(item => item.id === id)?.label;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const announcer = $('#announcer');
const announce = message => { announcer.textContent = message; };
let slots = emptySlots();
let selected = null;
let paused = reduced.matches;
let drag = null;
let suppressClick = false;
const players = [];
const piles = [];
const related = { owner: null, index: null, cards: [], players: [], timer: null, loadTimer: null, switchTimer: null, nextSource: null, animation: null, pointerInside: false, corridor: null };
const motionStyle = getComputedStyle(document.documentElement);
const relatedDelay = parseFloat(motionStyle.getPropertyValue('--duration-fast'));
const relatedDuration = parseFloat(motionStyle.getPropertyValue('--duration-base'));
const relatedEasing = motionStyle.getPropertyValue('--ease-out').trim();
let restoringSourceFocus = false;
const relatedPanel = document.createElement('section');
relatedPanel.id = 'related-videos';
relatedPanel.className = 'related-popover';
relatedPanel.hidden = true;
relatedPanel.setAttribute('aria-labelledby', 'related-title');
relatedPanel.innerHTML = '<header class="related-heading"><div><h2 id="related-title">Связанные видео</h2><p class="related-caption"></p></div><button class="related-close quiet-button" type="button" aria-label="Закрыть связанные видео"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></header><div class="related-grid"></div>';
document.body.append(relatedPanel);
relatedPanel.querySelector('.related-close').addEventListener('click', () => closeRelated(true));
relatedPanel.addEventListener('pointerenter', () => {
  related.pointerInside = true;
  clearTimeout(related.timer);
  cancelRelatedSwitch();
});
relatedPanel.addEventListener('pointerleave', event => {
  if (event.pointerType !== 'mouse') return;
  related.pointerInside = Boolean(related.owner?.cards[related.index].card.contains(event.relatedTarget)) || inRelatedCorridor(event.clientX, event.clientY);
  if (!related.pointerInside) scheduleRelatedClose();
});
relatedPanel.addEventListener('focusin', () => {
  clearTimeout(related.timer);
  related.animation?.finish();
});
relatedPanel.addEventListener('focusout', event => { if (!relatedPanel.contains(event.relatedTarget)) scheduleRelatedClose(); });
const grip = '<svg class="grip" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="5" cy="4" r="1"/><circle cx="11" cy="4" r="1"/><circle cx="5" cy="8" r="1"/><circle cx="11" cy="8" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="11" cy="12" r="1"/></svg>';
const playIcon = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m7 4 9 6-9 6Z"/></svg>';
const retryIcon = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M16 6a7 7 0 1 0 1 7M16 2v5h-5"/></svg>';

function createVideoCard(clip, index, isRelated = false) {
  const card = document.createElement('div');
  card.className = isRelated ? 'related-clip' : 'clip';
  card.id = clip.id;
  card.dataset.active = 'false';
  card.innerHTML = `<button class="clip-preview" type="button" aria-label="${clip.label}. ${isRelated ? 'Увеличить' : 'Связанные видео'}" aria-pressed="false"><video muted loop playsinline preload="metadata" poster="${clip.poster}" aria-hidden="true"></video><span class="clip-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span></button><button class="clip-retry" type="button" hidden></button>`;
  const button = card.querySelector('.clip-preview');
  const video = card.querySelector('video');
  const retry = card.querySelector('.clip-retry');
  video.muted = true;
  const player = { video, retry, clip, visible: false, loaded: false, problem: null, attempts: 0, phaseApplied: false, startReady: clip.phase === 0, startTimer: null, pending: null };
  players.push(player);

  const setProblem = problem => {
    player.problem = problem;
    retry.hidden = !problem;
    retry.innerHTML = problem === 'error' ? retryIcon : playIcon;
    retry.setAttribute('aria-label', `${problem === 'error' ? 'Повторить загрузку' : 'Запустить'}: ${player.clip.label}`);
  };
  player.setProblem = setProblem;
  const bindVideo = media => {
    media.muted = true;
    media.addEventListener('loadedmetadata', () => {
      if (player.video !== media) return;
      if (!player.phaseApplied && Number.isFinite(media.duration) && media.duration > 0) {
        // Stagger playback instead of seeking, which can restart WebKit loading.
        player.phaseApplied = true;
        player.startTimer = setTimeout(() => {
          player.startReady = true;
          syncPlayer(player);
        }, media.duration * player.clip.phase * 1000);
      }
      syncPlayer(player);
    });
    media.addEventListener('error', () => { if (player.video === media) setProblem('error'); });
    media.addEventListener('play', () => {
      if (player.video !== media || paused || document.hidden || !player.visible) media.pause();
    });
  };
  bindVideo(video);
  retry.addEventListener('click', () => {
    const failedLoad = player.problem === 'error';
    if (failedLoad) {
      player.attempts++;
      clearTimeout(player.startTimer);
      player.phaseApplied = true;
      player.startReady = true;
      // Recreate WebKit's failed decoder as well as its cached resource.
      const previous = player.video;
      visibility.unobserve(previous);
      previous.pause();
      const replacement = previous.cloneNode(false);
      replacement.removeAttribute('src');
      replacement.autoplay = false;
      player.video = replacement;
      previous.replaceWith(replacement);
      previous.removeAttribute('src');
      previous.load();
      bindVideo(replacement);
      const url = new URL(player.clip.src, location.href);
      url.searchParams.set('retry', String(player.attempts));
      replacement.src = url.href;
      visibility.observe(replacement);
    }
    setProblem(null);
    if (!failedLoad) paused = false;
    syncPlayback();
  });
  player.suspend = () => {
    player.attempts++;
    player.visible = false;
    clearTimeout(player.startTimer);
    visibility.unobserve(player.video);
    player.video.autoplay = false;
    if (!player.video.paused) player.video.pause();
  };
  return { card, button, retry, player };
}

for (const [groupIndex, group] of groups.entries()) {
  const section = document.createElement('section');
  section.className = 'group';
  section.setAttribute('aria-labelledby', `${group.id}-title`);
  section.innerHTML = `<div class="group-heading"><h2 id="${group.id}-title">${group.label}</h2><span class="group-count">8 видео</span></div><div class="pile" data-group="${groupIndex}"></div><button class="slot" data-slot="${groupIndex}" type="button" aria-describedby="${group.id}-title" aria-pressed="false"><span class="slot-copy"><span class="slot-caption">Ваш выбор</span><span class="slot-answer">Перенесите эмоцию</span></span><span class="slot-sign" aria-hidden="true">+</span></button>`;
  $('#gallery').append(section);
  const pile = section.querySelector('.pile');
  const state = { element: pile, cards: [], hover: null, pinned: null, focused: null, intensity: 1, width: 0, height: 0, frame: 0, lastTime: 0 };
  piles.push(state);

  for (const [index, clip] of group.videos.entries()) {
    const { card, button, retry } = createVideoCard(clip, index);
    pile.append(card);
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'related-videos');
    const geometry = { card, button, clip, x: 0, y: 0, width: 0, height: 0, current: null, target: null };
    state.cards.push(geometry);
    let lastPointer = 'mouse';
    button.addEventListener('pointerdown', event => { lastPointer = event.pointerType; });
    button.addEventListener('click', event => {
      if (event.detail === 0) {
        state.focused = index;
        updatePile(state);
        openRelated(state, index, true);
        return;
      }
      if (lastPointer === 'touch' || lastPointer === 'pen' || !finePointer.matches || reduced.matches) {
        if (state.pinned === index) { closeRelated(); return; }
        state.pinned = index;
        state.focused = null;
        updatePile(state);
        openRelated(state, index);
      }
    });
    button.addEventListener('focus', () => {
      if (restoringSourceFocus) return;
      if (button.matches(':focus-visible')) {
        state.focused = index;
        updatePile(state);
        openRelated(state, index);
      }
    });
    button.addEventListener('blur', event => {
      if (!card.contains(event.relatedTarget)) { state.focused = null; updatePile(state); scheduleRelatedClose(); }
    });
    retry.addEventListener('focus', () => { state.focused = index; updatePile(state); });
    retry.addEventListener('blur', event => {
      if (!card.contains(event.relatedTarget)) { state.focused = null; updatePile(state); }
    });
  }

  pile.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || !finePointer.matches || reduced.matches || drag?.started) return;
    state.pinned = null;
    state.focused = null;
    const x = event.clientX - state.rect.left;
    const y = event.clientY - state.rect.top;
    let nearest = -1;
    let distance = Infinity;
    state.cards.forEach((card, index) => {
      const d = Math.hypot(card.x - x, card.y - y);
      if (d < distance) { distance = d; nearest = index; }
    });
    const hit = state.cards.findIndex(card => card.card.contains(event.target));
    if (hit !== -1) { nearest = hit; distance = 0; }
    if (hit === -1 && state.hover !== null) {
      const previous = state.cards[state.hover];
      const previousDistance = Math.hypot(previous.x - x, previous.y - y);
      if (previousDistance < distance + 14) { nearest = state.hover; distance = previousDistance; }
    }
    state.hover = distance < 150 ? nearest : null;
    state.intensity = clamp((150 - distance) / 100, 0, 1);
    updatePile(state);
    if (hit !== -1) requestRelated(state, hit, event);
  });
  pile.addEventListener('pointerleave', event => {
    state.hover = null;
    if (related.owner === state) related.pointerInside = relatedPanel.contains(event.relatedTarget) || inRelatedCorridor(event.clientX, event.clientY);
    updatePile(state);
    scheduleRelatedClose();
  });
}

document.addEventListener('pointermove', event => {
  if (!related.owner || event.pointerType !== 'mouse') return;
  if (related.nextSource && !related.nextSource.pile.cards[related.nextSource.index].card.contains(event.target)) cancelRelatedSwitch();
  const inside = relatedPanel.contains(event.target) || related.owner.cards[related.index].card.contains(event.target) || inRelatedCorridor(event.clientX, event.clientY);
  if (inside) clearTimeout(related.timer);
  else if (related.pointerInside) scheduleRelatedClose();
  related.pointerInside = inside;
}, { passive: true });

function cancelRelatedSwitch() {
  clearTimeout(related.switchTimer);
  related.nextSource = null;
}

function inRelatedCorridor(x, y) {
  const area = related.corridor;
  return area && x >= area.left && x <= area.right && y >= area.top && y <= area.bottom;
}

function requestRelated(pile, index, event) {
  if (!related.owner || (related.owner === pile && related.index === index)) {
    cancelRelatedSwitch();
    openRelated(pile, index);
    return;
  }
  if (inRelatedCorridor(event.clientX, event.clientY)) {
    cancelRelatedSwitch();
    clearTimeout(related.timer);
    return;
  }
  if (related.nextSource?.pile === pile && related.nextSource.index === index) return;
  cancelRelatedSwitch();
  related.nextSource = { pile, index };
  // Let the pointer cross neighbouring cards on its way into the open group.
  related.switchTimer = setTimeout(() => {
    openRelated(pile, index);
    related.pointerInside = true;
  }, relatedDuration);
}

function clearRelatedCards() {
  clearTimeout(related.timer);
  clearTimeout(related.loadTimer);
  related.animation?.cancel();
  related.players.forEach(player => player.suspend());
  related.players = [];
  relatedPanel.querySelector('.related-grid').replaceChildren();
}

function openRelated(pile, index, focusFirst = false) {
  cancelRelatedSwitch();
  clearTimeout(related.timer);
  const source = pile.cards[index];
  if (related.owner !== pile || related.index !== index) {
    const previous = related.owner;
    if (previous) previous.cards[related.index].button.setAttribute('aria-expanded', 'false');
    clearRelatedCards();
    related.owner = pile;
    related.index = index;
    related.pointerInside = false;
    source.button.setAttribute('aria-expanded', 'true');
    relatedPanel.querySelector('.related-caption').textContent = `${source.clip.label} · ${source.clip.related.length} видео`;
    for (const [childIndex, clip] of source.clip.related.entries()) {
      // Reuse at most eight decoders when the pointer switches between sources.
      let child = related.cards[childIndex];
      if (!child) {
        child = createVideoCard(clip, childIndex, true);
        related.cards.push(child);
        child.button.addEventListener('click', () => {
          const active = child.button.getAttribute('aria-pressed') !== 'true';
          relatedPanel.querySelectorAll('.related-clip').forEach(card => {
            card.dataset.active = 'false';
            card.querySelector('.clip-preview').setAttribute('aria-pressed', 'false');
          });
          child.card.dataset.active = String(active);
          child.button.setAttribute('aria-pressed', String(active));
        });
      }
      const { player } = child;
      if (player.clip.src !== clip.src) {
        player.loaded = false;
        player.phaseApplied = false;
        player.startReady = clip.phase === 0;
        player.setProblem(null);
      } else if (player.loaded) player.startReady = true;
      player.clip = clip;
      child.card.id = clip.id;
      child.card.dataset.active = 'false';
      child.button.setAttribute('aria-label', `${clip.label}. Увеличить`);
      child.button.setAttribute('aria-pressed', 'false');
      player.video.poster = clip.poster;
      child.card.style.setProperty('--related-tilt', `${[-3, 2, -2, 3][childIndex % 4]}deg`);
      relatedPanel.querySelector('.related-grid').append(child.card);
      related.players.push(player);
    }
    relatedPanel.hidden = false;
    // Avoid starting decoders for groups the pointer only passes over.
    related.loadTimer = setTimeout(() => {
      related.players.forEach(player => visibility.observe(player.video));
    }, relatedDelay);
    updatePile(pile);
    if (previous && previous !== pile) updatePile(previous);
    positionRelated();
    if (!reduced.matches && finePointer.matches) {
      related.animation = relatedPanel.animate([
        { opacity: 0, transform: 'scale(.35)' },
        { opacity: 1, transform: 'scale(1)' },
      ], { duration: relatedDuration, easing: relatedEasing });
    }
  }
  if (focusFirst) relatedPanel.querySelector('.clip-preview').focus({ preventScroll: true });
}

function closeRelated(restoreFocus = false) {
  cancelRelatedSwitch();
  const owner = related.owner;
  if (!owner) return;
  const source = owner.cards[related.index];
  source.button.setAttribute('aria-expanded', 'false');
  clearRelatedCards();
  related.owner = null;
  related.index = null;
  related.pointerInside = false;
  related.corridor = null;
  relatedPanel.hidden = true;
  owner.hover = null;
  owner.pinned = null;
  owner.focused = null;
  updatePile(owner);
  if (restoreFocus) {
    restoringSourceFocus = true;
    source.button.focus({ preventScroll: true });
    restoringSourceFocus = false;
  }
}

function scheduleRelatedClose() {
  clearTimeout(related.timer);
  related.timer = setTimeout(() => {
    if (!related.owner || related.owner.pinned !== null || related.pointerInside ||
        relatedPanel.querySelector(':focus-visible') ||
        related.owner.cards[related.index].button.matches(':focus-visible')) return;
    closeRelated();
  }, relatedDuration);
}

function positionRelated() {
  const owner = related.owner;
  if (!owner) return;
  const source = owner.cards[related.index];
  const [x, y, scale] = source.target;
  const anchor = {
    x: owner.rect.left + x + source.width / 2,
    y: owner.rect.top + y + source.height / 2,
    width: source.width * scale,
    height: source.height * scale,
  };
  const margin = 12;
  const tray = $('.answer-tray');
  const bottom = getComputedStyle(tray).position === 'fixed' ? tray.getBoundingClientRect().top - margin : innerHeight - margin;
  if (anchor.y + anchor.height / 2 < 0 || anchor.y - anchor.height / 2 > bottom) { closeRelated(); return; }
  const columns = innerWidth < 600 ? 2 : Math.ceil(source.clip.related.length / 2);
  relatedPanel.style.setProperty('--related-columns', columns);
  relatedPanel.style.width = `${Math.min(innerWidth - margin * 2, columns * 144 + 40)}px`;
  relatedPanel.style.maxHeight = `${Math.max(44, bottom - margin)}px`;
  const box = relatedPanel.getBoundingClientRect();
  let left = anchor.x + anchor.width / 2 + margin;
  let top = anchor.y - box.height / 2;
  if (left + box.width > innerWidth - margin) left = anchor.x - anchor.width / 2 - margin - box.width;
  if (left < margin) {
    left = anchor.x - box.width / 2;
    top = anchor.y - anchor.height / 2 - margin - box.height;
    if (top < margin) top = anchor.y + anchor.height / 2 + margin;
  }
  left = clamp(left, margin, innerWidth - margin - box.width);
  top = clamp(top, margin, Math.max(margin, bottom - box.height));
  relatedPanel.style.left = `${left}px`;
  relatedPanel.style.top = `${top}px`;
  relatedPanel.style.transformOrigin = `${anchor.x - left}px ${anchor.y - top}px`;
  const sourceLeft = anchor.x - anchor.width / 2;
  const sourceRight = anchor.x + anchor.width / 2;
  const sourceTop = anchor.y - anchor.height / 2;
  const sourceBottom = anchor.y + anchor.height / 2;
  // Keep the narrow gap interactive so crossing another card cannot change owner.
  if (left >= sourceRight || left + box.width <= sourceLeft) {
    related.corridor = {
      left: Math.min(sourceRight, left + box.width) - 4,
      right: Math.max(sourceLeft, left) + 4,
      top: Math.min(sourceTop, top),
      bottom: Math.max(sourceBottom, top + box.height),
    };
  } else if (top >= sourceBottom || top + box.height <= sourceTop) {
    related.corridor = {
      left: Math.min(sourceLeft, left),
      right: Math.max(sourceRight, left + box.width),
      top: Math.min(sourceBottom, top + box.height) - 4,
      bottom: Math.max(sourceTop, top) + 4,
    };
  } else related.corridor = null;
}

for (const emotion of emotions) {
  const cell = document.createElement('div');
  cell.className = 'emotion-cell';
  cell.innerHTML = `<button class="emotion" data-emotion="${emotion.id}" type="button" aria-pressed="false">${grip}<span>${emotion.label}</span></button><span class="emotion-location" hidden></span>`;
  $('#emotion-list').append(cell);
}

function renderAnswers() {
  document.querySelectorAll('[data-slot]').forEach((button, index) => {
    const emotion = slots[index];
    button.querySelector('.slot-answer').textContent = emotion ? label(emotion) : 'Перенесите эмоцию';
    const sign = emotion ? 'M5 15 15 5M5 5h10v10' : 'M10 4v12M4 10h12';
    button.querySelector('.slot-sign').innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="${sign}"/></svg>`;
    button.classList.toggle('assigned', Boolean(emotion));
    button.setAttribute('aria-pressed', String(Boolean(emotion && selected === emotion)));
    if (emotion) button.dataset.emotion = emotion;
    else delete button.dataset.emotion;
  });
  document.querySelectorAll('.emotion').forEach(button => {
    const index = slots.indexOf(button.dataset.emotion);
    button.hidden = index !== -1;
    button.setAttribute('aria-pressed', String(selected === button.dataset.emotion));
    const location = button.nextElementSibling;
    location.hidden = index === -1;
    location.textContent = index === -1 ? '' : `${label(button.dataset.emotion)} · группа ${index + 1}`;
  });
  const filled = slots.filter(Boolean).length;
  $('#progress').textContent = filled === 4 ? 'Все варианты распределены' : `Распределено ${filled} из 4`;
  $('#progress').classList.toggle('complete', filled === 4);
  $('#reset').disabled = filled === 0 && !selected;
  $('#selection-hint').textContent = selected
    ? `${label(selected)}: выберите слот. ${finePointer.matches ? 'Escape отменяет выбор.' : 'Повторное нажатие отменяет выбор.'}`
    : filled === 4
      ? 'Чтобы поменять ответы местами, выберите эмоцию в заполненном слоте, затем другой слот.'
      : filled > 0
        ? 'Переносите эмоции из панели или заполненных слотов. Можно выбрать эмоцию, затем нажать на слот.'
        : 'Перетащите эмоцию в слот или выберите её, а затем нажмите на слот.';
}

function assign(emotion, index) {
  slots = placeEmotion(slots, emotion, index);
  selected = null;
  renderAnswers();
  announce(`${label(emotion)}: группа ${index + 1}.`);
  document.querySelector(`[data-slot="${index}"]`).focus({ preventScroll: true });
}

document.addEventListener('click', event => {
  if (suppressClick) return;
  const slot = event.target.closest('[data-slot]');
  const item = event.target.closest('.emotion');
  if (slot && selected) assign(selected, Number(slot.dataset.slot));
  else if (slot?.dataset.emotion || item) {
    const emotion = (item || slot).dataset.emotion;
    selected = selected === emotion ? null : emotion;
    renderAnswers();
    if (selected) announce(`${label(selected)} выбрано. Выберите слот.`);
  } else if (slot) {
    $('#selection-hint').textContent = 'Сначала выберите эмоцию в панели ответов.';
    announce('Сначала выберите эмоцию в панели ответов.');
  }
});

$('#reset').addEventListener('click', () => {
  finishDrag(false);
  slots = emptySlots();
  selected = null;
  renderAnswers();
  document.querySelector('.emotion').focus({ preventScroll: true });
  announce('Ответы сброшены. Можно начать заново.');
});

document.addEventListener('pointerdown', event => {
  const inRelated = relatedPanel.contains(event.target);
  if (!inRelated && !event.target.closest('.clip')) closeRelated();
  for (const pile of piles) {
    if (inRelated && related.owner === pile) continue;
    if (!pile.element.contains(event.target) || !event.target.closest('.clip')) {
      pile.pinned = null;
      pile.focused = null;
      pile.hover = null;
      updatePile(pile);
    }
  }
  const source = event.target.closest('[data-emotion]');
  if (!source || event.button !== 0 || !event.isPrimary || drag) return;
  drag = { pointer: event.pointerId, source, emotion: source.dataset.emotion, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, started: false, target: null, frame: 0 };
  source.setPointerCapture(event.pointerId);
});

document.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.pointer) return;
  drag.x = event.clientX;
  drag.y = event.clientY;
  if (!drag.started && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 6) {
    drag.started = true;
    drag.ghost = document.createElement('div');
    drag.ghost.className = 'drag-ghost';
    drag.ghost.textContent = label(drag.emotion);
    drag.ghost.setAttribute('aria-hidden', 'true');
    document.body.append(drag.ghost);
    document.body.classList.add('dragging');
    drag.source.classList.add('is-dragging');
    drag.frame = requestAnimationFrame(dragFrame);
    announce(`${label(drag.emotion)}: перенесите в слот.`);
  }
  if (drag.started) event.preventDefault();
}, { passive: false });

function dragFrame() {
  if (!drag?.started) return;
  drag.ghost.style.transform = `translate(${drag.x + 12}px, ${drag.y - 25}px)`;
  const edge = 52;
  let delta = 0;
  if (drag.y < edge) delta = -12 * clamp((edge - drag.y) / edge, 0, 1);
  if (drag.y > innerHeight - edge) delta = 12 * clamp((drag.y - innerHeight + edge) / edge, 0, 1);
  if (delta) scrollBy(0, delta);
  const target = document.elementFromPoint(drag.x, drag.y)?.closest('[data-slot]');
  if (target !== drag.target) {
    drag.target?.classList.remove('drop-target');
    drag.target = target;
    target?.classList.add('drop-target');
  }
  drag.frame = requestAnimationFrame(dragFrame);
}

function finishDrag(commit) {
  if (!drag) return;
  const finished = drag;
  drag = null;
  cancelAnimationFrame(finished.frame);
  finished.ghost?.remove();
  finished.target?.classList.remove('drop-target');
  finished.source.classList.remove('is-dragging');
  document.body.classList.remove('dragging');
  if (finished.source.hasPointerCapture(finished.pointer)) finished.source.releasePointerCapture(finished.pointer);
  if (finished.started) {
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    if (commit && finished.target) assign(finished.emotion, Number(finished.target.dataset.slot));
    else announce('Перенос отменён. Ответы сохранены.');
  }
}

document.addEventListener('pointerup', event => {
  if (drag?.pointer !== event.pointerId) return;
  if (drag.started) {
    drag.target?.classList.remove('drop-target');
    drag.target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-slot]');
  }
  finishDrag(true);
});
document.addEventListener('pointercancel', () => finishDrag(false));
document.addEventListener('lostpointercapture', event => { if (drag?.pointer === event.pointerId) finishDrag(false); });
addEventListener('blur', () => { finishDrag(false); closeRelated(); });
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const restore = relatedPanel.contains(document.activeElement);
  closeRelated(restore);
  finishDrag(false);
  selected = null;
  renderAnswers();
  for (const pile of piles) { pile.pinned = null; pile.focused = null; pile.hover = null; updatePile(pile); }
  announce('Выбор отменён.');
});

const anchors = [
  [.20, .24, -5], [.51, .22, 3], [.80, .27, 5],
  [.34, .48, -3], [.68, .51, 4],
  [.20, .74, -4], [.50, .76, -1], [.81, .73, 5],
];

function measurePile(pile) {
  pile.rect = pile.element.getBoundingClientRect();
  pile.width = pile.rect.width;
  pile.height = pile.rect.height;
  const width = parseFloat(getComputedStyle(pile.cards[0].card).width);
  pile.cards.forEach((card, index) => {
    card.width = width;
    card.height = width * 4 / 3;
    card.x = pile.width * anchors[index][0];
    card.y = pile.height * anchors[index][1];
    card.current = null;
  });
  updatePile(pile);
  if (related.owner === pile) positionRelated();
}

function updatePile(pile) {
  const active = pile.focused ?? pile.pinned ?? (related.owner === pile ? related.index : pile.hover);
  const amount = pile.focused !== null || pile.pinned !== null || related.owner === pile ? 1 : pile.intensity;
  const scale = active === null ? 1 : 1 + .8 * amount;
  const focus = active === null ? null : pile.cards[active];
  let focusX = focus?.x;
  let focusY = focus?.y;
  if (focus) {
    focusX = clamp(focus.x, focus.width * scale / 2 + 8, pile.width - focus.width * scale / 2 - 8);
    focusY = clamp(focus.y, focus.height * scale / 2 + 8, pile.height - focus.height * scale / 2 - 8);
  }
  pile.cards.forEach((card, index) => {
    let x = card.x;
    let y = card.y;
    if (focus && index !== active) {
      const dx = card.x - focusX;
      const dy = card.y - focusY;
      const clearX = (focus.width * scale + card.width) / 2 + 10;
      const clearY = (focus.height * scale + card.height) / 2 + 10;
      const push = Math.min(clearX / Math.max(Math.abs(dx), 1), clearY / Math.max(Math.abs(dy), 1));
      if (push > 1) { x += dx * (push - 1) * amount; y += dy * (push - 1) * amount; }
    }
    const isActive = active === index;
    const cardScale = isActive ? scale : 1;
    if (isActive) { x = focusX; y = focusY; }
    x = clamp(x, card.width * cardScale / 2 + 6, pile.width - card.width * cardScale / 2 - 6);
    y = clamp(y, card.height * cardScale / 2 + 6, pile.height - card.height * cardScale / 2 - 6);
    card.target = [x - card.width / 2, y - card.height / 2, cardScale, isActive ? 0 : anchors[index][2]];
    card.card.dataset.active = String(isActive);
    card.card.style.zIndex = isActive ? '20' : String(index + 1);
    card.button.setAttribute('aria-pressed', String(isActive));
    if (!card.current || reduced.matches) card.current = [...card.target];
  });
  if (!pile.frame) pile.frame = requestAnimationFrame(time => animatePile(pile, time));
}

function animatePile(pile, time) {
  const dt = pile.lastTime ? Math.min(time - pile.lastTime, 50) : 16;
  pile.lastTime = time;
  const step = reduced.matches ? 1 : 1 - Math.exp(-dt / 55);
  let moving = false;
  for (const item of pile.cards) {
    item.current = item.current.map((value, index) => {
      const next = value + (item.target[index] - value) * step;
      if (Math.abs(next - item.target[index]) > .001) moving = true;
      return next;
    });
    const [x, y, scale, angle] = item.current;
    item.card.style.transform = `translate(${x}px, ${y}px) rotate(${angle}deg) scale(${scale})`;
    item.card.style.willChange = moving ? 'transform' : 'auto';
  }
  pile.frame = moving ? requestAnimationFrame(next => animatePile(pile, next)) : 0;
  if (!moving) pile.lastTime = 0;
}

const resize = new ResizeObserver(entries => {
  for (const entry of entries) measurePile(piles.find(pile => pile.element === entry.target));
});
for (const pile of piles) resize.observe(pile.element);
// Scroll changes viewport coordinates without changing the stable card anchors.
addEventListener('scroll', () => {
  for (const pile of piles) pile.rect = pile.element.getBoundingClientRect();
  positionRelated();
}, { passive: true });

function syncPlayer(player) {
  const shouldPlay = !paused && !document.hidden && player.visible && player.startReady;
  if (player.video.autoplay !== shouldPlay) player.video.autoplay = shouldPlay;
  if (!shouldPlay) { if (!player.video.paused) player.video.pause(); return; }
  if (!player.loaded || player.problem === 'error' || !player.video.paused || player.pending === player.attempts) return;
  // Looping is the requested inspection material, with a global pause control.
  const attempt = player.attempts;
  player.pending = attempt;
  player.video.play().then(() => {
    if (attempt !== player.attempts) return;
    if (player.problem === 'play') player.setProblem(null);
    if (paused || document.hidden || !player.visible) player.video.pause();
  }).catch(error => {
    if (attempt !== player.attempts || paused || !player.visible) return;
    if (error.name === 'NotAllowedError') player.setProblem('play');
    else if (error.name !== 'AbortError') player.setProblem('error');
  }).finally(() => { if (player.pending === attempt) player.pending = null; });
}

function syncPlayback() {
  $('#playback').textContent = paused ? 'Включить видео' : 'Пауза видео';
  players.forEach(syncPlayer);
}

const visibility = new IntersectionObserver(entries => {
  for (const entry of entries) {
    const player = players.find(item => item.video === entry.target);
    if (!player) continue;
    player.visible = entry.isIntersecting;
    if (player.visible && !player.loaded) {
      player.loaded = true;
      player.video.src = player.clip.src;
    }
    syncPlayer(player);
  }
});
players.forEach(player => visibility.observe(player.video));
$('#playback').addEventListener('click', () => { paused = !paused; syncPlayback(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { finishDrag(false); closeRelated(); }
  syncPlayback();
});
reduced.addEventListener('change', () => {
  if (reduced.matches) { paused = true; related.animation?.cancel(); }
  for (const pile of piles) { pile.hover = null; updatePile(pile); }
  syncPlayback();
});
renderAnswers();
syncPlayback();
