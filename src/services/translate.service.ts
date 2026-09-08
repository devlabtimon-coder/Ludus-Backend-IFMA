import axios from "axios";

export async function translateToPT(text: string) {
  if (!text?.trim()) return "";

  try {
    
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=pt&dt=t&q=${encodeURIComponent(text)}`;

    const response = await axios.get(url, { 
      timeout: 15000 
    });

    const data = response.data;
    if (data && data[0]) {
      const translated = data[0].map((item: any) => item[0]).join("");
      return translated || text;
    }

    return text;
  } catch (error: any) {
    console.log("Erro na tradução com Google Translate:", error?.message || error);
    return text; 
  }
}