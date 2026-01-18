# backend/users.py
from fastapi import APIRouter, Query
from typing import Optional, List

# Prefix for API versioning
router = APIRouter()


@router.get("/users/resolve")
def resolve_user(
    user_id: Optional[str] = Query(None, description="Single user ID to resolve"),
    ids: Optional[str] = Query(
        None, description="Comma-separated user IDs to resolve in bulk"
    ),
    base: str = Query(..., description="Bitrix base URL or token"),
):
    # Import inside function to avoid circular import
    from .bitrix_wrapper import BitrixWrapper
    from .users import UserResolver

    bx = BitrixWrapper(base)
    resolver = UserResolver(bx)

    result = []

    if user_id:
        name = resolver.get_user_name(user_id)
        result.append({"id": user_id, "name": name})

    if ids:
        id_list = [s.strip() for s in ids.split(",") if s.strip()]
        for uid in id_list:
            name = resolver.get_user_name(uid)
            result.append({"id": uid, "name": name})

    if not result:
        return {"success": False, "message": "No user IDs provided", "result": []}

    return {"success": True, "result": result}


@router.get("/users/preload")
def preload_users(base: str = Query(..., description="Bitrix base URL or token")):
    # Import inside function to avoid circular import
    from .bitrix_wrapper import BitrixWrapper
    from .users import UserResolver

    bx = BitrixWrapper(base)
    resolver = UserResolver(bx)
    resolver.preload_users()
    total = len(resolver._user_cache)
    return {"success": True, "total": total}


@router.get("/users/search")
def user_search(
    base: str = Query(..., description="Bitrix base URL or token"),
    search: Optional[str] = Query(None, description="Search by first or last name"),
):
    """
    Full user listing with search support.
    """
    from .bitrix_wrapper import BitrixWrapper

    bx = BitrixWrapper(base)

    users = bx.fetch_all_users_full()
    departments = bx.fetch_departments()  # fetch mapping {id: name}
    results = []

    for u in users:
        full_name = f"{u.get('NAME','')} {u.get('LAST_NAME','')}".strip()

        if search and search.lower() not in full_name.lower():
            continue

        # Map department IDs to names
        dept_ids = u.get("UF_DEPARTMENT") or []
        dept_names = [departments.get(str(d), f"-") for d in dept_ids]

        results.append(
            {
                "id": u.get("ID"),
                "name": u.get("NAME"),
                "last_name": u.get("LAST_NAME"),
                "active": u.get("ACTIVE") in ("Y", "1", 1, "true"),
                "email": u.get("EMAIL"),
                "gender": u.get("PERSONAL_GENDER"),
                "photo": u.get("PERSONAL_PHOTO"),
                "mobile": u.get("PERSONAL_MOBILE"),
                "work_phone": u.get("WORK_PHONE"),
                "department": dept_names,
            }
        )

    return {
        "success": True,
        "total": len(results),
        "result": results,
    }

class UserResolver:
    def __init__(self, bx):
        self.bx = bx
        self._user_cache = {}

    def preload_users(self):
        """Fetch all users from Bitrix and cache them."""
        users = self.bx.fetch_all_users()
        self._user_cache = {str(u["ID"]): u["NAME"] for u in users}

    def get_user_name(self, user_id: str) -> str:
        """Return cached name or fallback."""
        return self._user_cache.get(str(user_id), f"User {user_id}")

    def resolve_user_fields_in_record(self, record: dict) -> dict:
        """Replace user ID fields with names in a record."""
        for k in ["ASSIGNED_BY_ID", "CREATED_BY_ID", "MODIFY_BY_ID"]:
            if k in record and record[k]:
                record[k + "_NAME"] = self.get_user_name(str(record[k]))
        return record
