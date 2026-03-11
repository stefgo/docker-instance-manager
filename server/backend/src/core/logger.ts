import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

// Determine if we should use pretty printing
// Priority:
// 1. LOG_FORMAT env var (if set to 'json', forces json. if set to 'pretty', forces pretty)
// 2. NODE_ENV (dev -> pretty, prod -> json)
const logFormat = process.env.LOG_FORMAT?.toLowerCase();
const usePrettyParam = logFormat === "pretty" || logFormat === "one-line";
const forceJson = logFormat === "json";

const usePretty = (isDev && !forceJson) || usePrettyParam;

export const loggerOptions = {
    level: process.env.LOG_LEVEL || "info",
    transport: usePretty
        ? {
              target: "pino-pretty",
              options: {
                  translateTime: "HH:MM:ss",
                  ignore: "pid,hostname",
                  singleLine: true,
              },
          }
        : undefined,
};

export const logger = pino(loggerOptions);
