# backend/template.py
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
import io
from bitrix_wrapper import BitrixWrapper

router = APIRouter()


@router.get("/template/{entity}")
def download_template(entity: str, base: str = Query(...)):
    """Download an Excel template for an entity with all fields and enumerations."""
    bx = BitrixWrapper(base)
    ok, fields = bx.fetch_field_definitions(entity)

    if not ok:
        raise HTTPException(status_code=400, detail="Could not fetch fields")

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

    # Build horizontal Excel
    wb = Workbook()
    ws = wb.active
    ws.title = f"{entity.upper()} Template"

    # Row 1: all labels horizontally
    labels_row = list(code_to_label.values()) + list(extra_labels.values())
    ws.append(labels_row)

    # Row 2: all enum values horizontally
    enum_values_row = []

    for code in list(code_to_label.keys()) + list(extra_labels.keys()):
        if code in enums:
            allowed_values = ", ".join(enums[code].values())
        else:
            allowed_values = ""
        enum_values_row.append(allowed_values)

    ws.append(enum_values_row)

    # Create stream
    file_stream = io.BytesIO()
    wb.save(file_stream)
    file_stream.seek(0)

    return StreamingResponse(
        file_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename={entity}_template.xlsx"
        }
    )


@router.post("/template/custom/{entity}")
def custom_template(entity: str, base: str = Query(...), payload: dict = {}):
    """Download a custom Excel template for an entity with selected fields."""
    selected_fields = payload.get("fields", [])

    bx = BitrixWrapper(base)
    ok, fields = bx.fetch_field_definitions(entity)

    if not ok:
        raise HTTPException(status_code=400, detail="Could not fetch fields")

    code_to_label = fields.get("code_to_label", {})
    enums = fields.get("enums", {})

    # Excel
    wb = Workbook()
    ws = wb.active
    ws.title = f"{entity.upper()} Custom Template"

    labels_row = []
    enum_values_row = []

    for code in selected_fields:
        label = code_to_label.get(code, code)
        labels_row.append(label)

        if code in enums:
            enum_values_row.append(", ".join(enums[code].values()))
        else:
            enum_values_row.append("")

    ws.append(labels_row)
    ws.append(enum_values_row)

    file_stream = io.BytesIO()
    wb.save(file_stream)
    file_stream.seek(0)

    return StreamingResponse(
        file_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={entity}_custom_template.xlsx"}
    )
