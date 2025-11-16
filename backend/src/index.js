import express from "express";
import cors from "cors";
import httpRouter from "./routes/http.js";
import { config } from "./config/env.js";
import { logger, errorLogger } from "./utils/logger.js";
import { logRequests } from "./middleware/requestLogger.js";


const isCLI = process.argv.length > 2;

if (!isCLI) {
  const app = express();
  app.use(express.json());
  app.use(cors({ origin: "*" })); // 👈 FIX

  app.use("/", httpRouter);

  app.listen(config.PORT, () =>
    console.log(`[${config.APP_NAME}] API running on port ${config.PORT}...`)
  );

} else {
  const url = process.argv[2];
  const alias = process.argv[3] || null;
  import("./routes/cli.js").then(({ cliInput }) => cliInput(url, alias));
}

app.use(logRequests);

app.use((err, req, res, next) => {
  errorLogger.error({
    message: err.message,
    stack: err.stack,
    path: req.originalUrl
  });
  res.status(500).json({ error: "Internal server error" });
});
