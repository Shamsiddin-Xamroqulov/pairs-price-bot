import axios from "axios";
import * as cheerio from "cheerio";
import cron from "node-cron";
import { texts } from "../constant/index.js";

export const fetchCryptoRates = async () => {
  const baseParams = {
    access_key: "a172c8fc-7c75f16b-821c7134-ea3a8d3b",
  };

  try {
    // 1-so'rov: BTC -> USD
    const btcUsdRes = await axios.get("https://api.exconvert.com/fetchOne", {
      params: {
        ...baseParams,
        from: "BTC",
        to: "USD",
      },
    });

    // 2-so'rov: AUD -> USD
    const audUsdRes = await axios.get("https://api.exconvert.com/fetchOne", {
      params: {
        ...baseParams,
        from: "AUD",
        to: "USD",
      },
    });

    // 3-so'rov: ETH -> USD
    const ethUsdRes = await axios.get("https://api.exconvert.com/fetchOne", {
      params: {
        ...baseParams,
        from: "ETH",
        to: "USD",
      },
    });

    // 4-so'rov: USD (o'zi uchun)
    const usdUzsRes = await axios.get("https://api.exconvert.com/fetchOne", {
      params: {
        ...baseParams,
        from: "USD",
        to: "UZS",
      },
    });

    // 5-so'rov: Gold narxi
    const goldRes = await axios.get("https://api.gold-api.com/price/XAU");

    // 6-so'rov: Silver (Kumush) narxi
    const silverRes = await axios.get("https://api.gold-api.com/price/XAG");
    let price;
    const { data } = await axios.get(
      "https://tradingeconomics.com/commodity/brent-crude-oil",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
        },
      },
    );
    const $ = cheerio.load(data);
    const metaContent = $('meta[name="description"]').attr("content");
    const match = metaContent.match(/rose to ([\d.]+) USD/);

    if (match) {
      price = Number(match[1]);
    }

    return {
      btcToUsd: btcUsdRes.data,
      audToUsd: audUsdRes.data,
      ethToUsd: ethUsdRes.data,
      usdToUzs: usdUzsRes.data,
      gold: goldRes.data,
      silver: silverRes.data,
      oilPriceUsd: price
    };
  } catch (error) {
    console.error("Error sending fetch: ", error.message);
    throw error;
  }
};

// crypto.helper.js
let schedulerJob = null;
let isPriceRunning = false;

export const startScheduler = async (bot) => {
  if (isPriceRunning) return null;
  isPriceRunning = true;
  
  try {
    const immediateResult = await fetchCryptoRates();

    schedulerJob = cron.schedule("*/1 * * * 1-5", async () => {
      try {
        const result = await fetchCryptoRates();
        await bot.telegram.sendMessage(
          process.env.CHANNEL_USERNAME,
          texts.admin.uz.send_channel_price(result),
          { parse_mode: "Markdown" }
        );
      } catch (error) {
        console.error("Scheduler error:", error.message);
      }
    });
    return immediateResult;
  } catch (error) {
    isPriceRunning = false;
    throw error;
  }
};

export const stopScheduler = () => {
  if (!isPriceRunning || !schedulerJob) return false;

  schedulerJob.stop();
  schedulerJob = null;
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
