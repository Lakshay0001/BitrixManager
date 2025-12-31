from collections import defaultdict

FLATTENED_FIELDS = [
    ('PHONE_VALUE', 'Phone'),
    ('PHONE_TYPE', 'Phone Type'),
    ('EMAIL_VALUE', 'Email'),
    ('EMAIL_TYPE', 'Email Type')
]


def fix_date(d: str, end=False):
    # If only YYYY-MM-DD coming
    if len(d) == 10:
        if end:
            return f"{d}T23:59:59+03:00"
        else:
            return f"{d}T00:00:00+03:00"

    # If datetime comes without timezone
    if "T" in d and "+" not in d and "Z" not in d:
        return d + "+03:00"

    # If Z ends → convert Z to +03:00
    if d.endswith("Z"):
        return d[:-1] + "+03:00"

    return d


def flatten_record_helper(rec, entity, bx):
    r = dict(rec)

    if entity == "lead":
        phones = r.get("PHONE", [])
        emails = r.get("EMAIL", [])
        r["PHONE_VALUE"] = phones[0]["VALUE"] if phones else ""
        r["PHONE_TYPE"] = phones[0].get("VALUE_TYPE", "") if phones else ""
        r["EMAIL_VALUE"] = emails[0]["VALUE"] if emails else ""
        r["EMAIL_TYPE"] = emails[0].get("VALUE_TYPE", "") if emails else ""

    if entity == "deal":
        contact_id = r.get("CONTACT_ID")
        r["PHONE"] = []
        r["EMAIL"] = []
        r["PHONE_VALUE"] = ""
        r["PHONE_TYPE"] = ""
        r["EMAIL_VALUE"] = ""
        r["EMAIL_TYPE"] = ""
        r["NAME"] = ""
        r["LAST_NAME"] = ""

        if contact_id:
            contact = bx.get_single(contact_id, "contact")
            if contact:
                r["NAME"] = contact.get("NAME", "")
                r["LAST_NAME"] = contact.get("LAST_NAME", "")
                phones = contact.get("PHONE", [])
                emails = contact.get("EMAIL", [])
                r["PHONE"] = phones
                r["EMAIL"] = emails
                r["PHONE_VALUE"] = phones[0]["VALUE"] if phones else ""
                r["PHONE_TYPE"] = phones[0].get("VALUE_TYPE", "") if phones else ""
                r["EMAIL_VALUE"] = emails[0]["VALUE"] if emails else ""
                r["EMAIL_TYPE"] = emails[0].get("VALUE_TYPE", "") if emails else ""

    return r
