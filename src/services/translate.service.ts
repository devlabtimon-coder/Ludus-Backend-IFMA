import axios from "axios";


const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

export async function translateToPT(text: string) {
  if (!text?.trim()) return "";

  if (!GEMINI_API_KEY) {
    console.log("GEMINI_API_KEY não configurada");
    return text;
  }

  try {
    const response = await axios.post(
      GEMINI_URL,
      {
        model: GEMINI_MODEL,
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
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 60000,
      }
    );

    const translated =
      response.data?.choices?.[0]?.message?.content?.trim() || "";

    return translated || text;
  } catch (error: any) {
    console.log(
      "Erro na tradução com Gemini:",
      error?.response?.data || error?.message || error
    );
    return text;
  }
}