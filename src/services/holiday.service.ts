// src/services/holiday.service.ts

// Cache em memória para não fazer requisições à API toda vez que alguém abrir o calendário
let cachedHolidays: string[] = [];
let lastFetchYear: number | null = null;

// Adicionamos os feriados que a Brasil API não cobre
const getLocalAndAcademicHolidays = (year: number): string[] => {
  return [
    `${year}-07-28`, // Adesão do Maranhão à Independência (Estadual)
    `${year}-12-22`, // Aniversário de Timon (Municipal)
    // Se no futuro você quiser bloquear uma "Semana de Saco Cheio" do IFMA, basta adicionar aqui:
    // `${year}-10-14`,
    // `${year}-10-15`,
  ];
};

export async function getHolidaysByYear(year: number): Promise<string[]> {
  // Retorna do cache se já buscamos os feriados deste ano
  if (lastFetchYear === year && cachedHolidays.length > 0) {
    return cachedHolidays;
  }

  try {
    const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
    
    if (!response.ok) {
      throw new Error("Falha ao buscar Brasil API");
    }

    const data = await response.json();
    
    // A Brasil API retorna um array de objetos. Extraímos apenas as datas (YYYY-MM-DD)
    const nationalHolidays = data.map((holiday: { date: string; name: string }) => holiday.date);
    
    const localHolidays = getLocalAndAcademicHolidays(year);

    // Junta tudo, remove possíveis duplicatas e salva no cache
    cachedHolidays = Array.from(new Set([...nationalHolidays, ...localHolidays]));
    lastFetchYear = year;

    return cachedHolidays;
  } catch (error) {
    console.error("Erro ao buscar feriados na Brasil API:", error);
    // Se a API cair por algum motivo, o sistema não quebra, apenas retorna os locais
    return getLocalAndAcademicHolidays(year); 
  }
}