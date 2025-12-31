# backend/get.py
from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from typing import Any, Dict, List
from .bitrix_wrapper import BitrixWrapper
from .helpers import flatten_record_helper
import pandas as pd
import io

router = APIRouter()


@router.get("/get/{entity}/{item_id}")
def get_item(entity: str, item_id: str, base: str = Query(...)):
    """Fetch a single item by entity and ID with flattened records."""
    bx = BitrixWrapper(base)
    rec = bx.get_single(item_id, entity)
    if rec is None:
        raise HTTPException(status_code=404, detail="Not found")
    return flatten_record_helper(rec, entity, bx)


@router.get("/get/single")
def get_single(entity: str, item_id: str, base: str = Query(...)):
    """Fetch a single item by entity and ID with flattened records."""
    bx = BitrixWrapper(base)
    rec = bx.get_single(item_id, entity)
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    return flatten_record_helper(rec, entity, bx)


@router.get("/get/multiple")
def get_multiple(entity: str, ids: str = Query(...), base: str = Query(...)):
    """Fetch multiple items by comma-separated IDs."""
    bx = BitrixWrapper(base)
    id_list = [s.strip() for s in ids.split(",") if s.strip()]
    out = []
    for i in id_list:
        rec = bx.get_single(i, entity)
        if rec:
            out.append(flatten_record_helper(rec, entity, bx))
    return {"result": out, "total": len(out)}


@router.post("/get/file")
async def get_by_file(entity: str = Query(...), base: str = Query(...), file: UploadFile = File(...)):
    """Upload CSV/XLSX with IDs and fetch corresponding records."""
    bx = BitrixWrapper(base)
    data = await file.read()
    fname = (file.filename or "").lower()
    try:
        if fname.endswith('.xlsx') or fname.endswith('.xls'):
            df = pd.read_excel(io.BytesIO(data), dtype=str)
        else:
            # try CSV
            df = pd.read_csv(io.BytesIO(data), dtype=str)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {e}")

    if df.empty:
        raise HTTPException(status_code=400, detail="Uploaded file contains no rows")

    # Try find ID column
    id_col = None
    for c in df.columns:
        if str(c).strip().upper() in ("ID", "LEAD ID", "DEAL ID", "ITEM ID", "RECORD ID"):
            id_col = c
            break
    if id_col is None:
        # fallback: first column
        id_col = df.columns[0]

    ids = df[id_col].dropna().astype(str).map(lambda s: s.strip()).tolist()
    ids = [s for s in ids if s]
    out = []
    for i in ids:
        rec = bx.get_single(i, entity)
        if rec:
            out.append(flatten_record_helper(rec, entity, bx))

    return {"result": out, "total": len(out)}
