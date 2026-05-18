/**
 * suap.service.ts
 *
 * Faz login temporário no SUAP via scraping HTTP para validar
 * que o aluno é real. A senha do SUAP NUNCA é armazenada.
 *
 * Fluxo:
 *  1. GET /accounts/login/  → captura csrfmiddlewaretoken + cookie csrftoken
 *  2. POST /accounts/login/ → envia credenciais + csrf
 *  3. Verifica redirecionamento → se for pra "/" o login funcionou
 *  4. Sessão é imediatamente descartada
 */

import axios from "axios";
import * as cheerio from "cheerio";

const SUAP_BASE = "https://suap.ifma.edu.br";
const LOGIN_URL = `${SUAP_BASE}/accounts/login/`;

// Timeout generoso pois o SUAP pode ser lento
const TIMEOUT_MS = 12_000;

export type SuapVerifyResult =
  | { ok: true; matricula: string; nome?: string }
  | { ok: false; reason: "INVALID_CREDENTIALS" | "SUAP_UNAVAILABLE" | "TIMEOUT" };

/**
 * Verifica se as credenciais do SUAP são válidas.
 * Retorna ok=true se o login foi bem-sucedido.
 */
export async function verifySuapCredentials(
  username: string,
  password: string
): Promise<SuapVerifyResult> {
  // Cria uma instância isolada do axios com jar de cookies manual
  const cookieJar: Record<string, string> = {};

  function parseCookies(setCookieHeader: string[] | undefined) {
    if (!setCookieHeader) return;
    for (const cookie of setCookieHeader) {
      const [pair] = cookie.split(";");
      const [key, value] = pair.trim().split("=");
      if (key && value) cookieJar[key.trim()] = value.trim();
    }
  }

  function cookieString() {
    return Object.entries(cookieJar)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  //Passo 1: GET na página de login para pegar CSRF 
  let csrfToken: string;

  try {
    const getRes = await axios.get(LOGIN_URL, {
      timeout: TIMEOUT_MS,
      maxRedirects: 5,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; LudusIFMA/1.0; Academic Verification)",
        Accept: "text/html,application/xhtml+xml",
      },
      validateStatus: (s) => s < 500,
    });

    // Captura cookies do GET
    parseCookies(
      Array.isArray(getRes.headers["set-cookie"])
        ? getRes.headers["set-cookie"]
        : getRes.headers["set-cookie"]
        ? [getRes.headers["set-cookie"] as string]
        : []
    );

    // Extrai csrfmiddlewaretoken do HTML
    const $ = cheerio.load(getRes.data as string);
    const tokenFromInput = $('input[name="csrfmiddlewaretoken"]').val();
    const tokenFromCookie = cookieJar["csrftoken"];

    csrfToken = String(tokenFromInput || tokenFromCookie || "");

    if (!csrfToken) {
      console.error("[SUAP] Não foi possível extrair o CSRF token.");
      return { ok: false, reason: "SUAP_UNAVAILABLE" };
    }
  } catch (err: any) {
    console.error("[SUAP] Erro no GET de login:", err?.message);
    if (err?.code === "ECONNABORTED" || err?.message?.includes("timeout")) {
      return { ok: false, reason: "TIMEOUT" };
    }
    return { ok: false, reason: "SUAP_UNAVAILABLE" };
  }

  //  Passo 2: POST com as credenciais 
  try {
    const params = new URLSearchParams();
    params.append("username", username.trim());
    params.append("password", password);
    params.append("csrfmiddlewaretoken", csrfToken);
    params.append("next", "/");

    const postRes = await axios.post(LOGIN_URL, params.toString(), {
      timeout: TIMEOUT_MS,
      maxRedirects: 0,           // NÃO seguir redirect é o que nos diz se deu certo
      validateStatus: (s) => s < 500,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; LudusIFMA/1.0; Academic Verification)",
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: LOGIN_URL,
        Cookie: cookieString(),
      },
    });

    // Passo 3: Analisar a resposta 
    //
    // Django redireciona (302) para "/" em caso de sucesso.
    // Se ficar em /accounts/login/ ou retornar 200 com form, é credencial errada.

    const redirectedTo = postRes.headers["location"] || "";
    const isSuccess =
      postRes.status === 302 &&
      redirectedTo !== "" &&
      !redirectedTo.includes("/accounts/login");

    if (!isSuccess) {
      return { ok: false, reason: "INVALID_CREDENTIALS" };
    }

    // ── Passo 4: Sessão destruída — não armazenamos nada 
    // O username no SUAP é a própria matrícula do aluno
    return {
      ok: true,
      matricula: username.trim(),
    };
  } catch (err: any) {
    console.error("[SUAP] Erro no POST de login:", err?.message);
    if (err?.code === "ECONNABORTED" || err?.message?.includes("timeout")) {
      return { ok: false, reason: "TIMEOUT" };
    }
    return { ok: false, reason: "SUAP_UNAVAILABLE" };
  }
}