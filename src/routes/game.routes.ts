import { Router } from "express";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";
import { ensureUserOnly } from "../middlewares/ensureUserOnly";
import { verify } from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import {
  searchLudopedia,
  getLudopediaGameDetails,
} from "../services/ludopedia.service";
import { searchBGG, getBGGDetails } from "../services/bgg.services";
import { translateToPT } from "../services/translate.service";

const gameRoutes = Router();

function requireSingleParam(
  param: string | string[] | undefined,
  name: string
) {
  const value = Array.isArray(param) ? param[0] : param;

  if (!value || typeof value !== "string") {
    throw new Error(`Parâmetro inválido: ${name}`);
  }

  return value;
}

gameRoutes.get(
  "/search-ludopedia",
  ensureAuthenticated,
  ensureAdmin,
  async (req, res) => {
    const q = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;

    if (!q) {
      return res.status(400).json({ error: "O termo de busca é obrigatório" });
    }

    try {
      const results = await searchLudopedia(String(q));
      return res.json(results);
    } catch (err) {
      console.error("Erro ao buscar na Ludopedia:", err);
      return res
        .status(500)
        .json({ error: "Falha na comunicação com a Ludopedia" });
    }
  }
);

gameRoutes.get("/", async (req, res) => {
  const q = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
  const status = Array.isArray(req.query.status) ? req.query.status[0] : req.query.status;
  const players = Array.isArray(req.query.players) ? req.query.players[0] : req.query.players;
  const age = Array.isArray(req.query.age) ? req.query.age[0] : req.query.age;
  const priceMin = Array.isArray(req.query.priceMin) ? req.query.priceMin[0] : req.query.priceMin;
  const priceMax = Array.isArray(req.query.priceMax) ? req.query.priceMax[0] : req.query.priceMax;
  const timeMax = Array.isArray(req.query.timeMax) ? req.query.timeMax[0] : req.query.timeMax;
  
 
  const sortParam = Array.isArray(req.query.sort) ? req.query.sort[0] : req.query.sort;
  
  const tier = Array.isArray(req.query.tier) ? req.query.tier.join(",") : req.query.tier;
  const mechanics = Array.isArray(req.query.mechanics) ? req.query.mechanics.join(",") : req.query.mechanics;

  let isAdmin = false;
  const authHeader = req.headers.authorization;


  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length === 2) {
      const token = parts[1];
      try {
        const decoded = verify(token, process.env.JWT_SECRET as string) as any;
        
        if (decoded.sub) {
          const userCheck = await prisma.user.findUnique({
            where: { id: decoded.sub },
            select: { role: true }
          });
          if (userCheck?.role === "ADMIN") {
            isAdmin = true;
          }
        }
      } catch (e) {
       
      }
    }
  }

  const where: any = {};

  if (!isAdmin) {
    where.isVisible = true;
    where.isActive = true;
  }

  if (q && String(q).trim()) {
    const term = String(q).trim();
    where.OR = [
      { title: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
    ];
  }

  if (status && String(status) !== "ALL") {
    const st = String(status);
    if (st === "AVAILABLE") {
      const availableCondition = {
        OR: [
          { copies: { some: { available: true } } },
          {
            AND: [
              { available: true },
              { OR: [{ allowOriginalRental: true }, { copies: { none: {} } }] },
            ],
          },
        ],
      };
      if (where.OR) {
        where.AND = [...(where.AND ?? []), availableCondition];
      } else {
        Object.assign(where, availableCondition);
      }
    } else {
      const unavailableCondition = {
        AND: [
          { copies: { none: { available: true } } },
          { OR: [{ available: false }, { allowOriginalRental: false }] },
        ],
      };
      if (where.OR) {
        where.AND = [...(where.AND ?? []), unavailableCondition];
      } else {
        Object.assign(where, unavailableCondition);
      }
    }
  }

  if (priceMin || priceMax) {
    where.price = {
      gte: priceMin ? parseFloat(String(priceMin)) : 0,
      lte: priceMax ? parseFloat(String(priceMax)) : 1000,
    };
  }

  if (timeMax && String(timeMax) !== "null") {
    const time = Number(timeMax);
    
    
    if (!Number.isNaN(time) && time !== 999) {
      
      where.maxTime = time; 
    }
  }

  if (players && String(players) !== "null") {
    const p = Number(players);
    if (!Number.isNaN(p)) {
      where.maxPlayers = { gte: p };
      where.minPlayers = { lte: p };
    }
  }

  if (age && String(age) !== "null") {
    const a = Number(age);
    if (!Number.isNaN(a)) {
      where.minAge = { lte: a };
    }
  }

  if (tier && String(tier).trim()) {
    const tierList = String(tier)
      .split(",")
      .map((t) => 
        t
          .trim()
          .normalize("NFD") 
          .replace(/[\u0300-\u036f]/g, "") 
          .toUpperCase() 
      )
      .filter(Boolean); 

    if (tierList.length > 0) {
      where.tier = { in: tierList };
    }
  }

 if (mechanics && String(mechanics).trim()) {
    const mechanicsList = String(mechanics)
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean); 

    if (mechanicsList.length > 0) {
      where.mechanics = { hasSome: mechanicsList };
    }
  }


  let orderByCondition: any = { title: "asc" }; 

  if (sortParam === "Z-A") {
    orderByCondition = { title: "desc" };
  } else if (sortParam === "TOP_RATED") {
    
    orderByCondition = [{ rating: "desc" }, { ratingsCount: "desc" }, { title: "asc" }];
  }

  try {
    const games = await prisma.game.findMany({
      where,
      orderBy: orderByCondition, 
      include: {
        _count: { select: { copies: true } },
        copies: { select: { available: true } },
      },
    });

    const mapped = games.map((g) => {
      const copiesCount = g._count?.copies ?? 0;
      const availableCopiesCount = (g.copies ?? []).filter((c) => c.available).length;

      const isAvailableNow =
        availableCopiesCount > 0 ||
        (availableCopiesCount === 0 &&
          g.available === true &&
          (g.allowOriginalRental === true || copiesCount === 0));

      const { copies, _count, ...rest } = g as any;

      return {
        ...rest,
        copiesCount,
        availableCopiesCount,
        isAvailableNow,
      };
    });

    return res.json(mapped);
  } catch (err) {
    console.error("Erro na busca:", err);
    return res.status(500).json({ error: "Erro ao filtrar jogos" });
  }
});

