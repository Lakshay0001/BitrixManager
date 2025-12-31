# backend/update.py
from fastapi import APIRouter, Query, HTTPException
from typing import Dict, Any
from .bitrix_wrapper import BitrixWrapper

router = APIRouter()


@router.post("/update/{entity}/{item_id}")
def update_item(entity: str, item_id: str, base: str = Query(...), payload: Dict[str, Any] = {}):
    """Update an item for an entity. For deals, splits updates between deal and linked contact.

    This endpoint normalizes responses to always return either `{'result': ...}` on success
    or `{'error': 'msg', 'error_description': '...'} ` on failure.
    """
    bx = BitrixWrapper(base)
    fields = payload.get("fields") if "fields" in payload else payload

    def _normalize(resp):
        # If BitrixWrapper already returned a dict with result/error, handle it
        if isinstance(resp, dict):
            if 'error' in resp:
                # Pass error through as-is
                return resp
            if 'result' in resp:
                # Flatten: return the result, don't nest it further
                return {'result': resp['result']}
            # Wrap generic dict as result
            return {'result': resp}
        # If plain truthy/falsey value, wrap accordingly
        if resp is True:
            return {'result': True}
        if resp is False or resp is None:
            return {'error': 'update_failed', 'error_description': 'Update returned false/none'}
        # Any other value, include as result
        return {'result': str(resp)}

    if entity == 'deal':
        c_keys = {'PHONE', 'EMAIL', 'PHONE_VALUE', 'EMAIL_VALUE', 'NAME', 'LAST_NAME', 'SECOND_NAME'}
        contact_payload = {}
        deal_payload = {}

        for k, v in fields.items():
            if k in c_keys or 'PHONE' in k or 'EMAIL' in k:
                contact_payload[k] = v
            else:
                deal_payload[k] = v

        res_deal = {'result': True}
        res_contact = {'result': True}

        if deal_payload:
            res_deal = _normalize(bx.update_single(item_id, 'deal', deal_payload))
            if 'error' in res_deal:
                return res_deal

        if contact_payload:
            deal_data = bx.get_single(item_id, 'deal')
            cid = deal_data.get('CONTACT_ID') if deal_data else None
            if cid:
                res_contact = _normalize(bx.update_single(cid, 'contact', contact_payload))
            else:
                return {"error": "no_contact", "error_description": f"Deal {item_id} has no linked Contact."}

        if 'error' in res_contact:
            return res_contact

        return res_deal

    return _normalize(bx.update_single(item_id, entity, fields))
