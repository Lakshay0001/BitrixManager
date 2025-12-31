# backend/users.py
"""User resolution and caching service for Bitrix24."""
from typing import Dict, Any, Optional
import time


class UserResolver:
    """Handles user ID to name resolution with caching."""
    
    def __init__(self, bitrix_wrapper):
        self.bx = bitrix_wrapper
        self._user_cache = {}
        self._last_bulk_fetch = 0
        self._bulk_users = []
        self.BULK_FETCH_INTERVAL = 300  # 5 minutes
    
    def get_user_name(self, user_id: str) -> str:
        """Get user name from ID, with caching. Fallback order: full name -> email -> login -> id"""
        if not user_id:
            return ''
        
        sid = str(user_id)
        if sid in self._user_cache:
            return self._user_cache[sid]
        
        # Try to populate cache from bulk user list (workaround for differing API shapes)
        try:
            now = time.time()
            if (not self._user_cache) or (now - self._last_bulk_fetch > self.BULK_FETCH_INTERVAL):
                users = []
                try:
                    users = self.bx.fetch_all_users() or []
                except Exception:
                    users = []
                for u in users:
                    uid = str(u.get('ID'))
                    first = (u.get('NAME') or '').strip()
                    login = (u.get('LOGIN') or '').strip()
                    email = (u.get('EMAIL') or '').strip() if isinstance(u.get('EMAIL'), str) else ''
                    # Fallback order: full name -> email -> login -> id
                    display = first or email or login or uid
                    if uid:
                        self._user_cache[uid] = display
                self._last_bulk_fetch = now
        except Exception:
            pass

        # After bulk fetch, check cache again
        if sid in self._user_cache:
            return self._user_cache[sid]

        # Fallback: Fetch from Bitrix single-user call
        try:
            ok, resp = self.bx._call('user.get', {'ID': sid}, 'get')
        except Exception:
            return sid
        if not ok:
            return sid
        
        result = resp.get('result')
        if isinstance(result, list) and len(result) > 0:
            u = result[0]
            first = (u.get('NAME', '') or '').strip()
            last = (u.get('LAST_NAME', '') or '').strip()
            login = (u.get('LOGIN', '') or '').strip()
            email = (u.get('EMAIL', '') or '').strip()
            full = (first + ' ' + last).strip()
            # Fallback order: full name -> email -> login -> id
            display = full or email or login or sid
            self._user_cache[sid] = display
            return display

        if isinstance(result, dict):
            u = result
            first = (u.get('NAME', '') or '').strip()
            last = (u.get('LAST_NAME', '') or '').strip()
            login = (u.get('LOGIN', '') or '').strip()
            email = (u.get('EMAIL', '') or '').strip()
            full = (first + ' ' + last).strip()
            # Fallback order: full name -> email -> login -> id
            display = full or email or login or sid
            self._user_cache[sid] = display
            return display

        return sid
    
    def resolve_user_fields_in_record(self, rec: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Resolve all user ID fields in a record to names."""
        if not rec or not isinstance(rec, dict):
            return rec
        
        # Common user-id field names in Bitrix (leads, deals, contacts)
        user_keys = [
            'CREATED_BY', 'CREATED_BY_ID', 'MODIFIED_BY', 'MODIFIED_BY_ID',
            'ASSIGNED_BY_ID', 'ASSIGNED_BY', 'RESPONSIBLE_ID', 'RESPONSIBLE_BY',
            'MODIFY_BY', 'MODIFY_BY_ID'
        ]
        
        out = dict(rec)
        for k in list(out.keys()):
            # Check if key matches user field patterns
            is_user_field = (
                k.upper() in (x.upper() for x in user_keys) or 
                k.endswith('_BY') or 
                k.endswith('_BY_ID') or 
                (k.endswith('_ID') and any(x in k.upper() for x in ['BY', 'RESPONS', 'ASSIGN']))
            )
            
            if is_user_field:
                val = out.get(k)
                if val is None or val == '':
                    continue
                
                # value can be int, str, or dict
                uid = None
                if isinstance(val, dict):
                    # If the record already includes name/email/login, prefer those
                    first = (val.get('NAME') or val.get('name') or '').strip()
                    last = (val.get('LAST_NAME') or val.get('last_name') or '').strip()
                    email = ''
                    e = val.get('EMAIL') or val.get('email')
                    if isinstance(e, list) and e:
                        # EMAIL may be list or string
                        email = e[0] if isinstance(e[0], str) else (e[0].get('VALUE') if isinstance(e[0], dict) else '')
                    elif isinstance(e, str):
                        email = e
                    login = (val.get('LOGIN') or val.get('login') or '').strip()

                    # prefer available display fields already present in record

                    full = (first + ' ' + last).strip()
                    if full:
                        out[k] = full
                        continue
                    if email:
                        out[k] = email
                        continue
                    if login:
                        out[k] = login
                        continue

                    uid = val.get('ID') or val.get('id')
                else:
                    uid = val

                if uid is not None and str(uid).strip() != '' and str(uid) != '0':
                    try:
                        name = self.get_user_name(str(uid))
                        out[k] = name
                    except Exception:
                        out[k] = uid
        
        return out

    def preload_users(self) -> None:
        """Preload users into the cache if stale or empty.

        This is intended to be called once before bulk record processing
        to avoid many individual user lookups.
        """
        try:
            now = time.time()
            if self._user_cache and (now - self._last_bulk_fetch) < self.BULK_FETCH_INTERVAL:
                return
            users = []
            try:
                users = self.bx.fetch_all_users() or []
            except Exception:
                users = []
            for u in users:
                uid = str(u.get('ID'))
                # NAME from fetch_all_users is already NAME+LAST_NAME concatenated
                name = (u.get('NAME') or '').strip()
                email = (u.get('EMAIL') or '').strip()
                login = (u.get('LOGIN') or '').strip()
                # Fallback order: full name -> email -> login -> id
                display = name or email or login or uid
                if uid:
                    self._user_cache[uid] = display
            self._last_bulk_fetch = time.time()
        except Exception:
            # noop on preload errors
            return
