import jwt from "jsonwebtoken";

export function buildUserResponse(user: any) {
  return {
    id: user.id,
    nome: user.name,
    name: user.name,
    email: user.email,
    phone: user.phone,
    cpf: user.cpf || null,
    address: user.address || null,
    role: user.role,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    points: user.points,
    level: user.level,
    authProvider: user.authProvider,
    avatar: user.avatar,
    picture: user.picture,
    registrationStatus: user.registrationStatus,
    rejectReason: user.rejectReason,
    documentFile: user.documentFile || null,
    addressProof: user.addressProof || null,
    matricula: user.matricula || null,
    isAcademicVerified: user.isAcademicVerified || false,
  };
}

export function signUserToken(userId: string, role: string) {
  return jwt.sign(
    { role },
    process.env.JWT_SECRET as string,
    {
      subject: userId,
      expiresIn: "7d",
    }
  );
}