gameRoutes.post("/", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const { ludopediaId, title, cover, price, description: bodyDescription } =
    req.body;

  try {
    const parsedLudopediaId = Number(ludopediaId);
    const cleanTitle = String(title || "").trim();
    const parsedPrice = Number(String(price).replace(",", "."));

    if (!parsedLudopediaId || Number.isNaN(parsedLudopediaId)) {
      return res.status(400).json({ error: "ludopediaId inválido." });
    }

    if (!cleanTitle) {
      return res.status(400).json({ error: "Título é obrigatório." });
    }

    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ error: "Preço inválido." });
    }

    const existingGame = await prisma.game.findFirst({
      where: {
        OR: [
          { ludopediaId: parsedLudopediaId },
          { title: { equals: cleanTitle, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        title: true,
        ludopediaId: true,
      },
    });

    if (existingGame) {
      return res.status(409).json({
        error: "Esse jogo já foi adicionado ao catálogo.",
        code: "GAME_ALREADY_EXISTS",
        existingGame,
      });
    }

    const details = await getLudopediaGameDetails(parsedLudopediaId);

    let finalDescription =
      bodyDescription?.toString()?.trim() || details?.description || "";

    let finalMinPlayers = details?.minPlayers || 1;
    let finalMaxPlayers = details?.maxPlayers ?? null;
    let finalMinAge = details?.minAge || 0;
    let finalMinTime = details?.minTime || 0;
    let finalMaxTime = details?.maxTime ?? null;

    try {
      const searchResult = await searchBGG(cleanTitle, {
        year: details?.yearPublished ?? null,
      });

      console.log("BGG search result:", searchResult);

      if (searchResult && searchResult.confidence >= 85) {
        const bggDetails = await getBGGDetails(searchResult.id);

        console.log("BGG details chosen:", {
          searchedTitle: cleanTitle,
          chosenId: searchResult.id,
          chosenPrimaryName: searchResult.primaryName,
          confidence: searchResult.confidence,
          chosenYear: bggDetails?.yearPublished,
        });

        if (bggDetails?.description?.trim()) {
          const translated = await translateToPT(bggDetails.description);

          if (translated?.trim()) {
            finalDescription = translated.trim();
          }
        }

        finalMinPlayers = details?.minPlayers ?? bggDetails?.minPlayers ?? 1;
        finalMaxPlayers = details?.maxPlayers ?? bggDetails?.maxPlayers ?? null;
        finalMinAge = details?.minAge ?? bggDetails?.minAge ?? 0;
        finalMinTime = details?.minTime ?? bggDetails?.minTime ?? 0;
        finalMaxTime = details?.maxTime ?? bggDetails?.maxTime ?? null;
      } else {
        console.log("BGG ignorado por baixa confiança:", {
          searchedTitle: cleanTitle,
          confidence: searchResult?.confidence ?? null,
        });
      }
    } catch (e) {
      console.log("Erro ao enriquecer dados com BGG/tradução:", e);
    }

    const game = await prisma.game.create({
      data: {
        ludopediaId: parsedLudopediaId,
        title: cleanTitle,
        cover,
        price: 0,
        available: true,
        isActive: true,
        isVisible: true,
        userId: req.user.id,
        description: finalDescription,
        rating: details?.rating || 0,
        minPlayers: finalMinPlayers,
        maxPlayers: finalMaxPlayers,
        minAge: finalMinAge,
        minTime: finalMinTime,
        maxTime: finalMaxTime,
        mechanics: details?.mechanics || [], 
      },
    });

    return res.status(201).json(game);
  } catch (err) {
    console.error("Erro no cadastro:", err);
    return res.status(400).json({ error: "Erro ao cadastrar jogo" });
  }
});

