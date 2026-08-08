import logging
import re
from typing import Dict, List, Optional

import pandas as pd
from rapidfuzz import fuzz
from sqlalchemy.orm import Session

from db.models import Prisoner

logger = logging.getLogger(__name__)

# OCR text is noisy, so ID-shaped tokens (CDCR numbers, CPIDs) are pulled out and
# scored separately from the free-text name/address block -- inmate numbers are
# usually the cleanest handwriting on an envelope and the strongest match signal.
_ID_PATTERNS = [
    r'\b[A-Z]{1,2}-?[0-9]{4,6}\b',  # e.g. X-99999, AB1234
    r'\b[A-Z]{3,4}-?[0-9]{3,4}\b',  # e.g. ABC123
]


class MatchingService:
    """
    Fuzzy-matches OCR'd envelope/letter text against known prisoner records.

    This NEVER auto-assigns a match. It only ranks candidates for a human to
    confirm against the source scan -- real testing against local OCR output
    showed high self-reported confidence on transcriptions that were still
    wrong (e.g. a mangled return address), so a silent auto-pick here would
    risk misdirected mail. Selection is always a human decision.
    """

    @staticmethod
    def _extract_id_tokens(text_upper: str) -> List[str]:
        tokens = set()
        for pattern in _ID_PATTERNS:
            tokens.update(m.upper() for m in re.findall(pattern, text_upper))
        return list(tokens)

    @classmethod
    def find_candidates(
        cls,
        query_text: str,
        db: Session,
        excel_manager=None,
        limit: int = 5,
        min_score: float = 40.0,
    ) -> List[Dict]:
        """
        Rank known prisoners by fuzzy similarity to `query_text` (raw OCR output).

        Prefers the Excel vault when it's loaded, since that's the only place
        CDCR numbers currently live. Falls back to the Postgres Prisoner table
        (name/facility/address only, no CDCR#) when no Excel file has been
        uploaded yet in this session.
        """
        query_upper = (query_text or "").upper()
        id_tokens = cls._extract_id_tokens(query_upper)

        if excel_manager is not None and excel_manager.is_loaded():
            scored = cls._score_excel_rows(query_upper, id_tokens, excel_manager.df)
        else:
            scored = cls._score_postgres_rows(query_upper, id_tokens, db)

        scored = [c for c in scored if c["score"] >= min_score]
        scored.sort(key=lambda c: c["score"], reverse=True)
        return scored[:limit]

    @staticmethod
    def _score_excel_rows(query_upper: str, id_tokens: List[str], df: pd.DataFrame) -> List[Dict]:
        cpid_col = "CPID" if "CPID" in df.columns else ("code" if "code" in df.columns else None)
        results: List[Dict] = []

        for _, row in df.iterrows():
            fname = str(row.get("fName", "") or "")
            lname = str(row.get("lName", "") or "")
            cdcr = str(row.get("CDCRno", "") or "")
            cpid = str(row.get(cpid_col, "") or "") if cpid_col else ""
            address_blob = " ".join(str(row.get(c, "") or "") for c in ("address", "city", "state", "zip"))
            record_blob = f"{fname} {lname} {row.get('housing', '') or ''} {address_blob}".upper()

            text_score = fuzz.token_set_ratio(query_upper, record_blob) if record_blob.strip() else 0
            id_score = 0
            if id_tokens and cdcr:
                id_score = max(fuzz.ratio(tok, cdcr.upper()) for tok in id_tokens)
            if id_tokens and cpid:
                id_score = max(id_score, max(fuzz.ratio(tok, cpid.upper()) for tok in id_tokens))

            score = max(text_score, id_score)
            if score <= 0:
                continue

            results.append({
                "cpid": cpid or None,
                "cdcr_number": cdcr or None,
                "first_name": fname or None,
                "last_name": lname or None,
                "facility": str(row.get("housing", "") or "") or None,
                "address": str(row.get("address", "") or "") or None,
                "city": str(row.get("city", "") or "") or None,
                "state": str(row.get("state", "") or "") or None,
                "zip": str(row.get("zip", "") or "") or None,
                "score": round(score, 1),
            })

        return results

    @staticmethod
    def _score_postgres_rows(query_upper: str, id_tokens: List[str], db: Session) -> List[Dict]:
        results: List[Dict] = []

        for p in db.query(Prisoner).all():
            name = f"{p.first_name or ''} {p.last_name or ''}"
            address_blob = " ".join(filter(None, [p.address, p.city, p.state, p.zip]))
            record_blob = f"{name} {p.facility or ''} {address_blob}".upper()

            text_score = fuzz.token_set_ratio(query_upper, record_blob) if record_blob.strip() else 0
            id_score = 0
            if id_tokens and p.cpid:
                id_score = max(fuzz.ratio(tok, p.cpid.upper()) for tok in id_tokens)

            score = max(text_score, id_score)
            if score <= 0:
                continue

            results.append({
                "cpid": p.cpid,
                "cdcr_number": None,  # not tracked in Postgres today -- Excel vault only
                "first_name": p.first_name,
                "last_name": p.last_name,
                "facility": p.facility,
                "address": p.address,
                "city": p.city,
                "state": p.state,
                "zip": p.zip,
                "score": round(score, 1),
            })

        return results
