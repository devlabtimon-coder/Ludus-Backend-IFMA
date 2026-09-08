import axios from "axios";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

export async function translateToPT(text: string) {
  if (!text?.trim()) return "";

  if (!GEMINI_API_KEY) {
    console.log("GEMINI_API_KEY não configurada");
    return text;
  }

  try {
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const response = await axios.post(
      url,
      {
        systemInstruction: {
          parts: [
            {
              text: "Atue como um tradutor especialista em localização de jogos de tabuleiro para o mercado brasileiro e traduza o texto a seguir para o português do Brasil (pt-BR), garantindo que nomes de jogos que possuem títulos oficiais no país sejam devidamente convertidos (como 'The Resistance' para 'A Resistência') ou mantidos conforme o uso das editoras locais (como 'Catan' ou 'Azul'), utilizando a terminologia técnica correta da comunidade nacional para mecânicas e componentes, preservando o sentido original e a fluidez do texto sem traduções literais robóticas, e devolvendo estritamente apenas o conteúdo traduzido, sem introduções, notas ou explicações adicionais."
            }
          ]
        },
        contents: [
          {
            role: "user",
            parts: [{ text }]
          }
        ],
        generationConfig: {
          temperature: 0.2
        }
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 60000,
      }
    );

    const translated =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    return translated || text;
  } catch (error: any) {
    console.log(
      "Erro na tradução com Gemini Nativo:",
      JSON.stringify(error?.response?.data || error?.message || error)
    );
    return text;
  }
}