gameRoutes.get("/home", async (_req, res) => {
  try {
    const formatGame = (g: any) => {
      const copiesCount = g._count?.copies ?? 0;
      const availableCopiesCount = (g.copies ?? []).filter(
        (c: any) => c.available
      ).length;
      const isAvailableNow =
        availableCopiesCount > 0 ||
        (availableCopiesCount === 0 &&
          g.available === true &&
          (g.allowOriginalRental === true || copiesCount === 0));
      const { copies, _count, ...rest } = g;
      return { ...rest, copiesCount, availableCopiesCount, isAvailableNow };
    };

    const top = await prisma.rental.groupBy({
      by: ["gameId"],
      where: {
        gameId: { not: null },
      },
      _count: { gameId: true },
      orderBy: { _count: { gameId: "desc" } },
      take: 6,
    });
    
    const topIds = top.map((t) => t.gameId).filter(Boolean) as string[];
    
    const topGames = topIds.length
      ? await prisma.game.findMany({
          where: {
            id: { in: topIds },
            isActive: true,
            isVisible: true,
          },
          include: {
            _count: { select: { copies: true } },
            copies: { select: { available: true } },
          },
        })
      : [];
      
    const topById = new Map(topGames.map((g) => [g.id, g]));
    
    const mostRented = topIds
      .map((id) => topById.get(id))
      .filter(Boolean)
      .map(formatGame);

    const forYouRaw = await prisma.game.findMany({
      where: {
        isActive: true,
        isVisible: true,
      },
      orderBy: [{ rating: "desc" }, { ratingsCount: "desc" }, { title: "asc" }],
      take: 8, 
      include: {
        _count: { select: { copies: true } },
        copies: { select: { available: true } },
      },
    });
    
    const forYou = forYouRaw.map(formatGame);

    const defaultInclude = {
      _count: { select: { copies: true } },
      copies: { select: { available: true } },
    };

    const [
      iniciantesRaw, 
      doisJogadoresRaw, 
      partyRaw, 
      rapidosRaw,
      cooperativosRaw,
      familiaRaw,
      aclamadosRaw,
      cartasRaw,
      blefeRaw,
      dadosRaw
    ] = await Promise.all([
      prisma.game.findMany({ where: { isActive: true, isVisible: true, tier: { in: ["LATAO", "BRONZE"] } }, take: 8, orderBy: { rating: "desc" }, include: defaultInclude }),
      prisma.game.findMany({ where: { isActive: true, isVisible: true, minPlayers: { lte: 2 }, maxPlayers: { gte: 2 } }, take: 8, orderBy: { rating: "desc" }, include: defaultInclude }),
      prisma.game.findMany({ where: { isActive: true, isVisible: true, maxPlayers: { gte: 5 } }, take: 8, orderBy: { rating: "desc" }, include: defaultInclude }),
      prisma.game.findMany({ where: { isActive: true, isVisible: true, maxTime: { lte: 30 } }, take: 8, orderBy: { rating: "desc" }, include: defaultInclude }),
      prisma.game.findMany({ where: { isActive: true, isVisible: true, mechanics: { hasSome: ["Cooperativo"] } }, take: 8, orderBy: { rating: "desc" }, include: defaultInclude }),
      prisma.game.findMany({ where: { isActive: true, isVisible: true, minAge: { lte: 8, gt: 0 } }, take: 8, orderBy: { rating: "desc" }, include: defaultInclude }),
      prisma.game.findMany({ where: { isActive: true, isVisible: true, rating: { gte: 4 } }, take: 8, orderBy: { ratingsCount: "desc" }, include: defaultInclude }),
      prisma.game.findMany({ where: { isActive: true, isVisible: true, mechanics: { hasSome: ["Gestão de Mão", "Construção de Baralho", "Colecionar Componentes"] } }, take: 8, orderBy: { rating: "desc" }, include: defaultInclude }),
      prisma.game.findMany({ where: { isActive: true, isVisible: true, mechanics: { hasSome: ["Blefe", "Dedução", "Papéis Ocultos", "Identidade Oculta"] } }, take: 8, orderBy: { rating: "desc" }, include: defaultInclude }),
      prisma.game.findMany({ where: { isActive: true, isVisible: true, mechanics: { hasSome: ["Rolagem de Dados"] } }, take: 8, orderBy: { rating: "desc" }, include: defaultInclude }),
    ]);

    const rawCollections = [
      {
        id: "aclamados",
        title: "Aclamados pela Crítica",
        subtitle: "Os jogos com as maiores notas da galera",
        games: aclamadosRaw.map(formatGame),
      },
      {
        id: "iniciantes",
        title: "Por onde eu começo?",
        subtitle: "Novo no hobby? Então indicamos estes jogos",
        games: iniciantesRaw.map(formatGame),
      },
      {
        id: "party",
        title: "Em Ritmo de Festa",
        subtitle: "Para jogar com a galera (5+ jogadores)",
        games: partyRaw.map(formatGame),
      },
      {
        id: "cartas",
        title: "Cartas na Mesa",
        subtitle: "Para quem ama gerenciar a mão e combar",
        games: cartasRaw.map(formatGame),
      },
      {
        id: "blefe",
        title: "Confie Desconfiando",
        subtitle: "Jogos de blefe, dedução e muita trairagem",
        games: blefeRaw.map(formatGame),
      },
      {
        id: "dois-jogadores",
        title: "Para 2 jogadores",
        subtitle: "Os queridinhos exclusivos para jogar em dupla",
        games: doisJogadoresRaw.map(formatGame),
      },
      {
        id: "dados",
        title: "Sorte ou Estratégia?",
        subtitle: "Jogos movidos à tensão de rolar os dados",
        games: dadosRaw.map(formatGame),
      },
      {
        id: "cooperativos",
        title: "Juntos venceremos... ou não",
        subtitle: "Unam forças contra o tabuleiro",
        games: cooperativosRaw.map(formatGame),
      },
      {
        id: "familia",
        title: "Diversão em Família",
        subtitle: "Regras acessíveis para jogar com os pequenos",
        games: familiaRaw.map(formatGame),
      },
      {
        id: "rapidos",
        title: "Vapt-Vupt",
        subtitle: "Jogos rápidos para matar o tempo (Até 30 min)",
        games: rapidosRaw.map(formatGame),
      },
    ];

    const collections = rawCollections.filter((c) => c.games.length > 0);

    return res.json({ forYou, mostRented, collections });
  } catch (err) {
    console.error("Erro ao montar home:", err);
    return res.status(500).json({ error: "Erro ao carregar dados da home" });
  }
});

