import "dotenv/config";
import express from "express";
import cors from "cors";
import { dinheiroNaMesaRouter } from "./routes/dinheiroNaMesa";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/v1", dinheiroNaMesaRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno" });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`iPesquisei API ouvindo na porta ${port}`);
});
