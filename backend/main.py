from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

# --------------------------------------------------
# APP INIT
# --------------------------------------------------
app = FastAPI(
    title="Bitrix Manager Backend",
    version="1.0.0"
)

# --------------------------------------------------
# CORS CONFIG
# --------------------------------------------------
# '*' by default for local dev; override with environment variable in Render
allowed_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------
# API PREFIX (IMPORTANT)
# --------------------------------------------------
API_PREFIX = ""

# --------------------------------------------------
# IMPORT ROUTERS
# --------------------------------------------------
# Use absolute imports for Render deployment compatibility
from backend.get import router as get_router
from backend.list import router as list_router
from backend.fields import router as fields_router
from backend.update import router as update_router
from backend.delete import router as delete_router
from backend.template import router as template_router
from backend.users import router as users_router

# --------------------------------------------------
# INCLUDE ROUTERS
# --------------------------------------------------
app.include_router(get_router, prefix=API_PREFIX, tags=["Get"])
app.include_router(list_router, prefix=API_PREFIX, tags=["List"])
app.include_router(fields_router, prefix=API_PREFIX, tags=["Fields"])
app.include_router(update_router, prefix=API_PREFIX, tags=["Update"])
app.include_router(delete_router, prefix=API_PREFIX, tags=["Delete"])
app.include_router(template_router, prefix=API_PREFIX, tags=["Template"])
app.include_router(users_router, prefix=API_PREFIX, tags=["Users"])

# --------------------------------------------------
# SYSTEM / HEALTH ENDPOINTS
# --------------------------------------------------
@app.get("/health", tags=["System"])
def health():
    return {"status": "ok"}

@app.get("/", tags=["System"])
def root():
    return {
        "service": "Bitrix Manager Backend",
        "version": "1.0.0",
        "api_base": API_PREFIX
    }

# --------------------------------------------------
# LOCAL DEV ENTRYPOINT
# --------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",  # must be full path for Render & local
        host="0.0.0.0",      # 0.0.0.0 so Render can expose it
        port=int(os.environ.get("PORT", 8000)),  # Render sets PORT dynamically
        reload=True
    )
