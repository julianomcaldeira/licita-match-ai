import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { calcularDinheiroNaMesa } from "../services/dinheiroNaMesaService";

// Regra do documento (B.2): rota NUNCA consulta banco — só valida entrada
// e delega ao serviço, repassando empresaClienteId do contexto autenticado.
export const dinheiroNaMesaRouter = Router();

dinheiroNaMesaRouter.get("/dinheiro-na-mesa", requireAuth, async (req, res, next) => {
  try {
    const meses = req.query.meses ? Number(req.query.meses) : 12;
    const resultado = await calcularDinheiroNaMesa(req.auth!.empresaClienteId, meses);
    res.json({
      totalCentavos: resultado.totalCentavos.toString(),
      quantidade: resultado.quantidade,
      itens: resultado.itens,
    });
  } catch (err) {
    next(err);
  }
});
