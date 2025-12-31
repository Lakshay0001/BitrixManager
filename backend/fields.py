# backend/fields.py
from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any
from .bitrix_wrapper import BitrixWrapper
from .helpers import FLATTENED_FIELDS

router = APIRouter()


@router.get("/fields/{entity}")
def fields(entity: str, base: str = Query(...)):
    """Fetch field definitions for an entity including labels, types, and enumerations."""
    bx = BitrixWrapper(base)
    ok, res = bx.fetch_field_definitions(entity)
    if not ok:
        raise HTTPException(status_code=400, detail=res)

    for key in ["code_to_label", "label_to_code", "code_to_type", "enums"]:
        if key not in res:
            res[key] = {}

    # --- Fetch userfield IDs ---
    ok2, userfields = bx.fetch_userfields(entity)
    uid_map = {uf["code"]: uf["id"] for uf in userfields} if ok2 else {}

    # --- Add ID mapping to res ---
    id_map = {}
    for code in res["code_to_label"].keys():
        id_map[code] = uid_map.get(code, "")

    # Add flattened fields if deal
    if entity == 'deal':
        CONTACT_FIELDS = [
            ("NAME", "Contact Name (First)", "string"),
            ("LAST_NAME", "Contact Last Name", "string"),
            ("PHONE", "Contact Phone", "phone"),
            ("EMAIL", "Contact Email", "email"),
            ("PHONE_VALUE", "Contact Phone (Value)", "string"),
            ("EMAIL_VALUE", "Contact Email (Value)", "string"),
        ]
        for code, label, ftype in CONTACT_FIELDS:
            if code not in res["code_to_label"]:
                res["code_to_label"][code] = label
                res["label_to_code"][label] = code
                res["code_to_type"][code] = ftype
                id_map[code] = uid_map.get(code, "")

    # Add custom flattened fields
    for code, label in FLATTENED_FIELDS:
        res["code_to_label"][code] = label
        res["label_to_code"][label] = code
        res["code_to_type"][code] = "string"
        id_map[code] = uid_map.get(code, "")

    res["code_to_id"] = id_map

    return res

@router.get("/users")
def get_all_users(base: str = Query(...)):
    """Fetch all Bitrix users with ID, NAME, and LOGIN for user-field selection dialogs."""
    bx = BitrixWrapper(base)
    users = bx.fetch_all_users()
    return {"result": users}