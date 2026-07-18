/** Local-only HTTP bridge between the browser demo and the Stanza Node adapter. */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { loadParser } from 'writinglint-parser-node';

const port = Number(process.env.WRITINGLINT_PARSER_PORT ?? 4319);
const parser = loadParser();

function headers(response: ServerResponse): void {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type');
  response.setHeader('content-type', 'application/json; charset=utf-8');
}

function send(response: ServerResponse, status: number, payload: unknown): void {
  headers(response);
  response.statusCode = status;
  response.end(JSON.stringify(payload));
}

async function body(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 5 * 1024 * 1024) throw new Error('Request exceeds 5 MB');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'OPTIONS') {
      headers(response);
      response.statusCode = 204;
      response.end();
      return;
    }
    if (request.method === 'GET' && request.url === '/health') {
      await parser;
      send(response, 200, { ok: true, parser: 'stanza' });
      return;
    }
    if (request.method === 'POST' && request.url === '/parse') {
      const payload = JSON.parse(await body(request)) as { text?: unknown };
      if (typeof payload.text !== 'string') {
        send(response, 400, { error: 'text must be a string' });
        return;
      }
      send(response, 200, { sentences: await (await parser).parse(payload.text) });
      return;
    }
    send(response, 404, { error: 'not found' });
  } catch (error) {
    send(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[parser] Stanza HTTP bridge listening on http://127.0.0.1:${port}`);
});
