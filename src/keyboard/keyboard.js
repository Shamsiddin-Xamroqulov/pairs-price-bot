import { texts } from "../constant/index.js";

export default {
  uz: {
    sendPriceKeyboard: () => ({
      keyboard: [
        [{ text: texts.keyboard.uz.sendPrice }],
        [{ text: texts.keyboard.uz.stopSendingPrice }],
        
      ],
      resize_keyboard: true,
    }),
  },
  // ru: {

  // }
};
