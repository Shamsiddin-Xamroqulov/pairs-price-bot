import { texts } from "./constant/index.js";
import { startScheduler, stopScheduler } from "./helper/crypto.helper.js";

let isPriceRunning = false;

export const messageHandler = async (bot, ctx) => {
  const text = ctx.message.text;

  if (text === texts.keyboard.uz.sendPrice) {
    try {
      if (isPriceRunning) {
        return ctx.reply(texts.admin.uz.bot_already_started);
      }
      const me = await bot.telegram.getMe();
      const channel = await bot.telegram.getChatMember(
        process.env.CHANNEL_USERNAME,
        me.id,
      );
      if (channel.status !== "administrator") {
        return ctx.reply(texts.admin.uz.not_administrator);
      }
      const crypto = await startScheduler(bot);
      ctx.reply(texts.admin.uz.price_started);
    } catch (err) {
      console.log(`Error starting the bot:`, err.message);
      throw err;
    }
  }

  if (text === texts.keyboard.uz.stopSendingPrice) {
    try {
      const stopped = stopScheduler();
      if (!stopped) {
        return ctx.reply(texts.admin.uz.sending_price_already_stoped);
      }
      ctx.reply(texts.admin.uz.sending_price_stoped);
    } catch (err) {
      console.log(`Error while stopping:`, err.message);
      throw err;
    }
  }
};