gameRoutes.get("/:id/components", ensureAuthenticated, async (req, res) => {
  try {
    const id = requireSingleParam(req.params.id, "id");

    const game = await prisma.game.findUnique({ where: { id } });
    if (!game) {
      return res.status(404).json({ error: "Jogo não encontrado" });
    }

    const components = await prisma.gameComponent.findMany({
      where: { gameId: id },
      orderBy: [{ name: "asc" }],
    });

    return res.json(components);
  } catch (err) {
    console.error("Erro ao listar componentes:", err);
    return res.status(400).json({ error: "Parâmetro inválido" });
  }
});

gameRoutes.post(
  "/:id/components",
  ensureAuthenticated,
  ensureAdmin,
  async (req, res) => {
    try {
      const id = requireSingleParam(req.params.id, "id");
      const name =
        req.body?.name !== undefined ? String(req.body.name).trim() : "";
      const quantity = Number(req.body?.quantity ?? 1);

      if (!name) {
        return res.status(400).json({ error: "Nome é obrigatório" });
      }

      if (!Number.isFinite(quantity) || quantity < 1) {
        return res.status(400).json({ error: "Quantidade inválida" });
      }

      const game = await prisma.game.findUnique({ where: { id } });
      if (!game) {
        return res.status(404).json({ error: "Jogo não encontrado" });
      }

      const created = await prisma.gameComponent.create({
        data: {
          gameId: id,
          name,
          quantity: Math.floor(quantity),
        },
      });

      return res.status(201).json(created);
    } catch (err: any) {
      if (err?.code === "P2002") {
        return res
          .status(409)
          .json({ error: "Esse componente já existe. Edite a quantidade." });
      }

      console.error(err);
      return res.status(500).json({ error: "Erro ao adicionar componente" });
    }
  }
);

