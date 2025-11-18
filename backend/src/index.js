// src/index.js

import express from "express";
import cors from "cors";

import httpRouter from "./routes/http.js";
import qrRouter from "./routes/qr.js";
import analyticsRouter from "./routes/analytics.js";
import authRouter from "./routes/auth.js";
import userRouter from "./routes/user.js";

import { config } from "./config/env.js";
import { logRequests } from "./middleware/requestLogger.js";

const isCLI = process.argv.length > 2;

if (!isCLI) {
  const app = express();

  app.set("trust proxy", true);

  // Global middleware
  app.use(express.json({ limit: "5mb" }));
  app.use(cors({ origin: "*" }));
  app.use(logRequests);

  // API routes FIRST
  app.use("/api/auth", authRouter);
  app.use("/api/user", userRouter);
  app.use("/analytics", analyticsRouter);
  app.use("/qr", qrRouter);

  app.use("/", httpRouter);

  app.listen(config.PORT, () => {
    console.log(`[${config.APP_NAME}] API running on port ${config.PORT}...`);
  });

} else {
  const url = process.argv[2];
  const alias = process.argv[3] || null;
  import("./routes/cli.js").then(({ cliInput }) => cliInput(url, alias));
}
