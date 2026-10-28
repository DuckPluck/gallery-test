import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { once } from 'node:events';

await mkdir('site/videos', { recursive: true });
await mkdir('site/posters', { recursive: true });
const width = 240;
const height = 320;
for (let group = 0; group < 4; group++) {
  const output = `site/videos/demo-${group + 1}.mp4`;
  const encoder = spawn(ffmpeg.path, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', `${width}x${height}`, '-framerate', '24', '-i', 'pipe:0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', '-an', output], { stdio: ['pipe', 'ignore', 'inherit'] });
  const done = once(encoder, 'close');
  for (let frame = 0; frame < 72; frame++) {
    const pixels = Buffer.alloc(width * height * 3);
    const time = frame / 72 * Math.PI * 2;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const nx = x - 120;
      const ny = y - 151;
      const radius = 55 + (group === 1 ? Math.sin(time) * 10 : 0);
      const dotX = Math.cos(time + group) * (group === 3 ? 28 : 66);
      const dotY = Math.sin(time * (group === 2 ? 2 : 1) + group) * 66;
      const ring = Math.abs(Math.hypot(nx, ny) - radius) < 1.5;
      const dot = Math.hypot(nx - dotX, ny - dotY) < 13;
      const inner = Math.hypot(nx + dotX * .35, ny + dotY * .35) < 25;
      const grid = x % 24 === 0 && y % 24 === 0;
      const color = dot ? [42, 76, 60] : ring ? [111, 125, 105] : inner ? [183, 191, 169] : grid ? [205, 205, 191] : [230, 228, 218];
      const offset = (y * width + x) * 3;
      pixels[offset] = color[0]; pixels[offset + 1] = color[1]; pixels[offset + 2] = color[2];
    }
    if (!encoder.stdin.write(pixels)) await once(encoder.stdin, 'drain');
  }
  encoder.stdin.end();
  const [status] = await done;
  if (status !== 0) throw new Error(`Video encoding failed: ${output}`);
  const poster = spawn(ffmpeg.path, ['-y', '-loglevel', 'error', '-i', output, '-frames:v', '1', `site/posters/demo-${group + 1}.png`], { stdio: 'inherit' });
  if ((await once(poster, 'close'))[0] !== 0) throw new Error('Poster encoding failed');
  console.log(output);
}
