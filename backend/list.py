# backend/list.py
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, Dict, Any
from collections import defaultdict
from bitrix_wrapper import BitrixWrapper
from helpers import fix_date, FLATTENED_FIELDS

router = APIRouter()


@router.get("/list/{entity}")
def list_items(
    entity: str,
    base: str = Query(...),
    # NEW PARAMETERS
    from_created: Optional[str] = None,
    to_created: Optional[str] = None,
    from_modified: Optional[str] = None,
    to_modified: Optional[str] = None,
    select: Optional[str] = None
):
    """Fetch all items for an entity with optional filtering by dates and fields."""
    bx = BitrixWrapper(base)
    params = {}

    # APPLY DATE CREATE FILTERS
    if from_created:
        params["filter[>=DATE_CREATE]"] = fix_date(from_created, end=False)

    if to_created:
        params["filter[<=DATE_CREATE]"] = fix_date(to_created, end=True)

    # APPLY DATE MODIFY FILTERS
    if from_modified:
        params["filter[>=DATE_MODIFY]"] = fix_date(from_modified, end=False)

    if to_modified:
        params["filter[<=DATE_MODIFY]"] = fix_date(to_modified, end=True)

    # FIELD SELECT HANDLING
    selected_fields = []
    if select:
        selected_fields = [s.strip() for s in select.split(",") if s.strip()]

    required = set(selected_fields)
    required.add("DATE_CREATE")
    required.add("DATE_MODIFY")

    # Ensures 'PHONE' and 'EMAIL' are requested from Bitrix if flattened fields are selected
    if any(f in selected_fields for f in ['PHONE_VALUE', 'PHONE_TYPE', 'PHONE']):
        required.add('PHONE')

    if any(f in selected_fields for f in ['EMAIL_VALUE', 'EMAIL_TYPE', 'EMAIL']):
        required.add('EMAIL')

    # Ensures 'NAME' is requested from Bitrix to get Contact Name in Deal
    if any(f in selected_fields for f in ['NAME', 'LAST_NAME']) and entity == 'deal':
        required.add('NAME')
        required.add('LAST_NAME')

    if entity == 'deal':
        required.add('CONTACT_ID')  # Required to fetch Contact info

    if not required:
        if entity == 'lead':
            required = {"ID", "TITLE", "NAME", "PHONE", "EMAIL", "SOURCE_ID"}
        elif entity == 'deal':
            required = {"ID", "TITLE", "NAME", "CONTACT_ID", "SOURCE_ID"}

    params["select[]"] = list(required)

    rows = bx.fetch_all(params, entity)

    # Deal flattening fix for Contact Name, Phone, and Email
    if entity == 'deal':
        for row in rows:
            cid = row.get("CONTACT_ID")

            # Initialize fields for consistency/safety
            row["PHONE"] = []
            row["EMAIL"] = []
            row["PHONE_VALUE"] = ""
            row["PHONE_TYPE"] = ""
            row["EMAIL_VALUE"] = ""
            row["EMAIL_TYPE"] = ""
            # Use Deal Title as initial/fallback name
            row["NAME"] = row.get("TITLE", "")
            row["LAST_NAME"] = ""

            if cid:
                contact = bx.get_single(cid, "contact")
                if contact:
                    # FIX 1: Sync Contact Name/Last_Name to Deal Row
                    contact_name = contact.get("NAME", "")
                    contact_last_name = contact.get("LAST_NAME", "")

                    if contact_name or contact_last_name:
                        # Overwrite Deal NAME with Contact Full Name
                        row["NAME"] = f"{contact_name} {contact_last_name}".strip()
                        row["LAST_NAME"] = contact_last_name

                    phones = contact.get("PHONE", [])
                    emails = contact.get("EMAIL", [])

                    # FIX 2: Sync full PHONE/EMAIL arrays to Deal Row
                    # (Used by frontend's renderListCellValue logic)
                    row["PHONE"] = phones
                    row["EMAIL"] = emails

                    # Sync flattened values (for display consistency/redundancy)
                    row["PHONE_VALUE"] = phones[0]["VALUE"] if phones else ""
                    row["PHONE_TYPE"] = phones[0]["VALUE_TYPE"] if phones else ""
                    row["EMAIL_VALUE"] = emails[0]["VALUE"] if emails else ""
                    row["EMAIL_TYPE"] = emails[0]["VALUE_TYPE"] if emails else ""

    return {"total": len(rows), "result": rows}


@router.get("/fields/{entity}/duplicates")
def get_duplicates(entity: str, base: str = Query(...)):
    """Fetch and analyze duplicate field names for an entity."""
    bx = BitrixWrapper(base)

    # Fetch generic field definitions
    ok, field_defs = bx.fetch_field_definitions(entity)
    if not ok:
        raise HTTPException(status_code=400, detail="Could not fetch fields")

    code_to_label = field_defs.get("code_to_label", {})
    code_to_type = field_defs.get("code_to_type", {})
    enums = field_defs.get("enums", {})

    # Fetch userfields (contains LIST for enumerations)
    ok2, userfields = bx.fetch_userfields(entity)

    # Build ID + LIST mapping
    uf_map = {}
    if ok2:
        for uf in userfields:
            uf_map[uf["code"]] = {
                "id": uf.get("id"),
                "list": uf.get("list") or []
            }

    # Build duplicates
    dup_map = defaultdict(list)

    for code, label in code_to_label.items():
        ftype = code_to_type.get(code, "unknown")

        # Collect enum list (from either source)
        enum_list = []

        # 1) userfield LIST
        if code in uf_map and uf_map[code]["list"]:
            enum_list = [
                {"VALUE": item.get("VALUE")} for item in uf_map[code]["list"]
            ]

        # 2) crm.entity.fields.json (items stored in enums dict)
        elif code in enums:
            enum_list = [
                {"VALUE": v} for v in enums[code].values()
            ]

        dup_map[label].append({
            "code": code,
            "label": label,
            "type": ftype,
            "id": uf_map.get(code, {}).get("id"),
            "list": enum_list
        })

    # Return only duplicate groups
    duplicates = {lbl: items for lbl, items in dup_map.items() if len(items) > 1}
    return {"duplicates": duplicates}
