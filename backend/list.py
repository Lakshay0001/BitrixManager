# backend/list.py
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from .bitrix_wrapper import BitrixWrapper
from .helpers import fix_date

# Prefix for API versioning
router = APIRouter()


@router.get("/list/{entity}")
def list_items(
    entity: str,
    base: str = Query(...),
    from_created: Optional[str] = None,
    to_created: Optional[str] = None,
    from_modified: Optional[str] = None,
    to_modified: Optional[str] = None,
    select: Optional[str] = None,
):
    """
    Fetch all items for an entity with optional filtering by date and fields.
    Returns uniform response: {"result": [...], "total": N}
    """
    bx = BitrixWrapper(base)
    params = {}

    # FILTERS
    if from_created:
        params["filter[>=DATE_CREATE]"] = fix_date(from_created, end=False)
    if to_created:
        params["filter[<=DATE_CREATE]"] = fix_date(to_created, end=True)
    if from_modified:
        params["filter[>=DATE_MODIFY]"] = fix_date(from_modified, end=False)
    if to_modified:
        params["filter[<=DATE_MODIFY]"] = fix_date(to_modified, end=True)

    # SELECT FIELDS
    selected_fields = [s.strip() for s in (select or "").split(",") if s.strip()]
    required = set(selected_fields)
    required.update(["DATE_CREATE", "DATE_MODIFY"])

    # Always request PHONE/EMAIL if needed for flattened fields
    if any(f in selected_fields for f in ["PHONE_VALUE", "PHONE_TYPE", "PHONE"]):
        required.add("PHONE")
    if any(f in selected_fields for f in ["EMAIL_VALUE", "EMAIL_TYPE", "EMAIL"]):
        required.add("EMAIL")

    if entity == "deal":
        required.add("CONTACT_ID")
        if any(f in selected_fields for f in ["NAME", "LAST_NAME"]):
            required.update(["NAME", "LAST_NAME"])

    if not required:
        if entity == "lead":
            required = {"ID", "TITLE", "NAME", "PHONE", "EMAIL", "SOURCE_ID"}
        elif entity == "deal":
            required = {"ID", "TITLE", "NAME", "CONTACT_ID", "SOURCE_ID"}

    params["select[]"] = list(required)

    rows = bx.fetch_all(params, entity)

    # Flatten deal contacts (PHONE/EMAIL/NAME)
    if entity == "deal":
        for row in rows:
            cid = row.get("CONTACT_ID", "")
            row["PHONE"] = []
            row["EMAIL"] = []
            row["PHONE_VALUE"] = ""
            row["PHONE_TYPE"] = ""
            row["EMAIL_VALUE"] = ""
            row["EMAIL_TYPE"] = ""
            row["NAME"] = row.get("TITLE", "")
            row["LAST_NAME"] = ""

            if cid:
                contact = bx.get_single(cid, "contact")
                if contact:
                    # Merge contact info
                    row["NAME"] = (
                        f"{contact.get('NAME', '')} {contact.get('LAST_NAME', '')}".strip()
                    )
                    row["LAST_NAME"] = contact.get("LAST_NAME", "")
                    row["PHONE"] = contact.get("PHONE", [])
                    row["EMAIL"] = contact.get("EMAIL", [])
                    if row["PHONE"]:
                        row["PHONE_VALUE"] = row["PHONE"][0]["VALUE"]
                        row["PHONE_TYPE"] = row["PHONE"][0]["VALUE_TYPE"]
                    if row["EMAIL"]:
                        row["EMAIL_VALUE"] = row["EMAIL"][0]["VALUE"]
                        row["EMAIL_TYPE"] = row["EMAIL"][0]["VALUE_TYPE"]

    return {"success": True, "result": rows, "total": len(rows)}
