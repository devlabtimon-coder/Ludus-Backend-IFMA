import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { uploadAvatar } from "../middlewares/uploadAvatar";
import { cloudinary } from "../lib/cloudinary";
import { ClientCategory } from "@prisma/client";


const CATEGORY_ORDER: ClientCategory[] = [
  "STARTER",
  "FAMILY",
  "EXPERT",
  "ULTRAGAMER",
];

const RENTALS_PER_PROMOTION = 10;
function getNextCategory(current: ClientCategory) {
  const idx = CATEGORY_ORDER.indexOf(current);
  if (idx === -1 || idx === CATEGORY_ORDER.length - 1) return null;
  return CATEGORY_ORDER[idx + 1];
}


export const userProfileRoutes = Router();

function extractPublicIdFromCloudinaryUrl(url: string | null | undefined) {
  if (!url) return null;

  try {

    const marker = "/upload/";
    const idx = url.indexOf(marker);

    if (idx === -1) return null;

    let pathPart = url.slice(idx + marker.length);

    
    const parts = pathPart.split("/");
    const versionIndex = parts.findIndex((part) => /^v\d+$/.test(part));

    if (versionIndex >= 0) {
      pathPart = parts.slice(versionIndex + 1).join("/");
    }

  
    pathPart = pathPart.replace(/\.[^.]+$/, "");

    return pathPart;
  } catch {
    return null;
  }
}

userProfileRoutes.get("/me", ensureAuthenticated, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        emailVerified: true,
        phoneVerified: true,
        points: true,
        level: true,
        authProvider: true,
        avatar: true,
        picture: true,
        senhaHash: true,

        // 👇 NOVOS CAMPOS ADICIONADOS AQUI 👇
        registrationStatus: true,
        rejectReason: true,
        documentFrontImage: true,
        addressProof: true,
        // ===================================

        clientCategory: true,
        totalRentalsCount: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    const currentCount = user.totalRentalsCount ?? 0;

    const rawProgress = currentCount % RENTALS_PER_PROMOTION;

    const progress =
      currentCount === 0
        ? 0
        : rawProgress === 0
        ? RENTALS_PER_PROMOTION
        : rawProgress;

    const remaining =
      progress === RENTALS_PER_PROMOTION
        ? 0
        : RENTALS_PER_PROMOTION - progress;

    const nextCategory = getNextCategory(user.clientCategory);

    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      points: user.points,
      level: user.level,
      authProvider: user.authProvider,
      avatar: user.avatar,
      picture: user.picture,
      hasPassword: !!user.senhaHash,

      // 👇 NOVOS CAMPOS ADICIONADOS AQUI TAMBÉM 👇
      registrationStatus: user.registrationStatus,
      rejectReason: user.rejectReason,
      documentFrontImage: user.documentFrontImage,
      addressProof: user.addressProof,
      // =========================================

      clientCategory: user.clientCategory,
      totalRentalsCount: currentCount,

      categoryProgress: {
        current: progress,
        total: RENTALS_PER_PROMOTION,
        remaining,
        nextCategory,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar usuário:", error);
    return res.status(500).json({ error: "Erro ao buscar usuário." });
  }
});

userProfileRoutes.patch("/me", ensureAuthenticated, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const updateData: any = {};

    if (name) {
      const cleanName = String(name).trim();

      if (cleanName.length < 3) {
        return res.status(400).json({
          error: "Nome precisa ter pelo menos 3 caracteres.",
        });
      }

      updateData.name = cleanName;
    }

    if (phone !== undefined) {
      const cleanPhone = String(phone).replace(/\D/g, "");

      if (cleanPhone.length < 10) {
        return res.status(400).json({
          error: "Telefone inválido.",
        });
      }

      const phoneExists = await prisma.user.findFirst({
        where: {
          phone: cleanPhone,
          NOT: {
            id: req.user.id,
          },
        },
      });

      if (phoneExists) {
        return res.status(400).json({
          error: "Telefone já está sendo usado.",
        });
      }

      updateData.phone = cleanPhone;
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        emailVerified: true,
        phoneVerified: true,
        points: true,
        level: true,
        authProvider: true,
        avatar: true,
        picture: true,
      },
    });

    return res.json({
      message: "Dados atualizados com sucesso.",
      user,
    });
  } catch (error) {
    console.error("Erro ao atualizar perfil:", error);
    return res.status(500).json({
      error: "Erro ao atualizar perfil.",
    });
  }
});

userProfileRoutes.patch("/me/password", ensureAuthenticated, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: "A nova senha é obrigatória." });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({
        error: "A nova senha deve ter pelo menos 6 caracteres.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    if (user.senhaHash) {
      if (!currentPassword) {
        return res.status(400).json({ error: "A senha atual é obrigatória." });
      }

      const passwordOk = await bcrypt.compare(currentPassword, user.senhaHash);

      if (!passwordOk) {
        return res.status(400).json({ error: "Senha atual incorreta." });
      }
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: req.user.id },
      data: { senhaHash: newHash },
    });

    return res.json({
      ok: true,
      message: user.senhaHash
        ? "Senha alterada com sucesso."
        : "Senha criada com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao alterar senha:", error);
    return res.status(500).json({ error: "Erro ao alterar senha." });
  }
});

