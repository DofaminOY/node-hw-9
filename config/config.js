import "dotenv/config";

// Общие настройки для всех окружений
const common = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  dialect: process.env.DB_DIALECT || "mysql",
};

const config = {
  development: {
    ...common,
    database: process.env.DB_NAME_DEV,
  },

  test: {
    ...common,
    database: process.env.DB_NAME_TEST,
  },

  production: {
    ...common,
    database: process.env.DB_NAME_PROD,
  },
};

export default config;
