import { prisma } from "../lib/prisma";

export async function logAdminAction(
  adminId: string,
  action: string,
  entityId?: string,
  details?: any
) {
  try {
    await prisma.adminLog.create({
      data: {
        adminId,
        action,
        entityId,
        details: details ? details : undefined,
      },
    });
  } catch (error) {
    console.error("Falha ao registrar log de auditoria:", error);
  }
}