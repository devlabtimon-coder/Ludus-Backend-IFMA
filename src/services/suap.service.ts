
import axios from "axios";
import * as cheerio from "cheerio";

const SUAP_BASE = "https://suap.ifma.edu.br";
const LOGIN_URL = `${SUAP_BASE}/accounts/login/`;
const TIMEOUT_MS = 15_000; 

export type SuapVerifyResult =
  | { ok: true; matricula: string; nome?: string }
  | { ok: false; reason: "INVALID_CREDENTIALS" | "SUAP_UNAVAILABLE" | "TIMEOUT" };

export async function verifySuapCredentials(
  username: string,
  password: string
): Promise<SuapVerifyResult> {

  const cookieJar: Record<string, string> = {};


  function updateCookieJar(headers: any) {
    const setCookie = headers["set-cookie"];
    if (!setCookie) return;

    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    cookies.forEach((cookieStr) => {
      const parts = cookieStr.split(";");
      const [name, value] = parts[0].split("=");
      if (name && value) {
        cookieJar[name.trim()] = value.trim();
      }
    });
  }

  function getCookieString() {
    return Object.entries(cookieJar)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }


  let csrfToken: string;

  try {
    const getRes = await axios.get(LOGIN_URL, {
      timeout: TIMEOUT_MS,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    updateCookieJar(getRes.headers);

    const $ = cheerio.load(getRes.data);
    // Tenta extrair do input oculto e depois do cookie
    const tokenFromInput = $('input[name="csrfmiddlewaretoken"]').attr("value");
    csrfToken = tokenFromInput || cookieJar["csrftoken"] || "";

    if (!csrfToken) {
      throw new Error("Token não encontrado no HTML");
    }
  } catch (err: any) {
    console.error("[SUAP] Falha ao obter CSRF:", err.message);
    return { ok: false, reason: "SUAP_UNAVAILABLE" };
  }


  try {
    const params = new URLSearchParams();
    params.append("csrfmiddlewaretoken", csrfToken);
    params.append("username", username.trim());
    params.append("password", password);
    params.append("next", "/");

    const postRes = await axios.post(LOGIN_URL, params.toString(), {
      timeout: TIMEOUT_MS,
      maxRedirects: 0, 
      validateStatus: (status) => status >= 200 && status < 400,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": LOGIN_URL,
        "Cookie": getCookieString(),
      },
    });

    
    const location = postRes.headers["location"];
    if (postRes.status === 302 && location && (location === "/" || location.includes("/?next="))) {
      return {
        ok: true,
        matricula: username.trim(),
      };
    }

    return { ok: false, reason: "INVALID_CREDENTIALS" };
  } catch (err: any) {
    console.error("[SUAP] Erro na requisição POST:", err.message);
    return { ok: false, reason: "SUAP_UNAVAILABLE" };
  }
}