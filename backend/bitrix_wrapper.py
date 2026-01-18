# backend/bitrix_wrapper.py
import requests
import time
from typing import Dict, Any, List, Tuple, Optional
import pandas as pd


def ensure_slash(u: str) -> str:
    """Ensure the base URL ends with a slash."""
    if u.endswith('/'):
        return u
    return u + '/'


class BitrixWrapper:
    def __init__(self, base: str):
        self.base = ensure_slash(base)
        self._user_cache = {}

        # Delay import to break circular dependency
        from .users import UserResolver
        self.user_resolver = UserResolver(self)

    def _call(self, method_path: str, params=None, http_method='get'):
        """Call Bitrix API."""
        method = method_path if method_path.endswith('.json') else method_path + '.json'
        url = self.base + method
        try:
            if http_method.lower() == 'get':
                r = requests.get(url, params=params, timeout=30)
            else:
                r = requests.post(url, json=params, timeout=30)
        except Exception as e:
            return False, {'error': 'network_error', 'error_description': str(e)}
        try:
            return True, r.json()
        except Exception:
            return False, {'error': 'invalid_json', 'error_description': r.text[:500]}

    def fetch_field_definitions(self, entity: str) -> Tuple[bool, Dict[str, Any]]:
        """Fetch field definitions for a CRM entity."""
        ok, data = self._call(f'crm.{entity}.fields', None, 'get')
        if not ok or 'result' not in data:
            return False, data

        fields = data['result']
        code_to_label, label_to_code, code_to_type, seen = {}, {}, {}, {}
        enums = {}

        for code, info in fields.items():
            # Determine label
            label = ''
            if isinstance(info, dict):
                label = (info.get('listLabel') or info.get('formLabel') or
                         info.get('filterLabel') or info.get('title') or '').strip()
                if not label or label.upper().startswith(code.upper()):
                    label = code
            else:
                label = str(info) or code

            base_label = label
            seen.setdefault(base_label, 0)
            seen[base_label] += 1

            code_to_label[code] = base_label
            if base_label not in label_to_code:
                label_to_code[base_label] = code

            # Determine type
            f_type = 'string'
            if isinstance(info, dict):
                f_type = info.get('type', 'string')
            code_to_type[code] = f_type
            if f_type == 'user':
                code_to_type[code] = 'user'

            # Handle enumerations
            if f_type == 'enumeration' and isinstance(info, dict) and 'items' in info:
                try:
                    items = info.get('items') or []
                    enum_map = {}
                    for it in items:
                        ek = it.get('ID') if isinstance(it, dict) else None
                        ev = it.get('VALUE') if isinstance(it, dict) else None
                        if ek is not None and ev is not None:
                            enum_map[str(ek)] = ev
                    if enum_map:
                        enums[code] = enum_map
                except Exception:
                    pass

        # Default mappings
        code_to_label.setdefault('PHONE', 'Phone')
        code_to_label.setdefault('EMAIL', 'Email')
        code_to_label.setdefault('SOURCE', 'Source')
        label_to_code.setdefault('Phone', 'PHONE')
        label_to_code.setdefault('Email', 'EMAIL')
        label_to_code.setdefault('Source', 'SOURCE')
        code_to_type.setdefault('PHONE', 'string')
        code_to_type.setdefault('EMAIL', 'string')

        return True, {
            'code_to_label': code_to_label,
            'label_to_code': label_to_code,
            'code_to_type': code_to_type,
            'enums': enums
        }

    def fetch_userfields(self, entity):
        """Fetch user fields for an entity."""
        ok, res = self._call(f'crm.{entity}.userfield.list', None, 'get')
        if not ok or "result" not in res:
            return False, []

        fields = []
        for f in res["result"]:
            fields.append({
                "id": f.get("ID"),
                "code": f.get("FIELD_NAME"),
                "label": f.get("EDIT_FORM_LABEL") or f.get("LIST_COLUMN_LABEL") or f.get("FIELD_NAME"),
                "type": f.get("USER_TYPE_ID"),
                "list": f.get("LIST", [])
            })
        return True, fields

    def fetch_all_users(self) -> List[Dict[str, Any]]:
        """Fetch all users from Bitrix."""
        out = []
        p = {'start': 0}
        while True:
            ok, resp = self._call('user.get', p, 'get')
            if not ok or 'result' not in resp:
                return out

            batch = resp['result']
            if isinstance(batch, list):
                for user in batch:
                    out.append({
                        'ID': user.get('ID'),
                        'NAME': (user.get('NAME','') or '') + ' ' + (user.get('LAST_NAME','') or ''),
                        'EMAIL': user.get('EMAIL',''),
                        'LOGIN': user.get('LOGIN','')
                    })
            if 'next' in resp:
                p['start'] = resp['next']
                time.sleep(0.02)
                continue
            break
        return out

    def delete_single(self, item_id, entity):
        """Delete a single entity item."""
        if entity == 'userfield':
            ok, resp = self._call('crm.lead.userfield.delete', {"id": item_id}, 'post')
        else:
            ok, resp = self._call(f'crm.{entity}.delete', {"id": item_id}, 'post')
        return resp if ok else {'error': 'network'}

    def fetch_all(self, params: Dict[str, Any], entity: str) -> List[Dict[str, Any]]:
        """Fetch all records from an entity, resolving user fields."""
        if params is None:
            params = {}
        method = f'crm.{entity}.list'
        if not any(k.startswith('filter') for k in params.keys()):
            params['filter'] = []

        if 'select[]' not in params:
            params['select[]'] = ["ID","TITLE","NAME","PHONE","EMAIL","SOURCE",
                                   "ASSIGNED_BY_ID","CREATED_BY_ID","MODIFY_BY_ID"]

        # Preload users once
        try:
            self.user_resolver.preload_users()
        except Exception:
            pass

        p = dict(params)
        p['start'] = 0
        out = []
        while True:
            ok, resp = self._call(method, p, 'get')
            if not ok or 'result' not in resp:
                return out

            current_batch = resp['result']
            for row in current_batch:
                row['PHONE_VALUE'] = row.get('PHONE', [{}])[0].get('VALUE', '') if row.get('PHONE') else ''
                row['PHONE_TYPE'] = row.get('PHONE', [{}])[0].get('VALUE_TYPE', '') if row.get('PHONE') else ''
                row['EMAIL_VALUE'] = row.get('EMAIL', [{}])[0].get('VALUE', '') if row.get('EMAIL') else ''
                row['EMAIL_TYPE'] = row.get('EMAIL', [{}])[0].get('VALUE_TYPE', '') if row.get('EMAIL') else ''

            # Resolve user ID fields
            processed = []
            for row in current_batch:
                try:
                    processed.append(self.user_resolver.resolve_user_fields_in_record(row))
                except Exception:
                    processed.append(row)
            out.extend(processed)

            if 'next' in resp:
                p['start'] = resp['next']
                time.sleep(0.02)
                continue
            break
        return out

    def get_single(self, idv: str, entity: str) -> Optional[Dict[str, Any]]:
        ok, resp = self._call(f'crm.{entity}.get', {'id': idv}, 'get')
        if not ok:
            return None
        rec = resp.get('result')
        try:
            return self.user_resolver.resolve_user_fields_in_record(rec)
        except Exception:
            return rec

    def get_user_name(self, user_id: str) -> str:
        return self.user_resolver.get_user_name(user_id)

    def update_single(self, idv: str, entity: str, fields: Dict[str, Any]) -> Dict[str, Any]:
        ok, resp = self._call(f'crm.{entity}.update', {'id': idv, 'fields': fields}, 'post')
        return resp if ok else {'error': 'network'}

    def to_dataframe(self, params: Dict[str, Any], entity: str, selected_fields: Optional[List[str]] = None) -> pd.DataFrame:
        data = self.fetch_all(params, entity)
        if not data:
            return pd.DataFrame()
        df = pd.DataFrame(data)
        if selected_fields:
            df = df[[f for f in selected_fields if f in df.columns]]
        return df
