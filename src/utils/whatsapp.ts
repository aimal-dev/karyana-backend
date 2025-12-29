/**
 * WhatsApp Notification Utility using CallMeBot (Free)
 * To use this, the recipient must:
 * 1. Add +34 644 10 55 19 to contacts
 * 2. Send message: "I allow callmebot to send me messages"
 * 3. Use the API Key provided by the bot
 */

export const sendWhatsAppMessage = async (phone: string, message: string, apikey: string) => {
  if (!phone || !message || !apikey) {
    console.log("WhatsApp missing params:", { phone: !!phone, message: !!message, apikey: !!apikey });
    return;
  }

  try {
    const encodedMsg = encodeURIComponent(message);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodedMsg}&apikey=${apikey}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error("WhatsApp API error:", response.statusText);
    } else {
      console.log("WhatsApp notification sent successfully to", phone);
    }
  } catch (error) {
    console.error("Failed to send WhatsApp message:", error);
  }
};