gameRoutes.patch(
  "/:id/components/:componentId",
  ensureAuthenticated,
  ensureAdmin,
  async (req, res) => {
    try {
      const id = requireSingleParam(req.params.id, "id");
      const componentId = requireSingleParam(
        req.params.componentId,
        "componentId"
      );

      const name =
        req.body?.name !== undefined ? String(req.body.name).trim() : undefined;
      const quantity =
        req.body?.quantity !== undefined ? Number(req.body.quantity) : undefined;

      const comp = await prisma.gameComponent.findUnique({
        where: { id: componentId },
      });

      if (!comp || comp.gameId !== id) {
        return res.status(404).json({ error: "Componente não encontrado" });
      }

      const data: any = {};

      if (name !== undefined) {
        if (!name) {
          return res.status(400).json({ error: "Nome inválido" });
        }
        data.name = name;
      }

      if (quantity !== undefined) {
        if (!Number.isFinite(quantity) || quantity < 1) {
          return res.status(400).json({ error: "Quantidade inválida" });
        }
        data.quantity = Math.floor(quantity);
      }

      const updated = await prisma.gameComponent.update({
        where: { id: componentId },
        data,
      });

      return res.json(updated);
    } catch (err: any) {
      if (err?.code === "P2002") {
        return res
          .status(409)
          .json({ error: "Já existe um componente com esse nome." });
      }

      console.error(err);
      return res.status(500).json({ error: "Erro ao atualizar componente" });
    }
  }
);

gameRoutes.delete(
  "/:id/components/:componentId",
  ensureAuthenticated,
  ensureAdmin,
  async (req, res) => {
    try {
      const id = requireSingleParam(req.params.id, "id");
      const componentId = requireSingleParam(
        req.params.componentId,
        "componentId"
      );

      const comp = await prisma.gameComponent.findUnique({
        where: { id: componentId },
      });

      if (!comp || comp.gameId !== id) {
        return res.status(404).json({ error: "Componente não encontrado" });
      }

      await prisma.gameComponent.delete({
        where: { id: componentId },
      });

      return res.json({ ok: true });
    } catch (err) {
      console.error("Erro ao excluir componente:", err);
      return res.status(400).json({ error: "Parâmetro inválido" });
    }
  }
);

