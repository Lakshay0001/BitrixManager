# backend/template.py
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
import io
from .bitrix_wrapper import BitrixWrapper

router = APIRouter()


@router.get("/template/{entity}")
def download_template(entity: str, base: str = Query(...)):
    """
    Download Excel template for an entity with all fields and enumerations.
    Returns streaming response (Excel file).
    """
    bx = BitrixWrapper(base)
    ok, fields = bx.fetch_field_definitions(entity)
    if not ok:
        return {"success": False, "error": "could_not_fetch_fields"}

    code_to_label = fields.get("code_to_label", {})
    enums = fields.get("enums", {})

    # Extra flattened fields
    extra_labels = {
        "PHONE_VALUE": "Phone",
        "PHONE_TYPE": "Phone Type",
        "EMAIL_VALUE": "Email",
        "EMAIL_TYPE": "Email Type",
    }

    if entity == "deal":
        extra_labels.update({
            "NAME": "Contact First Name",
            "LAST_NAME": "Contact Last Name",
        })

    # Build Excel
    wb = Workbook()
    ws = wb.active
    ws.title = f"{entity.upper()} Template"

    # Row 1: all labels
    labels_row = list(code_to_label.values()) + list(extra_labels.values())
    ws.append(labels_row)

    # Row 2: enums
    enum_values_row = []
    for code in list(code_to_label.keys()) + list(extra_labels.keys()):
        if code in enums:
            enum_values_row.append(", ".join(enums[code].values()))
        else:
            enum_values_row.append("")
    ws.append(enum_values_row)

    # Stream
    file_stream = io.BytesIO()
    wb.save(file_stream)
    file_stream.seek(0)

    return StreamingResponse(
        file_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={entity}_template.xlsx"},
    )


@router.post("/template/custom/{entity}")
def custom_template(entity: str, base: str = Query(...), payload: dict = {}):
    """
    Download a custom Excel template for an entity with selected fields.
    `payload` should contain {"fields": ["FIELD1","FIELD2"]}.
    """
    selected_fields = payload.get("fields", [])
    if not selected_fields:
        return {"success": False, "error": "no_fields_selected"}

    bx = BitrixWrapper(base)
    ok, fields = bx.fetch_field_definitions(entity)
    if not ok:
        return {"success": False, "error": "could_not_fetch_fields"}

    code_to_label = fields.get("code_to_label", {})
    enums = fields.get("enums", {})

    wb = Workbook()
    ws = wb.active
    ws.title = f"{entity.upper()} Custom Template"

    labels_row = []
    enum_values_row = []

    for code in selected_fields:
        label = code_to_label.get(code, code)
        labels_row.append(label)
        enum_values_row.append(", ".join(enums[code].values()) if code in enums else "")

    ws.append(labels_row)
    ws.append(enum_values_row)

    file_stream = io.BytesIO()
    wb.save(file_stream)
    file_stream.seek(0)

    return StreamingResponse(
        file_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={entity}_custom_template.xlsx"},
    )
