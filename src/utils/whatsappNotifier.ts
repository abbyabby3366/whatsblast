/**
 * Sends a WhatsApp notification using the external API gateway.
 * Endpoint: https://deswa.io7.my/api/external/send-message
 */
export async function sendDeployNotification(message: string, number?: string) {
  try {
    const targetNumber = number || process.env.WHATSAPP_NOTIFICATION_NUMBER;
    if (!targetNumber) {
      console.log('⚠️ Skipping WhatsApp notification: WHATSAPP_NOTIFICATION_NUMBER is not set in .env');
      return;
    }

    const payload = {
      number: targetNumber,
      message: message
    };

    console.log(`📡 Sending WhatsApp notification to ${targetNumber}...`);

    const response = await fetch('https://deswa.io7.my/api/external/send-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data: any = await response.json();

    if (!response.ok) {
      console.error('❌ WhatsApp Notification API Error:', data);
    } else {
      console.log('✅ WhatsApp deploy notification sent successfully!');
    }
  } catch (error: any) {
    console.error('❌ WhatsApp Notification Error:', error?.message || error);
  }
}
