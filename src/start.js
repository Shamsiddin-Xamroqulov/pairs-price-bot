import { texts } from "./constant/index.js";
import { keyboards } from "./keyboard/index.js";
import { config } from "dotenv";
config();

export const startHandler = async (ctx) => {
  const chatId = ctx.message.chat.id;
  const type = ctx.message.chat.type;

  if (type !== "private") return;

  if (chatId !== Number(process.env.DEV_ID) && chatId !== Number(process.env.ADMIN_ID)) return ctx.reply(texts.admin.uz.not_admin);

  ctx.reply(texts.admin.uz.welcome, {
    reply_markup: keyboards.admin.uz.sendPriceKeyboard(),
    parse_mode: "Markdown",
  });
};
