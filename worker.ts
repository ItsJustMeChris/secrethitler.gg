import handler from 'vinext/server/fetch-handler';
import { openTableSocket } from './lib/server';

// Handle upgrades before the framework clones/normalizes HTTP responses.
const worker = {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    if (new URL(request.url).pathname === '/api/table/live')
      return openTableSocket(request, ctx);
    return handler.fetch(request, env, ctx);
  },
};
export default worker;
