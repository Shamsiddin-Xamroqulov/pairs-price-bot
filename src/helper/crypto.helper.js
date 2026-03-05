import axios from "axios";
import * as cheerio from "cheerio";
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

    let price;
    const { data } = await axios.get(
      "https://tradingeconomics.com/commodity/brent-crude-oil",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
        },
      }
    );
    const $ = cheerio.load(data);
    const metaContent = $('meta[name="description"]').attr("content");
    const match = metaContent?.match(/rose to ([\d.]+) USD/);
    if (match) price = Number(match[1]);

    return {
      btcToUsd: btcUsdRes.data,
      ethToUsd: ethUsdRes.data,
      gold: goldRes.data,
      silver: silverRes.data,
      oilPriceUsd: price,
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
      oilPriceUsd: null,
    };
  } catch (error) {
    console.error("Error fetching crypto only: ", error.message);
    throw error;
  }
};

let weekdayJob = null;
let weekendJob = null;
let weeklyCleanJob = null;
let forexCloseJob = null;
let isPriceRunning = false;

export const startScheduler = async (bot) => {
  if (isPriceRunning) return null;
  isPriceRunning = true;

  const sendMessage = async (result) => {
    await saveCryptoToFile(result);
    await bot.telegram.sendMessage(
      process.env.CHANNEL_USERNAME,
      texts.admin.uz.send_channel_price(result),
      { parse_mode: "Markdown" }
    );
  };

  try {
    const dayOfWeek = new Date().getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const immediateResult = isWeekend
      ? await fetchCryptoOnly()
      : await fetchCryptoRates();

    await saveCryptoToFile(immediateResult);

    weekdayJob = cron.schedule("0 * * * 1-5", async () => {
      try {
        const result = await fetchCryptoRates();
        await sendMessage(result);
      } catch (error) {
        console.error("Weekday scheduler error:", error.message);
      }
    });

    weekendJob = cron.schedule("0 * * * 0,6", async () => {
      try {
        const result = await fetchCryptoOnly();
        await sendMessage(result);
      } catch (error) {
        console.error("Weekend scheduler error:", error.message);
      }
    });

    forexCloseJob = cron.schedule("0 19 * * 5", async () => {
      try {
        if (weekdayJob) { weekdayJob.stop(); weekdayJob = null; }

        const result = await fetchCryptoOnly();
        await sendMessage(result);

        if (!weekendJob) {
          weekendJob = cron.schedule("0 * * * 0,6", async () => {
            try {
              const result = await fetchCryptoOnly();
              await sendMessage(result);
            } catch (error) {
              console.error("Weekend scheduler error:", error.message);
            }
          });
        }
      } catch (error) {
        console.error("Forex close job error:", error.message);
      }
    }, {
      timezone: "Asia/Tashkent"
    });

    weeklyCleanJob = cron.schedule("0 0 * * 1", async () => {
      try {
        await clearCryptoFile();
        if (!weekdayJob) {
          weekdayJob = cron.schedule("0 * * * 1-5", async () => {
            try {
              const result = await fetchCryptoRates();
              await sendMessage(result);
            } catch (error) {
              console.error("Weekday scheduler error:", error.message);
            }
          });
        }
      } catch (error) {
        console.error("Weekly clean error:", error.message);
      }
    }, {
      timezone: "Asia/Tashkent"
    });

    return immediateResult;
  } catch (error) {
    isPriceRunning = false;
    throw error;
  }
};

export const stopScheduler = () => {
  if (!isPriceRunning) return false;

  if (weekdayJob) { weekdayJob.stop(); weekdayJob = null; }
  if (weekendJob) { weekendJob.stop(); weekendJob = null; }
  if (weeklyCleanJob) { weeklyCleanJob.stop(); weeklyCleanJob = null; }
  if (forexCloseJob) { forexCloseJob.stop(); forexCloseJob = null; }
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