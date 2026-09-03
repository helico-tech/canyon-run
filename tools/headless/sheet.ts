// Contact sheet of PNG frames with labels, for one-glance review.
import sharp from 'sharp';
import type { OverlayOptions } from 'sharp';

export async function contactSheet(
  out: string,
  frames: Array<{ file: string; label: string }>,
  cols = 5,
  thumbW = 256,
): Promise<void> {
  if (frames.length === 0) return;
  const meta = await sharp(frames[0]!.file).metadata();
  const th = Math.round((thumbW * (meta.height ?? 1)) / (meta.width ?? 1));
  const rows = Math.ceil(frames.length / cols);
  const pad = 4;
  const labelH = 14;
  const cellW = thumbW + pad;
  const cellH = th + pad + labelH;
  const composites: OverlayOptions[] = [];
  for (let i = 0; i < frames.length; i++) {
    const x = (i % cols) * cellW + pad;
    const y = Math.floor(i / cols) * cellH + pad + labelH;
    const buf = await sharp(frames[i]!.file)
      .resize(thumbW, th, { kernel: 'nearest' })
      .png()
      .toBuffer();
    composites.push({ input: buf, left: x, top: y });
    const text = frames[i]!.label.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const svg = `<svg width="${thumbW}" height="${labelH}"><text x="0" y="11" font-family="monospace" font-size="11" fill="#fff">${text}</text></svg>`;
    composites.push({ input: Buffer.from(svg), left: x, top: y - labelH });
  }
  await sharp({
    create: {
      width: cols * cellW + pad,
      height: rows * cellH + pad,
      channels: 3,
      background: '#222',
    },
  })
    .composite(composites)
    .png()
    .toFile(out);
}
