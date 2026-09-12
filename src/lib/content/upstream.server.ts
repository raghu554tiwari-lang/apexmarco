/**
 * Server-only integration layer for the authorized content source.
 *
 * Nothing in this module may be imported by client code: it holds the
 * upstream host and the bearer token used to talk to it.
 */

const UPSTREAM_ORIGIN = "https://vidcloud.eu.org";
const TOKEN_ENDPOINT = `${UPSTREAM_ORIGIN}/generate_token.php`;
const API_PREFIX = `${UPSTREAM_ORIGIN}/api`;

/** Tokens are short lived; refresh well before they can expire. */
const TOKEN_TTL_MS = 5 * 60 * 1000;

let cachedToken: string | null = null;
let cachedTokenAt = 0;
let inflight: Promise<string | null> | null = null;

async function requestToken(): Promise<string | null> {
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36",
        Referer: `${UPSTREAM_ORIGIN}/`,
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { success?: boolean; access_token?: string };
    if (json?.success && json.access_token) return json.access_token;
    return null;
  } catch {
    return null;
  }
}

async function getToken(force = false): Promise<string | null> {
  const fresh = cachedToken && Date.now() - cachedTokenAt < TOKEN_TTL_MS;
  if (!force && fresh) return cachedToken;
  if (!inflight) {
    inflight = requestToken().then((token) => {
      if (token) {
        cachedToken = token;
        cachedTokenAt = Date.now();
      }
      inflight = null;
      return token;
    });
  }
  return inflight;
}

export type UpstreamResult = {
  status: number;
  body: string;
  contentType: string;
};

/**
 * Open mirrors of the content source, tried in order — no token required.
 * The first entry is the primary source; the rest are instant fallbacks.
 */
const MIRROR_PREFIXES = [
  "https://s4-cdn.samfygros.com/radha",
  "https://proxy.streamvideo.co.in/fetch/api.penpencil.co",
];

const BROWSER_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36",
};

function looksHealthy(status: number, body: string) {
  if (status < 200 || status >= 300) return false;
  try {
    const json = JSON.parse(body) as { success?: boolean };
    return json?.success !== false;
  } catch {
    return false;
  }
}

async function tryMirror(prefix: string, clean: string, search: string): Promise<UpstreamResult | null> {
  try {
    const res = await fetch(`${prefix}/${clean}${search ?? ""}`, {
      method: "GET",
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(12_000),
    });
    const body = await res.text();
    if (!looksHealthy(res.status, body)) return null;
    return {
      status: res.status,
      body,
      contentType: res.headers.get("content-type") ?? "application/json",
    };
  } catch {
    return null;
  }
}

/**
 * Forwards an arbitrary upstream API path (plus its query string) to the
 * content source. The open mirror is tried first; the token-based source is
 * used as an instant fallback. Any path either source supports works here.
 */
export async function upstreamApi(path: string, search: string): Promise<UpstreamResult> {
  const clean = path.replace(/^\/+/, "");
  const url = `${API_PREFIX}/${clean}${search ?? ""}`;

  for (const prefix of MIRROR_PREFIXES) {
    const mirror = await tryMirror(prefix, clean, search);
    if (mirror) return mirror;
  }

  const call = async (token: string | null) =>
    fetch(url, {
      method: "GET",
      headers: {
        ...BROWSER_HEADERS,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Referer: `${UPSTREAM_ORIGIN}/`,
      },
    });

  try {
    let res = await call(await getToken());
    if (res.status === 401 || res.status === 403) {
      res = await call(await getToken(true));
    }
    const body = await res.text();
    return {
      status: res.status,
      body,
      contentType: res.headers.get("content-type") ?? "application/json",
    };
  } catch {
    return {
      status: 502,
      body: JSON.stringify({ success: false, message: "Content source unreachable" }),
      contentType: "application/json",
    };
  }
}


/** Convenience wrapper returning parsed JSON for server-side callers. */
export async function upstreamJson<T>(path: string, search = ""): Promise<T | null> {
  const result = await upstreamApi(path, search);
  if (result.status < 200 || result.status >= 300) return null;
  try {
    return JSON.parse(result.body) as T;
  } catch {
    return null;
  }
}