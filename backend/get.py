from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from typing import List
from .bitrix_wrapper import BitrixWrapper
from .helpers import flatten_record_helper
import pandas as pd
import io

# Prefix for API versioning
router = APIRouter()


@router.get("/get/single")
def get_single(entity: str = Query(...), item_id: str = Query(...), base: str = Query(...)):
    """Fetch a single record."""
    bx = BitrixWrapper(base)
    rec = bx.get_single(item_id, entity)
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"result": [flatten_record_helper(rec, entity, bx)], "total": 1}


@router.get("/get/multiple")
def get_multiple(entity: str = Query(...), ids: str = Query(...), base: str = Query(...)):
    """Fetch multiple records by comma-separated IDs."""
    bx = BitrixWrapper(base)
    id_list = [s.strip() for s in ids.split(",") if s.strip()]
    out = [flatten_record_helper(bx.get_single(i, entity), entity, bx) for i in id_list if bx.get_single(i, entity)]
    return {"result": out, "total": len(out)}


@router.post("/get/file")
async def get_by_file(entity: str = Query(...), base: str = Query(...), file: UploadFile = File(...)):
    """Upload CSV/XLSX file with IDs and fetch records."""
    bx = BitrixWrapper(base)
    data = await file.read()
    fname = (file.filename or "").lower()

    try:
        if fname.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(data), dtype=str)
        else:
            df = pd.read_csv(io.BytesIO(data), dtype=str)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {e}")

    if df.empty:
        raise HTTPException(status_code=400, detail="Uploaded file contains no rows")

    # Detect ID column
    id_col = next((c for c in df.columns if str(c).strip().upper() in ("ID", "LEAD ID", "DEAL ID", "ITEM ID", "RECORD ID")), df.columns[0])

    ids = df[id_col].dropna().astype(str).map(str.strip).tolist()
    out = [flatten_record_helper(bx.get_single(i, entity), entity, bx) for i in ids if bx.get_single(i, entity)]

    return {"result": out, "total": len(out)}
