# backend/delete.py
from fastapi import APIRouter, Query, HTTPException
from typing import List
from pydantic import BaseModel
from .bitrix_wrapper import BitrixWrapper

router = APIRouter()


class DuplicateDeleteRequest(BaseModel):
    ids: List[int]  # userfield IDs to delete


@router.post("/delete/{entity}/{item_id}")
def delete_item(entity: str, item_id: str, base: str = Query(...)):
    bx = BitrixWrapper(base)
    ok, res = bx.delete_single(item_id, entity)
    if not ok:
        raise HTTPException(status_code=400, detail=res)

    # Always return True in result for frontend
    return {"success": True, "entity": entity, "item_id": item_id, "result": True}



@router.post("/fields/delete")
def delete_duplicates(req: DuplicateDeleteRequest, base: str = Query(...)):
    """Delete duplicate userfields by their IDs."""
    bx = BitrixWrapper(base)
    summary = []
    for fid in req.ids:
        ok, res = bx.delete_single(fid, 'userfield')
        if ok and res.get("result") is True:
            summary.append({"id": fid, "status": "ok", "msg": "Deleted successfully"})
        else:
            summary.append({"id": fid, "status": "error", "msg": res})
    return {"success": True, "result": summary}
