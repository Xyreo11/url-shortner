import winston from "winston";
import "winston-daily-rotate-file";

const logDir = "logs";

const dailyRotate = (filename) =>
  new winston.transports.DailyRotateFile({
    dirname: logDir,
    filename: filename + "-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    zippedArchive: true,
    maxFiles: "14d"
  });

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    dailyRotate("app"),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

export const errorLogger = winston.createLogger({
  level: "error",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    dailyRotate("error"),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

export const requestLogger = winston.createLogger({
  level: "http",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [dailyRotate("request")]
});
