import { Telegraf } from "telegraf";
import { config } from "dotenv";
import { startHandler } from "./start.js";
import { messageHandler } from "./message.js";
config();

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => startHandler(ctx));
bot.on("message", async (ctx) => messageHandler(bot, ctx));
bot.launch();
