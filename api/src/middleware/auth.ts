import type { NextFunction, Request, Response } from "express";

// Substitui o Supabase Auth. Verificação real de sessão/JWT do WorkOS
// entra aqui (etapa 3 do documento) — por ora, contrato de interface travado:
// toda rota autenticada recebe req.auth com empresaClienteId resolvido.
export interface AuthContext {
  userId: string;
  empresaClienteId: string;
  role: "admin_central" | "admin_cliente" | "usuario_cliente" | "admin_parceiro";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // TODO(etapa 3): validar sessão WorkOS e popular req.auth a partir do
  // token verificado. Nunca confiar em header enviado pelo cliente sem
  // verificação de assinatura.
  const auth = (req as Request & { auth?: AuthContext }).auth;
  if (!auth) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  next();
}