gameRoutes.patch("/:id", ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const id = requireSingleParam(req.params.id, "id");
    const {
      title,
      price,
      description,
      available,
      howToPlayUrl,
      isVisible,
      isActive,
    } = req.body;

    const data: any = {};

    if (typeof title === "string") data.title = title.trim();
    if (typeof description === "string") data.description = description;
    if (typeof available === "boolean") data.available = available;
    if (typeof isVisible === "boolean") data.isVisible = isVisible;
    if (typeof isActive === "boolean") data.isActive = isActive;

    if (typeof howToPlayUrl === "string") {
      const clean = howToPlayUrl.trim();
      data.howToPlayUrl = clean.length ? clean : null;
    } else if (howToPlayUrl === null) {
      data.howToPlayUrl = null;
    }

    if (price !== undefined) {
      const p = Number(String(price).replace(",", "."));
      if (Number.isNaN(p) || p < 0) {
        return res.status(400).json({ error: "Preço inválido" });
      }
      data.price = p;
    }

    const updated = await prisma.game.update({
      where: { id },
      data,
    });

    return res.json(updated);
  } catch (err: any) {
    console.error("Erro ao atualizar jogo:", err);

    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Jogo não encontrado" });
    }

    return res.status(500).json({ error: "Erro ao atualizar jogo" });
  }
});

gameRoutes.delete("/:id", ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const id = requireSingleParam(req.params.id, "id");

    const game = await prisma.game.findUnique({
      where: { id },
      include: {
        copies: {
          select: { id: true },
        },
      },
    });

    if (!game) {
      return res.status(404).json({ error: "Jogo não encontrado" });
    }

    const activeRentalsCount = await prisma.rental.count({
      where: {
        gameId: id,
        status: {
          in: ["PENDING", "ACTIVE"],
        },
      },
    });

    if (activeRentalsCount > 0) {
      return res.status(409).json({
        error:
          "Não é possível excluir este jogo porque ele possui aluguéis em andamento.",
        code: "GAME_HAS_ACTIVE_RENTALS",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.gameRating.deleteMany({
        where: { gameId: id },
      });

      await tx.gameComponent.deleteMany({
        where: { gameId: id },
      });

      await tx.favorite.deleteMany({
        where: { gameId: id },
      });

      await tx.gameAvailabilityWatch.deleteMany({
        where: { gameId: id },
      });

      await tx.game.delete({
        where: { id },
      });
    });

    return res.json({
      ok: true,
      message: "Jogo excluído com sucesso.",
    });
  } catch (err: any) {
    console.error("Erro ao excluir jogo:", err);

    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Jogo não encontrado" });
    }

    return res.status(500).json({ error: "Erro ao excluir jogo" });
  }
});

gameRoutes.get("/:id", ensureAuthenticated, async (req, res) => {
  try {
    const id = requireSingleParam(req.params.id, "id");

    const game = await prisma.game.findUnique({
      where: { id },
      include: {
        _count: { select: { copies: true } },
        copies: { select: { available: true } },
      },
    });

    if (!game) {
      return res.status(404).json({ error: "Jogo não encontrado" });
    }

    if (!game.isActive || !game.isVisible) {
      return res.status(404).json({ error: "Jogo não encontrado" });
    }

    const myRating = await prisma.gameRating.findUnique({
      where: {
        userId_gameId: {
          userId: req.user.id,
          gameId: id,
        },
      },
    });

    const myRental = await prisma.rental.findFirst({
      where: {
        userId: req.user.id,
        gameId: id,
        status: {
          in: ["PENDING", "ACTIVE"],
        },
      },
      select: { id: true },
    });

    const copiesCount = game._count?.copies ?? 0;
    const availableCopiesCount = (game.copies ?? []).filter(
      (c) => c.available
    ).length;

    const isAvailableNow =
      availableCopiesCount > 0 ||
      (availableCopiesCount === 0 &&
        game.available === true &&
        (game.allowOriginalRental === true || copiesCount === 0));

    const { copies, _count, ...rest } = game as any;

    return res.json({
      ...rest,
      copiesCount,
      availableCopiesCount,
      isAvailableNow,
      myRating: myRating?.value ?? null,
      rentedByMe: !!myRental,
    });
  } catch (err) {
    console.error("Erro ao buscar jogo", err);
    return res.status(500).json({ error: "Erro ao buscar detalhes do jogo" });
  }
});

