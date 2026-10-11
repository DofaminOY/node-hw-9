
import express from "express";
import "dotenv/config";
import bcrypt from "bcrypt";
import session from "express-session";
import sequelize from "./config/db.js";
import { User } from "./models/index.js";

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Настраиваем сессии для авторизации
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    },
  })
);

// Middleware: проверяем авторизацию пользователя
async function requireAuth(req, res, next) {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        message: "Сначала войдите в аккаунт",
      });
    }

    const user = await User.findByPk(req.session.userId);

    if (!user) {
      return res.status(401).json({
        message: "Пользователь не найден",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

// Middleware: проверяем необходимость смены пароля
function checkMustChangePassword(req, res, next) {
  if (req.user.mustChangePassword) {
    return res.redirect(303, "/change-password");
  }

  next();
}

// Middleware: проверяем роль администратора
function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Доступ запрещён. Только для администратора",
    });
  }

  next();
}

// Главная страница
app.get("/", (_req, res) => {
  res.send("Home Page");
});

// Страница входа
app.get("/login", (_req, res) => {
  res.send(`
    <h2>Вход в аккаунт</h2>

    <form method="POST" action="/login">
      <input type="email" name="email" placeholder="Email" required>

      <input type="password" name="password" placeholder="Пароль" required>

      <button type="submit">Войти</button>
    </form>
  `);
});

// Задача 1: Регистрация пользователя
app.post("/register", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    // Проверяем данные пользователя
    if (
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== "string" ||
      password.length < 8
    ) {
      return res.status(400).json({
        message: "Укажите корректный email и пароль от 8 символов",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Проверяем, существует ли пользователь с таким email
    const existingUser = await User.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Этот email уже зарегистрирован",
      });
    }

    // Хэшируем пароль
    const hashedPassword = await bcrypt.hash(password, 12);

    // Создаём нового пользователя
    const newUser = await User.create({
      email: normalizedEmail,
      password: hashedPassword,
      mustChangePassword: false,
      role: "user",
    });

    res.status(201).json({
      message: "Пользователь успешно зарегистрирован",
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Вход пользователя
app.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({
        message: "Введите email и пароль",
      });
    }

    // Находим пользователя по email
    const user = await User.findOne({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user) {
      return res.status(401).json({
        message: "Неверный email или пароль",
      });
    }

    // Проверяем пароль
    const isPasswordCorrect = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordCorrect) {
      return res.status(401).json({
        message: "Неверный email или пароль",
      });
    }

    // Создаём новую сессию после входа
    req.session.regenerate((error) => {
      if (error) {
        return next(error);
      }

      req.session.userId = user.id;
      req.user = user;

      // Проверяем необходимость смены пароля
      checkMustChangePassword(req, res, () => {
        if (req.is("application/x-www-form-urlencoded")) {
          return res.redirect(303, "/");
        }

        res.json({
          message: "Вход выполнен успешно",
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
          },
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

// Задача 2: Страница смены пароля
app.get("/change-password", requireAuth, (_req, res) => {
  res.send(`
    <h2>Смена пароля</h2>

    <form method="POST" action="/change-password">
      <input
        type="password"
        name="newPassword"
        placeholder="Новый пароль"
        minlength="8"
        required
      >

      <button type="submit">Изменить пароль</button>
    </form>
  `);
});

// Задача 2: Изменение пароля
app.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const { newPassword } = req.body || {};

    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({
        message: "Новый пароль должен содержать минимум 8 символов",
      });
    }

    // Хэшируем новый пароль
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Обновляем пароль и снимаем требование его смены
    await req.user.update({
      password: hashedPassword,
      mustChangePassword: false,
    });

    if (req.is("application/x-www-form-urlencoded")) {
      return res.redirect(303, "/");
    }

    res.json({
      message: "Пароль успешно изменён",
    });
  } catch (error) {
    next(error);
  }
});

// Задача 3: Удаление аккаунта
app.post(
  "/delete-account",
  requireAuth,
  checkMustChangePassword,
  async (req, res, next) => {
    try {
      const { password } = req.body || {};

      if (typeof password !== "string") {
        return res.status(400).json({
          message: "Введите текущий пароль",
        });
      }

      // Подтверждаем текущий пароль
      const isPasswordCorrect = await bcrypt.compare(
        password,
        req.user.password
      );

      if (!isPasswordCorrect) {
        return res.status(401).json({
          message: "Неверный пароль",
        });
      }

      // Удаляем пользователя из базы данных
      await req.user.destroy();

      // Завершаем его сессию
      req.session.destroy((error) => {
        if (error) {
          return next(error);
        }

        res.json({
          message: "Аккаунт успешно удалён",
        });
      });
    } catch (error) {
      next(error);
    }
  }
);

// Задача 4: Маршрут администратора
app.get(
  "/admin",
  requireAuth,
  checkMustChangePassword,
  requireAdmin,
  (req, res) => {
    res.json({
      message: "Добро пожаловать в панель администратора",
      email: req.user.email,
      role: req.user.role,
    });
  }
);

// Задача 5: Изменение email
app.post(
  "/change-email",
  requireAuth,
  checkMustChangePassword,
  async (req, res, next) => {
    try {
      const { newEmail, currentPassword } = req.body || {};

      if (
        typeof newEmail !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim()) ||
        typeof currentPassword !== "string"
      ) {
        return res.status(400).json({
          message: "Укажите корректный email и текущий пароль",
        });
      }

      // Проверяем текущий пароль
      const isPasswordCorrect = await bcrypt.compare(
        currentPassword,
        req.user.password
      );

      if (!isPasswordCorrect) {
        return res.status(401).json({
          message: "Неверный пароль",
        });
      }

      const normalizedEmail = newEmail.trim().toLowerCase();

      // Проверяем уникальность нового email
      const existingUser = await User.findOne({
        where: { email: normalizedEmail },
      });

      if (existingUser && existingUser.id !== req.user.id) {
        return res.status(409).json({
          message: "Этот email уже зарегистрирован",
        });
      }

      // Обновляем email пользователя
      await req.user.update({
        email: normalizedEmail,
      });

      res.json({
        message: "Email успешно изменён",
        email: req.user.email,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Обработка ошибок
app.use((error, _req, res, _next) => {
  // Проверяем ошибку уникальности в базе данных
  if (error.name === "SequelizeUniqueConstraintError") {
    return res.status(409).json({
      message: "Этот email уже зарегистрирован",
    });
  }

  console.error("Ошибка:", error.message);

  res.status(500).json({
    message: "Внутренняя ошибка сервера",
  });
});

// Запускаем сервер после проверки подключения
async function startServer() {
  try {
    await sequelize.authenticate();

    console.log(
      "Connection to the database has been established successfully."
    );

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error(
      "Unable to connect to the database:",
      error.message
    );
  }
}

startServer();
