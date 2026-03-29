import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { texts } from "../constant/index.js";

const CRYPTO_FILE = path.join(process.cwd(), "db", "crypto.json");

// ─── Retry helper: xato bo'lsa qayta urinadi ───
const withRetry = async (fn, retries = 4, delayMs = 3000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      const isLast = i === retries - 1;
      if (isLast) throw e;
      console.warn(`Retry ${i + 1}/${retries - 1}: ${e.message}. ${delayMs / 1000}s kutilmoqda...`);
      await new Promise((r) => setTimeout(r, delayMs));
      delayMs *= 2; // har safar 2x ko'proq kutadi: 3s → 6s → 12s → 24s
    }
  }
};

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

const getLastSavedData = async () => {
  try {
    const file = await fs.readFile(CRYPTO_FILE, "utf-8");
    const existing = JSON.parse(file);
    if (existing.length === 0) return null;
    return existing[existing.length - 1];
  } catch {
    return null;
  }
};

export const fetchCryptoRates = async () => {
  const baseParams = { access_key: "a172c8fc-7c75f16b-821c7134-ea3a8d3b" };
  return withRetry(async () => {
    const [btcUsdRes, ethUsdRes, goldRes, silverRes] = await Promise.all([
      axios.get("https://api.exconvert.com/fetchOne", { params: { ...baseParams, from: "BTC", to: "USD" } }),
      axios.get("https://api.exconvert.com/fetchOne", { params: { ...baseParams, from: "ETH", to: "USD" } }),
      axios.get("https://api.gold-api.com/price/XAU"),
      axios.get("https://api.gold-api.com/price/XAG"),
    ]);
    return {
      btcToUsd: btcUsdRes.data,
      ethToUsd: ethUsdRes.data,
      gold: goldRes.data,
      silver: silverRes.data,
    };
  });
};

export const fetchCryptoOnly = async () => {
  const baseParams = { access_key: "a172c8fc-7c75f16b-821c7134-ea3a8d3b" };
  return withRetry(async () => {
    const [btcUsdRes, ethUsdRes] = await Promise.all([
      axios.get("https://api.exconvert.com/fetchOne", { params: { ...baseParams, from: "BTC", to: "USD" } }),
      axios.get("https://api.exconvert.com/fetchOne", { params: { ...baseParams, from: "ETH", to: "USD" } }),
    ]);
    return {
      btcToUsd: btcUsdRes.data,
      ethToUsd: ethUsdRes.data,
      gold: null,
      silver: null,
    };
  });
};

let mainInterval = null;
let isPriceRunning = false;

let prefetchedForHour = -1;
let lastSentHour = -1;
let lastCleanedDay = -1;

const getTashkentTime = () => {
  const now = new Date();
  try {
    const t = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tashkent" }));
    return {
      day: t.getDay(),
      hour: t.getHours(),
      minute: t.getMinutes(),
      dayKey: t.getFullYear() * 10000 + (t.getMonth() + 1) * 100 + t.getDate(),
    };
  } catch {
    return {
      day: now.getDay(),
      hour: now.getHours(),
      minute: now.getMinutes(),
      dayKey: now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate(),
    };
  }
};

const shouldFetchFullRates = (day, hour) => {
  if (day === 0) return false;
  if (day === 6 && hour >= 3) return false;
  return true;
};

const getNextHourInfo = (day, hour) => {
  const nextHour = (hour + 1) % 24;
  const nextDay = nextHour === 0 ? (day + 1) % 7 : day;
  return { nextDay, nextHour };
};

export const startScheduler = async (bot, chatId) => {
  if (isPriceRunning) return null;
  isPriceRunning = true;

  // Telegram ga yuborish ham retry bilan
  const sendToChannel = async (data) => {
    return withRetry(() =>
      bot.telegram.sendMessage(
        chatId,
        texts.admin.uz.send_channel_price(data),
        { parse_mode: "Markdown" },
      )
    );
  };

  const fetchData = async (day, hour) => {
    return shouldFetchFullRates(day, hour)
      ? await fetchCryptoRates()
      : await fetchCryptoOnly();
  };

  try {
    const { day, hour, minute } = getTashkentTime();

    const immediateResult = await fetchData(day, hour);
    await saveCryptoToFile(immediateResult);
    await sendToChannel(immediateResult);
    lastSentHour = hour;

    if (minute >= 55) {
      const { nextDay, nextHour } = getNextHourInfo(day, hour);
      console.log(`[INIT] ${nextHour}:00 uchun prefetch...`);
      try {
        const prefetchResult = await fetchData(nextDay, nextHour);
        await saveCryptoToFile(prefetchResult);
        prefetchedForHour = nextHour;
        console.log(`[INIT] ${nextHour}:00 uchun saqlandi.`);
      } catch (e) {
        console.error("[INIT] Prefetch xatosi:", e.message);
      }
    }

    mainInterval = setInterval(async () => {
      try {
        const { day, hour, minute, dayKey } = getTashkentTime();

        // ─── 1. Har kuni 00:00 da DB tozalash ───
        if (hour === 0 && minute < 3 && lastCleanedDay !== dayKey) {
          lastCleanedDay = dayKey;
          console.log(`[${dayKey}] DB tozalanmoqda...`);
          await clearCryptoFile().catch((e) =>
            console.error("Daily clean error:", e.message),
          );
        }

        // ─── 2. :55-:59 da keyingi soat uchun prefetch ───
        if (minute >= 55) {
          const { nextDay, nextHour } = getNextHourInfo(day, hour);
          if (prefetchedForHour !== nextHour) {
            prefetchedForHour = nextHour;
            console.log(`[${hour}:${minute}] ${nextHour}:00 uchun prefetch...`);
            try {
              const result = await fetchData(nextDay, nextHour);
              await saveCryptoToFile(result);
              console.log(`[${hour}:${minute}] ✅ ${nextHour}:00 uchun saqlandi.`);
            } catch (e) {
              console.error(`[${hour}:${minute}] ❌ Prefetch xatosi (retry tugadi):`, e.message);
              prefetchedForHour = -1; // qayta urinish uchun reset
            }
          }
        }

        // ─── 3. :00-:04 da DB dan o'qib kanalga yuborish ───
        if (minute < 5 && lastSentHour !== hour) {
          lastSentHour = hour;
          console.log(`[${hour}:${minute}] Kanalga yuborilmoqda...`);
          try {
            let data = await getLastSavedData();

            if (!data) {
              console.warn(`[${hour}:${minute}] DB bo'sh! API fallback (retry bilan)...`);
              data = await fetchData(day, hour);
              await saveCryptoToFile(data);
            }

            await sendToChannel(data);
            console.log(`[${hour}:${minute}] ✅ Yuborildi.`);
          } catch (e) {
            console.error(`[${hour}:${minute}] ❌ Yuborish xatosi (retry tugadi):`, e.message);
            lastSentHour = -1; // qayta urinish uchun reset
          }
        }
      } catch (error) {
        console.error("Scheduler loop error:", error.message);
      }
    }, 10 * 1000);

    return immediateResult;
  } catch (error) {
    isPriceRunning = false;
    throw error;
  }
};

export const stopScheduler = () => {
  if (!isPriceRunning) return false;

  if (mainInterval) {
    clearInterval(mainInterval);
    mainInterval = null;
  }

  prefetchedForHour = -1;
  lastSentHour = -1;
  lastCleanedDay = -1;
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