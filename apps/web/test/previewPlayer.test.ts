import { describe, expect, it } from 'vitest';
import { createPreviewPlayer, PREVIEW_VOLUME, type AudioLike } from '../src/lib/previewPlayer.js';

class FakeAudio implements AudioLike {
  src = '';
  volume = 1;
  paused = true;
  playCalls: string[] = [];
  rejectPlay = false;
  private listeners = new Map<string, Set<() => void>>();
  play() {
    this.playCalls.push(this.src);
    if (this.rejectPlay) return Promise.reject(new Error('blocked'));
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  addEventListener(type: string, fn: () => void) {
    (this.listeners.get(type) ?? this.listeners.set(type, new Set()).get(type)!).add(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    this.listeners.get(type)?.delete(fn);
  }
  emit(type: string) {
    this.listeners.get(type)?.forEach((fn) => fn());
  }
}

function setup() {
  const audios: FakeAudio[] = [];
  const player = createPreviewPlayer(() => {
    const a = new FakeAudio();
    audios.push(a);
    return a;
  });
  return { player, audios };
}

describe('createPreviewPlayer', () => {
  it('creates one audio element lazily, at volume 0.6, and reuses it', () => {
    const { player, audios } = setup();
    expect(audios).toHaveLength(0);
    player.toggle('a');
    player.toggle('b');
    expect(audios).toHaveLength(1);
    expect(audios[0]!.volume).toBe(PREVIEW_VOLUME);
    expect(PREVIEW_VOLUME).toBe(0.6);
  });

  it('plays one preview at a time: a second one replaces the first', () => {
    const { player, audios } = setup();
    player.toggle('a');
    expect(player.getSnapshot()).toBe('a');
    player.toggle('b');
    expect(player.getSnapshot()).toBe('b');
    expect(audios[0]!.src).toBe('b');
    expect(audios[0]!.playCalls).toEqual(['a', 'b']);
  });

  it('pauses when the playing preview is toggled again', () => {
    const { player, audios } = setup();
    player.toggle('a');
    player.toggle('a');
    expect(player.getSnapshot()).toBeNull();
    expect(audios[0]!.paused).toBe(true);
  });

  it('clears the playing url when the track ends or the browser blocks playback', async () => {
    const { player, audios } = setup();
    player.toggle('a');
    audios[0]!.emit('ended');
    expect(player.getSnapshot()).toBeNull();
    audios[0]!.rejectPlay = true;
    player.toggle('b');
    await Promise.resolve();
    await Promise.resolve();
    expect(player.getSnapshot()).toBeNull();
  });

  it('stop pauses and notifies subscribers; stop with nothing playing is quiet', () => {
    const { player, audios } = setup();
    let notified = 0;
    const off = player.subscribe(() => notified++);
    player.stop();
    expect(notified).toBe(0);
    player.toggle('a');
    expect(notified).toBe(1);
    player.stop();
    expect(notified).toBe(2);
    expect(audios[0]!.paused).toBe(true);
    off();
    player.toggle('a');
    expect(notified).toBe(2);
  });
});
