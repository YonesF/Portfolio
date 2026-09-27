export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const assetUrl = new URL(url);
    if (assetUrl.pathname === '/') assetUrl.pathname = '/index.html';

    let response = await env.ASSETS.fetch(new Request(assetUrl, request));
    // Pages link to each other without .html, so /kontakt is kontakt.html.
    // Not /kontakt/: its relative asset paths would resolve under /kontakt/.
    if (response.status === 404 && request.method === 'GET' && !url.pathname.includes('.') && !url.pathname.endsWith('/')) {
      assetUrl.pathname = url.pathname + '.html';
      response = await env.ASSETS.fetch(new Request(assetUrl, request));
    }
    if (response.status === 404 && request.method === 'GET' && !url.pathname.includes('.')) {
      assetUrl.pathname = '/index.html';
      response = await env.ASSETS.fetch(new Request(assetUrl, request));
    }
    return response;
  }
};
