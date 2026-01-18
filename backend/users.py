# backend/users.py
from fastapi import APIRouter, Query
from typing import Optional, List

# Prefix for API versioning
router = APIRouter()


@router.get("/users/resolve")
def resolve_user(
    user_id: Optional[str] = Query(None, description="Single user ID to resolve"),
    ids: Optional[str] = Query(None, description="Comma-separated user IDs to resolve in bulk"),
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
