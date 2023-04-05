import winston from "winston";

type Logger = winston.Logger;
export default Logger;

export function createLogger(): Logger {
  return winston.createLogger({
    level: "debug",
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf((info) => {
        const level = info.level;
        const message = info.message;

        let data = info as any;
        delete data.level;
        delete data.message;
        const attributes = Object.entries(data)
          .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
          .join(" ");

        return `${level}:\t${message} ${attributes}`;
      })
    ),
    transports: [new winston.transports.Console()],
  });
}
