import axios from "axios";
import cron from "node-cron";
import fs from "fs/promises";
import path from "path";
import { texts } from "../constant/index.js";

const CRYPTO_FILE = path.join(process.cwd(), "db", "crypto.json");

export const saveCryptoToFile = async (data) => {
  await fs.mkdir(path.join(process.cwd(), "db"), { recursive: true });

  let existing = [];
  try {
    const file = await fs.readFile(CRYPTO_FILE, "utf-8");
    existing = JSON.parse(file);
  } catch {
    existing = [];
  }

  existing.push({
    ...data,
    savedAt: new Date().toISOString(),
  });

  await fs.writeFile(CRYPTO_FILE, JSON.stringify(existing, null, 2), "utf-8");
};

export const clearCryptoFile = async () => {
  await fs.mkdir(path.join(process.cwd(), "db"), { recursive: true });
  await fs.writeFile(CRYPTO_FILE, JSON.stringify([], null, 2), "utf-8");
};

export const fetchCryptoRates = async () => {
  const baseParams = {
    access_key: "a172c8fc-7c75f16b-821c7134-ea3a8d3b",
  };

  try {
    const btcUsdRes = await axios.get("https://api.exconvert.com/fetchOne", {
      params: { ...baseParams, from: "BTC", to: "USD" },
    });

    const ethUsdRes = await axios.get("https://api.exconvert.com/fetchOne", {
      params: { ...baseParams, from: "ETH", to: "USD" },
    });

    const goldRes = await axios.get("https://api.gold-api.com/price/XAU");
    const silverRes = await axios.get("https://api.gold-api.com/price/XAG");

    return {
      btcToUsd: btcUsdRes.data,
      ethToUsd: ethUsdRes.data,
      gold: goldRes.data,
      silver: silverRes.data,
    };
  } catch (error) {
    console.error("Error sending fetch: ", error.message);
    throw error;
  }
};

export const fetchCryptoOnly = async () => {
  const baseParams = {
    access_key: "a172c8fc-7c75f16b-821c7134-ea3a8d3b",
  };

  try {
    const btcUsdRes = await axios.get("https://api.exconvert.com/fetchOne", {
      params: { ...baseParams, from: "BTC", to: "USD" },
    });

    const ethUsdRes = await axios.get("https://api.exconvert.com/fetchOne", {
      params: { ...baseParams, from: "ETH", to: "USD" },
    });

    return {
      btcToUsd: btcUsdRes.data,
      ethToUsd: ethUsdRes.data,
      gold: null,
      silver: null,
    };
  } catch (error) {
    console.error("Error fetching crypto only: ", error.message);
    throw error;
  }
};

let mainJob = null;
let forexCloseJob = null;
let weeklyCleanJob = null;
let isPriceRunning = false;

const getTashkentTime = () => {
  const now = new Date();
  try {
    const tashkent = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Tashkent" }),
    );
    return {
      day: tashkent.getDay(),
      hour: tashkent.getHours(),
    };
  } catch {
    return {
      day: now.getDay(),
      hour: now.getHours(),
    };
  }
};

export const startScheduler = async (bot, chatId) => {
  if (isPriceRunning) return null;
  isPriceRunning = true;

  const sendMessage = async (result) => {
    await saveCryptoToFile(result);
    await bot.telegram.sendMessage(
      chatId,
      texts.admin.uz.send_channel_price(result),
      { parse_mode: "Markdown" },
    );
  };

  try {
    const { day, hour } = getTashkentTime();
    const isWeekend = day === 0 || (day === 6 && hour >= 3);

    const immediateResult = isWeekend
      ? await fetchCryptoOnly()
      : await fetchCryptoRates();

    await saveCryptoToFile(immediateResult);

    mainJob = cron.schedule("0 * * * *", async () => {
      try {
        const { day, hour } = getTashkentTime();

        let result;

        if (day === 0) {
          result = await fetchCryptoOnly();
        } else if (day === 6) {
          if (hour >= 3) {
            result = await fetchCryptoOnly();
          } else {
            result = await fetchCryptoRates();
          }
        } else {
          result = await fetchCryptoRates();
        }
        await sendMessage(result);
      } catch (error) {
        console.error("Main scheduler error:", error.message);
      }
    });
    forexCloseJob = cron.schedule("58 2 * * 6", async () => {
      try {
        const result = await fetchCryptoRates();
        await sendMessage(result);
      } catch (error) {
        console.error("Forex close job error:", error.message);
      }
    });

    weeklyCleanJob = cron.schedule("0 0 * * 1", async () => {
      try {
        await clearCryptoFile();
      } catch (error) {
        console.error("Weekly clean error:", error.message);
      }
    });

    return immediateResult;
  } catch (error) {
    isPriceRunning = false;
    throw error;
  }
};

export const stopScheduler = () => {
  if (!isPriceRunning) return false;

  if (mainJob) {
    mainJob.stop();
    mainJob = null;
  }
  if (forexCloseJob) {
    forexCloseJob.stop();
    forexCloseJob = null;
  }
  if (weeklyCleanJob) {
    weeklyCleanJob.stop();
    weeklyCleanJob = null;
  }

  isPriceRunning = false;
  return true;
};

export const isSchedulerRunning = () => isPriceRunning;

export const formatNumber = (num, fraction = 2) => {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fraction,
  }).format(Number(num));
};
