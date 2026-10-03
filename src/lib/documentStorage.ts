import { cloudinary } from "./cloudinary";

// Documentos pessoais (RG, selfie, comprovantes) ficam no Cloudinary como
// "authenticated": não há link público. A API entrega apenas links assinados
// que expiram, gerados para quem tem permissão de ver o documento.

export const DOCUMENT_FIELDS = [
  "documentFile",
  "addressProof",
  "selfieWithId",
  "enrollmentProof",
] as const;

export const DOCUMENTS_FOLDER = "ludus/documents";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type CloudinaryAssetRef = {
  resourceType: "image" | "raw" | "video";
  type: "upload" | "authenticated" | "private";
  publicId: string;
  format?: string;
};

// https://res.cloudinary.com/<cloud>/<resource_type>/<type>/[s--assinatura--/][v123/]<public_id>.<ext>
export function parseCloudinaryUrl(url: string | null | undefined): CloudinaryAssetRef | null {
  if (!url) return null;

  const match = url.match(
    /res\.cloudinary\.com\/[^/]+\/(image|raw|video)\/(upload|authenticated|private)\/([^?#]+)/,
  );
  if (!match) return null;

  const resourceType = match[1] as CloudinaryAssetRef["resourceType"];
  const type = match[2] as CloudinaryAssetRef["type"];

  const parts = match[3].split("/").filter((part) => !/^s--[^/]+--$/.test(part));
  const versionIndex = parts.findIndex((part) => /^v\d+$/.test(part));
  let publicId = (versionIndex >= 0 ? parts.slice(versionIndex + 1) : parts).join("/");
  if (!publicId) return null;

  // Em arquivos raw a extensão faz parte do public_id.
  let format: string | undefined;
  if (resourceType !== "raw") {
    const dot = publicId.lastIndexOf(".");
    if (dot > publicId.lastIndexOf("/")) {
      format = publicId.slice(dot + 1);
      publicId = publicId.slice(0, dot);
    }
  }

  return { resourceType, type, publicId, format };
}

export function signedDocumentUrl(storedUrl: string | null | undefined): string | null {
  if (!storedUrl) return null;

  const ref = parseCloudinaryUrl(storedUrl);
  if (!ref) return null;

  return cloudinary.utils.private_download_url(ref.publicId, ref.format ?? "", {
    resource_type: ref.resourceType,
    type: ref.type,
    attachment: false,
    expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS,
  });
}

// Troca os links armazenados dos documentos por links assinados temporários.
export function withSignedDocuments<T extends Record<string, any>>(record: T): T {
  const result: Record<string, any> = { ...record };
  for (const field of DOCUMENT_FIELDS) {
    if (field in result) result[field] = signedDocumentUrl(result[field]);
  }
  return result as T;
}

export function uploadDocument(fileBuffer: Buffer, publicId: string): Promise<{ secure_url: string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: DOCUMENTS_FOLDER,
        type: "authenticated",
        resource_type: "auto",
        public_id: publicId,
        overwrite: true,
        transformation: [{ quality: "auto", fetch_format: "auto" }],
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error("Upload sem resposta."));
        resolve(result);
      },
    );
    stream.end(fileBuffer);
  });
}

export async function deleteDocument(storedUrl: string | null | undefined): Promise<void> {
  const ref = parseCloudinaryUrl(storedUrl);
  if (!ref) return;

  // Em raw a extensão integra o public_id; nos demais o destroy usa o id sem extensão.
  await cloudinary.uploader.destroy(ref.publicId, {
    resource_type: ref.resourceType,
    type: ref.type,
    invalidate: true,
  });
}
