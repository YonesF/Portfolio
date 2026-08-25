import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const client = resolve(dist, 'client');
const server = resolve(dist, 'server');

await rm(dist, { recursive: true, force: true });
await mkdir(client, { recursive: true });
await mkdir(server, { recursive: true });

await Promise.all([
  cp(resolve(root, 'index.html'), resolve(client, 'index.html')),
  cp(resolve(root, 'favicon.svg'), resolve(client, 'favicon.svg')),
  mkdir(resolve(client, 'assets'), { recursive: true }).then(() => Promise.all([
    cp(
      resolve(root, 'assets/about-me-unicorn.json'),
      resolve(client, 'assets/about-me-unicorn.json')
    ),
    cp(
      resolve(root, 'assets/portfolio-video-poster.webp'),
      resolve(client, 'assets/portfolio-video-poster.webp')
    )
  ])),
  cp(
    resolve(root, 'copy_DAD01596-5DF3-4460-B66B-E05B3F1A8ACC.mp4'),
    resolve(client, 'copy_DAD01596-5DF3-4460-B66B-E05B3F1A8ACC.mp4')
  )
]);

const worker = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const assetUrl = new URL(url);
    if (assetUrl.pathname === '/') assetUrl.pathname = '/index.html';

    let response = await env.ASSETS.fetch(new Request(assetUrl, request));
    if (response.status === 404 && request.method === 'GET' && !url.pathname.includes('.')) {
      assetUrl.pathname = '/index.html';
      response = await env.ASSETS.fetch(new Request(assetUrl, request));
    }
    return response;
  }
};
`;

await writeFile(resolve(server, 'index.js'), worker);
