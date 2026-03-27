import axios from "axios";
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

// DB dan oxirgi saqlangan ma'lumotni olish
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
    console.error("Error fetching crypto rates:", error.message);
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
    console.error("Error fetching crypto only:", error.message);
    throw error;
  }
};

let mainInterval = null;
let isPriceRunning = false;

// Trackerlar — ikki marta ishlamaslik uchun
let lastFetchedHour = -1;  // :58 da fetch qilingan soat
let lastSentHour = -1;     // :00 da yuborilgan soat
let lastCleanedDay = -1;   // tozalangan kun (har kuni)

const getTashkentTime = () => {
  const now = new Date();
  try {
    const tashkent = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Tashkent" }),
    );
    return {
      day: tashkent.getDay(),
      hour: tashkent.getHours(),
      minute: tashkent.getMinutes(),
      // Har kun uchun unique key (YYYYMMDD)
      dayKey: tashkent.getFullYear() * 10000 +
              (tashkent.getMonth() + 1) * 100 +
              tashkent.getDate(),
    };
  } catch {
    const now2 = new Date();
    return {
      day: now2.getDay(),
      hour: now2.getHours(),
      minute: now2.getMinutes(),
      dayKey: now2.getFullYear() * 10000 +
              (now2.getMonth() + 1) * 100 +
              now2.getDate(),
    };
  }
};

// Qaysi ma'lumot kerakligini aniqlash (forex+crypto yoki faqat crypto)
const shouldFetchFullRates = (day, hour) => {
  if (day === 0) return false;              // Yakshanba — faqat crypto
  if (day === 6 && hour >= 3) return false; // Shanba 03:00+ — faqat crypto
  return true;                              // Qolgan vaqt — hammasi
};

export const startScheduler = async (bot, chatId) => {
  if (isPriceRunning) return null;
  isPriceRunning = true;

  const sendToChannel = async (data) => {
    await bot.telegram.sendMessage(
      chatId,
      texts.admin.uz.send_channel_price(data),
      { parse_mode: "Markdown" },
    );
  };

  try {
    const { day, hour } = getTashkentTime();

    // Botni ishga tushirganda darhol bir marta fetch qilib yuboradi
    const immediateResult = shouldFetchFullRates(day, hour)
      ? await fetchCryptoRates()
      : await fetchCryptoOnly();

    await saveCryptoToFile(immediateResult);
    await sendToChannel(immediateResult);

    lastFetchedHour = hour;
    lastSentHour = hour;

    // ✅ Har 10 soniyada tekshiradi
    mainInterval = setInterval(async () => {
      try {
        const { day, hour, minute, dayKey } = getTashkentTime();

        // ─── 1. Har kuni 00:00 da DB ni tozalash ───
        if (hour === 0 && minute < 3 && lastCleanedDay !== dayKey) {
          lastCleanedDay = dayKey;
          console.log("DB tozalanmoqda...");
          await clearCryptoFile().catch((e) =>
            console.error("Daily clean error:", e.message),
          );
        }

        // ─── 2. Har soat :58 da API dan oldindan fetch qilish ───
        if (minute === 58 && lastFetchedHour !== hour) {
          lastFetchedHour = hour;
          console.log(`[${hour}:58] Oldindan fetch qilinmoqda...`);
          try {
            const result = shouldFetchFullRates(day, hour)
              ? await fetchCryptoRates()
              : await fetchCryptoOnly();
            await saveCryptoToFile(result);
            console.log(`[${hour}:58] DB ga saqlandi.`);
          } catch (e) {
            console.error(`[${hour}:58] Fetch xatosi:`, e.message);
          }
        }

        // ─── 3. Har soat :00-:02 da DB dan o'qib kanalga yuborish ───
        if (minute < 3 && lastSentHour !== hour) {
          lastSentHour = hour;
          console.log(`[${hour}:00] Kanalga yuborilmoqda...`);
          try {
            // Avval DB dan oxirgi saqlangan ma'lumotni oladi
            let data = await getLastSavedData();

            // Agar DB da ma'lumot bo'lmasa (fallback) — to'g'ridan API dan oladi
            if (!data) {
              console.warn(`[${hour}:00] DB bo'sh, API dan fallback...`);
              data = shouldFetchFullRates(day, hour)
                ? await fetchCryptoRates()
                : await fetchCryptoOnly();
              await saveCryptoToFile(data);
            }

            await sendToChannel(data);
            console.log(`[${hour}:00] Yuborildi.`);
          } catch (e) {
            console.error(`[${hour}:00] Yuborish xatosi:`, e.message);
          }
        }
      } catch (error) {
        console.error("Scheduler error:", error.message);
      }
    }, 10 * 1000); // har 10 soniya

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

  lastFetchedHour = -1;
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