# backend/update.py
from fastapi import APIRouter, Query, HTTPException
from typing import Dict, Any
from .bitrix_wrapper import BitrixWrapper

router = APIRouter()


@router.post("/update/{entity}/{item_id}")
def update_item(
    entity: str,
    item_id: str,
    base: str = Query(...),
    payload: Dict[str, Any] = {}
):
    """
    Update an item for an entity.
    - For deals, splits updates between deal and linked contact.
    - Normalized response: 
        {"success": True, "result": ...} on success
        {"success": False, "error": "...", "error_description": "..."} on failure
    """
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
