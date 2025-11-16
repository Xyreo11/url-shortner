import { requestLogger } from "../utils/logger.js";

export function logRequests(req, res, next) {
  requestLogger.http({
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.headers["user-agent"]
  });
  next();
}
