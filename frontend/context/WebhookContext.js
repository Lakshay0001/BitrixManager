import { createContext, useState, useEffect } from "react";

export const WebhookContext = createContext({
  webhook: "",
  setWebhook: () => {}
});

export function WebhookProvider({ children }) {
  const [webhook, setWebhook] = useState("");

  // Load saved webhook on startup (use single canonical key: "webhook")
  useEffect(() => {
    const saved = localStorage.getItem("webhook");
    if (saved) {
      setWebhook(saved);
    }
  }, []);

  // Save webhook every time it changes
  useEffect(() => {
    if (webhook !== undefined) {
      // store empty string as well so pages can rely on localStorage
      localStorage.setItem("webhook", webhook || "");
    }
  }, [webhook]);

  return (
    <WebhookContext.Provider value={{ webhook, setWebhook }}>
      {children}
    </WebhookContext.Provider>
  );
}
