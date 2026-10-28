import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Opens the app through the test harness and waits until it reports ready.
 * Without a name it opens the empty app.
 */
export async function gotoScenario(page: Page, name?: string): Promise<void> {
  await page.goto(name ? `/?fixture=${encodeURIComponent(name)}` : '/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-ready', /.+/);
  const error = await html.getAttribute('data-ready-error');
  expect(error, 'harness failed to load the scenario').toBeNull();
  await expect(html).toHaveAttribute('data-ready', '1');
}

/** The dashboard section with `data-section=name`. */
export function section(page: Page, name: string): Locator {
  return page.locator(`[data-section="${name}"]`);
}

/** Routes OpenStreetMap tile requests to a flat grey 256×256 PNG, so maps render the same offline. */
export async function stubTiles(page: Page): Promise<void> {
  await page.route('**/tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: GREY_TILE }),
  );
}

// ---------- A 256×256 flat grey PNG, built once ----------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function greyPng(size: number, grey: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); // width
  header.writeUInt32BE(size, 4); // height
  header[8] = 8; // bit depth
  header[9] = 0; // colour type: greyscale
  // compression, filter and interlace stay 0
  const row = Buffer.alloc(size + 1, grey);
  row[0] = 0; // filter: none
  const pixels = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const GREY_TILE = greyPng(256, 0xcc);