userProfileRoutes.post(
  "/me/avatar",
  ensureAuthenticated,
  uploadAvatar.single("avatar"),
  async (req, res) => {
    try {
      const file = req.file;  

      if (!file) {
        return res.status(400).json({ error: "Imagem não enviada." });
      }

      const currentUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { avatar: true },
      });

      const uploadResult = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "ludus/avatars",
            resource_type: "image",
            public_id: `avatar-${req.user.id}-${Date.now()}`,
            overwrite: true,
            transformation: [
              { width: 512, height: 512, crop: "fill", gravity: "face" },
              { quality: "auto", fetch_format: "auto" },
            ],
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );

        stream.end(file.buffer);
      });

      const updatedUser = await prisma.user.update({
        where: { id: req.user.id },
        data: {
          avatar: uploadResult.secure_url,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          emailVerified: true,
          phoneVerified: true,
          points: true,
          level: true,
          authProvider: true,
          avatar: true,
          picture: true,
        },
      });

      const oldPublicId = extractPublicIdFromCloudinaryUrl(currentUser?.avatar);

      if (oldPublicId) {
        try {
          await cloudinary.uploader.destroy(oldPublicId, {
            resource_type: "image",
          });
        } catch (err) {
          console.error("Erro ao remover avatar antigo do Cloudinary:", err);
        }
      }

      return res.json({
        message: "Avatar atualizado com sucesso.",
        user: updatedUser,
      });
    } catch (err: any) {
      console.error("Erro ao salvar avatar:", err);

      if (err?.message?.includes("Formato inválido")) {
        return res.status(400).json({ error: err.message });
      }

      if (err?.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          error: "A imagem deve ter no máximo 5MB.",
        });
      }

      return res.status(500).json({
        error: "Erro ao atualizar avatar.",
      });
    }
  }
);

userProfileRoutes.delete("/me/avatar", ensureAuthenticated, async (req, res) => {
  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { avatar: true },
    });

    await prisma.user.update({
      where: { id: req.user.id },
      data: { avatar: null },
    });

    const oldPublicId = extractPublicIdFromCloudinaryUrl(currentUser?.avatar);

    if (oldPublicId) {
      try {
        await cloudinary.uploader.destroy(oldPublicId, {
          resource_type: "image",
        });
      } catch (err) {
        console.error("Erro ao remover avatar do Cloudinary:", err);
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao remover avatar:", err);
    return res.status(500).json({
      error: "Erro ao remover avatar.",
    });
  }
});



userProfileRoutes.patch(
  "/me/documents",
  ensureAuthenticated,
  uploadAvatar.fields([
    { name: "documentFront", maxCount: 1 },
    { name: "documentBack", maxCount: 1 },
    { name: "addressProof", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      const docFrontFile = files?.documentFront?.[0];
      const docBackFile = files?.documentBack?.[0];
      const addressFile = files?.addressProof?.[0];

      if (!docFrontFile || !docBackFile || !addressFile) {
        return res.status(400).json({ 
          error: "Você precisa enviar a frente e o verso do documento, e o comprovante de residência." 
        });
      }

      // Função auxiliar para subir para o Cloudinary
      const uploadToCloudinary = (fileBuffer: Buffer, publicId: string) => {
        return new Promise<any>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: "ludus/documents",
              resource_type: "image",
              public_id: publicId,
              overwrite: true,
              transformation: [{ quality: "auto", fetch_format: "auto" }],
            },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          );
          stream.end(fileBuffer);
        });
      };

      // Faz o upload das três imagens em paralelo para ganhar velocidade
      const [frontUpload, backUpload, addressUpload] = await Promise.all([
        uploadToCloudinary(docFrontFile.buffer, `doc-front-${req.user.id}-${Date.now()}`),
        uploadToCloudinary(docBackFile.buffer, `doc-back-${req.user.id}-${Date.now()}`),
        uploadToCloudinary(addressFile.buffer, `address-${req.user.id}-${Date.now()}`),
      ]);

      // Salva as URLs seguras no banco de dados e joga o status para PENDING
      const updatedUser = await prisma.user.update({
        where: { id: req.user.id },
        data: {
          documentFrontImage: frontUpload.secure_url,
          documentBackImage: backUpload.secure_url,
          addressProof: addressUpload.secure_url,
          registrationStatus: "PENDING", 
          rejectReason: null, // Limpa o motivo de alguma rejeição anterior
        },
        select: {
          id: true,
          name: true,
          registrationStatus: true,
          rejectReason: true,
        },
      });

      return res.json({
        message: "Documentos enviados com sucesso!",
        user: updatedUser,
      });

    } catch (err: any) {
      console.error("Erro ao processar documentos:", err);
      if (err?.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "As imagens devem ter no máximo 5MB." });
      }
      return res.status(500).json({ error: "Erro interno ao enviar documentos." });
    }
  }
);