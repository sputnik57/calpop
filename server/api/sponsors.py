from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.deps import get_db
from auth.dependencies import require_admin
from auth.models import UserContext
from db.models import Prisoner, Sponsor
from schemas.sponsor import SponsorCreate, SponsorOut

router = APIRouter(tags=["sponsors"])


def _sponsee_counts(db: Session) -> dict:
    """
    {sponsor_name: {"active": n, "dormant": n}} -- split by Stage, not a
    single raw count, per Rey (29Sep2026): a flat count looked "too high"
    because it silently included Stage 90+ (terminal/exception codes --
    dropped, went silent, etc; see RECOGNIZED_STAGES in excel_manager.py),
    mixed in with genuinely active sponsees (main sequence, Stage 1-12).
    Anything else (blank Stage, or a value outside both ranges) falls into
    neither bucket, same as it fell outside RECOGNIZED_STAGES before this.
    """
    rows = (
        db.query(
            Prisoner.sponsor_name,
            func.count(Prisoner.cpid).filter(Prisoner.stage.between(1, 12)),
            func.count(Prisoner.cpid).filter(Prisoner.stage >= 90),
        )
        .filter(Prisoner.sponsor_name.isnot(None))
        .group_by(Prisoner.sponsor_name)
        .all()
    )
    return {name: {"active": active, "dormant": dormant} for name, active, dormant in rows}


def _count_for(sponsor: Sponsor, counts: dict) -> dict:
    """
    A sponsor_type='course' row represents Rey's own bulk sponsees, whose
    Prisoner.sponsor_name is always the literal sentinel "Course" or "Rey G"
    (see that column's model comment, and the 29Sep2026 rename note) -- NOT
    necessarily this Sponsor's own display name. Kept as a fallback for any
    future sponsor_type='course' row that doesn't share its exact name.
    """
    if sponsor.sponsor_type == "course":
        return counts.get("Course", {"active": 0, "dormant": 0})
    return counts.get(sponsor.name, {"active": 0, "dormant": 0})


@router.get("", response_model=List[SponsorOut])
def list_sponsors(
    db: Session = Depends(get_db),
    _admin: UserContext = Depends(require_admin),
):
    counts = _sponsee_counts(db)
    sponsors = db.query(Sponsor).order_by(Sponsor.name).all()
    out = []
    for s in sponsors:
        item = SponsorOut.model_validate(s)
        counted = _count_for(s, counts)
        item.sponsee_count_active = counted["active"]
        item.sponsee_count_dormant = counted["dormant"]
        out.append(item)
    return out


@router.post("", response_model=SponsorOut, status_code=status.HTTP_201_CREATED)
def create_sponsor(
    payload: SponsorCreate,
    db: Session = Depends(get_db),
    _admin: UserContext = Depends(require_admin),
):
    existing = db.query(Sponsor).filter(Sponsor.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A sponsor with this name already exists")

    sponsor = Sponsor(**payload.model_dump())
    db.add(sponsor)
    db.commit()
    db.refresh(sponsor)

    counts = _sponsee_counts(db)
    item = SponsorOut.model_validate(sponsor)
    counted = _count_for(sponsor, counts)
    item.sponsee_count_active = counted["active"]
    item.sponsee_count_dormant = counted["dormant"]
    return item


@router.put("/{sponsor_id}", response_model=SponsorOut)
def update_sponsor(
    sponsor_id: int,
    payload: SponsorCreate,
    db: Session = Depends(get_db),
    _admin: UserContext = Depends(require_admin),
):
    sponsor = db.query(Sponsor).filter(Sponsor.id == sponsor_id).first()
    if not sponsor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sponsor not found")

    for field, value in payload.model_dump().items():
        setattr(sponsor, field, value)
    db.commit()
    db.refresh(sponsor)

    counts = _sponsee_counts(db)
    item = SponsorOut.model_validate(sponsor)
    counted = _count_for(sponsor, counts)
    item.sponsee_count_active = counted["active"]
    item.sponsee_count_dormant = counted["dormant"]
    return item


@router.delete("/{sponsor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sponsor(
    sponsor_id: int,
    db: Session = Depends(get_db),
    _admin: UserContext = Depends(require_admin),
):
    sponsor = db.query(Sponsor).filter(Sponsor.id == sponsor_id).first()
    if not sponsor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sponsor not found")
    db.delete(sponsor)
    db.commit()
