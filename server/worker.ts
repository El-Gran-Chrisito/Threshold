/** Cloudflare Workers entry point for the license server. Deploy with `wrangler deploy` (see wrangler.toml). */
import { handle, type Env } from './license-server'

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env)
  },
}
