import { texts } from "./constant/index.js";
import { keyboards } from "./keyboard/index.js";

export const startHandler = async (ctx) => {
  // const chatId = ctx.message.chat.id;
  const type = ctx.message.chat.type;

  // if(chatId !== process.env.ADMIN_ID) return ctx.reply(texts.admin.uz.not_admin)

  if (type !== "private") return;
  ctx.reply(texts.admin.uz.welcome, {
    reply_markup: keyboards.admin.uz.sendPriceKeyboard(),
    parse_mode: "Markdown"
  });
};