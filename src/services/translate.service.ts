import axios from "axios";

const GITHUB_MODELS_TOKEN = process.env.GITHUB_MODELS_TOKEN || "";
const GITHUB_MODELS_URL =
  process.env.GITHUB_MODELS_URL ||
  "https://models.github.ai/inference/chat/completions";
const GITHUB_MODELS_MODEL =
  process.env.GITHUB_MODELS_MODEL || "openai/gpt-4.1-mini";

export async function translateToPT(text: string) {
  if (!text?.trim()) return "";

  if (!GITHUB_MODELS_TOKEN) {
    console.log("GITHUB_MODELS_TOKEN não configurado");
    return text;
  }

  try {
    const response = await axios.post(
      GITHUB_MODELS_URL,
      {
        model: GITHUB_MODELS_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Atue como um tradutor especialista em localização de jogos de tabuleiro para o mercado brasileiro e traduza o texto a seguir para o português do Brasil (pt-BR), garantindo que nomes de jogos que possuem títulos oficiais no país sejam devidamente convertidos (como 'The Resistance' para 'A Resistência') ou mantidos conforme o uso das editoras locais (como 'Catan' ou 'Azul'), utilizando a terminologia técnica correta da comunidade nacional para mecânicas e componentes, preservando o sentido original e a fluidez do texto sem traduções literais robóticas, e devolvendo estritamente apenas o conteúdo traduzido, sem introduções, notas ou explicações adicionais.",
          },
          {
            role: "user",
            content: text,
          },
        ],
        temperature: 0.2,
      },
      {
        headers: {
          Authorization: `Bearer ${GITHUB_MODELS_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 60000,
      }
    );

    const translated =
      response.data?.choices?.[0]?.message?.content?.trim() || "";
https://developers.openai.com/api/docs
    return translated || text;
  } catch (error: any) {
    console.log(
      "Erro na tradução com GitHub Models:",
      error?.response?.data || error?.message || error
    );

    return text;
  }
}