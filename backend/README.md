Backend (FastAPI) for Bitrix Manager
-----------------------------------
Setup:
  python -m venv venv
  venv\Scripts\activate   (Windows) OR source venv/bin/activate (Linux/macOS)
  pip install -r requirements.txt
  uvicorn main:app --reload --port 8000
Endpoints:
  GET /fields/{entity}?base=BASE_URL
  GET /list/{entity}?base=BASE_URL[&from_date=&to_date=&select=field1,field2]
  GET /get/{entity}/{item_id}?base=BASE_URL
  POST /update/{entity}/{item_id}?base=BASE_URL  (JSON: {"fields": {...}} )
  POST /delete/{entity}/{item_id}?base=BASE_URL
