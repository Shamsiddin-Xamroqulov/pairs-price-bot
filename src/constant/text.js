import { formatNumber } from "../helper/crypto.helper.js";

export default {
  uz: {
    welcome: `
📊 *Pairs Price Sender Bot*

Assalomu alaykum!

Ushbu bot quyidagi kotirovkalar bo‘yicha narxlarni har soatda yuboradi:

🟡 *Gold*
⚪ *Silver*  
🛢 *Brent (Crude Oil)*  
₿ *BTC*
💎 *ETH*  

🕒 *Kriptovalyutalar — har kuni*
📈 *Forex — Dushanbadan Jumagacha*  

Botni boshqarish uchun quyidagi tugmalardan foydalaning.`,
    not_admin: `⛔ Sizda ushbu botni boshqarish huquqi yo‘q.`,
    bot_already_started: `⚠️ Bot allaqachon ishga tushgan.`,
    price_started: `🚀 Narxlarni yuborish boshlandi.`,
    sending_price_already_stoped: `⚠️ Narxlarni jo'natish to'xtatilgan`,
    sending_price_stoped: `🛑 Narxlar yuborilishi to‘xtatildi.`,
    send_channel_price: (crypto) => {
      const now = new Date().toLocaleString("uz-UZ", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      return `
*BTC*: ${formatNumber(crypto?.btcToUsd?.result?.USD, 2)} USD
*ETH*: ${formatNumber(crypto?.ethToUsd?.result?.USD, 2)} USD  

*USD*: ${formatNumber(crypto?.usdToUzs?.result?.UZS, 2)} UZS
*AUD*: ${formatNumber(crypto?.audToUsd?.result?.USD, 6)} USD  

*GOLD*: ${formatNumber(crypto?.gold?.price, 2)} USD
*SILVER*: ${formatNumber(crypto?.silver?.price, 2)} USD
*OIL (Brent)*: ${formatNumber(crypto?.oilPriceUsd, 2)} USD

*Yangilanish vaqti*: ${now}`;
    },
  },
};
