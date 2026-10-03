/**
 * Torna privados os documentos já enviados (RG, selfie, comprovantes).
 *
 * Move cada arquivo de "upload" (público) para "authenticated" no Cloudinary
 * e atualiza a referência no banco. Arquivos já privados são ignorados.
 *
 *   node dist/scripts/privatize-documents.js           # simulação, não altera nada
 *   node dist/scripts/privatize-documents.js --apply   # executa
 */
import "dotenv/config";
import { cloudinary } from "../lib/cloudinary";
import { prisma } from "../lib/prisma";
import { DOCUMENT_FIELDS, parseCloudinaryUrl } from "../lib/documentStorage";

const apply = process.argv.includes("--apply");

async function main() {
  const users = await prisma.user.findMany({
    where: { OR: DOCUMENT_FIELDS.map((field) => ({ [field]: { not: null } })) },
    select: { id: true, documentFile: true, addressProof: true, selfieWithId: true, enrollmentProof: true },
  });

  let pending = 0;
  let moved = 0;
  let failed = 0;

  for (const user of users) {
    for (const field of DOCUMENT_FIELDS) {
      const url = user[field];
      const ref = parseCloudinaryUrl(url);
      if (!ref || ref.type !== "upload") continue;

      pending++;
      console.log(`${apply ? "Movendo" : "[simulação]"} ${field} do usuário ${user.id}: ${ref.publicId}`);
      if (!apply) continue;

      try {
        const result = await cloudinary.uploader.rename(ref.publicId, ref.publicId, {
          resource_type: ref.resourceType,
          type: "upload",
          to_type: "authenticated",
          invalidate: true,
        });
        await prisma.user.update({ where: { id: user.id }, data: { [field]: result.secure_url } });
        moved++;
      } catch (err: any) {
        failed++;
        console.error(`  falhou: ${err?.message || err?.error?.message || err}`);
      }
    }
  }

  console.log(
    apply
      ? `\nConcluído: ${moved} movidos, ${failed} falhas, de ${pending} documentos públicos.`
      : `\n${pending} documentos públicos encontrados. Rode com --apply para torná-los privados.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
