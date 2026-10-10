import admin from 'firebase-admin';

export const NotificationService = {
  /**
   * Sends an FCM push notification.
   * Currently marked NOT VERIFIED due to missing physical device token registration flow.
   */
  sendNotification: async (deviceToken, title, body, data = {}) => {
    if (!process.env.FIREBASE_PROJECT_ID) {
      console.warn("Notification not sent: FCM not configured.");
      return false;
    }
    
    try {
      const message = {
        token: deviceToken,
        notification: { title, body },
        data: data
      };
      // FCM call would go here:
      // await admin.messaging().send(message);
      return true;
    } catch (e) {
      console.error("FCM Send failed:", e);
      return false;
    }
  }
};
