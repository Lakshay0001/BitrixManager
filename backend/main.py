# UPDATED main.py - Organized with modular routers

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

app = FastAPI(title="Bitrix Manager Backend")

# Allow CORS from frontend domain (configurable via env var)
allowed_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import routers (package-relative imports)
from .get import router as get_router
from .list import router as list_router
from .fields import router as fields_router
from .update import router as update_router
from .delete import router as delete_router
from .template import router as template_router

# Include routers
app.include_router(get_router)
app.include_router(list_router)
app.include_router(fields_router)
app.include_router(update_router)
app.include_router(delete_router)
app.include_router(template_router)

# Health check endpoint
@app.get("/health")
def health():
    """Health check endpoint for readiness probes."""
    return {"status": "ok"}

# ---------------------- ENDPOINTS (Legacy - now in individual modules) -------------------------------
# All endpoints have been moved to modular files:
# - get.py: GET endpoints for retrieving items
# - list.py: LIST endpoints for fetching multiple items
# - fields.py: FIELDS endpoints for field definitions
# - update.py: UPDATE endpoints for modifying items
# - delete.py: DELETE endpoints for removing items
# - template.py: TEMPLATE endpoints for downloading Excel templates

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

