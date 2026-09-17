import { rateLimit } from "express-rate-limit";


export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 1000, 
  message: { error: "Muitas requisições deste IP, tente novamente mais tarde." },
  standardHeaders: true,
  legacyHeaders: false,
});


export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 10, 
  message: { error: "Muitas tentativas de login. Bloqueado por 15 minutos." }
});


export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, 
  max: 5, 
  message: { error: "Muitas tentativas de validação. Aguarde 10 minutos." }
});