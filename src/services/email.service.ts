import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM || "Ludus <onboarding@lives.systems>";


function getHtmlTemplate(title: string, content: string) {
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #F4F6FF; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F4F6FF; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
              
              <!-- HEADER LUDUS -->
              <tr>
                <td style="background-color: #0A1F5C; padding: 32px 20px; text-align: center;">
                  <h1 style="color: #FBBC04; margin: 0; font-size: 32px; letter-spacing: 2px;">LUDUS</h1>
                  <p style="color: #D6DCFF; margin: 8px 0 0 0; font-size: 14px;">Acervo de Jogos de Tabuleiro</p>
                </td>
              </tr>

              <!-- CONTEÚDO DINÂMICO -->
              <tr>
                <td style="padding: 40px 32px; color: #333333; line-height: 1.6; font-size: 16px;">
                  ${content}
                </td>
              </tr>

              <!-- FOOTER -->
              <tr>
                <td style="background-color: #F9FAFB; padding: 24px 20px; text-align: center; border-top: 1px solid #E5E7EB;">
                  <p style="margin: 0; color: #6B7280; font-size: 12px; font-weight: bold;">
                    Instituto Federal do Maranhão - IFMA
                  </p>
                  <p style="margin: 4px 0 0 0; color: #9CA3AF; font-size: 12px;">
                    Campus Timon
                  </p>
                  <p style="margin: 16px 0 0 0; color: #D1D5DB; font-size: 11px;">
                    Este é um e-mail automático, por favor não responda.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}



export async function sendVerificationEmail(to: string, name: string, code: string) {
  const content = `
    <h2 style="color: #0A1F5C; margin-top: 0;">Olá, ${name}!</h2>
    <p>Seja bem-vindo(a) ao Ludus. Para concluir o seu cadastro e acessar a plataforma, precisamos confirmar seu e-mail.</p>
    <p>Use o código de verificação abaixo:</p>
    
    <div style="background-color: #F4F6FF; border: 2px dashed #31358B; border-radius: 12px; padding: 24px; text-align: center; margin: 32px 0;">
      <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0A1F5C;">${code}</span>
    </div>
    
    <p style="color: #6B7280; font-size: 14px;"><em>Este código é válido por 10 minutos. Se você não solicitou este cadastro, basta ignorar este e-mail.</em></p>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: "Código de Verificação - Ludus",
      html: getHtmlTemplate("Confirme seu E-mail", content),
    });
  } catch (err) {
    console.error("Falha ao enviar e-mail de verificação:", err);
  }
}

export async function sendPasswordResetEmail(to: string, code: string) {
  const content = `
    <h2 style="color: #0A1F5C; margin-top: 0;">Recuperação de Senha</h2>
    <p>Recebemos uma solicitação para redefinir a senha da sua conta no Ludus.</p>
    <p>Utilize o código de segurança abaixo no aplicativo para criar uma nova senha:</p>
    
    <div style="background-color: #Fef2f2; border: 2px dashed #E62325; border-radius: 12px; padding: 24px; text-align: center; margin: 32px 0;">
      <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #E62325;">${code}</span>
    </div>
    
    <p style="color: #6B7280; font-size: 14px;"><em>Este código expira em 10 minutos. Se você não pediu para alterar sua senha, sua conta continua segura. Ignore este e-mail.</em></p>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: "Redefinição de Senha - Ludus",
      html: getHtmlTemplate("Recuperação de Senha", content),
    });
  } catch (err) {
    console.error("Falha ao enviar e-mail de reset:", err);
  }
}

export async function sendRegistrationReminderEmail(to: string, name: string, code: string) {
  const content = `
    <h2 style="color: #0A1F5C; margin-top: 0;">Falta muito pouco, ${name}!</h2>
    <p>Vimos que você começou a criar uma conta na Ludus, mas não chegou a finalizar.</p>
    <p>O acervo da biblioteca do IFMA Campus Timon está te esperando! Volte no aplicativo e utilize o código abaixo para concluir seu cadastro:</p>
    
    <div style="background-color: #F4F6FF; border: 2px dashed #31358B; border-radius: 12px; padding: 24px; text-align: center; margin: 32px 0;">
      <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0A1F5C;">${code}</span>
    </div>
    
    <p style="color: #6B7280; font-size: 14px;"><em>Este código expira em 10 minutos. Te esperamos por lá!</em></p>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: "Conclua seu cadastro na Ludus! 🎲",
      html: getHtmlTemplate("Lembrete de Cadastro", content),
    });
  } catch (err) {
    console.error("Falha ao enviar e-mail de lembrete:", err);
  }
}