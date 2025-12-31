import { useContext, useState } from "react";
import { WebhookContext } from "../context/WebhookContext";
import { useRouter } from "next/router";
import Layout from "../components/Layout";

export default function Home() {
  const { webhook, setWebhook } = useContext(WebhookContext);
  const [input, setInput] = useState(webhook || "");
  const router = useRouter();

  const saveWebhook = () => {
    if (!input.trim()) {
      alert("Please enter webhook URL");
      return;
    }
    setWebhook(input.trim());
    localStorage.setItem("webhook", input.trim());
    alert("Webhook saved!");
  };

  const resetWebhook = () => {
    setWebhook("");
    setInput("");
    localStorage.removeItem("webhook");
    alert("Webhook reset!");
  };

  const navigate = (path) => {
    if (!input.trim() && !webhook) {
      alert("Please enter webhook URL first!");
      return;
    }
    router.push(path);
  };

  return (
    <Layout>
      {/* 🟢 FIXED: 'justify-center' removed to stop vertical centering. 
          'p-4 pt-8' added for controlled spacing from top and sides. */}
      <div className="mb-auto bg-gradient-to-br from-slate-900 to-black flex flex-col items-center text-white p-4 pt-8">
        <div className="backdrop-blur-xl bg-white/10 p-8 rounded-2xl shadow-2xl border border-white/20 w-full lg:max-w-lg md:max-w-md max-w-sm">

          <h1 className="text-3xl font-bold text-center mb-6">
            Bitrix Manager
          </h1>

          {/* Webhook Input */}
          <input
            type="text"
            placeholder="Enter your Base Webhook URL"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full p-3 rounded-lg bg-black/30 border border-white/20 text-white mb-4"
          />

          {/* Buttons: stack on mobile (flex-col), row on small screens and up (sm:flex-row) */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6"> 
            <button
              onClick={saveWebhook}
              className="flex-1 p-3 rounded-lg font-semibold btn w-full"
            >
              Save Webhook
            </button>
            <button
              onClick={resetWebhook}
              className="flex-1 p-3 bg-gradient-to-r from-red-500 to-pink-600 rounded-lg font-semibold transition w-full"
            >
              Reset Webhook
            </button>
          </div>

          <h2 className="text-xl mt-2 mb-3 font-semibold text-center">
            Select Operation
          </h2>

          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => navigate("/list")}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-lg text-left transition-colors"
            >
              📄 List Records
            </button>

            <button
              onClick={() => navigate("/get")}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-lg text-left transition-colors"
            >
              🔍 Get Records
            </button>

            <button
              onClick={() => navigate("/update")}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-lg text-left transition-colors"
            >
              ✏️ Update Records
            </button>

            <button
              onClick={() => navigate("/delete")}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-lg text-left transition-colors"
            >
              ❌ Delete Records
            </button>

            <button
              onClick={() => navigate("/list-get-update")}
              className="p-3 bg-purple-600/20 border border-purple-500/50 hover:bg-purple-600/30 rounded-lg text-left transition-colors text-purple-300 font-medium"
            >
              🔄 List & Update (Advanced)
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}