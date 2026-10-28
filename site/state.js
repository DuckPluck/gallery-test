export const emotions = [
  { id: 'fear', label: 'Страх' },
  { id: 'love', label: 'Любовь' },
  { id: 'arousal', label: 'Возбуждение' },
  { id: 'calm', label: 'Успокоение' },
];

export const emptySlots = () => Array(4).fill(null);

export function placeEmotion(slots, emotion, target) {
  if (slots.length !== 4 || !Number.isInteger(target) || target < 0 || target > 3 ||
      !emotions.some(item => item.id === emotion) ||
      slots.some(value => value !== null && !emotions.some(item => item.id === value)) ||
      new Set(slots.filter(Boolean)).size !== slots.filter(Boolean).length) {
    throw new TypeError('Invalid assignment');
  }
  const next = [...slots];
  const source = next.indexOf(emotion);
  if (source === target) return next;
  if (source !== -1) next[source] = next[target];
  next[target] = emotion;
  return next;
}
