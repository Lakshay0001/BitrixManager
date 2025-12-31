import "../styles/globals.css";
import { WebhookProvider } from "../context/WebhookContext";

export default function App({ Component, pageProps }) {
  return (
    <WebhookProvider>
      <Component {...pageProps} />
    </WebhookProvider>
  );
}
