import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emotions, emptySlots, placeEmotion } from '../site/state.js';

test('placing, replacing and swapping keep the original array intact', () => {
  const original = ['fear', 'love', null, null];
  assert.deepEqual(placeEmotion(original, 'calm', 0), ['calm', 'love', null, null]);
  assert.deepEqual(placeEmotion(original, 'fear', 1), ['love', 'fear', null, null]);
  assert.deepEqual(placeEmotion(original, 'fear', 2), [null, 'love', 'fear', null]);
  assert.deepEqual(placeEmotion(original, 'fear', 0), original);
  assert.deepEqual(original, ['fear', 'love', null, null]);
});

test('every reachable assignment preserves uniqueness and four slots', () => {
  const queue = [emptySlots()];
  const visited = new Set();
  while (queue.length) {
    const state = queue.shift();
    const key = JSON.stringify(state);
    if (visited.has(key)) continue;
    visited.add(key);
    for (const emotion of emotions) for (let target = 0; target < 4; target++) {
      const next = placeEmotion(state, emotion.id, target);
      assert.equal(next.length, 4);
      assert.equal(next[target], emotion.id);
      assert.equal(new Set(next.filter(Boolean)).size, next.filter(Boolean).length);
      if (!visited.has(JSON.stringify(next))) queue.push(next);
    }
  }
  assert.equal(visited.size, 209);
});

test('invalid input is rejected', () => {
  for (const args of [
    [emptySlots(), 'unknown', 0], [emptySlots(), 'fear', -1],
    [emptySlots(), 'fear', 4], [emptySlots(), 'fear', 1.5],
    [[], 'fear', 0], [['fear', 'fear', null, null], 'love', 0],
    [['unknown', null, null, null], 'love', 0],
  ]) assert.throws(() => placeEmotion(...args), TypeError);
});

test('reset returns independent empty assignments', () => {
  const one = emptySlots();
  one[0] = 'love';
  assert.deepEqual(emptySlots(), [null, null, null, null]);
});
