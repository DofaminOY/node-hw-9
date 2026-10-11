import { Sequelize } from "sequelize";
import configData from "./config.js";
import "dotenv/config";

// Определяем текущее окружение
const env = process.env.NODE_ENV || "development";

// Получаем настройки текущего окружения
const config = configData[env];

// Создаём подключение к базе данных
const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: false,
  },
);

export default sequelize;