gameRoutes.post(
  "/:id/rating",
  ensureAuthenticated,
  ensureUserOnly,
  async (req, res) => {
    try {
      const id = requireSingleParam(req.params.id, "id");
      const value = Number(req.body?.value);

      if (![1, 2, 3, 4, 5].includes(value)) {
        return res.status(400).json({ error: "value deve ser de 1 a 5" });
      }

      const game = await prisma.game.findUnique({ where: { id } });

      if (!game) {
        return res.status(404).json({ error: "Jogo não encontrado" });
      }

      const hasReturnedRental = await prisma.rental.findFirst({
        where: {
          userId: req.user.id,
          gameId: id,
          status: "RETURNED",
        },
      });

      if (!hasReturnedRental) {
        return res.status(403).json({
          error: "Você só pode avaliar jogos que já alugou e devolveu.",
          code: "CANNOT_RATE",
        });
      }

      await prisma.gameRating.upsert({
        where: {
          userId_gameId: { userId: req.user.id, gameId: id },
        },
        create: {
          userId: req.user.id,
          gameId: id,
          value,
        },
        update: {
          value,
        },
      });

      const avgAgg = await prisma.gameRating.aggregate({
        where: { gameId: id },
        _avg: { value: true },
      });

      const count = await prisma.gameRating.count({
        where: { gameId: id },
      });

      const avg = Number(avgAgg._avg?.value ?? 0);

      await prisma.game.update({
        where: { id },
        data: {
          rating: avg,
          ratingsCount: count,
        },
      });

      return res.json({
        ok: true,
        avgRating: avg,
        ratingsCount: count,
        myRating: value,
      });
    } catch (err) {
      console.error("Erro ao avaliar jogo:", err);
      return res.status(500).json({ error: "Erro ao avaliar jogo" });
    }
  }
);

gameRoutes.get("/:id/can-rate", ensureAuthenticated, async (req, res) => {
  try {
    const id = requireSingleParam(req.params.id, "id");

    const rental = await prisma.rental.findFirst({
      where: {
        userId: req.user.id,
        gameId: id,
        status: "RETURNED",
      },
      select: { id: true },
    });

    return res.json({ canRate: !!rental });
  } catch (err) {
    console.error("Erro ao verificar avaliação:", err);
    return res.status(500).json({ error: "Erro ao verificar avaliação" });
  }
});

gameRoutes.post("/:id/sync-description", ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const id = requireSingleParam(req.params.id, "id");
    
    const game = await prisma.game.findUnique({ where: { id } });
    if (!game) {
      return res.status(404).json({ error: "Jogo não encontrado" });
    }

    console.log(`[SYNC-DESC] Refazendo busca de tradução para: ${game.title}`);

    const searchResult = await searchBGG(game.title);
    if (searchResult) {
      const bggDetails = await getBGGDetails(searchResult.id);
      
      if (bggDetails?.description?.trim()) {
        const translated = await translateToPT(bggDetails.description);
        if (translated?.trim()) {
          return res.json({ description: translated.trim() });
        }
      }
    }

    if (game.ludopediaId) {
      const ludoDetails = await getLudopediaGameDetails(game.ludopediaId);
      if (ludoDetails?.description?.trim()) {
        return res.json({ description: ludoDetails.description.trim() });
      }
    }

    return res.json({ description: "" });
    
  } catch (error) {
    console.error("Erro ao sincronizar descrição:", error);
    return res.status(500).json({ error: "Erro interno ao buscar descrição na API externa." });
  }
});


gameRoutes.post("/:id/sync-mechanics", ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const id = requireSingleParam(req.params.id, "id");
    
    const game = await prisma.game.findUnique({ where: { id } });
    if (!game) {
      return res.status(404).json({ error: "Jogo não encontrado" });
    }

    if (!game.ludopediaId) {
      return res.status(400).json({ error: "Este jogo não possui ID da Ludopedia vinculado." });
    }

    console.log(`[SYNC-MEC] Buscando mecânicas para: ${game.title}`);

    const ludoDetails = await getLudopediaGameDetails(game.ludopediaId);
    
    if (ludoDetails?.mechanics && ludoDetails.mechanics.length > 0) {
      const updatedGame = await prisma.game.update({
        where: { id },
        data: { mechanics: ludoDetails.mechanics },
      });
      return res.json({ message: "Mecânicas sincronizadas!", mechanics: updatedGame.mechanics });
    }

    return res.status(404).json({ error: "Nenhuma mecânica encontrada para este jogo na Ludopedia." });
    
  } catch (error) {
    console.error("Erro ao sincronizar mecânicas:", error);
    return res.status(500).json({ error: "Erro interno ao buscar mecânicas na API externa." });
  }
});

export { gameRoutes };