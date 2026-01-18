# backend/fields.py
from fastapi import APIRouter, HTTPException, Query
from typing import Dict
from collections import defaultdict
from .bitrix_wrapper import BitrixWrapper
from .helpers import FLATTENED_FIELDS

# Prefix for API versioning
router = APIRouter()


@router.get("/fields/{entity}")
def fields(entity: str, base: str = Query(...)):
    """
    Fetch field definitions for an entity including:
    - labels
    - types
    - enumerations
    - flattened fields for deals
    """
    bx = BitrixWrapper(base)
    ok, res = bx.fetch_field_definitions(entity)
    if not ok:
        raise HTTPException(status_code=400, detail=res)

    # Ensure keys exist
    for key in ["code_to_label", "label_to_code", "code_to_type", "enums"]:
        if key not in res:
            res[key] = {}

    # Fetch userfield IDs
    ok2, userfields = bx.fetch_userfields(entity)
    uid_map = {uf["code"]: uf["id"] for uf in userfields} if ok2 else {}

    # Add code -> userfield ID mapping
    id_map = {code: uid_map.get(code, "") for code in res["code_to_label"].keys()}

    # Add flattened fields for deals
    if entity == "deal":
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

    # Attach code -> ID map
    res["code_to_id"] = id_map

    # ✅ Return in uniform API structure
    return {"success": True, "entity": entity, "result": res}


@router.get("/users")
def get_all_users(base: str = Query(...)):
    """
    Fetch all Bitrix users with ID, NAME, LOGIN
    for use in user-field selection dialogs
    """
    bx = BitrixWrapper(base)
    users = bx.fetch_all_users()
    return {"success": True, "result": users}


@router.get("/fields/{entity}/duplicates")
def get_duplicates(entity: str, base: str = Query(...)):
    """
    Fetch duplicate fields info for an entity.
    Returns uniform response: {"result": [...], "total": N}
    """
    bx = BitrixWrapper(base)

    ok, field_defs = bx.fetch_field_definitions(entity)
    if not ok:
        raise HTTPException(status_code=400, detail="Could not fetch fields")

    code_to_label = field_defs.get("code_to_label", {})
    code_to_type = field_defs.get("code_to_type", {})
    enums = field_defs.get("enums", {})

    ok2, userfields = bx.fetch_userfields(entity)
    uf_map = (
        {
            uf["code"]: {"id": uf.get("id"), "list": uf.get("list") or []}
            for uf in userfields
        }
        if ok2
        else {}
    )

    dup_map = defaultdict(list)
    for code, label in code_to_label.items():
        ftype = code_to_type.get(code, "unknown")

        enum_list = []
        if code in uf_map and uf_map[code]["list"]:
            enum_list = [{"VALUE": item.get("VALUE")} for item in uf_map[code]["list"]]
        elif code in enums:
            enum_list = [{"VALUE": v} for v in enums[code].values()]

        dup_map[label].append(
            {
                "code": code,
                "label": label,
                "type": ftype,
                "id": uf_map.get(code, {}).get("id"),
                "list": enum_list,
            }
        )

    duplicates = [
        {"label": lbl, "fields": items}
        for lbl, items in dup_map.items()
        if len(items) > 1
    ]

    return {"success": True, "result": duplicates, "total": len(duplicates)}
