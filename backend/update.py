from fastapi import APIRouter, Query, HTTPException
from typing import Dict, Any
from .bitrix_wrapper import BitrixWrapper

router = APIRouter()


# ---------------------
# Single record fetch
# ---------------------
@router.get("/get/{entity}/{id}")
def get_single(entity: str, id: int, base: str = Query(...)):
    bx = BitrixWrapper(base)
    row = bx.get_single(id, entity)
    if not row:
        raise HTTPException(status_code=404, detail="Record not found")
    return row


# ---------------------
# Update record
# ---------------------
@router.post("/update/{entity}/{item_id}")
def update_item(
    entity: str,
    item_id: str,
    base: str = Query(...),
    payload: Dict[str, Any] = {}
):
    bx = BitrixWrapper(base)
    fields = payload.get("fields") if "fields" in payload else payload

    def _normalize(resp):
        if isinstance(resp, dict):
            if 'error' in resp:
                return {"success": False, "error": resp['error'], "error_description": resp.get("error_description", "")}
            if 'result' in resp:
                return {"success": True, "result": resp['result']}
            return {"success": True, "result": resp}
        if resp is True:
            return {"success": True, "result": True}
        return {"success": False, "error": "update_failed", "error_description": "Update returned false/none"}

    try:
        if entity == 'deal':
            c_keys = {'PHONE', 'EMAIL', 'PHONE_VALUE', 'EMAIL_VALUE', 'NAME', 'LAST_NAME', 'SECOND_NAME'}
            contact_payload = {}
            deal_payload = {}

            for k, v in fields.items():
                if k in c_keys or 'PHONE' in k or 'EMAIL' in k:
                    contact_payload[k] = v
                else:
                    deal_payload[k] = v

            res_deal = {"success": True, "result": True}
            res_contact = {"success": True, "result": True}

            if deal_payload:
                res_deal = _normalize(bx.update_single(item_id, 'deal', deal_payload))
                if not res_deal.get("success"):
                    return res_deal

            if contact_payload:
                deal_data = bx.get_single(item_id, 'deal')
                cid = deal_data.get('CONTACT_ID') if deal_data else None
                if cid:
                    res_contact = _normalize(bx.update_single(cid, 'contact', contact_payload))
                else:
                    return {"success": False, "error": "no_contact", "error_description": f"Deal {item_id} has no linked Contact."}

            if not res_contact.get("success"):
                return res_contact

            return res_deal

        return _normalize(bx.update_single(item_id, entity, fields))
    except Exception as e:
        return {"success": False, "error": "exception", "error_description": str(e)}


# ---------------------
# NEW: Fetch fields metadata for frontend
# ---------------------
def normalize_enums(raw_enums: Dict[str, Any]):
    dict_map = {}
    list_map = {}
    for field_code, enums in (raw_enums or {}).items():
        if isinstance(enums, dict):
            dict_map[field_code] = enums
            list_map[field_code] = [{"ID": k, "VALUE": v} for k, v in enums.items()]
        elif isinstance(enums, list):
            dict_map[field_code] = {str(e["ID"]): e["VALUE"] for e in enums}
            list_map[field_code] = enums
        else:
            dict_map[field_code] = {}
            list_map[field_code] = []
    return {"dict": dict_map, "list": list_map}


@router.get("/fields/{entity}")
def get_fields(entity: str, base: str = Query(...)):
    bx = BitrixWrapper(base)
    try:
        meta = bx.get_fields(entity)
        if not meta:
            raise HTTPException(status_code=404, detail="Entity fields not found")

        code_to_label = meta.get("code_to_label") or {}
        code_to_type = meta.get("code_to_type") or {}
        raw_enums = meta.get("enums") or {}
        normalized = normalize_enums(raw_enums)

        return {
            "success": True,
            "entity": entity,
            "code_to_label": code_to_label,
            "code_to_type": code_to_type,
            "enums": normalized["dict"],
            "enums_list": normalized["list"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch fields: {str(e)}")


@router.get("/fields/{entity}/duplicates")
def get_duplicate_fields(entity: str, base: str = Query(...)):
    bx = BitrixWrapper(base)
    try:
        fields = bx.get_duplicate_fields(entity)
        return {"success": True, "entity": entity, "result": fields or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch duplicate fields: {str(e)}")
