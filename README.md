Bitrix Dashboard Modern - Ready Scaffold
=======================================
Frontend: Next.js (Pages Router) + Tailwind (glassmorphism)
Backend: FastAPI (CORS enabled) + Bitrix wrapper

Quick start (Windows):
  cd backend
  python -m venv venv
  venv\Scripts\activate
  pip install -r requirements.txt
  uvicorn main:app --reload --port 8000

  cd ../frontend
  npm install
  npm run dev
  Open http://localhost:3000

Notes:
 - Enter your Bitrix base webhook URL (e.g. https://yourdomain.bitrix24.in/rest/1/KEY/) in the frontend pages.
 - Endpoints supported: /fields, /list, /get, /update, /delete
 - To add XLSX import/export and more advanced UI (dropdowns mapped to label->code), I can provide next patches.
